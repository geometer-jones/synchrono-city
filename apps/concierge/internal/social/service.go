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
var ErrEmptyBeaconName = errors.New("beacon name is required")

const MaxNoteContentLength = 1000
const MinGeohashLength = 1

const DefaultCurrentUserPubkey = "npub1scout"
const fallbackOperatorPubkey = "npub1operator"
const fallbackRelayName = "Synchrono City Local"
const fallbackRelayURL = "ws://localhost:8080"
const cohortTag = "cohort"

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
	Picture         string   `json:"picture,omitempty"`
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

type RelayListEntry struct {
	Name   string `json:"name"`
	URL    string `json:"url"`
	Inbox  bool   `json:"inbox"`
	Outbox bool   `json:"outbox"`
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
	RelayList           []RelayListEntry     `json:"relay_list"`
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

type CreateOrReturnBeaconResult struct {
	Beacon  Place `json:"beacon"`
	Created bool  `json:"created"`
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
		RelayList: []RelayListEntry{{
			Name:   s.relayName,
			URL:    s.relayURL,
			Inbox:  true,
			Outbox: true,
		}},
		Places:          places,
		Profiles:        slices.Clone(s.profiles),
		Notes:           slices.Clone(s.notes),
		FeedSegments:    slices.Clone(s.feedSegments),
		CrossRelayItems: slices.Clone(s.crossRelayItems),
	}
}

func (s *Service) CreateNote(geohash, authorPubkey, content string) (Note, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	geohash = strings.TrimSpace(strings.ToLower(geohash))
	if strings.TrimSpace(content) == "" {
		return Note{}, ErrEmptyContent
	}
	if len(content) > MaxNoteContentLength {
		return Note{}, ErrContentTooLong
	}
	if len(geohash) < MinGeohashLength {
		return Note{}, ErrInvalidGeohash
	}
	if !s.hasPlaceLocked(geohash) {
		s.places = append([]Place{{
			Geohash:         geohash,
			Title:           formatAdHocPlaceTitle(geohash),
			Neighborhood:    "Ad hoc presence",
			Description:     "No operator-defined place exists for this tile yet.",
			ActivitySummary: "Presence was set directly from a map click.",
			Tags:            []string{"ad-hoc", "geohash8"},
			Capacity:        8,
			OccupantPubkeys: []string{},
			Unread:          false,
		}}, s.places...)
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

func (s *Service) CreateOrReturnBeacon(geohash, name, picture, about string, tags []string) (CreateOrReturnBeaconResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	geohash = strings.TrimSpace(strings.ToLower(geohash))
	if len(geohash) < MinGeohashLength {
		return CreateOrReturnBeaconResult{}, ErrInvalidGeohash
	}

	if place, ok := s.placeByGeohashLocked(geohash); ok {
		return CreateOrReturnBeaconResult{
			Beacon:  place,
			Created: false,
		}, nil
	}

	name = strings.TrimSpace(name)
	if name == "" {
		return CreateOrReturnBeaconResult{}, ErrEmptyBeaconName
	}

	picture = strings.TrimSpace(picture)
	about = strings.TrimSpace(about)

	beacon := Place{
		Geohash:         geohash,
		Title:           name,
		Neighborhood:    "Newly lit beacon",
		Description:     about,
		ActivitySummary: "Freshly lit beacon.",
		Picture:         picture,
		Tags:            normalizeBeaconTags(tags),
		Capacity:        8,
		OccupantPubkeys: []string{},
		Unread:          false,
	}

	s.places = append([]Place{beacon}, s.places...)

	return CreateOrReturnBeaconResult{
		Beacon:  beacon,
		Created: true,
	}, nil
}

func (s *Service) DefaultRoomGrants(roomID string) (bool, bool, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	geohash, ok := roomIDGeohash(roomID)
	if !ok {
		return false, false, false
	}

	place, ok := s.placeByGeohashLocked(geohash)
	if !ok || !placeHasTag(place.Tags, cohortTag) {
		return false, false, false
	}

	return false, true, true
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

func ResolveRoomID(_ string, geohash string) string {
	return fmt.Sprintf("beacon:%s", geohash)
}

func normalizeBeaconTags(tags []string) []string {
	baseTags := []string{"beacon", "geohash8"}
	seen := map[string]struct{}{}
	normalized := make([]string, 0, len(baseTags)+len(tags))

	for _, tag := range append(baseTags, tags...) {
		trimmed := strings.TrimSpace(strings.ToLower(tag))
		if trimmed == "" {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		normalized = append(normalized, trimmed)
	}

	return normalized
}

func roomIDGeohash(roomID string) (string, bool) {
	trimmed := strings.TrimSpace(roomID)
	geohash, ok := strings.CutPrefix(trimmed, "beacon:")
	if !ok {
		return "", false
	}

	geohash = strings.TrimSpace(strings.ToLower(geohash))
	if len(geohash) < MinGeohashLength {
		return "", false
	}

	return geohash, true
}

func placeHasTag(tags []string, wanted string) bool {
	for _, tag := range tags {
		if strings.EqualFold(strings.TrimSpace(tag), wanted) {
			return true
		}
	}

	return false
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
