package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/peterwei/synchrono-city/apps/concierge/internal/config"
	scLiveKit "github.com/peterwei/synchrono-city/apps/concierge/internal/livekit"
	"github.com/peterwei/synchrono-city/apps/concierge/internal/nip98"
	"github.com/peterwei/synchrono-city/apps/concierge/internal/policy"
	"github.com/peterwei/synchrono-city/apps/concierge/internal/relayauth"
	"github.com/peterwei/synchrono-city/apps/concierge/internal/social"
	"github.com/peterwei/synchrono-city/apps/concierge/internal/store"
)

const maxJSONBodyBytes = 1 << 20

const corsAllowedMethods = "GET, POST, OPTIONS"
const corsAllowedHeaders = "Authorization, Content-Type"
const corsMaxAgeSeconds = "600"

type Server struct {
	config                       config.Config
	mux                          *http.ServeMux
	store                        store.Store
	authVerifier                 *nip98.Verifier
	tokenService                 *scLiveKit.TokenService
	participantPermissionUpdater scLiveKit.ParticipantPermissionUpdater
	policyService                *policy.Service
	relayAuth                    *relayauth.Evaluator
	socialService                *social.Service
	adminLimiter                 *rateLimiter
}

func NewServer(cfg config.Config, policyStore store.Store) *Server {
	socialService := social.NewService(cfg.PrimaryOperatorPub, cfg.RelayName, cfg.PrimaryRelayURL, policyStore)
	tokenService := scLiveKit.NewTokenService(cfg, policyStore)
	tokenService.SetDefaultRoomGrantSource(socialService)
	policyService := policy.NewService(policyStore, cfg.PrimaryOperatorPub)
	policyService.SetDefaultRoomGrantSource(socialService)

	s := &Server{
		config:                       cfg,
		mux:                          http.NewServeMux(),
		store:                        policyStore,
		authVerifier:                 nip98.NewVerifier(),
		tokenService:                 tokenService,
		participantPermissionUpdater: scLiveKit.NewParticipantPermissionUpdater(cfg),
		policyService:                policyService,
		relayAuth:                    relayauth.NewEvaluator(policyService),
		socialService:                socialService,
		adminLimiter:                 newRateLimiter(defaultAdminRateLimit, defaultAdminRateLimitWindow),
	}

	s.routes()
	return s
}

func (s *Server) Handler() http.Handler {
	return withCORS(s.mux)
}

func (s *Server) routes() {
	s.mux.HandleFunc("/healthz", s.handleHealthz)
	s.mux.HandleFunc("/api/v1/token", s.handleToken)
	s.mux.HandleFunc("/api/v1/social/bootstrap", s.handleSocialBootstrap)
	s.mux.HandleFunc("/api/v1/social/beacons", s.handleSocialBeacons)
	s.mux.HandleFunc("/api/v1/social/notes", s.handleSocialNotes)
	s.mux.HandleFunc("/api/v1/social/call-intent", s.handleSocialCallIntent)
	s.mux.HandleFunc("/api/v1/admin/policy/check", s.handleAdminPolicyCheck)
	s.mux.HandleFunc("/api/v1/admin/policies", s.handleAdminPolicies)
	s.mux.HandleFunc("/api/v1/admin/standing", s.handleAdminStanding)
	s.mux.HandleFunc("/api/v1/admin/room-permissions", s.handleAdminRoomPermissions)
	s.mux.HandleFunc("/api/v1/admin/proofs", s.handleAdminProofs)
	s.mux.HandleFunc("/api/v1/admin/gates", s.handleAdminGates)
	s.mux.HandleFunc("/api/v1/admin/editorial/pins", s.handleAdminEditorialPins)
	s.mux.HandleFunc("/api/v1/admin/audit", s.handleAdminAudit)
	s.mux.HandleFunc("/api/v1/relay/authorize", s.handleRelayAuthorize)
	s.mux.HandleFunc("/internal/relay/authorize", s.handleInternalRelayAuthorize)
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", corsAllowedMethods)
		w.Header().Set("Access-Control-Allow-Headers", corsAllowedHeaders)
		w.Header().Set("Access-Control-Max-Age", corsMaxAgeSeconds)
		w.Header().Add("Vary", "Origin")
		w.Header().Add("Vary", "Access-Control-Request-Method")
		w.Header().Add("Vary", "Access-Control-Request-Headers")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func (s *Server) handleSocialBootstrap(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method_not_allowed"})
		return
	}

	writeJSON(w, http.StatusOK, s.socialService.Bootstrap())
}

