package httpapi

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
)

var hexPubkeyPattern = regexp.MustCompile(`^[a-fA-F0-9]{64}$`)

var (
	validStandings = map[string]struct{}{
		"guest":     {},
		"member":    {},
		"trusted":   {},
		"moderator": {},
		"owner":     {},
		"banned":    {},
		"suspended": {},
	}
	validPolicyTypes = map[string]struct{}{
		"block":         {},
		"allow_publish": {},
		"allow_media":   {},
		"guest":         {},
	}
	validProofTypes = map[string]struct{}{
		"oauth":  {},
		"social": {},
	}
	validCapabilities = map[string]struct{}{
		"relay.publish": {},
		"media.join":    {},
		"media.publish": {},
	}
)

func validatePubkey(pubkey string) (string, error) {
	pubkey = strings.TrimSpace(pubkey)
	if pubkey == "" {
		return "", errors.New("subject_pubkey is required")
	}
	if strings.HasPrefix(pubkey, "npub1") || hexPubkeyPattern.MatchString(pubkey) {
		return pubkey, nil
	}
	return "", fmt.Errorf("invalid subject_pubkey %q", pubkey)
}

func validateStanding(standing string) (string, error) {
	standing = strings.TrimSpace(strings.ToLower(standing))
	if _, ok := validStandings[standing]; !ok {
		return "", fmt.Errorf("invalid standing %q", standing)
	}
	return standing, nil
}

func validatePolicyType(policyType string) (string, error) {
	policyType = strings.TrimSpace(strings.ToLower(policyType))
	if _, ok := validPolicyTypes[policyType]; !ok {
		return "", fmt.Errorf("invalid policy_type %q", policyType)
	}
	return policyType, nil
}

func validateRoomID(roomID string) (string, error) {
	roomID = strings.TrimSpace(roomID)
	if roomID == "" {
		return "", errors.New("room_id is required")
	}
	return roomID, nil
}

func validateProofType(proofType string) (string, error) {
	proofType = strings.TrimSpace(strings.ToLower(proofType))
	if _, ok := validProofTypes[proofType]; !ok {
		return "", fmt.Errorf("invalid proof_type %q", proofType)
	}
	return proofType, nil
}

func validateCapability(capability string) (string, error) {
	capability = strings.TrimSpace(capability)
	if _, ok := validCapabilities[capability]; !ok {
		return "", fmt.Errorf("invalid capability %q", capability)
	}
	return capability, nil
}

func validateNoteID(noteID string) (string, error) {
	noteID = strings.TrimSpace(noteID)
	if noteID == "" {
		return "", errors.New("note_id is required")
	}
	return noteID, nil
}

func validateGeohash(geohash string) (string, error) {
	geohash = strings.TrimSpace(strings.ToLower(geohash))
	if geohash == "" {
		return "", errors.New("geohash is required")
	}
	return geohash, nil
}

func validateLabel(label string) string {
	label = strings.TrimSpace(label)
	if label == "" {
		return "featured"
	}
	return label
}
