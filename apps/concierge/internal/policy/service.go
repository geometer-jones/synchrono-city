package policy

import (
	"context"
	"errors"
	"log"
	"strings"

	"github.com/peterwei/synchrono-city/apps/concierge/internal/store"
)

type Service struct {
	store          store.Store
	operatorPubkey string
}

type Decision struct {
	Decision string `json:"decision"`
	Reason   string `json:"reason"`
	Standing string `json:"standing"`
	Scope    string `json:"scope"`
}

func NewService(policyStore store.Store, operatorPubkey string) *Service {
	return &Service{
		store:          policyStore,
		operatorPubkey: operatorPubkey,
	}
}

func (s *Service) CheckAdminAccess(ctx context.Context, subjectPubkey string) Decision {
	if subjectPubkey == s.operatorPubkey {
		return Decision{Decision: "allow", Reason: "bootstrap_operator", Standing: "owner", Scope: "relay.admin"}
	}

	standing := s.lookupStanding(ctx, subjectPubkey, "relay.admin")
	if standing == "owner" || standing == "moderator" {
		return Decision{Decision: "allow", Reason: "local_standing", Standing: standing, Scope: "relay.admin"}
	}

	return Decision{Decision: "deny", Reason: "insufficient_standing", Standing: standing, Scope: "relay.admin"}
}

func (s *Service) Evaluate(ctx context.Context, subjectPubkey, capability, roomID string) Decision {
	capability = strings.TrimSpace(capability)
	if capability == "" {
		return Decision{Decision: "deny", Reason: "missing_capability", Standing: "unknown", Scope: ""}
	}

	if subjectPubkey == s.operatorPubkey {
		return Decision{Decision: "allow", Reason: "bootstrap_operator", Standing: "owner", Scope: capability}
	}

	standing := s.lookupStanding(ctx, subjectPubkey, capabilityScope(capability))
	if deniedByStanding(standing, capability) {
		return Decision{Decision: "deny", Reason: "standing_blocks_capability", Standing: standing, Scope: capability}
	}

	assignments, err := s.store.ActivePolicyAssignments(ctx, subjectPubkey, capabilityScope(capability))
	if err != nil {
		log.Printf("policy lookup failed for pubkey=%s capability=%s: %v", subjectPubkey, capability, err)
		return Decision{Decision: "deny", Reason: "policy_lookup_failed", Standing: standing, Scope: capability}
	}
	for _, assignment := range assignments {
		if assignment.PolicyType == "block" {
			return Decision{Decision: "deny", Reason: "block_policy", Standing: standing, Scope: capability}
		}
	}

	if capability == "relay.admin" {
		return s.CheckAdminAccess(ctx, subjectPubkey)
	}

	if capability == "relay.publish" {
		return Decision{Decision: "allow", Reason: "open_publish", Standing: standing, Scope: capability}
	}

	if capability == "media.join" || capability == "media.publish" {
		permission, err := s.store.LatestRoomPermission(ctx, subjectPubkey, roomID)
		if err != nil {
			if errors.Is(err, store.ErrNotFound) {
				return Decision{Decision: "deny", Reason: "room_permission_missing", Standing: standing, Scope: capability}
			}
			return Decision{Decision: "deny", Reason: "room_permission_lookup_failed", Standing: standing, Scope: capability}
		}

		if capability == "media.join" && permission.CanJoin {
			return Decision{Decision: "allow", Reason: "room_permission", Standing: standing, Scope: capability}
		}
		if capability == "media.publish" && permission.CanPublish {
			return Decision{Decision: "allow", Reason: "room_permission", Standing: standing, Scope: capability}
		}

		return Decision{Decision: "deny", Reason: "room_permission_denied", Standing: standing, Scope: capability}
	}

	return Decision{Decision: "deny", Reason: "unknown_capability", Standing: standing, Scope: capability}
}

func (s *Service) lookupStanding(ctx context.Context, subjectPubkey, scope string) string {
	record, err := s.store.LatestStanding(ctx, subjectPubkey, scope)
	if err != nil {
		return "guest"
	}
	return record.Standing
}

func (s *Service) Standing(ctx context.Context, subjectPubkey, scope string) string {
	return s.lookupStanding(ctx, subjectPubkey, scope)
}

func capabilityScope(capability string) string {
	switch capability {
	case "relay.admin":
		return "relay.admin"
	case "media.join", "media.publish":
		return "media"
	default:
		return "relay"
	}
}

func deniedByStanding(standing, capability string) bool {
	switch standing {
	case "banned":
		return true
	case "suspended":
		return capability != "read"
	default:
		return false
	}
}
