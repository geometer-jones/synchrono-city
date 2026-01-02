# Research: Synchrono City - Geo-Social Platform

**Feature**: 001-geo-social-platform
**Date**: 2025-01-01
**Status**: Complete

## Overview

This document consolidates technical research for implementing Synchrono City, a decentralized geo-social platform. Research areas cover Flutter/Rust FFI patterns, OpenMLS integration, Nostr relay extensions, LiveKit integration, and associated best practices.

---

## R001: Flutter + Rust FFI Pattern for MLS Operations

### Decision
Use `flutter_rust_bridge` (FRB) version 2.x for Dart-Rust interop with a streamlined synchronous wrapper pattern.

### Rationale

**flutter_rust_bridge** provides:
- Automatic code generation for type-safe Dart-Rust bindings
- Support for complex types (structs, enums, Option, Result)
- Async/sync function generation with proper thread pool handling
- Active maintenance and good Flutter 3.x compatibility

**Alternatives Considered**:
- **native_ffi**: Manual Dart FFI with `dart:ffi` - too much boilerplate, error-prone
- **Helium workbox**: Less mature, limited async support
- **Isolate-based message passing**: Too slow for crypto operations, adds serialization overhead

### Implementation Pattern

```rust
// Rust side (mls_bridge.rs)
#[frb(sync)]
pub fn mls_generate_keypair() -> KeyPair {
    // OpenMLS key generation
}

#[frb(semaphore = 4)]
pub async fn mls_create_group(name: String) -> Result<MlsGroup, MlsError> {
    // MLS group creation with spawn_blocking
}
```

```dart
// Dart side (generated)
final keypair = mlsGenerateKeypair();
final group = await mlsCreateGroup(name);
```

**Key Constraints**:
- Keep Rust API simple; pass serializable data (bytes, strings) not complex object graphs
- Use `#[frb(semaphore)]` for blocking crypto operations to prevent UI freeze
- Maintain single Rust static instance for MLS state management

### References
- https://github.com/DesmondWillowbrook/flutter_rust_bridge
- OpenMLS Rust crate: https://github.com/openmls/openmls

---

## R002: OpenMLS Rust API Patterns and Lifetime Management

### Decision
Use OpenMLS 0.6+ with task-based API; maintain single `MlsState` struct with Arc/Mutex for thread-safe access; implement epoch-based state tracking with automatic cleanup.

### Rationale

OpenMLS Rust API provides:
- Task-based API (create_group, add_member, process_message) returning `MlsMessage`
- Built-in cipher suite: `MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519`
- KeyPackage management for user discovery
- Group state serialization for persistence

**Lifetime Management**:
- OpenMLS uses Rust ownership; `MlsGroup` owns its state
- Use `Arc<Mutex<MlsGroup>>` for shared mutable access across async tasks
- Implement drop handler to clear sensitive memory

### State Machine

```
┌─────────────┐     KeyPackage      ┌─────────────┐
│   Unjoined  │ ◄───────────────────► │  Keypackage │
│   State     │     Publish/Refresh  │   Manager   │
└─────────────┘                      └─────────────┘
       │
       │ Join (Welcome msg)
       ▼
┌─────────────┐     Commit/Propose   ┌─────────────┐
│    Active   │ ────────────────────► │   Epoch     │
│   Member    │                     │  Transitions │
└─────────────┘                      └─────────────┘
       │
       │ Leave/Remove
       ▼
┌─────────────┐
│   Inactive  │
│   (Cleanup) │
└─────────────┘
```

### Implementation Notes

```rust
pub struct MlsState {
    groups: Arc<RwLock<HashMap<GroupID, MlsGroup>>>,
    key_packages: Arc<Mutex<Vec<KeyPackage>>>,
    cipher_suite: Ciphersuite,
}

impl MlsState {
    // Create new MLS group (caller becomes Epoch Leader)
    pub fn create_group(&self, name: String) -> Result<(GroupID, WelcomeMessage)> {}

    // Join existing group via Welcome
    pub fn join_group(&self, welcome: WelcomeMessage) -> Result<GroupID> {}

    // Add member to group (Epoch Leader only)
    pub fn add_member(&self, group_id: GroupID, key_package: KeyPackage)
        -> Result<MlsMessage> {}

    // Process incoming MLS message
    pub fn process_message(&self, group_id: GroupID, msg: MlsMessage)
        -> Result<GroupMessage> {}

    // Export key for LiveKit frame encryption
    pub fn export_frame_key(&self, group_id: GroupID) -> Result<[u8; 32]> {}
}
```

