# Implementation Considerations

Items identified during architecture review that should be addressed during implementation.

Status tags below were updated against the current codebase on 2026-03-18.

---

## From Phase 1 MVP Eng Review (2026-03-18)

### P1: Critical (Must fix before commit)

#### Policy Lookup Error Handling [done]
- **What:** Log and deny-by-default when ActivePolicyAssignments lookup fails
- **Why:** Security - currently silently allows blocked users through on DB error
- **Effort:** S
- **Notes:** Critical security fix. May block legitimate users during DB issues.

#### Policy Service Unit Tests [done]
- **What:** Add policy_service_test.go with table-driven tests for all Evaluate paths
- **Why:** Security boundary needs direct test coverage
- **Effort:** M
- **Notes:** Test: operator, blocked, banned, suspended, room permissions.

#### Concierge SPOF Documentation [done]
- **What:** Document Concierge as SPOF in OPERATIONS.md with monitoring guidance
- **Why:** Operators need to understand that Concierge outage blocks all relay publishes
- **Effort:** S
- **Notes:** The circuit breaker fails closed (safe), but operators should know the blast radius.

### P2: Should fix soon

#### Rate Limiting for Admin Endpoints [done]
- **What:** Add in-memory rate limiter to httpapi.Server (requests/minute per pubkey)
- **Why:** Prevent abuse of admin endpoints from compromised keys
- **Effort:** S
- **Notes:** Simple token bucket implementation, ~20 lines. Not distributed.

#### HTTP Timeout Middleware [done]
- **What:** Add ReadTimeout, WriteTimeout, IdleTimeout to HTTP server
- **Why:** Prevent slowloris attacks and resource exhaustion
- **Effort:** S
- **Notes:** Use http.Server with configured timeouts.

#### Graceful Shutdown [done]
- **What:** Add signal handling with context-based shutdown to Concierge main.go
- **Why:** Clean in-flight request completion on deploy/restart
- **Effort:** S
- **Notes:** Use os.Signal + http.Server.Shutdown with 30s grace period.

#### Admin Input Validation [done]
- **What:** Add validation helpers for pubkey format, standing enum, policy_type enum
- **Why:** Prevent invalid data from entering the system
- **Effort:** M
- **Notes:** Pubkey should be 64-char hex or npub. Standing: guest/member/moderator/owner/banned/suspended.

#### Audit Error Logging [done]
- **What:** Log audit entry creation failures with log.Printf
- **Why:** Visibility into audit logging problems without failing requests
- **Effort:** S
- **Notes:** Don't fail the request - audit is side effect, not primary operation.

#### Room Permissions Indexes [done]
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

#### Postgres Connection Pool Configuration [done]
- **What:** Add config options for max_open (25), max_idle (5), conn_lifetime (30m)
- **Why:** Production-ready connection management
- **Effort:** S
- **Notes:** Add to config.go with env vars.

#### Minimal Client API Layer [done]
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

#### Consolidate defaultScope Function [done]
- **What:** Move defaultScope to store package as exported function
- **Why:** DRY - currently duplicated in postgres.go and server.go
- **Effort:** S
- **Notes:** Import change in httpapi package.

#### Mapbox Error Handling [done]
- **What:** Add .catch() to Mapbox dynamic import and show error message
- **Why:** User feedback when map fails to load
- **Effort:** S
- **Notes:** Show "Map failed to load" message in map surface.

#### Client Route Smoke Tests [done]
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

### Runbooks (from ROADMAP.md) [done]
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

## Phase 3: Relay Governance (Client Admin UI)

From Eng Review (2026-03-18). Backend complete, client UI needed.

Current state: the Settings route now includes authenticated governance workflows and paginated audit review. Remaining items in this section are optional enhancements rather than blockers for Phase 3.

### P1: Critical

#### NIP-98 Admin Auth Flow [done]
- **What:** Implement challenge-response auth for admin endpoints
- **Why:** Backend requires NIP-98 auth; client has no signing mechanism
- **Effort:** M (~4h)
- **Flow:**
  1. Client requests challenge from `/api/v1/admin/challenge`
  2. User signs challenge with Nostr extension (nostr-browser-extension or similar)
  3. Client stores signed header in app state
  4. Include `Authorization: Nostr <base64>` header in all admin requests
  5. Auto-refresh before expiry
