package store

import (
	"context"
	"slices"
	"sync"
	"time"
)

type MemoryStore struct {
	mu              sync.RWMutex
	nextID          int64
	policies        []PolicyAssignment
	standingRecords []StandingRecord
	roomPermissions []RoomPermission
	auditEntries    []AuditEntry
}

func NewMemory() *MemoryStore {
	return &MemoryStore{}
}

func (s *MemoryStore) CreatePolicyAssignment(_ context.Context, record PolicyAssignment) (PolicyAssignment, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.nextID++
	record.ID = s.nextID
	record.CreatedAt = nowOr(record.CreatedAt)
	record.Scope = DefaultScope(record.Scope)
	s.policies = append(s.policies, record)
	return record, nil
}

func (s *MemoryStore) CreateStandingRecord(_ context.Context, record StandingRecord) (StandingRecord, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.nextID++
	record.ID = s.nextID
	record.CreatedAt = nowOr(record.CreatedAt)
	record.Scope = DefaultScope(record.Scope)
	s.standingRecords = append(s.standingRecords, record)
	return record, nil
}

func (s *MemoryStore) CreateRoomPermission(_ context.Context, permission RoomPermission) (RoomPermission, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.nextID++
	permission.ID = s.nextID
	permission.CreatedAt = nowOr(permission.CreatedAt)
	s.roomPermissions = append(s.roomPermissions, permission)
	return permission, nil
}

func (s *MemoryStore) ListPolicyAssignments(_ context.Context, query PolicyAssignmentQuery) ([]PolicyAssignment, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	records := []PolicyAssignment{}
	for index := len(s.policies) - 1; index >= 0; index-- {
		record := s.policies[index]
		if query.SubjectPubkey != "" && record.SubjectPubkey != query.SubjectPubkey {
			continue
		}
		if query.PolicyType != "" && record.PolicyType != query.PolicyType {
			continue
		}
		if query.Scope != "" && record.Scope != DefaultScope(query.Scope) {
			continue
		}
		if !query.IncludeRevoked && record.Revoked {
			continue
		}
		records = append(records, record)
		if len(records) >= clampLimit(query.Limit) {
			break
		}
	}
	return records, nil
}

func (s *MemoryStore) ListStandingRecords(_ context.Context, query StandingRecordQuery) ([]StandingRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	records := []StandingRecord{}
	for index := len(s.standingRecords) - 1; index >= 0; index-- {
		record := s.standingRecords[index]
		if query.SubjectPubkey != "" && record.SubjectPubkey != query.SubjectPubkey {
			continue
		}
		if query.Scope != "" && record.Scope != DefaultScope(query.Scope) {
			continue
		}
		if !query.IncludeRevoked && record.Revoked {
			continue
		}
		records = append(records, record)
		if len(records) >= clampLimit(query.Limit) {
			break
		}
	}
	return records, nil
}

func (s *MemoryStore) ListRoomPermissions(_ context.Context, query RoomPermissionQuery) ([]RoomPermission, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	records := []RoomPermission{}
	for index := len(s.roomPermissions) - 1; index >= 0; index-- {
		record := s.roomPermissions[index]
		if query.SubjectPubkey != "" && record.SubjectPubkey != query.SubjectPubkey {
			continue
		}
		if query.RoomID != "" && record.RoomID != query.RoomID {
			continue
		}
		if !query.IncludeRevoked && record.Revoked {
			continue
		}
		records = append(records, record)
		if len(records) >= clampLimit(query.Limit) {
			break
		}
	}
	return records, nil
}

func (s *MemoryStore) ListAuditEntries(_ context.Context, query AuditEntryQuery) (AuditEntryPage, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	cursorTime, cursorID, err := decodeAuditCursor(query.Cursor)
	if err != nil {
		return AuditEntryPage{}, err
	}

	entries := slices.Clone(s.auditEntries)
	slices.Reverse(entries)

	filtered := make([]AuditEntry, 0, len(entries))
	for _, entry := range entries {
		if !cursorTime.IsZero() {
			if entry.CreatedAt.After(cursorTime) {
				continue
			}
			if entry.CreatedAt.Equal(cursorTime) && entry.ID >= cursorID {
				continue
			}
		}
		filtered = append(filtered, entry)
	}

	limit := clampLimit(query.Limit)
	page := AuditEntryPage{}
	if len(filtered) > limit {
		page.Entries = filtered[:limit]
		page.NextCursor = encodeAuditCursor(filtered[limit-1])
		return page, nil
	}

	page.Entries = filtered
	return page, nil
}

func (s *MemoryStore) CreateAuditEntry(_ context.Context, entry AuditEntry) (AuditEntry, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.nextID++
	entry.ID = s.nextID
	entry.CreatedAt = nowOr(entry.CreatedAt)
	entry.Scope = DefaultScope(entry.Scope)
	s.auditEntries = append(s.auditEntries, entry)
	return entry, nil
}

func (s *MemoryStore) LatestStanding(_ context.Context, subjectPubkey, scope string) (StandingRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return latestStandingRecord(s.standingRecords, subjectPubkey, DefaultScope(scope))
}

func (s *MemoryStore) LatestRoomPermission(_ context.Context, subjectPubkey, roomID string) (RoomPermission, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for index := len(s.roomPermissions) - 1; index >= 0; index-- {
		record := s.roomPermissions[index]
		if record.SubjectPubkey == subjectPubkey && record.RoomID == roomID && !record.Revoked {
			return record, nil
		}
	}

	return RoomPermission{}, ErrNotFound
}

func (s *MemoryStore) ActivePolicyAssignments(_ context.Context, subjectPubkey, scope string) ([]PolicyAssignment, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	scope = DefaultScope(scope)
	assignments := []PolicyAssignment{}
	for _, record := range s.policies {
		if record.SubjectPubkey != subjectPubkey || record.Revoked {
			continue
		}
		if record.Scope == DefaultScopeValue || record.Scope == scope {
			assignments = append(assignments, record)
		}
	}
	return assignments, nil
}

func (s *MemoryStore) Close() error {
	return nil
}

func latestStandingRecord(records []StandingRecord, subjectPubkey, scope string) (StandingRecord, error) {
	for index := len(records) - 1; index >= 0; index-- {
		record := records[index]
		if record.SubjectPubkey != subjectPubkey || record.Revoked {
			continue
		}
		if record.Scope == scope {
			return record, nil
		}
	}

	if scope != DefaultScopeValue {
		for index := len(records) - 1; index >= 0; index-- {
			record := records[index]
			if record.SubjectPubkey == subjectPubkey && record.Scope == DefaultScopeValue && !record.Revoked {
				return record, nil
			}
		}
	}

	return StandingRecord{}, ErrNotFound
}

func nowOr(value time.Time) time.Time {
	if value.IsZero() {
		return time.Now().UTC()
	}
	return value
}