**Key Packages**: Maintain 3-5 active packages; refresh before 7-day expiration; publish via Kind 30022 event.

**Epoch Leadership Transfer**: Detect when leader leaves; promote longest-present member; handle concurrent proposals via merge behavior.

### References
- OpenMLS Book: https://openmls.tech/book/
- RFC 9420 (MLS): https://datatracker.ietf.org/doc/html/rfc9420

---

## R003: Khatru NIP-29 Extension Patterns

### Decision
Use Khatru's `AddHandler` and `FilterHandler` interface for NIP-29 group-specific logic; implement custom `nip29` package extending Khatru with group metadata storage and permission checking.

### Rationale

**Khatru** provides:
- Lightweight, embeddable Nostr relay in Go
- Plugin-style handlers for reading/writing events
- Built-in WebSocket support and REQ filtering
- Easy to extend with custom logic

**NIP-29 Requirements**:
- Kind 39000: Group metadata (name, description, geohash)
- Kind 39002: Group metadata (admin list, privacy level)
- Kind 9007: Create group (with PoW validation)
- Kind 9008: Delete group (admin only)
- Kind 9009: Edit group metadata (admin only)
- Kind 9021: Add user (admin approval for private groups)
- Kind 9022: Remove user (admin only)
- Kind 9023: Promote user to admin
- Kind 9024: Demote admin

### Implementation Pattern

```go
// Khatru relay setup
relay := khatru.NewRelay()

// Add NIP-29 storage backend
nip29Store := nip29.NewPostgresStore(os.Getenv("DATABASE_URL"))
relay.QueryEvents = nip29Store.QueryEvents
relay.DeleteEvent = nip29Store.DeleteEvent

// Add group-specific handlers
groupHandler := nip29.NewGroupHandler(nip29Store)
relay.AddHandler = nip29Middleware(relay.AddHandler, groupHandler)

// Group creation requires 28-bit PoW
relay.AddHandler = khatru.AddHandlerMiddle(func(ectx *khatru.EventContext) {
    if ectx.Event.Kind == 9007 {
        if !validatePow(ectx.Event, 28) {
            ectx.Reject = "Insufficient PoW for group creation"
            return
        }
        groupHandler.HandleCreateGroup(ectx)
    }
})
```

**PostgreSQL Schema** (for groups):

```sql
CREATE TABLE groups (
    id SERIAL PRIMARY KEY,
    group_id TEXT UNIQUE NOT NULL,  -- 'd' tag value
    relay_url TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    geohash TEXT NOT NULL,
    privacy_level TEXT DEFAULT 'public',  -- 'public' or 'private'
    created_at TIMESTAMP NOT NULL,
    created_by TEXT NOT NULL  -- pubkey
);

CREATE TABLE group_members (
    group_id TEXT REFERENCES groups(group_id) ON DELETE CASCADE,
    pubkey TEXT NOT NULL,
    role TEXT DEFAULT 'member',  -- 'member' or 'admin'
    joined_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (group_id, pubkey)
);

CREATE TABLE group_metadata (
    group_id TEXT REFERENCES groups(group_id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value JSONB,
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### Geohash Queries

For location-based discovery, use geohash prefix matching:

```sql
-- Groups within ~5km (geohash precision 5)
SELECT * FROM groups
WHERE geohash LIKE 'u4pruyd%'  -- prefix match
  AND privacy_level = 'public';
