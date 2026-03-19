package relayshim

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/peterwei/synchrono-city/apps/concierge/internal/circuitbreaker"
	"github.com/peterwei/synchrono-city/apps/concierge/internal/config"
	"github.com/peterwei/synchrono-city/apps/concierge/internal/httpapi"
	"github.com/peterwei/synchrono-city/apps/concierge/internal/store"
)

func TestProcessorAcceptsAllowedEvent(t *testing.T) {
	policyStore := store.NewMemory()
	server := httptest.NewServer(httpapi.NewServer(config.Config{
		PrimaryOperatorPub: "operator",
	}, policyStore).Handler())
	defer server.Close()

	processor := NewProcessor(server.URL+"/internal/relay/authorize", server.Client())
	line := []byte(`{"type":"new","event":{"id":"event-1","pubkey":"pubkey-1","kind":1,"created_at":1773356400,"tags":[]}}`)

	output, err := processor.ProcessLine(context.Background(), line)
	if err != nil {
		t.Fatalf("process line: %v", err)
	}

	expected := `{"id":"event-1","action":"accept"}`
	if string(output[:len(output)-1]) != expected {
		t.Fatalf("expected %s, got %s", expected, string(output[:len(output)-1]))
	}
}

func TestProcessorRejectsBlockedEvent(t *testing.T) {
	policyStore := store.NewMemory()
	_, err := policyStore.CreatePolicyAssignment(context.Background(), store.PolicyAssignment{
		SubjectPubkey:   "pubkey-1",
		PolicyType:      "block",
		Scope:           "relay",
		GrantedByPubkey: "operator",
	})
	if err != nil {
		t.Fatalf("seed block policy: %v", err)
	}

	server := httptest.NewServer(httpapi.NewServer(config.Config{
		PrimaryOperatorPub: "operator",
	}, policyStore).Handler())
	defer server.Close()

	processor := NewProcessor(server.URL+"/internal/relay/authorize", server.Client())
	line := []byte(`{"type":"new","event":{"id":"event-2","pubkey":"pubkey-1","kind":1,"created_at":1773356400,"tags":[]}}`)

	output, err := processor.ProcessLine(context.Background(), line)
	if err != nil {
		t.Fatalf("process line: %v", err)
	}

	expected := `{"id":"event-2","action":"reject","msg":"blocked: blocked"}`
	if string(output[:len(output)-1]) != expected {
		t.Fatalf("expected %s, got %s", expected, string(output[:len(output)-1]))
	}
}

func TestProcessorFailsClosedWhenConciergeUnavailable(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer server.Close()

	processor := NewProcessor(server.URL+"/internal/relay/authorize", server.Client())
	line := []byte(`{"type":"new","event":{"id":"event-3","pubkey":"pubkey-1","kind":1,"created_at":1773356400,"tags":[]}}`)

	output, err := processor.ProcessLine(context.Background(), line)
	if err != nil {
		t.Fatalf("process line: %v", err)
	}

	expected := `{"id":"event-3","action":"reject","msg":"error: relay authorization unavailable"}`
	if string(output[:len(output)-1]) != expected {
		t.Fatalf("expected %s, got %s", expected, string(output[:len(output)-1]))
	}
}

func TestProcessorCircuitBreakerRecoversAfterConciergeReturns(t *testing.T) {
	var (
		now       = time.Unix(1_773_356_400, 0)
		callCount atomic.Int32
		healthy   atomic.Bool
	)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount.Add(1)
		if !healthy.Load() {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"allow":true,"reason":"policy_open","scope":"relay","capabilities":{"can_moderate":false},"policy":{"publish":{"allowed":true,"reason":"policy_open","mode":"open","proof_requirement":"none","proof_requirement_met":true,"gates":[]}}}`))
	}))
	defer server.Close()

	breaker := circuitbreaker.New(circuitbreaker.Config{
		FailureThreshold:         2,
		RecoveryTimeout:          time.Second,
		SuccessThreshold:         1,
		HalfOpenFailureThreshold: 1,
		Now: func() time.Time {
			return now
		},
	})
	processor := newProcessor(server.URL+"/internal/relay/authorize", server.Client(), breaker)
	line := []byte(`{"type":"new","event":{"id":"event-4","pubkey":"pubkey-1","kind":1,"created_at":1773356400,"tags":[]}}`)

	for range 2 {
		output, err := processor.ProcessLine(context.Background(), line)
		if err != nil {
			t.Fatalf("process line during failure: %v", err)
		}
		expected := `{"id":"event-4","action":"reject","msg":"error: relay authorization unavailable"}`
		if string(output[:len(output)-1]) != expected {
			t.Fatalf("expected %s, got %s", expected, string(output[:len(output)-1]))
		}
	}

	if breaker.State() != circuitbreaker.StateOpen {
		t.Fatalf("expected breaker open, got %s", breaker.State())
	}

	output, err := processor.ProcessLine(context.Background(), line)
	if err != nil {
		t.Fatalf("process line while open: %v", err)
	}
	expected := `{"id":"event-4","action":"reject","msg":"error: relay authorization unavailable"}`
	if string(output[:len(output)-1]) != expected {
		t.Fatalf("expected %s, got %s", expected, string(output[:len(output)-1]))
	}
	if got := callCount.Load(); got != 2 {
		t.Fatalf("expected no extra upstream call while breaker open, got %d", got)
	}

	healthy.Store(true)
	now = now.Add(2 * time.Second)

	output, err = processor.ProcessLine(context.Background(), line)
	if err != nil {
		t.Fatalf("process line after recovery: %v", err)
	}
	expected = `{"id":"event-4","action":"accept"}`
	if string(output[:len(output)-1]) != expected {
		t.Fatalf("expected %s, got %s", expected, string(output[:len(output)-1]))
	}
	if breaker.State() != circuitbreaker.StateClosed {
		t.Fatalf("expected breaker closed, got %s", breaker.State())
	}
	if got := callCount.Load(); got != 3 {
		t.Fatalf("expected recovery probe to hit upstream once, got %d calls", got)
	}
}