func (s *Server) handleSocialBeacons(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method_not_allowed"})
		return
	}

	var request struct {
		Geohash string   `json:"geohash"`
		Name    string   `json:"name"`
		Picture string   `json:"pic"`
		About   string   `json:"about"`
		Tags    []string `json:"tags"`
	}
	if err := decodeJSONBody(r, &request); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json", "message": err.Error()})
		return
	}

	result, err := s.socialService.CreateOrReturnBeacon(
		strings.TrimSpace(request.Geohash),
		request.Name,
		request.Picture,
		request.About,
		request.Tags,
	)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request", "message": err.Error()})
		return
	}

	status := http.StatusCreated
	if !result.Created {
		status = http.StatusOK
	}

	writeJSON(w, status, result)
}

func (s *Server) handleSocialNotes(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method_not_allowed"})
		return
	}

	var request struct {
		Geohash      string `json:"geohash"`
		AuthorPubkey string `json:"author_pubkey"`
		Content      string `json:"content"`
	}
	if err := decodeJSONBody(r, &request); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json", "message": err.Error()})
		return
	}

	note, err := s.socialService.CreateNote(strings.TrimSpace(request.Geohash), strings.TrimSpace(request.AuthorPubkey), request.Content)
	if err != nil {
		status := http.StatusBadRequest
		switch {
		case errors.Is(err, social.ErrUnknownPlace):
			status = http.StatusNotFound
		case errors.Is(err, social.ErrEmptyContent):
			status = http.StatusBadRequest
		}
		writeJSON(w, status, map[string]string{"error": "invalid_request", "message": err.Error()})
		return
	}

	writeJSON(w, http.StatusCreated, note)
}

func (s *Server) handleSocialCallIntent(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method_not_allowed"})
		return
	}

	var request struct {
		Geohash string `json:"geohash"`
		Pubkey  string `json:"pubkey"`
	}
	if err := decodeJSONBody(r, &request); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json", "message": err.Error()})
		return
	}

	intent, err := s.socialService.ResolveCallIntent(strings.TrimSpace(request.Geohash), strings.TrimSpace(request.Pubkey))
	if err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, social.ErrUnknownPlace) {
			status = http.StatusNotFound
		}
		writeJSON(w, status, map[string]string{"error": "invalid_request", "message": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, intent)
}

func (s *Server) handleHealthz(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method_not_allowed"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"status":          "ok",
		"relay_name":      s.config.RelayName,
		"relay_url":       s.config.PrimaryRelayURL,
		"operator_pubkey": s.config.PrimaryOperatorPub,
		"timestamp":       time.Now().UTC().Format(time.RFC3339),
	})
}

func (s *Server) handleToken(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method_not_allowed"})
		return
	}

	authResult, ok := s.requireNIP98(w, r)
	if !ok {
		return
	}

	var request struct {
		RoomID string `json:"room_id"`
	}
	if err := decodeJSONBody(r, &request); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json", "message": err.Error()})
		return
	}
	roomID, err := validateRoomID(request.RoomID)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request", "message": err.Error()})
		return
	}
	request.RoomID = roomID

	decision := s.policyService.Evaluate(r.Context(), authResult.Pubkey, "media.join", request.RoomID)
	if decision.Decision != "allow" {
		writeJSON(w, http.StatusForbidden, decision)
		return
	}

	tokenResponse, err := s.tokenService.Issue(r.Context(), authResult.Pubkey, request.RoomID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{
			"error":   "token_issue_failed",
			"message": err.Error(),
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"decision": decision.Decision,
		"reason":   decision.Reason,
		"token":    tokenResponse,
	})
}

