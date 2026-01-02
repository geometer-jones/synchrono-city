# Synchrono City Developer Guidelines

> Code patterns, security practices, error handling, and implementation guidance for Synchrono City developers.

**Version:** 1.0.0

**Constitution Reference:** v1.0.0  
**Protocol Specification Reference:** v1.0.0

---

## 1. INTRODUCTION

### 1.1 Purpose

This document provides practical guidance for developers building clients, operators deploying infrastructure, and contributors extending the Synchrono City protocol. It translates the principles in the Constitution and the technical requirements in the Protocol Specification into actionable patterns and best practices.

### 1.2 Audience

- **Client Developers:** Building user-facing applications (mobile, desktop, web)
- **Infrastructure Operators:** Deploying relays, sidecars, LiveKit, and Blossom servers
- **Protocol Contributors:** Extending or improving the core protocol
- **Security Auditors:** Reviewing implementations for compliance

### 1.3 Document Relationships

| Document | Purpose |
|----------|---------|
| Constitution | Principles, governance, user rights |
| Protocol Specification | Event formats, cryptographic parameters, API contracts |
| Developer Guidelines (this document) | Code patterns, error handling, implementation advice |
| Operator Guide | Deployment, configuration, operations |
| Client Implementation Guide | UX requirements, offline behavior, platform specifics |

### 1.4 REFERENCE TECH STACK

While the protocol is implementation-agnostic, the reference implementation uses the following stack. Contributors are encouraged to stick to these choices to ensure compatibility and maintainability.

## Frontend (Client)

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Framework | Flutter / Dart | Cross-platform (iOS/Android) |
| Crypto/MLS | Rust Bridge (`flutter_rust_bridge` + `openmls`) | REQUIRED for secure MLS implementation |
| State | Riverpod | Asynchronous state management |
| Database | Drift (SQLite) | Type-safe persistence for encrypted history |
| Media | LiveKit Client | WebRTC abstraction with MLS key distribution |
| Map | flutter_map | Open source map rendering |

## Backend (Relay)

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Framework | Khatru | Customizable framework for building relays |
| Logic | Custom Go Implementation | NIP-29 Group state management |
| Storage | Postgres | Relational data integrity |

## Backend (Sidecar)

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Language | Go | High concurrency, type safety |
| Framework | Chi v5 | Lightweight HTTP routing |
| MLS Logic | Rust Microservice (gRPC + `openmls`) | REQUIRED Validation of MLS Epochs |
| Communication | gRPC / Protobuf | Type-safe interface between Go and Rust |
| Nostr | `nbd-wtf/go-nostr` | Standard Go Nostr library |
| Cache | Redis | Token replay protection and MLS state |

## Infrastructure

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Media Storage | Blossom Server (`hzrd149/blossom-server`) | Dockerized media storage |
| Media Server | LiveKit Server | WebRTC SFU for real-time voice/video |
| Reverse Proxy | Traefik | TLS termination, WebSocket routing, dashboard |
| Orchestration | Docker Compose | Unified local development |

---

## 2. ARCHITECTURE OVERVIEW

### 2.1 Component Responsibilities

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              CLIENT                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │   Nostr     │  │    MLS      │  │   LiveKit   │  │   Blossom   │    │
│  │   Signer    │  │   Engine    │  │   Client    │  │   Client    │    │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘    │
└─────────┼────────────────┼────────────────┼────────────────┼───────────┘
          │                │                │                │
          ▼                ▼                ▼                ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│     RELAY       │  │    SIDECAR      │  │    LIVEKIT      │
│  (Event Store)  │  │  (Policy Gate)  │  │     (SFU)       │
└─────────────────┘  └────────┬────────┘  └─────────────────┘
                              │
                              ▼
                     ┌─────────────────┐
                     │    BLOSSOM      │
                     │  (Media Store)  │
                     └─────────────────┘
