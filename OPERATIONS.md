# Synchrono City Operations

This document collects runtime configuration, security, observability, resilience, and verification guidance.

Related docs:

- `README.md` for repository overview
- `PROTOCOL.md` for interoperable contracts
- `ARCHITECTURE.md` for system design and client behavior
- `ROADMAP.md` for phases and open questions

---

## 1. Runtime Configuration

### 1.1 Client Env
```
VITE_CONCIERGE_URL
VITE_NOSTR_RELAY_URL
VITE_BLOSSOM_URL
VITE_MAPBOX_ACCESS_TOKEN
VITE_MAPBOX_STYLE_URL
```

### 1.2 Concierge Env
```
LIVEKIT_API_KEY
LIVEKIT_API_SECRET
LIVEKIT_URL
DATABASE_URL
DB_MAX_OPEN_CONNS
DB_MAX_IDLE_CONNS
DB_CONN_MAX_LIFETIME
PRIMARY_OPERATOR_PUBKEY
RELAY_NAME
RELAY_SLUG
PRIMARY_RELAY_URL
SESSION_SECRET
SESSION_COOKIE_NAME
SESSION_TTL
SESSION_IDLE_TTL
CSRF_SIGNING_SECRET
```

`LIVEKIT_URL` should point at the LiveKit API/WebSocket endpoint that clients connect to, for example `ws://localhost:17880` for local development.

`DB_MAX_OPEN_CONNS`, `DB_MAX_IDLE_CONNS`, and `DB_CONN_MAX_LIFETIME` control the Concierge Postgres pool. Defaults are `25`, `5`, and `30m`.

### 1.2.1 Relay Shim Env
```
CONCIERGE_RELAY_AUTH_URL
```

Default: `http://127.0.0.1:3000/internal/relay/authorize`

### 1.3 Default Ports
| Service | Port |
|---------|------|
| Web | 5173 |
| Concierge | 3000 |
| Relay | 8080 |
| Blossom | 3001 |
| Postgres | 15432 |
| LiveKit HTTP | 17880 |
| LiveKit RTC | 17881 |

---

## 2. Security Model

### 2.1 Threat Mitigations
| Threat | Mitigation |
|--------|------------|
| Sybil attacks | Nostr identity plus optional relay requirements |
| Relay poisoning | Policy shim plus Concierge authorization |
| Spam | Per-user rate limits and local moderation |
| DoS | Rate limiting and connection limits |
| Data exfiltration | Auth required for export, rate-limited |
| Geohash call spoofing | **Accepted risk** - place selection is chosen, not device-verified |

**Place Trust Model:** Geohash selection is explicitly a chosen declaration, not device-verified location. Users can request any place-scoped call. This is by design: place expression conveys intent, not proof. Relays may require additional verification for higher-trust standing, but baseline place selection cannot be cryptographically verified.

### 2.2 Data Classification
| Data | Classification | Handling |
|------|----------------|----------|
| Profile | Public | Signed, exportable |
| Place activity | User-controlled | Relay-visible, tied to live call participation and geohash-tagged note flow |
| Local policy | Relay-local | Stored by operator, auditable |
| Audit log | Operator-only | Not exportable |
| Sessions | Private | Encrypted, TTL |

### 2.3 Session Security

Admin sessions are managed through secure browser cookies.

**Token format:** Signed JWT containing session ID, pubkey, role, and expiration.

**Cookie attributes:**
- `HttpOnly`: Prevents JavaScript access
- `Secure`: HTTPS only
- `SameSite=Strict`: Prevents CSRF
- `Path=/`: Scoped to relay origin

**Session lifecycle:**
- New session on successful NIP-98 authentication
- Regenerate session ID on privilege elevation (e.g., user gains moderator role)
- Invalidate on explicit logout or password change
- Max concurrent sessions per pubkey: 5 (oldest evicted on 6th login)

**Session fixation prevention:**
- Generate new session ID after any role change
- Reject sessions with mismatched pubkey binding

