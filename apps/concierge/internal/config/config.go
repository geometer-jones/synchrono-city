package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

type Config struct {
	Port               string
	LiveKitAPIKey      string
	LiveKitAPISecret   string
	LiveKitURL         string
	DatabaseURL        string
	PrimaryOperatorPub string
	RelayName          string
	RelaySlug          string
	PrimaryRelayURL    string
	SessionSecret      string
	SessionCookieName  string
	SessionTTL         string
	SessionIdleTTL     string
	CSRFSigningSecret  string
	DBMaxOpenConns     int
	DBMaxIdleConns     int
	DBConnMaxLifetime  time.Duration
}

func LoadFromEnv() (Config, error) {
	dbMaxOpenConns, err := envIntOrDefault("DB_MAX_OPEN_CONNS", 25)
	if err != nil {
		return Config{}, err
	}
	dbMaxIdleConns, err := envIntOrDefault("DB_MAX_IDLE_CONNS", 5)
	if err != nil {
		return Config{}, err
	}
	dbConnMaxLifetime, err := envDurationOrDefault("DB_CONN_MAX_LIFETIME", 30*time.Minute)
	if err != nil {
		return Config{}, err
	}

	cfg := Config{
		Port:               envOrDefault("PORT", "3000"),
		LiveKitAPIKey:      os.Getenv("LIVEKIT_API_KEY"),
		LiveKitAPISecret:   os.Getenv("LIVEKIT_API_SECRET"),
		LiveKitURL:         os.Getenv("LIVEKIT_URL"),
		DatabaseURL:        os.Getenv("DATABASE_URL"),
		PrimaryOperatorPub: os.Getenv("PRIMARY_OPERATOR_PUBKEY"),
		RelayName:          os.Getenv("RELAY_NAME"),
		RelaySlug:          os.Getenv("RELAY_SLUG"),
		PrimaryRelayURL:    os.Getenv("PRIMARY_RELAY_URL"),
		SessionSecret:      os.Getenv("SESSION_SECRET"),
		SessionCookieName:  envOrDefault("SESSION_COOKIE_NAME", "synchrono_city_session"),
		SessionTTL:         envOrDefault("SESSION_TTL", "24h"),
		SessionIdleTTL:     envOrDefault("SESSION_IDLE_TTL", "4h"),
		CSRFSigningSecret:  os.Getenv("CSRF_SIGNING_SECRET"),
		DBMaxOpenConns:     dbMaxOpenConns,
		DBMaxIdleConns:     dbMaxIdleConns,
		DBConnMaxLifetime:  dbConnMaxLifetime,
	}

	missing := []string{}
	required := map[string]string{
		"LIVEKIT_API_KEY":         cfg.LiveKitAPIKey,
		"LIVEKIT_API_SECRET":      cfg.LiveKitAPISecret,
		"LIVEKIT_URL":             cfg.LiveKitURL,
		"DATABASE_URL":            cfg.DatabaseURL,
		"PRIMARY_OPERATOR_PUBKEY": cfg.PrimaryOperatorPub,
		"RELAY_NAME":              cfg.RelayName,
		"RELAY_SLUG":              cfg.RelaySlug,
		"PRIMARY_RELAY_URL":       cfg.PrimaryRelayURL,
		"SESSION_SECRET":          cfg.SessionSecret,
		"CSRF_SIGNING_SECRET":     cfg.CSRFSigningSecret,
	}

	for name, value := range required {
		if value == "" {
			missing = append(missing, name)
		}
	}

	if len(missing) > 0 {
		return Config{}, fmt.Errorf("missing required env vars: %v", missing)
	}

	return cfg, nil
}

func envOrDefault(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}

	return fallback
}

func envIntOrDefault(name string, fallback int) (int, error) {
	value := os.Getenv(name)
	if value == "" {
		return fallback, nil
	}

	parsed, err := strconv.Atoi(value)
	if err != nil {
		return 0, fmt.Errorf("%s must be an integer: %w", name, err)
	}
	return parsed, nil
}

func envDurationOrDefault(name string, fallback time.Duration) (time.Duration, error) {
	value := os.Getenv(name)
	if value == "" {
		return fallback, nil
	}

	parsed, err := time.ParseDuration(value)
	if err != nil {
		return 0, fmt.Errorf("%s must be a valid duration: %w", name, err)
	}
	return parsed, nil
}
