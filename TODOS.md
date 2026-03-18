# Implementation Considerations

Items identified during architecture review that should be addressed during implementation.

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
