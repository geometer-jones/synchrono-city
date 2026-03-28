# Synchrono City Protocol Specification

**Version:** `v1.0-alpha`

This document defines the interoperable core of Synchrono City for the operator-run relay model. For `v1.0-alpha`, the protocol is explicitly bound to Nostr for identity and event transport, LiveKit for real-time media, and Blossom for content-addressed storage.

The primary design assumption is simple:

- a relay is run by its operator
- the operator's pubkey is the durable authority for that relay surface
- moderation, guest admission, and room permissions are local policy
- existing Nostr event kinds should be used wherever possible

The product may still use "district" as UI language for a relay-centered public, but `v1.0-alpha` does not define a portable district object, mirror governance log, or relay-spanning governance artifact.

Related docs:

- `README.md` for repository overview
- `ARCHITECTURE.md` for client UX and component/data-flow design
- `OPERATIONS.md` for configuration, security, observability, and testing
- `ROADMAP.md` for implementation phases and open questions

---

## 1. Identity and Authentication

Synchrono City uses Nostr as the primary identity layer. All participants are identified by their pubkey. The Concierge acts as the relay's policy engine and link layer for restricted operations.

### 1.1 HTTP Authentication (NIP-98)

To interact with restricted services such as vending tokens or uploading blobs, clients must include an `Authorization` header containing a base64-encoded kind `27235` event.

**Required tags:**
- `u`: the absolute URL of the request
- `method`: the HTTP verb, such as `POST` or `PUT`
- `payload`: for `POST` and `PUT`, a SHA-256 hex hash of the request body

---

## 2. Real-Time Media (LiveKit Federation)

Media is routed through independent SFU nodes.

### 2.1 Token Vending Handshake

To join a room, a client requests a JWT from the relay operator's Concierge.

- **Request:** `POST /token` with a NIP-98 header
- **Verification:** Concierge verifies the signature and checks whether the pubkey has permission to join the requested room
- **Response:** a signed LiveKit access token
- **Identity:** the LiveKit identity is set to the user's Nostr pubkey
- **Grants:** `roomJoin`, `canPublish`, and `canSubscribe`

### 2.2 Discovery

Users advertise active LiveKit activity through normal Nostr discovery surfaces:

- NIP-65 relay metadata for where they publish or read
- kind `30311` live activity events when clients want to expose currently active sessions

Clients should discover a room by resolving the operator's relay and then asking that relay's Concierge for media access.

---

## 3. Sovereign Storage (Blossom)

Static assets such as avatars, meeting-spot photos, and recorded voice notes are stored using the Blossom protocol.

### 3.1 Content Addressing (BUD-01)

All files are indexed by their SHA-256 hash.

- **URL format:** `https://<relay-host>/<sha256>.<ext>`
- **Healing:** if a file is unavailable on the local node, the client may query the author's kind `10063` Blossom server list to locate the blob on another node

### 3.2 Metadata (NIP-94)

When a file is uploaded, the client publishes a kind `94` file metadata event containing the `url`, `x` (SHA-256), and `dim` (dimensions) fields for the asset.

---

## 4. Geospatial Interoperability

The interoperable geospatial surface is beacon-scoped public conversation plus relay-local LiveKit room binding.

### 4.1 Beacon Binding

- Public place conversation is organized into NIP-29 groups called beacons
- The beacon group id is the bare canonical `geohash8`
- A beacon carries geohash tags for every prefix length from `1` through `8`
- A beacon is permanently bound to its `geohash8` and must not be moved after creation
- Interoperability assumes beacon identity at `geohash8`
- Relays may present coarser discovery surfaces or gate finer-precision creation as local policy, but the interoperable beacon id remains `geohash8`
- Exact coordinates remain operator-gated and should not be required for baseline interoperability

### 4.2 Beacon Posts and Creation

- Public beacon posts remain kind `1` events
- The `h` tag is the beacon scope everywhere and must match the beacon id
- Clients should treat beacon-scoped kind `1` events as belonging to `World`, not to `Pulse`
- Raw geohash-tagged notes are not the primary public place-conversation model

**Beacon creation:**
- Beacon creation must be idempotent by `geohash8`
- If concurrent clients attempt to create the same beacon, the first successful create wins
- Later concurrent create attempts should return the existing beacon rather than create duplicates
- Implementations should prefer a create-or-return-existing response over surfacing a terminal duplicate-creation error to the client

### 4.3 Beacon-Scoped Call Binding

- LiveKit room id shape is deterministic: `beacon:<geohash8>`
- The LiveKit identity is the user's Nostr pubkey
- Discovery source: active LiveKit membership and/or kind `30311` live activity tagged to the same beacon scope

