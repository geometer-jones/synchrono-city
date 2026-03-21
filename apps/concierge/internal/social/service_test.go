package social

import (
	"strings"
	"testing"
	"time"
)

func TestNewService(t *testing.T) {
	t.Run("uses provided operator pubkey", func(t *testing.T) {
		svc := NewService("npub1custom", "Relay Alpha", "wss://alpha.example", nil)
		if svc.operatorPubkey != "npub1custom" {
			t.Errorf("expected operatorPubkey npub1custom, got %s", svc.operatorPubkey)
		}
		if svc.relayName != "Relay Alpha" {
			t.Errorf("expected relayName Relay Alpha, got %s", svc.relayName)
		}
		if svc.relayURL != "wss://alpha.example" {
			t.Errorf("expected relayURL wss://alpha.example, got %s", svc.relayURL)
		}
	})

	t.Run("falls back to default operator pubkey when empty", func(t *testing.T) {
		svc := NewService("", "", "", nil)
		if svc.operatorPubkey != fallbackOperatorPubkey {
			t.Errorf("expected fallback operator pubkey, got %s", svc.operatorPubkey)
		}
	})

	t.Run("falls back to default operator pubkey when whitespace", func(t *testing.T) {
		svc := NewService("   ", "   ", "   ", nil)
		if svc.operatorPubkey != fallbackOperatorPubkey {
			t.Errorf("expected fallback operator pubkey, got %s", svc.operatorPubkey)
		}
		if svc.relayName != fallbackRelayName {
			t.Errorf("expected fallback relay name, got %s", svc.relayName)
		}
		if svc.relayURL != fallbackRelayURL {
			t.Errorf("expected fallback relay URL, got %s", svc.relayURL)
		}
	})
}

func TestBootstrap(t *testing.T) {
	svc := NewService("npub1test", "Test Relay", "wss://test-relay.example", nil)
	resp := svc.Bootstrap()

	t.Run("returns relay metadata", func(t *testing.T) {
		if resp.RelayName != "Test Relay" {
			t.Errorf("expected RelayName Test Relay, got %s", resp.RelayName)
		}
		if resp.RelayURL != "wss://test-relay.example" {
			t.Errorf("expected RelayURL wss://test-relay.example, got %s", resp.RelayURL)
		}
	})

	t.Run("returns operator pubkey", func(t *testing.T) {
		if resp.RelayOperatorPubkey != "npub1test" {
			t.Errorf("expected RelayOperatorPubkey npub1test, got %s", resp.RelayOperatorPubkey)
		}
	})

	t.Run("returns current user pubkey", func(t *testing.T) {
		if resp.CurrentUserPubkey != DefaultCurrentUserPubkey {
			t.Errorf("expected CurrentUserPubkey %s, got %s", DefaultCurrentUserPubkey, resp.CurrentUserPubkey)
		}
	})

	t.Run("returns places", func(t *testing.T) {
		if len(resp.Places) == 0 {
			t.Error("expected at least one place")
		}
	})

	t.Run("returns profiles", func(t *testing.T) {
		if len(resp.Profiles) == 0 {
			t.Error("expected at least one profile")
		}
	})

	t.Run("returns notes", func(t *testing.T) {
		if len(resp.Notes) == 0 {
			t.Error("expected at least one note")
		}
	})

	t.Run("returns feed segments", func(t *testing.T) {
		if len(resp.FeedSegments) == 0 {
			t.Error("expected at least one feed segment")
		}
	})

	t.Run("returns cross-relay items", func(t *testing.T) {
		if len(resp.CrossRelayItems) == 0 {
			t.Error("expected at least one cross-relay item")
		}
	})

	t.Run("returns copy of data", func(t *testing.T) {
		resp.Places[0].Title = "modified"
		resp.CrossRelayItems[0].RelayName = "modified relay"
		resp2 := svc.Bootstrap()
		if resp2.Places[0].Title == "modified" {
			t.Error("Bootstrap should return a copy, not a reference")
		}
		if resp2.CrossRelayItems[0].RelayName == "modified relay" {
			t.Error("Bootstrap should return a copy of cross-relay items, not a reference")
		}
	})
}

