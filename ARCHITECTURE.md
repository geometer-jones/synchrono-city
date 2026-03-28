# Synchrono City Architecture

This document describes the system structure and the first-version client model.

Synchrono City is a hostable, map-native social stack for communities that coordinate through place. The current architecture assumes:

- Nostr for identity and event transport
- LiveKit for real-time media
- Blossom for content-addressed storage
- Concierge as the relay-local policy and token boundary

Related docs:

- `README.md` for repository overview
- `PROTOCOL.md` for interoperable contracts
- `OPERATIONS.md` for runtime, security, observability, and testing
- `ROADMAP.md` for implementation phases and open questions

---

## 1. Client Layer

### 1.1 Splash: Landing Page

The splash page is the entry point for new visitors, presenting the project's mission and two primary calls to action.

**Route:** `/` (root)

**Content:**
- Eyebrow label: "Synchrono City"
- Tagline: "Chosen Presence. Sovereign Infrastructure. Portable Community."
- Manifesto: full text from MANIFESTO.md including mission, vision, and all 12 principles
- Featured quote: "Space is a primary index for collective life; the map brings that index online with more freedom."
- Scrollable container for manifesto (max 60vh)

**Calls to Action:**

| CTA | Action | Target |
|-----|--------|--------|
| Enter the City | Navigate to World tab | `/app` |
| Host Your Own | Open GitHub repo | `https://github.com/geometer-jones/synchrono-city` (new tab) |

**Footer:** Brief tech stack mention — "Map-native coordination • Nostr identity • LiveKit media • Blossom storage"

**Design considerations:**
- Full-viewport centered layout
- Gradient text treatment on tagline
- Primary CTA uses brand gradient (orange/coral)
- Secondary CTA is outlined, opens GitHub in new tab
- Mobile: CTAs stack vertically

### 1.2 World: Beacon Mesh

The first-version client renders geospatial activity from beacon-scoped public conversation and beacon-scoped LiveKit calls.

#### Beacon-Scoped Public State

The client should treat a beacon as the canonical public social object for a place.

- A beacon is a NIP-29 group called a beacon
- The beacon group id is the bare canonical `geohash8`
- Each beacon carries geohash tags for prefix lengths `1` through `8`
- A beacon is permanently bound to its `geohash8` and does not move after creation
- Public beacon posts remain kind `1` events, but `h=<geohash8>` is the beacon scope everywhere
- Beacon-scoped kind `1` events belong to `World` rather than `Pulse`
- Exact coordinates remain operator-gated and should not be required for baseline map rendering

#### Beacon-Scoped Call State

The client should treat active LiveKit participation inside a beacon as the authoritative rendered live place surface.

- Joining a place means entering the beacon context for that `geohash8`
- Joining media means requesting a LiveKit token for room `beacon:<geohash8>`
- If two users join the same beacon room, they should connect to the same LiveKit call automatically
- A single participant in a beacon-scoped call should still be rendered as available
- Beacon owners and admins govern beacon-local moderation, but relay policy and relay auth still override beacon-local decisions

#### Marker and Card Model

The map surface aggregates by beacon, with one beacon per canonical geohash tile.

- The World map should remain pannable and zoomable while preserving place overlays and the global call surface
- Clicking empty map background should resolve the nearest `geohash8`, drop a temporary pin, and open a bottom overlay
- The initial overlay offers exactly `Light Beacon` and `Cancel`
- `Light Beacon` opens a creation form with `name`, `pic`, and `about`
- Beacon creation must be idempotent by `geohash8`; if another client wins the race, the loser should open the existing beacon rather than surface a duplicate-creation failure
- If a beacon already exists for the selected `geohash8`, the client should open that existing beacon instead of showing creation controls
- A beacon marker should render the beacon avatar as the primary visual identity
- If no avatar exists, the marker should fall back to a stable placeholder derived from beacon metadata
- Marker styling may communicate live-call presence, but the marker itself should not display post counts or participant counts
- Each marker exposes a card whose top-left corner is anchored at the center of the avatar marker
- The card sits behind the avatar using z-index so the avatar remains the foreground anchor
- The card shows the beacon name, beacon about text, total beacon post count, and live participant count
- The card also shows the latest beacon activity preview and, when active, the current participant roster with media state indicators
- Profile inspection from the card should route through `Pulse` user profile views
- If a tile has no beacon, the client should render nothing for that tile