```

### References
- Khatru: https://github.com/fiatjaf/khatru
- NIP-29: https://github.com/nostr-protocol/nips/blob/master/29.md

---

## R004: LiveKit Go Client Library and Room Management

### Decision
Use LiveKit Go SDK `livekit-go` version 1.5+; implement RoomService client for token issuance; implement webhook handler for participant events; use Redis for ephemeral room state cache.

### Rationale

**LiveKit Server SDK** provides:
- `lksdk_rooms.RoomServiceClient` for room management
- JWT-based token generation with grants
- Webhook signature verification
- Room participant list queries

**Token Issuance Pattern**:
- Sidecar generates JWT tokens via RoomServiceClient
- Tokens bound to participant identity (nostr pubkey)
- Short TTL (180s per spec)
- Single-use: store used token IDs in Redis with expiration

### Room State Management

```go
type RoomState struct {
    RoomID         string
    GroupID        string  // NIP-29 group identifier
    EpochLeader    string  // Pubkey of current MLS epoch leader
    Participants   map[string]*ParticipantState
    CreatedAt      time.Time
    ExpiresAt      time.Time
}

type ParticipantState struct {
    Pubkey        string
    JoinedAt      time.Time
    LastSeen      time.Time
    Muted         bool
    VideoOff      bool
}

type RoomManager struct {
    lkClient    *lksdk_rooms.RoomServiceClient
    redis       *redis.Client
    mlsService  mls.MLSClient
}
```

### Webhook Handling

LiveKit webhooks notify of:
- `room.started`: Initialize MLS state for group
- `participant.joined`: Validate membership, add to MLS group
- `participant.left`: Remove from MLS group, handle epoch leadership transfer
- `room.finished`: Clean up MLS state

```go
func (h *WebhookHandler) HandleParticipantJoined(event *livekit.WebhookEvent) {
    pubkey := extractPubkeyFromToken(event.Participant.Identity)

    // Validate group membership
    if !h.validateMembership(pubkey, event.Room.Name) {
        h.lkClient.RemoveParticipant(context.Background(), event.Room.Name, event.Participant.SID)
        return
    }

    // Handle MLS welcome for new participant
    h.mlsService.AddParticipantToGroup(event.Room.Name, pubkey)
}
```

### References
- LiveKit Go SDK: https://github.com/livekit/livekit-go
- LiveKit Server: https://github.com/livekit/livekit

---

## R005: NIP-98 HTTP Auth Implementation in Go

### Decision
Use middleware pattern with `nostr` Go crate for event validation; support both Authorization header and Nostr-WebSocket-Auth header; implement caching for validated events.

### Rationale

**NIP-98** specifies HTTP authentication using Nostr events:
- Client creates Kind 27235 event (HTTP Auth)
- Tags: `u` (URL), `method` (GET/POST/etc)
- Content SHA-256 hash of request body
- Signature verified server-side

### Implementation Pattern

```go
type NIP98Middleware struct {
    relayClient RelayClient  // To fetch user metadata if needed
    cache       *cache.Cache
}

func (m *NIP98Middleware) Validate(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        auth := r.Header.Get("Authorization")
        if strings.HasPrefix(auth, "Nostr ") {
            event, err := m.validateEvent(r, auth[6:])
            if err != nil {
                http.Error(w, "Invalid auth", http.StatusUnauthorized)
                return
            }
            // Add pubkey to context
            ctx := context.WithValue(r.Context(), "pubkey", event.PubKey)
            next.ServeHTTP(w, r.WithContext(ctx))
        }
    })
}

func (m *NIP98Middleware) validateEvent(r *http.Request, b64event string) (*nostr.Event, error) {
    // Decode base64 event
    // Verify signature
    // Check tags match request (method, URL, hash)
    // Check timestamp within 5 minutes
}
```

**Tag Requirements**:
- `u`: Full request URL
- `method`: HTTP method
- `payload`: SHA-256 hash of request body (hex)

### References
- NIP-98: https://github.com/nostr-protocol/nips/blob/master/98.md

---

## R006: Efficient PoW Mining in Dart/Flutter

### Decision
Use isolate-based computation with incremental difficulty check; implement progress callback for UI feedback; cache partial results for retry.

### Rationale

**PoW (NIP-13)** requires finding nonce such that `event_id` has leading zero bits.

**Isolate Pattern**: Run mining in background isolate to avoid blocking UI thread.

### Implementation Pattern

```dart
class PowMiner {
  Future<({int nonce, int hash})> mine(
    String serializedEvent,
    int targetBits, {
    Function(int)? onProgress,
    Duration timeout = const Duration(seconds: 30),
  }) async {
    return await compute(_mineInIsolate, {
      'event': serializedEvent,
      'target': targetBits,
      'timeout': timeout.inMilliseconds,
    });
  }
}