```

### 2.2 Trust Boundaries

Understanding trust boundaries is critical for secure implementation:

| Boundary | Trust Level | Implications |
|----------|-------------|--------------|
| Client ↔ Relay | Operator-trusted | Operator sees IP, event metadata |
| Client ↔ Sidecar | Operator-trusted | Operator sees IP, validates membership |
| Client ↔ LiveKit | Operator-trusted | Operator routes encrypted frames |
| Client ↔ Client | Zero-trust | All content E2EE, verify signatures |
| Sidecar ↔ External | Proxied | Client IP hidden from external services |

---

## 3. CRYPTOGRAPHIC IMPLEMENTATION

### 3.1 Key Management

#### Key Generation

**Requirements:**
- MUST use cryptographically secure random number generator (CSPRNG)
- MUST generate 32-byte private keys for secp256k1
- MUST NOT use language-default random functions (they are not cryptographically secure)

**Platform CSPRNGs:**
| Platform | Secure Random Source |
|----------|---------------------|
| Go | `crypto/rand.Read()` |
| Dart | `Random.secure()` or platform channels to native |
| iOS (via FFI) | `SecRandomCopyBytes` |
| Android (via FFI) | `SecureRandom` |

#### Secure Key Storage

**Requirements by platform:**

| Platform | Storage Mechanism |
|----------|-------------------|
| iOS | Keychain Services with `kSecAttrAccessibleWhenUnlocked` |
| Android | Android Keystore with hardware backing |
| Desktop | OS credential manager or encrypted file with user password |
| Server (Go) | Environment variables or secrets manager (Vault, etc.) |

**Key storage MUST NOT:**
- Store keys in plain text files
- Store keys in shared preferences / UserDefaults without encryption
- Store keys in application databases unencrypted
- Log keys at any log level

#### Memory Hygiene

**After using sensitive data, implementations MUST:**
1. Overwrite the memory region with random bytes
2. Then zero out the memory region
3. Ensure compiler optimizations don't eliminate the clearing operation

**Sensitive data includes:**
- Private keys
- MLS epoch secrets
- Decrypted message content
- LiveKit tokens

**Go considerations:**
- Use `memguard` or similar library for sensitive data
- Be aware that Go's GC may copy data; minimize sensitive data lifetime

**Dart considerations:**
- Dart's GC complicates memory clearing
- Use platform channels to native code for sensitive operations where possible
- Clear `Uint8List` contents explicitly, though GC timing is unpredictable

### 3.2 MLS Implementation

**Library Requirement:**
Implementations MUST use the **OpenMLS** library (Rust) to ensure protocol compliance and security.
- **Client (Flutter/Dart):** Use `flutter_rust_bridge` or FFI to bind to the OpenMLS Rust core.
- **Sidecar (Go):** Use CGO or a sidecar service to interface with OpenMLS.
- **Do NOT** attempt to implement MLS from scratch.

#### Cipher Suite
**REQUIRED:** `MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519`

| Component | Algorithm |
|-----------|-----------|
| KEM | X25519 |
| AEAD | AES-128-GCM |
| Hash | SHA-256 |
| Signature | Ed25519 |

#### Key Package Management

**Lifecycle requirements:**
- Maintain 3-5 active Key Packages published to relay
- Key Packages expire after 7 days
- Refresh packages when fewer than 3 are valid
- Generate new packages on app startup if needed
- Each package MUST have PoW meeting 16-bit target

**Key Package refresh logic:**
```
ON app_startup:
  valid_packages = fetch_own_key_packages()
  valid_packages = filter(pkg => pkg.expires_at > now + 24_hours)
  
  IF count(valid_packages) < 3:
    needed = 3 - count(valid_packages)
    FOR i in 1..needed:
      pkg = generate_key_package()
      pkg = mine_pow(pkg, target=16)
      publish_to_relay(pkg)
```

#### Ghost Device Detection

**MANDATORY:** Clients MUST audit the MLS tree for unauthorized keys.

**1. Fetch Source of Truth:**
Before validating the tree, the client MUST obtain the authoritative member list for the group from the Relay.
- Fetch `Kind 39002` (Group Members) for the group ID.
- Extract all `p` tags (the valid member pubkeys).
- *Cache this list locally.*

**2. Detection Algorithm:**
```pseudo
FUNCTION audit_tree(mls_tree, group_id):
  // Step 1: Get the authoritative list
  valid_members = fetch_group_members(group_id) // Returns Set<Pubkey>
  
  // Step 2: Iterate every leaf in the MLS Ratchet Tree
  FOR each leaf IN mls_tree.leaves:
    leaf_identity = leaf.credential.identity // The Nostr Pubkey in the Credential
    
    // Check 1: Is this identity actually a member of the group?
    IF leaf_identity NOT IN valid_members:
       ALERT "Ghost Detected: Non-member inside encryption circle"
       RETURN false

    // Check 2: (Optional strict mode) Does leaf key match a signed Key Package?
    // Requires fetching Kind 20022 for this specific leaf_identity
