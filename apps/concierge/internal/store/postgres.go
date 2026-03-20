package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
)

type PostgresStore struct {
	db *sql.DB
}

type PostgresOptions struct {
	MaxOpenConns    int
	MaxIdleConns    int
	ConnMaxLifetime time.Duration
}

func NewPostgres(ctx context.Context, databaseURL string, options PostgresOptions) (*PostgresStore, error) {
	db, err := sql.Open("pgx", databaseURL)
	if err != nil {
		return nil, err
	}

	if options.MaxOpenConns > 0 {
		db.SetMaxOpenConns(options.MaxOpenConns)
	}
	if options.MaxIdleConns > 0 {
		db.SetMaxIdleConns(options.MaxIdleConns)
	}
	if options.ConnMaxLifetime > 0 {
		db.SetConnMaxLifetime(options.ConnMaxLifetime)
	}

	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, err
	}

	return &PostgresStore{db: db}, nil
}

func (s *PostgresStore) CreatePolicyAssignment(ctx context.Context, record PolicyAssignment) (PolicyAssignment, error) {
	metadataBytes, err := json.Marshal(record.Metadata)
	if err != nil {
		return PolicyAssignment{}, err
	}

	row := s.db.QueryRowContext(
		ctx,
		`INSERT INTO policy_assignments (subject_pubkey, policy_type, scope, granted_by_pubkey, revoked, metadata)
		 VALUES ($1, $2, COALESCE(NULLIF($3, ''), 'relay'), $4, $5, $6)
		 RETURNING id, created_at`,
		record.SubjectPubkey,
		record.PolicyType,
		record.Scope,
		record.GrantedByPubkey,
		record.Revoked,
		metadataBytes,
	)

	record.Scope = DefaultScope(record.Scope)
	if err := row.Scan(&record.ID, &record.CreatedAt); err != nil {
		return PolicyAssignment{}, err
	}
	return record, nil
}

func (s *PostgresStore) CreateStandingRecord(ctx context.Context, record StandingRecord) (StandingRecord, error) {
	row := s.db.QueryRowContext(
		ctx,
		`INSERT INTO standing_records (subject_pubkey, standing, scope, granted_by_pubkey, revoked)
		 VALUES ($1, $2, COALESCE(NULLIF($3, ''), 'relay'), $4, $5)
		 RETURNING id, created_at`,
		record.SubjectPubkey,
		record.Standing,
		record.Scope,
		record.GrantedByPubkey,
		record.Revoked,
	)

	record.Scope = DefaultScope(record.Scope)
	if err := row.Scan(&record.ID, &record.CreatedAt); err != nil {
		return StandingRecord{}, err
	}
	return record, nil
}

func (s *PostgresStore) CreateRoomPermission(ctx context.Context, permission RoomPermission) (RoomPermission, error) {
	row := s.db.QueryRowContext(
		ctx,
		`INSERT INTO room_permissions (
		     subject_pubkey, room_id, can_join, can_publish, can_subscribe, granted_by_pubkey, revoked
		 )
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 RETURNING id, created_at`,
		permission.SubjectPubkey,
		permission.RoomID,
		permission.CanJoin,
		permission.CanPublish,
		permission.CanSubscribe,
		permission.GrantedByPubkey,
		permission.Revoked,
	)

	if err := row.Scan(&permission.ID, &permission.CreatedAt); err != nil {
		return RoomPermission{}, err
	}
	return permission, nil
}

