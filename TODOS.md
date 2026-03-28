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

### LiveKit Token Auto-Refresh
- **What:** Check expiresAt every minute, refresh 5 min before expiry, update activeCall state seamlessly
- **Why:** Tokens expire without warning; users in long calls get disconnected silently
- **Where:** app-state.tsx joinPlaceCall flow
- **Effort:** M
- **Priority:** P2
- **Approach:** Add useEffect with interval that checks activeCall.expiresAt, calls requestLiveKitToken before expiry
- **Context:** From eng review 2026-03-26. Tokens typically 24hr but calls can be longer.

### Error Path Tests
- **What:** Add tests for error scenarios: LiveKit token fetch failure (401/503), bootstrap fetch failure recovery, call control toggle failure
- **Why:** Happy path coverage is excellent but error paths are untested; silent failures could go undetected
- **Where:** apps/web/src/app.test.tsx, apps/web/src/routes/world-route.test.tsx
- **Effort:** M
- **Priority:** P2
- **Approach:** Mock fetch/LiveKit to return errors, verify toast messages and fallback states
- **Context:** From eng review 2026-03-26. Test gaps identified in call flow error handling.

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

### Browser E2E Beacon Flow
- **What:** Add a thin browser E2E harness for the relay-native beacon world flow
- **Why:** The startup path spans NIP-11, NIP-29 beacon discovery, Concierge overlay enrichment, and LiveKit token vending; a browser-level smoke test catches integration seams unit tests miss
- **Where:** Web test tooling plus one world-flow spec covering `/app`
- **Effort:** M
- **Priority:** P3
- **Approach:** Keep the current high-fidelity Vitest integration tests for this PR, then add one browser test after the relay-native beacon fetch path stabilizes
- **Context:** From eng review 2026-03-27. This was explicitly deferred when choosing Vitest full-flow coverage now instead of adding Playwright in the same protocol-cut PR
- **Depends on / blocked by:** Relay-native beacon fetch, tiny Concierge bootstrap, and `beacon:<id>` room flow landing first so the browser spec does not churn immediately

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

## Study Circle Office Hours

### Host-Level Multi-Circle Index

**What:** Add a host-level index so users can browse all circles run by the same organizer.

**Why:** Once one host runs multiple distinct circles, users will need a second discovery path beyond the map to understand the organizer's room constellation.

**Context:** Deferred during the 2026-03-27 CEO review because the v1 wedge should stay map-first and room-first. This likely becomes important after one host successfully runs multiple active circles and users want cleaner repeat navigation.

**Effort:** M
**Priority:** P2
**Depends on:** Proving that one host actually runs multiple circles users care about.

### Self-Serve Mobile and Zap Proof Verification

**What:** Add self-serve `mobile` and `zap` proof verification flows to the Concierge gate stack.

**Why:** Relay-owner anti-abuse pressure may eventually require stronger proofs than self-serve `oauth` and `nip05` alone.

**Context:** Deferred during the 2026-03-27 CEO review. The accepted v1 proof posture is self-serve `oauth` and `nip05`, with `mobile` and `zap` remaining manual or deferred until real abuse patterns justify the extra SMS or payment infrastructure.

**Effort:** L
**Priority:** P2
**Depends on:** Evidence that current proof gates are insufficient, plus a concrete decision on which abuse pattern actually needs mobile or zap verification.

### Structured Session Metadata for Cohort Beacons

**What:** Add a lightweight beacon-native way to represent upcoming session time and cadence for cohort beacons.

**Why:** Pinned-note prose is enough for v1 memory, but "next session" clarity gets brittle fast if it only lives in free text.

**Context:** Deferred during the 2026-03-27 Eng review for the Hybrid Beginner Neural Nets Cohort plan. The accepted v1 shape keeps cohorts as plain beacons, with mutable week state and artifacts living in pinned notes. If real pilots show that users need clearer schedule visibility or reminder surfaces, add stable beacon metadata or tag conventions for next-session time and cadence without introducing a separate cohort model.

**Effort:** M
**Priority:** P2
**Depends on:** Running at least one real cohort and confirming that pinned-note-only schedule copy causes confusion.

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

---

## Beacon Migration (2026-03-26)

### P1: Critical

#### Beacon Creation Idempotency
- **What:** Add create-or-return-existing semantics for beacon creation keyed by bare `geohash8`
- **Why:** Two clients may light the same beacon concurrently; duplicates would violate the one-beacon-per-geohash rule
- **Effort:** M
- **Where:** Concierge beacon/group creation path, any persistence layer for beacon identity
- **Approach:** Enforce unique beacon identity on `geohash8`, make concurrent losers receive the existing beacon payload instead of a hard duplicate error

#### Beacon-Scoped Posting
- **What:** Replace raw geohash place-post semantics with kind `1` events scoped by `h=<geohash8>`
- **Why:** Public World conversation now belongs to NIP-29 beacons, not to geohash note buckets
- **Effort:** M
- **Where:** web Nostr helpers, social payloads, relay query paths
- **Approach:** Treat `h` as the beacon scope everywhere, keep geohash tags for beacon discovery/metadata rather than primary thread identity