```

#### 3.2.1 Rust Bridge Interface (FFI Target)
Implementations using `flutter_rust_bridge` MUST expose the following high-level functions to the Dart client. Do not expose raw OpenMLS types directly.

```rust
// pseudo-code for API.rs

// 1. Key Management
fn generate_identity() -> MlsIdentity; // Returns public/private key pair
fn create_key_package(identity: MlsIdentity) -> String; // Returns hex-encoded KeyPackage

// 2. Group Operations
fn create_group(identity: MlsIdentity) -> MlsGroupState;
fn process_welcome(
    identity: MlsIdentity, 
    welcome_msg_bytes: Vec<u8>, 
    ratchet_tree_bytes: Option<Vec<u8>>
) -> MlsGroupState;

// 3. Epoch Handling
fn create_commit(
    group_state: MlsGroupState, 
    proposal: MlsProposal
) -> (Vec<u8>, MlsGroupState); // Returns (CommitBytes, NewState)

fn process_commit(
    group_state: MlsGroupState, 
    commit_bytes: Vec<u8>
) -> MlsGroupState;

// 4. Exporting Keys (for LiveKit)
fn export_secret(
    group_state: MlsGroupState, 
    label: String, 
    context: Vec<u8>, 
    key_length: usize
) -> Vec<u8>;
```
### 3.3 Media Frame Encryption

**Key derivation for LiveKit frame encryption:**

| Parameter | Value |
|-----------|-------|
| Source | MLS Exporter secret |
| Label | `"synchrono-city-frame-key"` (UTF-8 bytes) |
| Context | `room_name || epoch` (epoch as 8-byte big-endian) |
| Output length | 32 bytes |

**Derivation steps:**
1. Get MLS exporter interface from current epoch
2. Concatenate room name (UTF-8) with epoch (8 bytes, big-endian)
3. Call exporter with label and context
4. Use resulting bytes as AES-GCM key

---

## 4. EVENT HANDLING

### 4.1 Event Validation

**All events from relays MUST be validated before processing.**

**Validation checklist (in order):**

1. **Signature verification**
   - Verify schnorr signature against pubkey and event ID
   - Reject if invalid

2. **Timestamp validation**
   - Calculate `drift = abs(event.created_at - current_time)`
   - Reject if `drift > 300 seconds` (5 minutes)

3. **PoW validation** (if required for kind)
   - Calculate leading zero bits of event ID
   - Reject if below required target for event kind

4. **Required tags validation**
   - Check all mandatory tags are present for event kind
   - Reject if missing

5. **Expiration check**
   - If `expiration` tag present, check against current time
   - Reject if expired

### 4.2 Proof of Work Targets

> **Note:** Refer to **Protocol Specification §6.1** for the authoritative list of PoW targets and Event Kinds.

**PoW calculation (NIP-13):**
```
FUNCTION calculate_pow(event_id_hex):
  bytes = hex_to_bytes(event_id_hex)
  leading_zeros = 0
  
  FOR each byte in bytes:
    IF byte == 0:
      leading_zeros += 8
    ELSE:
      leading_zeros += count_leading_zero_bits(byte)
      BREAK
  
  RETURN leading_zeros
```

**PoW mining:**
```
FUNCTION mine_event(event, target_bits):
  nonce = 0
  
  LOOP:
    candidate = copy(event)
    candidate.tags.append(["nonce", str(nonce), str(target_bits)])
    candidate.id = calculate_event_id(candidate)
    
    IF calculate_pow(candidate.id) >= target_bits:
      RETURN candidate
    
    nonce += 1
    
    // Yield periodically to avoid blocking
    IF nonce % 10000 == 0:
      yield_to_scheduler()
