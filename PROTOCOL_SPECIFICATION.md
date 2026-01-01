# Synchrono City Protocol Specification

> Technical protocol details, event formats, and cryptographic parameters for Synchrono City implementations.

**Version:** 1.0.0

**Constitution Reference:** v1.0.0

---

## 1. OVERVIEW

This document defines the technical protocol requirements for Synchrono City implementations. It supplements the Constitution, which defines principles and governance. Implementations MUST comply with both documents to ensure interoperability and security.

---

## 2. NOSTR PROTOCOL FOUNDATION

### 2.1 Required NIPs

Implementations MUST support the following Nostr Implementation Possibilities (NIPs):

| NIP | Purpose | Implementation Notes |
| --- | --- | --- |
| **01** | Basic Protocol | Core event structure, subscriptions, req/close. |
| **02** | Contact List | Follow lists. |
| **09** | Event Deletion | Kind 5 deletion requests. |
| **10** | Reply Threading | `e` and `p` tags for context. |
| **13** | Proof of Work | Nonce-based computational commitment. |
| **17** | Private DMs | Base layer for 1:1 communication. |
| **29** | Groups | Relay-based group chat (Core for "Town Squares"). |
| **42** | Authentication | Relay auth challenges. |
| **44** | Encryption | XChaCha20-Poly1305 (Versioned). |
| **51** | Lists | Mute lists (Kind 10000), follow sets. |
| **59** | Gift Wraps | **REQUIRED** for token encryption and MLS welcomes. |
| **65** | Relay Lists | Kind 10002 for relay selection & discovery. |
| **78** | Application Data | Bot identification (Kind 30078). |
| **98** | HTTP Auth | Authentication for Sidecar API endpoints. |
| **B7** | Blossom | Content-addressed media storage. |

### 2.2 Optional NIPs

| NIP | Purpose |
| --- | --- |
| **47** | Wallet Connect |
| **57** | Zaps |
| **89** | App Handlers |

---

## 3. EVENT KIND REGISTRY

### 3.1 Standard & Group Kinds

| Kind | Description | NIP |
| --- | --- | --- |
| `0` | Metadata | 01 |
| `1` | Short Text Note | 01 |
| `5` | Event Deletion | 09 |
| `1059` | Gift Wrap | 59 |
| `1063` | File Metadata | 94 |
| `9007` | Create Group | 29 (Impl.) |
| `9008` | Delete Group | 29 (Impl.) |
| `9000-9030` | Group Admin/Requests | 29 |
| `10000` | Mute List | 51 |
| `30078` | Application Data | 78 |
| `39000` | Group Metadata | 29 |

### 3.2 Synchrono City Specific Kinds

#### Persistent Kinds (Call Records)

| Kind | Description | Persistence | Context |
| --- | --- | --- | --- |
| `1020` | Call Initiation | Persistent | Public/Group |
| `1021` | Call End | Persistent | Public/Group |
| `1022` | DM Call Offer | Persistent | DM (NIP-17) |
| `1023` | DM Call End | Persistent | DM (NIP-17) |
| `30022` | MLS Key Package | Persistent | Public (Parameterized Replaceable) |

#### Ephemeral Kinds (Signaling & State)

| Kind | Description | Persistence | Context |
| --- | --- | --- | --- |
| `20002` | Call Join Request | Ephemeral | Public/Group |
| `20003` | Call Token Response | Ephemeral | Private (HTTP) |
| `20004` | Participant Join | Ephemeral | Public/Group |
| `20005` | Participant Leave | Ephemeral | Public/Group |
| `20007` | Epoch Leader Transfer | Ephemeral | Public/Group |
| `20011` | DM Call Answer | Ephemeral | DM (NIP-17) |
| `20012` | DM Call Reject | Ephemeral | DM (NIP-17) |
| `20020` | MLS Welcome | Ephemeral | Private (Wrapped) |
| `20021` | MLS Commit | Ephemeral | Public/Group |


*\*Note: Kind 20022 is technically ephemeral but has a 7-day expiration tag.* 

## 4. EVENT FORMATS

### 4.1 Call Signaling (Group Context)

#### Call Initiation (Kind 1020)

*Published by the first user to start a room. Serves as the immutable, persistent root of the call history.*