func (s *Server) handleAdminPolicyCheck(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method_not_allowed"})
		return
	}

	authResult, ok := s.requireNIP98(w, r)
	if !ok {
		return
	}
	if !s.enforceAdminRateLimit(w, authResult.Pubkey) {
		return
	}

	decision := s.policyService.CheckAdminAccess(r.Context(), authResult.Pubkey)
	writeJSON(w, http.StatusOK, map[string]any{
		"decision":  decision.Decision,
		"reason":    decision.Reason,
		"scope":     decision.Scope,
		"standing":  decision.Standing,
		"auth_mode": "nip98",
	})
}

func (s *Server) handleAdminPolicies(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		s.handleAdminPoliciesList(w, r)
		return
	}
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method_not_allowed"})
		return
	}

	actorPubkey, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}

	var request struct {
		SubjectPubkey string            `json:"subject_pubkey"`
		PolicyType    string            `json:"policy_type"`
		Scope         string            `json:"scope"`
		Revoked       bool              `json:"revoked"`
		Metadata      map[string]string `json:"metadata"`
	}
	if err := decodeJSONBody(r, &request); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json", "message": err.Error()})
		return
	}
	subjectPubkey, err := validatePubkey(request.SubjectPubkey)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request", "message": err.Error()})
		return
	}
	policyType, err := validatePolicyType(request.PolicyType)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request", "message": err.Error()})
		return
	}
	request.SubjectPubkey = subjectPubkey
	request.PolicyType = policyType
	request.Scope = strings.TrimSpace(request.Scope)

	record, err := s.store.CreatePolicyAssignment(r.Context(), store.PolicyAssignment{
		SubjectPubkey:   request.SubjectPubkey,
		PolicyType:      request.PolicyType,
		Scope:           request.Scope,
		GrantedByPubkey: actorPubkey,
		Revoked:         request.Revoked,
		Metadata:        request.Metadata,
	})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "store_failure", "message": err.Error()})
		return
	}

	_, auditErr := s.store.CreateAuditEntry(r.Context(), store.AuditEntry{
		ActorPubkey:  actorPubkey,
		Action:       "policy.assignment.created",
		TargetPubkey: request.SubjectPubkey,
		Scope:        store.DefaultScope(request.Scope),
		Metadata: map[string]string{
			"policy_type": request.PolicyType,
		},
	})
	s.logAuditFailure(auditErr)

	writeJSON(w, http.StatusCreated, record)
}

func (s *Server) handleAdminStanding(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		s.handleAdminStandingList(w, r)
		return
	}
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method_not_allowed"})
		return
	}

	actorPubkey, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}

	var request struct {
		SubjectPubkey string `json:"subject_pubkey"`
		Standing      string `json:"standing"`
		Scope         string `json:"scope"`
		Revoked       bool   `json:"revoked"`
	}
	if err := decodeJSONBody(r, &request); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json", "message": err.Error()})
		return
	}
	subjectPubkey, err := validatePubkey(request.SubjectPubkey)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request", "message": err.Error()})
		return
	}
	standing, err := validateStanding(request.Standing)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request", "message": err.Error()})
		return
	}
	request.SubjectPubkey = subjectPubkey
	request.Standing = standing
	request.Scope = strings.TrimSpace(request.Scope)

	record, err := s.store.CreateStandingRecord(r.Context(), store.StandingRecord{
		SubjectPubkey:   request.SubjectPubkey,
		Standing:        request.Standing,
		Scope:           request.Scope,
		GrantedByPubkey: actorPubkey,
		Revoked:         request.Revoked,
	})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "store_failure", "message": err.Error()})
		return
	}

	_, auditErr := s.store.CreateAuditEntry(r.Context(), store.AuditEntry{
		ActorPubkey:  actorPubkey,
		Action:       "standing.record.created",
		TargetPubkey: request.SubjectPubkey,
		Scope:        store.DefaultScope(request.Scope),
		Metadata: map[string]string{
			"standing": request.Standing,
		},
	})
	s.logAuditFailure(auditErr)

	writeJSON(w, http.StatusCreated, record)
}