### 2.4 Rate Limiting

All endpoints enforce per-pubkey rate limits to prevent abuse.

| Endpoint | Limit | Window |
|----------|-------|--------|
| Relay publish | 10 | per minute |
| Concierge API (general) | 60 | per minute |
| LiveKit token request | 10 | per minute |
| Blossom upload | 5 | per minute |
| Admin actions | 30 | per minute |

**Rate limit response:**
```
HTTP 429 Too Many Requests
Retry-After: <seconds>
Content-Type: application/json

{
  "error": "rate_limit_exceeded",
  "retry_after": 30
}
```

**Implementation notes:**
- Use sliding window algorithm (Redis-backed)
- Rate limits are per-pubkey, not per-IP
- Separate counters per endpoint type
- Log rate limit violations with pubkey and endpoint

### 2.5 Concierge Single Point of Failure

**Status for v1.0-alpha:** Accepted.

The Concierge is a single point of failure for relay publish authorization. This is acceptable for the first version because:
- Single-operator deployment is the primary use case
- Concierge failure causes relay to fail closed (safe default)
- Circuit breaker prevents cascading failures

**Mitigation in v1.0-alpha:**
- Circuit breaker with automatic recovery
- Health check endpoint for monitoring
- Alert on Concierge unavailability
- Operator runbooks for [relay down](runbooks/relay-down.md) and [Postgres down](runbooks/postgres-down.md)

**Blast radius:**
- New relay publishes are rejected while Concierge is unreachable
- New LiveKit token requests fail because room authorization cannot complete
- Admin writes and audit reads are unavailable until Concierge recovers

**Minimum monitoring guidance:**
- Probe `/healthz` from the same network path used by the relay shim
- Alert if the relay shim reject rate spikes with `relay authorization unavailable`
- Alert if Postgres connectivity errors appear in Concierge logs
- After recovery, validate one publish and one token request before closing the incident

**Deferred to Phase 3+:**
- Active-passive Concierge failover
- Relay degraded mode (allow publishes with policy check caching)

---

## 3. Observability

### 3.1 Metrics
- Event ingestion rate
- Policy evaluation latency
- Relay connection count
- Active sessions
- Error rates by endpoint

### 3.2 Logging
- All API requests (user pubkey, not IP)
- All moderation actions
- All policy changes
- Relay authorization decisions

### 3.3 Alerts (Day 1)
- Relay auth latency > 100ms
- Concierge error rate > 1%
- Postgres connections > 80% of pool
- Relay reject rate spike

### 3.4 Dashboards
- System health (CPU, memory, connections)
- Activity (events, live calls, auth decisions)
- Errors by endpoint
- Geographic distribution
- **Relay health score** (activity trend, guest growth, moderation load)

---

## 4. Circuit Breaker Specification

### 4.1 Purpose

The circuit breaker protects the system from cascading failures when the relay or Concierge becomes unavailable.

### 4.2 States

```
                    CIRCUIT BREAKER STATE MACHINE
                    ==============================

                    ┌─────────────────────────────────────┐
                    │                                     │
                    ▼                                     │
              ┌───────────┐     failures >= 5            │
              │   CLOSED  │─────────────────────────────▶│
              │  (normal) │                              │
              └───────────┘                              │
                    │                                    ▼
                    │ success                      ┌───────────┐
                    │                              │    OPEN   │
                    │                              │ (failing) │
                    │                              └───────────┘
                    │                                    │
                    │                              30s timeout
                    │                                    │
                    │                                    ▼
                    │                              ┌───────────┐
                    │                              │ HALF-OPEN │
                    │                              │  (probe)  │
                    └──────────────────────────┐   └───────────┘
                                               │         │
                                               │   ┌─────┴─────┐
                                               │   │           │
                                               │ success   failure
                                               │   │           │
                                               │   │      failures >= 3
                                               │   │           │
                                               │   ▼           ▼
                                               │ reset   ┌───────────┐
                                               │ count   │    OPEN   │
                                               │         └───────────┘
                                               └─────────────────────
```

