# Synchrono City Client Implementation Guide

**Version:** 1.0.0  
**Constitution Reference:** v1.0.0  
**Protocol Specification Reference:** v1.0.0

---

## Introduction

This guide provides implementation specifications for client applications building on the Synchrono City protocol. Clients are the user-facing component of the system—responsible for cryptographic operations, local state management, and presenting the interface through which users interact with the federated network.

The client architecture is organized around four primary tabs:

| Tab | Purpose |
|-----|---------|
| **World** | Map-based discovery and group creation |
| **Chats** | Unified inbox for DMs and groups, with calling |
| **Pulse** | Content feed and search |
| **Settings** | Identity, relay configuration, preferences, and data export |

---

## 1. Core Client Responsibilities

### 1.1 Cryptographic Operations

The client is the sole custodian of the user's private key. All cryptographic operations occur locally.

**Key Management:**
- Generate keys using cryptographically secure random number generation
- Store private keys in platform-appropriate secure storage (Keychain on iOS, Keystore on Android, secure enclave where available)
- Never transmit private keys over any network
- Clear sensitive key material from memory after use

**Signing:**
- Sign all Nostr events locally before transmission
- Sign NIP-98 HTTP authentication headers for Sidecar requests
- Validate signatures on all received events

**Encryption:**
- NIP-44 (XChaCha20-Poly1305) for DM content
- MLS (RFC 9420) for group call key agreement
- Derive LiveKit frame encryption keys from MLS exporter secrets

### 1.2 Clock Synchronization

Accurate time is critical for event validation and token expiry.

**Detection:**
- Check clock offset against a trusted source on application launch
- Use the `Date` header from Sidecar `/health` endpoint as reference
- Alternatively, use NTP or well-known HTTPS endpoints

**User Notification:**
- Display warning when drift exceeds ±30 seconds
- Explain that clock drift may cause connection failures
- Provide guidance on correcting system time

**Enforcement:**
- Refuse to create events when drift exceeds ±5 minutes
- Prompt user to correct system time before proceeding

### 1.3 Proof of Work

Clients must compute PoW nonces for events that require them.

**Implementation:**
- Use NIP-13 standard nonce format: `["nonce", "<value>", "<target>"]`
- Compute in background thread to avoid UI blocking
- Cache recently computed PoW for retry scenarios

**Required Targets:**
Refer to **Protocol Specification §6.1** for the authoritative list of Event Kinds and their required PoW target bits. Clients MUST check this specification before mining to ensure events are not rejected by the relay.

### 1.4 Event Validation

All events received from relays must be validated before processing:

- Verify NIP-01 signature
- Check timestamp is within acceptable range (±5 minutes)
- Verify required tags are present
- Validate PoW meets target (for kinds with requirements)
- Reject events failing any validation

### 1.5 Network Bootstrapping

New clients cannot discover Sidecars or Groups without an initial connection.

**Hardcoded Seed Relay:**
Clients MUST include a hardcoded "Seed Relay" (e.g., `wss://relay.synchrono.city`) in the application binary.
1. On first launch, connect to Seed Relay.
2. Fetch recommended relays (Kind 10002) or default map data.
3. Once the user configures their own preferred relays, the Seed Relay MAY be disconnected if not in the user's list.

---

## 2. Tab 1: World

The World tab provides map-based discovery of nearby groups and the ability to create new location-anchored communities.

### 2.1 Map Interface

**Core Requirements:**

| Feature | Requirement |
|---------|-------------|
| Map Provider | Any provider (MapLibre, Mapbox, Apple Maps, Google Maps) |
| Default View | Centered on user's current location |
| Zoom Range | Must support geohash precision 4-6 (~39km to ~1.2km) |
| Clustering | Required when multiple groups overlap at current zoom |
| Offline | Cache map tiles for last-viewed regions |

**User Location Handling:**

```
┌─────────────────────────────────────────────────────────────┐
│                    LOCATION PRIVACY                         │
├─────────────────────────────────────────────────────────────┤
│ • Request location permission with clear explanation        │
│ • NEVER transmit precision greater than geohash level 6     │
│ • Truncate coordinates to 2 decimal places (~1.1km)         │
│ • Use location transiently for discovery, then discard      │
│ • Provide manual location override option                   │
└─────────────────────────────────────────────────────────────┘
```

**Low-Density Warning:**

In rural areas, geohash precision 6 may still expose a specific residence. When user location falls in a low-density geohash:

1. Display warning explaining reduced anonymity
2. Suggest selecting a nearby landmark instead
3. Offer to reduce precision further (level 5 or 4)
4. Allow user to proceed with acknowledgment

### 2.2 Group Discovery

**Query Strategy:**
1. Connect to the User's Relay List + the Seed Relay.
2. Subscribe to Kind `39000` events with `g` tag prefixes matching the viewport.
3. **Important:** The map may show groups from relays the user is not currently connected to.
   - Parse the `relay` tag from the Kind `39000` event (if present).
   - If the user joins that group, the client MUST establish a connection to that specific authoritative relay.

**Subscription Filter:**

```json
{
  "kinds": [39000],
  "#g": ["9q8yy", "9q8yz", "9q8yw"]
}
```

Use geohash prefixes matching visible area. Shorter prefixes = wider area.

