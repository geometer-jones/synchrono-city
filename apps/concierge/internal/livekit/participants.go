package livekit

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"

	livekitauth "github.com/livekit/protocol/auth"
	livekitproto "github.com/livekit/protocol/livekit"
	"github.com/twitchtv/twirp"

	"github.com/peterwei/synchrono-city/apps/concierge/internal/config"
)

var ErrParticipantNotConnected = errors.New("participant is not currently connected")

type ParticipantPermission struct {
	CanPublish   bool
	CanSubscribe bool
}

type ParticipantPermissionUpdater interface {
	UpdateParticipantPermission(ctx context.Context, roomID, identity string, permission ParticipantPermission) error
}

type twirpParticipantPermissionUpdater struct {
	apiKey      string
	apiSecret   string
	roomService livekitproto.RoomService
}

func NewParticipantPermissionUpdater(cfg config.Config) ParticipantPermissionUpdater {
	if strings.TrimSpace(cfg.LiveKitAPIKey) == "" || strings.TrimSpace(cfg.LiveKitAPISecret) == "" || strings.TrimSpace(cfg.LiveKitURL) == "" {
		return nil
	}

	baseURL, err := resolveRoomServiceBaseURL(cfg.LiveKitURL)
	if err != nil {
		return nil
	}

	return &twirpParticipantPermissionUpdater{
		apiKey:      cfg.LiveKitAPIKey,
		apiSecret:   cfg.LiveKitAPISecret,
		roomService: livekitproto.NewRoomServiceProtobufClient(baseURL, &http.Client{Timeout: 5 * time.Second}),
	}
}

func (u *twirpParticipantPermissionUpdater) UpdateParticipantPermission(
	ctx context.Context,
	roomID,
	identity string,
	permission ParticipantPermission,
) error {
	trimmedRoomID := strings.TrimSpace(roomID)
	trimmedIdentity := strings.TrimSpace(identity)
	if trimmedRoomID == "" || trimmedIdentity == "" {
		return errors.New("room id and identity are required")
	}

	authToken, err := livekitauth.NewAccessToken(u.apiKey, u.apiSecret).
		SetVideoGrant(&livekitauth.VideoGrant{
			RoomAdmin: true,
			Room:      trimmedRoomID,
		}).
		ToJWT()
	if err != nil {
		return err
	}

	headers := make(http.Header)
	headers.Set("Authorization", "Bearer "+authToken)
	ctx, err = twirp.WithHTTPRequestHeaders(ctx, headers)
	if err != nil {
		return err
	}

	_, err = u.roomService.UpdateParticipant(ctx, &livekitproto.UpdateParticipantRequest{
		Room:     trimmedRoomID,
		Identity: trimmedIdentity,
		Permission: &livekitproto.ParticipantPermission{
			CanPublish:          permission.CanPublish,
			CanSubscribe:        permission.CanSubscribe,
			CanPublishData:      permission.CanPublish,
			CanSubscribeMetrics: permission.CanSubscribe,
		},
	})
	if err == nil {
		return nil
	}

	var twerr twirp.Error
	if errors.As(err, &twerr) && twerr.Code() == twirp.NotFound {
		return ErrParticipantNotConnected
	}

	return err
}

func resolveRoomServiceBaseURL(raw string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return "", err
	}

	switch parsed.Scheme {
	case "ws":
		parsed.Scheme = "http"
	case "wss":
		parsed.Scheme = "https"
	}

	parsed.RawQuery = ""
	parsed.Fragment = ""

	return strings.TrimRight(parsed.String(), "/"), nil
}