### 4.4 Live Place State

Synchrono City treats live place participation as relay-local call state rather than as a separate portable Nostr presence artifact.

- Concierge and LiveKit are the authority for who is currently present in a beacon-scoped call
- kind `30311` remains the portable Nostr hint that a live beacon-scoped session exists
- Clients should not require a separate Nostr presence event to render live place state
- Clients should derive current place occupancy from active room membership and relay-scoped room discovery

### 4.5 Private Room Binding (DMs and Group DMs)

Private conversations support LiveKit calling with participant-scoped room access.

**DM room binding:**
- Room ID: `dm:<pubkey1>:<pubkey2>` where pubkeys are sorted lexicographically
- Only the two participants may join
- Either participant may initiate a call at any time

**Group DM room binding:**
- Room ID: `group:<creator-pubkey>:<group-id>` where group-id is a unique identifier
- Membership is defined by the group DM participant list (NIP-17 sealed DM group)
- Only group members may join the room

**Call notification:**
- DM call initiation should notify the other participant via NIP-17 sealed DM (kind 14/15) containing a call offer
- The call offer includes the room ID and a timestamp
- Group DM calls are discovered via the thread listing ("active call" indicator), not via push notification

**Token vending for private rooms:**
- Concierge must verify the requester is a participant before minting a token
- For DMs: requester pubkey must match one of the two participants in the room ID
- For group DMs: requester pubkey must be in the group membership list

**Token vending error responses:**

| Scenario | Response | Reason |
|----------|----------|--------|
| Non-participant requests DM token | 403 Forbidden | `not_participant` |
| Non-member requests group DM token | 403 Forbidden | `not_group_member` |
| Participant is banned | 403 Forbidden | `banned` |
| Group membership lookup fails | 503 Unavailable | Fail closed |
| Invalid room ID format | 400 Bad Request | `invalid_room_id` |

**Security: Room ID validation**
- Concierge must validate room ID format before checking membership
- For DM rooms: extract pubkeys from room ID, verify requester matches one
- For group DM rooms: resolve group-id to membership list, verify requester is member
- **Never trust client-provided membership claims** — always resolve from stored group state
- Room ID tampering attempts should be logged with requester pubkey

**Call notification failure handling:**
- If NIP-17 encryption fails, log error and return 500 (caller should retry)
- If recipient is offline, the call offer is stored as a sealed DM and delivered when they connect
- Call offers expire after 5 minutes if not answered
- Client should show "call missed" notification for expired offers

### 4.6 Relay Public Rooms

Relay operators may organize local public conversation around places, venues, neighborhoods, or temporary events through beacon groups while preserving relay-local authority.

- Public chat remains standard Nostr event flow on the relay
- Beacon owners and admins may moderate beacon-local membership and conversation through NIP-29 roles
- Relay policy and relay auth trump beacon-local authority in all conflicts
- Clients may present beacon-based public rooms in the UI, and those beacons are the canonical public place object

---

## 5. Relay Operator Model and Local Policy

### 5.1 Core Definition

**A relay surface = relay + operator + mod team + local community.**

- The **operator** runs the relay and defines local requirements
- The **mod team** enforces policy under the operator's authority
- The **community** participates according to the operator's rules
- **Operators are sovereign** over their own relay surface

The protocol defines interoperable event handling and service contracts. Moderation, guest admission, and room access are enforced locally by the operator's stack.

### 5.2 Operator Identity and Relay Binding

The operator pubkey is the durable authority for a relay surface.

- Each relay surface has one canonical primary operator pubkey
- The relay URL, name, and slug may change without changing the operator identity
- `v1.0-alpha` assumes one primary relay surface per operator deployment
- The relay's identity is operational, not a separate portable artifact
- If a product surface wants a friendly civic label such as "district", that label is local UX metadata rather than protocol state

### 5.3 Operator Identity and Admin Authentication

Relay operators are identified by Nostr pubkey.

- One primary operator pubkey should be bootstrapped in Concierge configuration
- Operators may delegate additional owner or moderator pubkeys through local admin controls
- The operator should prove control of that pubkey through the client by signing a Concierge login challenge or a NIP-98-authenticated admin request
- The resulting admin session is local to that relay surface and does not change the user's identity on the wider network
- Sensitive actions may require a fresh NIP-98 signature
- First implementation: browser session cookies for admin reads, session plus fresh NIP-98 for sensitive admin writes

### 5.4 Policy Storage and Audit

The Concierge is the source of truth for local moderation and admission policy.