#### Beacon Room Token Vending
- **What:** Change public LiveKit room naming and token vending to `beacon:<geohash8>`
- **Why:** Media rooms should be namespaced to the beacon model and separated from bare group ids
- **Effort:** M
- **Where:** Concierge token vending, room validation, web call join flow
- **Approach:** Introduce explicit beacon room parsing and keep DM / group DM room formats unchanged

#### Relay-over-Beacon Authority
- **What:** Enforce that relay auth and relay policy override beacon-local NIP-29 admin decisions
- **Why:** Beacon admins can moderate locally, but relay operators remain the sovereign enforcement boundary
- **Effort:** M
- **Where:** Concierge policy evaluation, token vending, publish authorization
- **Approach:** Evaluate relay-wide policy first, then beacon-local permissions inside that allowed envelope

### P2: Should fix soon

#### World Beacon Creation UI
- **What:** Implement pin-drop plus bottom-sheet creation flow with `Light Beacon`, `Cancel`, then `name`, `pic`, `about`
- **Why:** The client spec now requires creation from empty-map interaction instead of immediate room join
- **Effort:** M
- **Where:** `world-route.tsx`, `map-preview.tsx`, `app-state.tsx`, `styles.css`
- **Approach:** Separate map selection from media join and keep the full-screen map intact during creation

#### Avatar Marker and Attached Card Rendering
- **What:** Replace numeric markers with beacon avatars and attached behind-the-avatar cards
- **Why:** Beacon identity is now visual-first; counters move into the card
- **Effort:** M
- **Where:** map components, world route, styling
- **Approach:** Render avatar as foreground anchor, then attach a z-indexed card showing name, about, post count, live count, latest activity, and roster

#### Pulse Boundary Enforcement
- **What:** Keep beacon conversation inside World and prevent beacon-scoped posts from opening in Pulse
- **Why:** The new route contract reserves Pulse for profiles and non-beacon public events
- **Effort:** S
- **Where:** `pulse-route.tsx`, world navigation, data selectors
- **Approach:** Detect beacon `h` scope and short-circuit note-detail routing into World-owned UI

#### Beacon Metadata and Discovery
- **What:** Represent beacon metadata (`name`, `pic`, `about`) and geohash prefix tags `1..8` consistently in client and backend models
- **Why:** Avatar markers, cards, and creation flow depend on stable beacon metadata
- **Effort:** M
- **Where:** bootstrap payloads, app-state models, any concierge social/bootstrap representation
- **Approach:** Add a first-class beacon model instead of inferring from raw place-note state

#### Compatibility Shim Cleanup
- **What:** Remove legacy `geo:` room-id compatibility and legacy raw-geohash note-scope read paths after the beacon contract rollout soaks
- **Why:** Dual-read and dual-vocabulary support is useful during migration, but leaving it in place permanently will make every future beacon change harder to reason about
- **Effort:** S
- **Where:** `apps/web/src/data.ts`, `apps/web/src/nostr.ts`, `apps/web/src/app-state.tsx`, `apps/concierge/internal/social/service.go`, related tests
- **Approach:** Land compatibility first, verify rollout, then delete the shims in one focused cleanup PR with regression coverage locked in

#### Universal Beacon Inbox
- **What:** Extend `Chats` into the Phase 2 universal inbox for beacon threads alongside DMs and group DMs
- **Why:** The approved product shape wants beacons to be reachable from both `World` and `Chats`, but Phase 1 intentionally keeps `Chats` private-only to keep the World-first diff small
- **Effort:** M
- **Where:** `apps/web/src/routes/chats-route.tsx`, `app-shell` navigation state, beacon thread selection state, app-state projections
- **Approach:** Preserve the current private-thread split view, then add beacon conversations as a first-class thread kind once the beacon rename and projection layer land cleanly

#### Beacon Governance UI
- **What:** Add Phase 2 beacon settings, members, and admin controls for openness policy and moderation
- **Why:** Phase 1 adopts real NIP-29-shaped beacons on the backend, but deliberately defers the client controls needed to inspect or change group policy
- **Effort:** M
- **Where:** `apps/web/src/routes/world-route.tsx`, future beacon settings/member surfaces, concierge policy endpoints, beacon bootstrap/admin payloads
- **Approach:** Land the World-first beacon loop first, then expose read/write governance UI once the beacon policy model settles from alpha usage

### P3: Nice to have

#### Coarse Discovery Policy
- **What:** Explore operator-controlled coarse map discovery or gated fine-precision beacon creation without changing the interoperable beacon id
- **Why:** There is interest in lower default discovery precision, but the core spec still anchors beacon identity at `geohash8`
- **Effort:** M
- **Where:** protocol policy docs, map query layer, operator config
- **Approach:** Treat this as local policy and pricing/gating, not as a change to the interoperable object model

#### Beacon Lifecycle / Archive Policy
- **What:** Define archive or tombstone behavior for mistaken or abandoned beacons
- **Why:** Beacons are immovable, so operators need a cleanup policy that does not violate identity stability
- **Effort:** S
- **Where:** protocol docs, moderation tooling, client empty-state behavior
- **Approach:** Prefer archive/tombstone over deletion by inactivity unless product requirements change
