package store

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"runtime"
	"slices"
	"testing"

	_ "github.com/jackc/pgx/v5/stdlib"
)

func TestPostgresStoreIntegration(t *testing.T) {
	databaseURL := os.Getenv("POSTGRES_TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("POSTGRES_TEST_DATABASE_URL is not set")
	}

	ctx := context.Background()
	resetTestDatabase(t, databaseURL)

	store, err := NewPostgres(ctx, databaseURL, PostgresOptions{
		MaxOpenConns:    5,
		MaxIdleConns:    2,
		ConnMaxLifetime: 0,
	})
	if err != nil {
		t.Fatalf("open postgres store: %v", err)
	}
	defer func() {
		if err := store.Close(); err != nil {
			t.Fatalf("close store: %v", err)
		}
	}()

	_, err = store.CreateStandingRecord(ctx, StandingRecord{
		SubjectPubkey:   "npub1member",
		Standing:        "member",
		Scope:           "",
		GrantedByPubkey: "npub1operator",
	})
	if err != nil {
		t.Fatalf("create standing: %v", err)
	}

	_, err = store.CreatePolicyAssignment(ctx, PolicyAssignment{
		SubjectPubkey:   "npub1member",
		PolicyType:      "block",
		Scope:           "",
		GrantedByPubkey: "npub1operator",
		Metadata:        map[string]string{"source": "integration"},
	})
	if err != nil {
		t.Fatalf("create policy assignment: %v", err)
	}

	_, err = store.CreateRoomPermission(ctx, RoomPermission{
		SubjectPubkey:   "npub1member",
		RoomID:          "geo:npub1operator:9q8yyk",
		CanJoin:         true,
		CanPublish:      false,
		CanSubscribe:    true,
		GrantedByPubkey: "npub1operator",
	})
	if err != nil {
		t.Fatalf("create room permission: %v", err)
	}

	_, err = store.CreateAuditEntry(ctx, AuditEntry{
		ActorPubkey:  "npub1operator",
		Action:       "standing.record.created",
		TargetPubkey: "npub1member",
		Scope:        "",
		Metadata:     map[string]string{"standing": "member"},
	})
	if err != nil {
		t.Fatalf("create audit entry: %v", err)
	}

	standing, err := store.LatestStanding(ctx, "npub1member", "")
	if err != nil {
		t.Fatalf("latest standing: %v", err)
	}
	if standing.Scope != DefaultScopeValue || standing.Standing != "member" {
		t.Fatalf("unexpected standing: %+v", standing)
	}

	assignments, err := store.ActivePolicyAssignments(ctx, "npub1member", "")
	if err != nil {
		t.Fatalf("active policy assignments: %v", err)
	}
	if len(assignments) != 1 || assignments[0].PolicyType != "block" {
		t.Fatalf("unexpected assignments: %+v", assignments)
	}

	permission, err := store.LatestRoomPermission(ctx, "npub1member", "geo:npub1operator:9q8yyk")
	if err != nil {
		t.Fatalf("latest room permission: %v", err)
	}
	if !permission.CanJoin || permission.CanPublish || !permission.CanSubscribe {
		t.Fatalf("unexpected room permission: %+v", permission)
	}

	listedPolicies, err := store.ListPolicyAssignments(ctx, PolicyAssignmentQuery{PolicyType: "block", Limit: 10})
	if err != nil {
		t.Fatalf("list policy assignments: %v", err)
	}
	if len(listedPolicies) != 1 || listedPolicies[0].PolicyType != "block" {
		t.Fatalf("unexpected listed policies: %+v", listedPolicies)
	}

	listedStanding, err := store.ListStandingRecords(ctx, StandingRecordQuery{SubjectPubkey: "npub1member", Limit: 10})
	if err != nil {
		t.Fatalf("list standing records: %v", err)
	}
	if len(listedStanding) != 1 || listedStanding[0].Standing != "member" {
		t.Fatalf("unexpected listed standing: %+v", listedStanding)
	}

	listedPermissions, err := store.ListRoomPermissions(ctx, RoomPermissionQuery{RoomID: "geo:npub1operator:9q8yyk", Limit: 10})
	if err != nil {
		t.Fatalf("list room permissions: %v", err)
	}
	if len(listedPermissions) != 1 || listedPermissions[0].RoomID != "geo:npub1operator:9q8yyk" {
		t.Fatalf("unexpected listed permissions: %+v", listedPermissions)
	}

	page, err := store.ListAuditEntries(ctx, AuditEntryQuery{Limit: 10})
	if err != nil {
		t.Fatalf("list audit entries: %v", err)
	}
	if len(page.Entries) != 1 || page.Entries[0].Scope != DefaultScopeValue {
		t.Fatalf("unexpected audit entries: %+v", page.Entries)
	}
}

func resetTestDatabase(t *testing.T, databaseURL string) {
	t.Helper()

	db, err := sql.Open("pgx", databaseURL)
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer func() {
		if err := db.Close(); err != nil {
			t.Fatalf("close database: %v", err)
		}
	}()

	if _, err := db.Exec(`DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;`); err != nil {
		t.Fatalf("reset schema: %v", err)
	}

	for _, path := range migrationPaths(t) {
		contents, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read migration %s: %v", path, err)
		}
		if _, err := db.Exec(string(contents)); err != nil {
			t.Fatalf("apply migration %s: %v", path, err)
		}
	}
}

func migrationPaths(t *testing.T) []string {
	t.Helper()

	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve caller path")
	}

	paths, err := filepath.Glob(filepath.Join(filepath.Dir(filename), "..", "..", "..", "..", "db", "migrations", "*.sql"))
	if err != nil {
		t.Fatalf("glob migrations: %v", err)
	}
	slices.Sort(paths)
	return paths
}