**Group Pin Display:**

| State | Visual Treatment |
|-------|------------------|
| Inactive | Muted color, smaller size |
| Active (has call) | Bright color, pulsing animation |
| User is member | Distinct border or badge |
| Private group | Lock icon overlay |

**Group Preview Card:**

When user taps a pin, display preview card:

```
┌────────────────────────────────────────┐
│ 🏛️ Town Square                         │
│ ─────────────────────────────────────  │
│ A public gathering place for locals    │
│                                        │
│ 👥 42 members  •  🟢 3 in call         │
│                                        │
│ [Join Group]        [View Details]     │
└────────────────────────────────────────┘
```

### 2.3 Group Creation

**Creation Flow:**

```
Step 1: Select Location
        │
        ├── Tap on map to place pin
        ├── Or use current location
        ├── Or search for address/landmark
        │
        ▼
Step 2: Enter Details
        │
        ├── Name (required, 3-50 chars)
        ├── Description (optional, max 500 chars)
        ├── Privacy: Public / Private
        │
        ▼
Step 3: Compute PoW (28 bits)
        │
        ├── Show progress indicator
        ├── Explain purpose: "Proving you're human..."
        │
        ▼
**Step 4: Publish Kind 9007 (Create Group)**
        │
        ▼
**Step 5: Navigate to new group**

**Kind 9007 Event Structure:**

```json
{
  "kind": 9007,
  "content": "",
  "tags": [
    ["name", "Town Square"],
    ["about", "A public gathering place"],
    ["g", "9q8yyk", "6"],
    ["location", "37.77", "-122.41"],
    ["private", "false"],
    ["nonce", "8472910", "28"]
  ]
}
```

**Location Validation:**
- Truncate coordinates to 2 decimal places before display or transmission
- Compute geohash at precision 6 maximum
- Include both `g` tag (for discovery) and `location` tag (for display)

### 2.4 World Tab State Management

**Local State:**

| State | Storage | Sync |
|-------|---------|------|
| Last viewport (center, zoom) | Persistent | No |
| Cached group metadata | Persistent | On visibility |
| User location preference | Persistent | No |
| Active subscriptions | Memory | N/A |

**Offline Behavior:**
- Display cached groups from last session
- Queue group creation for when online
- Show "offline" indicator on map
- Disable location-dependent features

---

## 3. Tab 2: Chats

The Chats tab provides a unified inbox for all conversations—both direct messages and group chats—with integrated voice/video calling.

### 3.1 Unified Inbox Architecture

**Conversation List:**

```
┌─────────────────────────────────────────────────────────────┐
│  Chats                                    [Search] [Filter] │
├─────────────────────────────────────────────────────────────┤
│  ┌─────┐                                                    │
│  │ 👤  │  Alice                              2m ago         │
│  │     │  Hey, are you coming to the...     ●               │
│  └─────┘                                                    │
├─────────────────────────────────────────────────────────────┤
│  ┌─────┐                                                    │
│  │ 🏛️  │  Town Square                  🟢 5 in call         │
│  │     │  Bob: Let's meet at the...         ●●              │
│  └─────┘                                                    │
├─────────────────────────────────────────────────────────────┤
│  ┌─────┐                                                    │
│  │ 👤  │  Charlie                           1h ago          │
│  │     │  Thanks for the help!                              │
│  └─────┘                                                    │
└─────────────────────────────────────────────────────────────┘
```

**Conversation Types:**

| Type | Icon | Source | Encryption |
|------|------|--------|------------|
| DM | Avatar | NIP-17 | NIP-44 |
| Group | Group icon | NIP-29 | Transport only |
| Group (private) | Group + lock | NIP-29 | NIP-44 wrapped |

**Sorting:**
- Default: Most recent activity first
- Pinned conversations always at top
- Active calls surface to top with visual indicator
- Unread badge shows count

### 3.2 Direct Messages (NIP-17)

**Sending a DM:**

```
1. Compose message content
2. Encrypt with NIP-44 using recipient's pubkey
3. Wrap in NIP-59 Gift Wrap
4. Publish to user's outbox relay
```

**Receiving DMs:**

```
1. Subscribe to inbox relay for Kind 1059 (Gift Wrap)
2. Decrypt outer seal with own private key
3. Extract inner rumor event
4. Decrypt content with NIP-44
5. Store decrypted message locally
6. Update conversation list
```

**DM Subscription Filter:**

```json
{
  "kinds": [1059],
  "#p": ["<own-pubkey>"]
}
```

### 3.3 Group Messages (NIP-29)

**Sending to Group:**

```json
{
  "kind": 1,
  "content": "Hello everyone!",
  "tags": [
    ["h", "<group-id>"]
  ]
}
```

**Group Subscription:**

```json
{
  "kinds": [1],
  "#h": ["<group-id>"]
}
```

**Group Metadata Subscription:**

```json
{
  "kinds": [39000, 39001, 39002],
  "#d": ["<group-id>"]
}
```

### 3.4 Conversation View

**Message Display:**

```
┌─────────────────────────────────────────────────────────────┐
│  ← Town Square                          👥 42  📞 [Call]    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────────────────┐                       │
│  │ Alice                    10:42 AM │                       │
│  │ Anyone want to grab coffee?      │                       │
│  └──────────────────────────────────┘                       │
│                                                             │
│                       ┌──────────────────────────────────┐  │
│                       │ You                      10:43 AM │  │
│                       │ I'm in! Where?                   │  │
│                       └──────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────┐                       │
│  │ Alice                    10:44 AM │                       │
│  │ The place on Main St             │                       │
│  └──────────────────────────────────┘                       │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  [+] Type a message...                              [Send]  │
└─────────────────────────────────────────────────────────────┘
```

**Message Actions (long press):**

| Action | Availability |
|--------|--------------|
| Reply | All messages |
| React | All messages |
| Copy | All messages |
| Delete | Own messages only |
| Report | Others' messages |

### 3.5 Calling from Chats

**Call Initiation UI:**

```
┌─────────────────────────────────────┐
│         Start a Call                │
├─────────────────────────────────────┤
│                                     │
│    🎤 Voice Only    📹 Video        │
│                                     │
│         [Start Call]                │
│                                     │
└─────────────────────────────────────┘
```

#### 3.5.1 Group Call Flow

```
User taps Call button in group
        │
        ▼