```

### 4.3 Event Creation Patterns

*Refer to Protocol Specification §4 for exact JSON event structures and tag requirements.*

---

## 5. SIDECAR INTEGRATION

### 5.1 NIP-98 Authentication

**All Sidecar requests MUST include NIP-98 HTTP Auth.**

**Auth event structure (Kind 27235):**
```
tags:
  - ["u", full_request_url]
  - ["method", http_method]  // GET, POST, etc.
  - ["payload", sha256_hex]  // only for POST/PUT with body

created_at: current_unix_timestamp
content: empty
```

**Header format:**
```
Authorization: Nostr <base64_encoded_signed_event>
```

**Construction steps:**
1. Create Kind 27235 event with URL and method tags
2. If POST/PUT with body, add payload tag with SHA-256 of body
3. Sign event
4. Base64-encode the JSON-serialized signed event
5. Add as Authorization header with "Nostr " prefix

### 5.2 Token Request Flow

**Group call token request:**

1. Create Kind 20002 (Join Request) with required PoW
2. POST to `/token/group` with event in body
3. Sidecar validates:
   - Signature validity
   - PoW meets target
   - Timestamp within bounds
   - User is group member
   - User not banned
   - No current participant has blocked requester
4. On success: Sidecar returns NIP-59 wrapped Kind 20003
5. Client unwraps gift wrap to extract token
6. Check for `warning: "blocked_user_present"` in response
7. If warning present, prompt user before connecting

**DM call token request:**

1. Caller publishes Kind 20010 (Offer)
2. Callee publishes Kind 20011 (Answer)
3. Both POST to `/token/dm` with their respective event
4. Sidecar validates both reference same call
5. Returns tokens to both parties

### 5.3 Error Handling

**Sidecar error response format:**
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": { ... }
  }
}
```

**Error codes and recommended handling:**

| Code | HTTP | Recommended Action |
|------|------|-------------------|
| `INVALID_SIGNATURE` | 400 | Bug in signing code; log and alert |
| `POW_INSUFFICIENT` | 400 | Increase mining; should not happen if compliant |
| `TIMESTAMP_OUT_OF_RANGE` | 400 | Show clock sync warning to user |
| `EVENT_EXPIRED` | 400 | Regenerate event and retry |
| `TOKEN_EXPIRED` | 401 | Request new token |
| `AUTH_REQUIRED` | 401 | Add/fix NIP-98 header |
| `NOT_GROUP_MEMBER` | 403 | User must join group first |
| `USER_BANNED` | 403 | Inform user they are banned |
| `BLOCKED_BY_PARTICIPANT` | 403 | Inform user; cannot join while blocker present |
| `NOT_EPOCH_LEADER` | 403 | Only leader can issue MLS commits |
| `EPOCH_LEADER_TIMEOUT` | 408 | Leader failed; retry after transfer |
| `MLS_EPOCH_MISMATCH` | 409 | Fetch `/mls/state/{room}` and resync |
| `RATE_LIMITED` | 429 | Exponential backoff; show user message |
| `INTERNAL_ERROR` | 500 | Retry with backoff; report if persistent |

---

## 6. LOCATION HANDLING

### 6.1 Geohash Constraints

**MAXIMUM precision: Level 6 (~1.2km)**

| Level | Accuracy | Use Case |
|-------|----------|----------|
| 4 | ~39km | Regional discovery |
| 5 | ~5km | Neighborhood discovery |
| 6 | ~1.2km | Local discovery (MAXIMUM) |

**Dual-layer enforcement:**
- Client MUST NOT encode geohash at precision > 6
- Client MUST truncate lat/lon to 2 decimal places for display
- Sidecar/Relay SHOULD reject events with precision > 6

**Coordinate truncation:**
```
FUNCTION truncate_coordinates(lat, lon):
  RETURN (round(lat * 100) / 100, round(lon * 100) / 100)
```

---

## 7. BLOCK AND MUTE IMPLEMENTATION

### 7.1 Block vs Mute Comparison

| Aspect | Block (Kind 10006) | Mute (Kind 10000) |
|--------|-------------------|-------------------|
| Visibility | Public | Encrypted (private) |
| Enforcement | Infrastructure (Sidecar) | Client-only |
| Scope | DMs + Calls | Content filtering |
| Reversibility | Immediate | Immediate |
| Other party knows | Can infer (public list) | No |

### 7.2 Block List Management

**Block lists are PUBLIC to enable Sidecar enforcement.**

