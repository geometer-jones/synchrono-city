package nip98

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/nbd-wtf/go-nostr"
)

const (
	KindHTTPAuth   = 27235
	DefaultMaxSkew = 60 * time.Second
	MaxBodyBytes   = 1 << 20
)

var (
	ErrMissingAuthHeader = errors.New("missing Authorization header")
	ErrInvalidScheme     = errors.New("authorization scheme must be Nostr")
	ErrInvalidEncoding   = errors.New("authorization payload must be base64")
	ErrInvalidJSON       = errors.New("authorization payload must be valid JSON")
	ErrInvalidKind       = errors.New("authorization event kind must be 27235")
	ErrStaleEvent        = errors.New("authorization event is outside the allowed time window")
	ErrInvalidURL        = errors.New("authorization URL tag does not match request URL")
	ErrInvalidMethod     = errors.New("authorization method tag does not match request method")
	ErrMissingPayloadTag = errors.New("authorization payload tag is required for requests with a body")
	ErrInvalidPayload    = errors.New("authorization payload tag does not match request body")
	ErrInvalidID         = errors.New("authorization event id is invalid")
	ErrInvalidSignature  = errors.New("authorization event signature is invalid")
)

type Verifier struct {
	now     func() time.Time
	maxSkew time.Duration
}

type Result struct {
	Pubkey string
	Event  nostr.Event
	Body   []byte
}

func NewVerifier() *Verifier {
	return &Verifier{
		now:     time.Now,
		maxSkew: DefaultMaxSkew,
	}
}

func (v *Verifier) VerifyRequest(r *http.Request) (Result, error) {
	header := strings.TrimSpace(r.Header.Get("Authorization"))
	if header == "" {
		return Result{}, ErrMissingAuthHeader
	}

	scheme, encoded, ok := strings.Cut(header, " ")
	if !ok || scheme != "Nostr" {
		return Result{}, ErrInvalidScheme
	}

	payload, err := base64.StdEncoding.DecodeString(strings.TrimSpace(encoded))
	if err != nil {
		return Result{}, ErrInvalidEncoding
	}

	var event nostr.Event
	if err := json.Unmarshal(payload, &event); err != nil {
		return Result{}, ErrInvalidJSON
	}

	if event.Kind != KindHTTPAuth {
		return Result{}, ErrInvalidKind
	}

	createdAt := event.CreatedAt.Time()
	if createdAt.Before(v.now().Add(-v.maxSkew)) || createdAt.After(v.now().Add(v.maxSkew)) {
		return Result{}, ErrStaleEvent
	}

	if !event.CheckID() {
		return Result{}, ErrInvalidID
	}

	ok, err = event.CheckSignature()
	if err != nil || !ok {
		return Result{}, ErrInvalidSignature
	}

	expectedURL := absoluteRequestURL(r)
	if event.Tags.GetFirst([]string{"u", ""}).Value() != expectedURL {
		return Result{}, fmt.Errorf("%w: expected %s", ErrInvalidURL, expectedURL)
	}

	if event.Tags.GetFirst([]string{"method", ""}).Value() != r.Method {
		return Result{}, fmt.Errorf("%w: expected %s", ErrInvalidMethod, r.Method)
	}

	body, err := readRequestBody(r)
	if err != nil {
		return Result{}, err
	}

	if len(body) > 0 {
		payloadTag := event.Tags.GetFirst([]string{"payload", ""}).Value()
		if payloadTag == "" {
			return Result{}, ErrMissingPayloadTag
		}

		sum := sha256.Sum256(body)
		if payloadTag != hex.EncodeToString(sum[:]) {
			return Result{}, ErrInvalidPayload
		}
	}

	return Result{
		Pubkey: event.PubKey,
		Event:  event,
		Body:   body,
	}, nil
}

func absoluteRequestURL(r *http.Request) string {
	if r.URL == nil {
		return ""
	}

	if r.URL.IsAbs() {
		return r.URL.String()
	}

	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	if forwarded := strings.TrimSpace(r.Header.Get("X-Forwarded-Proto")); forwarded != "" {
		scheme = forwarded
	}

	host := r.Host
	if host == "" {
		host = r.URL.Host
	}

	return fmt.Sprintf("%s://%s%s", scheme, host, r.URL.RequestURI())
}

func readRequestBody(r *http.Request) ([]byte, error) {
	if r.Body == nil {
		return nil, nil
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, MaxBodyBytes))
	if err != nil {
		return nil, err
	}

	r.Body = io.NopCloser(bytes.NewReader(body))
	return body, nil
}
