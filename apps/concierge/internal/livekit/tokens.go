package livekit

import (
	"context"
	"errors"
	"time"

	livekitauth "github.com/livekit/protocol/auth"

	"github.com/peterwei/synchrono-city/apps/concierge/internal/config"
	"github.com/peterwei/synchrono-city/apps/concierge/internal/store"
)

const DefaultTokenTTL = 10 * time.Minute

var ErrPermissionRequired = errors.New("room permission is required to mint a token")

type TokenResponse struct {
	Token      string    `json:"token"`
	Identity   string    `json:"identity"`
	RoomID     string    `json:"room_id"`
	LiveKitURL string    `json:"livekit_url"`
	ExpiresAt  time.Time `json:"expires_at"`
	Grants     Grants    `json:"grants"`
}

type Grants struct {
	RoomJoin     bool `json:"room_join"`
	CanPublish   bool `json:"can_publish"`
	CanSubscribe bool `json:"can_subscribe"`
}

type TokenService struct {
	apiKey                 string
	apiSecret              string
	liveKitURL             string
	operatorPubkey         string
	tokenTTL               time.Duration
	store                  store.Store
	now                    func() time.Time
	defaultRoomGrantSource interface {
		DefaultRoomGrants(roomID string) (bool, bool, bool)
	}
}

func NewTokenService(cfg config.Config, policyStore store.Store) *TokenService {
	return &TokenService{
		apiKey:         cfg.LiveKitAPIKey,
		apiSecret:      cfg.LiveKitAPISecret,
		liveKitURL:     cfg.LiveKitURL,
		operatorPubkey: cfg.PrimaryOperatorPub,
		tokenTTL:       DefaultTokenTTL,
		store:          policyStore,
		now:            time.Now,
	}
}

func (s *TokenService) SetDefaultRoomGrantSource(source interface {
	DefaultRoomGrants(roomID string) (bool, bool, bool)
}) {
	s.defaultRoomGrantSource = source
}

func (s *TokenService) Issue(ctx context.Context, pubkey, roomID string) (TokenResponse, error) {
	canPublish, canSubscribe, err := s.roomGrants(ctx, pubkey, roomID)
	if err != nil {
		return TokenResponse{}, err
	}

	token, err := livekitauth.NewAccessToken(s.apiKey, s.apiSecret).
		SetIdentity(pubkey).
		SetValidFor(s.tokenTTL).
		SetVideoGrant(&livekitauth.VideoGrant{
			RoomJoin:       true,
			Room:           roomID,
			CanPublish:     boolPtr(canPublish),
			CanSubscribe:   boolPtr(canSubscribe),
			CanPublishData: boolPtr(canPublish),
		}).
		ToJWT()
	if err != nil {
		return TokenResponse{}, err
	}

	return TokenResponse{
		Token:      token,
		Identity:   pubkey,
		RoomID:     roomID,
		LiveKitURL: s.liveKitURL,
		ExpiresAt:  s.now().UTC().Add(s.tokenTTL),
		Grants: Grants{
			RoomJoin:     true,
			CanPublish:   canPublish,
			CanSubscribe: canSubscribe,
		},
	}, nil
}

func (s *TokenService) roomGrants(ctx context.Context, pubkey, roomID string) (bool, bool, error) {
	if pubkey == s.operatorPubkey {
		return true, true, nil
	}

	permission, err := s.store.LatestRoomPermission(ctx, pubkey, roomID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) && s.defaultRoomGrantSource != nil {
			canPublish, canSubscribe, ok := s.defaultRoomGrantSource.DefaultRoomGrants(roomID)
			if ok {
				return canPublish, canSubscribe, nil
			}
		}
		return false, false, ErrPermissionRequired
	}

	return permission.CanPublish, permission.CanSubscribe, nil
}

func boolPtr(value bool) *bool {
	return &value
}
