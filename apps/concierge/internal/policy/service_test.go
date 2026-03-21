package policy

import (
	"context"
	"errors"
	"reflect"
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
			want:    Decision{Decision: "allow", Reason: "bootstrap_operator", Standing: "owner", Scope: "relay.publish", ProofRequirementMet: true},
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
			want:    Decision{Decision: "deny", Reason: "block_policy", Standing: "guest", Scope: "relay.publish", ProofRequirementMet: true},
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
			want:    Decision{Decision: "deny", Reason: "standing_blocks_capability", Standing: "banned", Scope: "relay.publish", ProofRequirementMet: true},
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
			want:    Decision{Decision: "deny", Reason: "standing_blocks_capability", Standing: "suspended", Scope: "media.join", ProofRequirementMet: true},
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
			want:    Decision{Decision: "allow", Reason: "local_standing", Standing: "moderator", Scope: "relay.admin", ProofRequirementMet: true},
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
			want:    Decision{Decision: "allow", Reason: "room_permission", Standing: "guest", Scope: "media.join", ProofRequirementMet: true},
		},
		{
			name:    "room permission missing denies media publish",
			store:   store.NewMemory(),
			subject: "guest",
			cap:     "media.publish",
			roomID:  "room-3",
			want:    Decision{Decision: "deny", Reason: "room_permission_missing", Standing: "guest", Scope: "media.publish", ProofRequirementMet: true},
		},
		{
			name:    "policy lookup failure denies by default",
			store:   failingStore{Store: store.NewMemory(), activePolicyErr: errors.New("db unavailable")},
			subject: "guest",
			cap:     "relay.publish",
			want:    Decision{Decision: "deny", Reason: "policy_lookup_failed", Standing: "guest", Scope: "relay.publish", ProofRequirementMet: true},
		},
		{
			name: "guest gate denies publish when pubkey is not allowlisted",
			store: seededMemory(func(s *store.MemoryStore) {
				_, _ = s.CreateGatePolicy(ctx, store.GatePolicy{
					Capability:      "relay.publish",
					Scope:           store.DefaultScopeValue,
					RequireGuest:    true,
					GrantedByPubkey: operator,
				})
			}),
			subject: "visitor",
			cap:     "relay.publish",
			want: Decision{
				Decision:            "deny",
				Reason:              "not_allowlisted",
				Standing:            "guest",
				Scope:               "relay.publish",
				ProofRequirement:    "guest_list",
				ProofRequirementMet: false,
				Gates:               []GateStatus{{Type: "guest_list", Status: "missing"}},
			},
		},
		{
			name: "proof gate denies publish when oauth proof is missing",
			store: seededMemory(func(s *store.MemoryStore) {
				_, _ = s.CreateGatePolicy(ctx, store.GatePolicy{
					Capability:      "relay.publish",
					Scope:           store.DefaultScopeValue,
					ProofTypes:      []string{"oauth"},
					GrantedByPubkey: operator,
				})
			}),
			subject: "visitor",
			cap:     "relay.publish",
			want: Decision{
				Decision:            "deny",
				Reason:              "required_proof",
				Standing:            "guest",
				Scope:               "relay.publish",
				ProofRequirement:    "oauth",
				ProofRequirementMet: false,
				Gates:               []GateStatus{{Type: "oauth", Status: "missing"}},
			},
		},
		{
			name: "gate stack allows publish when guest and proof requirements are satisfied",
			store: seededMemory(func(s *store.MemoryStore) {
				_, _ = s.CreateGatePolicy(ctx, store.GatePolicy{
					Capability:      "relay.publish",
					Scope:           store.DefaultScopeValue,
					RequireGuest:    true,
					ProofTypes:      []string{"oauth", "social"},
					GrantedByPubkey: operator,
				})
				_, _ = s.CreatePolicyAssignment(ctx, store.PolicyAssignment{
					SubjectPubkey:   "member",
					PolicyType:      "guest",
					Scope:           store.DefaultScopeValue,
					GrantedByPubkey: operator,
				})
				_, _ = s.CreateProofVerification(ctx, store.ProofVerification{
					SubjectPubkey:   "member",
					ProofType:       "oauth",
					ProofValue:      "github:peter",
					GrantedByPubkey: operator,
				})
				_, _ = s.CreateProofVerification(ctx, store.ProofVerification{
					SubjectPubkey:   "member",
					ProofType:       "social",
					ProofValue:      "nostr:peter",
					GrantedByPubkey: operator,
				})
			}),
			subject: "member",
			cap:     "relay.publish",
			want: Decision{
				Decision:            "allow",
				Reason:              "gate_stack_satisfied",
				Standing:            "guest",
				Scope:               "relay.publish",
				ProofRequirementMet: true,
				Gates: []GateStatus{
					{Type: "guest_list", Status: "verified"},
					{Type: "oauth", Status: "verified"},
					{Type: "social", Status: "verified"},
				},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			service := NewService(tt.store, operator)
			got := service.Evaluate(ctx, tt.subject, tt.cap, tt.roomID)
			if !reflect.DeepEqual(got, tt.want) {
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
