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

### 1.1 World: Geospatial Mesh

The first-version client renders geospatial activity from geohash-scoped LiveKit calls plus geohash-tagged kind `1` notes.

#### Geohash-Scoped Call State

The client should treat active LiveKit participation as the authoritative rendered live place surface.

- A user can step onto the map to remain in the geohash-scoped live call, or step off the map and remain reachable through DMs instead
- Joining a place means requesting a LiveKit token for the canonical room bound to that geohash on the current relay surface
- If two users join the same canonical geohash, they should be connected to the same LiveKit call automatically
- A single participant in a geohash-scoped call should still be rendered as available
- The canonical public precision remains `geohash6` unless a relay exposes a different local policy
- Clients should treat the longest valid public `g` tag as the canonical tile for note aggregation and room association
- Exact coordinates remain operator-gated and should not be required for baseline map rendering

#### Marker and Card Model

The map surface aggregates by canonical geohash tile.

- A circle marker represents the tile's combined note and call activity
- The numeral written inside the marker is only the count of kind `1` events in that tile
- If the tile has an active call and zero kind `1` notes, the marker should display `0`
- Each tile may expose a place card whose top-left corner is anchored at the center of the circle marker
- The top of the card shows the text content of the latest kind `1` note for that exact geohash, when one exists
- The card lists the current call participants for that tile beneath the latest-note preview
- Each participant in the roster shows their media state indicators:
  - **Mic:** on/off (muted)
  - **Cam:** on/off
  - **Screenshare:** active/inactive
  - **Deafen:** on/off (user cannot hear others)
- Profile inspection from the card should route through `Pulse` user profile views
- If the tile has neither notes nor an active call, the client should render nothing

**Recommended client behavior:**
1. Resolve the canonical geohash tile
2. Count kind `1` events tagged to that tile
3. Resolve the active LiveKit room for that tile
4. Resolve the latest kind `1` note for that exact geohash
5. Render one circle marker per tile with the note count
6. Render the place card with latest-note preview and, when present, the participant roster with media state indicators

#### Global Call Overlay

When a user joins a geohash-scoped call, a global call overlay provides persistent call controls regardless of navigation within the app.

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

#### Dense-Area Clustering

Dense map regions may cluster adjacent geohash tiles for readability.

- Cluster markers should sum note counts across the included tiles
- Cluster expansion should preserve underlying per-tile call state
- The cluster card should surface merged call state with clear dividers between each underlying tile call
- Each divided section should show the tile's latest note preview and its participant roster when active

#### World and Chats

Relay operators may organize local public conversation around places, venues, neighborhoods, or temporary events without relying on relay-enforced group semantics.

- Public chat remains standard Nostr event flow on the relay
- Moderation policy is enforced by operator controls and Concierge-owned local policy
- Clients may present place-based public rooms in the UI, but those rooms are an application concept rather than a separate relay protocol
- Tapping a marker should open `Chats` scoped to the exact geohash as a stack of kind `1` notes
- Selecting a note from that chat stack should open the note in `Pulse`

### 1.2 Settings: Relay Admin

A compliant relay should expose operator controls through its web client or another authenticated admin surface.

**Recommended owner actions:**
- Review reports, notes, room activity, and call activity from the web client
- Mute, block, or remove abusive pubkeys from local participation
- Approve or revoke guest access to the relay or to specific rooms
- Adjust room-level publishing and subscription permissions
- Manage local owners and moderators

**Recommended client UX:**
- Expose as `Settings -> Relay Admin`
- Do not ship a separate `District Admin` or district-config surface in the first-version client
- Allow an operator to paste or resolve a pubkey or `npub`
- Allow role assignment such as `moderator` or `owner`
- Allow room-level permission assignment
- Show an audit trail for privileged changes

### 1.3 Pulse

`Pulse` is the relay feed projection over public events, authors, and follow context carried by one or more relays.

**First-version Pulse behavior:**
- `Following` feed: explainable projection of followed authors
- `Local` feed: public events carried by the current relay
- `For You` feed: Concierge-produced merge across the user's configured relays and followed authors
- Profile lookup, author context, and follow actions live inside `Pulse` rather than a separate `People` surface
- `Pulse` acts as the algorithmic feed view over the same world-state that `World` renders spatially
- Note drill-down from `World -> Chats` should continue into `Pulse` for full note context and surrounding tagged conversation
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
│  │  │  - World: map-native calls, places, note markers           │   │   │
│  │  │  - Chats: geo-chat, private threads                        │   │   │
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
│  │  │  - Geohash-tagged events for geo queries                     │  │   │
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

### 3.2 Geohash Call Resolution Flow

```
                  GEOHASH CALL RESOLUTION
                  =======================

  CLIENT                      RELAY / CONCIERGE / LIVEKIT
     │                                   │
     │  1. Query kind 1 notes by #g      │
     │──────────────────────────────────▶│
     │                                   │
     │  2. Resolve active room + roster  │
     │◀──────────────────────────────────│
     │                                   │
     │  3. Canonicalize geohash tile     │
     │  4. Count kind 1 events           │
     │  5. Map tile -> one room          │
     │  6. Render circle marker          │
     │     with note count               │
     │  7. Attach place card with        │
     │     note preview and roster       │
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

**Geohash Call Resolution - Shadow Paths:**

```
                    GEOHASH RESOLUTION SHADOW PATHS
                    ===============================

  INPUT                    PROCESSING                    OUTPUT
    │                          │                           │
    ├──[nil geohash]──────────▶│ Skip call resolution     ▶│ No marker
    │                          │                           │
    ├──[empty geohash]────────▶│ Skip call resolution     ▶│ No marker
    │                          │                           │
    ├──[invalid geohash]──────▶│ Log warning, skip        ▶│ No marker
    │                          │                           │
    ├──[LiveKit down]─────────▶│ Return empty roster      ▶│ Marker with count
    │                          │  (notes still shown)      │  no participants
    │                          │                           │
    ├──[Relay timeout]────────▶│ Circuit breaker opens    ▶│ Cached data or
    │                          │                           │  empty result
    │                          │                           │
    └──[happy path]───────────▶│ Full resolution          ▶│ Marker + card
                               │                           │
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
