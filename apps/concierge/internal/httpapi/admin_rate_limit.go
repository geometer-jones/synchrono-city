package httpapi

import (
	"sync"
	"time"
)

const (
	defaultAdminRateLimit       = 30
	defaultAdminRateLimitWindow = time.Minute
)

type rateLimiter struct {
	mu      sync.Mutex
	now     func() time.Time
	limit   int
	window  time.Duration
	entries map[string][]time.Time
}

type rateLimitResult struct {
	Allowed    bool
	RetryAfter time.Duration
}

func newRateLimiter(limit int, window time.Duration) *rateLimiter {
	return &rateLimiter{
		now:     time.Now,
		limit:   limit,
		window:  window,
		entries: map[string][]time.Time{},
	}
}

func (l *rateLimiter) Allow(key string) rateLimitResult {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := l.now()
	cutoff := now.Add(-l.window)
	requests := l.entries[key][:0]
	for _, ts := range l.entries[key] {
		if !ts.Before(cutoff) {
			requests = append(requests, ts)
		}
	}

	if len(requests) >= l.limit {
		retryAfter := requests[0].Add(l.window).Sub(now)
		if retryAfter < 0 {
			retryAfter = 0
		}
		l.entries[key] = requests
		return rateLimitResult{Allowed: false, RetryAfter: retryAfter}
	}

	l.entries[key] = append(requests, now)
	return rateLimitResult{Allowed: true}
}