**Recommended client behavior:**
1. Resolve the canonical `geohash8`
2. Resolve whether a beacon exists for that id
3. If none exists and the user clicked empty map, drop a temporary pin and open the bottom overlay
4. If the user submits beacon creation, perform create-or-return-existing atomically
5. Resolve beacon-scoped kind `1` events by `h=<geohash8>`
6. Resolve the active LiveKit room `beacon:<geohash8>`
7. Render one avatar marker per beacon
8. Render the attached card with beacon metadata, counters, latest activity preview, and participant roster

#### Global Call Overlay

When a user joins a beacon-scoped call, a global call overlay provides persistent call controls regardless of navigation within the app.

**Overlay behavior:**
- The overlay is visible whenever the user has an active LiveKit connection
- The overlay persists across client navigation (World, Chats, Pulse, Settings)
- The overlay should be dismissible to a minimized state, but remains active until the user leaves the call
- Leaving the call requires explicit action (not accidental navigation)

**Call controls:**
| Control | Function | States |
|---------|----------|--------|
| Mic | Toggle microphone | on / off (muted) |
| Cam | Toggle camera | on / off |
| Screenshare | Share screen | active / inactive |
| Deafen | Mute all incoming audio | on / off |
| Leave | Exit the call | — |

**Overlay placement:**
- Fixed position at bottom of viewport
- Does not obstruct map interaction when in World view
- Minimizable to a compact bar showing only active indicators

#### Marker Rendering

The map renders one marker per visible beacon.

- Tiles without beacons do not render markers
- Marker identity is the beacon avatar rather than a numeric badge
- Active calls remain visually distinct without changing the beacon marker's identity
- Marker detail surfaces continue to show the selected beacon's metadata, counters, activity preview, and participant roster when active

#### World and Chats

Relay operators may organize local public conversation around places, venues, neighborhoods, or temporary events through beacon groups while preserving relay-local policy authority.

- Public beacon chat remains standard kind `1` Nostr event flow on the relay, scoped by beacon `h` tags
- Moderation policy is enforced first by relay policy; beacon owners and admins moderate within that higher-level boundary
- Clients may present beacon-based public rooms in the UI, and those beacons are the public conversation object for World
- Clicking the map background should either open the existing beacon for that `geohash8` or offer beacon creation through the bottom overlay
- Tapping a marker should set the user's active place presence to that exact beacon and open beacon detail without joining media automatically
- Joining media happens from the selected beacon context and targets room `beacon:<geohash8>`
- After presence is set, the client should reveal beacon detail directly in `World` as beacon-scoped conversation, not as Pulse note drill-down

#### Route Interoperability