### 4.3 Parameters

| Parameter | Value | Description |
|-----------|-------|-------------|
| Failure threshold | 5 | Consecutive failures to open circuit |
| Recovery timeout | 30s | Time before transitioning to half-open |
| Success threshold | 1 | Successful requests in half-open to close |
| Half-open failure threshold | 3 | Failures in half-open to re-open |

### 4.4 Failure Definition

A request is considered a failure if:
- Connection refused or timeout (> 5s)
- HTTP 503 response
- Malformed response (invalid JSON, missing required fields)
- Unexpected HTTP status (not 200/400/401/403/404/409)

### 4.5 Behavior by State

**CLOSED (normal):**
- All requests pass through
- Failure count tracked, reset on success
- Open circuit when threshold reached

**OPEN (failing):**
- All requests fail fast with 503
- Client uses fallback behavior (see below)
- After timeout, transition to half-open

**HALF-OPEN (probe):**
- Allow 1 request through as probe
- If probe succeeds: close circuit, reset counts
- If probe fails: increment half-open failures, re-open if threshold reached

### 4.6 Client Fallback Behavior

When circuit is OPEN:

| Request Type | Fallback |
|--------------|----------|
| Read (GET) | Return cached data if available, else empty result |
| Write (POST/PUT/DELETE) | Queue locally, retry when circuit closes |
| Relay publish | Queue in local buffer, flush when circuit closes |
| LiveKit token | Deny with 503, client shows "media unavailable" |
| Admin action | Deny with 503, client shows "try again later" |

### 4.7 Implementation Notes

- Circuit breaker state should be per-endpoint, not global
- Use exponential backoff for recovery timeout on repeated failures
- Log all state transitions with timestamp and failure count
- Expose circuit state via health check endpoint for monitoring

---

## 5. Error Handling

### 5.1 LiveKit Failure Modes

| Failure | Detection | Response | User Message |
|---------|-----------|----------|--------------|
| LiveKit down | Connection refused, timeout | 503, log error | "Media temporarily unavailable" |
| Token vending fails | API error response | 503, log with pubkey | "Could not join call" |
| Room creation fails | LiveKit error | 500, log with room ID | "Could not create room" |
| User disconnect mid-call | WebSocket close | No server action needed | Client shows "Disconnected" |
| Unexpected response | Malformed JSON, missing fields | 502, log response body | "Media service error" |
| Rate limited by LiveKit | 429 from LiveKit | 503, exponential backoff | "Media busy, try again" |

### 5.2 Blossom Failure Modes

| Failure | Detection | Response | User Message |
|---------|-----------|----------|--------------|
| Blossom server down | Connection refused | 503, log error | "Upload temporarily unavailable" |
| Upload fails mid-file | Incomplete response | 500, cleanup partial | "Upload failed, please retry" |
| SHA-256 mismatch | Hash verification | 400, log attempt | "File corrupted during upload" |
| File too large | Size check before upload | 413, log size | "File too large (max 50 MB)" |
| Invalid MIME type | Type check | 415, log type | "File type not supported" |
| Storage quota exceeded | Server response | 507, log pubkey | "Storage limit reached" |

### 5.3 Geohash Edge Cases

| Case | Detection | Response |
|------|-----------|----------|
| Invalid geohash format | Regex validation | Reject event with 400, "Invalid geohash format" |
| Geohash exceeds precision | Length check | Truncate to policy max (default: 6), accept event |
| Coordinates at boundary | Geohash library handles | Correct prefix returned, normal flow |
| Empty geohash tag | Missing `g` tag | Accept event (geohash optional) |
| Multiple geohash tags | Multiple `g` values | Use longest valid as canonical |

---

## 6. Test Specification

### 5.1 Test Coverage Map

