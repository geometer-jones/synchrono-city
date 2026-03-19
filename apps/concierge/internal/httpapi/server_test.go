package httpapi

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	livekitauth "github.com/livekit/protocol/auth"
	"github.com/nbd-wtf/go-nostr"
	"github.com/peterwei/synchrono-city/apps/concierge/internal/config"
	"github.com/peterwei/synchrono-city/apps/concierge/internal/store"
)

func TestHealthz(t *testing.T) {
	srv := NewServer(config.Config{
		RelayName:          "Synchrono City Local",
		PrimaryRelayURL:    "ws://localhost:8080",
		PrimaryOperatorPub: "npub1operator",
	}, store.NewMemory())

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rec := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

func TestSocialBootstrapReturnsPhaseTwoData(t *testing.T) {
	srv := NewServer(config.Config{
		PrimaryOperatorPub: "npub1operator",
	}, store.NewMemory())

	req := httptest.NewRequest(http.MethodGet, "/api/v1/social/bootstrap", nil)
	rec := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var response struct {
		RelayOperatorPubkey string `json:"relay_operator_pubkey"`
		Places              []struct {
			Geohash string `json:"geohash"`
		} `json:"places"`
		Profiles []struct {
			Pubkey string `json:"pubkey"`
		} `json:"profiles"`
		Notes []struct {
			ID string `json:"id"`
		} `json:"notes"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if response.RelayOperatorPubkey != "npub1operator" {
		t.Fatalf("expected operator pubkey, got %s", response.RelayOperatorPubkey)
	}
	if len(response.Places) == 0 || len(response.Profiles) == 0 || len(response.Notes) == 0 {
		t.Fatalf("expected seeded bootstrap data, got %+v", response)
	}
}

func TestSocialNoteCreateAppendsNewNote(t *testing.T) {
	srv := NewServer(config.Config{
		PrimaryOperatorPub: "npub1operator",
	}, store.NewMemory())

	payload := []byte(`{"geohash":"9q8yyk","author_pubkey":"npub1scout","content":"Meet at the fountain in five."}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/social/notes", bytes.NewReader(payload))
	rec := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d", rec.Code)
	}

	bootstrapReq := httptest.NewRequest(http.MethodGet, "/api/v1/social/bootstrap", nil)
	bootstrapRec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(bootstrapRec, bootstrapReq)

	var bootstrap struct {
		Notes []struct {
			Content string `json:"content"`
		} `json:"notes"`
	}
	if err := json.Unmarshal(bootstrapRec.Body.Bytes(), &bootstrap); err != nil {
		t.Fatalf("decode bootstrap: %v", err)
	}
	if bootstrap.Notes[0].Content != "Meet at the fountain in five." {
		t.Fatalf("expected newest note first, got %+v", bootstrap.Notes[0])
	}
}

func TestSocialCallIntentResolvesRoomID(t *testing.T) {
	srv := NewServer(config.Config{
		PrimaryOperatorPub: "npub1operator",
	}, store.NewMemory())

	payload := []byte(`{"geohash":"9q8yyk","pubkey":"npub1scout"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/social/call-intent", bytes.NewReader(payload))
	rec := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var response struct {
		RoomID             string   `json:"room_id"`
		ParticipantPubkeys []string `json:"participant_pubkeys"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if response.RoomID != "geo:npub1operator:9q8yyk" {
		t.Fatalf("expected room id, got %s", response.RoomID)
	}
	if len(response.ParticipantPubkeys) == 0 || response.ParticipantPubkeys[0] != "npub1scout" {
		t.Fatalf("expected current user in participant list, got %+v", response.ParticipantPubkeys)
	}
}

func TestTokenRequiresNIP98Header(t *testing.T) {
	srv := NewServer(config.Config{}, store.NewMemory())

	req := httptest.NewRequest(http.MethodPost, "/api/v1/token", nil)
	rec := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestAdminPolicyCheckAllowsStubbedOperator(t *testing.T) {
	srv := NewServer(config.Config{
		PrimaryOperatorPub: mustPublicKey(t, operatorSecretKey(t)),
	}, store.NewMemory())

	req := httptest.NewRequest(http.MethodPost, "http://example.com/api/v1/admin/policy/check", nil)
	withNIP98Auth(t, req, operatorSecretKey(t), nil)
	rec := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

func TestAdminStandingEnablesRelayAuthorization(t *testing.T) {
	policyStore := store.NewMemory()
	srv := NewServer(config.Config{
		PrimaryOperatorPub: mustPublicKey(t, operatorSecretKey(t)),
	}, policyStore)

	standingPayload := []byte(`{"subject_pubkey":"npub1member","standing":"member","scope":"relay"}`)
	standingReq := httptest.NewRequest(http.MethodPost, "http://example.com/api/v1/admin/standing", bytes.NewReader(standingPayload))
	withNIP98Auth(t, standingReq, operatorSecretKey(t), standingPayload)
	standingRec := httptest.NewRecorder()

	srv.Handler().ServeHTTP(standingRec, standingReq)

	if standingRec.Code != http.StatusCreated {
		t.Fatalf("expected standing create 201, got %d", standingRec.Code)
	}

	authPayload := []byte(`{"subject_pubkey":"npub1member","capability":"relay.publish"}`)
	authReq := httptest.NewRequest(http.MethodPost, "/api/v1/relay/authorize", bytes.NewReader(authPayload))
	authRec := httptest.NewRecorder()

	srv.Handler().ServeHTTP(authRec, authReq)

	if authRec.Code != http.StatusOK {
		t.Fatalf("expected authorization 200, got %d", authRec.Code)
	}
}

func TestTokenRequiresRoomPermission(t *testing.T) {
	policyStore := store.NewMemory()
	srv := NewServer(config.Config{
		LiveKitAPIKey:      "devkey",
		LiveKitAPISecret:   "devsecret",
		LiveKitURL:         "ws://livekit.example.test",
		PrimaryOperatorPub: mustPublicKey(t, operatorSecretKey(t)),
	}, policyStore)

	roomPermissionPayload := []byte(`{
	  "subject_pubkey":"` + mustPublicKey(t, guestSecretKey(t)) + `",
	  "room_id":"geo:npub1operator:9q8yyk",
	  "can_join":true,
	  "can_publish":false,
	  "can_subscribe":true
	}`)
	roomReq := httptest.NewRequest(http.MethodPost, "http://example.com/api/v1/admin/room-permissions", bytes.NewReader(roomPermissionPayload))
	withNIP98Auth(t, roomReq, operatorSecretKey(t), roomPermissionPayload)
	roomRec := httptest.NewRecorder()

	srv.Handler().ServeHTTP(roomRec, roomReq)

	if roomRec.Code != http.StatusCreated {
		t.Fatalf("expected room permission create 201, got %d", roomRec.Code)
	}

	tokenPayload := []byte(`{"room_id":"geo:npub1operator:9q8yyk"}`)
	tokenReq := httptest.NewRequest(http.MethodPost, "http://example.com/api/v1/token", bytes.NewReader(tokenPayload))
	withNIP98Auth(t, tokenReq, guestSecretKey(t), tokenPayload)
	tokenRec := httptest.NewRecorder()

	srv.Handler().ServeHTTP(tokenRec, tokenReq)

	if tokenRec.Code != http.StatusOK {
		t.Fatalf("expected token request 200, got %d", tokenRec.Code)
	}

	var response struct {
		Token struct {
			Token      string `json:"token"`
			Identity   string `json:"identity"`
			RoomID     string `json:"room_id"`
			LiveKitURL string `json:"livekit_url"`
			Grants     struct {
				RoomJoin     bool `json:"room_join"`
				CanPublish   bool `json:"can_publish"`
				CanSubscribe bool `json:"can_subscribe"`
			} `json:"grants"`
		} `json:"token"`
	}
	if err := json.Unmarshal(tokenRec.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if response.Token.Identity != mustPublicKey(t, guestSecretKey(t)) {
		t.Fatalf("expected identity %s, got %s", mustPublicKey(t, guestSecretKey(t)), response.Token.Identity)
	}
	if response.Token.RoomID != "geo:npub1operator:9q8yyk" {
		t.Fatalf("expected room id, got %s", response.Token.RoomID)
	}
	if response.Token.LiveKitURL != "ws://livekit.example.test" {
		t.Fatalf("expected livekit url, got %s", response.Token.LiveKitURL)
	}
	if !response.Token.Grants.RoomJoin || response.Token.Grants.CanPublish || !response.Token.Grants.CanSubscribe {
		t.Fatalf("unexpected grants: %+v", response.Token.Grants)
	}

	verifier, err := livekitauth.ParseAPIToken(response.Token.Token)
	if err != nil {
		t.Fatalf("parse livekit token: %v", err)
	}
	if verifier.APIKey() != "devkey" {
		t.Fatalf("expected api key devkey, got %s", verifier.APIKey())
	}
	if verifier.Identity() != mustPublicKey(t, guestSecretKey(t)) {
		t.Fatalf("expected token identity %s, got %s", mustPublicKey(t, guestSecretKey(t)), verifier.Identity())
	}
	_, grants, err := verifier.Verify("devsecret")
	if err != nil {
		t.Fatalf("verify livekit token: %v", err)
	}
	if grants.Video == nil || grants.Video.Room != "geo:npub1operator:9q8yyk" || !grants.Video.RoomJoin {
		t.Fatalf("unexpected video grants: %+v", grants.Video)
	}
	if grants.Video.CanPublish == nil || *grants.Video.CanPublish {
		t.Fatalf("expected canPublish false, got %+v", grants.Video.CanPublish)
	}
	if grants.Video.CanSubscribe == nil || !*grants.Video.CanSubscribe {
		t.Fatalf("expected canSubscribe true, got %+v", grants.Video.CanSubscribe)
	}
}

func TestOperatorTokenGetsFullRoomGrants(t *testing.T) {
	operatorPubkey := mustPublicKey(t, operatorSecretKey(t))
	srv := NewServer(config.Config{
		LiveKitAPIKey:      "devkey",
		LiveKitAPISecret:   "devsecret",
		LiveKitURL:         "ws://livekit.example.test",
		PrimaryOperatorPub: operatorPubkey,
	}, store.NewMemory())

	tokenPayload := []byte(`{"room_id":"geo:` + operatorPubkey + `:9q8yyk"}`)
	tokenReq := httptest.NewRequest(http.MethodPost, "http://example.com/api/v1/token", bytes.NewReader(tokenPayload))
	withNIP98Auth(t, tokenReq, operatorSecretKey(t), tokenPayload)
	tokenRec := httptest.NewRecorder()

	srv.Handler().ServeHTTP(tokenRec, tokenReq)

	if tokenRec.Code != http.StatusOK {
		t.Fatalf("expected token request 200, got %d", tokenRec.Code)
	}

	var response struct {
		Token struct {
			Token string `json:"token"`
		} `json:"token"`
	}
	if err := json.Unmarshal(tokenRec.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	verifier, err := livekitauth.ParseAPIToken(response.Token.Token)
	if err != nil {
		t.Fatalf("parse livekit token: %v", err)
	}
	_, grants, err := verifier.Verify("devsecret")
	if err != nil {
		t.Fatalf("verify livekit token: %v", err)
	}
	if grants.Video == nil || grants.Video.CanPublish == nil || !*grants.Video.CanPublish {
		t.Fatalf("expected operator publish grant, got %+v", grants.Video)
	}
	if grants.Video.CanSubscribe == nil || !*grants.Video.CanSubscribe {
		t.Fatalf("expected operator subscribe grant, got %+v", grants.Video)
	}
}

func TestAdminRequestRejectsInvalidPayloadHash(t *testing.T) {
	srv := NewServer(config.Config{
		PrimaryOperatorPub: mustPublicKey(t, operatorSecretKey(t)),
	}, store.NewMemory())

	payload := []byte(`{"subject_pubkey":"npub1member","standing":"member","scope":"relay"}`)
	req := httptest.NewRequest(http.MethodPost, "http://example.com/api/v1/admin/standing", bytes.NewReader(payload))
	req.Header.Set("Authorization", "Nostr "+encodeEvent(t, signedNIP98Event(
		t,
		operatorSecretKey(t),
		req,
		[]byte(`{"different":"payload"}`),
		time.Now(),
	)))
	rec := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestAdminRequestRejectsStaleEvent(t *testing.T) {
	srv := NewServer(config.Config{
		PrimaryOperatorPub: mustPublicKey(t, operatorSecretKey(t)),
	}, store.NewMemory())

	req := httptest.NewRequest(http.MethodPost, "http://example.com/api/v1/admin/policy/check", nil)
	event := signedNIP98Event(t, operatorSecretKey(t), req, nil, time.Now().Add(-2*time.Minute))
	req.Header.Set("Authorization", "Nostr "+encodeEvent(t, event))
	rec := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestAdminStandingRejectsInvalidStanding(t *testing.T) {
	srv := NewServer(config.Config{
		PrimaryOperatorPub: mustPublicKey(t, operatorSecretKey(t)),
	}, store.NewMemory())

	payload := []byte(`{"subject_pubkey":"npub1member","standing":"superadmin","scope":"relay"}`)
	req := httptest.NewRequest(http.MethodPost, "http://example.com/api/v1/admin/standing", bytes.NewReader(payload))
	withNIP98Auth(t, req, operatorSecretKey(t), payload)
	rec := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestAdminRateLimitReturns429(t *testing.T) {
	srv := NewServer(config.Config{
		PrimaryOperatorPub: mustPublicKey(t, operatorSecretKey(t)),
	}, store.NewMemory())
	srv.adminLimiter = newRateLimiter(1, time.Minute)

	for attempt := range 2 {
		req := httptest.NewRequest(http.MethodPost, "http://example.com/api/v1/admin/policy/check", nil)
		withNIP98Auth(t, req, operatorSecretKey(t), nil)
		rec := httptest.NewRecorder()

		srv.Handler().ServeHTTP(rec, req)

		expectedStatus := http.StatusOK
		if attempt == 1 {
			expectedStatus = http.StatusTooManyRequests
		}
		if rec.Code != expectedStatus {
			t.Fatalf("attempt %d expected %d, got %d", attempt+1, expectedStatus, rec.Code)
		}
	}
}

func TestInternalRelayAuthorizeReturnsProtocolContract(t *testing.T) {
	policyStore := store.NewMemory()
	_, err := policyStore.CreatePolicyAssignment(t.Context(), store.PolicyAssignment{
		SubjectPubkey:   "blocked-pubkey",
		PolicyType:      "block",
		Scope:           "relay",
		GrantedByPubkey: "operator",
	})
	if err != nil {
		t.Fatalf("seed block policy: %v", err)
	}

	srv := NewServer(config.Config{
		PrimaryOperatorPub: "operator",
	}, policyStore)

	payload := []byte(`{
	  "action":"publish",
	  "scope":"relay",
	  "pubkey":"blocked-pubkey",
	  "event":{"id":"event-1","kind":1,"created_at":1773356400,"tags":[["p","peer"]]}
	}`)
	req := httptest.NewRequest(http.MethodPost, "http://example.com/internal/relay/authorize", bytes.NewReader(payload))
	rec := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var response struct {
		Allow  bool   `json:"allow"`
		Reason string `json:"reason"`
		Scope  string `json:"scope"`
		Policy struct {
			Publish struct {
				Allowed bool   `json:"allowed"`
				Reason  string `json:"reason"`
				Mode    string `json:"mode"`
			} `json:"publish"`
		} `json:"policy"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if response.Allow {
		t.Fatalf("expected blocked response")
	}
	if response.Reason != "blocked" || response.Scope != "relay" {
		t.Fatalf("unexpected response: %+v", response)
	}
	if response.Policy.Publish.Allowed || response.Policy.Publish.Reason != "blocked" || response.Policy.Publish.Mode != "open" {
		t.Fatalf("unexpected publish policy: %+v", response.Policy.Publish)
	}
}

var (
	operatorSK string
	guestSK    string
)

func operatorSecretKey(t *testing.T) string {
	t.Helper()
	if operatorSK == "" {
		operatorSK = nostr.GeneratePrivateKey()
	}
	return operatorSK
}

func guestSecretKey(t *testing.T) string {
	t.Helper()
	if guestSK == "" {
		guestSK = nostr.GeneratePrivateKey()
	}
	return guestSK
}

func mustPublicKey(t *testing.T, secretKey string) string {
	t.Helper()
	pubkey, err := nostr.GetPublicKey(secretKey)
	if err != nil {
		t.Fatalf("derive public key: %v", err)
	}
	return pubkey
}

func withNIP98Auth(t *testing.T, req *http.Request, secretKey string, body []byte) {
	t.Helper()
	req.Header.Set("Authorization", "Nostr "+encodeEvent(t, signedNIP98Event(t, secretKey, req, body, time.Now())))
	if body != nil {
		req.Body = ioNopCloser(body)
	}
}

func signedNIP98Event(t *testing.T, secretKey string, req *http.Request, body []byte, createdAt time.Time) nostr.Event {
	t.Helper()
	pubkey := mustPublicKey(t, secretKey)

	event := nostr.Event{
		PubKey:    pubkey,
		CreatedAt: nostr.Timestamp(createdAt.Unix()),
		Kind:      27235,
		Content:   "",
		Tags: nostr.Tags{
			{"u", req.URL.String()},
			{"method", req.Method},
		},
	}
	if len(body) > 0 {
		sum := sha256.Sum256(body)
		event.Tags = append(event.Tags, nostr.Tag{"payload", hex.EncodeToString(sum[:])})
	}

	if err := event.Sign(secretKey); err != nil {
		t.Fatalf("sign event: %v", err)
	}
	return event
}

func encodeEvent(t *testing.T, event nostr.Event) string {
	t.Helper()
	payload, err := json.Marshal(event)
	if err != nil {
		t.Fatalf("marshal event: %v", err)
	}
	return base64.StdEncoding.EncodeToString(payload)
}

func ioNopCloser(body []byte) *readCloser {
	return &readCloser{Reader: bytes.NewReader(body)}
}

type readCloser struct {
	*bytes.Reader
}

func (r *readCloser) Close() error {
	return nil
}