```
                    CLIENT ROUTE INTEROP
                    ====================

  WORLD (map-owned, full-screen below app bar)
    │
    │  ┌─────────────────────────────────────────────────────┐
    │  │  MAP SURFACE                                        │
    │  │                                                     │
    │  │   ┌─────────┐     ┌─────────┐                      │
    │  │   │ Avatar  │     │ Avatar  │  ...                 │
    │  │   │ Beacon  │     │ Beacon  │                      │
    │  │   │ marker  │     │ marker  │                      │
    │  │   └────┬────┘     └─────────┘                      │
    │  │        │                                            │
    │  │        │ tap (open beacon)                          │
    │  │        ▼                                            │
    │  │  ┌─────────────────────────────────────────────┐   │
    │  │  │ BEACON CARD (behind avatar)                 │   │
    │  │  │ - beacon name / about                       │   │
    │  │  │ - post + live counters                      │   │
    │  │  │ - latest beacon activity                    │   │
    │  │  │ - participant roster with media state       │   │
    │  │  │ - [click author] ───────────────────────────┼───┼──▶ PULSE
    │  │  └─────────────────────────────────────────────┘   │   (profile view)
    │  │                                                     │
    │  │  ┌─────────────────────────────────────────────┐   │
    │  │  │ BOTTOM OVERLAY / BEACON SHEET               │   │
    │  │  │ - Light Beacon / Cancel                     │   │
    │  │  │ - name / pic / about                        │   │
    │  │  │ - beacon posts stay in World                │   │
    │  │  └─────────────────────────────────────────────┘   │
    │  │                                                     │
    │  └─────────────────────────────────────────────────────┘
    │
    │  BACKGROUND MAP CLICK → geohash8 computed → pin + bottom overlay

  CHATS (private threads only)              PULSE (public context)
    │                                          │
    │  ┌─────────────────────┐                │  ┌─────────────────────┐
    │  │ DM Thread           │                │  │ Profile view        │
    │  │ - kind 4/14 msgs    │                │  │ - metadata          │
    │  │ - [call] button     │                │  │ - authored notes    │
    │  │ - [view profile] ───┼────────────────┼──▶ - place context    │
    │  └─────────────────────┘                │  └─────────────────────┘
    │                                          │
    │  ┌─────────────────────┐                │  ┌─────────────────────┐
    │  │ Group DM Thread     │                │  │ Note detail view    │
    │  │ - sealed DMs        │                │  │ - full content      │
    │  │ - [call] button     │                │  │ - replies thread    │
    │  │ - member list       │                │  │ - author context    │
    │  └─────────────────────┘                │  └─────────────────────┘
    │                                          │
```

**Navigation rules:**
- **World → Pulse:** Clicking an author name in the beacon card opens their profile in Pulse
- **World → World:** Beacon-scoped posts stay in World and do not route to Pulse
- **World map interaction:** Background click computes geohash8 and opens the pin/create flow; marker tap opens beacon detail
- **Chats → Pulse:** Clicking a DM participant opens their profile in Pulse (if public profile exists)
- **Group DMs:** Private — no Pulse integration for group messages
- **All routes:** Global call overlay persists across navigation

### 1.3 Chats: Thread Listing

The `Chats` view aggregates the private conversation threads accessible to the user.

**Thread types:**

| Type | Identifier | LiveKit | Persistence |
|------|------------|---------|-------------|
| DM | Participant pubkey(s) | Yes (private room) | Until explicitly deleted |
| Group DM | Set of pubkeys | Yes (private room) | Until explicitly deleted |

**Thread listing order:**
- Threads with unread messages appear first
- Then sorted by most recent activity
- Active DM/group DM calls should be visible in the thread inventory

**Boundary rules:**
- `Chats` does not list beacon chats or public place threads
- Public place conversation remains in `World` as beacon-scoped conversation; `Pulse` only exposes related profiles and non-beacon public events
- If no private threads are available, `Chats` should present an empty inbox state and a path back to `World`

### 1.4 Private Calling (DMs and Group DMs)

DMs and group DMs support LiveKit calling with distinct permission semantics from public beacon chats.

**Room resolution:**

| Thread Type | Room ID Pattern | Who Can Join |
|-------------|-----------------|--------------|
| DM (2-person) | `dm:<pubkey1>:<pubkey2>` (sorted) | Only the two participants |
| Group DM | `group:<creator>:<id>` | Participants in the group membership list |

**Permission model:**

| Capability | DM | Group DM | Geo-chat |
|------------|----|-----------|----------|
| Join call | Either participant | Any group member | Anyone with relay access (subject to guest list) |
| Publish audio/video | Either participant | Any group member | Subject to room publish policy |
| Invite others | No (add = new group) | Creator or designated admins | N/A (public) |
| Kick from call | No | Creator or admins | Moderators only |