**On app startup:**
1. Fetch own Kind 10006 event
2. Parse `p` tags into local blocked set
3. Subscribe to updates

**On block action:**
1. Add pubkey to local set
2. Create new Kind 10006 with all blocked pubkeys
3. Mine PoW (12 bits)
4. Publish to relay

**Sidecar enforcement (calls):**
- If blocker is in room → blocked user cannot join
- If blocked user is in room → blocker gets warning, can choose to join

### 7.3 Mute List Management

**Mute lists are ENCRYPTED and client-enforced only.**

**On app startup:**
1. Fetch own Kind 10000 event
2. Decrypt content using NIP-44
3. Parse tags into local muted set

**Content filtering:**
- Filter muted pubkeys from message lists
- Filter muted pubkeys from notification feeds
- Do NOT filter from participant lists (they can still join calls)

**Call rendering for muted users:**
- Audio: Disconnect from audio output (silence)
- Video: Render black frame
- Presence: Still show in participant list (optionally marked locally)

---

## 8. CLOCK SYNCHRONIZATION

### 8.1 Thresholds

| Threshold | Value | Action |
|-----------|-------|--------|
| Warning | ±30 seconds | Show non-blocking warning |
| Refusal | ±5 minutes | Block event creation |

### 8.2 Detection Methods

**Primary: Sidecar health endpoint**
1. GET `/health` from Sidecar
2. Read `Date` header from response
3. Calculate offset: `client_time - server_time`

**Fallback: NTP or HTTPS time**
- Query NTP server
- Or fetch from well-known HTTPS endpoint and read Date header

### 8.3 User Flow

**On app launch:**
```
clock_status = check_clock_sync()

IF abs(clock_status.offset) > 300:  // 5 minutes
  show_blocking_modal("Clock Sync Required", 
    "Your device clock is off by X seconds. Please sync to continue.")
  
ELSE IF abs(clock_status.offset) > 30:  // 30 seconds
  show_warning_banner("Clock drift detected. You may experience issues.")
```

---

## 9. LIVEKIT INTEGRATION

### 9.1 Connection Sequence

1. Obtain token from Sidecar (via `/token/group` or `/token/dm`)
2. Initialize frame encryption with MLS state
3. Configure room options (adaptive stream, dynacast)
4. Connect to LiveKit URL with token
5. Subscribe to room events (participant join/leave, disconnect)
6. Wait for MLS welcome before decrypting other participants' media

### 9.2 Frame Encryption Setup (LiveKit SDK)

**Client SDK Requirement:** `livekit_client` (v2.0+)

**Implementation Pattern:**
1. **Instantiation:** Use the standard `KeyProvider` class provided by the LiveKit SDK.

```dart
var keyProvider = KeyProvider(
  options: KeyProviderOptions(
    sharedKey: false, // We use per-participant keys or ratcheted keys
    ratchetSalt: [],  // Optional, if using internal ratcheting
    uncryptedMagicBytes: [], 
    failureTolerance: -1 
  )
);
```

2. **Key Injection:** When the MLS Epoch changes (or on join), derive the new 32-byte secret and inject it:

```dart
// key material = MLS export(label="synchrono...", context="room+epoch")
await keyProvider.setKey(derivedKeyBytes, participantIdentity: null); // null = shared group key mode
```

3. **Room Options:** Pass the provider to the Room options on connect:

```dart
var roomOptions = RoomOptions(
  e2eeOptions: E2EEOptions(keyProvider: keyProvider),
);
```

### 9.3 Participant Events

**On participant join:**
- Log participant identity (pubkey)
- Wait for MLS commit adding them before decrypting their media
- Until then, their tracks may be undecodable (expected)

**On participant leave:**
- Epoch leader should issue MLS removal commit
- Key rotation happens automatically

**On disconnect:**
- Clear MLS epoch secrets from memory
- Clear frame encryption keys
- Clean up LiveKit resources

---

## 10. BLOSSOM INTEGRATION

### 10.1 Allowed MIME Types

| Category | Allowed Types |
|----------|---------------|
| Images | `image/jpeg`, `image/png`, `image/gif`, `image/webp` |
| Audio | `audio/mpeg`, `audio/ogg`, `audio/wav` |
| Video | `video/mp4`, `video/webm` |
| Documents | `application/pdf` |