int _mineInIsolate(Map<String, dynamic> params) {
  final event = params['event'];
  final target = params['target'];
  // Nonce iteration with zero count check
  for (int nonce = 0; nonce < MAX_NONCE; nonce++) {
    final hash = sha256('$event$nonce');
    if (leadingZeros(hash) >= target) {
      return nonce;
    }
  }
  throw PowTimeoutException();
}
```

**Performance Optimization**:
- Pre-compute hash prefix (unchanging portion)
- Use bitwise operations for zero counting
- Implement early exit if target exceeded

**Targets by Kind**:
- Kind 9007 (Create Group): 28 bits (~30 seconds mobile)
- Kind 1020 (Call Init): 24 bits (~2 seconds)
- Kind 20002 (Join Call): 12 bits (~10ms)
- Kind 0 (Profile): 20 bits (~5 seconds)
- Kind 30022 (Key Package): 16 bits (~300ms)

### References
- NIP-13: https://github.com/nostr-protocol/nips/blob/master/13.md

---

## R007: Flutter Riverpod Architecture Patterns

### Decision
Use Riverpod 2.x with CodeGenerator API; implement feature-based provider architecture; use `AsyncNotifier` for network state; use `StateNotifier` for UI state.

### Rationale

**Riverpod 2.x** provides:
- Compile-time safety with code generation
- Testable providers (no BuildContext dependency)
- Fine-grained rebuilds with `select`
- Good async state management with `AsyncNotifier`

### Provider Architecture

```dart
// Core providers (singleton)
@riverpod
AuthService authService(AuthServiceRef ref) {
  return AuthService();
}

@riverpod
NostrClient nostrClient(NostrClientRef ref) {
  final auth = ref.watch(authServiceProvider);
  return NostrClient(keypair: auth.keypair);
}

// Feature providers (cached)
@riverpod
GroupRepository groupRepository(GroupRepositoryRef ref) {
  return GroupRepository(ref.watch(nostrClientProvider));
}

@riverpod
class GroupListController extends _$GroupListController {
  @override
  Future<List<Group>> build(Geohash location) async {
    final repo = ref.read(groupRepositoryProvider);
    return repo.queryByLocation(location);
  }

  void refresh() => state = const AsyncValue.loading().then(
    (_) => build(ref.read(locationProvider))
  );
}
```

### Directory Structure

```
lib/features/
├── world/                    # Location-based discovery
│   ├── providers/            # World-specific providers
│   ├── screens/              # Map view, group creation
│   └── widgets/              # Group pins, preview cards
├── chats/                    # Messaging
│   ├── providers/            # Chat controllers
│   ├── screens/              # Chat list, chat detail
│   └── widgets/              # Message bubbles, composer
├── calls/                    # Voice/video
│   ├── providers/            # Call state, LiveKit
│   ├── screens/              # Call UI, incoming call
│   └── widgets/              # Participant grid, controls
└── settings/                 # Profile, preferences
```

### State Pattern

```dart
// Async data from network
@riverpod
class GroupsNearby extends _$GroupsNearby {
  @override
  Future<List<Group>> build(Geohash center) async {
    return ref.read(groupRepositoryProvider).fetchNearby(center);
  }
}

// In-memory UI state
@riverpod
class MapController extends _$MapController {
  @override
  MapState build() {
    return MapState(
      center: const LatLng(0, 0),
      zoom: 12,
      selectedGroup: null,
    );
  }

  void selectGroup(Group? group) {
    state = state.copyWith(selectedGroup: group);
  }
}
```

### References
- Riverpod: https://riverpod.dev
- Flutter Architecture Samples: https://github.com/brianegan/flutter_architecture_samples

---

## R008: Drift (SQLite) Schema Design for Nostr Event Caching

### Decision
Use Drift 2.x with code generation; implement denormalized schema for query performance; use Full Text Search (FTS5) for content search; implement incremental sync with relay.

### Rationale

**Drift** (formerly Moor) provides:
- Type-safe SQL queries with Dart codegen
- Reactive queries with streams
- Migration support
- FTS5 for efficient full-text search

### Schema Design

```dart
// @DriftDatabase(tables: [Users, Groups, Messages, Calls, Keypackages])
part 'database.g.dart';