| Component | Test Type | Coverage Needed |
|-----------|-----------|-----------------|
| Client | Unit | Component rendering, state management, geohash generation |
| Client | Integration | Relay connection, Concierge API, geohash call resolution |
| Client | E2E | Full user flows (World, Pulse, Relay Admin) |
| Concierge | Unit | Policy evaluation, auth logic, standing calculation |
| Concierge | Integration | DB operations, relay auth, local policy evaluation |
| Concierge | E2E | Full request/response cycles |
| Relay Shim | Unit | Request/response translation |
| Relay Shim | Integration | Full shim->Concierge flow with failure modes |

### 5.2 Critical Test Scenarios

| Scenario | Type | Description |
|----------|------|-------------|
| NIP-98 expired timestamp | Unit | Timestamp > 5 min old -> 401 |
| NIP-98 invalid signature | Unit | Wrong key -> 401 |
| Relay auth Postgres down | Integration | Connection fail -> deny (fail closed) |
| Relay auth malformed request | Integration | Invalid JSON -> 400 + deny |
| Same geohash same call | Integration | Two users join geohash `9q8yyk` -> same LiveKit room |
| Marker without call | Integration | Kind `1` notes only -> marker renders with latest-note preview and no participant roster |
| Marker with call | Integration | Active call + notes -> marker count plus latest-note preview and participant roster |
| Solo participant availability | Integration | One user in call -> card shows that single participant as available |
| Zero-note active call | Integration | Active call + zero notes -> marker renders `0` plus participant roster |
| Clustered calls | Integration | Adjacent active geohashes -> cluster card shows divided per-call sections |
| Admin non-owner action | Integration | Non-owner tries admin action -> 403 |
| Concurrent config edit | Integration | Two admins edit same config -> 409 for second |
| Geohash boundary | Unit | Coordinates at geohash boundary -> correct prefix |
| Map dense area | Load | 10,000 markers -> clustering activates |
| Session expiry mid-action | E2E | Session expires during form fill -> graceful re-auth |

### 5.3 Chaos Tests

| Test | Trigger | Expected Behavior |
|------|---------|-------------------|
| Kill Postgres mid-request | `docker kill` | Request fails with 503, circuit opens |
| Kill Concierge mid-request | `kill -9` | Shim fails closed, event rejected |
| Network partition relay<->client | `iptables` | Local queue, eventual sync when restored |
| Flood relay 1000 events/sec | Load test | Rate limiting holds, no cascade |
| Corrupted policy record | Broken DB row | Policy evaluation fails closed, log warning |

### 5.4 Test Pyramid

```
                    ┌─────────┐
                   /    E2E    \          2-3 critical flows
                  /─────────────\
                 /  Integration  \       API contracts, DB ops
                /─────────────────\
               /      Unit         \     Logic, validation, utils
              /─────────────────────\
```

### 5.5 Flakiness Mitigations

| Risk | Mitigation |
|------|------------|
| Time-dependent tests (expiration) | Use mockable clock, fixed timestamps |
| External services (relay, LiveKit) | Mock at HTTP layer, contract tests |
| Ordering (room roster updates) | Deterministic test data, explicit ordering |
| Randomness (geohash) | Fixed test coordinates, no random input |

### 5.6 Default Test Names

```
client/
  src/
    __tests__/
      world.test.ts             # Marker rendering, room resolution, place card anchoring
      geohash.test.ts           # Geohash generation, boundary cases
      pulse.test.ts             # Feed projection, note drill-down, follow actions, profile context
      nip98.test.ts             # Auth signature validation

concierge/
  internal/
    auth/auth_test.go           # NIP-98 verification
    policy/policy_test.go       # Policy evaluation
    standing/standing_test.go   # Local standing and room grants
    store/postgres/store_test.go # DB operations
  cmd/concierge/
    handler_test.go             # HTTP handlers
    relay_auth_test.go          # Relay authorization contract
```

### 5.7 Load Test Specifications