**BLOCKED:** Executables, archives, scripts, all other types.

### 10.2 Upload Flow

**All uploads MUST go through Sidecar proxy using Multipart/Form-Data.**

1. Validate MIME type client-side.
2. POST to Sidecar `/proxy` endpoint.
   - **Headers:** - `Authorization`: NIP-98 Token
     - `Content-Type`: `multipart/form-data`
   - **Form Fields:**
     - `action`: "upload"
     - `service`: "blossom"
     - `file`: [Binary File Data]
3. Sidecar validates MIME type again.
4. Sidecar forwards to Blossom (stripping client IP).
5. Returns JSON response with the content-addressed blob URL.

### 10.3 Download Flow

**All downloads MUST go through Sidecar proxy.**

1. POST to Sidecar `/proxy` endpoint with:
   - `service`: "blossom"
   - `action`: "download"
   - `url`: blob URL
2. Sidecar fetches from Blossom
3. Returns file content to client

---

## 11. TESTING GUIDELINES

### 11.1 Unit Tests

**Cryptography:**
- PoW calculation returns correct bit count
- PoW mining reaches target difficulty
- Event ID calculation matches reference vectors
- Signature verification accepts valid, rejects invalid

**Event validation:**
- Rejects invalid signatures
- Rejects expired events
- Rejects insufficient PoW
- Rejects missing required tags
- Accepts valid events

**Geohash:**
- Encoding respects max precision
- Coordinate truncation works correctly

### 11.2 Integration Tests

**Sidecar flow:**
- Token request succeeds for valid join request
- Token request fails when blocked by participant
- MLS state fetch works after epoch mismatch
- NIP-98 auth is accepted

**Relay flow:**
- Events with valid PoW are accepted
- Events with insufficient PoW are rejected
- Subscriptions return correct events

### 11.3 Security Tests

**Memory hygiene:**
- Private keys are cleared after signing (where verifiable)
- MLS secrets are cleared after call ends
- No sensitive data in logs

**Ghost detection:**
- Unauthorized keys are flagged
- User is alerted appropriately

**Block enforcement:**
- Blocked users cannot join when blocker present
- Warning shown when joining room with blocked user

---

## 12. PERFORMANCE GUIDELINES

### 12.1 PoW Mining

**Problem:** PoW mining is CPU-intensive and can block UI.

**Solutions by platform:**

| Platform | Approach |
|----------|----------|
| Dart/Flutter | Use `Isolate` for background computation |
| Go | Use goroutines with worker pool |
| Web (if applicable) | Use Web Workers |

**General pattern:**
- Split nonce space across multiple workers/isolates
- First worker to find solution cancels others
- Report progress periodically for UI feedback
- Yield to scheduler every N iterations

### 12.2 Event Batching

**Subscription optimization:**
- Batch filter requests within 50ms window
- Combine overlapping filters
- Use single REQ for multiple related subscriptions

**Publishing optimization:**
- Queue non-urgent events
- Batch publish when queue reaches threshold or timeout

### 12.3 Caching

**Recommended caches:**

| Data | TTL | Max Size |
|------|-----|----------|
| Event validation results | 5 minutes | 10,000 entries |
| Block lists (other users) | 5 minutes | 1,000 entries |
| Key packages | Until expiration | 5,000 entries |
| Profile metadata | 15 minutes | 5,000 entries |

---

## 13. LOGGING GUIDELINES

### 13.1 Sensitive Data

**NEVER log:**
- Private keys
- LiveKit tokens
- Event signatures (can be used to correlate)
- Decrypted message content
- Full event content for encrypted events

**Safe to log:**
- Event IDs
- Event kinds
- Pubkeys (these are public)
- Error codes and messages
- Timing information
- Connection states

### 13.2 Log Levels

| Level | Use For |
|-------|---------|
| ERROR | Failures requiring attention |
| WARN | Recoverable issues, degraded operation |
| INFO | Significant state changes, connection events |
| DEBUG | Detailed flow information (dev only) |

### 13.3 Sanitization

**Before logging objects:**
1. Create copy of object
2. Replace sensitive fields with `[REDACTED]`
3. Log sanitized copy