Check for existing active call (Kind 1020 with no 1021)
        │
        ├── No active call exists ──────────────────┐
        │                                           │
        ▼                                           ▼
Join existing call                         Create new call
        │                                           │
        ▼                                           ▼
Generate Kind 20002                        Compute PoW (24 bits)
(PoW 12 bits)                                      │
        │                                           ▼
        ▼                                  Publish Kind 1020
POST to /token/group                               │
        │                                           ▼
        ▼                                  POST to /token/group
Receive wrapped token                              │
        │                                           ▼
        ▼                                  Receive wrapped token
Connect to LiveKit                                 │
        │                                           ▼
        ▼                                  Connect to LiveKit
Wait for MLS Welcome                      (Become Epoch Leader)
        │                                           │
        ▼                                           ▼
Derive frame keys                         Initialize MLS tree
        │                                           │
        └───────────────────────────────────────────┘
                            │
                            ▼
                   Begin encrypted call
```

#### 3.5.2 DM Call Flow

```
Caller                                     Callee
   │                                          │
   │  Kind 1022 (Offer)                       │
   ├─────────────────────────────────────────►│
   │                                          │
   │                          Display incoming│
   │                          call UI         │
   │                                          │
   │  Kind 20011 (Answer)                     │
   │◄─────────────────────────────────────────┤
   │                                          │
   │  POST /token/dm                          │
   ├─────────────────────────────────────────►│
   │                                          │
   │  POST /token/dm                          │
   │◄─────────────────────────────────────────┤
   │                                          │
   │  Both connect to LiveKit                 │
   │◄────────────────────────────────────────►│
   │                                          │
   │  MLS key exchange (2-party)              │
   │◄────────────────────────────────────────►│
   │                                          │
   │  Encrypted call                          │
   │◄════════════════════════════════════════►│