```json
{
  "kind": 1020,
  "content": "Call started in Town Square",
  "tags": [
    ["h", "<group-id>"],
    ["relay", "wss://relay.example.com"],
    ["nonce", "23849", "24"]
  ]
}
```

**Validation:**
- MUST include PoW nonce meeting 24-bit target.
- Publisher automatically becomes first Epoch Leader upon successful join.

#### Call Join Request (Kind 20002)

*Published by a user wishing to enter an existing room.*
```json
{
  "kind": 20002,
  "content": "",
  "tags": [
    ["e", "<kind-20001-id>", "<relay-url>", "root"],
    ["h", "<group-id>"],
    ["expiration", "<unix-timestamp>"],
    ["nonce", "82392", "12"]
  ]
}
```

* **Expiration:** MUST be set (max 1 hour).
* **Nonce:** MUST meet 12-bit PoW target.

#### Call Token Response (Kind 20003)

*Returned by the Sidecar via HTTP, wrapped in NIP-59 Gift Wrap.*

**Inner Event Payload (Decrypted Content):**
The `content` field MUST be a JSON string adhering to this schema:

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "url": "wss://livekit.example.com",
  "room": "hash_of_group_and_call_id",
  "expiry": 1735689000
}
```

#### Participant Join (Kind 20004)

*Published by Sidecar when user successfully connects. Ephemeral.*
```json
{
  "kind": 20004,
  "content": "",
  "tags": [
    ["e", "<kind-20001-id>", "<relay-url>", "root"],
    ["h", "<group-id>"],
    ["p", "<participant-pubkey>"],
    ["expiration", "<unix-timestamp>"]
  ]
}
```

#### Participant Leave (Kind 20005)

*Published by Sidecar on disconnect. Ephemeral.*
```json
{
  "kind": 20005,
  "content": "",
  "tags": [
    ["e", "<kind-20001-id>", "<relay-url>", "root"],
    ["h", "<group-id>"],
    ["p", "<participant-pubkey>"],
    ["expiration", "<unix-timestamp>"]
  ]
}
```

#### Call End (Kind 20006)

*Published by Sidecar when last participant leaves. Persistent.*
```json
{
  "kind": 20006,
  "content": "Call ended. Duration: 45m.",
  "tags": [
    ["e", "<kind-20001-id>", "<relay-url>", "root"],
    ["h", "<group-id>"],
    ["duration", "2700"]
  ]
}
```

#### Epoch Leader Transfer (Kind 20007)

*Published by Sidecar when leadership changes.*
```json
{
  "kind": 20007,
  "content": "",
  "tags": [
    ["e", "<kind-20001-id>", "<relay-url>", "root"],
    ["h", "<group-id>"],
    ["p", "<new-leader-pubkey>", "leader"],
    ["p", "<previous-leader-pubkey>", "previous"],
    ["reason", "departure|admin|timeout"]
  ]
}
```

**Reason Values:**
- `departure`: Previous leader left the call.
- `admin`: Group admin forced leadership transfer.
- `timeout`: Previous leader failed to process pending operations.

#### 4.1.1 Active Call Resolution (The "Oldest Active Root" Rule)
To prevent split-brain scenarios where a group has multiple parallel calls, Clients MUST use the following logic to determine the authoritative `call_id` (Kind 1020):

1. **Fetch:** Query Relay for all Kind `1020` events for the group (`#h` tag) from the last 24 hours.
2. **Fetch:** Query Relay for all Kind `1021` (Call End) events for the group.
3. **Filter:** Discard any Kind `1020` that is referenced by a Kind `1021` `e` tag (Closed calls).
4. **Sort:** Sort the remaining events by `created_at` ASCending.
5. **Select:** The **first** (oldest) event in this list is the Authoritative Active Call.
    - If the list is empty, the group is idle.
    - If multiple exist, all clients align on the oldest one to merge the room.

### 4.2 Call Signaling (DM Context)

#### DM Call Offer (Kind 20010)

*Published to initiate a 1:1 call. Persistent to record call history.*
```json
{
  "kind": 20010,
  "content": "<encrypted-payload-with-sidecar-url>",
  "tags": [
    ["p", "<recipient-pubkey>"],
    ["nonce", "12849", "12"]
  ]
}
```

#### DM Call Answer (Kind 20011)