func (s *Server) handleAdminRoomPermissions(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		s.handleAdminRoomPermissionsList(w, r)
		return
	}
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method_not_allowed"})
		return
	}

	actorPubkey, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}

	var request struct {
		SubjectPubkey string `json:"subject_pubkey"`
		RoomID        string `json:"room_id"`
		CanJoin       bool   `json:"can_join"`
		CanPublish    bool   `json:"can_publish"`
		CanSubscribe  bool   `json:"can_subscribe"`
		Revoked       bool   `json:"revoked"`
	}
	if err := decodeJSONBody(r, &request); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json", "message": err.Error()})
		return
	}
	subjectPubkey, err := validatePubkey(request.SubjectPubkey)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request", "message": err.Error()})
		return
	}
	roomID, err := validateRoomID(request.RoomID)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request", "message": err.Error()})
		return
	}
	request.SubjectPubkey = subjectPubkey
	request.RoomID = roomID

	record, err := s.store.CreateRoomPermission(r.Context(), store.RoomPermission{
		SubjectPubkey:   request.SubjectPubkey,
		RoomID:          request.RoomID,
		CanJoin:         request.CanJoin,
		CanPublish:      request.CanPublish,
		CanSubscribe:    request.CanSubscribe,
		GrantedByPubkey: actorPubkey,
		Revoked:         request.Revoked,
	})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "store_failure", "message": err.Error()})
		return
	}

	_, auditErr := s.store.CreateAuditEntry(r.Context(), store.AuditEntry{
		ActorPubkey:  actorPubkey,
		Action:       "room.permission.created",
		TargetPubkey: request.SubjectPubkey,
		Scope:        request.RoomID,
		Metadata: map[string]string{
			"can_join":      strconv.FormatBool(request.CanJoin),
			"can_publish":   strconv.FormatBool(request.CanPublish),
			"can_subscribe": strconv.FormatBool(request.CanSubscribe),
		},
	})
	s.logAuditFailure(auditErr)

	response := struct {
		store.RoomPermission
		LiveSyncApplied bool   `json:"live_sync_applied,omitempty"`
		LiveSyncWarning string `json:"live_sync_warning,omitempty"`
	}{
		RoomPermission: record,
	}

	if s.participantPermissionUpdater != nil {
		syncErr := s.participantPermissionUpdater.UpdateParticipantPermission(r.Context(), request.RoomID, request.SubjectPubkey, scLiveKit.ParticipantPermission{
			CanPublish:   !request.Revoked && request.CanPublish,
			CanSubscribe: !request.Revoked && request.CanSubscribe,
		})
		switch {
		case syncErr == nil:
			response.LiveSyncApplied = true
		case errors.Is(syncErr, scLiveKit.ErrParticipantNotConnected):
			// Permission still applies on the next join; no live warning needed.
		default:
			response.LiveSyncWarning = syncErr.Error()
		}
	}

	writeJSON(w, http.StatusCreated, response)
}

func (s *Server) handleAdminProofs(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		s.handleAdminProofsList(w, r)
		return
	}
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method_not_allowed"})
		return
	}

	actorPubkey, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}

	var request struct {
		SubjectPubkey string            `json:"subject_pubkey"`
		ProofType     string            `json:"proof_type"`
		ProofValue    string            `json:"proof_value"`
		Revoked       bool              `json:"revoked"`
		Metadata      map[string]string `json:"metadata"`
	}
	if err := decodeJSONBody(r, &request); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json", "message": err.Error()})
		return
	}

	subjectPubkey, err := validatePubkey(request.SubjectPubkey)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request", "message": err.Error()})
		return
	}
	proofType, err := validateProofType(request.ProofType)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request", "message": err.Error()})
		return
	}
	proofValue := strings.TrimSpace(request.ProofValue)
	if proofValue == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request", "message": "proof_value is required"})
		return
	}

	record, err := s.store.CreateProofVerification(r.Context(), store.ProofVerification{
		SubjectPubkey:   subjectPubkey,
		ProofType:       proofType,
		ProofValue:      proofValue,
		GrantedByPubkey: actorPubkey,
		Revoked:         request.Revoked,
		Metadata:        request.Metadata,
	})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "store_failure", "message": err.Error()})
		return
	}

	_, auditErr := s.store.CreateAuditEntry(r.Context(), store.AuditEntry{
		ActorPubkey:  actorPubkey,
		Action:       "proof.verification.created",
		TargetPubkey: subjectPubkey,
		Scope:        proofType,
		Metadata: map[string]string{
			"proof_type":  proofType,
			"proof_value": proofValue,
			"revoked":     strconv.FormatBool(request.Revoked),
		},
	})
	s.logAuditFailure(auditErr)

	writeJSON(w, http.StatusCreated, record)
}

