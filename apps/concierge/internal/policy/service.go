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
	Decision            string       `json:"decision"`
	Reason              string       `json:"reason"`
	Standing            string       `json:"standing"`
	Scope               string       `json:"scope"`
	ProofRequirement    string       `json:"proof_requirement,omitempty"`
	ProofRequirementMet bool         `json:"proof_requirement_met"`
	Gates               []GateStatus `json:"gates,omitempty"`
}

type GateStatus struct {
	Type   string `json:"type"`
	Status string `json:"status"`
}

func NewService(policyStore store.Store, operatorPubkey string) *Service {
	return &Service{
		store:          policyStore,
		operatorPubkey: operatorPubkey,
	}
}

func (s *Service) CheckAdminAccess(ctx context.Context, subjectPubkey string) Decision {
	if subjectPubkey == s.operatorPubkey {
		return Decision{Decision: "allow", Reason: "bootstrap_operator", Standing: "owner", Scope: "relay.admin", ProofRequirementMet: true}
	}

	standing := s.lookupStanding(ctx, subjectPubkey, "relay.admin")
	if standing == "owner" || standing == "moderator" {
		return Decision{Decision: "allow", Reason: "local_standing", Standing: standing, Scope: "relay.admin", ProofRequirementMet: true}
	}

	return Decision{Decision: "deny", Reason: "insufficient_standing", Standing: standing, Scope: "relay.admin", ProofRequirementMet: true}
}

