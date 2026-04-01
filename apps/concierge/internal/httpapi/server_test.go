package httpapi

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"reflect"
	"testing"
	"time"
	"unsafe"

	livekitauth "github.com/livekit/protocol/auth"
	"github.com/nbd-wtf/go-nostr"
	"github.com/nbd-wtf/go-nostr/nip19"
	"github.com/peterwei/synchrono-city/apps/concierge/internal/config"
	scLiveKit "github.com/peterwei/synchrono-city/apps/concierge/internal/livekit"
	"github.com/peterwei/synchrono-city/apps/concierge/internal/social"
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
	if origin := rec.Header().Get("Access-Control-Allow-Origin"); origin != "*" {
		t.Fatalf("expected CORS header, got %q", origin)
	}
}

func TestCORSPreflightReturnsNoContent(t *testing.T) {
	srv := NewServer(config.Config{}, store.NewMemory())

	req := httptest.NewRequest(http.MethodOptions, "/api/v1/social/call-intent", nil)
	req.Header.Set("Origin", "http://localhost:5173")
	req.Header.Set("Access-Control-Request-Method", http.MethodPost)
	req.Header.Set("Access-Control-Request-Headers", "content-type")
	rec := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", rec.Code)
	}
	if origin := rec.Header().Get("Access-Control-Allow-Origin"); origin != "*" {
		t.Fatalf("expected wildcard origin, got %q", origin)
	}
	if methods := rec.Header().Get("Access-Control-Allow-Methods"); methods != "GET, POST, OPTIONS" {
		t.Fatalf("expected allowed methods, got %q", methods)
	}
	if headers := rec.Header().Get("Access-Control-Allow-Headers"); headers != "Authorization, Content-Type" {
		t.Fatalf("expected allowed headers, got %q", headers)
	}
}

