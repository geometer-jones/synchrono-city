package oauthflow

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

const stateCookieTTL = 10 * time.Minute

var (
	ErrNotConfigured     = errors.New("oauth is not configured")
	ErrMissingState      = errors.New("oauth state is missing")
	ErrInvalidState      = errors.New("oauth state is invalid")
	ErrExpiredState      = errors.New("oauth state expired")
	ErrMissingCode       = errors.New("oauth code is missing")
	ErrMissingUserInfo   = errors.New("oauth userinfo is missing")
	ErrMissingSubject    = errors.New("oauth subject is missing")
	ErrMissingReturnPath = errors.New("oauth return path is missing")
)

type Config struct {
	IssuerURL    string
	ClientID     string
	ClientSecret string
	RedirectURL  string
	Scopes       []string
	CookieName   string
	SigningKey   string
}

type Service struct {
	cfg        Config
	httpClient *http.Client
	now        func() time.Time

	mu        sync.RWMutex
	discovery *discoveryDocument
}

type Result struct {
	Pubkey     string
	ReturnTo   string
	ProofValue string
	Metadata   map[string]string
}

type stateCookiePayload struct {
	Pubkey       string `json:"pubkey"`
	ReturnTo     string `json:"return_to"`
	ClientOrigin string `json:"client_origin,omitempty"`
	State        string `json:"state"`
	CodeVerifier string `json:"code_verifier"`
	ExpiresAt    string `json:"expires_at"`
}

type discoveryDocument struct {
	Issuer                string `json:"issuer"`
	AuthorizationEndpoint string `json:"authorization_endpoint"`
	TokenEndpoint         string `json:"token_endpoint"`
	UserinfoEndpoint      string `json:"userinfo_endpoint"`
}

type tokenResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
}

func New(cfg Config) *Service {
	return &Service{
		cfg:        cfg,
		httpClient: http.DefaultClient,
		now:        time.Now,
	}
}

func (s *Service) Enabled() bool {
	return strings.TrimSpace(s.cfg.IssuerURL) != "" &&
		strings.TrimSpace(s.cfg.ClientID) != "" &&
		strings.TrimSpace(s.cfg.ClientSecret) != "" &&
		strings.TrimSpace(s.cfg.RedirectURL) != "" &&
		strings.TrimSpace(s.cfg.SigningKey) != ""
}

func (s *Service) Begin(w http.ResponseWriter, r *http.Request, pubkey, returnTo string) (string, error) {
	if !s.Enabled() {
		return "", ErrNotConfigured
	}

	discovery, err := s.loadDiscovery(r.Context())
	if err != nil {
		return "", err
	}

	stateValue, err := randomToken(24)
	if err != nil {
		return "", err
	}
	codeVerifier, err := randomToken(32)
	if err != nil {
		return "", err
	}
	codeChallenge := hashBase64URL(codeVerifier)

	cleanReturnTo, err := sanitizeReturnTo(returnTo)
	if err != nil {
		return "", err
	}

	payload := stateCookiePayload{
		Pubkey:       strings.TrimSpace(pubkey),
		ReturnTo:     cleanReturnTo,
		ClientOrigin: requestClientOrigin(r),
		State:        stateValue,
		CodeVerifier: codeVerifier,
		ExpiresAt:    s.now().Add(stateCookieTTL).UTC().Format(time.RFC3339),
	}

	signedValue, err := s.signCookiePayload(payload)
	if err != nil {
		return "", err
	}

	http.SetCookie(w, &http.Cookie{
		Name:     s.cookieName(),
		Value:    signedValue,
		Path:     "/api/v1/oauth",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   isSecureRequest(r),
		MaxAge:   int(stateCookieTTL / time.Second),
	})

	scopes := s.cfg.Scopes
	if len(scopes) == 0 {
		scopes = []string{"openid", "profile", "email"}
	}

	authorizationURL, err := url.Parse(discovery.AuthorizationEndpoint)
	if err != nil {
		return "", err
	}
	query := authorizationURL.Query()
	query.Set("client_id", s.cfg.ClientID)
	query.Set("redirect_uri", s.cfg.RedirectURL)
	query.Set("response_type", "code")
	query.Set("scope", strings.Join(scopes, " "))
	query.Set("state", stateValue)
	query.Set("code_challenge", codeChallenge)
	query.Set("code_challenge_method", "S256")
	authorizationURL.RawQuery = query.Encode()

	return authorizationURL.String(), nil
}