- **Error handling:**
  - No extension detected → Show install prompt
  - User rejects sign → Show error, retry option
  - Expired session → Re-challenge automatically

#### Admin API Client Layer [done]
- **What:** Create typed client functions for all admin endpoints
- **Why:** DRY, consistent error handling, testable
- **Effort:** S (~2h)
- **File:** `apps/web/src/admin-client.ts`
- **Functions needed:**
  ```typescript
  // Guest list
  fetchGuestList(): Promise<PolicyAssignment[]>
  addToGuestList(pubkey: string): Promise<void>
  removeFromGuestList(pubkey: string): Promise<void>

  // Blocklist
  fetchBlocklist(): Promise<PolicyAssignment[]>
  blockPubkey(pubkey: string, reason?: string): Promise<void>
  unblockPubkey(pubkey: string): Promise<void>

  // Standing
  fetchStanding(pubkey: string): Promise<StandingRecord[]>
  assignStanding(pubkey: string, role: StandingRole): Promise<void>
  revokeStanding(pubkey: string): Promise<void>

  // Room permissions
  fetchRoomPermissions(roomId: string): Promise<RoomPermission[]>
  grantRoomPermission(pubkey: string, roomId: string, perms: RoomPerms): Promise<void>
  revokeRoomPermission(pubkey: string, roomId: string): Promise<void>

  // Audit log
  fetchAuditLog(cursor?: string, limit?: number): Promise<Paginated<AuditEntry>>
  ```
- **Types:**
  ```typescript
  type StandingRole = 'guest' | 'member' | 'trusted' | 'moderator' | 'owner' | 'suspended' | 'banned'
  interface RoomPerms { canJoin: boolean; canPublish: boolean; canSubscribe: boolean }
  ```

#### Cursor Pagination for Audit Log [done]
- **What:** Add cursor-based pagination to audit log endpoint and client
- **Why:** Audit log grows unbounded; current implementation crashes on large datasets
- **Effort:** M (~3h)
- **Backend changes:**
  - Add `cursor` and `limit` query params to `/api/v1/admin/audit`
  - Return `{ entries: [], next_cursor: string | null }`
  - Use `created_at` DESC as cursor
- **Client changes:**
  - Infinite scroll or "Load More" button
  - Store loaded pages in state

### P2: Should fix soon

#### Admin UI Tests [done]
- **What:** Add tests for all admin UX flows
- **Why:** Basic route coverage exists, but authenticated admin UX flows remain untested
- **Effort:** M (~3h)
- **Test file:** `apps/web/src/routes/settings-route.test.tsx`
- **Test cases:**
  - Auth flow success/failure
  - Guest list add/remove
  - Blocklist add/remove
  - Standing assign/revoke
  - Room permission grant/revoke
  - Audit log pagination
  - Error state rendering
  - Empty state rendering

#### Admin Form Validation [done]
- **What:** Validate inputs before API submission
- **Why:** Prevent invalid data, improve UX
- **Effort:** S (~1h)
- **Validations:**
  - Pubkey: 64-char hex or valid npub
  - Standing: enum values only
  - Room ID: non-empty string
  - Reason: max 500 chars

### P3: Nice to have

#### Audit Log Filtering
- **What:** Filter audit log by action type, actor, date range
- **Why:** Finding relevant entries in large logs
- **Effort:** M (~2h)
- **Approach:** Add query params to backend, filter UI to client

#### Bulk Operations
- **What:** Add/remove multiple pubkeys at once
- **Why:** Operator efficiency for large guest lists
- **Effort:** M (~2h)
- **Approach:** Textarea with one pubkey per line

---

## Deferred to Later Phases

### Concierge HA (Phase 4+)
- Active-passive failover for Concierge
- Currently accepted as SPOF for v1.0-alpha

### Relay Degraded Mode (Phase 4+)
- Allow publishes when Concierge is unavailable
- Cache policy decisions with TTL
