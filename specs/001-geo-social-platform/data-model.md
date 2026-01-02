# Data Model: Synchrono City - Geo-Social Platform

**Feature**: 001-geo-social-platform
**Date**: 2025-01-01
**Status**: Phase 1 Design

## Overview

This document defines the data model for the Synchrono City platform across four components: Client (Flutter/Dart), Relay (Go/PostgreSQL), Sidecar (Go/Redis), and MLS Service (Rust). Entities are derived from functional requirements in the spec and refined based on research findings.

---

## Entity Relationship Diagram

```
┌─────────────┐           ┌─────────────┐           ┌─────────────┐
│    User     │───────────▶│    Group   │◄──────────│    Call     │
│  (Nostr)    │  member   │  (NIP-29)  │  active   │  (Kind 1020)│
└─────────────┘           └─────────────┘           └─────────────┘
       │                           │                          │
       │                           │                          │
       ▼                           ▼                          ▼
┌─────────────┐           ┌─────────────┐           ┌─────────────┐
│ Keypackage  │           │  Message   │           │   Participant│
│ (Kind 30022)│           │ (Kind 1/4) │           │  (ephemeral) │
└─────────────┘           └─────────────┘           └─────────────┘

┌─────────────┐           ┌─────────────┐           ┌─────────────┐
│   BlockList │           │  MuteList  │           │ MediaFile   │
│ (Kind 10006)│           │(Kind 10000)│           │  (Blossom)  │
└─────────────┘           └─────────────┘           └─────────────┘
```

---

## Core Entities

### 1. User

**Source**: Nostr Kind 0 (Metadata event)

**Description**: A participant on the Synchrono City platform. Identity is self-sovereign and based on cryptographic keypair.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| pubkey | String (64 hex chars) | PRIMARY KEY | User's public key (npub bech32 encoded for display) |
| name | String? | max 50 chars | Display name |
| about | String? | max 500 chars | Bio/description |
| picture | String? | URL (Blossom SHA-256) | Profile picture |
| website | String? | Valid URL | Personal website |
| nip05 | String? | Valid identifier | NIP-05 verified identifier |
| bot | Boolean | default false | Bot identification flag |
| lud16 | String? | Lightning address | Optional payment address |
| created_at | Integer | Unix timestamp | Profile creation time |

