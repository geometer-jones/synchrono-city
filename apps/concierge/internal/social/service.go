package social

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/peterwei/synchrono-city/apps/concierge/internal/store"
)

var ErrUnknownPlace = errors.New("unknown place")
var ErrEmptyContent = errors.New("content is required")
var ErrContentTooLong = errors.New("content exceeds maximum length")
var ErrInvalidGeohash = errors.New("invalid geohash format")

const MaxNoteContentLength = 1000
const MinGeohashLength = 1

const DefaultCurrentUserPubkey = "npub1scout"
const fallbackOperatorPubkey = "npub1operator"
const fallbackRelayName = "Synchrono City Local"
const fallbackRelayURL = "ws://localhost:8080"

type Profile struct {
	Pubkey      string `json:"pubkey"`
	DisplayName string `json:"display_name"`
	Role        string `json:"role"`
	Status      string `json:"status"`
	Bio         string `json:"bio"`
	HomeGeohash string `json:"home_geohash,omitempty"`
	Mic         bool   `json:"mic"`
	Cam         bool   `json:"cam"`
	Screenshare bool   `json:"screenshare"`
	Deafen      bool   `json:"deafen"`
}

type Place struct {
	Geohash         string   `json:"geohash"`
	Title           string   `json:"title"`
	Neighborhood    string   `json:"neighborhood"`
	Description     string   `json:"description"`
	ActivitySummary string   `json:"activity_summary"`
	Tags            []string `json:"tags"`
	Capacity        int      `json:"capacity"`
	OccupantPubkeys []string `json:"occupant_pubkeys"`
	Unread          bool     `json:"unread"`
	PinnedNoteID    string   `json:"pinned_note_id,omitempty"`
}

type Note struct {
	ID           string `json:"id"`
	Geohash      string `json:"geohash"`
	AuthorPubkey string `json:"author_pubkey"`
	Content      string `json:"content"`
	CreatedAt    string `json:"created_at"`
	Replies      int    `json:"replies"`
}

type FeedSegment struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

type CrossRelayFeedItem struct {
	ID           string `json:"id"`
	RelayName    string `json:"relay_name"`
	RelayURL     string `json:"relay_url"`
	AuthorPubkey string `json:"author_pubkey"`
	AuthorName   string `json:"author_name"`
	Geohash      string `json:"geohash"`
	PlaceTitle   string `json:"place_title"`
	Content      string `json:"content"`
	PublishedAt  string `json:"published_at"`
	SourceLabel  string `json:"source_label"`
	WhyVisible   string `json:"why_visible"`
}

type BootstrapResponse struct {
	RelayName           string               `json:"relay_name"`
	RelayOperatorPubkey string               `json:"relay_operator_pubkey"`
	CurrentUserPubkey   string               `json:"current_user_pubkey"`
	RelayURL            string               `json:"relay_url"`
	Places              []Place              `json:"places"`
	Profiles            []Profile            `json:"profiles"`
	Notes               []Note               `json:"notes"`
	FeedSegments        []FeedSegment        `json:"feed_segments"`
	CrossRelayItems     []CrossRelayFeedItem `json:"cross_relay_items"`
}

type CallIntent struct {
	Geohash            string   `json:"geohash"`
	RoomID             string   `json:"room_id"`
	PlaceTitle         string   `json:"place_title"`
	ParticipantPubkeys []string `json:"participant_pubkeys"`
}

type Service struct {
	mu                sync.RWMutex
	store             store.Store
	relayName         string
	operatorPubkey    string
	relayURL          string
	currentUserPubkey string
	places            []Place
	profiles          []Profile
	notes             []Note
	feedSegments      []FeedSegment
	crossRelayItems   []CrossRelayFeedItem
	nextNoteID        int64
	now               func() time.Time
}

