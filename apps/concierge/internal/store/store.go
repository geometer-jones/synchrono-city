package store

import (
	"context"
	"errors"
	"time"
)

var ErrNotFound = errors.New("record not found")

const DefaultScopeValue = "relay"

type PolicyAssignment struct {
	ID              int64             `json:"id,omitempty"`
	SubjectPubkey   string            `json:"subject_pubkey"`
	PolicyType      string            `json:"policy_type"`
	Scope           string            `json:"scope"`
	GrantedByPubkey string            `json:"granted_by_pubkey"`
	Revoked         bool              `json:"revoked"`
	Metadata        map[string]string `json:"metadata,omitempty"`
	CreatedAt       time.Time         `json:"created_at,omitempty"`
}

type StandingRecord struct {
	ID              int64     `json:"id,omitempty"`
	SubjectPubkey   string    `json:"subject_pubkey"`
	Standing        string    `json:"standing"`
	Scope           string    `json:"scope"`
	GrantedByPubkey string    `json:"granted_by_pubkey"`
	Revoked         bool      `json:"revoked"`
	CreatedAt       time.Time `json:"created_at,omitempty"`
}

type RoomPermission struct {
	ID              int64     `json:"id,omitempty"`
	SubjectPubkey   string    `json:"subject_pubkey"`
	RoomID          string    `json:"room_id"`
	CanJoin         bool      `json:"can_join"`
	CanPublish      bool      `json:"can_publish"`
	CanSubscribe    bool      `json:"can_subscribe"`
	GrantedByPubkey string    `json:"granted_by_pubkey"`
	Revoked         bool      `json:"revoked"`
	CreatedAt       time.Time `json:"created_at,omitempty"`
}

type ProofVerification struct {
	ID              int64             `json:"id,omitempty"`
	SubjectPubkey   string            `json:"subject_pubkey"`
	ProofType       string            `json:"proof_type"`
	ProofValue      string            `json:"proof_value"`
	GrantedByPubkey string            `json:"granted_by_pubkey"`
	Revoked         bool              `json:"revoked"`
	Metadata        map[string]string `json:"metadata,omitempty"`
	CreatedAt       time.Time         `json:"created_at,omitempty"`
}

type GatePolicy struct {
	ID              int64             `json:"id,omitempty"`
	Capability      string            `json:"capability"`
	Scope           string            `json:"scope"`
	RequireGuest    bool              `json:"require_guest"`
	ProofTypes      []string          `json:"proof_types,omitempty"`
	GrantedByPubkey string            `json:"granted_by_pubkey"`
	Revoked         bool              `json:"revoked"`
	Metadata        map[string]string `json:"metadata,omitempty"`
	CreatedAt       time.Time         `json:"created_at,omitempty"`
}

type EditorialPin struct {
	ID              int64             `json:"id,omitempty"`
	Geohash         string            `json:"geohash"`
	NoteID          string            `json:"note_id"`
	Label           string            `json:"label"`
	GrantedByPubkey string            `json:"granted_by_pubkey"`
	Revoked         bool              `json:"revoked"`
	Metadata        map[string]string `json:"metadata,omitempty"`
	CreatedAt       time.Time         `json:"created_at,omitempty"`
}

type AuditEntry struct {
	ID           int64             `json:"id,omitempty"`
	ActorPubkey  string            `json:"actor_pubkey"`
	Action       string            `json:"action"`
	TargetPubkey string            `json:"target_pubkey,omitempty"`
	Scope        string            `json:"scope"`
	Metadata     map[string]string `json:"metadata,omitempty"`
	CreatedAt    time.Time         `json:"created_at,omitempty"`
}

type PolicyAssignmentQuery struct {
	SubjectPubkey  string
	PolicyType     string
	Scope          string
	IncludeRevoked bool
	Limit          int
}

type StandingRecordQuery struct {
	SubjectPubkey  string
	Scope          string
	IncludeRevoked bool
	Limit          int
}

type RoomPermissionQuery struct {
	SubjectPubkey  string
	RoomID         string
	IncludeRevoked bool
	Limit          int
}

type ProofVerificationQuery struct {
	SubjectPubkey  string
	ProofType      string
	IncludeRevoked bool
	Limit          int
}

type GatePolicyQuery struct {
	Capability     string
	Scope          string
	IncludeRevoked bool
	Limit          int
}

type EditorialPinQuery struct {
	Geohash        string
	NoteID         string
	IncludeRevoked bool
	Limit          int
}

type AuditEntryQuery struct {
	Cursor string
	Limit  int
}

type AuditEntryPage struct {
	Entries     []AuditEntry `json:"entries"`
	NextCursor  string       `json:"next_cursor,omitempty"`
}

type Store interface {
	CreatePolicyAssignment(context.Context, PolicyAssignment) (PolicyAssignment, error)
	CreateStandingRecord(context.Context, StandingRecord) (StandingRecord, error)
	CreateRoomPermission(context.Context, RoomPermission) (RoomPermission, error)
	CreateProofVerification(context.Context, ProofVerification) (ProofVerification, error)
	CreateGatePolicy(context.Context, GatePolicy) (GatePolicy, error)
	CreateEditorialPin(context.Context, EditorialPin) (EditorialPin, error)
	ListPolicyAssignments(context.Context, PolicyAssignmentQuery) ([]PolicyAssignment, error)
	ListStandingRecords(context.Context, StandingRecordQuery) ([]StandingRecord, error)
	ListRoomPermissions(context.Context, RoomPermissionQuery) ([]RoomPermission, error)
	ListProofVerifications(context.Context, ProofVerificationQuery) ([]ProofVerification, error)
	ListGatePolicies(context.Context, GatePolicyQuery) ([]GatePolicy, error)
	ListEditorialPins(context.Context, EditorialPinQuery) ([]EditorialPin, error)
	ListAuditEntries(context.Context, AuditEntryQuery) (AuditEntryPage, error)
	CreateAuditEntry(context.Context, AuditEntry) (AuditEntry, error)
	LatestStanding(context.Context, string, string) (StandingRecord, error)
	LatestRoomPermission(context.Context, string, string) (RoomPermission, error)
	LatestProofVerification(context.Context, string, string) (ProofVerification, error)
	LatestGatePolicy(context.Context, string, string) (GatePolicy, error)
	ActivePolicyAssignments(context.Context, string, string) ([]PolicyAssignment, error)
	Close() error
}

func DefaultScope(scope string) string {
	if scope == "" {
		return DefaultScopeValue
	}
	return scope
}
