package circuitbreaker

import (
	"errors"
	"sync"
	"time"
)

var ErrCircuitOpen = errors.New("circuit breaker is open")

type State string

const (
	StateClosed                     State = "closed"
	StateOpen                       State = "open"
	StateHalfOpen                   State = "half-open"
	DefaultFailureThreshold               = 5
	DefaultRecoveryTimeout                = 30 * time.Second
	DefaultSuccessThreshold               = 1
	DefaultHalfOpenFailureThreshold       = 3
)

type Config struct {
	FailureThreshold         int
	RecoveryTimeout          time.Duration
	SuccessThreshold         int
	HalfOpenFailureThreshold int
	Now                      func() time.Time
}

type Breaker struct {
	mu               sync.Mutex
	config           Config
	state            State
	consecutiveFails int
	halfOpenFails    int
	halfOpenSuccess  int
	lastOpenedAt     time.Time
}

func New(cfg Config) *Breaker {
	if cfg.FailureThreshold == 0 {
		cfg.FailureThreshold = DefaultFailureThreshold
	}
	if cfg.RecoveryTimeout == 0 {
		cfg.RecoveryTimeout = DefaultRecoveryTimeout
	}
	if cfg.SuccessThreshold == 0 {
		cfg.SuccessThreshold = DefaultSuccessThreshold
	}
	if cfg.HalfOpenFailureThreshold == 0 {
		cfg.HalfOpenFailureThreshold = DefaultHalfOpenFailureThreshold
	}
	if cfg.Now == nil {
		cfg.Now = time.Now
	}

	return &Breaker{
		config: cfg,
		state:  StateClosed,
	}
}

func (b *Breaker) Allow() error {
	b.mu.Lock()
	defer b.mu.Unlock()

	switch b.state {
	case StateClosed:
		return nil
	case StateOpen:
		if b.config.Now().Sub(b.lastOpenedAt) >= b.config.RecoveryTimeout {
			b.state = StateHalfOpen
			b.halfOpenFails = 0
			b.halfOpenSuccess = 0
			return nil
		}
		return ErrCircuitOpen
	case StateHalfOpen:
		if b.halfOpenFails >= b.config.HalfOpenFailureThreshold {
			return ErrCircuitOpen
		}
		return nil
	default:
		return nil
	}
}

func (b *Breaker) RecordSuccess() {
	b.mu.Lock()
	defer b.mu.Unlock()

	switch b.state {
	case StateClosed:
		b.consecutiveFails = 0
	case StateHalfOpen:
		b.halfOpenSuccess++
		if b.halfOpenSuccess >= b.config.SuccessThreshold {
			b.state = StateClosed
			b.consecutiveFails = 0
			b.halfOpenFails = 0
			b.halfOpenSuccess = 0
		}
	}
}

func (b *Breaker) RecordFailure() {
	b.mu.Lock()
	defer b.mu.Unlock()

	switch b.state {
	case StateClosed:
		b.consecutiveFails++
		if b.consecutiveFails >= b.config.FailureThreshold {
			b.state = StateOpen
			b.lastOpenedAt = b.config.Now()
		}
	case StateHalfOpen:
		b.halfOpenFails++
		if b.halfOpenFails >= b.config.HalfOpenFailureThreshold {
			b.state = StateOpen
			b.lastOpenedAt = b.config.Now()
		}
	}
}

func (b *Breaker) State() State {
	b.mu.Lock()
	defer b.mu.Unlock()

	if b.state == StateOpen && b.config.Now().Sub(b.lastOpenedAt) >= b.config.RecoveryTimeout {
		return StateHalfOpen
	}

	return b.state
}