**Validation Rules**:
- pubkey: Valid secp256k1 public key
- name: 3-50 characters if present
- nip05: Valid format (user@domain)
- picture: Must be Blossom content-addressed URL (sha256://...)

**State Transitions**:
```
┌─────────┐    Update Profile (Kind 0, 20-bit PoW)    ┌─────────┐
│  New    │ ────────────────────────────────────────▶ │  Active │
│ Profile │                                           │ Profile │
└─────────┘                                           └─────────┘
```

---

### 2. Group

**Source**: NIP-29 Community, stored on Relay

**Description**: A location-anchored community for group communication.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| group_id | String | PRIMARY KEY | Value of 'd' tag in NIP-29 events |
| name | String | 3-100 chars | Group display name |
| description | String? | max 500 chars | Group description |
| geohash | String | max 6 chars | Location encoding (precision 6 = ~1.2km) |
| latitude | Float | 2 decimal places | Display coordinates (for map) |
| longitude | Float | 2 decimal places | Display coordinates (for map) |
| privacy_level | Enum | 'public', 'private' | Access control |
| relay_url | String | Valid wss:// URL | Authoritative relay (where Kind 9007 published) |
| created_by | String | 64 hex chars | Creator's pubkey |
| created_at | Integer | Unix timestamp | Creation time |
| active_call_id | String? | Kind 1020 event ID | Currently active call, if any |
| member_count | Integer | ≥ 0 | Number of members (cached) |
| is_active | Boolean | default true | False if deleted via Kind 9008 |

**NIP-29 Event Mapping**:
- Kind 39000: Basic metadata (name, description, picture)
- Kind 39002: Admin list, privacy level
- Kind 9007: Create group (28-bit PoW required)
- Kind 9008: Delete group (admin only)

**Validation Rules**:
- geohash: Must be valid base32 string, max length 6
- latitude/longitude: Truncated to 2 decimal places
- privacy_level: Only 'public' or 'private'
- relay_url: Must start with wss://

**State Transitions**:
```
┌─────────┐  Kind 9007 (Create)   ┌─────────┐  Kind 9008   ┌──────────┐
│ Created │ ─────────────────────▶│  Active │ ────────────▶│ Deleted  │
└─────────┘                       └─────────┘              └──────────┘
```

---

### 3. GroupMember

**Source**: NIP-29 Kind 39001 (Group metadata)

**Description**: Junction table for group membership with roles.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| group_id | String | FK → Group.group_id | Group identifier |
| pubkey | String | FK → User.pubkey | Member's public key |
| role | Enum | 'member', 'admin' | Permissions level |
| joined_at | Integer | Unix timestamp | Join time |
| added_by | String? | 64 hex chars | Admin who added (for private groups) |

**Composite Key**: (group_id, pubkey)

**NIP-29 Event Mapping**:
- Kind 9021: Add member (admin action)
- Kind 9022: Remove member (admin action)
- Kind 9023: Promote to admin
- Kind 9024: Demote admin

**State Transitions**:
```
┌─────────┐  Join/Approve  ┌─────────┐  Leave/Remove  ┌──────────┐
│ Pending │ ───────────────▶│ Member  │ ───────────────▶│  Left    │
└─────────┘                 └─────────┘                 └──────────┘
     │                                                          │
     │  Promote                                                 │
     ▼                                                          │
┌─────────┐                                                    │
│  Admin  │◄───────────────────────────────────────────────────┘
└─────────┘
```

---

### 4. Message

**Source**: Nostr Kind 1 (Text note), Kind 4 (Encrypted DM)

**Description**: Text communication in groups or DMs.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | String | PRIMARY KEY | Event ID (SHA-256) |
| kind | Integer | 1, 4, 1063 | Event kind |
| group_id | String? | FK → Group.group_id | 'h' tag for group messages |
| dm_partner | String? | FK → User.pubkey | 'p' tag for DMs (recipient) |
| author | String | FK → User.pubkey | Sender's pubkey |
| content | String/Bytes | Max 10KB | Message text (encrypted for DMs) |
| reply_to | String? | FK → Message.id | Parent event ID (for threads) |
| mentions | String[] | Pubkey list | '@' tags (mentions) |
| created_at | Integer | Unix timestamp | Message timestamp |
| deleted | Boolean | default false | True if Kind 5 deletion exists |
| media | MediaFile? | Attached | Optional media attachment |

**NIP Event Mapping**:
- Kind 1: Public group message
- Kind 4: Encrypted DM (NIP-44 wrapped in NIP-59)
- Kind 5: Deletion event
- Kind 7: Reaction (linked via 'e' tag)

**Validation Rules**:
- Exactly one of group_id or dm_partner must be set
- reply_to must reference existing message in same context
- Encrypted DMs must use NIP-44 v2 encryption

**Threading**: Messages form threads via 'e' tag pointing to parent.

---

### 5. Call

**Source**: Kind 1020 (Call Initiation), Kind 1021 (Call End)

**Description**: Real-time voice/video session anchored to a group or between two users.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | String | PRIMARY KEY | Kind 1020 event ID |
| kind | Integer | 1020, 20010 | Group call or DM call |
| group_id | String? | FK → Group.group_id | Group for group calls |
| dm_participants | String[2]? | Pubkey pair | Two users for DM calls |
| initiator | String | FK → User.pubkey | Who started the call |
| epoch_leader | String | FK → User.pubkey | Current MLS epoch leader |
| is_video | Boolean | default false | Video vs audio-only |
| created_at | Integer | Unix timestamp | Call start time |
| ended_at | Integer? | Unix timestamp | Call end time (Kind 1021) |
| duration | Integer? | Seconds | Computed from end - start |
| room_id | String | LiveKit UUID | SFU room identifier |
| mls_epoch | Integer | ≥ 0 | Current MLS group epoch |

**NIP Event Mapping**:
- Kind 1020: Call initiation (24-bit PoW)
- Kind 1021: Call end
- Kind 20002: Join request (12-bit PoW)
- Kind 20003: Token response (via Sidecar HTTP, not relay)
- Kind 20010: DM call offer
- Kind 20011: DM call answer
- Kind 20012: DM call reject

**Validation Rules**:
- Exactly one of group_id or dm_participants must be set
- dm_participants must have exactly 2 pubkeys
- ended_at must be > created_at

**State Transitions**:
```
┌─────────┐  Kind 1020 (24-bit)   ┌─────────┐  Last leave  ┌──────────┐
│Created/ │ ─────────────────────▶│ Active  │ ────────────▶│  Ended   │
│Starting │                       │  Call   │              │(Kind1021)│
└─────────┘                       └─────────┘              └──────────┘
                                       │
                                       │  Epoch transfer
                                       ▼
                              ┌─────────────────┐
                              │ Leader Change   │
                              └─────────────────┘
```

---

### 6. CallParticipant (Ephemeral)

**Source**: LiveKit webhook events

**Description**: Runtime state of participants in active calls. Stored in Redis on Sidecar, not persisted.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| room_id | String | LiveKit UUID | SFU room identifier |
| pubkey | String | FK → User.pubkey | Participant's pubkey |
| sid | String | LiveKit participant SID | SFU participant identifier |
| joined_at | Integer | Unix timestamp | Join time |
| last_seen | Integer | Unix timestamp | Last activity |
| muted | Boolean | default false | Audio muted state |
| video_off | Boolean | default false | Video off state |
| screen_sharing | Boolean | default false | Screen sharing state |
| is_leader | Boolean | default false | MLS epoch leader flag |

**Storage**: Redis with TTL = 4 hours (calls shouldn't exceed typical duration)

**Key Pattern**: `participant:{room_id}:{pubkey}`

**Lifecycle**: Created on participant join (webhook), deleted on leave or TTL expiry.

---

### 7. KeyPackage

**Source**: Kind 30022 (MLS Key Package)

**Description**: MLS cryptographic key package for end-to-end call encryption.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | String | PRIMARY KEY | SHA-256 hash of package |
| pubkey | String | FK → User.pubkey | Owner's public key |
| data | Bytes | OpenMLS format | Raw KeyPackage bytes |
| cipher_suite | String | Fixed value | "MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519" |
| created_at | Integer | Unix timestamp | Creation time |
| expires_at | Integer | Unix timestamp | Expiration (created + 7 days) |
| hpke_public_key | String | Base64 | HPKE public key for encryption |

**NIP Event Mapping**:
- Kind 30022: Published key package
- Tag 'expiration': Unix timestamp for expiration

**Validation Rules**:
- expires_at = created_at + 7 days maximum
- data must be valid OpenMLS KeyPackage
- Maintain 3-5 active packages per user

**Refresh Strategy**: Auto-refresh packages 24 hours before expiration.

---

### 8. BlockList

**Source**: Kind 10006 (Public Block List)

**Description**: Public list of blocked users for infrastructure-enforced separation.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| owner_pubkey | String | FK → User.pubkey | List owner |
| blocked_pubkey | String | FK → User.pubkey | Blocked user |
| created_at | Integer | Unix timestamp | Block time |
| pow_nonce | Integer | Proof of Work | For 12-bit PoW validation |

**Composite Key**: (owner_pubkey, blocked_pubkey)

**NIP Event Mapping**:
- Kind 10006: Public block list
- 'p' tags: List of blocked pubkeys

**Validation Rules**:
- 12-bit PoW required for publication
- Cannot block self

**Enforcement**: Sidecar checks block list before allowing call joins.

---

### 9. MuteList

**Source**: Kind 10000 (Mute List - NIP-51)

**Description**: Private encrypted list of muted users for client-side filtering.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| owner_pubkey | String | FK → User.pubkey | List owner |
| muted_pubkey | String | FK → User.pubkey | Muted user |
| created_at | Integer | Unix timestamp | Mute time |

**Composite Key**: (owner_pubkey, muted_pubkey)

**NIP Event Mapping**:
- Kind 10000: Encrypted mute list (NIP-44)
- 'p' tags: List of muted pubkeys (encrypted)

**Encryption**: Content encrypted with NIP-44, wrapped in NIP-59.

**Enforcement**: Client-side only; Sidecar does not enforce.

---

### 10. MediaFile

**Source**: Kind 1063 (File Metadata - NIP-B7)

**Description**: Content-addressed media file stored on Blossom server.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| hash | String | PRIMARY KEY | SHA-256 of file |
| url | String | Blossom URL | sha256://{hash} |
| mime_type | String | MIME type | image/*, audio/*, video/*, application/pdf |
| size | Integer | Bytes | File size |
| uploaded_by | String | FK → User.pubkey | Uploader's pubkey |
| hash_lookup | String[] | SHA-256 hashes | Merkle tree for large files |
| dimensions | Object? | {width, height} | For images/video |
| duration | Float? | Seconds | For audio/video |
| created_at | Integer | Unix timestamp | Upload time |

**URL Format**: `https://{blossom-server}/.well-known/nostr/pubkey/{hash}`

**Validation Rules**:
- mime_type must be in allowlist (no executables)
- size < 50MB (configurable limit)
- Proxied through Sidecar to hide user IP

---

## Database Schemas

### Client (Drift/SQLite)

```dart
@Data(className: 'User')
class Users extends Table {
  TextColumn get pubkey => text()();
  TextColumn get name => text().nullable()();
  TextColumn get about => text().nullable()();
  TextColumn get picture => text().nullable()();
  TextColumn get nip05 => text().nullable()();
  TextColumn get lud16 => text().nullable()();
  BoolColumn get bot => boolean().withDefault(const Constant(false))();
  IntColumn get createdAt => integer().nullable()();
  IntColumn get updatedAt => integer().nullable()();

  @override
  Set<Column> get primaryKey => {pubkey};
}

@Data(className: 'Group')
class Groups extends Table {
  TextColumn get groupId => text()();
  TextColumn get name => text()();
  TextColumn get description => text().nullable()();
  TextColumn get geohash => text()();
  RealColumn get latitude => real()();
  RealColumn get longitude => real()();
  TextColumn get privacyLevel => text().withDefault(const Constant('public'))();
  TextColumn get relayUrl => text()();
  TextColumn get createdBy => text()();
  BoolColumn get isActive => boolean().withDefault(const Constant(true))();
  IntColumn get memberCount => integer().withDefault(const Constant(0))();
  TextColumn get activeCallId => text().nullable()();
  TextColumn get picture => text().nullable()();
  IntColumn get createdAt => integer()();
  IntColumn get updatedAt => integer()();

  @override
  Set<Column> get primaryKey => {groupId};
}

@Data(className: 'Message')
class Messages extends Table {
  TextColumn get id => text()();
  TextColumn get groupId => text().nullable()();
  TextColumn get dmPartner => text().nullable()();
  TextColumn get author => text()();
  TextColumn get content => text()();
  TextColumn get replyTo => text().nullable()();
  IntColumn get createdAt => integer()();
  BoolColumn get deleted => boolean().withDefault(const Constant(false))();
  TextColumn get mediaHash => text().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

@Data(className: 'Call')
class Calls extends Table {
  TextColumn get id => text()();
  TextColumn get groupId => text().nullable()();
  TextColumn get initiator => text()();
  TextColumn get epochLeader => text()();
  BoolColumn get isVideo => boolean().withDefault(const Constant(false))();
  IntColumn get createdAt => integer()();
  IntColumn get endedAt => integer().nullable()();
  IntColumn get duration => integer().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

@Data(className: 'Keypackage')
class Keypackages extends Table {
  TextColumn get id => text()();
  TextColumn get pubkey => text()();
  BlobColumn get data => blob()();
  IntColumn get expiresAt => integer()();
  TextColumn get hpkePublicKey => text()();

  @override
  Set<Column> get primaryKey => {id};
}

@Data(className: 'BlockedUser')
class BlockedUsers extends Table {
  TextColumn get blockedPubkey => text()();
  IntColumn get createdAt => integer()();

  @override
  Set<Column> get primaryKey => {blockedPubkey};
}

@Data(className: 'MutedUser')
class MutedUsers extends Table {
  TextColumn get mutedPubkey => text()();
  IntColumn get createdAt => integer()();

  @override
  Set<Column> get primaryKey => {mutedPubkey};
}

@Data(className: 'MediaFile')
class MediaFiles extends Table {
  TextColumn get hash => text()();
  TextColumn get url => text()();
  TextColumn get mimeType => text()();
  IntColumn get size => integer()();
  TextColumn get uploadedBy => text()();
  IntColumn get createdAt => integer()();

  @override
  Set<Column> get primaryKey => {hash};
}
```

### Relay (PostgreSQL)

```sql
-- Events table (Khatru standard)
CREATE TABLE events (
    id SERIAL PRIMARY KEY,
    event_id TEXT UNIQUE NOT NULL,
    pubkey TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    kind INTEGER NOT NULL,
    tags JSONB NOT NULL,
    content TEXT NOT NULL,
    sig TEXT NOT NULL
);

CREATE INDEX idx_events_kind ON events(kind);
CREATE INDEX idx_events_pubkey ON events(pubkey);
CREATE INDEX idx_events_created_at ON events(created_at DESC);
CREATE INDEX idx_events_tag_query ON events USING GIN(tags);

-- NIP-29 Groups
CREATE TABLE groups (
    id SERIAL PRIMARY KEY,
    group_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    geohash TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    privacy_level TEXT DEFAULT 'public',
    picture TEXT,
    relay_url TEXT NOT NULL,
    created_by TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    member_count INTEGER DEFAULT 0,
    active_call_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX idx_groups_geohash ON groups(geohash);
CREATE INDEX idx_groups_location ON groups(latitude, longitude);
CREATE INDEX idx_groups_active ON groups(is_active) WHERE is_active = true;

-- Group Members
CREATE TABLE group_members (
    group_id TEXT REFERENCES groups(group_id) ON DELETE CASCADE,
    pubkey TEXT NOT NULL,
    role TEXT DEFAULT 'member',
    joined_at INTEGER NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
    added_by TEXT,
    PRIMARY KEY (group_id, pubkey)
);

CREATE INDEX idx_group_members_pubkey ON group_members(pubkey);

-- Group Metadata (key-value for extensible attributes)
CREATE TABLE group_metadata (
    group_id TEXT REFERENCES groups(group_id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value JSONB NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
    PRIMARY KEY (group_id, key)
);
```

### Sidecar (Redis - Ephemeral)

```
# Room state
room:{room_id} -> Hash {
  group_id: string,
  epoch_leader: pubkey,
  created_at: timestamp,
  expires_at: timestamp
}

# Participant state
participant:{room_id}:{pubkey} -> Hash {
  sid: string,
  joined_at: timestamp,
  last_seen: timestamp,
  muted: bool,
  video_off: bool,
  screen_sharing: bool,
  is_leader: bool
}

# Token usage cache (single-use enforcement)
token:{token_id} -> String (pubkey) with TTL 180s

# MLS state cache
mls:group:{group_id} -> Binary {
  epoch: number,
  members: [pubkey],
  state: bytes
} with TTL 4h
```

---

## Indexing Strategy

### Client (SQLite)
- Users: indexed by pubkey, name (FTS5)
- Groups: indexed by geohash prefix, latitude/longitude (R-tree)
- Messages: indexed by group_id, dm_partner, created_at
- Calls: indexed by group_id, created_at DESC
- Keypackages: indexed by pubkey, expires_at

### Relay (PostgreSQL)
- events: composite index on (kind, created_at)
- groups: GiST index on geohash for prefix queries
- group_members: B-tree on (group_id, role)
- events: GIN index on tags for JSONB queries

---

## Data Sync Strategy

### Client → Relay
1. User action → create Nostr event
2. Sign locally with private key
3. Compute PoW if required
4. Send via WebSocket to authoritative relay
5. Awaiting relay confirmation
6. On success: save to local database with `synced = true`
7. On failure: queue for retry with exponential backoff

### Relay → Client
1. On app launch: query events since last sync timestamp
2. Filter by kinds of interest (0, 1, 4, 9007, 1020, etc.)
3. Upsert to local database
4. Process deletions (Kind 5)
5. Emit state updates to UI via Riverpod providers

### Sidecar ↔ Relay
1. Sidecar subscribes to relay via WebSocket
2. Watches for group events (9007, 9021, 9022)
3. Triggers LiveKit room management on membership changes
4. Sends NIP-29 webhooks to clients for real-time updates

---

## Migration Strategy

### Version 1 (Initial)
- Create all base tables
- Seed with hardcoded relay URL
- No existing data to migrate

### Version 2+ (Future)
- Use Drift migrations for SQLite
- Use SQL migrations for PostgreSQL
- Backward compatible event formats (add new kinds, don't modify existing)