**DM call initiation:**
1. User A taps "Call" in DM thread
2. Concierge creates room if not exists, mints token for user A
3. User B receives call notification via NIP-04 DM (kind 4) or kind 30311 live activity
4. User B accepts → Concierge mints token for user B
5. Both connect to same LiveKit room

**Group DM call initiation:**
1. Any group member may start a call
2. Other group members see "Active call" indicator in thread listing
3. Members may join/leave freely while call is active
4. Call ends when last participant leaves

### 1.5 Settings: Keys, Relays, and Relay Admin

A compliant relay should expose operator controls through its web client or another authenticated admin surface.

**Settings information architecture:**
- `Keys`: local client identity, key generation, key import, signer status
- `Relays`: relay identity, health, operator pubkey, scene metrics
- `Admin`: privileged moderation and governance workflows

The three sections should open independently. `Admin` should auto-open when the current session or connected signer resolves to the relay operator pubkey.

**Key-management requirements:**
- The client should allow generating fresh local Nostr keypairs in-browser
- The client should allow importing existing private keys as `nsec` or 64-character hex
- Generated/imported keys should be persisted locally in a browser keyring until explicitly removed
- The app should be able to hold multiple local keypairs at once
- One stored local keypair is designated as active at any given time
- The active local key becomes the client identity for local note authorship and place-presence flows
- Browser-extension signing may still remain the boundary for privileged NIP-98 admin requests

**Recommended owner actions:**
- Review reports, notes, room activity, and call activity from the web client
- Mute, block, or remove abusive pubkeys from local participation
- Approve or revoke guest access to the relay or to specific rooms
- Adjust room-level publishing and subscription permissions
- Manage local owners and moderators

**Recommended client UX:**
- Expose as `Settings -> Keys | Relays | Admin`
- Do not ship a separate `District Admin` or district-config surface in the first-version client
- Allow key generation and private-key import directly inside `Settings -> Keys`
- Allow operators to review multiple stored local keypairs and switch the active key
- Allow an operator to paste or resolve a pubkey or `npub`
- Allow role assignment such as `moderator` or `owner`
- Allow room-level permission assignment
- Show an audit trail for privileged changes

### 1.6 Pulse

`Pulse` is the relay feed projection over public events, authors, and follow context carried by one or more relays.

**First-version Pulse behavior:**
- `Following` feed: explainable projection of followed authors
- `Local` feed: public events carried by the current relay
- `For You` feed: Concierge-produced merge across the user's configured relays and followed authors
- Profile lookup, author context, and follow actions live inside `Pulse` rather than a separate `People` surface
- `Pulse` acts as the relay-feed and profile surface adjacent to `World`, not as the home for beacon-thread conversation
- Beacon-scoped posts identified by beacon `h` tags do not drill down into `Pulse`; they stay in `World`
- Ranking may combine freshness, follow graph, local standing, and geospatial relevance
- Any editorial pinning or sponsorship is local operator behavior, not a standardized custom Nostr kind in `v1.0-alpha`

---

