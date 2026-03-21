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
	Name        string `json:"name,omitempty"`
	Picture     string `json:"picture,omitempty"`
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

	return &Service{
		store:             socialStore,
		relayName:         relayName,
		operatorPubkey:    operatorPubkey,
		relayURL:          relayURL,
		currentUserPubkey: DefaultCurrentUserPubkey,
		places:            []Place{},
		profiles:          []Profile{},
		notes:             []Note{},
		feedSegments: []FeedSegment{
			{Name: "Following", Description: "Explainable projection of followed authors."},
			{Name: "Local", Description: "Public events carried by the active relay."},
			{Name: "For You", Description: "Concierge-produced merge across relays and follows."},
		},
		crossRelayItems: []CrossRelayFeedItem{},
		nextNoteID:      0,
		now:             time.Now,
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

	geohash = strings.TrimSpace(strings.ToLower(geohash))
	if len(geohash) < MinGeohashLength {
		return CallIntent{}, ErrInvalidGeohash
	}
	if strings.TrimSpace(pubkey) == "" {
		pubkey = s.currentUserPubkey
	}

	participants := []string{}
	placeTitle := formatAdHocPlaceTitle(geohash)

	if place, ok := s.placeByGeohashLocked(geohash); ok {
		participants = slices.Clone(place.OccupantPubkeys)
		placeTitle = place.Title
	}

	if !slices.Contains(participants, pubkey) {
		participants = append([]string{pubkey}, participants...)
	}

	return CallIntent{
		Geohash:            geohash,
		RoomID:             ResolveRoomID(s.operatorPubkey, geohash),
		PlaceTitle:         placeTitle,
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

func formatAdHocPlaceTitle(geohash string) string {
	return fmt.Sprintf("Field tile %s", geohash)
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