func (s *Service) Complete(w http.ResponseWriter, r *http.Request) (Result, error) {
	if !s.Enabled() {
		return Result{}, ErrNotConfigured
	}

	state := strings.TrimSpace(r.URL.Query().Get("state"))
	if state == "" {
		return Result{}, ErrMissingState
	}
	code := strings.TrimSpace(r.URL.Query().Get("code"))
	if code == "" {
		return Result{}, ErrMissingCode
	}

	payload, err := s.readStateCookie(r)
	if err != nil {
		return Result{}, err
	}
	if payload.State != state {
		return Result{}, ErrInvalidState
	}

	expiresAt, err := time.Parse(time.RFC3339, payload.ExpiresAt)
	if err != nil {
		return Result{}, ErrInvalidState
	}
	if s.now().After(expiresAt) {
		return Result{}, ErrExpiredState
	}

	discovery, err := s.loadDiscovery(r.Context())
	if err != nil {
		return Result{}, err
	}

	tokenPayload, err := s.exchangeCode(r.Context(), discovery.TokenEndpoint, code, payload.CodeVerifier)
	if err != nil {
		return Result{}, err
	}

	userInfo, err := s.fetchUserInfo(r.Context(), discovery.UserinfoEndpoint, tokenPayload.AccessToken)
	if err != nil {
		return Result{}, err
	}

	subject, _ := userInfo["sub"].(string)
	subject = strings.TrimSpace(subject)
	if subject == "" {
		return Result{}, ErrMissingSubject
	}

	metadata := map[string]string{
		"issuer":  strings.TrimSpace(discovery.Issuer),
		"subject": subject,
	}
	for _, key := range []string{"preferred_username", "email", "name"} {
		if value, _ := userInfo[key].(string); strings.TrimSpace(value) != "" {
			metadata[key] = strings.TrimSpace(value)
		}
	}

	s.clearStateCookie(w, r)

	return Result{
		Pubkey:     payload.Pubkey,
		ReturnTo:   buildReturnTo(payload.ReturnTo, payload.ClientOrigin),
		ProofValue: fmt.Sprintf("%s#%s", strings.TrimSpace(discovery.Issuer), subject),
		Metadata:   metadata,
	}, nil
}

func (s *Service) PeekReturnTo(r *http.Request) string {
	payload, err := s.readStateCookie(r)
	if err != nil {
		return "/app/settings"
	}
	return buildReturnTo(payload.ReturnTo, payload.ClientOrigin)
}

func (s *Service) Clear(w http.ResponseWriter, r *http.Request) {
	s.clearStateCookie(w, r)
}

func (s *Service) loadDiscovery(ctx context.Context) (discoveryDocument, error) {
	s.mu.RLock()
	if s.discovery != nil {
		discovery := *s.discovery
		s.mu.RUnlock()
		return discovery, nil
	}
	s.mu.RUnlock()

	discoveryURL := strings.TrimRight(strings.TrimSpace(s.cfg.IssuerURL), "/") + "/.well-known/openid-configuration"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, discoveryURL, nil)
	if err != nil {
		return discoveryDocument{}, err
	}

	response, err := s.httpClient.Do(req)
	if err != nil {
		return discoveryDocument{}, err
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
		return discoveryDocument{}, fmt.Errorf("oauth discovery failed: %s", strings.TrimSpace(string(body)))
	}

	var payload discoveryDocument
	if err := json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&payload); err != nil {
		return discoveryDocument{}, err
	}
	if payload.AuthorizationEndpoint == "" || payload.TokenEndpoint == "" || payload.UserinfoEndpoint == "" {
		return discoveryDocument{}, ErrMissingUserInfo
	}

	s.mu.Lock()
	s.discovery = &payload
	s.mu.Unlock()

	return payload, nil
}

func (s *Service) exchangeCode(ctx context.Context, endpoint, code, codeVerifier string) (tokenResponse, error) {
	form := url.Values{}
	form.Set("grant_type", "authorization_code")
	form.Set("code", code)
	form.Set("redirect_uri", s.cfg.RedirectURL)
	form.Set("client_id", s.cfg.ClientID)
	form.Set("client_secret", s.cfg.ClientSecret)
	form.Set("code_verifier", codeVerifier)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return tokenResponse{}, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	response, err := s.httpClient.Do(req)
	if err != nil {
		return tokenResponse{}, err
	}
	defer response.Body.Close()

	body, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return tokenResponse{}, err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return tokenResponse{}, fmt.Errorf("oauth token exchange failed: %s", strings.TrimSpace(string(body)))
	}

	var payload tokenResponse
	if err := json.Unmarshal(body, &payload); err != nil {
		return tokenResponse{}, err
	}
	if strings.TrimSpace(payload.AccessToken) == "" {
		return tokenResponse{}, errors.New("oauth token exchange returned no access_token")
	}

	return payload, nil
}

