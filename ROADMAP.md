# Synchrono City Roadmap

This document tracks implementation phases, deferred work, and open questions.

Related docs:

- `README.md` for repository overview
- `MANIFESTO.md` for mission and principles
- `ARCHITECTURE.md` for system/client design
- `PROTOCOL.md` for interoperable contracts
- `OPERATIONS.md` for runtime and verification

---

## 1. Implementation Phases

### Phase 1: Foundation (MVP)

**Duration:** 8-12 weeks

**Deliverables:**
- [x] README.md
- [x] MANIFESTO.md
- [x] PROTOCOL.md
- [x] ARCHITECTURE.md
- [x] OPERATIONS.md
- [x] ROADMAP.md
- [x] Client shell with routing
- [x] strfry relay with policy shim
- [x] Concierge: auth, policy, relay authorization
- [x] Postgres schema with migrations
- [x] Basic World view with Mapbox
- [x] **Scene health dashboard** (delight feature)
- [x] **Export as story** (delight feature)

**Technical Requirements:**
- Circuit breaker for relay failures
- Geohash tags for all geo events
- Optimistic locking for admin config
- Geohash-scoped LiveKit room resolution
- Time-based + cursor pagination
- [x] Runbooks in repo
- [x] Shim unit + integration tests

### Phase 2: Social Layer

**Duration:** 6-8 weeks

**Deliverables:**
- [x] Geohash-scoped call intent and room resolution
- [x] Places (application-defined)
- [x] Notes at places
- [x] Profiles inside Pulse
- [x] Chats

### Phase 3: Relay Governance

**Duration:** 6-8 weeks

**Deliverables:**
- [x] Roles and standing
- [x] Guest list and blocklist
- [x] Room permissions
- [x] Audit log
- [ ] **Place memories** (deferred delight)
- [ ] **Spontaneous ping** (deferred delight)

### Phase 4: Media

**Duration:** 4-6 weeks

**Deliverables:**
- [x] LiveKit integration
- [x] Blossom integration
- [x] Rooms on map

### Phase 5: Intelligence

**Duration:** 4-6 weeks

**Deliverables:**
- [x] Proof verification (OAuth, social)
- [x] Gate stacking
- [x] AI synthesis
- [x] Relay feed pinning and editorial controls

### Phase 6: Cross-Relay Feeds

**Duration:** 3-4 weeks

**Deliverables:**
- [x] Cross-relay feed UX
- [x] Merged local + remote Pulse feed ordering
- [x] Explicit relay provenance in Pulse
- [x] Follow-first merge explanation for remote items

---

## 2. Deferred Items

Deferred items from the CEO Plan Review (2026-03-18).

### Phase 3 (Governance)

#### Place Memories
- **What:** Show history of user's visits - "Last time you were here, you met X at event Y"
- **Why:** Adds personal connection to places, reinforces scene continuity
- **Effort:** M
- **Priority:** P2
- **Notes:** Requires note history plus call participation history query, privacy controls

#### Spontaneous Ping
- **What:** Ping people currently at a place for an impromptu meetup
- **Why:** Lowers friction for spontaneous gathering
- **Effort:** M
- **Priority:** P3
- **Notes:** Requires live call roster access or recent place activity query, privacy controls, rate limiting, opt-out

### Phase 4 (Media)

#### Relay Discovery UX
- **What:** Make operator-run relays easy to find and join from the client
- **Why:** If relay operation becomes widespread, discovery quality becomes core UX
- **Effort:** M
- **Priority:** P2
- **Notes:** Build around NIP-65 relay lists and follow graph hints

### Operational

#### Runbooks
- **What:** Incident response procedures
- **Why:** Operators need guidance for common failure modes
- **Effort:** S
- **Priority:** P1
- **Status:** Written
- **Items:**
  - Relay down
  - Postgres down
  - Spam attack
  - Moderation escalation
  - Guest list lockout

---

## 3. Open Questions

1. **Premium precision:** What are the default gating policies for exact coordinates?
2. **Mobile strategy:** PWA-only vs native apps?
3. **Search engine:** PostgreSQL full-text vs Meilisearch vs Elasticsearch?
4. **Map tiles:** Self-hosted vs Mapbox/MapTiler?
