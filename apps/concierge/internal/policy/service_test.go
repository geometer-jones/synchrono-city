package policy

import (
	"context"
	"errors"
	"testing"

	"github.com/peterwei/synchrono-city/apps/concierge/internal/store"
)

func TestServiceEvaluate(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	operator := "operator"

	tests := []struct {
		name    string
		store   store.Store
		subject string
		cap     string
		roomID  string
		want    Decision
	}{
		{
			name:    "bootstrap operator bypasses store checks",
			store:   store.NewMemory(),
			subject: operator,
			cap:     "relay.publish",
			want:    Decision{Decision: "allow", Reason: "bootstrap_operator", Standing: "owner", Scope: "relay.publish"},
		},
		{
			name: "block policy denies publish",
			store: seededMemory(func(s *store.MemoryStore) {
				_, _ = s.CreatePolicyAssignment(ctx, store.PolicyAssignment{
					SubjectPubkey:   "blocked",
					PolicyType:      "block",
					Scope:           store.DefaultScopeValue,
					GrantedByPubkey: operator,
				})
			}),
			subject: "blocked",
			cap:     "relay.publish",
			want:    Decision{Decision: "deny", Reason: "block_policy", Standing: "guest", Scope: "relay.publish"},
		},
		{
			name: "banned standing denies publish",
			store: seededMemory(func(s *store.MemoryStore) {
				_, _ = s.CreateStandingRecord(ctx, store.StandingRecord{
					SubjectPubkey:   "banned",
					Standing:        "banned",
					Scope:           store.DefaultScopeValue,
					GrantedByPubkey: operator,
				})
			}),
			subject: "banned",
			cap:     "relay.publish",
			want:    Decision{Decision: "deny", Reason: "standing_blocks_capability", Standing: "banned", Scope: "relay.publish"},
		},
		{
			name: "suspended standing denies media join",
			store: seededMemory(func(s *store.MemoryStore) {
				_, _ = s.CreateStandingRecord(ctx, store.StandingRecord{
					SubjectPubkey:   "suspended",
					Standing:        "suspended",
					Scope:           store.DefaultScopeValue,
					GrantedByPubkey: operator,
				})
			}),
			subject: "suspended",
			cap:     "media.join",
			roomID:  "room-1",
			want:    Decision{Decision: "deny", Reason: "standing_blocks_capability", Standing: "suspended", Scope: "media.join"},
		},
		{
			name: "moderator standing allows relay admin",
			store: seededMemory(func(s *store.MemoryStore) {
				_, _ = s.CreateStandingRecord(ctx, store.StandingRecord{
					SubjectPubkey:   "mod",
					Standing:        "moderator",
					Scope:           "relay.admin",
					GrantedByPubkey: operator,
				})
			}),
			subject: "mod",
			cap:     "relay.admin",
			want:    Decision{Decision: "allow", Reason: "local_standing", Standing: "moderator", Scope: "relay.admin"},
		},
		{
			name: "room permission allows media join",
			store: seededMemory(func(s *store.MemoryStore) {
				_, _ = s.CreateRoomPermission(ctx, store.RoomPermission{
					SubjectPubkey:   "guest",
					RoomID:          "room-2",
					CanJoin:         true,
					CanPublish:      false,
					CanSubscribe:    true,
					GrantedByPubkey: operator,
				})
			}),
			subject: "guest",
			cap:     "media.join",
			roomID:  "room-2",
			want:    Decision{Decision: "allow", Reason: "room_permission", Standing: "guest", Scope: "media.join"},
		},
		{
			name:    "room permission missing denies media publish",
			store:   store.NewMemory(),
			subject: "guest",
			cap:     "media.publish",
			roomID:  "room-3",
			want:    Decision{Decision: "deny", Reason: "room_permission_missing", Standing: "guest", Scope: "media.publish"},
		},
		{
			name:    "policy lookup failure denies by default",
			store:   failingStore{Store: store.NewMemory(), activePolicyErr: errors.New("db unavailable")},
			subject: "guest",
			cap:     "relay.publish",
			want:    Decision{Decision: "deny", Reason: "policy_lookup_failed", Standing: "guest", Scope: "relay.publish"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			service := NewService(tt.store, operator)
			got := service.Evaluate(ctx, tt.subject, tt.cap, tt.roomID)
			if got != tt.want {
				t.Fatalf("expected %+v, got %+v", tt.want, got)
			}
		})
	}
}

func seededMemory(seed func(*store.MemoryStore)) *store.MemoryStore {
	mem := store.NewMemory()
	seed(mem)
	return mem
}

type failingStore struct {
	store.Store
	activePolicyErr error
}

func (s failingStore) ActivePolicyAssignments(context.Context, string, string) ([]store.PolicyAssignment, error) {
	return nil, s.activePolicyErr
}