func NewService(operatorPubkey, relayName, relayURL string, socialStore store.Store) *Service {
	if strings.TrimSpace(operatorPubkey) == "" {
		operatorPubkey = fallbackOperatorPubkey
	}
	if strings.TrimSpace(relayName) == "" {
		relayName = fallbackRelayName
	}
	if strings.TrimSpace(relayURL) == "" {
		relayURL = fallbackRelayURL
	}

	// Seed data below is the authoritative source.
	// Keep in sync with apps/web/src/data.ts fallback seed data.
	return &Service{
		store:             socialStore,
		relayName:         relayName,
		operatorPubkey:    operatorPubkey,
		relayURL:          relayURL,
		currentUserPubkey: DefaultCurrentUserPubkey,
		places: []Place{
			{
				Geohash:         "9q8yyk",
				Title:           "Civic plaza",
				Neighborhood:    "Market steps",
				Description:     "A public square for turnout coordination, accessibility updates, and live town-hall spillover.",
				ActivitySummary: "Tenant organizing thread with a pinned logistics note and a live room.",
				Tags:            []string{"assembly", "accessibility", "civic"},
				Capacity:        8,
				OccupantPubkeys: []string{"npub1aurora", "npub1jules", "npub1sol"},
				Unread:          true,
				PinnedNoteID:    "note-plaza-pinned",
			},
			{
				Geohash:         "9q8yym",
				Title:           "Warehouse annex",
				Neighborhood:    "Harbor side",
				Description:     "An indoor fallback place for venue logistics, check-in flow, and overflow audio coordination.",
				ActivitySummary: "The venue lead moved the afterparty indoors and is guiding arrivals.",
				Tags:            []string{"venue", "logistics", "overflow"},
				Capacity:        6,
				OccupantPubkeys: []string{"npub1mika"},
				Unread:          false,
			},
			{
				Geohash:         "9q8yyt",
				Title:           "Audio fallback",
				Neighborhood:    "Transit corridor",
				Description:     "A low-friction audio place that stays open even when note traffic drops to zero.",
				ActivitySummary: "Late arrivals are using the room as a rendezvous channel.",
				Tags:            []string{"audio", "late-night", "fallback"},
				Capacity:        6,
				OccupantPubkeys: []string{"npub1river", "npub1nox"},
				Unread:          true,
			},
		},
		profiles: []Profile{
			{
				Pubkey:      DefaultCurrentUserPubkey,
				DisplayName: "Field Scout",
				Role:        "Local member",
				Status:      "Posting place notes and stepping into nearby rooms.",
				Bio:         "Tracks live place state, adds operator-facing notes, and joins calls when coordination shifts.",
				Mic:         true,
				Cam:         false,
				Screenshare: false,
				Deafen:      false,
			},
			{
				Pubkey:      "npub1aurora",
				DisplayName: "Aurora Vale",
				Role:        "Tenant organizer",
				Status:      "Coordinating arrival updates from the east stairs.",
				Bio:         "Runs block-level organizing threads and keeps the sunset meetups on schedule.",
				HomeGeohash: "9q8yyk",
				Mic:         true,
				Cam:         false,
				Screenshare: false,
				Deafen:      false,
			},
			{
				Pubkey:      "npub1jules",
				DisplayName: "Jules Mercer",
				Role:        "Neighborhood volunteer",
				Status:      "Sharing supply counts and street-level accessibility notes.",
				Bio:         "Tracks turnout and accessibility changes for public gatherings.",
				HomeGeohash: "9q8yyk",
				Mic:         true,
				Cam:         true,
				Screenshare: false,
				Deafen:      false,
			},
			{
				Pubkey:      "npub1sol",
				DisplayName: "Sol Marin",
				Role:        "Event host",
				Status:      "Pinned on the plaza room and routing newcomers.",
				Bio:         "Hosts pop-up conversations and keeps the plaza room active.",
				HomeGeohash: "9q8yyk",
				Mic:         false,
				Cam:         true,
				Screenshare: true,
				Deafen:      false,
			},
			{
				Pubkey:      "npub1mika",
				DisplayName: "Mika Hart",
				Role:        "Venue lead",
				Status:      "Moving the afterparty indoors and updating room logistics.",
				Bio:         "Coordinates venue operations when activity shifts between tiles.",
				HomeGeohash: "9q8yym",
				Mic:         true,
				Cam:         false,
				Screenshare: false,
				Deafen:      true,
			},
			{
				Pubkey:      "npub1river",
				DisplayName: "River Stone",
				Role:        "Audio host",
				Status:      "Keeping the room open for late arrivals.",
				Bio:         "Maintains lightweight audio rooms after the public note stack slows down.",
				HomeGeohash: "9q8yyt",
				Mic:         true,
				Cam:         false,
				Screenshare: false,
				Deafen:      false,
			},
			{
				Pubkey:      "npub1nox",
				DisplayName: "Nox Reed",
				Role:        "Field reporter",
				Status:      "Watching for overflow from the next tile over.",
				Bio:         "Posts quick context notes when gatherings spill into nearby blocks.",
				HomeGeohash: "9q8yyt",
				Mic:         false,
				Cam:         false,
				Screenshare: false,
				Deafen:      false,
			},
		},
		notes: []Note{
			{
				ID:           "note-plaza-pinned",
				Geohash:      "9q8yyk",
				AuthorPubkey: "npub1aurora",
				Content:      "Sunset meetup is shifting to the east stairs.",
				CreatedAt:    "2026-03-18T18:20:00Z",
				Replies:      4,
			},
			{
				ID:           "note-plaza-access",
				Geohash:      "9q8yyk",
				AuthorPubkey: "npub1jules",
				Content:      "North gate is clear again. Wheelchair route is the left ramp.",
				CreatedAt:    "2026-03-18T18:08:00Z",
				Replies:      2,
			},
			{
				ID:           "note-plaza-stream",
				Geohash:      "9q8yyk",
				AuthorPubkey: "npub1sol",
				Content:      "Screenshare is live for anyone still walking over.",
				CreatedAt:    "2026-03-18T17:58:00Z",
				Replies:      1,
			},
			{
				ID:           "note-annex-move",
				Geohash:      "9q8yym",
				AuthorPubkey: "npub1mika",
				Content:      "Afterparty moved indoors. Audio room is live.",
				CreatedAt:    "2026-03-18T18:15:00Z",
				Replies:      3,
			},
			{
				ID:           "note-annex-checkin",
				Geohash:      "9q8yym",
				AuthorPubkey: "npub1mika",
				Content:      "Check in at the alley entrance. Capacity is stable for now.",
				CreatedAt:    "2026-03-18T17:50:00Z",
				Replies:      0,
			},
			{
				ID:           "note-audio-rollcall",
				Geohash:      "9q8yyt",
				AuthorPubkey: "npub1river",
				Content:      "No new notes, but the room is still occupied.",
				CreatedAt:    "2026-03-18T18:05:00Z",
				Replies:      1,
			},
		},
		feedSegments: []FeedSegment{
			{Name: "Following", Description: "Explainable projection of followed authors."},
			{Name: "Local", Description: "Public events carried by the active relay."},
			{Name: "For You", Description: "Concierge-produced merge across relays and follows."},
		},
		crossRelayItems: []CrossRelayFeedItem{
			{
				ID:           "cross-relay-plaza",
				RelayName:    "Mission Mesh",
				RelayURL:     "wss://mission-mesh.example/relay",
				AuthorPubkey: "npub1tala",
				AuthorName:   "Tala North",
				Geohash:      "9q8yyk",
				PlaceTitle:   "Civic plaza",
				Content:      "March overflow is heading for the east stairs. Keep the plaza audio room open for late arrivals.",
				PublishedAt:  "2026-03-18T18:12:00Z",
				SourceLabel:  "Direct follow",
				WhyVisible:   "Followed author on a configured relay is posting about the same public tile.",
			},
			{
				ID:           "cross-relay-annex",
				RelayName:    "Harbor Dispatch",
				RelayURL:     "wss://harbor-dispatch.example/relay",
				AuthorPubkey: "npub1ines",
				AuthorName:   "Ines Park",
				Geohash:      "9q8yym",
				PlaceTitle:   "Warehouse annex",
				Content:      "Venue queue is clear from the alley entrance. Remote listeners are joining the annex room from two relays.",
				PublishedAt:  "2026-03-18T18:06:00Z",
				SourceLabel:  "Relay list",
				WhyVisible:   "Configured relay surfaced a matching logistics thread for an active local place.",
			},
		},
		nextNoteID: 6,
		now:        time.Now,
	}
}

