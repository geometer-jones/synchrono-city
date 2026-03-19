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

	reason := mapReason(decision.Reason, canModerate)
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
				Mode:                "open",
				ProofRequirement:    "none",
				ProofRequirementMet: allow,
				Gates:               []GateInfo{},
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

func mapReason(reason string, canModerate bool) string {
	if canModerate {
		return "privileged_override"
	}

	switch reason {
	case "block_policy", "standing_blocks_capability":
		return "blocked"
	case "open_publish":
		return "policy_open"
	default:
		return "policy_open"
	}
}