@Data(className: 'User')
class Users extends Table {
  TextColumn get pubkey => text()();
  TextColumn get name => text().nullable()();
  TextColumn get about => text().nullable()();
  TextColumn get picture => text().nullable()();
  TextColumn get nip05 => text().nullable()();
  BoolColumn get bot => boolean().withDefault(const Constant(false))();
  IntColumn get createdAt => integer().nullable()();
  IntColumn get updatedAt => integer().nullable()();

  @override
  Set<Column> get primaryKey => {pubkey};
}

@Data(className: 'Group')
class Groups extends Table {
  TextColumn get groupId => text()();  // 'd' tag
  TextColumn get name => text()();
  TextColumn get description => text().nullable()();
  TextColumn get geohash => text()();
  RealColumn get latitude => real()();  // Display coordinates
  RealColumn get longitude => real()();
  TextColumn get privacyLevel => text().withDefault(const Constant('public'))();
  TextColumn get relayUrl => text()();  // Authoritative relay
  BoolColumn get isActive => boolean().withDefault(const Constant(true))();
  IntColumn get memberCount => integer().withDefault(const Constant(0))();
  TextColumn get activeCallId => text().nullable()();  // Kind 1020 event ID
  IntColumn get createdAt => integer()();
  IntColumn get updatedAt => integer()();

  @override
  Set<Column> get primaryKey => {groupId};
}

@Data(className: 'Message')
class Messages extends Table {
  TextColumn get id => text()();  // Event ID
  TextColumn get groupId => text().nullable()();  // 'h' tag for groups, null for DMs
  TextColumn get dmPartner => text().nullable()();  // 'p' tag for DMs
  TextColumn get author => text()();
  TextColumn get content => text()();
  TextColumn get replyTo => text().nullable()();  // Parent event ID
  IntColumn get createdAt => integer()();
  BoolColumn get deleted => boolean().withDefault(const Constant(false))();

  @override
  Set<Column> get primaryKey => {id};
}

@Data(className: 'Call')
class Calls extends Table {
  TextColumn get id => text()();  // Kind 1020 event ID
  TextColumn get groupId => text().nullable()();  // Null for DM calls
  TextColumn get initiator => text()();
  TextColumn get epochLeader => text()();
  BoolColumn get isVideo => boolean().withDefault(const Constant(false))();
  IntColumn get createdAt => integer()();
  IntColumn get endedAt => integer().nullable()();  // Kind 1021

  @override
  Set<Column> get primaryKey => {id};
}

@Data(className: 'Keypackage')
class Keypackages extends Table {
  TextColumn get id => text()();  // Hash of package
  TextColumn get pubkey => text()();  // Owner
  BlobColumn get data => blob()();  // Raw KeyPackage bytes
  IntColumn get expiresAt => integer()();  // Unix timestamp

  @override
  Set<Column> get primaryKey => {id};
}
```

### Query Patterns

```dart
// Nearby groups with geohash prefix
Future<List<Group>> fetchNearbyGroups(String geohashPrefix) {
  return (select(groups)
    ..where((g) => g.geohash.like('$geohashPrefix%'))
    ..where((g) => g.isActive.equals(true))
  ).get();
}

// Messages for a group (paginated)
Future<List<Message>> fetchGroupMessages(String groupId, int limit, int offset) {
  return (select(messages)
    ..where((m) => m.groupId.equals(groupId))
    ..where((m) => m.deleted.equals(false))
    ..orderBy([(m) => OrderingTerm.asc(m.createdAt)])
    ..limit(limit)
    ..offset(offset)
  ).get();
}

