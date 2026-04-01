package social

import (
	"context"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/peterwei/synchrono-city/apps/concierge/internal/store"
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
		if len(resp.RelayList) != 1+len(defaultBootstrapRelays) {
			t.Fatalf("expected %d relay list entries, got %d", 1+len(defaultBootstrapRelays), len(resp.RelayList))
		}
		if resp.RelayList[0].URL != "wss://test-relay.example" {
			t.Errorf("expected relay list URL wss://test-relay.example, got %s", resp.RelayList[0].URL)
		}
		if !resp.RelayList[0].Inbox || !resp.RelayList[0].Outbox {
			t.Errorf("expected primary relay inbox/outbox flags to default true, got %+v", resp.RelayList[0])
		}
		if !slices.ContainsFunc(resp.RelayList, func(entry RelayListEntry) bool {
			return entry.URL == "wss://relay.damus.io"
		}) {
			t.Error("expected featured relay list to include wss://relay.damus.io")
		}
		if !slices.ContainsFunc(resp.RelayList, func(entry RelayListEntry) bool {
			return entry.URL == "wss://cache1.primal.net" && entry.Inbox && !entry.Outbox
		}) {
			t.Error("expected specialized relay list to include read-heavy primal cache flags")
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
		if len(resp.Places) != 0 {
			t.Errorf("expected no bootstrap places, got %d", len(resp.Places))
		}
	})

	t.Run("returns profiles", func(t *testing.T) {
		if len(resp.Profiles) != 0 {
			t.Errorf("expected no bootstrap profiles, got %d", len(resp.Profiles))
		}
	})

	t.Run("returns notes", func(t *testing.T) {
		if len(resp.Notes) != 0 {
			t.Errorf("expected no bootstrap notes, got %d", len(resp.Notes))
		}
	})

	t.Run("returns cross-relay items", func(t *testing.T) {
		if len(resp.CrossRelayItems) != 0 {
			t.Errorf("expected no bootstrap cross-relay items, got %d", len(resp.CrossRelayItems))
		}
	})

	t.Run("returns copy of data", func(t *testing.T) {
		svc.places = []Place{{Geohash: "9q8yyk", Title: "original"}}
		svc.crossRelayItems = []CrossRelayFeedItem{{ID: "cross-1", RelayName: "relay"}}

		resp = svc.Bootstrap()
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

	t.Run("deduplicates the primary relay against featured defaults", func(t *testing.T) {
		damusSvc := NewService("npub1test", "Custom Damus Mirror", "wss://relay.damus.io", nil)
		damusResp := damusSvc.Bootstrap()

		damusEntries := 0
		for _, entry := range damusResp.RelayList {
			if entry.URL == "wss://relay.damus.io" {
				damusEntries++
				if entry.Name != "Custom Damus Mirror" {
					t.Fatalf("expected primary relay label to win during dedupe, got %q", entry.Name)
				}
			}
		}

		if damusEntries != 1 {
			t.Fatalf("expected deduped relay list to contain one damus entry, got %d", damusEntries)
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

	t.Run("creates an ad-hoc place for an unknown geohash", func(t *testing.T) {
		note, err := svc.CreateNote("9q8yyz", "npub1author", "content")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if note.Geohash != "9q8yyz" {
			t.Errorf("expected geohash 9q8yyz, got %s", note.Geohash)
		}
		place, ok := svc.placeByGeohashLocked("9q8yyz")
		if !ok {
			t.Fatal("expected ad-hoc place to be created")
		}
		if place.Title != "Field tile 9q8yyz" {
			t.Errorf("expected ad-hoc place title, got %s", place.Title)
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

func TestCreateOrReturnBeacon(t *testing.T) {
	svc := &Service{
		operatorPubkey:    "npub1operator",
		currentUserPubkey: DefaultCurrentUserPubkey,
		places:            []Place{},
	}

	t.Run("creates a new beacon for an empty geohash", func(t *testing.T) {
		result, err := svc.CreateOrReturnBeacon(
			context.Background(),
			"9q8yyk34",
			"Lantern Point",
			"https://example.com/beacon.png",
			"Meet after sunset.",
			[]string{"cohort", "curriculum:zero-to-hero", "cohort"},
			"",
		)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.Created {
			t.Fatal("expected created beacon result")
		}
		if result.Beacon.Geohash != "9q8yyk34" {
			t.Fatalf("expected beacon geohash 9q8yyk34, got %s", result.Beacon.Geohash)
		}
		if result.Beacon.Title != "Lantern Point" {
			t.Fatalf("expected beacon title, got %s", result.Beacon.Title)
		}
		if result.Beacon.Picture != "https://example.com/beacon.png" {
			t.Fatalf("expected beacon picture, got %s", result.Beacon.Picture)
		}
		if result.Beacon.Description != "Meet after sunset." {
			t.Fatalf("expected beacon description, got %s", result.Beacon.Description)
		}
		if !slices.Equal(result.Beacon.Tags, []string{"beacon", "geohash8", "cohort", "curriculum:zero-to-hero"}) {
			t.Fatalf("unexpected beacon tags: %+v", result.Beacon.Tags)
		}
	})

	t.Run("returns the existing beacon instead of creating a duplicate", func(t *testing.T) {
		result, err := svc.CreateOrReturnBeacon(context.Background(), "9q8yyk34", "Duplicate", "", "Ignored", nil, "")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result.Created {
			t.Fatal("expected existing beacon result")
		}
		if result.Beacon.Title != "Lantern Point" {
			t.Fatalf("expected original beacon title, got %s", result.Beacon.Title)
		}
		if len(svc.places) != 1 {
			t.Fatalf("expected one stored beacon, got %d", len(svc.places))
		}
	})

	t.Run("rejects creating a new beacon without a name", func(t *testing.T) {
		_, err := svc.CreateOrReturnBeacon(context.Background(), "9q8yyk99", "   ", "", "", nil, "")
		if err != ErrEmptyBeaconName {
			t.Fatalf("expected ErrEmptyBeaconName, got %v", err)
		}
	})

	t.Run("grants the creator full room access for a newly created beacon", func(t *testing.T) {
		store := store.NewMemory()
		creatorPubkey := "npub1creator"
		svcWithStore := &Service{
			operatorPubkey:    "npub1operator",
			currentUserPubkey: DefaultCurrentUserPubkey,
			store:             store,
			places:            []Place{},
		}

		result, err := svcWithStore.CreateOrReturnBeacon(
			context.Background(),
			"9q8yyk55",
			"Speaker Room",
			"",
			"",
			nil,
			creatorPubkey,
		)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.Created {
			t.Fatal("expected created beacon result")
		}

		permission, err := store.LatestRoomPermission(context.Background(), creatorPubkey, "beacon:9q8yyk55")
		if err != nil {
			t.Fatalf("expected creator room permission: %v", err)
		}
		if !permission.CanJoin || !permission.CanPublish || !permission.CanSubscribe {
			t.Fatalf("expected creator full room grants, got %+v", permission)
		}
	})
}

func TestDefaultRoomGrants(t *testing.T) {
	svc := &Service{
		places: []Place{
			{
				Geohash: "9q8yyk34",
				Title:   "Hybrid study room",
				Tags:    []string{"beacon", "cohort", "curriculum:zero-to-hero"},
			},
			{
				Geohash: "9q8yyk55",
				Title:   "Plain beacon",
				Tags:    []string{"beacon"},
			},
		},
	}

	canPublish, canSubscribe, ok := svc.DefaultRoomGrants("beacon:9q8yyk34")
	if !ok || canPublish || !canSubscribe {
		t.Fatalf("expected cohort beacon listener grants, got ok=%t publish=%t subscribe=%t", ok, canPublish, canSubscribe)
	}

	canPublish, canSubscribe, ok = svc.DefaultRoomGrants("beacon:9q8yyk55")
	if !ok || !canPublish || !canSubscribe {
		t.Fatalf("expected plain beacon speaker grants, got ok=%t publish=%t subscribe=%t", ok, canPublish, canSubscribe)
	}

	canPublish, canSubscribe, ok = svc.DefaultRoomGrants("beacon:9q8yyq99")
	if !ok || !canPublish || !canSubscribe {
		t.Fatalf("expected unknown beacon room to inherit speaker grants, got ok=%t publish=%t subscribe=%t", ok, canPublish, canSubscribe)
	}
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
		if intent.RoomID != "beacon:9q8yyk" {
			t.Errorf("expected roomID beacon:9q8yyk, got %s", intent.RoomID)
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

	t.Run("creates ad-hoc call intent for unknown place", func(t *testing.T) {
		intent, err := svc.ResolveCallIntent("9q8yyz", "npub1caller")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if intent.RoomID != "beacon:9q8yyz" {
			t.Fatalf("expected ad-hoc room id, got %s", intent.RoomID)
		}
		if intent.PlaceTitle != "Field tile 9q8yyz" {
			t.Fatalf("expected ad-hoc place title, got %s", intent.PlaceTitle)
		}
		if len(intent.ParticipantPubkeys) != 1 || intent.ParticipantPubkeys[0] != "npub1caller" {
			t.Fatalf("expected caller-only participant list, got %+v", intent.ParticipantPubkeys)
		}
	})

	t.Run("rejects empty geohash", func(t *testing.T) {
		_, err := svc.ResolveCallIntent("", "npub1caller")
		if err != ErrInvalidGeohash {
			t.Errorf("expected ErrInvalidGeohash, got %v", err)
		}
	})
}

func TestResolveRoomID(t *testing.T) {
	result := ResolveRoomID("npub1operator", "9q8yyk")
	if result != "beacon:9q8yyk" {
		t.Errorf("expected beacon:9q8yyk, got %s", result)
	}
}