func (s *Service) Bootstrap() BootstrapResponse {
	s.mu.RLock()
	defer s.mu.RUnlock()

	places := slices.Clone(s.places)
	if s.store != nil {
		if pins, err := s.store.ListEditorialPins(context.Background(), store.EditorialPinQuery{Limit: 64}); err == nil {
			applyEditorialPins(places, pins, s.notes)
		}
	}

	return BootstrapResponse{
		RelayName:           s.relayName,
		RelayOperatorPubkey: s.operatorPubkey,
		CurrentUserPubkey:   s.currentUserPubkey,
		RelayURL:            s.relayURL,
		Places:              places,
		Profiles:            slices.Clone(s.profiles),
		Notes:               slices.Clone(s.notes),
		FeedSegments:        slices.Clone(s.feedSegments),
		CrossRelayItems:     slices.Clone(s.crossRelayItems),
	}
}

func (s *Service) CreateNote(geohash, authorPubkey, content string) (Note, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if strings.TrimSpace(content) == "" {
		return Note{}, ErrEmptyContent
	}
	if len(content) > MaxNoteContentLength {
		return Note{}, ErrContentTooLong
	}
	if len(strings.TrimSpace(geohash)) < MinGeohashLength {
		return Note{}, ErrInvalidGeohash
	}
	if !s.hasPlaceLocked(geohash) {
		return Note{}, ErrUnknownPlace
	}
	if strings.TrimSpace(authorPubkey) == "" {
		authorPubkey = s.currentUserPubkey
	}

	s.nextNoteID++
	note := Note{
		ID:           fmt.Sprintf("note-%d", s.nextNoteID),
		Geohash:      geohash,
		AuthorPubkey: authorPubkey,
		Content:      strings.TrimSpace(content),
		CreatedAt:    s.now().UTC().Format(time.RFC3339),
		Replies:      0,
	}
	s.notes = append([]Note{note}, s.notes...)
	return note, nil
}