func TestCreateNote(t *testing.T) {
	fixedTime := time.Date(2026, 3, 18, 18, 30, 0, 0, time.UTC)
	svc := &Service{
		operatorPubkey:    "npub1operator",
		currentUserPubkey: DefaultCurrentUserPubkey,
		places: []Place{
			{Geohash: "9q8yyk", Title: "Test Place"},
		},
		notes:      []Note{},
		nextNoteID: 0,
		now:        func() time.Time { return fixedTime },
	}

	t.Run("creates note with valid input", func(t *testing.T) {
		note, err := svc.CreateNote("9q8yyk", "npub1author", "Test content")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if note.Geohash != "9q8yyk" {
			t.Errorf("expected geohash 9q8yyk, got %s", note.Geohash)
		}
		if note.AuthorPubkey != "npub1author" {
			t.Errorf("expected author npub1author, got %s", note.AuthorPubkey)
		}
		if note.Content != "Test content" {
			t.Errorf("expected content 'Test content', got %s", note.Content)
		}
		if note.CreatedAt != "2026-03-18T18:30:00Z" {
			t.Errorf("expected createdAt 2026-03-18T18:30:00Z, got %s", note.CreatedAt)
		}
		if note.Replies != 0 {
			t.Errorf("expected replies 0, got %d", note.Replies)
		}
	})

	t.Run("uses current user pubkey when author is empty", func(t *testing.T) {
		note, err := svc.CreateNote("9q8yyk", "", "Content")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if note.AuthorPubkey != DefaultCurrentUserPubkey {
			t.Errorf("expected author %s, got %s", DefaultCurrentUserPubkey, note.AuthorPubkey)
		}
	})

	t.Run("trims whitespace from content", func(t *testing.T) {
		note, err := svc.CreateNote("9q8yyk", "npub1author", "  trimmed content  ")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if note.Content != "trimmed content" {
			t.Errorf("expected trimmed content, got '%s'", note.Content)
		}
	})

	t.Run("rejects empty content", func(t *testing.T) {
		_, err := svc.CreateNote("9q8yyk", "npub1author", "")
		if err != ErrEmptyContent {
			t.Errorf("expected ErrEmptyContent, got %v", err)
		}
	})

	t.Run("rejects whitespace-only content", func(t *testing.T) {
		_, err := svc.CreateNote("9q8yyk", "npub1author", "   ")
		if err != ErrEmptyContent {
			t.Errorf("expected ErrEmptyContent, got %v", err)
		}
	})

	t.Run("rejects content exceeding max length", func(t *testing.T) {
		longContent := strings.Repeat("a", MaxNoteContentLength+1)
		_, err := svc.CreateNote("9q8yyk", "npub1author", longContent)
		if err != ErrContentTooLong {
			t.Errorf("expected ErrContentTooLong, got %v", err)
		}
	})

	t.Run("accepts content at max length", func(t *testing.T) {
		maxContent := strings.Repeat("a", MaxNoteContentLength)
		_, err := svc.CreateNote("9q8yyk", "npub1author", maxContent)
		if err != nil {
			t.Errorf("unexpected error for max length content: %v", err)
		}
	})

	t.Run("rejects empty geohash", func(t *testing.T) {
		_, err := svc.CreateNote("", "npub1author", "content")
		if err != ErrInvalidGeohash {
			t.Errorf("expected ErrInvalidGeohash, got %v", err)
		}
	})

	t.Run("rejects unknown place", func(t *testing.T) {
		_, err := svc.CreateNote("unknown", "npub1author", "content")
		if err != ErrUnknownPlace {
			t.Errorf("expected ErrUnknownPlace, got %v", err)
		}
	})

	t.Run("prepends note to list", func(t *testing.T) {
		svc := &Service{
			operatorPubkey:    "npub1operator",
			currentUserPubkey: DefaultCurrentUserPubkey,
			places:            []Place{{Geohash: "9q8yyk"}},
			notes:             []Note{{ID: "existing"}},
			nextNoteID:        10,
			now:               time.Now,
		}
		_, _ = svc.CreateNote("9q8yyk", "npub1author", "new")
		if len(svc.notes) != 2 {
			t.Fatalf("expected 2 notes, got %d", len(svc.notes))
		}
		if svc.notes[0].ID != "note-11" {
			t.Errorf("expected new note at front, got %s", svc.notes[0].ID)
		}
	})
}

func TestResolveCallIntent(t *testing.T) {
	svc := &Service{
		operatorPubkey:    "npub1operator",
		currentUserPubkey: DefaultCurrentUserPubkey,
		places: []Place{
			{
				Geohash:         "9q8yyk",
				Title:           "Test Place",
				OccupantPubkeys: []string{"npub1aurora", "npub1jules"},
			},
		},
	}

	t.Run("resolves call intent for known place", func(t *testing.T) {
		intent, err := svc.ResolveCallIntent("9q8yyk", "npub1caller")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if intent.Geohash != "9q8yyk" {
			t.Errorf("expected geohash 9q8yyk, got %s", intent.Geohash)
		}
		if intent.RoomID != "geo:npub1operator:9q8yyk" {
			t.Errorf("expected roomID geo:npub1operator:9q8yyk, got %s", intent.RoomID)
		}
		if intent.PlaceTitle != "Test Place" {
			t.Errorf("expected placeTitle Test Place, got %s", intent.PlaceTitle)
		}
	})

	t.Run("includes caller in participants if not already present", func(t *testing.T) {
		intent, err := svc.ResolveCallIntent("9q8yyk", "npub1caller")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		found := false
		for _, pk := range intent.ParticipantPubkeys {
			if pk == "npub1caller" {
				found = true
				break
			}
		}
		if !found {
			t.Error("expected caller to be included in participants")
		}
	})

	t.Run("does not duplicate caller if already occupant", func(t *testing.T) {
		intent, err := svc.ResolveCallIntent("9q8yyk", "npub1aurora")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		count := 0
		for _, pk := range intent.ParticipantPubkeys {
			if pk == "npub1aurora" {
				count++
			}
		}
		if count > 1 {
			t.Error("expected caller to appear only once in participants")
		}
	})

	t.Run("uses current user pubkey when caller is empty", func(t *testing.T) {
		intent, err := svc.ResolveCallIntent("9q8yyk", "")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		found := false
		for _, pk := range intent.ParticipantPubkeys {
			if pk == DefaultCurrentUserPubkey {
				found = true
				break
			}
		}
		if !found {
			t.Error("expected current user to be included in participants")
		}
	})

	t.Run("rejects unknown place", func(t *testing.T) {
		_, err := svc.ResolveCallIntent("unknown", "npub1caller")
		if err != ErrUnknownPlace {
			t.Errorf("expected ErrUnknownPlace, got %v", err)
		}
	})
}

func TestResolveRoomID(t *testing.T) {
	result := ResolveRoomID("npub1operator", "9q8yyk")
	if result != "geo:npub1operator:9q8yyk" {
		t.Errorf("expected geo:npub1operator:9q8yyk, got %s", result)
	}
}