- Role assignments, guest approvals, bans, and room permissions are stored in Concierge-managed persistence
- Stored records include: subject pubkey, assigned role or grant, scope, grantor pubkey, timestamps, and revocation state
- Privileged actions are written to an audit log
- Relay write policy and other restricted services consult Concierge-owned local policy

### 5.5 Moderation and Guest Policy

Relays may maintain open, allowlisted, or blocked participation models.

- **Open mode:** any valid pubkey may read or publish, subject to rate limits and abuse controls
- **Guest list mode:** only approved pubkeys may publish to the relay or use restricted services
- **Blocklist mode:** specific pubkeys are denied local posting, token vending, or storage access
- **Scope:** these policies are local to the relay and do not invalidate the user's identity on the wider Nostr network

### 5.6 LiveKit Access Policy

Relays may also apply pubkey-based policy when vending LiveKit tokens.

- Only specific pubkeys may join certain rooms
- A relay may grant join-only access while withholding publish rights
- Shared beacon rooms may require explicit approval before a pubkey can publish audio or video
- Private or community-operated relays may keep lighter rules

### 5.7 Gate Stacking

The relay access gate is the Concierge policy surface.

**Proof types stack naturally:**
- **PoW:** asks whether the client spent CPU work right now
- **OAuth:** asks whether the relay accepts a higher-trust identity binding for this pubkey
- **Zap:** asks whether the user paid to access or retain a capability

**Recommended first-version gate precedence:**
- `read`: key-only by default, with optional relay-discovered PoW
- `write`: key plus local write policy, with optional OAuth
- `media_join`: same baseline as write
- `media_publish`: write policy plus any stronger room requirement
- `trusted`: operator-issued local standing

**Client UX should stay tiered and legible:**
- On connect, client reads NIP-11 and hydrates local relay policy
- PoW should be silent and automatic when possible
- OAuth should appear as an explicit modal when required
- Zap should appear as a payment flow when required

### 5.8 Follows, Guest Lists, and Discovery

Synchrono City relies on existing Nostr social surfaces rather than custom relay-governance events.

- The user's following list comes from the normal Nostr contact list event (kind `3`)
- Relay preferences and discovery come from NIP-65 relay list metadata (kind `10002`)
- Guest lists, bans, moderator assignments, and room permissions are local Concierge state
- Follow relationships affect discovery and feed aggregation, not moderation authority
- An operator's follow graph may be used for recommendations, but it is not authoritative policy

### 5.9 Local Standing

Standing is the effective relay-local status of a pubkey after local policy checks.

**Standing classes:**
- `guest` - baseline admitted standing once the relay's access requirements are satisfied
- `member` - ordinary participation on the relay
- `trusted` - stronger operator-recognized local standing
- `moderator` - moderation actions within scope
- `owner` - highest local administrative standing
- `suspended` - capabilities overridden within suspension scope
- `banned` - all relay capabilities overridden

**Standing rules:**
- `guest` may be automatic, but the relay may still gate admission through OAuth, payment, PoW, or other local policy
- `banned` overrides all ordinary relay capabilities
- `suspended` overrides capabilities within the suspension scope
- Revocations beat earlier grants for the same standing basis
- Standing is runtime local state, not a portable signed artifact in `v1.0-alpha`

---

## 6. AI Synthesis

AI synthesis exists to lower the activation energy for human connection, not to replace human speech.

- Background synthesis may run periodically over public relay or place-based text
- Immediate synthesis should only happen when explicitly summoned by tagged participants
- Synthesized output must cite source events and remain clearly labeled
- AI synthesis must not act as a hidden governance layer or silently replace operator or moderator decisions
- First implementation: local and operator-configured

If an operator wants to publish synthesis back onto Nostr in `v1.0-alpha`, it should be emitted as an ordinary note using an existing event kind rather than a new protocol kind.

**Recommended published synthesis shape:**
```json
{
  "kind": 1,
  "content": "[AI Summary] Two nearby threads are discussing tenant organizing and mutual aid.",
  "tags": [
    ["e", "<event-id-1>"],
    ["e", "<event-id-2>"],
    ["h", "9q8yyk12"]
  ]
}
```

**Default policy:**
- At most one background synthesis per place and time bucket
- No synthesis for low-activity threads
- Explicit tagged summons may bypass periodic schedule but must cite sources

---

## 7. Event Kinds Summary

Synchrono City `v1.0-alpha` uses existing Nostr event kinds for the interoperable surface.

| Kind | Description | Use Case |
|------|-------------|----------|
| `0` | Metadata | User profiles and NIP-05 identifiers |
| `1` | Note | Public posts, beacon-scoped conversation, optional AI synthesis publication |
| `3` | Contact list | Following list and social graph |
| `94` | File metadata | References Blossom-stored media |
| `27235` | HTTP auth | Authenticate to relay services with NIP-98 |
| `30311` | Live activity | Advertise active beacon-scoped LiveKit activity for discovery |
| `10002` | Relay list | Declare relay read/write preferences |
| `10063` | Blossom list | Discover where a user hosts files |