*Published to accept a 1:1 call. Ephemeral.*
```json
{
  "kind": 20011,
  "content": "<encrypted-payload>",
  "tags": [
    ["p", "<caller-pubkey>"],
    ["e", "<kind-20010-id>", "<relay-url>", "root"],
    ["nonce", "43921", "8"]
  ]
}
```

#### DM Call Reject (Kind 20012)

*Published to decline a 1:1 call. Ephemeral.*
```json
{
  "kind": 20012,
  "content": "",
  "tags": [
    ["p", "<caller-pubkey>"],
    ["e", "<kind-20010-id>", "<relay-url>", "root"],
    ["nonce", "19283", "8"]
  ]
}
```

#### DM Call End (Kind 20013)

*Published when a 1:1 call terminates. Persistent to record duration.*
```json
{
  "kind": 20013,
  "content": "Call ended",
  "tags": [
    ["p", "<other-participant-pubkey>"],
    ["e", "<kind-20010-id>", "<relay-url>", "root"],
    ["duration", "300"]
  ]
}
```

### 4.3 Group Location (Kind 39000)

Location data is stored on the standard NIP-29 Group Metadata event. This event is Replaceable.
```json
{
  "kind": 39000,
  "content": "The Historic Town Square",
  "tags": [
    ["d", "<group-id>"],
    ["name", "Town Square"],
    ["about", "A public gathering place."],
    ["g", "9q8yyk", "6"],
    ["location", "37.77", "-122.41"]
  ]
}
```

* **`g` tag:** Geohash. MUST NOT exceed precision 6 (~1.2km).
* **`location` tag:** Raw Lat/Long for display purposes. Precision MUST be truncated to match geohash level 6 (2 decimal places).

### 4.4 Block List (Kind 10006)

*Public list of blocked pubkeys for infrastructure enforcement.*
```json
{
  "kind": 10006,
  "content": "",
  "tags": [
    ["p", "<blocked-pubkey-1>"],
    ["p", "<blocked-pubkey-2>"]
  ]
}
```

* **Visibility:** Public (unencrypted) to enable Sidecar enforcement.
* **Replaceable:** Yes (Kind 10006 is a replaceable list per NIP-51 conventions).
* **PoW:** MUST include nonce meeting 12-bit target.

### 4.5 Mute List (Kind 10000)

*Private list of muted pubkeys. Client-enforced only.*

Per NIP-51, mute lists are encrypted and stored as Kind 10000. The Sidecar does not read or enforce mute lists; they are purely client-side.

### 4.6 Bot Identification (Kind 30078)

*Application-specific data for bot identification per NIP-78.*
```json
{
  "kind": 30078,
  "content": "{\"name\": \"HelperBot\", \"description\": \"Automated assistant\", \"operator\": \"<operator-pubkey>\"}",
  "tags": [
    ["d", "synchrono:bot"]
  ]
}
```

Alternatively, bots MAY set `"bot": true` in their Kind 0 Metadata event.

**Kind 0 "bot" Field Definition:**
For clients relying on Kind 0 metadata for identification, the JSON content MUST include a boolean field `"bot"`.

```json
{
  "name": "MyBot",
  "about": "I am a robot.",
  "bot": true
}
```
---

## 5. ENCRYPTION SPECIFICATIONS

### 5.1 MLS Configuration (Group Calls)

Group calls use **IETF RFC 9420 (MLS)** for end-to-end encrypted key agreement.

**Cipher Suite:** `MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519`

**Epoch Leader Model:**
- The first participant to join a call becomes the "Epoch Leader."
- The Epoch Leader is responsible for issuing MLS commits (adding/removing participants).
- The Sidecar facilitates MLS operations (routing commits, distributing welcomes) but does not possess private key material.

**Leadership Transfer:**

| Trigger | Behavior |
| --- | --- |
| Clean departure | Leader issues final commit removing themselves, then disconnects. Sidecar assigns longest-present participant as new leader and publishes Kind 20007. |
| Unexpected disconnect | Sidecar detects via LiveKit webhook, assigns longest-present participant, publishes Kind 20007, new leader issues commit. |
| Admin removal | Admin issues removal request via group admin event. Sidecar forces transfer, publishes Kind 20007 with reason `admin`. |
| Timeout | If leader fails to process pending joins for >30 seconds, Sidecar MAY force transfer with reason `timeout`. |