| Scenario | Load | p50 Target | p99 Target | Failure Threshold |
|----------|------|------------|------------|-------------------|
| Relay event ingestion | 100 events/sec | < 10ms | < 50ms | > 100ms p99 |
| Policy evaluation | 200 req/sec | < 5ms | < 20ms | > 50ms p99 |
| Map marker render | 10,000 markers | < 100ms | < 500ms | > 1s p99 |
| LiveKit token vending | 50 req/sec | < 20ms | < 100ms | > 200ms p99 |
| Concurrent WebSocket | 1,000 connections | N/A | N/A | Connection drop > 1% |

**Load test procedure:**
1. Start with baseline (10% of target load)
2. Ramp up to target load over 60 seconds
3. Hold target load for 5 minutes
4. Monitor p50, p99, error rate, resource usage
5. Record results and compare to thresholds

**Tools:** k6 or locust for HTTP, custom WebSocket client for relay connections.

### 5.8 Test Data Strategy

**Test pubkeys:**
- Generate deterministic keypairs from seed phrases
- Use fixed test keys in CI, random in local dev
- Never use production keys in tests

**Test events:**
- Factory functions for each event kind
- Deterministic timestamps (fixed clock in tests)
- Geohash test fixtures for boundary cases

**Seed data:**
```
test/
  fixtures/
    pubkeys.json          # 10 test pubkeys with roles
    events.json           # 50 test events across kinds
    geohashes.json        # 20 geohash test cases (valid, invalid, boundary)
    policies.json         # Sample policy configurations
```

**Database seeding:**
- Migrations run before test suite
- Seed data loaded in transaction
- Rollback after each test (unit/integration)
- Full reset between E2E tests

---

## 7. Deployment

### 7.1 Deployment Model

v1.0-alpha uses Docker Compose for single-operator deployment.

**Services:**
- `client`: React app served by nginx
- `concierge`: Go API server
- `relay`: strfry with policy shim
- `blossom`: Blob storage server
- `postgres`: Database
- `redis`: Session/cache store
- `livekit`: Media SFU

### 7.2 Deploy Sequence

```
DEPLOYMENT ORDER
================

1. Pull latest images
2. Run database migrations (Concierge)
3. Restart Concierge (wait for health check)
4. Restart relay (reconnects to Concierge)
5. Restart client (if static assets changed)
6. Verify health checks
7. Run smoke tests
```

**Zero-downtime requirement:**
- Migrations must be backward-compatible
- Concierge must handle requests during relay restart
- Client can be updated independently

### 7.3 Migration Strategy

**Rules:**
1. All migrations are reversible
2. Additive changes only (new columns, new tables)
3. Column renames require two-phase migration:
   - Phase 1: Add new column, backfill, dual-write
   - Phase 2: Remove old column (after deploy stabilizes)
4. Index creation uses `CONCURRENTLY` to avoid locks
5. Never run migrations during peak traffic

**Migration files:**
```
concierge/
  migrations/
    001_initial_schema.up.sql
    001_initial_schema.down.sql
    002_add_standing.up.sql
    002_add_standing.down.sql
```

### 7.4 Rollback Procedure

```
ROLLBACK STEPS
==============

1. Identify issue (logs, metrics, user reports)
2. Decision: rollback or forward-fix
3. If rollback:
   a. git revert <commit>
   b. Rebuild images
   c. Run down migrations (if DB changed)
   d. Redeploy following deploy sequence
4. Verify rollback succeeded
5. Post-incident review
```

**Rollback time budget:**
- Code rollback: < 5 minutes
- Database rollback: < 10 minutes
- Full rollback: < 15 minutes

### 7.5 Health Checks

| Service | Endpoint | Expected |
|---------|----------|----------|
| Concierge | `GET /health` | 200, `{"status":"ok"}` |
| Relay | WebSocket `REQ` | Connection accepted |
| Blossom | `GET /health` | 200 |
| LiveKit | Twirp health | 200 |

### 7.6 Smoke Tests (Post-Deploy)

Run immediately after deployment:
1. Concierge health check returns 200
2. Relay accepts WebSocket connection
3. NIP-98 auth succeeds
4. LiveKit token vending succeeds
5. Policy query returns expected result
