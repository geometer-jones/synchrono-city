package pubkeys

import (
	"strings"

	"github.com/nbd-wtf/go-nostr"
	"github.com/nbd-wtf/go-nostr/nip19"
)

func Canonicalize(pubkey string) string {
	trimmed := strings.TrimSpace(pubkey)
	if trimmed == "" {
		return ""
	}

	lowered := strings.ToLower(trimmed)
	if nostr.IsValidPublicKey(lowered) {
		return lowered
	}

	if !strings.HasPrefix(lowered, "npub1") {
		return lowered
	}

	prefix, value, err := nip19.Decode(lowered)
	if err != nil || prefix != "npub" {
		return lowered
	}

	decoded, ok := value.(string)
	if !ok {
		return lowered
	}

	canonical := strings.ToLower(strings.TrimSpace(decoded))
	if !nostr.IsValidPublicKey(canonical) {
		return lowered
	}

	return canonical
}

func Aliases(pubkey string) []string {
	canonical := Canonicalize(pubkey)
	if canonical == "" {
		return nil
	}

	aliases := make([]string, 0, 3)
	seen := make(map[string]struct{}, 3)

	add := func(value string) {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			return
		}

		key := strings.ToLower(trimmed)
		if _, ok := seen[key]; ok {
			return
		}

		seen[key] = struct{}{}
		aliases = append(aliases, trimmed)
	}

	add(canonical)
	if npub, err := nip19.EncodePublicKey(canonical); err == nil {
		add(strings.ToLower(npub))
	}
	add(pubkey)

	return aliases
}

func Equal(left, right string) bool {
	leftCanonical := Canonicalize(left)
	rightCanonical := Canonicalize(right)
	if leftCanonical == "" || rightCanonical == "" {
		return false
	}

	return leftCanonical == rightCanonical
}