## 2. System Topology

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SYNCHRONO CITY                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         CLIENT LAYER                               │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │  Browser App (React + Vite)                                │   │   │
│  │  │  - World: map-native beacons, calls, avatar markers        │   │   │
│  │  │  - Chats: DMs and group DMs                                │   │   │
│  │  │  - Pulse: relay feed, profiles, follows                    │   │   │
│  │  │  - Settings: keys, relays, relay admin                     │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                    ┌───────────────┼───────────────┐                       │
│                    ▼               ▼               ▼                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     FEDERATION LAYER                               │   │
│  │                                                                      │   │
│  │  ┌───────────────────────────────────────────────────────────────┐  │   │
│  │  │                    STRFRY RELAY                              │  │   │
│  │  │  - Nostr event transport and storage                         │  │   │
│  │  │  - Policy shim -> Concierge for publish authorization        │  │   │
│  │  │  - Beacon-scoped events and geohash-tagged metadata          │  │   │
│  │  └───────────────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      CONCIERGE (Go)                                │   │
│  │                    Relay Policy Engine                             │   │
│  │                                                                      │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────────┐   │   │
│  │  │    AUTH    │ │   POLICY   │ │   TOKEN    │ │   MEMBERSHIP   │   │   │
│  │  │            │ │            │ │            │ │                │   │   │
│  │  │ - NIP-98   │ │ - Guestlist│ │ - LiveKit  │ │ - Standing     │   │   │
│  │  │ - Sessions │ │ - Blocklist│ │ - Media    │ │ - Roles        │   │   │
│  │  │ - Admin    │ │ - Publish  │ │ - Tokens   │ │ - Room grants  │   │   │
│  │  └────────────┘ └────────────┘ └────────────┘ └────────────────┘   │   │
│  │                                                                      │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐                      │   │
│  │  │   PROOF    │ │   AUDIT    │ │   RELAY    │                      │   │
│  │  │            │ │            │ │   AUTH     │                      │   │
│  │  │ - OAuth    │ │ - History  │ │            │                      │   │
│  │  │ - Social   │ │ - Actions  │ │ - Publish  │                      │   │
│  │  │ - Verify   │ │            │ │   decisions│                      │   │
│  │  └────────────┘ └────────────┘ └────────────┘                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     INFRASTRUCTURE LAYER                           │   │
│  │                                                                      │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────────┐   │   │
│  │  │ PostgreSQL │ │   Redis    │ │  LiveKit   │ │    Blossom     │   │   │
│  │  │            │ │            │ │            │ │                │   │   │
│  │  │ - Policy   │ │ - Session  │ │ - Voice    │ │ - Blob storage │   │   │
│  │  │ - Audit    │ │ - Cache    │ │ - Video    │ │ - Media files  │   │   │
│  │  │ - Sessions │ │ - State    │ │ - Rooms    │ │ - Exports      │   │   │
│  │  └────────────┘ └────────────┘ └────────────┘ └────────────────┘   │   │
│  │                                                                      │   │
│  │  ┌────────────┐                                                     │   │
│  │  │  MapTiler/ │  (or self-hosted tiles)                            │   │
│  │  │  Mapbox    │                                                     │   │
│  │  └────────────┘                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Key Flows

### 3.1 Local Policy Change Flow

```
                    LOCAL POLICY CHANGE FLOW
                    ========================

  ADMIN ACTION              CONCIERGE               STORAGE / RELAY
       │                        │                          │
       │  1. NIP-98 request     │                          │
       │───────────────────────▶│                          │
       │                        │                          │
       │                        │  2. Verify auth          │
       │                        │  3. Check authority      │
       │                        │  4. Validate action      │
       │                        │                          │
       │                        │  5. Write to Postgres    │
       │                        │─────────────────────────▶│
       │                        │                          │
       │                        │  6. Invalidate policy    │
       │                        │     cache / notify shim  │
       │                        │─────────────────────────▶│
       │                        │                          │
       │  7. Success response   │                          │
       │◀───────────────────────│                          │
       │                        │                          │
       │                        │  8. Audit log entry      │
       │                        │─────────────────────────▶│
```

### 3.2 Beacon Resolution Flow

```
                  BEACON RESOLUTION
                  =================

  CLIENT                      RELAY / CONCIERGE / LIVEKIT
     │                                   │
     │  1. Resolve beacon by geohash8    │
     │──────────────────────────────────▶│
     │                                   │
     │  2. Return beacon or none         │
     │◀──────────────────────────────────│
     │                                   │
     │  3. If none: pin + create sheet   │
     │  4. Query kind 1 events by #h     │
     │  5. Resolve room beacon:<hash>    │
     │  6. Render avatar marker          │
     │  7. Attach beacon card with       │
     │     metadata, counters, roster    │
     │                                   │
```