func (s *Service) ResolveCallIntent(geohash, pubkey string) (CallIntent, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	place, ok := s.placeByGeohashLocked(geohash)
	if !ok {
		return CallIntent{}, ErrUnknownPlace
	}
	if strings.TrimSpace(pubkey) == "" {
		pubkey = s.currentUserPubkey
	}

	participants := slices.Clone(place.OccupantPubkeys)
	if !slices.Contains(participants, pubkey) {
		participants = append([]string{pubkey}, participants...)
	}

	return CallIntent{
		Geohash:            geohash,
		RoomID:             ResolveRoomID(s.operatorPubkey, geohash),
		PlaceTitle:         place.Title,
		ParticipantPubkeys: participants,
	}, nil
}

func (s *Service) ValidateEditorialPin(geohash, noteID string) error {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if _, ok := s.placeByGeohashLocked(geohash); !ok {
		return ErrUnknownPlace
	}

	for _, note := range s.notes {
		if note.ID == noteID && note.Geohash == geohash {
			return nil
		}
	}

	return fmt.Errorf("note %s does not belong to %s", noteID, geohash)
}

func ResolveRoomID(operatorPubkey, geohash string) string {
	return fmt.Sprintf("geo:%s:%s", operatorPubkey, geohash)
}

func (s *Service) hasPlaceLocked(geohash string) bool {
	_, ok := s.placeByGeohashLocked(geohash)
	return ok
}

func (s *Service) placeByGeohashLocked(geohash string) (Place, bool) {
	for _, place := range s.places {
		if place.Geohash == geohash {
			return place, true
		}
	}
	return Place{}, false
}

func applyEditorialPins(places []Place, pins []store.EditorialPin, notes []Note) {
	if len(pins) == 0 {
		return
	}

	noteMap := make(map[string]Note, len(notes))
	for _, note := range notes {
		noteMap[note.ID] = note
	}

	activePins := make(map[string]store.EditorialPin, len(pins))
	for _, pin := range pins {
		if pin.Revoked {
			continue
		}
		note, ok := noteMap[pin.NoteID]
		if !ok || note.Geohash != pin.Geohash {
			continue
		}
		if _, exists := activePins[pin.Geohash]; !exists {
			activePins[pin.Geohash] = pin
		}
	}

	for index := range places {
		if pin, ok := activePins[places[index].Geohash]; ok {
			places[index].PinnedNoteID = pin.NoteID
		}
	}
}