func (s *Server) handleAdminGates(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		s.handleAdminGatesList(w, r)
		return
	}
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method_not_allowed"})
		return
	}

	actorPubkey, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}

	var request struct {
		Capability   string            `json:"capability"`
		Scope        string            `json:"scope"`
		RequireGuest bool              `json:"require_guest"`
		ProofTypes   []string          `json:"proof_types"`
		Revoked      bool              `json:"revoked"`
		Metadata     map[string]string `json:"metadata"`
	}
	if err := decodeJSONBody(r, &request); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json", "message": err.Error()})
		return
	}

	capability, err := validateCapability(request.Capability)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request", "message": err.Error()})
		return
	}
	proofTypes := make([]string, 0, len(request.ProofTypes))
	seenProofTypes := map[string]struct{}{}
	for _, proofType := range request.ProofTypes {
		validated, err := validateProofType(proofType)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request", "message": err.Error()})
			return
		}
		if _, exists := seenProofTypes[validated]; exists {
			continue
		}
		seenProofTypes[validated] = struct{}{}
		proofTypes = append(proofTypes, validated)
	}

	record, err := s.store.CreateGatePolicy(r.Context(), store.GatePolicy{
		Capability:      capability,
		Scope:           strings.TrimSpace(request.Scope),
		RequireGuest:    request.RequireGuest,
		ProofTypes:      proofTypes,
		GrantedByPubkey: actorPubkey,
		Revoked:         request.Revoked,
		Metadata:        request.Metadata,
	})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "store_failure", "message": err.Error()})
		return
	}

	_, auditErr := s.store.CreateAuditEntry(r.Context(), store.AuditEntry{
		ActorPubkey: actorPubkey,
		Action:      "gate.policy.created",
		Scope:       capability,
		Metadata: map[string]string{
			"require_guest": strconv.FormatBool(request.RequireGuest),
			"proof_types":   strings.Join(proofTypes, ","),
			"revoked":       strconv.FormatBool(request.Revoked),
		},
	})
	s.logAuditFailure(auditErr)

	writeJSON(w, http.StatusCreated, record)
}

func (s *Server) handleAdminEditorialPins(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		s.handleAdminEditorialPinsList(w, r)
		return
	}
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method_not_allowed"})
		return
	}

	actorPubkey, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}

	var request struct {
		Geohash  string            `json:"geohash"`
		NoteID   string            `json:"note_id"`
		Label    string            `json:"label"`
		Revoked  bool              `json:"revoked"`
		Metadata map[string]string `json:"metadata"`
	}
	if err := decodeJSONBody(r, &request); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json", "message": err.Error()})
		return
	}

	geohash, err := validateGeohash(request.Geohash)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request", "message": err.Error()})
		return
	}
	noteID, err := validateNoteID(request.NoteID)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request", "message": err.Error()})
		return
	}
	if err := s.socialService.ValidateEditorialPin(geohash, noteID); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request", "message": err.Error()})
		return
	}

	record, err := s.store.CreateEditorialPin(r.Context(), store.EditorialPin{
		Geohash:         geohash,
		NoteID:          noteID,
		Label:           validateLabel(request.Label),
		GrantedByPubkey: actorPubkey,
		Revoked:         request.Revoked,
		Metadata:        request.Metadata,
	})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "store_failure", "message": err.Error()})
		return
	}

	_, auditErr := s.store.CreateAuditEntry(r.Context(), store.AuditEntry{
		ActorPubkey: actorPubkey,
		Action:      "editorial.pin.created",
		Scope:       geohash,
		Metadata: map[string]string{
			"note_id": noteID,
			"label":   record.Label,
			"revoked": strconv.FormatBool(request.Revoked),
		},
	})
	s.logAuditFailure(auditErr)

	writeJSON(w, http.StatusCreated, record)
}