```

**Incoming Call UI:**

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                         ┌─────┐                             │
│                         │ 👤  │                             │
│                         └─────┘                             │
│                                                             │
│                      Alice is calling                       │
│                                                             │
│                    📹 Video Call                            │
│                                                             │
│                                                             │
│         ┌─────────┐                 ┌─────────┐             │
│         │ Decline │                 │ Accept  │             │
│         │   🔴    │                 │   🟢    │             │
│         └─────────┘                 └─────────┘             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### 3.5.3 In-Call Interface

**Standard View (Video Grid):**

```
┌─────────────────────────────────────────────────────────────┐
│  Town Square                                    00:45:32    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│    ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│    │             │  │             │  │             │       │
│    │    Alice    │  │     Bob     │  │   Charlie   │       │
│    │   (speaking)│  │             │  │   (muted)   │       │
│    │             │  │             │  │             │       │
│    └─────────────┘  └─────────────┘  └─────────────┘       │
│                                                             │
│                   ┌─────────────┐                           │
│                   │             │                           │
│                   │     You     │                           │
│                   │             │                           │
│                   │             │                           │
│                   └─────────────┘                           │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│   🎤       📹       🖥️       🔊       👥       📱      🔴   │
│  Mute    Video   Screen  Speaker  People   Flip    Leave   │
└─────────────────────────────────────────────────────────────┘
```

**Screen Share View:**

```
┌─────────────────────────────────────────────────────────────┐
│  Town Square                      🖥️ Alice is sharing       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                                                       │  │
│  │                                                       │  │
│  │                                                       │  │
│  │              [Alice's Shared Screen]                  │  │
│  │                                                       │  │
│  │                                                       │  │
│  │                                                       │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐                           │
│  │Alice│ │ Bob │ │Charl│ │ You │  ← Participant thumbnails │
│  └─────┘ └─────┘ └─────┘ └─────┘                           │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│   🎤       📹       🖥️       🔊       👥       📱      🔴   │
│  Mute    Video   Screen  Speaker  People   Flip    Leave   │
└─────────────────────────────────────────────────────────────┘
```

**Self-Sharing Banner:**

```
┌─────────────────────────────────────────────────────────────┐
│  ⚠️ You are sharing your screen                [Stop Share] │
└─────────────────────────────────────────────────────────────┘
```

**Call Controls:**

| Control | Action |
|---------|--------|
| 🎤 Mute | Toggle microphone |
| 📹 Video | Toggle camera |
| 🖥️ Screen | Share screen |
| 🔊 Speaker | Toggle speaker/earpiece |
| 👥 People | Show participant list |
| 📱 Flip | Switch front/back camera |
| 🔴 Leave | End call participation |

**Screen Sharing:**

```
┌─────────────────────────────────────────────────────────────┐
│  Share Your Screen                                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 🖥️ Entire Screen                                    │    │
│  │    Share everything on your display                 │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 🪟 Window                                           │    │
│  │    Share a specific application window              │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 📄 Tab (Browser only)                               │    │
│  │    Share a browser tab with audio                   │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ☑️ Share audio                                             │
│                                                             │
│                    [Cancel]    [Share]                      │
└─────────────────────────────────────────────────────────────┘
```

**Screen Share Behavior:**
- Only one participant may share screen at a time
- Screen share replaces camera video track (camera can be re-enabled alongside)
- Screen content is encrypted via MLS frame encryption like all media
- Mobile: System-level screen capture (requires user permission)
- Desktop/Web: Uses `getDisplayMedia()` API
- Indicator shown to all participants when someone is sharing
- Sharer sees "You are sharing your screen" banner

**Participant List Actions:**

| Action | Available To | Effect |
|--------|--------------|--------|
| Mute for self | Anyone | Local audio mute |
| Remove | Group admins | Kicks from call, triggers MLS rekey |
| Transfer leader | Current leader | Passes Epoch Leader role |

### 3.6 MLS State Management

**Key Package Maintenance:**
- Maintain 3-5 valid Key Packages published to relay
- Refresh before 7-day expiration
- Publish new packages on app startup if fewer than 3 valid

**Epoch Synchronization:**

```
Receive Kind 20021 (Commit)
        │
        ▼
Compare epoch to local state
        │
        ├── Local epoch matches ────► Apply commit
        │                                   │
        ├── Local epoch behind ─────► Fetch /mls/state
        │                                   │
        │                                   ▼
        │                            Sync to current epoch
        │                                   │
        └── Local epoch ahead ──────► Ignore (stale commit)
                                            │
                                            ▼
                                    Continue call
```

**Ghost Device Detection:**

Before decrypting any frame:
1. Enumerate all keys in MLS tree
2. Compare against known participant pubkeys
3. If unknown key detected:
   - Alert user immediately
   - Display security warning
   - Offer to leave call
   - MAY auto-terminate for high-security users

**State Recovery (Zombie Room):**

If a client connects to LiveKit (Transport) but does not receive a `Kind 20020` (MLS Welcome) within **5 seconds**:
1. Client MUST assume the Epoch Leader is unresponsive or disconnected.
2. Client MUST fetch current state via Sidecar: `GET /mls/state/{room_id}`.
3. If state is returned, Client attempts to sync.
4. If fails, Client disconnects and shows "Connection Failed" to user.

### 3.7 Block and Mute Handling

**Block List (Kind 10006):**
- Fetch and cache on startup
- Public—enables Sidecar enforcement
- When joining room with blocked user present, warn user
- Blocked users cannot DM or join your DM calls

**Mute List (Kind 10000):**
- Fetch and decrypt on startup
- Private—client-side enforcement only
- Muted user content hidden in feeds and chats
- In calls: render muted participants as silence (audio) and black frame (video)
- Muted party is never informed

**Block List Update Flow:**

```
User blocks someone
        │
        ▼
Add pubkey to local block list
        │
        ▼
Compute PoW (12 bits)
        │
        ▼
Publish Kind 10006 (replaces previous)
        │
        ▼
Hide blocked user's content locally
```

### 3.8 Chats Tab State Management

**Local State:**

| State | Storage | Sync |
|-------|---------|------|
| Conversation list | Persistent | On open |
| Message history | Persistent (encrypted) | Per conversation |
| Unread counts | Persistent | Real-time |
| Draft messages | Persistent | No |
| Call state | Memory | Real-time |
| MLS epoch/tree | Memory | During call |

**Offline Behavior:**
- Display cached conversations and messages
- Queue outgoing messages for later delivery
- Show "pending" indicator on queued messages
- Disable calling features

---

## 4. Tab 3: Pulse

The Pulse tab provides a content feed of public notes and a search interface for discovering content and users.

### 4.1 Feed Architecture

**Feed Composition:**

```
┌─────────────────────────────────────────────────────────────┐
│  Pulse                              [Compose]    [Search]   │
├─────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────┐  │
│  │ For You │ Following │ Global                         │  │
│  └───────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 👤 Alice                                    2h ago   │    │
│  │                                                      │    │
│  │ Just discovered this amazing coffee shop on Main    │    │
│  │ Street. The cold brew is incredible! ☕              │    │
│  │                                                      │    │
│  │ 💬 12    🔄 3    ❤️ 47                               │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 👤 Bob                                      4h ago   │    │
│  │                                                      │    │
│  │ Anyone know a good plumber in the area?             │    │
│  │                                                      │    │
│  │ 💬 8     🔄 1    ❤️ 5                                │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Feed Types:**

| Feed | Source | Filter |
|------|--------|--------|
| For You | Algorithmic | Follows + engagement signals |
| Following | Kind 3 contact list | Authors user follows |
| Global | All connected relays | Unfiltered (with spam filtering) |

### 4.2 Content Types

**Supported Note Types:**

| Kind | Content | Display |
|------|---------|---------|
| 1 | Short text note | Standard post |
| 30023 | Long-form content | Article preview + expand |
| 1063 | File metadata | Media preview |

**Media Handling:**
- Fetch media through Sidecar proxy (protects IP)
- Display inline previews for images
- Play audio/video with platform player
- Respect content warnings if present

### 4.3 Composing Notes

**Compose Interface:**

```
┌─────────────────────────────────────────────────────────────┐
│  New Post                                        [Cancel]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                                                     │    │
│  │ What's on your mind?                                │    │
│  │                                                     │    │
│  │                                                     │    │
│  │                                                     │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  📷 Image   ⚠️ Content Warning                              │
│                                                             │
│                                           [Post]            │
└─────────────────────────────────────────────────────────────┘
```

**Kind 1 Event:**

```json
{
  "kind": 1,
  "content": "Great farmer's market today!",
  "tags": []
}
```

### 4.4 Interactions

**Actions on Posts:**

| Action | Event Kind | Tags |
|--------|-----------|------|
| Reply | 1 | `e` (reply-to), `p` (mentions) |
| Repost | 6 | `e` (original) |
| React | 7 | `e` (target), content: emoji |
| Quote | 1 | `q` (quoted event) |

**Reaction Handling:**
- Display reaction counts aggregated by emoji
- Show user's own reactions distinctly
- Allow single reaction per post (replace on re-react)

### 4.5 Search

**Search Interface:**

```
┌─────────────────────────────────────────────────────────────┐
│  🔍 Search...                                               │
├─────────────────────────────────────────────────────────────┤
│  Recent Searches                                            │
│  • coffee shops                                             │
│  • @alice                                                   │
│  • #localevents                                             │
├─────────────────────────────────────────────────────────────┤
│  Trending in Your Area                                      │
│  • #farmersmarket                                           │
│  • #weekendplans                                            │
│  • #localnews                                               │
└─────────────────────────────────────────────────────────────┘
```

**Search Types:**

| Query | Interpretation | Action |
|-------|---------------|--------|
| `@username` | User search | Search Kind 0 by name field |
| `#hashtag` | Topic search | Search Kind 1 by `t` tag |
| `npub1...` | Direct lookup | Fetch profile by pubkey |
| Free text | Content search | Full-text search (relay-dependent) |

**User Search Results:**

```
┌─────────────────────────────────────────────────────────────┐
│  🔍 alice                                                   │
├─────────────────────────────────────────────────────────────┤
│  People                                                     │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ 👤 Alice (@alice)                           [Follow]   │ │
│  │    Coffee enthusiast. Local guide.                    │ │
│  │    👥 1.2k followers                                   │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ 👤 Alice in Wonderland (@alice_w)           [Follow]   │ │
│  │    Just here for the adventure                        │ │
│  │    👥 340 followers                                    │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 4.6 User Profiles

**Profile View:**

```
┌─────────────────────────────────────────────────────────────┐
│  ←                                           [•••]          │
├─────────────────────────────────────────────────────────────┤
│                      ┌─────────┐                            │
│                      │         │                            │
│                      │   👤    │                            │
│                      │         │                            │
│                      └─────────┘                            │
│                                                             │
│                    Alice (@alice)                           │
│                                                             │
│         Coffee enthusiast. Local guide. 📍 Downtown        │
│                                                             │
│      1.2k Followers    340 Following    2.5k Posts         │
│                                                             │
│                [Follow]    [Message]                        │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  Posts │ Replies │ Media │ Likes                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [User's posts appear here]                                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Profile Actions Menu:**

| Action | Effect |
|--------|--------|
| Follow/Unfollow | Update Kind 3 contact list |
| Message | Open DM conversation |
| Mute | Add to Kind 10000, hide content |
| Block | Add to Kind 10006, prevent interaction |
| Report | Submit report to relay operator |
| Copy npub | Copy public key to clipboard |

### 4.7 Bot Identification

Display clear indicators for automated accounts:

**Detection:**
- Check for `"bot": true` in Kind 0 metadata
- Check for Kind 30078 with `d` tag `synchrono:bot`

**Display:**
- Show "Bot" badge on profile
- Show "Automated" label on posts
- Distinct visual treatment (different background, icon)

### 4.8 Pulse Tab State Management

**Local State:**

| State | Storage | Sync |
|-------|---------|------|
| Feed cache | Persistent | Pull-to-refresh |
| Following list | Persistent | On change |
| Search history | Persistent | No |
| Draft posts | Persistent | No |
| Viewed post IDs | Memory | Session only |

**Offline Behavior:**
- Display cached feed content
- Queue composed posts for later
- Disable search (requires relay)
- Show "offline" indicator

---

## 5. Tab 4: Settings

The Settings tab manages identity, relay connections, preferences, and data portability.

### 5.1 Settings Structure

```
┌─────────────────────────────────────────────────────────────┐
│  Settings                                                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  IDENTITY                                                   │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 🔑 Keys                                          ›  │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 👤 Profile                                       ›  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  NETWORK                                                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 🌐 Relays                                        ›  │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 🚫 Blocked Users                                 ›  │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 🔇 Muted Users                                   ›  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  APPEARANCE                                                 │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 🎨 Theme                                         ›  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  DATA                                                       │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 📤 Export Data                                   ›  │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 🗑️ Delete Account                                ›  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ABOUT                                                      │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ ℹ️ About Synchrono City                          ›  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Keys Management

**Keys Screen:**

```
┌─────────────────────────────────────────────────────────────┐
│  ← Keys                                                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  PUBLIC KEY                                                 │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ npub1abc...xyz                              [Copy]  │    │
│  └─────────────────────────────────────────────────────┘    │
│  Your public identity. Safe to share.                       │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  PRIVATE KEY                                                │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ ••••••••••••••••••••                        [Show]  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ⚠️ Never share your private key. Anyone with this key     │
│  can access your account and impersonate you.               │
│                                                             │
│                     [Backup Key]                            │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  KEY PACKAGES                                               │
│  Active: 4 of 5                                             │
│  Next expiry: 5 days                                        │
│                                                             │
│                   [Refresh Key Packages]                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Key Display Security:**
- Private key hidden by default (show dots)
- Require biometric/PIN to reveal
- Auto-hide after 30 seconds if revealed
- Prevent screenshots when private key visible (platform-dependent)

**Backup Flow:**

```
User taps "Backup Key"
        │
        ▼
Require biometric/PIN authentication
        │
        ▼
Display warning about key security
        │
        ▼
Present options:
├── Copy to clipboard (with auto-clear)
├── Save to file (encrypted with password)
└── Display QR code (for scanning to another device)
        │
        ▼
Confirm backup completed
```

**Key Import:**

Support importing existing Nostr identities:
- nsec (bech32 private key)
- hex private key
- NIP-06 mnemonic (BIP-39)

### 5.3 Profile Management

**Profile Editor:**

```
┌─────────────────────────────────────────────────────────────┐
│  ← Edit Profile                                   [Save]    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                      ┌─────────┐                            │
│                      │         │                            │
│                      │   📷    │                            │
│                      │         │                            │
│                      └─────────┘                            │
│                    Change Photo                             │
│                                                             │
│  Display Name                                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Alice                                               │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  Username                                                   │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ alice                                               │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  About                                                      │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Coffee enthusiast. Local guide.                     │    │
│  │                                                     │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  Website                                                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ https://alice.example.com                           │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  NIP-05 Identifier                                          │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ alice@example.com                           [Verify]│    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Profile Publish (Kind 0):**

```json
{
  "kind": 0,
  "content": "{\"name\":\"Alice\",\"about\":\"Coffee enthusiast.\",\"picture\":\"https://...\",\"nip05\":\"alice@example.com\"}",
  "tags": [
    ["nonce", "12345", "20"]
  ]
}
```

**Avatar Upload Flow:**
1. Select image from device
2. Resize/crop to square (max 500x500)
3. Upload via Sidecar proxy to Blossom
4. Receive content-addressed URL
5. Include URL in Kind 0 metadata

### 5.4 Relay Management

**Relay List:**

```
┌─────────────────────────────────────────────────────────────┐
│  ← Relays                                       [+ Add]     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  CONNECTED                                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 🟢 relay.synchrono.city                             │    │
│  │    Read • Write • Sync                              │    │
│  │    Latency: 45ms                                    │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 🟢 relay.damus.io                                   │    │
│  │    Read                                             │    │
│  │    Latency: 120ms                                   │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  DISCONNECTED                                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 🔴 nos.lol                                          │    │
│  │    Connection failed                                │    │
│  │    [Retry]  [Remove]                                │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Relay Properties:**

| Property | Description |
|----------|-------------|
| Read | Fetch events from this relay |
| Write | Publish events to this relay |
| Sync | Use as primary for Synchrono City features |

**Add Relay Flow:**

```
User enters relay URL
        │
        ▼
Validate URL format (wss://...)
        │
        ▼
Attempt WebSocket connection
        │
        ▼
Fetch NIP-11 relay information
        │
        ▼
Check for synchrono_city support
        │
        ├── Supported ────► Add with full features
        │
        └── Not supported ─► Add with warning
                            "This relay doesn't support
                             Synchrono City features"
```

**Relay Kind 10002 (Relay List):**

```json
{
  "kind": 10002,
  "content": "",
  "tags": [
    ["r", "wss://relay.synchrono.city", "read", "write"],
    ["r", "wss://relay.damus.io", "read"]
  ]
}
```

### 5.5 Block and Mute Management

**Blocked Users Screen:**

```
┌─────────────────────────────────────────────────────────────┐
│  ← Blocked Users                                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Blocked users cannot:                                      │
│  • Send you direct messages                                 │
│  • Join calls you're already in                            │
│  • Be in the same DM call as you                           │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 👤 Spammer123                              [Unblock]│    │
│  │    Blocked 3 days ago                               │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 👤 TrollAccount                            [Unblock]│    │
│  │    Blocked 2 weeks ago                              │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Muted Users Screen:**

```
┌─────────────────────────────────────────────────────────────┐
│  ← Muted Users                                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Muted users won't know they're muted.                      │
│  Their content is hidden from your feeds and chats.         │
│  In calls, they appear as silence.                          │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 👤 AnnoyingPerson                           [Unmute]│    │
│  │    Muted 1 week ago                                 │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.6 Theme Settings

**Theme Options:**

```
┌─────────────────────────────────────────────────────────────┐
│  ← Theme                                                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  APPEARANCE                                                 │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ ○ Light                                             │    │
│  ├─────────────────────────────────────────────────────┤    │
│  │ ● Dark                                              │    │
│  ├─────────────────────────────────────────────────────┤    │
│  │ ○ System                                            │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ACCENT COLOR                                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  🔵  🟢  🟣  🟠  🔴  ⚫                             │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  MAP STYLE                                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ ○ Standard                                          │    │
│  ├─────────────────────────────────────────────────────┤    │
│  │ ● Satellite                                         │    │
│  ├─────────────────────────────────────────────────────┤    │
│  │ ○ Terrain                                           │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.7 Data Export

**Export Screen:**

```
┌─────────────────────────────────────────────────────────────┐
│  ← Export Data                                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Export your data for backup or migration.                  │
│                                                             │
│  AVAILABLE FOR EXPORT                                       │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ ☑️ Profile                                          │    │
│  │ ☑️ Contact List (Following)                         │    │
│  │ ☑️ Relay Preferences                                │    │
│  │ ☑️ Mute List                                        │    │
│  │ ☑️ Block List                                       │    │
│  │ ☑️ Your Posts                                       │    │
│  │ ☑️ Your DMs (encrypted)                             │    │
│  │ ☑️ Group Memberships                                │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  NOT AVAILABLE FOR EXPORT                                   │
│  • Private keys (use Keys screen for backup)                │
│  • Other users' content                                     │
│  • Call recordings (not stored)                             │
│                                                             │
│  FORMAT                                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ ● JSON (Nostr events)                               │    │
│  ├─────────────────────────────────────────────────────┤    │
│  │ ○ CSV (readable format)                             │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│                    [Export Data]                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Export Contents:**

| Data Type | Format | Notes |
|-----------|--------|-------|
| Profile | Kind 0 event | JSON |
| Contacts | Kind 3 event | List of pubkeys |
| Relays | Kind 10002 event | Relay URLs with permissions |
| Mutes | Kind 10000 event | Encrypted list |
| Blocks | Kind 10006 event | Public list |
| Posts | Kind 1 events | All authored notes |
| DMs | Kind 1059 events | Encrypted, requires private key to read |
| Groups | Kind 10009 event | Group membership list |

### 5.8 Account Deletion

**Delete Account Flow:**

```
User taps "Delete Account"
        │
        ▼
Display warning:
"This will request deletion of your data from relays.
 Your identity (keys) remains yours.
 Some data may persist on federated relays."
        │
        ▼
Require biometric/PIN confirmation
        │
        ▼
Type "DELETE" to confirm
        │
        ▼
Publish Kind 5 deletion events for all owned content
        │
        ▼
Clear local data
        │
        ▼
Return to onboarding screen
```

**Kind 5 Deletion Event:**

```json
{
  "kind": 5,
  "content": "Account deletion requested",
  "tags": [
    ["e", "<event-id-1>"],
    ["e", "<event-id-2>"],
    ["e", "<event-id-n>"]
  ]
}
```

Note: Deletion is best-effort. Relays SHOULD honor Kind 5 requests per NIP-09, but federated copies may persist.

### 5.9 Settings State Management

**Local State:**

| State | Storage | Sync |
|-------|---------|------|
| Theme preference | Persistent | No |
| Relay list | Persistent | Kind 10002 |
| Block list | Persistent | Kind 10006 |
| Mute list | Persistent (encrypted) | Kind 10000 |
| Key material | Secure storage | No (never synced) |

---

## 6. Cross-Cutting Concerns

### 6.1 Error Handling

**User-Facing Error Messages:**

| Error Code | User Message |
|------------|--------------|
| `INVALID_SIGNATURE` | "Authentication failed. Please try again." |
| `POW_INSUFFICIENT` | "Verifying you're human... (retry)" |
| `TIMESTAMP_OUT_OF_RANGE` | "Your device clock is incorrect. Please check your time settings." |
| `NOT_GROUP_MEMBER` | "You're not a member of this group." |
| `BLOCKED_BY_PARTICIPANT` | "You cannot join this call." |
| `RATE_LIMITED` | "Too many requests. Please wait a moment." |
| `MLS_EPOCH_MISMATCH` | "Reconnecting to call..." |

**Retry Strategy:**

| Error Type | Retry | Backoff |
|------------|-------|---------|
| Network timeout | Yes | Exponential (1s, 2s, 4s, max 30s) |
| Rate limited | Yes | Wait for header-specified duration |
| Authentication | No | Require user action |
| Validation | No | Fix issue first |

### 6.2 Push Notifications

**Notification Types:**

| Event | Notification |
|-------|--------------|
| New DM | "[Sender]: [Preview]" |
| Group mention | "[Group]: [Sender] mentioned you" |
| Incoming call | Full-screen call UI |
| Missed call | "[Caller] tried to call you" |
| Group invite | "[Inviter] invited you to [Group]" |

**Notification Privacy:**
- Use end-to-end encrypted push where available (Apple Push, FCM encrypted payloads)
- If not available, use generic notifications ("New message") with local fetch for details
- Never include full message content in push payload

### 6.3 Background Behavior

**Background Tasks:**

| Task | Frequency | Purpose |
|------|-----------|---------|
| Relay sync | On wake | Fetch missed events |
| Key package refresh | Daily | Maintain 3-5 valid packages |
| Token refresh | During calls | Maintain active connection |

**Call Behavior:**
- Maintain WebSocket and WebRTC connections in background
- Use platform-appropriate background modes (VoIP, audio)
- Resume full UI on return to foreground

### 6.4 Accessibility

**Requirements:**

| Feature | Implementation |
|---------|----------------|
| Screen reader | Full VoiceOver/TalkBack support |
| Dynamic type | Respect system font size |
| Color contrast | WCAG AA minimum |
| Reduce motion | Honor system setting |
| Haptic feedback | For important actions |

**Call Accessibility:**
- Announce participant joins/leaves
- Provide visual indicators for audio activity
- Support closed captioning (future)

### 6.5 Localization

**Supported Elements:**
- All UI strings
- Date/time formats
- Number formats
- Right-to-left layout support

**Non-Localized:**
- User-generated content (display as-is)
- Cryptographic identifiers (npub, etc.)
- Technical error codes

---

## 7. Platform-Specific Considerations

### 7.1 iOS

**Secure Storage:**
- Use Keychain Services for private keys
- Enable `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`
- Use Secure Enclave for key generation where available

**Background Modes:**
- VoIP push for incoming calls
- Background fetch for relay sync
- Audio session for active calls

**Privacy:**
- Request location "When In Use" only
- Use approximate location where sufficient
- Implement App Tracking Transparency if needed

### 7.2 Android

**Secure Storage:**
- Use Android Keystore for private keys
- Require user authentication for key access
- Use StrongBox if available

**Background Modes:**
- Foreground service for active calls
- WorkManager for periodic sync
- FCM for push notifications

**Privacy:**
- Request fine location only when needed
- Provide rationale strings for all permissions
- Handle permission denial gracefully

### 7.3 Web

**Secure Storage:**
- Use Web Crypto API for key operations
- Store encrypted keys in IndexedDB
- Consider hardware security key support (WebAuthn)

**Limitations:**
- No reliable background operation
- Push notifications require service worker
- Call quality may vary by browser

**Browser Support:**
- Chrome/Edge 90+
- Firefox 90+
- Safari 15+

### 7.4 Desktop (Electron/Tauri)

**Secure Storage:**
- Use OS keychain integration
- Encrypt at-rest data with user password
- Support hardware security keys

**Features:**
- System tray for background operation
- Native notifications
- Multiple window support

---

## 8. Testing Requirements

### 8.1 Unit Tests

| Component | Coverage Target |
|-----------|-----------------|
| Cryptographic operations | 100% |
| Event validation | 100% |
| PoW computation | 100% |
| State management | 80% |
| UI components | 60% |

### 8.2 Integration Tests

| Scenario | Test |
|----------|------|
| DM send/receive | Full encryption roundtrip |
| Group join | PoW, token, MLS welcome |
| Call connect | Token exchange, media flow |
| Relay failover | Reconnection behavior |

### 8.3 End-to-End Tests

| Flow | Validation |
|------|------------|
| Onboarding | Key generation, profile setup |
| Group creation | PoW, relay publish, map display |
| Group call | Multi-participant, encryption |
| Export/Import | Data integrity |

---

## Appendix A: UI Component Library

### A.1 Common Components

| Component | Usage |
|-----------|-------|
| Avatar | User/group profile images |
| Badge | Notification counts, status |
| Button | Primary/secondary actions |
| Card | Content containers |
| Input | Text entry fields |
| List | Scrollable item lists |
| Modal | Dialogs, confirmations |
| Tab Bar | Primary navigation |
| Toast | Transient notifications |

### A.2 Synchrono-Specific Components

| Component | Usage |
|-----------|-------|
| MapPin | Group location markers |
| CallTile | Participant video/audio display |
| CallControls | In-call action bar |
| ConversationRow | Chat list item |
| MessageBubble | Individual message display |
| PoWIndicator | Proof of work progress |
| SecurityBadge | Encryption status indicator |

---

## Appendix B: Checklist

### Pre-Launch Checklist

- [ ] All cryptographic operations use secure random generation
- [ ] Private keys stored in platform secure storage
- [ ] All events validated before processing
- [ ] PoW computed for required event kinds
- [ ] Clock synchronization implemented
- [ ] Location truncated to geohash precision 6
- [ ] MLS key packages maintained
- [ ] Block/mute lists enforced locally
- [ ] Ghost device detection implemented
- [ ] Accessibility requirements met
- [ ] Error handling covers all error codes
- [ ] Offline behavior gracefully handled

### Security Checklist

- [ ] Private key never leaves secure storage
- [ ] Private key never transmitted over network
- [ ] Sensitive data cleared from memory after use
- [ ] Screenshot prevention for sensitive screens
- [ ] Certificate validation for all TLS connections
- [ ] NIP-98 authentication for Sidecar requests
- [ ] Event signatures validated
- [ ] Timestamp validation enforced

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | — | Initial release |

---