func TestSocialBootstrapReturnsPhaseSixData(t *testing.T) {
	srv := NewServer(config.Config{
		PrimaryOperatorPub: "npub1operator",
	}, store.NewMemory())

	seedSocialScene(t, srv,
		[]social.Place{{
			Geohash:         "9q8yyk",
			Title:           "Civic plaza",
			OccupantPubkeys: []string{"npub1aurora"},
		}},
		[]social.Profile{{
			Pubkey:      "npub1aurora",
			DisplayName: "Aurora Vale",
			Role:        "Tenant organizer",
			Status:      "Coordinating arrivals.",
			Bio:         "Local organizer.",
		}},
		[]social.Note{{
			ID:           "note-plaza",
			Geohash:      "9q8yyk",
			AuthorPubkey: "npub1aurora",
			Content:      "The plaza is active.",
			CreatedAt:    "2026-03-18T18:20:00Z",
		}},
		[]social.CrossRelayFeedItem{{
			ID:           "cross-relay-plaza",
			RelayName:    "Mission Mesh",
			RelayURL:     "wss://mission-mesh.example/relay",
			AuthorPubkey: "npub1remote",
			AuthorName:   "Remote Scout",
			Geohash:      "9q8yyk",
			PlaceTitle:   "Civic plaza",
			Content:      "Cross-relay context.",
			PublishedAt:  "2026-03-18T18:12:00Z",
			SourceLabel:  "Direct follow",
			WhyVisible:   "Same active tile.",
		}},
	)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/social/bootstrap", nil)
	rec := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var response struct {
		RelayName           string `json:"relay_name"`
		RelayOperatorPubkey string `json:"relay_operator_pubkey"`
		RelayURL            string `json:"relay_url"`
		Places              []struct {
			Geohash string `json:"geohash"`
		} `json:"places"`
		Profiles []struct {
			Pubkey string `json:"pubkey"`
		} `json:"profiles"`
		Notes []struct {
			ID string `json:"id"`
		} `json:"notes"`
		CrossRelayItems []struct {
			ID        string `json:"id"`
			RelayName string `json:"relay_name"`
		} `json:"cross_relay_items"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if response.RelayOperatorPubkey != "npub1operator" {
		t.Fatalf("expected operator pubkey, got %s", response.RelayOperatorPubkey)
	}
	if response.RelayName == "" || response.RelayURL == "" {
		t.Fatalf("expected relay metadata, got name=%q url=%q", response.RelayName, response.RelayURL)
	}
	if len(response.Places) != 1 || len(response.Profiles) != 1 || len(response.Notes) != 1 {
		t.Fatalf("expected only explicitly seeded social data, got %+v", response)
	}
	if len(response.CrossRelayItems) == 0 || response.CrossRelayItems[0].RelayName == "" {
		t.Fatalf("expected seeded cross-relay data, got %+v", response.CrossRelayItems)
	}
}

func TestSocialBeaconCreateOrReturnExisting(t *testing.T) {
	srv := NewServer(config.Config{
		PrimaryOperatorPub: "npub1operator",
	}, store.NewMemory())

	createPayload := []byte(`{"geohash":"9q8yyk34","name":"Lantern Point","pic":"https://example.com/beacon.png","about":"Meet after sunset."}`)
	createReq := httptest.NewRequest(http.MethodPost, "/api/v1/social/beacons", bytes.NewReader(createPayload))
	createRec := httptest.NewRecorder()

	srv.Handler().ServeHTTP(createRec, createReq)

	if createRec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d body=%s", createRec.Code, createRec.Body.String())
	}

	var createdResponse struct {
		Created bool `json:"created"`
		Beacon  struct {
			Geohash string `json:"geohash"`
			Title   string `json:"title"`
			Picture string `json:"picture"`
		} `json:"beacon"`
	}
	if err := json.Unmarshal(createRec.Body.Bytes(), &createdResponse); err != nil {
		t.Fatalf("decode create response: %v", err)
	}
	if !createdResponse.Created {
		t.Fatal("expected created response")
	}
	if createdResponse.Beacon.Geohash != "9q8yyk34" || createdResponse.Beacon.Title != "Lantern Point" {
		t.Fatalf("unexpected beacon payload: %+v", createdResponse.Beacon)
	}
	if createdResponse.Beacon.Picture != "https://example.com/beacon.png" {
		t.Fatalf("expected beacon picture, got %+v", createdResponse.Beacon)
	}

	duplicatePayload := []byte(`{"geohash":"9q8yyk34","name":"Duplicate","pic":"","about":"Ignored"}`)
	duplicateReq := httptest.NewRequest(http.MethodPost, "/api/v1/social/beacons", bytes.NewReader(duplicatePayload))
	duplicateRec := httptest.NewRecorder()

	srv.Handler().ServeHTTP(duplicateRec, duplicateReq)

	if duplicateRec.Code != http.StatusOK {
		t.Fatalf("expected 200 for duplicate create, got %d body=%s", duplicateRec.Code, duplicateRec.Body.String())
	}

	var duplicateResponse struct {
		Created bool `json:"created"`
		Beacon  struct {
			Title string `json:"title"`
		} `json:"beacon"`
	}
	if err := json.Unmarshal(duplicateRec.Body.Bytes(), &duplicateResponse); err != nil {
		t.Fatalf("decode duplicate response: %v", err)
	}
	if duplicateResponse.Created {
		t.Fatal("expected duplicate response to reuse existing beacon")
	}
	if duplicateResponse.Beacon.Title != "Lantern Point" {
		t.Fatalf("expected original beacon title, got %+v", duplicateResponse.Beacon)
	}
}

func TestSocialBeaconCreateGrantsCreatorRoomAccess(t *testing.T) {
	creatorPubkey := mustPublicKeyNpub(t, guestSecretKey(t))
	policyStore := store.NewMemory()
	srv := NewServer(config.Config{
		LiveKitAPIKey:      "devkey",
		LiveKitAPISecret:   "devsecret",
		LiveKitURL:         "ws://livekit.example.test",
		PrimaryOperatorPub: mustPublicKey(t, operatorSecretKey(t)),
	}, policyStore)

	createPayload := []byte(`{"geohash":"9q8yyk34","name":"Lantern Point","pic":"","about":"Meet after sunset.","tags":["cohort"],"pubkey":"` + creatorPubkey + `"}`)
	createReq := httptest.NewRequest(http.MethodPost, "/api/v1/social/beacons", bytes.NewReader(createPayload))
	createRec := httptest.NewRecorder()

	srv.Handler().ServeHTTP(createRec, createReq)

	if createRec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d body=%s", createRec.Code, createRec.Body.String())
	}

	tokenPayload := []byte(`{"room_id":"beacon:9q8yyk34"}`)
	tokenReq := httptest.NewRequest(http.MethodPost, "http://example.com/api/v1/token", bytes.NewReader(tokenPayload))
	withNIP98Auth(t, tokenReq, guestSecretKey(t), tokenPayload)
	tokenRec := httptest.NewRecorder()

	srv.Handler().ServeHTTP(tokenRec, tokenReq)

	if tokenRec.Code != http.StatusOK {
		t.Fatalf("expected token request 200, got %d body=%s", tokenRec.Code, tokenRec.Body.String())
	}

	var response struct {
		Reason string `json:"reason"`
		Token  struct {
			Grants struct {
				CanPublish   bool `json:"can_publish"`
				CanSubscribe bool `json:"can_subscribe"`
			} `json:"grants"`
		} `json:"token"`
	}
	if err := json.Unmarshal(tokenRec.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if response.Reason != "room_permission" {
		t.Fatalf("expected room_permission reason, got %s", response.Reason)
	}
	if !response.Token.Grants.CanPublish || !response.Token.Grants.CanSubscribe {
		t.Fatalf("expected creator speaker grants, got %+v", response.Token.Grants)
	}
}

func TestSocialNoteCreateAppendsNewNote(t *testing.T) {
	srv := NewServer(config.Config{
		PrimaryOperatorPub: "npub1operator",
	}, store.NewMemory())
	seedSocialScene(t, srv, []social.Place{{Geohash: "9q8yyk", Title: "Civic plaza"}}, nil, nil, nil)

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
	if len(bootstrap.Notes) != 1 {
		t.Fatalf("expected created note only, got %+v", bootstrap.Notes)
	}
	if bootstrap.Notes[0].Content != "Meet at the fountain in five." {
		t.Fatalf("expected newest note first, got %+v", bootstrap.Notes[0])
	}
}

func TestSocialNoteCreateAllowsAdHocGeohash(t *testing.T) {
	srv := NewServer(config.Config{
		PrimaryOperatorPub: "npub1operator",
	}, store.NewMemory())

	payload := []byte(`{"geohash":"9q8yyz","author_pubkey":"npub1scout","content":"Ad-hoc tile note."}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/social/notes", bytes.NewReader(payload))
	rec := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d body=%s", rec.Code, rec.Body.String())
	}

	bootstrapReq := httptest.NewRequest(http.MethodGet, "/api/v1/social/bootstrap", nil)
	bootstrapRec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(bootstrapRec, bootstrapReq)

	var bootstrap struct {
		Places []struct {
			Geohash string `json:"geohash"`
			Title   string `json:"title"`
		} `json:"places"`
		Notes []struct {
			Geohash string `json:"geohash"`
			Content string `json:"content"`
		} `json:"notes"`
	}
	if err := json.Unmarshal(bootstrapRec.Body.Bytes(), &bootstrap); err != nil {
		t.Fatalf("decode bootstrap: %v", err)
	}
	if len(bootstrap.Places) != 1 || bootstrap.Places[0].Geohash != "9q8yyz" {
		t.Fatalf("expected ad-hoc place in bootstrap, got %+v", bootstrap.Places)
	}
	if bootstrap.Places[0].Title != "Field tile 9q8yyz" {
		t.Fatalf("expected ad-hoc place title, got %+v", bootstrap.Places[0])
	}
	if len(bootstrap.Notes) != 1 || bootstrap.Notes[0].Geohash != "9q8yyz" {
		t.Fatalf("expected ad-hoc note in bootstrap, got %+v", bootstrap.Notes)
	}
}