func (s *Service) fetchUserInfo(ctx context.Context, endpoint, accessToken string) (map[string]any, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/json")

	response, err := s.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()

	body, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, fmt.Errorf("oauth userinfo failed: %s", strings.TrimSpace(string(body)))
	}

	payload := map[string]any{}
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, err
	}
	if len(payload) == 0 {
		return nil, ErrMissingUserInfo
	}

	return payload, nil
}

func (s *Service) readStateCookie(r *http.Request) (stateCookiePayload, error) {
	cookie, err := r.Cookie(s.cookieName())
	if err != nil {
		return stateCookiePayload{}, ErrMissingState
	}

	return s.verifyCookiePayload(cookie.Value)
}

func (s *Service) signCookiePayload(payload stateCookiePayload) (string, error) {
	rawPayload, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

	encodedPayload := base64.RawURLEncoding.EncodeToString(rawPayload)
	signature := s.sign(encodedPayload)
	return encodedPayload + "." + signature, nil
}

func (s *Service) verifyCookiePayload(value string) (stateCookiePayload, error) {
	encodedPayload, signature, ok := strings.Cut(strings.TrimSpace(value), ".")
	if !ok || encodedPayload == "" || signature == "" {
		return stateCookiePayload{}, ErrInvalidState
	}
	if !hmac.Equal([]byte(signature), []byte(s.sign(encodedPayload))) {
		return stateCookiePayload{}, ErrInvalidState
	}

	rawPayload, err := base64.RawURLEncoding.DecodeString(encodedPayload)
	if err != nil {
		return stateCookiePayload{}, ErrInvalidState
	}

	var payload stateCookiePayload
	if err := json.Unmarshal(rawPayload, &payload); err != nil {
		return stateCookiePayload{}, ErrInvalidState
	}
	if strings.TrimSpace(payload.Pubkey) == "" || strings.TrimSpace(payload.ReturnTo) == "" || strings.TrimSpace(payload.CodeVerifier) == "" {
		return stateCookiePayload{}, ErrInvalidState
	}

	return payload, nil
}

func (s *Service) sign(value string) string {
	mac := hmac.New(sha256.New, []byte(s.cfg.SigningKey))
	_, _ = mac.Write([]byte(value))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func (s *Service) clearStateCookie(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     s.cookieName(),
		Value:    "",
		Path:     "/api/v1/oauth",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   isSecureRequest(r),
		MaxAge:   -1,
	})
}

func (s *Service) cookieName() string {
	if strings.TrimSpace(s.cfg.CookieName) != "" {
		return s.cfg.CookieName
	}
	return "synchrono_city_oauth_state"
}

func sanitizeReturnTo(value string) (string, error) {
	if strings.TrimSpace(value) == "" {
		return "/app/settings", nil
	}

	parsed, err := url.Parse(value)
	if err != nil {
		return "", err
	}
	if parsed.IsAbs() || parsed.Host != "" {
		return "", ErrMissingReturnPath
	}
	if !strings.HasPrefix(parsed.Path, "/") {
		return "", ErrMissingReturnPath
	}

	if parsed.RawQuery == "" && parsed.Fragment == "" {
		return parsed.Path, nil
	}

	result := parsed.Path
	if parsed.RawQuery != "" {
		result += "?" + parsed.RawQuery
	}
	if parsed.Fragment != "" {
		result += "#" + parsed.Fragment
	}
	return result, nil
}

func buildReturnTo(path, clientOrigin string) string {
	trimmedPath := strings.TrimSpace(path)
	if trimmedPath == "" {
		trimmedPath = "/app/settings"
	}

	trimmedOrigin := strings.TrimSpace(clientOrigin)
	if trimmedOrigin == "" {
		return trimmedPath
	}

	originURL, err := url.Parse(trimmedOrigin)
	if err != nil || originURL.Scheme == "" || originURL.Host == "" {
		return trimmedPath
	}

	pathURL, err := url.Parse(trimmedPath)
	if err != nil {
		return trimmedPath
	}

	return originURL.ResolveReference(pathURL).String()
}

func requestClientOrigin(r *http.Request) string {
	for _, candidate := range []string{r.Header.Get("Origin"), r.Header.Get("Referer")} {
		origin := sanitizeClientOrigin(candidate)
		if origin != "" {
			return origin
		}
	}
	return ""
}

func sanitizeClientOrigin(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}

	parsed, err := url.Parse(trimmed)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return ""
	}

	return (&url.URL{Scheme: parsed.Scheme, Host: parsed.Host}).String()
}

func hashBase64URL(value string) string {
	sum := sha256.Sum256([]byte(value))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

func randomToken(size int) (string, error) {
	bytes := make([]byte, size)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(bytes), nil
}

func isSecureRequest(r *http.Request) bool {
	if r.TLS != nil {
		return true
	}
	return strings.EqualFold(strings.TrimSpace(r.Header.Get("X-Forwarded-Proto")), "https")
}