func (s *Server) handleAdminAudit(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method_not_allowed"})
		return
	}

	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}

	limit, ok := parseOptionalLimit(w, r)
	if !ok {
		return
	}
	page, err := s.store.ListAuditEntries(r.Context(), store.AuditEntryQuery{
		Cursor: strings.TrimSpace(r.URL.Query().Get("cursor")),
		Limit:  limit,
	})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "store_failure", "message": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, page)
}

func (s *Server) handleAdminPoliciesList(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}

	query, ok := parsePolicyAssignmentQuery(w, r)
	if !ok {
		return
	}

	records, err := s.store.ListPolicyAssignments(r.Context(), query)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "store_failure", "message": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"entries": records})
}

func (s *Server) handleAdminStandingList(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}

	query, ok := parseStandingRecordQuery(w, r)
	if !ok {
		return
	}

	records, err := s.store.ListStandingRecords(r.Context(), query)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "store_failure", "message": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"entries": records})
}

func (s *Server) handleAdminRoomPermissionsList(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}

	query, ok := parseRoomPermissionQuery(w, r)
	if !ok {
		return
	}

	records, err := s.store.ListRoomPermissions(r.Context(), query)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "store_failure", "message": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"entries": records})
}

func (s *Server) handleAdminProofsList(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}

	query, ok := parseProofVerificationQuery(w, r)
	if !ok {
		return
	}

	records, err := s.store.ListProofVerifications(r.Context(), query)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "store_failure", "message": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"entries": records})
}

func (s *Server) handleAdminGatesList(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}

	query, ok := parseGatePolicyQuery(w, r)
	if !ok {
		return
	}

	records, err := s.store.ListGatePolicies(r.Context(), query)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "store_failure", "message": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"entries": records})
}

func (s *Server) handleAdminEditorialPinsList(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}

	query, ok := parseEditorialPinQuery(w, r)
	if !ok {
		return
	}

	records, err := s.store.ListEditorialPins(r.Context(), query)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "store_failure", "message": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"entries": records})
}

func (s *Server) handleRelayAuthorize(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method_not_allowed"})
		return
	}

	var request struct {
		SubjectPubkey string `json:"subject_pubkey"`
		Capability    string `json:"capability"`
		RoomID        string `json:"room_id"`
	}
	if err := decodeJSONBody(r, &request); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json", "message": err.Error()})
		return
	}
	capability, err := validateCapability(request.Capability)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request", "message": err.Error()})
		return
	}
	request.Capability = capability

	decision := s.policyService.Evaluate(r.Context(), request.SubjectPubkey, request.Capability, request.RoomID)
	if decision.Decision != "allow" {
		writeJSON(w, http.StatusForbidden, decision)
		return
	}

	writeJSON(w, http.StatusOK, decision)
}

func (s *Server) handleInternalRelayAuthorize(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method_not_allowed"})
		return
	}

	var request relayauth.Request
	if err := decodeJSONBody(r, &request); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json", "message": err.Error()})
		return
	}

	if request.Action != "publish" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "unsupported_action", "message": "only publish is supported"})
		return
	}
	if request.Pubkey == "" || request.Event.ID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request", "message": "pubkey and event.id are required"})
		return
	}

	writeJSON(w, http.StatusOK, s.relayAuth.Evaluate(r.Context(), request))
}