### 3.3 Client Connection Model

The client uses two transport protocols:

**WebSocket (Nostr relay):**
- Real-time event subscription and publishing
- Persistent connection for live updates
- Standard Nostr protocol (REQ, EVENT, OK, EOSE)

**HTTP (Concierge API):**
- Token vending (LiveKit)
- Admin actions
- Blossom uploads
- Request/response pattern with NIP-98 auth

```
                    CLIENT CONNECTION MODEL
                    ========================

  ┌─────────────┐                    ┌─────────────────┐
  │   CLIENT    │                    │    SERVICES     │
  │             │                    │                 │
  │  ┌───────┐  │    WebSocket       │  ┌───────────┐  │
  │  │  App  │──┼────────────────────┼─▶│  strfry   │  │
  │  └───────┘  │    wss://relay     │  │  (relay)  │  │
  │             │                    │  └───────────┘  │
  │             │                    │                 │
  │  ┌───────┐  │    HTTP + NIP-98   │  ┌───────────┐  │
  │  │  App  │──┼────────────────────┼─▶│ Concierge │  │
  │  └───────┘  │    https://api     │  │   (Go)    │  │
  │             │                    │  └───────────┘  │
  │             │                    │                 │
  │  ┌───────┐  │    HTTP + NIP-98   │  ┌───────────┐  │
  │  │  App  │──┼────────────────────┼─▶│ Blossom   │  │
  │  └───────┘  │    https://blob    │  │           │  │
  │             │                    │  └───────────┘  │
  │             │                    │                 │
  │  ┌───────┐  │    WebRTC          │  ┌───────────┐  │
  │  │  App  │──┼────────────────────┼─▶│ LiveKit   │  │
  │  └───────┘  │    via token       │  │   (SFU)   │  │
  │             │                    │  └───────────┘  │
  └─────────────┘                    └─────────────────┘
```

### 3.4 Data Flow Shadow Paths

Every data flow has shadow paths for nil input, empty input, and upstream errors.

**Beacon Resolution - Shadow Paths:**

```
                    BEACON RESOLUTION SHADOW PATHS
                    ==============================

  INPUT                    PROCESSING                    OUTPUT
    │                          │                           │
    ├──[nil geohash]──────────▶│ Skip beacon resolution   ▶│ No marker
    │                          │                           │
    ├──[empty geohash]────────▶│ Skip beacon resolution   ▶│ No marker
    │                          │                           │
    ├──[invalid geohash]──────▶│ Log warning, skip        ▶│ No marker
    │                          │                           │
    ├──[LiveKit down]─────────▶│ Return empty roster      ▶│ Avatar marker +
    │                          │  (beacon still shown)     │  no participants
    │                          │                           │
    ├──[Relay timeout]────────▶│ Circuit breaker opens    ▶│ Cached data or
    │                          │                           │  empty result
    │                          │                           │
    └──[happy path]───────────▶│ Full resolution          ▶│ Avatar marker +
                               │                           │  beacon card
```

**LiveKit Token Vending - Shadow Paths:**

```
                    TOKEN VENDING SHADOW PATHS
                    ==========================

  REQUEST                  CONCIERGE                    RESPONSE
    │                          │                           │
    ├──[invalid NIP-98]───────▶│ Reject                   ▶│ 401 Unauthorized
    │                          │                           │
    ├──[pubkey banned]────────▶│ Check policy, deny       ▶│ 403 Forbidden
    │                          │                           │
    ├──[LiveKit down]─────────▶│ Return error             ▶│ 503 Unavailable
    │                          │                           │
    ├──[rate limited]─────────▶│ Check rate limit         ▶│ 429 Retry-After
    │                          │                           │
    └──[happy path]───────────▶│ Generate token           ▶│ 200 + JWT
                               │                           │
```