// Unified inbox (groups + DMs)
Future<List<ChatThread>> fetchChatThreads() {
  // Complex join query via custom statement
  return customSelectStatement(
    'SELECT g.group_id, g.name, g.relay_url, m.created_at as last_activity, m.content as last_message '
    'FROM groups g INNER JOIN messages m ON g.group_id = m.group_id '
    'WHERE g.is_active = true '
    'UNION ALL '
    'SELECT DISTINCT p.pubkey as group_id, u.name, p.relay_url, m.created_at, m.content '
    'FROM (SELECT DISTINCT dm_partner as pubkey FROM messages WHERE dm_partner IS NOT NULL) p '
    'INNER JOIN users u ON p.pubkey = u.pubkey '
    'INNER JOIN messages m ON m.dm_partner = p.pubkey '
    'ORDER BY last_activity DESC',
  ).map((row) => ChatThread.fromData(row)).get();
}
```

### Sync Strategy

1. **On app launch**: Query relay for events since last sync timestamp
2. **Merge events**: Upsert into local database, dedup by event ID
3. **Delete events**: Process Kind 5 deletion events
4. **Push pending**: Upload locally-created events that haven't been sent

### References
- Drift: https://drift.simonbinder.eu/

---

## R009: flutter_map Performance with Dynamic Pin Clusters

### Decision
Use `flutter_map` with marker clustering; implement custom `ClusterWidget` for aggregated pins; use map bounds callback for incremental loading; implement marker pool pattern.

### Rationale

**flutter_map** (based on Leaflet) provides:
- Lightweight map rendering
- Marker clustering via `flutter_map_marker_cluster`
- Custom marker widgets
- Bounds change events

### Implementation Pattern

```dart
class GroupMapWidget extends ConsumerStatefulWidget {
  @override
  ConsumerState<GroupMapWidget> createState() => _GroupMapWidgetState();
}

class _GroupMapWidgetState extends ConsumerState<GroupMapWidget> {
  final MapController _mapController = MapController();
  List<Group> _visibleGroups = [];

