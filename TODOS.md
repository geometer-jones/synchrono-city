# Implementation Considerations

Items identified during architecture review that should be addressed during implementation.

---

## From Phase 1 MVP Eng Review (2026-03-18)

### P1: Critical (Must fix before commit)

#### Policy Lookup Error Handling
- **What:** Log and deny-by-default when ActivePolicyAssignments lookup fails
- **Why:** Security - currently silently allows blocked users through on DB error
- **Effort:** S
- **Notes:** Critical security fix. May block legitimate users during DB issues.

#### Policy Service Unit Tests
- **What:** Add policy_service_test.go with table-driven tests for all Evaluate paths
- **Why:** Security boundary needs direct test coverage
- **Effort:** M
- **Notes:** Test: operator, blocked, banned, suspended, room permissions.

#### Concierge SPOF Documentation
- **What:** Document Concierge as SPOF in OPERATIONS.md with monitoring guidance
- **Why:** Operators need to understand that Concierge outage blocks all relay publishes
- **Effort:** S
- **Notes:** The circuit breaker fails closed (safe), but operators should know the blast radius.

### P2: Should fix soon

#### Rate Limiting for Admin Endpoints
- **What:** Add in-memory rate limiter to httpapi.Server (requests/minute per pubkey)
- **Why:** Prevent abuse of admin endpoints from compromised keys
- **Effort:** S
- **Notes:** Simple token bucket implementation, ~20 lines. Not distributed.

#### HTTP Timeout Middleware
- **What:** Add ReadTimeout, WriteTimeout, IdleTimeout to HTTP server
- **Why:** Prevent slowloris attacks and resource exhaustion
- **Effort:** S
- **Notes:** Use http.Server with configured timeouts.

#### Graceful Shutdown
- **What:** Add signal handling with context-based shutdown to Concierge main.go
- **Why:** Clean in-flight request completion on deploy/restart
- **Effort:** S
- **Notes:** Use os.Signal + http.Server.Shutdown with 30s grace period.

#### Admin Input Validation
- **What:** Add validation helpers for pubkey format, standing enum, policy_type enum
- **Why:** Prevent invalid data from entering the system
- **Effort:** M
- **Notes:** Pubkey should be 64-char hex or npub. Standing: guest/member/moderator/owner/banned/suspended.

#### Audit Error Logging
- **What:** Log audit entry creation failures with log.Printf
- **Why:** Visibility into audit logging problems without failing requests
- **Effort:** S
- **Notes:** Don't fail the request - audit is side effect, not primary operation.

#### Room Permissions Indexes
- **What:** Add composite index (subject_pubkey, room_id) and index on room_id
- **Why:** Optimize room-scoped queries for future admin features
- **Effort:** S
- **Notes:** Add to new migration file 0002_room_permissions_indexes.sql.

#### Postgres Integration Tests
- **What:** Add integration tests for PostgresStore using test database
- **Why:** Validate SQL queries against real database
- **Effort:** M
- **Notes:** Use testcontainers or Docker Compose. Add to CI.

#### Shim Circuit Breaker Integration Tests
- **What:** Add tests simulating repeated failures and recovery in shim
- **Why:** Verify circuit breaker state transitions in integration
- **Effort:** S
- **Notes:** Simulate Concierge going down and coming back up.

#### Postgres Connection Pool Configuration
- **What:** Add config options for max_open (25), max_idle (5), conn_lifetime (30m)
- **Why:** Production-ready connection management
- **Effort:** S
- **Notes:** Add to config.go with env vars.

#### Minimal Client API Layer
- **What:** Create `api.ts` module with typed fetch functions and ErrorBoundary component
- **Why:** Prepare client for real backend integration in Phase 2
- **Effort:** M
- **Notes:** Keep minimal - just fetch wrapper and error boundary.

### P3: Nice to have

#### Extract Magic Values to Constants
- **What:** Create constants for timeouts, thresholds, limits in relevant packages
- **Why:** Clarity and maintainability
- **Effort:** S
- **Notes:** Values: CB thresholds (5, 30s, 1, 3), token TTL (10m), NIP-98 skew (60s), body limit (1MB).

#### Consolidate defaultScope Function
- **What:** Move defaultScope to store package as exported function
- **Why:** DRY - currently duplicated in postgres.go and server.go
- **Effort:** S
- **Notes:** Import change in httpapi package.

#### Mapbox Error Handling
- **What:** Add .catch() to Mapbox dynamic import and show error message
- **Why:** User feedback when map fails to load
- **Effort:** S
- **Notes:** Show "Map failed to load" message in map surface.

#### Client Route Smoke Tests
- **What:** Add smoke tests for ChatsRoute, PulseRoute, SettingsRoute
- **Why:** Verify all routes render without crashing
- **Effort:** S
- **Notes:** Just verify render - no interaction tests yet.

---

## Client

### Double-Click Protection
- **What:** Prevent duplicate form submissions on double-click
- **Why:** Users may double-click submit buttons, causing duplicate actions
- **Where:** Admin forms, note posting, LiveKit token requests
- **Effort:** S
- **Priority:** P2
- **Approach:** Disable button after first click, use idempotency keys for API calls

### Upload Cancellation
- **What:** Handle user cancelling file upload mid-stream
- **Why:** Partial uploads should not consume storage
- **Where:** Blossom upload flow
- **Effort:** S
- **Priority:** P3
- **Approach:** Abort request, server cleans up partial file on disconnect

### Rapid Map Interaction
- **What:** Debounce map pan/zoom events
- **Why:** Rapid interaction causes excessive API calls
- **Where:** World view map
- **Effort:** S
- **Priority:** P3
- **Approach:** Debounce geohash queries, cache tile data

---

## Concierge

### Database Indexes
- **What:** Create indexes for common query patterns
- **Why:** Avoid N+1 queries and slow lookups
- **Where:** Policy queries, standing lookups, audit log
- **Effort:** S
- **Priority:** P1
- **Indexes needed:**
  - `pubkey` on policy table
  - `pubkey, scope` on standing table
  - `created_at` on audit log

### N+1 Query Prevention
- **What:** Use eager loading for associations
- **Why:** Avoid N+1 queries when loading policy + standing + roles
- **Where:** Policy evaluation, admin dashboard
- **Effort:** S
- **Priority:** P1
- **Approach:** Join queries or batch loading

---

## Operations

### Runbooks (from ROADMAP.md)
- **What:** Incident response procedures
- **Why:** Operators need guidance for common failure modes
- **Effort:** S
- **Priority:** P1
- **Items:**
  - Relay down
  - Postgres down
  - Spam attack
  - Moderation escalation
  - Guest list lockout

---

## Deferred to Later Phases

### Concierge HA (Phase 3+)
- Active-passive failover for Concierge
- Currently accepted as SPOF for v1.0-alpha

### Relay Degraded Mode (Phase 3+)
- Allow publishes when Concierge is unavailable
- Cache policy decisions with TTL