func (s *Service) Evaluate(ctx context.Context, subjectPubkey, capability, roomID string) Decision {
	capability = strings.TrimSpace(capability)
	if capability == "" {
		return Decision{Decision: "deny", Reason: "missing_capability", Standing: "unknown", Scope: ""}
	}

	if subjectPubkey == s.operatorPubkey {
		return Decision{
			Decision:            "allow",
			Reason:              "bootstrap_operator",
			Standing:            "owner",
			Scope:               capability,
			ProofRequirementMet: true,
		}
	}

	standing := s.lookupStanding(ctx, subjectPubkey, capabilityScope(capability))
	if deniedByStanding(standing, capability) {
		return Decision{
			Decision:            "deny",
			Reason:              "standing_blocks_capability",
			Standing:            standing,
			Scope:               capability,
			ProofRequirementMet: true,
		}
	}

	assignments, err := s.store.ActivePolicyAssignments(ctx, subjectPubkey, capabilityScope(capability))
	if err != nil {
		log.Printf("policy lookup failed for pubkey=%s capability=%s: %v", subjectPubkey, capability, err)
		return Decision{
			Decision:            "deny",
			Reason:              "policy_lookup_failed",
			Standing:            standing,
			Scope:               capability,
			ProofRequirementMet: true,
		}
	}
	for _, assignment := range assignments {
		if assignment.PolicyType == "block" {
			return Decision{
				Decision:            "deny",
				Reason:              "block_policy",
				Standing:            standing,
				Scope:               capability,
				ProofRequirementMet: true,
			}
		}
	}

	if capability == "relay.admin" {
		return s.CheckAdminAccess(ctx, subjectPubkey)
	}

	baseDecision := Decision{
		Decision:            "deny",
		Reason:              "unknown_capability",
		Standing:            standing,
		Scope:               capability,
		ProofRequirementMet: true,
	}

	if capability == "relay.publish" {
		baseDecision = Decision{
			Decision:            "allow",
			Reason:              "open_publish",
			Standing:            standing,
			Scope:               capability,
			ProofRequirementMet: true,
		}
	}

	if capability == "media.join" || capability == "media.publish" {
		permission, err := s.store.LatestRoomPermission(ctx, subjectPubkey, roomID)
		if err != nil {
			if errors.Is(err, store.ErrNotFound) {
				return Decision{
					Decision:            "deny",
					Reason:              "room_permission_missing",
					Standing:            standing,
					Scope:               capability,
					ProofRequirementMet: true,
				}
			}
			return Decision{
				Decision:            "deny",
				Reason:              "room_permission_lookup_failed",
				Standing:            standing,
				Scope:               capability,
				ProofRequirementMet: true,
			}
		}

		if capability == "media.join" && permission.CanJoin {
			baseDecision = Decision{
				Decision:            "allow",
				Reason:              "room_permission",
				Standing:            standing,
				Scope:               capability,
				ProofRequirementMet: true,
			}
		}
		if capability == "media.publish" && permission.CanPublish {
			baseDecision = Decision{
				Decision:            "allow",
				Reason:              "room_permission",
				Standing:            standing,
				Scope:               capability,
				ProofRequirementMet: true,
			}
		}
		if baseDecision.Decision != "allow" {
			return Decision{
				Decision:            "deny",
				Reason:              "room_permission_denied",
				Standing:            standing,
				Scope:               capability,
				ProofRequirementMet: true,
			}
		}
	}

	return s.applyGatePolicy(ctx, subjectPubkey, capability, standing, assignments, baseDecision)
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

func (s *Service) applyGatePolicy(
	ctx context.Context,
	subjectPubkey string,
	capability string,
	standing string,
	assignments []store.PolicyAssignment,
	baseDecision Decision,
) Decision {
	gatePolicy, err := s.store.LatestGatePolicy(ctx, capability, capabilityScope(capability))
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			return baseDecision
		}
		return Decision{
			Decision:            "deny",
			Reason:              "gate_policy_lookup_failed",
			Standing:            standing,
			Scope:               capability,
			ProofRequirementMet: true,
		}
	}

	gates := make([]GateStatus, 0, len(gatePolicy.ProofTypes)+1)
	if gatePolicy.RequireGuest {
		status := "missing"
		if satisfiesGuestGate(standing, assignments) {
			status = "verified"
		}
		gates = append(gates, GateStatus{Type: "guest_list", Status: status})
		if status != "verified" {
			return Decision{
				Decision:            "deny",
				Reason:              "not_allowlisted",
				Standing:            standing,
				Scope:               capability,
				ProofRequirement:    "guest_list",
				ProofRequirementMet: false,
				Gates:               gates,
			}
		}
	}

	proofRequirementMet := true
	firstMissingProof := ""
	for _, proofType := range gatePolicy.ProofTypes {
		status := "missing"
		if _, err := s.store.LatestProofVerification(ctx, subjectPubkey, proofType); err == nil {
			status = "verified"
		} else if !errors.Is(err, store.ErrNotFound) {
			return Decision{
				Decision:            "deny",
				Reason:              "proof_lookup_failed",
				Standing:            standing,
				Scope:               capability,
				ProofRequirement:    proofType,
				ProofRequirementMet: false,
				Gates:               append(gates, GateStatus{Type: proofType, Status: "error"}),
			}
		}
		gates = append(gates, GateStatus{Type: proofType, Status: status})
		if status != "verified" && firstMissingProof == "" {
			firstMissingProof = proofType
			proofRequirementMet = false
		}
	}

	if !proofRequirementMet {
		return Decision{
			Decision:            "deny",
			Reason:              "required_proof",
			Standing:            standing,
			Scope:               capability,
			ProofRequirement:    firstMissingProof,
			ProofRequirementMet: false,
			Gates:               gates,
		}
	}

	if len(gates) == 0 {
		return baseDecision
	}

	reason := "gate_stack_satisfied"
	if gatePolicy.RequireGuest && len(gatePolicy.ProofTypes) == 0 {
		reason = "allowlisted"
	}
	if len(gatePolicy.ProofTypes) > 0 && !gatePolicy.RequireGuest {
		reason = "proof_verified"
	}

	baseDecision.Reason = reason
	baseDecision.Gates = gates
	baseDecision.ProofRequirementMet = true
	return baseDecision
}

func satisfiesGuestGate(standing string, assignments []store.PolicyAssignment) bool {
	switch standing {
	case "member", "trusted", "moderator", "owner":
		return true
	}

	for _, assignment := range assignments {
		if assignment.PolicyType == "guest" {
			return true
		}
	}

	return false
}