func (s *PostgresStore) ListPolicyAssignments(ctx context.Context, query PolicyAssignmentQuery) ([]PolicyAssignment, error) {
	args := []any{}
	clauses := []string{}

	if query.SubjectPubkey != "" {
		args = append(args, query.SubjectPubkey)
		clauses = append(clauses, fmt.Sprintf("subject_pubkey = $%d", len(args)))
	}
	if query.PolicyType != "" {
		args = append(args, query.PolicyType)
		clauses = append(clauses, fmt.Sprintf("policy_type = $%d", len(args)))
	}
	if query.Scope != "" {
		args = append(args, DefaultScope(query.Scope))
		clauses = append(clauses, fmt.Sprintf("scope = $%d", len(args)))
	}
	if !query.IncludeRevoked {
		clauses = append(clauses, "revoked = FALSE")
	}

	statement := strings.Builder{}
	statement.WriteString(`SELECT id, subject_pubkey, policy_type, scope, granted_by_pubkey, revoked, metadata, created_at
		 FROM policy_assignments`)
	if len(clauses) > 0 {
		statement.WriteString(" WHERE ")
		statement.WriteString(strings.Join(clauses, " AND "))
	}
	args = append(args, clampLimit(query.Limit))
	statement.WriteString(fmt.Sprintf(" ORDER BY created_at DESC, id DESC LIMIT $%d", len(args)))

	rows, err := s.db.QueryContext(ctx, statement.String(), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	records := []PolicyAssignment{}
	for rows.Next() {
		var record PolicyAssignment
		var metadataBytes []byte
		if err := rows.Scan(
			&record.ID,
			&record.SubjectPubkey,
			&record.PolicyType,
			&record.Scope,
			&record.GrantedByPubkey,
			&record.Revoked,
			&metadataBytes,
			&record.CreatedAt,
		); err != nil {
			return nil, err
		}
		record.Metadata = decodeMetadata(metadataBytes)
		records = append(records, record)
	}
	return records, rows.Err()
}

func (s *PostgresStore) ListStandingRecords(ctx context.Context, query StandingRecordQuery) ([]StandingRecord, error) {
	args := []any{}
	clauses := []string{}

	if query.SubjectPubkey != "" {
		args = append(args, query.SubjectPubkey)
		clauses = append(clauses, fmt.Sprintf("subject_pubkey = $%d", len(args)))
	}
	if query.Scope != "" {
		args = append(args, DefaultScope(query.Scope))
		clauses = append(clauses, fmt.Sprintf("scope = $%d", len(args)))
	}
	if !query.IncludeRevoked {
		clauses = append(clauses, "revoked = FALSE")
	}

	statement := strings.Builder{}
	statement.WriteString(`SELECT id, subject_pubkey, standing, scope, granted_by_pubkey, revoked, created_at
		 FROM standing_records`)
	if len(clauses) > 0 {
		statement.WriteString(" WHERE ")
		statement.WriteString(strings.Join(clauses, " AND "))
	}
	args = append(args, clampLimit(query.Limit))
	statement.WriteString(fmt.Sprintf(" ORDER BY created_at DESC, id DESC LIMIT $%d", len(args)))

	rows, err := s.db.QueryContext(ctx, statement.String(), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	records := []StandingRecord{}
	for rows.Next() {
		var record StandingRecord
		if err := rows.Scan(
			&record.ID,
			&record.SubjectPubkey,
			&record.Standing,
			&record.Scope,
			&record.GrantedByPubkey,
			&record.Revoked,
			&record.CreatedAt,
		); err != nil {
			return nil, err
		}
		records = append(records, record)
	}
	return records, rows.Err()
}

func (s *PostgresStore) ListRoomPermissions(ctx context.Context, query RoomPermissionQuery) ([]RoomPermission, error) {
	args := []any{}
	clauses := []string{}

	if query.SubjectPubkey != "" {
		args = append(args, query.SubjectPubkey)
		clauses = append(clauses, fmt.Sprintf("subject_pubkey = $%d", len(args)))
	}
	if query.RoomID != "" {
		args = append(args, query.RoomID)
		clauses = append(clauses, fmt.Sprintf("room_id = $%d", len(args)))
	}
	if !query.IncludeRevoked {
		clauses = append(clauses, "revoked = FALSE")
	}

	statement := strings.Builder{}
	statement.WriteString(`SELECT id, subject_pubkey, room_id, can_join, can_publish, can_subscribe, granted_by_pubkey, revoked, created_at
		 FROM room_permissions`)
	if len(clauses) > 0 {
		statement.WriteString(" WHERE ")
		statement.WriteString(strings.Join(clauses, " AND "))
	}
	args = append(args, clampLimit(query.Limit))
	statement.WriteString(fmt.Sprintf(" ORDER BY created_at DESC, id DESC LIMIT $%d", len(args)))

	rows, err := s.db.QueryContext(ctx, statement.String(), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	records := []RoomPermission{}
	for rows.Next() {
		var record RoomPermission
		if err := rows.Scan(
			&record.ID,
			&record.SubjectPubkey,
			&record.RoomID,
			&record.CanJoin,
			&record.CanPublish,
			&record.CanSubscribe,
			&record.GrantedByPubkey,
			&record.Revoked,
			&record.CreatedAt,
		); err != nil {
			return nil, err
		}
		records = append(records, record)
	}
	return records, rows.Err()
}

func (s *PostgresStore) ListAuditEntries(ctx context.Context, query AuditEntryQuery) (AuditEntryPage, error) {
	cursorTime, cursorID, err := decodeAuditCursor(query.Cursor)
	if err != nil {
		return AuditEntryPage{}, err
	}

	limit := clampLimit(query.Limit)
	args := []any{}
	clauses := []string{}
	if !cursorTime.IsZero() {
		args = append(args, cursorTime, cursorID)
		clauses = append(clauses, fmt.Sprintf("(created_at, id) < ($%d, $%d)", len(args)-1, len(args)))
	}

	statement := strings.Builder{}
	statement.WriteString(`SELECT id, actor_pubkey, action, COALESCE(target_pubkey, ''), scope, metadata, created_at
		 FROM audit_log
	`)
	if len(clauses) > 0 {
		statement.WriteString(" WHERE ")
		statement.WriteString(strings.Join(clauses, " AND "))
	}
	args = append(args, limit+1)
	statement.WriteString(fmt.Sprintf(" ORDER BY created_at DESC, id DESC LIMIT $%d", len(args)))

	rows, err := s.db.QueryContext(ctx, statement.String(), args...)
	if err != nil {
		return AuditEntryPage{}, err
	}
	defer rows.Close()

	entries := []AuditEntry{}
	for rows.Next() {
		var entry AuditEntry
		var metadataBytes []byte
		if err := rows.Scan(
			&entry.ID,
			&entry.ActorPubkey,
			&entry.Action,
			&entry.TargetPubkey,
			&entry.Scope,
			&metadataBytes,
			&entry.CreatedAt,
		); err != nil {
			return AuditEntryPage{}, err
		}
		entry.Metadata = decodeMetadata(metadataBytes)
		entries = append(entries, entry)
	}
	if err := rows.Err(); err != nil {
		return AuditEntryPage{}, err
	}

	page := AuditEntryPage{}
	if len(entries) > limit {
		page.Entries = entries[:limit]
		page.NextCursor = encodeAuditCursor(entries[limit-1])
		return page, nil
	}

	page.Entries = entries
	return page, nil
}

func (s *PostgresStore) CreateAuditEntry(ctx context.Context, entry AuditEntry) (AuditEntry, error) {
	metadataBytes, err := json.Marshal(entry.Metadata)
	if err != nil {
		return AuditEntry{}, err
	}

	row := s.db.QueryRowContext(
		ctx,
		`INSERT INTO audit_log (actor_pubkey, action, target_pubkey, scope, metadata)
		 VALUES ($1, $2, NULLIF($3, ''), COALESCE(NULLIF($4, ''), 'relay'), $5)
		 RETURNING id, created_at`,
		entry.ActorPubkey,
		entry.Action,
		entry.TargetPubkey,
		entry.Scope,
		metadataBytes,
	)

	entry.Scope = DefaultScope(entry.Scope)
	if err := row.Scan(&entry.ID, &entry.CreatedAt); err != nil {
		return AuditEntry{}, err
	}
	return entry, nil
}

func (s *PostgresStore) LatestStanding(ctx context.Context, subjectPubkey, scope string) (StandingRecord, error) {
	record, err := latestStandingQuery(
		ctx,
		s.db,
		`SELECT id, subject_pubkey, standing, scope, granted_by_pubkey, revoked, created_at
		 FROM standing_records
		 WHERE subject_pubkey = $1 AND revoked = FALSE AND (scope = $2 OR scope = 'relay')
		 ORDER BY CASE WHEN scope = $2 THEN 0 ELSE 1 END, created_at DESC
		 LIMIT 1`,
		subjectPubkey,
		DefaultScope(scope),
	)
	if err != nil {
		return StandingRecord{}, err
	}
	return record, nil
}

func (s *PostgresStore) LatestRoomPermission(ctx context.Context, subjectPubkey, roomID string) (RoomPermission, error) {
	row := s.db.QueryRowContext(
		ctx,
		`SELECT id, subject_pubkey, room_id, can_join, can_publish, can_subscribe, granted_by_pubkey, revoked, created_at
		 FROM room_permissions
		 WHERE subject_pubkey = $1 AND room_id = $2 AND revoked = FALSE
		 ORDER BY created_at DESC
		 LIMIT 1`,
		subjectPubkey,
		roomID,
	)

	var permission RoomPermission
	if err := row.Scan(
		&permission.ID,
		&permission.SubjectPubkey,
		&permission.RoomID,
		&permission.CanJoin,
		&permission.CanPublish,
		&permission.CanSubscribe,
		&permission.GrantedByPubkey,
		&permission.Revoked,
		&permission.CreatedAt,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return RoomPermission{}, ErrNotFound
		}
		return RoomPermission{}, err
	}
	return permission, nil
}

func (s *PostgresStore) ActivePolicyAssignments(ctx context.Context, subjectPubkey, scope string) ([]PolicyAssignment, error) {
	rows, err := s.db.QueryContext(
		ctx,
		`SELECT id, subject_pubkey, policy_type, scope, granted_by_pubkey, revoked, metadata, created_at
		 FROM policy_assignments
		 WHERE subject_pubkey = $1 AND revoked = FALSE AND (scope = $2 OR scope = 'relay')
		 ORDER BY created_at DESC`,
		subjectPubkey,
		DefaultScope(scope),
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	records := []PolicyAssignment{}
	for rows.Next() {
		var record PolicyAssignment
		var metadataBytes []byte
		if err := rows.Scan(
			&record.ID,
			&record.SubjectPubkey,
			&record.PolicyType,
			&record.Scope,
			&record.GrantedByPubkey,
			&record.Revoked,
			&metadataBytes,
			&record.CreatedAt,
		); err != nil {
			return nil, err
		}
		record.Metadata = decodeMetadata(metadataBytes)
		records = append(records, record)
	}
	return records, rows.Err()
}

func (s *PostgresStore) Close() error {
	return s.db.Close()
}

func latestStandingQuery(ctx context.Context, db *sql.DB, query, subjectPubkey, scope string) (StandingRecord, error) {
	row := db.QueryRowContext(ctx, query, subjectPubkey, scope)

	var record StandingRecord
	if err := row.Scan(
		&record.ID,
		&record.SubjectPubkey,
		&record.Standing,
		&record.Scope,
		&record.GrantedByPubkey,
		&record.Revoked,
		&record.CreatedAt,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return StandingRecord{}, ErrNotFound
		}
		return StandingRecord{}, err
	}

	return record, nil
}

func decodeMetadata(raw []byte) map[string]string {
	if len(raw) == 0 {
		return nil
	}
	var metadata map[string]string
	if err := json.Unmarshal(raw, &metadata); err != nil {
		return nil
	}
	return metadata
}
