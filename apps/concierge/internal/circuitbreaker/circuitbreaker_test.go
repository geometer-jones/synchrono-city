package circuitbreaker

import (
	"testing"
	"time"
)

func TestBreakerOpensAfterFailures(t *testing.T) {
	now := time.Date(2026, 3, 18, 12, 0, 0, 0, time.UTC)
	breaker := New(Config{
		FailureThreshold: 2,
		RecoveryTimeout:  30 * time.Second,
		Now: func() time.Time {
			return now
		},
	})

	breaker.RecordFailure()
	breaker.RecordFailure()

	if got := breaker.State(); got != StateOpen {
		t.Fatalf("expected open state, got %s", got)
	}
}

func TestBreakerMovesToHalfOpenAfterTimeout(t *testing.T) {
	now := time.Date(2026, 3, 18, 12, 0, 0, 0, time.UTC)
	breaker := New(Config{
		FailureThreshold: 1,
		RecoveryTimeout:  30 * time.Second,
		Now: func() time.Time {
			return now
		},
	})

	breaker.RecordFailure()
	now = now.Add(31 * time.Second)

	if err := breaker.Allow(); err != nil {
		t.Fatalf("expected half-open probe to be allowed, got %v", err)
	}
	if got := breaker.State(); got != StateHalfOpen {
		t.Fatalf("expected half-open state, got %s", got)
	}
}

func TestBreakerClosesAfterHalfOpenSuccess(t *testing.T) {
	now := time.Date(2026, 3, 18, 12, 0, 0, 0, time.UTC)
	breaker := New(Config{
		FailureThreshold: 1,
		RecoveryTimeout:  time.Second,
		Now: func() time.Time {
			return now
		},
	})

	breaker.RecordFailure()
	now = now.Add(2 * time.Second)

	if err := breaker.Allow(); err != nil {
		t.Fatalf("expected half-open probe to be allowed, got %v", err)
	}

	breaker.RecordSuccess()

	if got := breaker.State(); got != StateClosed {
		t.Fatalf("expected closed state, got %s", got)
	}
}
