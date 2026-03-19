package relayshim

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/peterwei/synchrono-city/apps/concierge/internal/circuitbreaker"
	"github.com/peterwei/synchrono-city/apps/concierge/internal/relayauth"
)

type InputMessage struct {
	Type       string `json:"type"`
	Event      Event  `json:"event"`
	ReceivedAt int64  `json:"receivedAt"`
	SourceType string `json:"sourceType"`
	SourceInfo string `json:"sourceInfo"`
	Authed     string `json:"authed,omitempty"`
}

type Event struct {
	ID        string     `json:"id"`
	Pubkey    string     `json:"pubkey"`
	Kind      int        `json:"kind"`
	CreatedAt int64      `json:"created_at"`
	Tags      [][]string `json:"tags"`
}

type OutputMessage struct {
	ID     string `json:"id"`
	Action string `json:"action"`
	Msg    string `json:"msg,omitempty"`
}

type Processor struct {
	endpoint string
	client   *http.Client
	breaker  *circuitbreaker.Breaker
}

func NewProcessor(endpoint string, client *http.Client) *Processor {
	if client == nil {
		client = &http.Client{Timeout: 5 * time.Second}
	}

	return newProcessor(endpoint, client, circuitbreaker.New(circuitbreaker.Config{}))
}

func newProcessor(endpoint string, client *http.Client, breaker *circuitbreaker.Breaker) *Processor {
	return &Processor{
		endpoint: endpoint,
		client:   client,
		breaker:  breaker,
	}
}

func (p *Processor) ProcessLine(ctx context.Context, line []byte) ([]byte, error) {
	var input InputMessage
	if err := json.Unmarshal(bytes.TrimSpace(line), &input); err != nil {
		return nil, err
	}

	if input.Type != "new" {
		return nil, nil
	}

	if err := p.breaker.Allow(); err != nil {
		return marshalOutput(OutputMessage{
			ID:     input.Event.ID,
			Action: "reject",
			Msg:    "error: relay authorization unavailable",
		})
	}

	requestBody, err := json.Marshal(relayauth.Request{
		Action: "publish",
		Scope:  "relay",
		Pubkey: input.Event.Pubkey,
		Event: relayauth.Event{
			ID:        input.Event.ID,
			Kind:      input.Event.Kind,
			CreatedAt: input.Event.CreatedAt,
			Tags:      input.Event.Tags,
		},
	})
	if err != nil {
		return nil, err
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, p.endpoint, bytes.NewReader(requestBody))
	if err != nil {
		return nil, err
	}
	request.Header.Set("Content-Type", "application/json")

	response, err := p.client.Do(request)
	if err != nil {
		p.breaker.RecordFailure()
		return marshalOutput(OutputMessage{
			ID:     input.Event.ID,
			Action: "reject",
			Msg:    "error: relay authorization unavailable",
		})
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		p.breaker.RecordFailure()
		return marshalOutput(OutputMessage{
			ID:     input.Event.ID,
			Action: "reject",
			Msg:    "error: relay authorization unavailable",
		})
	}

	var relayResponse relayauth.Response
	if err := decodeJSON(response.Body, &relayResponse); err != nil {
		p.breaker.RecordFailure()
		return marshalOutput(OutputMessage{
			ID:     input.Event.ID,
			Action: "reject",
			Msg:    "error: relay authorization unavailable",
		})
	}

	p.breaker.RecordSuccess()

	if relayResponse.Allow {
		return marshalOutput(OutputMessage{
			ID:     input.Event.ID,
			Action: "accept",
		})
	}

	return marshalOutput(OutputMessage{
		ID:     input.Event.ID,
		Action: "reject",
		Msg:    fmt.Sprintf("blocked: %s", relayResponse.Reason),
	})
}

func decodeJSON(reader io.Reader, target any) error {
	return json.NewDecoder(reader).Decode(target)
}

func marshalOutput(output OutputMessage) ([]byte, error) {
	encoded, err := json.Marshal(output)
	if err != nil {
		return nil, err
	}
	return append(encoded, '\n'), nil
}