**Key Packages:**
- Users publish **Kind 30022** events containing their MLS Key Packages.
- **Persistence:** These are **Parameterized Replaceable Events** (NIP-33).
- **Differentiation:** Users MUST use a unique `d` tag for each package (e.g., UUID or monotonic counter).
- **Expiration:** Key Packages expire after 7 days (`expiration` tag) and must be refreshed.
- Clients SHOULD maintain 3-5 active Key Packages to allow multiple users to add them simultaneously without race conditions.

### 5.2 Media Encryption (LiveKit)

All media frames MUST be encrypted using **Insertable Streams**.

* **Key Material:** Derived from the MLS `Exporter` secret.
* **Key Label:** `"synchrono-city-frame-key"`
* **Context:** `<room_name> || <epoch_int64_big_endian>`

Frame encryption ensures that even the LiveKit SFU cannot access media content.

### 5.3 NIP-44 (Direct Messages)

All 1:1 signaling (Offers/Answers) MUST use NIP-44 versioned encryption (XChaCha20-Poly1305).

---

## 6. PROOF OF WORK (PoW)

Difficulty targets are set based on **Resource Asymmetry**. Actions that impose permanent storage costs or heavy cryptographic load on the infrastructure require higher difficulty.

### 6.1 Difficulty Targets

| Action | Kind | Target (Bits) | Rationale |
| --- | --- | --- | --- |
| **Create Group** | `9007` | **28** | Highest Cost: Permanent relay storage allocation. |
| **Call Initiation** | `1020` | **24** | High Cost: Persistent root, initializes MLS tree. |
| **Update Profile** | `0` | **20** | Medium Cost: Replaceable storage, frequent updates. |
| **MLS Key Package** | `20022` | **16** | Medium Cost: 7-day storage, cryptographic validation. |
| **DM Call Offer** | `20010` | **12** | Medium-Low Cost: Persistent storage, 1:1 scope. |
| **Join Call** | `20002` | **12** | Low Cost: Ephemeral request, fast UX required. |
| **Block List Update** | `10006` | **12** | Low Cost: Replaceable, infrequent updates. |
| **DM Call Answer** | `20011` | **8** | Low Cost: Ephemeral, time-sensitive response. |
| **DM Call Reject** | `20012` | **8** | Low Cost: Ephemeral, time-sensitive response. |

**Exempt from PoW:**
- Kind 5 (Event Deletion): User-initiated cleanup should not be discouraged.
- Kind 20004/20005 (Participant Join/Leave): Published by Sidecar, not user-initiated.
- Kind 20006 (Call End): Published by Sidecar.
- Kind 20007 (Epoch Leader Transfer): Published by Sidecar.
- Kind 20003 (Token Response): Delivered via HTTP, not relay.

### 6.2 Mechanism

Standard NIP-13. The `nonce` tag MUST be present with format `["nonce", "<nonce-value>", "<target-bits>"]`.

Sidecars and Relays SHOULD reject events below the target difficulty for their respective kinds.

---

## 7. REAL-TIME INFRASTRUCTURE (LiveKit)

### 7.1 Token Format (JWT)

The Sidecar issues signed JWTs for the SFU.

**Required Claims:**
* **Subject (`sub`):** User's Nostr Pubkey (Hex).
* **JWT ID (`jti`):** Unique identifier for single-use enforcement.
* **Expiration (`exp`):** Current time + 180 seconds.
* **Video Grant:**
  * `roomJoin`: true
  * `canPublish`: true
  * `canSubscribe`: true
  * `room`: `SHA256(group_id + call_initiation_id)`

### 7.2 Single-Use Enforcement

To prevent replay attacks:

1. Sidecar generates unique `jti` for each token.
2. Sidecar caches issued `jti` values for 5 minutes.
3. LiveKit Webhook reports `participant_joined` with participant identity.
4. Sidecar marks `jti` as consumed.
5. Any subsequent connection attempt with the same identity before token expiry is rejected.

### 7.3 Room Lifecycle

| Event | Sidecar Action |
| --- | --- |
| First participant joins | Initialize MLS tree, set participant as Epoch Leader. |
| Participant joins | Validate token, notify Epoch Leader to issue MLS commit. |
| Participant leaves | Publish Kind 20005, notify Epoch Leader to issue removal commit. |
| Epoch Leader leaves | Transfer leadership per §5.1, publish Kind 20007. |
| Last participant leaves | Publish Kind 20006, tear down MLS state. |