func TestSocialCallIntentResolvesRoomID(t *testing.T) {
	srv := NewServer(config.Config{
		PrimaryOperatorPub: "npub1operator",
	}, store.NewMemory())
	seedSocialScene(t, srv, []social.Place{{
		Geohash:         "9q8yyk",
		Title:           "Civic plaza",
		OccupantPubkeys: []string{"npub1aurora"},
	}}, nil, nil, nil)

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
	if response.RoomID != "beacon:9q8yyk" {
		t.Fatalf("expected room id, got %s", response.RoomID)
	}
	if len(response.ParticipantPubkeys) == 0 || response.ParticipantPubkeys[0] != "npub1scout" {
		t.Fatalf("expected current user in participant list, got %+v", response.ParticipantPubkeys)
	}
}

func TestSocialCallIntentCreatesAdHocRoomID(t *testing.T) {
	srv := NewServer(config.Config{
		PrimaryOperatorPub: "npub1operator",
	}, store.NewMemory())

	payload := []byte(`{"geohash":"9q8yyz","pubkey":"npub1wanderer"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/social/call-intent", bytes.NewReader(payload))
	rec := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var response struct {
		RoomID             string   `json:"room_id"`
		PlaceTitle         string   `json:"place_title"`
		ParticipantPubkeys []string `json:"participant_pubkeys"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if response.RoomID != "beacon:9q8yyz" {
		t.Fatalf("expected room id, got %s", response.RoomID)
	}
	if response.PlaceTitle != "Field tile 9q8yyz" {
		t.Fatalf("expected ad-hoc place title, got %s", response.PlaceTitle)
	}
	if len(response.ParticipantPubkeys) != 1 || response.ParticipantPubkeys[0] != "npub1wanderer" {
		t.Fatalf("expected caller-only participant list, got %+v", response.ParticipantPubkeys)
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

func TestAdminPoliciesListFiltersByPolicyType(t *testing.T) {
	policyStore := store.NewMemory()
	operatorPubkey := mustPublicKey(t, operatorSecretKey(t))
	srv := NewServer(config.Config{
		PrimaryOperatorPub: operatorPubkey,
	}, policyStore)

	for _, record := range []store.PolicyAssignment{
		{SubjectPubkey: "npub1guest", PolicyType: "guest", GrantedByPubkey: operatorPubkey},
		{SubjectPubkey: "npub1blocked", PolicyType: "block", GrantedByPubkey: operatorPubkey},
	} {
		if _, err := policyStore.CreatePolicyAssignment(t.Context(), record); err != nil {
			t.Fatalf("seed policy assignment: %v", err)
		}
	}

	req := httptest.NewRequest(http.MethodGet, "http://example.com/api/v1/admin/policies?policy_type=guest", nil)
	withNIP98Auth(t, req, operatorSecretKey(t), nil)
	rec := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var response struct {
		Entries []store.PolicyAssignment `json:"entries"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(response.Entries) != 1 || response.Entries[0].PolicyType != "guest" {
		t.Fatalf("unexpected entries: %+v", response.Entries)
	}
}

func TestAdminRoomPermissionsListFiltersByRoomID(t *testing.T) {
	policyStore := store.NewMemory()
	operatorPubkey := mustPublicKey(t, operatorSecretKey(t))
	srv := NewServer(config.Config{
		PrimaryOperatorPub: operatorPubkey,
	}, policyStore)

	for _, record := range []store.RoomPermission{
		{
			SubjectPubkey:   "npub1member",
			RoomID:          "geo:npub1operator:9q8yyk",
			CanJoin:         true,
			CanSubscribe:    true,
			GrantedByPubkey: operatorPubkey,
		},
		{
			SubjectPubkey:   "npub1other",
			RoomID:          "geo:npub1operator:9q8yym",
			CanJoin:         true,
			CanSubscribe:    true,
			GrantedByPubkey: operatorPubkey,
		},
	} {
		if _, err := policyStore.CreateRoomPermission(t.Context(), record); err != nil {
			t.Fatalf("seed room permission: %v", err)
		}
	}

	req := httptest.NewRequest(http.MethodGet, "http://example.com/api/v1/admin/room-permissions?room_id=geo:npub1operator:9q8yyk", nil)
	withNIP98Auth(t, req, operatorSecretKey(t), nil)
	rec := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var response struct {
		Entries []store.RoomPermission `json:"entries"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(response.Entries) != 1 || response.Entries[0].RoomID != "geo:npub1operator:9q8yyk" {
		t.Fatalf("unexpected entries: %+v", response.Entries)
	}
}

func TestAdminAuditReturnsCursorPagination(t *testing.T) {
	policyStore := store.NewMemory()
	operatorPubkey := mustPublicKey(t, operatorSecretKey(t))
	srv := NewServer(config.Config{
		PrimaryOperatorPub: operatorPubkey,
	}, policyStore)

	baseTime := time.Date(2026, 3, 20, 8, 0, 0, 0, time.UTC)
	for index := 0; index < 3; index++ {
		if _, err := policyStore.CreateAuditEntry(t.Context(), store.AuditEntry{
			ActorPubkey:  operatorPubkey,
			Action:       "policy.assignment.created",
			TargetPubkey: "npub1member",
			Scope:        "relay",
			Metadata:     map[string]string{"sequence": string(rune('1' + index))},
			CreatedAt:    baseTime.Add(time.Duration(index) * time.Minute),
		}); err != nil {
			t.Fatalf("seed audit entry: %v", err)
		}
	}

	req := httptest.NewRequest(http.MethodGet, "http://example.com/api/v1/admin/audit?limit=2", nil)
	withNIP98Auth(t, req, operatorSecretKey(t), nil)
	rec := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var pageOne store.AuditEntryPage
	if err := json.Unmarshal(rec.Body.Bytes(), &pageOne); err != nil {
		t.Fatalf("decode page one: %v", err)
	}
	if len(pageOne.Entries) != 2 || pageOne.NextCursor == "" {
		t.Fatalf("unexpected page one: %+v", pageOne)
	}

	nextReq := httptest.NewRequest(http.MethodGet, "http://example.com/api/v1/admin/audit?limit=2&cursor="+pageOne.NextCursor, nil)
	withNIP98Auth(t, nextReq, operatorSecretKey(t), nil)
	nextRec := httptest.NewRecorder()

	srv.Handler().ServeHTTP(nextRec, nextReq)

	if nextRec.Code != http.StatusOK {
		t.Fatalf("expected page two 200, got %d", nextRec.Code)
	}

	var pageTwo store.AuditEntryPage
	if err := json.Unmarshal(nextRec.Body.Bytes(), &pageTwo); err != nil {
		t.Fatalf("decode page two: %v", err)
	}
	if len(pageTwo.Entries) != 1 || pageTwo.NextCursor != "" {
		t.Fatalf("unexpected page two: %+v", pageTwo)
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
	  "room_id":"beacon:9q8yyk",
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

	tokenPayload := []byte(`{"room_id":"beacon:9q8yyk"}`)
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
	if response.Token.RoomID != "beacon:9q8yyk" {
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
	if grants.Video == nil || grants.Video.Room != "beacon:9q8yyk" || !grants.Video.RoomJoin {
		t.Fatalf("unexpected video grants: %+v", grants.Video)
	}
	if grants.Video.CanPublish == nil || *grants.Video.CanPublish {
		t.Fatalf("expected canPublish false, got %+v", grants.Video.CanPublish)
	}
	if grants.Video.CanSubscribe == nil || !*grants.Video.CanSubscribe {
		t.Fatalf("expected canSubscribe true, got %+v", grants.Video.CanSubscribe)
	}
}

func TestTokenAllowsJoinWhenOAuthIsConfiguredButNoGatePolicyRequiresIt(t *testing.T) {
	policyStore := store.NewMemory()
	srv := NewServer(config.Config{
		LiveKitAPIKey:      "devkey",
		LiveKitAPISecret:   "devsecret",
		LiveKitURL:         "ws://livekit.example.test",
		PrimaryOperatorPub: mustPublicKey(t, operatorSecretKey(t)),
		SessionSecret:      "session-secret",
		OAuthIssuerURL:     "https://issuer.example.test",
		OAuthClientID:      "client-id",
		OAuthClientSecret:  "client-secret",
		OAuthRedirectURL:   "http://example.com/api/v1/oauth/callback",
	}, policyStore)
	seedSocialScene(t, srv,
		[]social.Place{{
			Geohash: "9q8yyk",
			Title:   "Civic Plaza",
			Tags:    []string{"beacon"},
		}},
		nil,
		nil,
		nil,
	)

	tokenPayload := []byte(`{"room_id":"beacon:9q8yyk"}`)
	tokenReq := httptest.NewRequest(http.MethodPost, "http://example.com/api/v1/token", bytes.NewReader(tokenPayload))
	withNIP98Auth(t, tokenReq, guestSecretKey(t), tokenPayload)
	tokenRec := httptest.NewRecorder()

	srv.Handler().ServeHTTP(tokenRec, tokenReq)

	if tokenRec.Code != http.StatusOK {
		t.Fatalf("expected token request 200, got %d body=%s", tokenRec.Code, tokenRec.Body.String())
	}

	var response struct {
		Decision string `json:"decision"`
		Reason   string `json:"reason"`
		Token    struct {
			RoomID string `json:"room_id"`
			Grants struct {
				RoomJoin     bool `json:"room_join"`
				CanPublish   bool `json:"can_publish"`
				CanSubscribe bool `json:"can_subscribe"`
			} `json:"grants"`
		} `json:"token"`
	}
	if err := json.Unmarshal(tokenRec.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if response.Decision != "allow" || response.Reason != "room_default_listener" {
		t.Fatalf("expected room_default_listener allow, got %+v", response)
	}
	if response.Token.RoomID != "beacon:9q8yyk" {
		t.Fatalf("expected room id beacon:9q8yyk, got %+v", response.Token)
	}
	if !response.Token.Grants.RoomJoin || !response.Token.Grants.CanPublish || !response.Token.Grants.CanSubscribe {
		t.Fatalf("unexpected grants: %+v", response.Token.Grants)
	}
}

func TestOAuthCallbackCreatesProofAndSelfProofsListReturnsIt(t *testing.T) {
	var provider *httptest.Server
	provider = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/.well-known/openid-configuration":
			_ = json.NewEncoder(w).Encode(map[string]string{
				"issuer":                 provider.URL,
				"authorization_endpoint": provider.URL + "/authorize",
				"token_endpoint":         provider.URL + "/token",
				"userinfo_endpoint":      provider.URL + "/userinfo",
			})
		case "/token":
			_ = r.ParseForm()
			if got := r.Form.Get("code"); got != "good-code" {
				t.Fatalf("expected code good-code, got %q", got)
			}
			_ = json.NewEncoder(w).Encode(map[string]string{
				"access_token": "provider-access-token",
				"token_type":   "Bearer",
			})
		case "/userinfo":
			if got := r.Header.Get("Authorization"); got != "Bearer provider-access-token" {
				t.Fatalf("expected bearer token, got %q", got)
			}
			_ = json.NewEncoder(w).Encode(map[string]string{
				"sub":                "user-123",
				"preferred_username": "fieldscout",
				"email":              "fieldscout@example.com",
				"name":               "Field Scout",
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer provider.Close()

	policyStore := store.NewMemory()
	srv := NewServer(config.Config{
		PrimaryOperatorPub: "operator",
		SessionSecret:      "session-secret",
		OAuthIssuerURL:     provider.URL,
		OAuthClientID:      "client-id",
		OAuthClientSecret:  "client-secret",
		OAuthRedirectURL:   "http://example.com/api/v1/oauth/callback",
	}, policyStore)

	startPayload := []byte(`{"return_to":"/app/settings?from=test"}`)
	startReq := httptest.NewRequest(http.MethodPost, "http://example.com/api/v1/oauth/start", bytes.NewReader(startPayload))
	startReq.Header.Set("Origin", "http://client.example.test")
	withNIP98Auth(t, startReq, guestSecretKey(t), startPayload)
	startRec := httptest.NewRecorder()

	srv.Handler().ServeHTTP(startRec, startReq)

	if startRec.Code != http.StatusOK {
		t.Fatalf("expected oauth start 200, got %d body=%s", startRec.Code, startRec.Body.String())
	}

	var startResponse struct {
		AuthorizationURL string `json:"authorization_url"`
	}
	if err := json.Unmarshal(startRec.Body.Bytes(), &startResponse); err != nil {
		t.Fatalf("decode oauth start response: %v", err)
	}

	authorizationURL, err := url.Parse(startResponse.AuthorizationURL)
	if err != nil {
		t.Fatalf("parse authorization url: %v", err)
	}
	state := authorizationURL.Query().Get("state")
	if state == "" {
		t.Fatal("expected state in authorization url")
	}

	callbackReq := httptest.NewRequest(http.MethodGet, "http://example.com/api/v1/oauth/callback?state="+url.QueryEscape(state)+"&code=good-code", nil)
	for _, cookie := range startRec.Result().Cookies() {
		callbackReq.AddCookie(cookie)
	}
	callbackRec := httptest.NewRecorder()

	srv.Handler().ServeHTTP(callbackRec, callbackReq)

	if callbackRec.Code != http.StatusFound {
		t.Fatalf("expected oauth callback redirect, got %d body=%s", callbackRec.Code, callbackRec.Body.String())
	}
	location := callbackRec.Header().Get("Location")
	if location == "" {
		t.Fatal("expected redirect location")
	}
	redirectURL, err := url.Parse(location)
	if err != nil {
		t.Fatalf("parse redirect location: %v", err)
	}
	if redirectURL.Scheme != "http" || redirectURL.Host != "client.example.test" {
		t.Fatalf("expected redirect back to client origin, got %s", location)
	}
	if redirectURL.Path != "/app/settings" {
		t.Fatalf("expected redirect path /app/settings, got %s", location)
	}
	if redirectURL.Query().Get("oauth_status") != "success" {
		t.Fatalf("expected oauth success redirect, got %s", location)
	}
	if redirectURL.Query().Get("key") == "" {
		t.Fatalf("expected key param in redirect, got %s", location)
	}

	proofsReq := httptest.NewRequest(http.MethodGet, "http://example.com/api/v1/me/proofs?proof_type=oauth", nil)
	withNIP98Auth(t, proofsReq, guestSecretKey(t), nil)
	proofsRec := httptest.NewRecorder()

	srv.Handler().ServeHTTP(proofsRec, proofsReq)

	if proofsRec.Code != http.StatusOK {
		t.Fatalf("expected self proofs 200, got %d body=%s", proofsRec.Code, proofsRec.Body.String())
	}

	var proofsResponse struct {
		Entries []struct {
			SubjectPubkey string            `json:"subject_pubkey"`
			ProofType     string            `json:"proof_type"`
			ProofValue    string            `json:"proof_value"`
			Metadata      map[string]string `json:"metadata"`
		} `json:"entries"`
	}
	if err := json.Unmarshal(proofsRec.Body.Bytes(), &proofsResponse); err != nil {
		t.Fatalf("decode proofs response: %v", err)
	}

	if len(proofsResponse.Entries) != 1 {
		t.Fatalf("expected one proof entry, got %+v", proofsResponse.Entries)
	}
	if proofsResponse.Entries[0].ProofType != "oauth" {
		t.Fatalf("unexpected proof type: %+v", proofsResponse.Entries[0])
	}
	if proofsResponse.Entries[0].Metadata["subject"] != "user-123" {
		t.Fatalf("unexpected metadata: %+v", proofsResponse.Entries[0].Metadata)
	}
}

func TestTokenAllowsDefaultListenerJoinForCohortBeacon(t *testing.T) {
	policyStore := store.NewMemory()
	srv := NewServer(config.Config{
		LiveKitAPIKey:      "devkey",
		LiveKitAPISecret:   "devsecret",
		LiveKitURL:         "ws://livekit.example.test",
		PrimaryOperatorPub: mustPublicKey(t, operatorSecretKey(t)),
	}, policyStore)
	seedSocialScene(t, srv,
		[]social.Place{{
			Geohash: "9q8yyk",
			Title:   "Zero to Hero Cohort",
			Tags:    []string{"beacon", "cohort", "curriculum:zero-to-hero"},
		}},
		nil,
		nil,
		nil,
	)

	tokenPayload := []byte(`{"room_id":"beacon:9q8yyk"}`)
	tokenReq := httptest.NewRequest(http.MethodPost, "http://example.com/api/v1/token", bytes.NewReader(tokenPayload))
	withNIP98Auth(t, tokenReq, guestSecretKey(t), tokenPayload)
	tokenRec := httptest.NewRecorder()

	srv.Handler().ServeHTTP(tokenRec, tokenReq)

	if tokenRec.Code != http.StatusOK {
		t.Fatalf("expected token request 200, got %d body=%s", tokenRec.Code, tokenRec.Body.String())
	}

	var response struct {
		Reason string `json:"reason"`
		Token  struct {
			Grants struct {
				CanPublish   bool `json:"can_publish"`
				CanSubscribe bool `json:"can_subscribe"`
			} `json:"grants"`
		} `json:"token"`
	}
	if err := json.Unmarshal(tokenRec.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if response.Reason != "room_default_listener" {
		t.Fatalf("expected room_default_listener reason, got %s", response.Reason)
	}
	if response.Token.Grants.CanPublish || !response.Token.Grants.CanSubscribe {
		t.Fatalf("unexpected grants: %+v", response.Token.Grants)
	}
}

func TestTokenAllowsDefaultSpeakerJoinForPlainBeacon(t *testing.T) {
	policyStore := store.NewMemory()
	srv := NewServer(config.Config{
		LiveKitAPIKey:      "devkey",
		LiveKitAPISecret:   "devsecret",
		LiveKitURL:         "ws://livekit.example.test",
		PrimaryOperatorPub: mustPublicKey(t, operatorSecretKey(t)),
	}, policyStore)
	seedSocialScene(t, srv,
		[]social.Place{{
			Geohash: "9q8yyk",
			Title:   "Civic Plaza",
			Tags:    []string{"beacon"},
		}},
		nil,
		nil,
		nil,
	)

	tokenPayload := []byte(`{"room_id":"beacon:9q8yyk"}`)
	tokenReq := httptest.NewRequest(http.MethodPost, "http://example.com/api/v1/token", bytes.NewReader(tokenPayload))
	withNIP98Auth(t, tokenReq, guestSecretKey(t), tokenPayload)
	tokenRec := httptest.NewRecorder()

	srv.Handler().ServeHTTP(tokenRec, tokenReq)

	if tokenRec.Code != http.StatusOK {
		t.Fatalf("expected token request 200, got %d body=%s", tokenRec.Code, tokenRec.Body.String())
	}

	var response struct {
		Reason string `json:"reason"`
		Token  struct {
			Grants struct {
				CanPublish   bool `json:"can_publish"`
				CanSubscribe bool `json:"can_subscribe"`
			} `json:"grants"`
		} `json:"token"`
	}
	if err := json.Unmarshal(tokenRec.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if response.Reason != "room_default_listener" {
		t.Fatalf("expected room_default_listener reason for default beacon access, got %s", response.Reason)
	}
	if !response.Token.Grants.CanPublish || !response.Token.Grants.CanSubscribe {
		t.Fatalf("expected default beacon speaker grants, got %+v", response.Token.Grants)
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

	tokenPayload := []byte(`{"room_id":"beacon:9q8yyk"}`)
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

func TestOwnerStandingTokenGetsFullRoomGrantsWithoutRoomPermission(t *testing.T) {
	ownerPubkey := mustPublicKey(t, guestSecretKey(t))
	policyStore := store.NewMemory()
	if _, err := policyStore.CreateStandingRecord(t.Context(), store.StandingRecord{
		SubjectPubkey:   ownerPubkey,
		Standing:        "owner",
		Scope:           "relay.admin",
		GrantedByPubkey: mustPublicKey(t, operatorSecretKey(t)),
	}); err != nil {
		t.Fatalf("seed owner standing: %v", err)
	}

	srv := NewServer(config.Config{
		LiveKitAPIKey:      "devkey",
		LiveKitAPISecret:   "devsecret",
		LiveKitURL:         "ws://livekit.example.test",
		PrimaryOperatorPub: mustPublicKey(t, operatorSecretKey(t)),
	}, policyStore)

	tokenPayload := []byte(`{"room_id":"beacon:9q8yyk"}`)
	tokenReq := httptest.NewRequest(http.MethodPost, "http://example.com/api/v1/token", bytes.NewReader(tokenPayload))
	withNIP98Auth(t, tokenReq, guestSecretKey(t), tokenPayload)
	tokenRec := httptest.NewRecorder()

	srv.Handler().ServeHTTP(tokenRec, tokenReq)

	if tokenRec.Code != http.StatusOK {
		t.Fatalf("expected token request 200, got %d body=%s", tokenRec.Code, tokenRec.Body.String())
	}

	var response struct {
		Reason string `json:"reason"`
		Token  struct {
			Grants struct {
				CanPublish   bool `json:"can_publish"`
				CanSubscribe bool `json:"can_subscribe"`
			} `json:"grants"`
		} `json:"token"`
	}
	if err := json.Unmarshal(tokenRec.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if response.Reason != "local_standing" {
		t.Fatalf("expected local_standing reason, got %s", response.Reason)
	}
	if !response.Token.Grants.CanPublish || !response.Token.Grants.CanSubscribe {
		t.Fatalf("expected owner standing grants, got %+v", response.Token.Grants)
	}
}

func TestAdminRoomPermissionUpdatesLiveParticipantWhenConnected(t *testing.T) {
	operatorPubkey := mustPublicKey(t, operatorSecretKey(t))
	guestPubkey := mustPublicKey(t, guestSecretKey(t))
	srv := NewServer(config.Config{
		PrimaryOperatorPub: operatorPubkey,
	}, store.NewMemory())
	updater := &fakeParticipantPermissionUpdater{}
	srv.participantPermissionUpdater = updater

	payload := []byte(`{
	  "subject_pubkey":"` + guestPubkey + `",
	  "room_id":"beacon:9q8yyk",
	  "can_join":true,
	  "can_publish":true,
	  "can_subscribe":true
	}`)
	req := httptest.NewRequest(http.MethodPost, "http://example.com/api/v1/admin/room-permissions", bytes.NewReader(payload))
	withNIP98Auth(t, req, operatorSecretKey(t), payload)
	rec := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d body=%s", rec.Code, rec.Body.String())
	}
	if len(updater.calls) != 1 {
		t.Fatalf("expected one updater call, got %d", len(updater.calls))
	}
	if updater.calls[0].roomID != "beacon:9q8yyk" || updater.calls[0].identity != guestPubkey {
		t.Fatalf("unexpected updater call: %+v", updater.calls[0])
	}
	if !updater.calls[0].permission.CanPublish || !updater.calls[0].permission.CanSubscribe {
		t.Fatalf("unexpected updater permission: %+v", updater.calls[0].permission)
	}

	var response struct {
		LiveSyncApplied bool `json:"live_sync_applied"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if !response.LiveSyncApplied {
		t.Fatal("expected live sync applied flag")
	}
}

func TestAdminRoomPermissionReturnsLiveSyncWarningOnFailure(t *testing.T) {
	operatorPubkey := mustPublicKey(t, operatorSecretKey(t))
	guestPubkey := mustPublicKey(t, guestSecretKey(t))
	srv := NewServer(config.Config{
		PrimaryOperatorPub: operatorPubkey,
	}, store.NewMemory())
	srv.participantPermissionUpdater = &fakeParticipantPermissionUpdater{
		err: errors.New("livekit room service unavailable"),
	}

	payload := []byte(`{
	  "subject_pubkey":"` + guestPubkey + `",
	  "room_id":"beacon:9q8yyk",
	  "can_join":true,
	  "can_publish":false,
	  "can_subscribe":true
	}`)
	req := httptest.NewRequest(http.MethodPost, "http://example.com/api/v1/admin/room-permissions", bytes.NewReader(payload))
	withNIP98Auth(t, req, operatorSecretKey(t), payload)
	rec := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d body=%s", rec.Code, rec.Body.String())
	}

	var response struct {
		LiveSyncApplied bool   `json:"live_sync_applied"`
		LiveSyncWarning string `json:"live_sync_warning"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if response.LiveSyncApplied {
		t.Fatal("expected live sync applied to be false on updater failure")
	}
	if response.LiveSyncWarning == "" {
		t.Fatal("expected live sync warning on updater failure")
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

func TestInternalRelayAuthorizeReturnsRequiredProofContract(t *testing.T) {
	policyStore := store.NewMemory()
	_, err := policyStore.CreateGatePolicy(t.Context(), store.GatePolicy{
		Capability:      "relay.publish",
		Scope:           "relay",
		ProofTypes:      []string{"oauth"},
		GrantedByPubkey: "operator",
	})
	if err != nil {
		t.Fatalf("seed gate policy: %v", err)
	}

	srv := NewServer(config.Config{
		PrimaryOperatorPub: "operator",
	}, policyStore)

	payload := []byte(`{
	  "action":"publish",
	  "scope":"relay",
	  "pubkey":"proofless-pubkey",
	  "event":{"id":"event-2","kind":1,"created_at":1773356400,"tags":[["p","peer"]]}
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
		Policy struct {
			Publish struct {
				Mode                string `json:"mode"`
				ProofRequirement    string `json:"proof_requirement"`
				ProofRequirementMet bool   `json:"proof_requirement_met"`
				Gates               []struct {
					Type   string `json:"type"`
					Status string `json:"status"`
				} `json:"gates"`
			} `json:"publish"`
		} `json:"policy"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if response.Allow || response.Reason != "required_proof" {
		t.Fatalf("unexpected response: %+v", response)
	}
	if response.Policy.Publish.Mode != "gated" {
		t.Fatalf("expected gated mode, got %+v", response.Policy.Publish)
	}
	if response.Policy.Publish.ProofRequirement != "oauth" || response.Policy.Publish.ProofRequirementMet {
		t.Fatalf("unexpected proof requirement: %+v", response.Policy.Publish)
	}
	if len(response.Policy.Publish.Gates) != 1 || response.Policy.Publish.Gates[0].Type != "oauth" || response.Policy.Publish.Gates[0].Status != "missing" {
		t.Fatalf("unexpected gates: %+v", response.Policy.Publish.Gates)
	}
}

func TestSocialBootstrapAppliesEditorialPinFromStore(t *testing.T) {
	policyStore := store.NewMemory()
	_, err := policyStore.CreateEditorialPin(t.Context(), store.EditorialPin{
		Geohash:         "9q8yym",
		NoteID:          "note-annex-move",
		Label:           "featured",
		GrantedByPubkey: "operator",
	})
	if err != nil {
		t.Fatalf("seed editorial pin: %v", err)
	}

	srv := NewServer(config.Config{
		PrimaryOperatorPub: "operator",
	}, policyStore)
	seedSocialScene(t, srv,
		[]social.Place{{
			Geohash: "9q8yym",
			Title:   "Warehouse annex",
		}},
		nil,
		[]social.Note{{
			ID:           "note-annex-move",
			Geohash:      "9q8yym",
			AuthorPubkey: "npub1mika",
			Content:      "Afterparty moved indoors. Audio room is live.",
			CreatedAt:    "2026-03-18T18:15:00Z",
		}},
		nil,
	)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/social/bootstrap", nil)
	rec := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var response struct {
		Places []struct {
			Geohash      string `json:"geohash"`
			PinnedNoteID string `json:"pinned_note_id"`
		} `json:"places"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	for _, place := range response.Places {
		if place.Geohash == "9q8yym" && place.PinnedNoteID == "note-annex-move" {
			return
		}
	}
	t.Fatalf("expected editorial pin to be applied: %+v", response.Places)
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

func mustPublicKeyNpub(t *testing.T, secretKey string) string {
	t.Helper()
	pubkey := mustPublicKey(t, secretKey)
	npub, err := nip19.EncodePublicKey(pubkey)
	if err != nil {
		t.Fatalf("encode npub: %v", err)
	}
	return npub
}

func seedSocialScene(
	t *testing.T,
	srv *Server,
	places []social.Place,
	profiles []social.Profile,
	notes []social.Note,
	crossRelayItems []social.CrossRelayFeedItem,
) {
	t.Helper()
	setUnexportedField(t, srv.socialService, "places", places)
	setUnexportedField(t, srv.socialService, "profiles", profiles)
	setUnexportedField(t, srv.socialService, "notes", notes)
	setUnexportedField(t, srv.socialService, "crossRelayItems", crossRelayItems)
	setUnexportedField(t, srv.socialService, "nextNoteID", int64(len(notes)))
}

func setUnexportedField[T any](t *testing.T, target any, fieldName string, value T) {
	t.Helper()
	field := reflect.ValueOf(target).Elem().FieldByName(fieldName)
	if !field.IsValid() {
		t.Fatalf("field %s not found", fieldName)
	}
	reflect.NewAt(field.Type(), unsafe.Pointer(field.UnsafeAddr())).Elem().Set(reflect.ValueOf(value))
}

func withNIP98Auth(t *testing.T, req *http.Request, secretKey string, body []byte) {
	t.Helper()
	req.Header.Set("Authorization", "Nostr "+encodeEvent(t, signedNIP98Event(t, secretKey, req, body, time.Now())))
	if body != nil {
		req.Body = ioNopCloser(body)
	}
}

type fakeParticipantPermissionUpdater struct {
	err   error
	calls []participantPermissionUpdateCall
}

type participantPermissionUpdateCall struct {
	roomID     string
	identity   string
	permission scLiveKit.ParticipantPermission
}

func (f *fakeParticipantPermissionUpdater) UpdateParticipantPermission(
	_ context.Context,
	roomID,
	identity string,
	permission scLiveKit.ParticipantPermission,
) error {
	f.calls = append(f.calls, participantPermissionUpdateCall{
		roomID:     roomID,
		identity:   identity,
		permission: permission,
	})
	return f.err
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