---

## 8. Input Validation

All user-supplied input must be validated before processing. Invalid input should result in a 400 response with a descriptive error message.

### 8.1 Profile Fields (kind 0)

| Field | Type | Constraints |
|-------|------|-------------|
| `name` | string | 1-100 chars, UTF-8, no control characters (0x00-0x1F except 0x09, 0x0A, 0x0D) |
| `display_name` | string | 0-100 chars, UTF-8, no control characters |
| `about` | string | 0-1000 chars, UTF-8 |
| `picture` | URL | Valid HTTPS URL, max 500 chars |
| `nip05` | string | Valid NIP-05 identifier format (identifier@domain) |

### 8.2 Note Content (kind 1)

| Field | Type | Constraints |
|-------|------|-------------|
| `content` | string | 1-10,000 chars, UTF-8 |
| `tags` | array | Max 100 tags per event |

**Tag validation:**
- `g` (geohash): 1-9 alphanumeric chars, must be valid base32 geohash
- `h` (beacon scope): exactly 8 alphanumeric chars, must be a valid base32 geohash matching a beacon id
- `p` (pubkey): 64 hex chars
- `e` (event id): 64 hex chars

### 8.3 Geohash Tags

Geohash validation rules:
- **Format:** 1-9 lowercase alphanumeric characters
- **Valid chars:** `0123456789bcdefghjkmnpqrstuvwxyz` (base32)
- **Precision:** Relay may enforce maximum precision (default: geohash8)
- **Boundary:** Coordinates at geohash boundaries should resolve to correct prefix

**On invalid geohash:**
- If format invalid: reject event with 400
- If precision exceeds policy: truncate to policy max, accept event

### 8.4 Beacon Scope Tags

Beacon scope validation rules:
- **Format:** exactly 8 lowercase alphanumeric characters
- **Valid chars:** `0123456789bcdefghjkmnpqrstuvwxyz` (base32)
- **Scope:** for beacon-scoped kind `1` events and live-activity hints, `h` must match the target beacon id
- **Authority:** relay policy may reject beacon-scoped events that reference non-existent or unauthorized beacons

**On invalid beacon scope:**
- If format invalid: reject event with 400
- If the target beacon does not exist where existence is required: reject event with 404 or policy-specific denial
- If the user lacks publish authority for that beacon: reject event with 403

### 8.5 Admin Configuration

Admin config changes require schema validation per field type:

| Field Type | Validation |
|------------|------------|
| String | Max length, no control characters |
| Integer | Range check, non-negative where applicable |
| Boolean | Must be `true` or `false` |
| Pubkey | 64 hex chars |
| JSON object | Valid JSON, max depth 5, max keys 100 |

### 8.5 File Uploads (Blossom)

| Constraint | Value |
|------------|-------|
| Max file size | 50 MB |
| Allowed MIME types | `image/*`, `audio/*`, `video/*`, `application/pdf` |
| Filename | Max 255 chars, no path separators |

---

## 9. Relay Authorization Contract

### Endpoint
- **Method:** `POST`
- **Path:** `/internal/relay/authorize`
- **Content-Type:** `application/json`

### Request
```json
{
  "action": "publish",
  "scope": "relay",
  "pubkey": "aa...aa",
  "event": {
    "id": "bb...bb",
    "kind": 1,
    "created_at": 1773356400,
    "tags": [["p", "cc...cc"], ["e", "dd...dd"]]
  }
}
```

### Response
```json
{
  "allow": false,
  "reason": "blocked",
  "scope": "relay",
  "capabilities": {
    "can_moderate": false
  },
  "policy": {
    "publish": {
      "allowed": false,
      "reason": "blocked",
      "mode": "open",
      "proof_requirement": "none",
      "proof_requirement_met": false,
      "gates": []
    }
  }
}
```

### Reason Values
- `blocked` - Pubkey is on blocklist
- `privileged_override` - Operator or moderator override
- `policy_open` - Open policy, allowed
- `allowlisted` - On guest list or allowlist
- `required_proof` - Proof required but not provided
- `not_allowlisted` - Guest list policy, not on list
- `resource_closed` - Resource is closed
- `unsupported_resource` - Unknown resource type

### Failure Semantics
- **200 OK:** Policy evaluated (check `allow` field)
- **400 Bad Request:** Malformed request -> deny
- **503 Service Unavailable:** Concierge unavailable -> fail closed
