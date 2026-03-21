package relayauth

import (
	"context"

	"github.com/peterwei/synchrono-city/apps/concierge/internal/policy"
)

type Evaluator struct {
	policyService *policy.Service
}

func NewEvaluator(policyService *policy.Service) *Evaluator {
	return &Evaluator{policyService: policyService}
}

func (e *Evaluator) Evaluate(ctx context.Context, request Request) Response {
	decision := e.policyService.Evaluate(ctx, request.Pubkey, "relay.publish", "")
	standing := e.policyService.Standing(ctx, request.Pubkey, "relay.admin")
	canModerate := standing == "owner" || standing == "moderator"

	reason := mapReason(decision, canModerate)
	allow := decision.Decision == "allow"

	return Response{
		Allow:  allow,
		Reason: reason,
		Scope:  normalizeScope(request.Scope),
		Capabilities: Capabilities{
			CanModerate: canModerate,
		},
		Policy: Policy{
			Publish: PublishPolicy{
				Allowed:             allow,
				Reason:              reason,
				Mode:                publishMode(decision),
				ProofRequirement:    proofRequirement(decision),
				ProofRequirementMet: decision.ProofRequirementMet,
				Gates:               mapGates(decision.Gates),
			},
		},
	}
}

func normalizeScope(scope string) string {
	if scope == "" {
		return "relay"
	}
	return scope
}

func mapReason(decision policy.Decision, canModerate bool) string {
	if canModerate && decision.Decision == "allow" {
		return "privileged_override"
	}

	switch decision.Reason {
	case "block_policy", "standing_blocks_capability":
		return "blocked"
	case "required_proof":
		return "required_proof"
	case "not_allowlisted":
		return "not_allowlisted"
	case "allowlisted", "proof_verified", "gate_stack_satisfied":
		return "allowlisted"
	case "open_publish":
		return "policy_open"
	default:
		return "policy_open"
	}
}

func publishMode(decision policy.Decision) string {
	if len(decision.Gates) == 0 {
		return "open"
	}
	return "gated"
}

func proofRequirement(decision policy.Decision) string {
	if decision.ProofRequirement != "" {
		return decision.ProofRequirement
	}
	return "none"
}

func mapGates(gates []policy.GateStatus) []GateInfo {
	if len(gates) == 0 {
		return []GateInfo{}
	}

	mapped := make([]GateInfo, 0, len(gates))
	for _, gate := range gates {
		mapped = append(mapped, GateInfo{Type: gate.Type, Status: gate.Status})
	}
	return mapped
}
