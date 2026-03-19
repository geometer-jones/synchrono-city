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

type Server struct {
	config        config.Config
	mux           *http.ServeMux
	store         store.Store
	authVerifier  *nip98.Verifier
	tokenService  *scLiveKit.TokenService
	policyService *policy.Service
	relayAuth     *relayauth.Evaluator
	socialService *social.Service
	adminLimiter  *rateLimiter
}

func NewServer(cfg config.Config, policyStore store.Store) *Server {
	s := &Server{
		config:        cfg,
		mux:           http.NewServeMux(),
		store:         policyStore,
		authVerifier:  nip98.NewVerifier(),
		tokenService:  scLiveKit.NewTokenService(cfg, policyStore),
		policyService: policy.NewService(policyStore, cfg.PrimaryOperatorPub),
		relayAuth:     relayauth.NewEvaluator(policy.NewService(policyStore, cfg.PrimaryOperatorPub)),
		socialService: social.NewService(cfg.PrimaryOperatorPub),
		adminLimiter:  newRateLimiter(defaultAdminRateLimit, defaultAdminRateLimitWindow),
	}

	s.routes()
	return s
}

func (s *Server) Handler() http.Handler {
	return s.mux
}

func (s *Server) routes() {
	s.mux.HandleFunc("/healthz", s.handleHealthz)
	s.mux.HandleFunc("/api/v1/token", s.handleToken)
	s.mux.HandleFunc("/api/v1/social/bootstrap", s.handleSocialBootstrap)
	s.mux.HandleFunc("/api/v1/social/notes", s.handleSocialNotes)
	s.mux.HandleFunc("/api/v1/social/call-intent", s.handleSocialCallIntent)
	s.mux.HandleFunc("/api/v1/admin/policy/check", s.handleAdminPolicyCheck)
	s.mux.HandleFunc("/api/v1/admin/policies", s.handleAdminPolicies)
	s.mux.HandleFunc("/api/v1/admin/standing", s.handleAdminStanding)
	s.mux.HandleFunc("/api/v1/admin/room-permissions", s.handleAdminRoomPermissions)
	s.mux.HandleFunc("/api/v1/admin/audit", s.handleAdminAudit)
	s.mux.HandleFunc("/api/v1/relay/authorize", s.handleRelayAuthorize)
	s.mux.HandleFunc("/internal/relay/authorize", s.handleInternalRelayAuthorize)
}

func (s *Server) handleSocialBootstrap(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method_not_allowed"})
		return
	}

	writeJSON(w, http.StatusOK, s.socialService.Bootstrap())
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

	limit := 0
	if rawLimit := strings.TrimSpace(r.URL.Query().Get("limit")); rawLimit != "" {
		parsed, err := strconv.Atoi(rawLimit)
		if err != nil || parsed < 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request", "message": "limit must be a non-negative integer"})
			return
		}
		limit = parsed
	}
	entries, err := s.store.ListAuditEntries(r.Context(), limit)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "store_failure", "message": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"entries": entries})
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