func (s *Server) requireAdmin(w http.ResponseWriter, r *http.Request) (string, bool) {
	authResult, ok := s.requireNIP98(w, r)
	if !ok {
		return "", false
	}
	if !s.enforceAdminRateLimit(w, authResult.Pubkey) {
		return "", false
	}

	decision := s.policyService.CheckAdminAccess(r.Context(), authResult.Pubkey)
	if decision.Decision != "allow" {
		writeJSON(w, http.StatusForbidden, decision)
		return "", false
	}

	return authResult.Pubkey, true
}

func (s *Server) requireNIP98(w http.ResponseWriter, r *http.Request) (nip98.Result, bool) {
	result, err := s.authVerifier.VerifyRequest(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{
			"error":   "invalid_nip98",
			"message": err.Error(),
		})
		return nip98.Result{}, false
	}

	return result, true
}

func (s *Server) enforceAdminRateLimit(w http.ResponseWriter, pubkey string) bool {
	result := s.adminLimiter.Allow(pubkey)
	if result.Allowed {
		return true
	}

	retryAfter := int((result.RetryAfter + time.Second - 1) / time.Second)
	if retryAfter < 1 {
		retryAfter = 1
	}
	w.Header().Set("Retry-After", strconv.Itoa(retryAfter))
	writeJSON(w, http.StatusTooManyRequests, map[string]any{
		"error":       "rate_limit_exceeded",
		"retry_after": retryAfter,
	})
	return false
}

func (s *Server) logAuditFailure(err error) {
	if err != nil {
		log.Printf("audit log write failed: %v", err)
	}
}

func parseOptionalLimit(w http.ResponseWriter, r *http.Request) (int, bool) {
	limit := 0
	if rawLimit := strings.TrimSpace(r.URL.Query().Get("limit")); rawLimit != "" {
		parsed, err := strconv.Atoi(rawLimit)
		if err != nil || parsed < 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request", "message": "limit must be a non-negative integer"})
			return 0, false
		}
		limit = parsed
	}
	return limit, true
}

func parsePolicyAssignmentQuery(w http.ResponseWriter, r *http.Request) (store.PolicyAssignmentQuery, bool) {
	limit, ok := parseOptionalLimit(w, r)
	if !ok {
		return store.PolicyAssignmentQuery{}, false
	}

	query := store.PolicyAssignmentQuery{
		PolicyType:     strings.TrimSpace(r.URL.Query().Get("policy_type")),
		Scope:          strings.TrimSpace(r.URL.Query().Get("scope")),
		IncludeRevoked: strings.EqualFold(strings.TrimSpace(r.URL.Query().Get("include_revoked")), "true"),
		Limit:          limit,
	}

	if subject := strings.TrimSpace(r.URL.Query().Get("subject_pubkey")); subject != "" {
		validated, err := validatePubkey(subject)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request", "message": err.Error()})
			return store.PolicyAssignmentQuery{}, false
		}
		query.SubjectPubkey = validated
	}
	if query.PolicyType != "" {
		validated, err := validatePolicyType(query.PolicyType)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request", "message": err.Error()})
			return store.PolicyAssignmentQuery{}, false
		}
		query.PolicyType = validated
	}

	return query, true
}

func parseStandingRecordQuery(w http.ResponseWriter, r *http.Request) (store.StandingRecordQuery, bool) {
	limit, ok := parseOptionalLimit(w, r)
	if !ok {
		return store.StandingRecordQuery{}, false
	}

	query := store.StandingRecordQuery{
		Scope:          strings.TrimSpace(r.URL.Query().Get("scope")),
		IncludeRevoked: strings.EqualFold(strings.TrimSpace(r.URL.Query().Get("include_revoked")), "true"),
		Limit:          limit,
	}
	if subject := strings.TrimSpace(r.URL.Query().Get("subject_pubkey")); subject != "" {
		validated, err := validatePubkey(subject)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request", "message": err.Error()})
			return store.StandingRecordQuery{}, false
		}
		query.SubjectPubkey = validated
	}
	return query, true
}