  @override
  Widget build(BuildContext context) {
    final groups = ref.watch(groupsNearbyProvider);

    return FlutterMap(
      mapController: _mapController,
      options: MapOptions(
        onMapEvent: (event) {
          if (event is MapEventMoveend) {
            _loadVisibleGroups(event.bounds);
          }
        },
      ),
      children: [
        TileLayer(urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'),
        MarkerClusterLayerWidget(
          options: MarkerClusterLayerOptions(
            maxClusterRadius: 50,
            spiderfyClustering: false,
            markers: _buildMarkers(groups),
            builder: (context, markers) {
              return ClusterWidget(markers: markers);
            },
          ),
        ),
      ],
    );
  }

  void _loadVisibleGroups(LatLngBounds bounds) {
    final center = geohash.encode(
      bounds.center.latitude,
      bounds.center.longitude,
      precision: 6,
    );
    ref.read(groupsNearbyProvider.notifier).refresh(center);
  }
}
```

**Clustering Strategy**:
- Cluster at zoom < 13
- Show count badge on cluster
- Tap to zoom into cluster
- Use custom marker images for different states (active call, member count)

### Performance Optimizations

1. **Marker Pool**: Reuse marker widgets instead of recreating
2. **Bounds Debouncing**: Throttle map move events
3. **Incremental Loading**: Load groups in batches of 50
4. **Image Caching**: Cache marker images with `cached_network_image`

### References
- flutter_map: https://github.com/fleaflet/flutter_map

---

## R010: gRPC Interop between Go and Rust for MLS Operations

### Decision
Use gRPC with protobuf definitions; implement Rust service with Tonic; Go client with standard gRPC library; use streaming bi-directional RPC for MLS state synchronization.

### Rationale

**gRPC** provides:
- Type-safe service definitions
- Built-in code generation for Go and Rust
- Bi-directional streaming
- Efficient binary serialization

### Protobuf Definition

```protobuf
syntax = "proto3";

package synchrono.mls;

service MLS {
  // Create new group (caller becomes epoch leader)
  rpc CreateGroup(CreateGroupRequest) returns (CreateGroupResponse);

  // Join existing group
  rpc JoinGroup(JoinGroupRequest) returns (JoinGroupResponse);

  // Add member to group (epoch leader only)
  rpc AddMember(AddMemberRequest) returns (AddMemberResponse);

  // Process incoming MLS message
  rpc ProcessMessage(ProcessMessageRequest) returns (ProcessMessageResponse);

  // Export frame encryption key for LiveKit
  rpc ExportKey(ExportKeyRequest) returns (ExportKeyResponse);

  // Get group state
  rpc GetGroupState(GetGroupStateRequest) returns (GetGroupStateResponse);
}

message CreateGroupRequest {
  string group_id = 1;
  string name = 2;
  bytes creator_pubkey = 3;
}

message CreateGroupResponse {
  bytes welcome_message = 1;  // MLS Welcome for distribution
  bytes group_state = 2;
}

message JoinGroupRequest {
  bytes welcome_message = 1;
  bytes key_package = 2;
}

message JoinGroupResponse {
  bytes group_state = 1;
}

message AddMemberRequest {
  string group_id = 1;
  bytes key_package = 2;
}

message AddMemberResponse {
  bytes mls_message = 1;  // Add proposal or commit
}

message ProcessMessageRequest {
  string group_id = 1;
  bytes mls_message = 2;
}

message ProcessMessageResponse {
  bytes decrypted_content = 1;  // Application message
  string sender = 2;
}

message ExportKeyRequest {
  string group_id = 1;
  string label = 2;
  string context = 3;
}

message ExportKeyResponse {
  bytes key = 1;  // 32 bytes for frame encryption
}

message GetGroupStateRequest {
  string group_id = 1;
}

message GetGroupStateResponse {
  repeated bytes members = 1;  // Pubkeys
  string epoch_leader = 2;
  uint64 epoch = 3;
}
```

### Go Client

```go
type MLSClient struct {
    client mlsproto.MLSClient
    conn  *grpc.ClientConn
}

func NewMLSClient(addr string) (*MLSClient, error) {
    conn, err := grpc.Dial(addr, grpc.WithTransportCredentials(insecure.NewCredentials()))
    if err != nil {
        return nil, err
    }
    return &MLSClient{
        client: mlsproto.NewMLSClient(conn),
        conn:  conn,
    }, nil
}

func (c *MLSClient) CreateGroup(ctx context.Context, groupID, name string, creator []byte) ([]byte, error) {
    resp, err := c.client.CreateGroup(ctx, &mlsproto.CreateGroupRequest{
        GroupId:       groupID,
        Name:          name,
        CreatorPubkey: creator,
    })
    if err != nil {
        return nil, err
    }
    return resp.WelcomeMessage, nil
}
```

### Rust Service (Tonic)

```rust
pub struct MLSService {
    groups: Arc<RwLock<HashMap<String, MlsGroup>>>,
}

#[tonic::async_trait]
impl mls_server::Mls for MLSService {
    async fn create_group(
        &self,
        request: Request<CreateGroupRequest>,
    ) -> Result<Response<CreateGroupResponse>, Status> {
        let req = request.into_inner();
        let (group, welcome) = MlsGroup::create(
            &req.creator_pubkey,
            req.group_id,
            req.name,
        ).map_err(|e| Status::internal(e.to_string()))?;

        self.groups.write().await.insert(req.group_id.clone(), group);
        Ok(Response::new(CreateGroupResponse {
            welcome_message: welcome.to_bytes(),
            group_state: vec![],  // Optional: serialized state
        }))
    }
}
```

### Security Considerations

1. **Local-only**: gRPC service listens on localhost only
2. **No TLS required**: All communication is loopback
3. **Memory cleanup**: Zero sensitive data after use
4. **Concurrency**: Use Arc/RwLock for thread-safe access

### References
- Tonic: https://github.com/hyperium/tonic
- gRPC: https://grpc.io

---

## R011: flutter_rust_bridge Web/WASM Compilation

### Decision
Use flutter_rust_bridge v2 with experimental WASM support via wasm-bindgen. Compile Rust crypto core to WASM separately for mobile (native FFI) and web (wasm-bindgen) targets. Use conditional compilation to switch between native and WASM implementations at runtime.

### Rationale

**flutter_rust_bridge v2** has experimental WASM support:
- Generates Dart-to-WASM bindings using wasm-bindgen
- Allows same Rust code to compile for both native and web targets
- Performance is acceptable for crypto operations (PoW, MLS)

**Web Target Challenges**:
- Flutter Web uses different threading model (no isolates for WASM)
- WASM has larger initial bundle size
- Crypto operations in pure WASM may be slower than native

**Alternatives Considered**:
- **Pure Dart crypto**: Would require re-implementing MLS in Dart (security risk)
- **Separate WASM package**: More complex build process
- **Web-only crypto API**: Different implementation between platforms

### Implementation Pattern

```rust
// rust/src/lib.rs
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

#[cfg(not(target_arch = "wasm32"))]
use flutter_rust_bridge::frb;

// Crypto functions work for both targets
pub fn generate_keypair() -> KeyPair {
    // OpenMLS key generation
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub fn wasm_generate_keypair() -> JsValue {
    // Wrap for JS interop on web
    serde_wasm_bindgen::to_value(&generate_keypair()).unwrap()
}
```

```dart
// client/lib/crypto/crypto.dart
import 'dart:html' as html show window;

import 'package:flutter_rust_bridge/flutter_rust_bridge.dart'
    if (dart.library.io) // Mobile/Desktop
    'crypto_web.dart' if (dart.library.js) // Web;

abstract class CryptoPlatform {
  static CryptoPlatform create() {
    if (kIsWeb) {
      return WebCrypto();
    } else {
      return NativeCrypto();
    }
  }

  KeyPair generateKeypair();
}

class NativeCrypto implements CryptoPlatform {
  // flutter_rust_bridge FFI for mobile
}

class WebCrypto implements CryptoPlatform {
  // Call WASM functions via dart:js_interop
  @override
  KeyPair generateKeypair() {
    final result = js.context.callMethod('wasm_generate_keypair');
    return KeyPair.fromJson(result);
  }
}
```

### Build Configuration

```toml
# rust/Cargo.toml
[lib]
crate-type = ["cdylib", "staticlib"]  # Native

[target.wasm32-unknown-unknown]
crate-type = ["cdylib"]

[dependencies]
wasm-bindgen = "0.6"
serde = { version = "1.0", features = ["derive"] }
serde-wasm-bindgen = "0.6"
```

```yaml
# client/pubspec.yaml
flutter:
  assets:
    - rust/target/wasm32-unknown-unknown/release/synchrono_crypto.wasm
```

### Performance Considerations

- **WASM Bundle Size**: ~2-3 MB compressed (acceptable with code splitting)
- **PoW on Web**: May be slower than mobile; offer to offload to server if too slow
- **MLS Operations**: Acceptable latency (<500ms) for key generation and encryption
- **Fallback**: For very slow devices, offer server-side PoW computation

### Web-Specific Constraints

| Feature | Mobile | Web | Notes |
|---------|--------|-----|-------|
| FFI | flutter_rust_bridge (native) | wasm-bindgen (WASM) | Conditional compilation |
| Threading | Isolates | Web Workers | WASM uses main thread by default |
| Storage | Drift (SQLite) | IndexedDB | Different persistence layer |
| Location | Geolocator plugin | Geolocation API | Browser permission model |
| Push | FCM/APN | Web Push API | Service Worker required |

### References
- flutter_rust_bridge WASM: https://github.com/fzyzcjy/flutter_rust_bridge/wiki/wasm-support
- wasm-bindgen: https://rustwasm.github.io/wasm-bindgen/
- Flutter Web WASM: https://docs.flutter.dev/platform-integration/web/wasm

---

## Summary of Decisions

| ID | Decision | Status |
|----|----------|--------|
| R001 | flutter_rust_bridge v2 for Dart-Rust FFI | ✅ |
| R002 | OpenMLS 0.6+ with Arc/Mutex state management | ✅ |
| R003 | Khatru with custom NIP-29 handlers + PostgreSQL | ✅ |
| R004 | LiveKit Go SDK with Redis room state cache | ✅ |
| R005 | NIP-98 middleware with nostr Go crate | ✅ |
| R006 | Isolate-based PoW mining with progress callbacks | ✅ |
| R007 | Riverpod 2.x with CodeGenerator API | ✅ |
| R008 | Drift 2.x with denormalized schema and FTS5 | ✅ |
| R009 | flutter_map with clustering and incremental loading | ✅ |
| R010 | gRPC with Tonic (Rust) and gRPC-Go | ✅ |
| R011 | flutter_rust_bridge WASM + wasm-bindgen for Web | ✅ |

All research questions resolved. Proceed to Phase 1 (data model, contracts, quickstart).