---

## 8. SIDECAR API

The Sidecar exposes an HTTP API for operations that cannot be handled via Relays alone.

**Authentication:** All endpoints require **NIP-98** (HTTP Auth) headers.

### 8.1 Endpoints & Response Schemas

All API endpoints require NIP-98 Authentication (except `/health`).
All success responses return **HTTP 200 OK** with `application/json`.

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/health` | Service status, version, and server time for clock sync. |
| `POST` | `/token/group` | Exchange Kind 20002 for LiveKit Token (Group). |
| `POST` | `/token/dm` | Exchange Kind 20010/20011 for LiveKit Token (DM). |
| `POST` | `/proxy` | Proxies requests to Blossom/Link previews to hide IP. |
| `GET` | `/mls/state/{room_id}` | Fetch current MLS epoch/tree hash for a room. |
| `POST` | `/mls/commit` | Submit MLS commit (Epoch Leader only). |
| `POST` | `/device/register` | Register mobile push token (FCM/APNS). |

#### `POST /token/group` & `POST /token/dm`
Returns the LiveKit token wrapped in a NIP-59 Gift Wrap event (Kind 1059), which contains the sealed Kind 20003.

**Response (JSON):**
```json
{
  "wrapped_token_event": {
    "kind": 1059,
    "content": "...",
    "tags": [...]
  },
  "metadata": {
    "warning": "blocked_user_present" // Optional
  }
}
```

#### `GET /mls/state/{room_id}`
Returns the current public state of the MLS group to help clients sync.

**Response (JSON):**

```json
{
  "room_id": "string",
  "epoch": 12,
  "tree_hash": "hex_string",
  "epoch_leader_pubkey": "hex_string",
  "active_members": ["pubkey1", "pubkey2"]
}
```

#### `POST /proxy` (Upload Action)

**Response (JSON):**

```json
{
  "url": "[https://media.yourdomain.com/hash.ext](https://media.yourdomain.com/hash.ext)",
  "sha256": "hex_hash_of_file",
  "size": 1024,
  "mime_type": "image/jpeg"
}
```

#### `POST /device/register`

Registers a device push token (FCM/APNS) to a public key.

**Response (JSON):**

```json
{
  "status": "registered",
  "service": "fcm" // or "apns"
}
```

#### `GET /health`
Used for service monitoring and client clock synchronization.

**Response (JSON):**

```json
{
  "status": "ok",
  "version": "1.0.0",
  "time": 1704067200 // Unix timestamp
}
```

#### `POST /mls/commit`

Acknowledges that the Sidecar has accepted the new MLS commit and will broadcast it to the group.

**Response (JSON):**

```json
{
  "status": "accepted",
  "epoch": 13 // The new epoch number
}
```

### 8.2 Token & MLS Join Flow (Group Call)

The join process is asynchronous: the Sidecar grants transport access (LiveKit Token), while the current Epoch Leader grants encryption access (MLS Welcome).

1.  **Client (Joiner):** Generates Kind `20002` (Join Request) with PoW (12 bits).
2.  **Client (Joiner):** Sends POST to `/token/group` with the event in the body.
3.  **Sidecar:** Performs validation (Signature, PoW, Timestamps, Bans, Block Lists).
    - Fetches requester's Block List (Kind 10006) from Relay.
    - Fetches Block Lists of all current room participants.
    - **Rejection:** Rejects if any *current* participant has blocked the requester (Protects the incumbent).
    - **Warning:** Checks if requester has blocked any *current* participant. If yes, the Sidecar MUST issue the token but SHOULD include a `warning: "blocked_user_present"` flag in the response metadata (Respects user agency).
4.  **Sidecar (Response):**
    * Generates LiveKit JWT (Video Grant).
    * Wraps token in NIP-59 Gift Wrap.
    * Returns `200 OK` with wrapped token.
5.  **Client (Joiner):** Connects to LiveKit WebSocket.
6.  **Sidecar:** Detects successful LiveKit connection and publishes Kind `20004` (Participant Join) to the Relay.
7.  **Client (Epoch Leader):** Observes Kind `20004` from Sidecar.
    * Validates that the new participant's key package is available.
    * Adds participant to MLS Tree.
    * Publishes Kind `20021` (Commit) to Group.
    * Publishes Kind `20020` (Welcome) wrapped for the new participant.
8.  **Client (Joiner):** Receives Kind `20020` (Welcome), decrypts MLS state, derives media keys, and begins decrypting LiveKit frames.

### 8.3 Token Request Flow (DM Call)

1. **Caller:** Publishes Kind 20010 (Offer) to Relay.
2. **Callee:** Receives offer, publishes Kind 20011 (Answer) to Relay.
3. **Both Parties:** Send POST to `/token/dm` with their respective event.
4. **Sidecar:** Validates both events reference the same call, issues tokens to both.

### 8.4 Clock Validation

All event timestamps are validated against server time:
- **Tolerance:** ±5 minutes.
- Events outside this window are rejected with `TIMESTAMP_OUT_OF_RANGE`.

### 8.5 Media Proxy (Blossom)

**Endpoint:** `POST /proxy`
**Auth:** NIP-98 (Required)
**Content-Type:** `multipart/form-data`

**Schema:**
- `action`: "upload" | "download"
- `service`: "blossom"
- `file`: (Binary data, required for upload)
- `url`: (String, required for download)

**Behavior:**
Sidecar verifies NIP-98 auth, strips the client IP, and forwards the request to the configured Blossom server using the Sidecar's own credentials/IP.

---

## 9. RELAY & MEDIA REQUIREMENTS

### 9.1 Relay Metadata

Relays supporting Synchrono City MUST advertise the `synchrono_city` object in their NIP-11 Document.
```json
{
  "name": "TownSquare Relay",
  "software": "strfry",
  "supported_nips": [1, 2, 9, 10, 13, 17, 29, 42, 44, 51, 59, 78, 98],
  "synchrono_city": {
    "version": "1.0.0",
    "sidecar_url": "https://sidecar.townsquare.com",
    "blossom_url": "https://media.townsquare.com",
    "livekit_url": "wss://livekit.townsquare.com"
  }
}
```

### 9.2 Relay Event Handling

**Timestamp Validation:**
- Relays SHOULD reject events with timestamps more than 5 minutes in the past or future.

**PoW Validation:**
- Relays SHOULD validate PoW for kinds with defined targets.
- Relays MAY apply stricter targets during high load.

**Deletion Handling:**
- Relays SHOULD honor Kind 5 deletion requests per NIP-09.
- Relays SHOULD remove deleted events from storage and cease serving them.

### 9.3 Blossom (Media)

* **Proxying:** Clients MUST NOT upload directly to Blossom. They MUST use the Sidecar `/proxy` endpoint to strip IP addresses.
* **Allowlist:** Sidecar MUST enforce MIME type allowlist:
  - Images: `image/jpeg`, `image/png`, `image/gif`, `image/webp`
  - Audio: `audio/mpeg`, `audio/ogg`, `audio/wav`
  - Video: `video/mp4`, `video/webm`
  - Documents: `application/pdf`
* **Strict Block:** Executables, archives, scripts, and all other MIME types are rejected.
* **Size Limits:** Operators MAY set per-file and per-pubkey storage limits.

#### 9.3.1 Hash Matching Privacy
To comply with Constitution Section 11.2 regarding illegal content detection without violating user privacy:

* **Local Enforcement:** The Sidecar MUST perform hash matching locally against a downloaded or cached database of prohibited hashes.
* **No External Leakage:** The Sidecar MUST NOT transmit file hashes of user content to external third-party verification services (e.g., via API) during the validation process, as this leaks metadata about file existence.
* **Blind Matching:** If an external oracle is required, the implementation MUST use a privacy-preserving set intersection protocol (e.g., k-anonymity prefixes) to ensure the external service cannot identify the specific file being checked.

---

## 10. ERROR CODES

Sidecar responses use standard HTTP codes with detailed JSON payloads.
```json
{
  "error": {
    "code": "POW_INSUFFICIENT",
    "message": "Event difficulty 8 is less than required 12",
    "details": { "provided": 8, "required": 12 }
  }
}
```

| Code | HTTP Status | Meaning |
| --- | --- | --- |
| `INVALID_SIGNATURE` | 400 | Event or NIP-98 signature validation failed. |
| `POW_INSUFFICIENT` | 400 | NIP-13 nonce target not met. |
| `TIMESTAMP_OUT_OF_RANGE` | 400 | Event timestamp >5 minutes from server time. |
| `EVENT_EXPIRED` | 400 | Event expiration tag exceeded. |
| `TOKEN_EXPIRED` | 401 | JWT expired. |
| `AUTH_REQUIRED` | 401 | Missing or invalid NIP-98 header. |
| `NOT_GROUP_MEMBER` | 403 | User is not in the NIP-29 group. |
| `USER_BANNED` | 403 | User is in the group ban list. |
| `BLOCKED_BY_PARTICIPANT` | 403 | A current room participant has blocked this user. |
| `NOT_EPOCH_LEADER` | 403 | MLS commit submitted by non-leader. |
| `EPOCH_LEADER_TIMEOUT` | 408 | Leader failed to process join within 30 seconds. |
| `MLS_EPOCH_MISMATCH` | 409 | Client MLS state is stale; fetch `/mls/state`. |
| `RATE_LIMITED` | 429 | Exceeded per-pubkey or per-IP rate limits. |
| `INTERNAL_ERROR` | 500 | Unexpected server error. |

---

## 11. CLIENT REQUIREMENTS

### 11.1 Clock Synchronization

**Detection:**
- Clients SHOULD check clock offset against a trusted NTP source or well-known HTTPS endpoint on application launch.
- Clients MAY use the `Date` header from Sidecar `/health` endpoint as a reference.

**User Notification:**
- Clients MUST warn users when detected clock drift exceeds **±30 seconds**.
- Warning SHOULD explain that clock drift may cause connection failures.

**Enforcement:**
- Clients MAY refuse to create events when drift exceeds **±5 minutes**.
- Clients SHOULD prompt users to correct system time before proceeding.

### 11.2 Block List Handling

- Clients MUST fetch and cache their own Block List (Kind 10006) on startup.
- Clients MUST warn users before joining a room where a blocked user is present.
- Clients SHOULD provide UI to manage block list.
- Clients MUST publish updated Block List when user adds/removes blocks.

### 11.3 Mute List Handling

- Clients MUST fetch and decrypt their Mute List (Kind 10000) on startup.
- Clients MUST locally filter content from muted pubkeys.
- Clients MUST render muted participants in calls as silence (audio) and black frame (video).
- Clients SHOULD NOT inform the muted party that they are muted.

### 11.4 MLS State Management

- Clients MUST maintain current MLS epoch and tree hash.
- Clients MUST fetch fresh state from `/mls/state/{room_id}` on `MLS_EPOCH_MISMATCH` error.
- Clients MUST validate that all keys in the MLS tree correspond to known, verified participants.
- Clients MUST alert users and MAY terminate connection if unauthorized keys ("ghost devices") are detected.

### 11.5 Key Package Maintenance

- Clients SHOULD maintain 3-5 valid Key Packages published to the Relay.
- Clients MUST refresh Key Packages before expiration (7-day lifetime).
- Clients SHOULD publish new Key Packages at application startup if fewer than 3 are valid.

---

## 12. SECURITY CONSIDERATIONS

### 12.1 Token Security

- Tokens MUST be transmitted only over TLS.
- Tokens MUST NOT be logged by clients or infrastructure.
- Tokens MUST be cleared from memory after use.

### 12.2 Key Material Security

- Private keys MUST be stored in platform-appropriate secure storage (Keychain, Keystore, etc.).
- MLS epoch secrets MUST be cleared when leaving a call.
- Key Packages SHOULD be generated with fresh key material, not derived from identity keys.

### 12.3 Event Validation

All events received from relays MUST be validated:
- Signature verification (NIP-01)
- Timestamp within acceptable range
- Required tags present
- PoW meets target (for kinds with requirements)

### 12.4 Rate Limiting

Sidecars SHOULD implement rate limiting:
- Per-pubkey limits for token requests
- Per-IP limits for unauthenticated endpoints
- Stricter limits during detected abuse

---

## DEFINITIONS

All terms used in this specification are defined in the Constitution Appendix A.

---

## VERSION HISTORY

| Version | Date | Changes |
| --- | --- | --- |
| 1.0.0 | — | Initial release. |