func parseRoomPermissionQuery(w http.ResponseWriter, r *http.Request) (store.RoomPermissionQuery, bool) {
	limit, ok := parseOptionalLimit(w, r)
	if !ok {
		return store.RoomPermissionQuery{}, false
	}

	query := store.RoomPermissionQuery{
		RoomID:         strings.TrimSpace(r.URL.Query().Get("room_id")),
		IncludeRevoked: strings.EqualFold(strings.TrimSpace(r.URL.Query().Get("include_revoked")), "true"),
		Limit:          limit,
	}
	if subject := strings.TrimSpace(r.URL.Query().Get("subject_pubkey")); subject != "" {
		validated, err := validatePubkey(subject)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request", "message": err.Error()})
			return store.RoomPermissionQuery{}, false
		}
		query.SubjectPubkey = validated
	}
	return query, true
}

func parseProofVerificationQuery(w http.ResponseWriter, r *http.Request) (store.ProofVerificationQuery, bool) {
	limit, ok := parseOptionalLimit(w, r)
	if !ok {
		return store.ProofVerificationQuery{}, false
	}

	query := store.ProofVerificationQuery{
		IncludeRevoked: strings.EqualFold(strings.TrimSpace(r.URL.Query().Get("include_revoked")), "true"),
		Limit:          limit,
	}
	if subject := strings.TrimSpace(r.URL.Query().Get("subject_pubkey")); subject != "" {
		validated, err := validatePubkey(subject)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request", "message": err.Error()})
			return store.ProofVerificationQuery{}, false
		}
		query.SubjectPubkey = validated
	}
	if proofType := strings.TrimSpace(r.URL.Query().Get("proof_type")); proofType != "" {
		validated, err := validateProofType(proofType)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request", "message": err.Error()})
			return store.ProofVerificationQuery{}, false
		}
		query.ProofType = validated
	}
	return query, true
}

func parseGatePolicyQuery(w http.ResponseWriter, r *http.Request) (store.GatePolicyQuery, bool) {
	limit, ok := parseOptionalLimit(w, r)
	if !ok {
		return store.GatePolicyQuery{}, false
	}

	query := store.GatePolicyQuery{
		Scope:          strings.TrimSpace(r.URL.Query().Get("scope")),
		IncludeRevoked: strings.EqualFold(strings.TrimSpace(r.URL.Query().Get("include_revoked")), "true"),
		Limit:          limit,
	}
	if capability := strings.TrimSpace(r.URL.Query().Get("capability")); capability != "" {
		validated, err := validateCapability(capability)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request", "message": err.Error()})
			return store.GatePolicyQuery{}, false
		}
		query.Capability = validated
	}
	return query, true
}

func parseEditorialPinQuery(w http.ResponseWriter, r *http.Request) (store.EditorialPinQuery, bool) {
	limit, ok := parseOptionalLimit(w, r)
	if !ok {
		return store.EditorialPinQuery{}, false
	}

	query := store.EditorialPinQuery{
		IncludeRevoked: strings.EqualFold(strings.TrimSpace(r.URL.Query().Get("include_revoked")), "true"),
		Limit:          limit,
	}
	if geohash := strings.TrimSpace(r.URL.Query().Get("geohash")); geohash != "" {
		validated, err := validateGeohash(geohash)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request", "message": err.Error()})
			return store.EditorialPinQuery{}, false
		}
		query.Geohash = validated
	}
	if noteID := strings.TrimSpace(r.URL.Query().Get("note_id")); noteID != "" {
		validated, err := validateNoteID(noteID)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request", "message": err.Error()})
			return store.EditorialPinQuery{}, false
		}
		query.NoteID = validated
	}
	return query, true
}

func decodeJSONBody(r *http.Request, target any) error {
	body, err := io.ReadAll(io.LimitReader(r.Body, maxJSONBodyBytes))
	if err != nil {
		return err
	}
	if len(strings.TrimSpace(string(body))) == 0 {
		return errors.New("request body is required")
	}
	if err := json.Unmarshal(body, target); err != nil {
		return err
	}
	return nil
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)

	encoder := json.NewEncoder(w)
	encoder.SetIndent("", "  ")
	_ = encoder.Encode(payload)
}