**Sensitive field patterns:**
- `privateKey`, `private_key`, `privkey`
- `token`, `accessToken`, `access_token`
- `sig`, `signature`
- `content` (may be encrypted)
- `secret`, `password`

---

## 14. ERROR RECOVERY

### 14.1 MLS State Recovery

**On `MLS_EPOCH_MISMATCH` error:**

```
FUNCTION recover_mls_state(room_id):
  server_state = GET /mls/state/{room_id}
  
  IF local_epoch < server_state.epoch:
    commits = fetch_commits_since(room_id, local_epoch)
    
    FOR each commit in commits:
      apply_commit(commit)
    
  RETURN local_state
```

### 14.2 Connection Recovery

**Exponential backoff with jitter:**

```
FUNCTION reconnect():
  max_attempts = 5
  base_delay_ms = 1000
  
  FOR attempt in 1..max_attempts:
    delay = base_delay_ms * (2 ^ (attempt - 1))
    jitter = random(0, 1000)
    
    sleep(delay + jitter)
    
    TRY:
      connect()
      RETURN success
    CATCH error:
      log_warning("Reconnect failed", attempt, error)
  
  RETURN failure
```

### 14.3 Token Refresh

**On `TOKEN_EXPIRED` error:**
1. Request new token from Sidecar
2. Reconnect to LiveKit with new token
3. Re-sync MLS state if needed

---

## 15. VERSIONING AND MIGRATION

### 15.1 Version Compatibility

**Check on app startup:**
1. Fetch Sidecar `/health` for version info
2. Compare against client's supported range
3. If incompatible, show upgrade prompt

**Version info structure:**
```json
{
  "constitution": "1.0.0",
  "protocol": "1.0.0", 
  "sidecar": "1.0.0"
}
```

### 15.2 Feature Flags

**Use for gradual rollout:**
- Fetch remote config on startup
- Fall back to compiled defaults if unavailable
- Check flags before using new features

---

## APPENDIX A: CODE REVIEW CHECKLIST

### Security

- [ ] Private keys stored in platform secure storage
- [ ] Sensitive data cleared from memory after use
- [ ] No sensitive data in logs
- [ ] All events validated before processing
- [ ] PoW meets required targets for all event kinds
- [ ] Clock sync checked on app launch
- [ ] MLS tree audited for ghost devices
- [ ] Block lists enforced correctly

### Privacy

- [ ] Location precision ≤ geohash level 6
- [ ] Coordinates truncated to 2 decimal places
- [ ] All external requests proxied through Sidecar
- [ ] Mute lists encrypted (Kind 10000)
- [ ] No PII in logs
- [ ] Low-density location warning implemented

### Protocol Compliance

- [ ] All required NIPs implemented
- [ ] Event formats match Protocol Specification
- [ ] NIP-98 auth on all Sidecar requests
- [ ] Expiration tags on ephemeral events
- [ ] Correct event kinds used

### Performance

- [ ] PoW mining doesn't block UI thread
- [ ] Event subscriptions batched appropriately
- [ ] Caching implemented for frequently-accessed data
- [ ] No memory leaks (especially around crypto operations)

---

## APPENDIX B: QUICK REFERENCE

### Sidecar Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/health` | Status and version |
| POST | `/token/group` | Group call token |
| POST | `/token/dm` | DM call token |
| POST | `/proxy` | Blossom/external requests |
| GET | `/mls/state/{room}` | Current MLS state |
| POST | `/mls/commit` | Submit MLS commit |

### Error Code Reference

| Code | HTTP | Action |
|------|------|--------|
| `TIMESTAMP_OUT_OF_RANGE` | 400 | Clock sync warning |
| `BLOCKED_BY_PARTICIPANT` | 403 | Show blocked message |
| `MLS_EPOCH_MISMATCH` | 409 | Fetch state, retry |
| `RATE_LIMITED` | 429 | Backoff, retry |

### Thresholds Reference

| Parameter | Value |
|-----------|-------|
| Max geohash precision | 6 |
| Clock warning threshold | ±30 seconds |
| Clock refusal threshold | ±5 minutes |
| Key Package lifetime | 7 days |
| Min active Key Packages | 3 |
| Max active Key Packages | 5 |
| Token expiration | 180 seconds |

---

## VERSION HISTORY

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | — | Initial release |