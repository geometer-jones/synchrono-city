# Tasks: Synchrono City - Geo-Social Platform Implementation

**Input**: Design documents from `/specs/001-geo-social-platform/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are OPTIONAL in this task list. Include test tasks if explicitly requested for TDD approach.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

This is a **monorepo** with four components:
- `client/` - Flutter mobile/web app
- `relay/` - Go Nostr relay (Khatru)
- `sidecar/` - Go API gateway + Rust MLS microservice
- `shared/` - Shared code and scripts

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Monorepo initialization and basic project structure for all components

- [ ] T001 Create monorepo directory structure (client/, relay/, sidecar/, shared/, deployments/) at repository root
- [ ] T002 [P] Initialize Flutter project in client/ with Flutter 3.x, Dart 3.x dependencies in client/pubspec.yaml
- [ ] T003 [P] Initialize Go module for relay in relay/go.mod with Khatru framework
- [ ] T004 [P] Initialize Go module for sidecar in sidecar/go.mod with Chi v5 routing
- [ ] T005 [P] Initialize Rust project for MLS service in sidecar/mls-service/Cargo.toml with OpenMLS dependency
- [ ] T006 [P] Create Docker Compose configuration for development environment in docker-compose.yml (Postgres, Redis, relay, sidecar)
- [ ] T007 [P] Configure CI/CD workflows in .github/workflows/ (client-ci.yml, relay-ci.yml, sidecar-ci.yml)
- [ ] T008 [P] Setup shared proto definitions in shared/proto/ for gRPC communication
- [ ] T009 [P] Create development utility scripts in shared/scripts/ (dev-setup.sh, docker-dev.sh, test-all.sh)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Client Foundational Infrastructure

- [ ] T010 Create flutter_rust_bridge configuration in client/rust/ with FFI bindings setup
- [ ] T011 [P] Implement Rust crypto core in client/rust/src/lib.rs with secp256k1 keypair generation (FR-001)
- [ ] T011b [P] Implement CryptoPlatform interface with conditional imports for Native (FFI) vs Web (WASM) targets in client/lib/core/crypto/crypto_platform.dart (R011)
- [ ] T012 [P] Implement secure storage wrappers in client/lib/core/crypto/secure_storage.dart for iOS Keychain and Android Keystore (FR-002)
- [ ] T013 Implement Nostr event signing in client/lib/core/crypto/nostr_signer.dart using private key (FR-003)
- [ ] T014 Implement Nostr signature validation in client/lib/core/crypto/nostr_validator.dart (FR-004)
- [ ] T015 Implement clock sync check in client/lib/core/network/clock_sync.dart with ±30s warning and ±5m refusal (FR-005, FR-006)
- [ ] T016 [P] Create Drift database schema in client/lib/core/database/schema.dart with Users, Groups, Messages, Calls tables
- [ ] T017 [P] Implement database migrations in client/lib/core/database/migrations.dart
- [ ] T018 Implement Nostr WebSocket client in client/lib/core/network/nostr_client.dart with relay connection management
- [ ] T019 [P] Create Riverpod providers structure in client/lib/core/models/providers.dart with AuthService, NostrClient providers
- [ ] T020 [P] Create shared widgets in client/lib/shared/widgets/ (LoadingIndicator, ErrorDisplay, Avatar)
- [ ] T021 [P] Create app theme in client/lib/shared/theme/app_theme.dart with Material 3 design
- [ ] T022 Create bottom navigation structure in client/lib/main.dart with tabs (World, Chats, Pulse, Settings)

### Relay Foundational Infrastructure

- [ ] T023 Create PostgreSQL schema in relay/migrations/postgres/001_init.sql with events, groups, group_members tables
- [ ] T024 Implement Khatru relay setup in relay/cmd/relay/main.go with WebSocket handler
- [ ] T025 Implement event storage backend in relay/pkg/storage/postgres.go with event CRUD operations
- [ ] T026 [P] Implement PoW validation middleware in relay/pkg/pow/validator.go for all PoW-requiring kinds
- [ ] T027 [P] Implement geohash validation in relay/pkg/synchrono/geohash.go enforcing max precision 6 (FR-008)
- [ ] T028b [P] Configure Relay NIP-11 metadata in relay/cmd/relay/main.go to identify as 'synchrono_city' compatible with supported_kinds and constraints
- [ ] T028 Implement event query handlers in relay/pkg/storage/query.go with filter support

### Sidecar Foundational Infrastructure

- [ ] T029 Implement Chi router setup in sidecar/cmd/sidecar/main.go with middleware chain
- [ ] T030 Implement NIP-98 authentication middleware in sidecar/internal/auth/nip98.go (FR-052)
- [ ] T031 [P] Implement health check endpoint in sidecar/internal/handlers/health.go returning server time for clock sync
- [ ] T032 [P] Implement Redis client in sidecar/internal/redis/client.go for ephemeral state storage
- [ ] T033 Implement LiveKit client wrapper in sidecar/internal/livekit/client.go for room management
- [ ] T034 Create gRPC proto definitions in sidecar/rpc/mls/service.proto for MLS operations
- [ ] T035 Implement gRPC Go client in sidecar/internal/mls/client.go for Rust MLS service communication
- [ ] T036 Implement gRPC server in sidecar/mls-service/src/lib.rs with OpenMLS wrapper using Tonic
- [ ] T037b Verify gRPC connectivity between Go Sidecar and Rust MLS service with a Health RPC in sidecar/internal/mls/health_check.go
- [ ] T037 [P] Implement error response helper in sidecar/internal/handlers/errors.go with all Protocol Specification §10 error codes

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Discover and Join Nearby Groups (Priority: P1) 🎯 MVP

**Goal**: Users can view a map of their location, see nearby groups as pins, preview group details, and join conversations

**Independent Test**: Launch app, grant location permission, view map with group pins, tap pins to preview, tap "Join Group" to become a member

### Client Implementation

- [ ] T038 [P] [US1] Create Geohash utility in client/lib/shared/utils/geohash.dart with encode/decode and precision 6 enforcement (FR-008, FR-009)
- [ ] T039 [P] [US1] Create location service in client/lib/core/location/location_service.dart with permission handling and manual location entry (FR-007, FR-011)
- [ ] T040 [P] [US1] Create Group model in client/lib/features/world/models/group.dart matching Drift schema
- [ ] T041 [P] [US1] Create GroupsNearby provider in client/lib/features/world/providers/groups_nearby.dart using AsyncNotifier
- [ ] T042 [US1] Create map widget in client/lib/features/world/screens/map_screen.dart using flutter_map with controller
- [ ] T043 [US1] Implement group pin markers in client/lib/features/world/widgets/group_pin_marker.dart with active call indicators
- [ ] T044 [US1] Implement marker clustering in client/lib/features/world/widgets/pin_cluster.dart using flutter_map_marker_cluster
- [ ] T045 [US1] Create group preview card in client/lib/features/world/widgets/group_preview_card.dart showing name, description, member count, active call status
- [ ] T046 [US1] Implement location permission request flow in client/lib/features/world/screens/map_screen.dart with manual location fallback
- [ ] T047 [US1] Implement group join action in client/lib/features/world/providers/groups_nearby.dart publishing Kind 9021 event (FR-018)
- [ ] T048 [US1] Create low-density location warning in client/lib/shared/widgets/location_warning_dialog.dart (FR-012)

### Relay Implementation

- [ ] T049 [P] [US1] Create NIP-29 groups table handler in relay/pkg/nip29/groups.go with CRUD operations
- [ ] T050 [P] [US1] Implement group members handler in relay/pkg/nip29/members.go with role tracking
- [ ] T051 [US1] Implement geohash prefix query in relay/pkg/nip29/query.go for nearby groups discovery (FR-016)
- [ ] T052 [US1] Add Kind 39000 handler in relay/pkg/nip29/metadata.go for group metadata events

**Checkpoint**: Users can discover and join nearby groups - MVP core feature complete

---

## Phase 4: User Story 2 - Create a Location-Based Group (Priority: P1)

**Goal**: Users can drop a pin on the map, name their group, add description, set privacy level, and publish with 28-bit PoW

**Independent Test**: Tap "Create Group" button, select location on map, enter details (name 3-50 chars, description, privacy), tap "Create Group" and verify Kind 9007 published

### Client Implementation

- [ ] T053 [P] [US2] Create PoW miner in client/lib/core/crypto/pow_miner.dart using isolate-based computation (FR-014, R006)
- [ ] T054 [P] [US2] Create GroupCreateRequest model in client/lib/features/world/models/group_create.dart
- [ ] T055 [US2] Create group creation form in client/lib/features/world/screens/create_group_screen.dart with location picker, name (3-50), description, privacy selector
- [ ] T056 [US2] Implement coordinate truncation in client/lib/shared/utils/coordinates.dart to 2 decimal places (FR-009)
- [ ] T057 [US2] Implement group creation flow in client/lib/features/world/providers/create_group.dart with 28-bit PoW computation before publishing (FR-013, FR-014)
- [ ] T058 [US2] Add group creation to local database in client/lib/features/world/providers/create_group.dart storing authoritative relay URL (FR-020)
- [ ] T059 [US2] Navigate to new group chat after creation in client/lib/features/chats/screens/group_chat_screen.dart

### Relay Implementation

- [ ] T060 [US2] Add Kind 9007 handler in relay/pkg/nip29/create_group.go with 28-bit PoW validation (FR-014)
- [ ] T061 [US2] Implement group metadata storage in relay/pkg/nip29/groups.go with relay_url binding to authoritative relay (FR-020)
- [ ] T062 [US2] Add Kind 39002 handler in relay/pkg/nip29/privacy.go for privacy level and admin list

**Checkpoint**: Users can create location-based groups - content generation mechanism complete

---

## Phase 5: User Story 3 - Send and Receive Group Messages (Priority: P1)

**Goal**: Group members can exchange text messages in real-time with threading and reactions

**Independent Test**: Join a group, send text message, verify it appears for all members, receive message from another participant, test reply and react

### Client Implementation

- [ ] T063 [P] [US3] Create Message model in client/lib/features/chats/models/message.dart matching Drift schema
- [ ] T064 [P] [US3] Create GroupMessages provider in client/lib/features/chats/providers/group_messages.dart using AsyncNotifier
- [ ] T065 [P] [US3] Create message composer widget in client/lib/features/chats/widgets/message_composer.dart with send button
- [ ] T066 [P] [US3] Create message bubble widget in client/lib/features/chats/widgets/message_bubble.dart with sender, timestamp, content
- [ ] T067 [US3] Implement message sending in client/lib/features/chats/providers/group_messages.dart publishing Kind 1 with 'h' tag (FR-021)
- [ ] T068 [US3] Implement real-time message receiving in client/lib/core/network/nostr_client.dart via WebSocket subscription
- [ ] T069 [US3] Implement offline message queue in client/lib/core/network/message_queue.dart with exponential backoff retry (FR-025)
- [ ] T070 [US3] Implement message threading in client/lib/features/chats/providers/group_messages.dart with 'e' tag for reply parent (FR-024)
- [ ] T071 [US3] Implement message reactions in client/lib/features/chats/providers/message_reactions.dart publishing Kind 7 events (FR-026)
- [ ] T072 [US3] Create message long-press actions in client/lib/features/chats/widgets/message_bubble.dart (reply, react, copy, delete)
- [ ] T073 [US3] Implement message list pagination in client/lib/features/chats/providers/group_messages.dart for large chat histories

### Relay Implementation

- [ ] T074 [US3] Add Kind 1 query handler in relay/pkg/storage/query.go with 'h' tag filtering for group messages
- [ ] T075 [US3] Add Kind 7 (reaction) handler in relay/pkg/handlers/reactions.go

**Checkpoint**: Text chat foundation complete - groups have communication purpose

---

## Phase 6: User Story 4 - Start and Join Group Voice/Video Calls (Priority: P1)

**Goal**: Group members can initiate voice/video calls with MLS E2EE and join ongoing calls

**Independent Test**: Initiate call from group chat, verify Kind 1020 with 24-bit PoW published, connect to LiveKit as Epoch Leader, have another participant join via Kind 20002

### Client Implementation

- [ ] T076 [P] [US4] Create Call model in client/lib/features/chats/calls/models/call.dart with MLS state tracking
- [ ] T077 [P] [US4] Create ActiveCall provider in client/lib/features/chats/calls/providers/active_call.dart using StateNotifier
- [ ] T078 [P] [US4] Create MLS bridge wrapper in client/lib/core/crypto/mls_bridge.dart using flutter_rust_bridge to Rust OpenMLS (R001, R002)
- [ ] T079 [P] [US4] Create KeyPackage manager in client/lib/core/crypto/keypackage_manager.dart maintaining 3-5 packages with auto-refresh (FR-031, R002)
- [ ] T080 [P] [US4] Create LiveKit client wrapper in client/lib/core/network/livekit_client.dart using LiveKit SDK
- [ ] T081 [US4] Implement call initiation in client/lib/features/chats/calls/providers/call_initiation.dart publishing Kind 1020 with 24-bit PoW (FR-033)
- [ ] T082 [US4] Implement "Oldest Active Root" resolution in client/lib/features/chats/calls/providers/call_initiation.dart for multiple parallel calls (FR-037)
- [ ] T083 [US4] Implement call token request in client/lib/core/network/sidecar_client.dart POST /token/group with NIP-98 auth (FR-035, FR-052)
- [ ] T084 [US4] Implement token unwrapping in client/lib/core/network/sidecar_client.dart decrypting NIP-59 Gift Wrap (FR-036)
- [ ] T085 [US4] Implement LiveKit room connection in client/lib/core/network/livekit_client.dart with frame encryption from MLS exporter (FR-027, FR-029)
- [ ] T086 [US4] Implement MLS Welcome handling in client/lib/core/crypto/mls_bridge.dart processing Welcome message for group join
- [ ] T087 [US4] Implement call join in client/lib/features/chats/calls/providers/call_join.dart publishing Kind 20002 with 12-bit PoW (FR-034)
- [ ] T088 [US4] Create call UI in client/lib/features/chats/calls/screens/group_call_screen.dart with participant grid and controls
- [ ] T089 [US4] Implement mute/video toggle in client/lib/features/chats/calls/widgets/call_controls.dart reflecting state for all participants (FR-039)
- [ ] T090 [US4] Implement epoch leader detection in client/lib/features/chats/calls/providers/active_call.dart for MLS commit management (FR-030)
- [ ] T091 [US4] Implement ghost device detection in client/lib/core/crypto/mls_bridge.dart alerting on unauthorized keys (FR-032)
- [ ] T092 [US4] Implement MLS epoch recovery in client/lib/core/crypto/mls_bridge.dart fetching /mls/state on mismatch (FR-069)

### Sidecar Implementation

- [ ] T093 [US4] Implement POST /token/group in sidecar/internal/handlers/token.go issuing LiveKit JWT wrapped in NIP-59
- [ ] T094 [US4] Implement group membership validation in sidecar/internal/handlers/token.go checking Kind 39002 members
- [ ] T095 [US4] Implement block list enforcement in sidecar/internal/handlers/token.go rejecting blocked users (FR-043)
- [ ] T096 [US4] Implement POST /mls/welcome/{group_id} in sidecar/internal/handlers/mls.go generating Welcome message (R002)
- [ ] T097 [US4] Implement GET /mls/state/{group_id} in sidecar/internal/handlers/mls.go returning epoch and members
- [ ] T098 [US4] Implement LiveKit webhook handler in sidecar/internal/webhook/livekit.go for participant events (R004)
- [ ] T099 [US4] Implement MLS state Redis caching in sidecar/internal/mls/redis_state.go with 4h TTL
- [ ] T100 [US4] Implement epoch leadership transfer in sidecar/internal/mls/leader_transfer.go on leader departure

### MLS Service Implementation

- [ ] T101 [US4] Implement CreateGroup RPC in sidecar/mls-service/src/lib.rs with OpenMLS group creation
- [ ] T102 [US4] Implement AddMember RPC in sidecar/mls-service/src/lib.rs generating Welcome message
- [ ] T103 [US4] Implement ExportKey RPC in sidecar/mls-service/src/lib.rs deriving frame encryption key (FR-029)
- [ ] T104 [US4] Implement GetGroupState RPC in sidecar/mls-service/src/lib.rs returning epoch and member list

### Relay Implementation

- [ ] T105 [US4] Add Kind 1020 handler in relay/pkg/nip29/calls.go storing call initiation events
- [ ] T106 [US4] Add Kind 20002 handler in relay/pkg/nip29/calls.go storing join requests
- [ ] T107 [US4] Add Kind 1021 handler in relay/pkg/nip29/calls.go storing call end with duration

**Checkpoint**: Real-time voice/video complete - core differentiator feature implemented

---

## Phase 7: User Story 5 - Send and Receive Direct Messages (Priority: P2)

**Goal**: Users can send private E2EE DMs using NIP-44 and manage unified inbox

**Independent Test**: Tap "Message" on profile, compose DM, verify NIP-44 encrypted delivery, receive DM, view in unified Chats tab

### Client Implementation

- [ ] T108 [P] [US5] Create DM model in client/lib/features/chats/dm/models/dm_message.dart
- [ ] T109 [P] [US5] Create DMConversation provider in client/lib/features/chats/dm/providers/dm_conversation.dart
- [ ] T110 [P] [US5] Create unified ChatsList provider in client/lib/features/chats/providers/chats_list.dart combining groups and DMs
- [ ] T111 [US5] Implement NIP-44 encryption in client/lib/core/crypto/nip44.dart for DM content (FR-022)
- [ ] T112 [US5] Implement NIP-59 Gift Wrap in client/lib/core/crypto/nip59.dart wrapping encrypted DMs
- [ ] T113 [US5] Implement DM sending in client/lib/features/chats/dm/providers/dm_conversation.dart encrypted with NIP-44
- [ ] T114 [US5] Implement DM receiving in client/lib/core/network/nostr_client.dart decrypting NIP-59 and NIP-44
- [ ] T115 [US5] Create DM chat screen in client/lib/features/chats/dm/screens/dm_chat_screen.dart
- [ ] T116 [US5] Implement Chats tab in client/lib/features/chats/screens/chats_list_screen.dart with unified inbox sorted by recent activity
- [ ] T117 [US5] Add DM notifications in client/lib/core/push/notification_handler.dart with generic fallback (FR-073, FR-074)

### Relay Implementation

- [ ] T118 [US5] Add Kind 4 query handler in relay/pkg/storage/query.go for encrypted DMs

**Checkpoint**: Private messaging complete - individual relationship building enabled

---

## Phase 8: User Story 6 - Start and Join DM Voice/Video Calls (Priority: P2)

**Goal**: Users can initiate 1:1 E2EE calls using MLS with two-party group

**Independent Test**: Initiate call from DM, recipient sees incoming call UI, accept verifies MLS key exchange and LiveKit connection

### Client Implementation

- [ ] T119 [P] [US6] Create DMCall model in client/lib/features/chats/calls/models/dm_call.dart
- [ ] T120 [P] [US6] Create DMCallOffer provider in client/lib/features/chats/calls/providers/dm_call.dart
- [ ] T121 [US6] Implement DM call initiation in client/lib/features/chats/calls/providers/dm_call.dart publishing Kind 20010
- [ ] T122 [US6] Create incoming call UI in client/lib/features/chats/calls/screens/incoming_call_screen.dart full-screen with caller info
- [ ] T123 [US6] Implement call accept in client/lib/features/chats/calls/providers/dm_call.dart publishing Kind 20011
- [ ] T124 [US6] Implement call decline in client/lib/features/chats/calls/providers/dm_call.dart publishing Kind 20012
- [ ] T125 [US6] Implement DM call token request in client/lib/core/network/sidecar_client.dart POST /token/dm
- [ ] T126 [US6] Implement two-party MLS group in client/lib/core/crypto/mls_bridge.dart for DM calls

### Sidecar Implementation

- [ ] T127 [US6] Implement POST /token/dm in sidecar/internal/handlers/token.go issuing DM call tokens
- [ ] T128 [US6] Implement block check in sidecar/internal/handlers/token.go rejecting if peer has blocked caller

**Checkpoint**: DM calls complete - private voice/video feature implemented

---

## Phase 9: User Story 7 - Manage User Profile and Identity (Priority: P2)

**Goal**: Users can create and manage profile with name, avatar, website, NIP-05

**Independent Test**: Navigate Settings > Profile, edit fields, upload avatar, save, verify Kind 0 with 20-bit PoW published

### Client Implementation

- [ ] T129 [P] [US7] Create User model in client/lib/features/settings/models/user_profile.dart
- [ ] T130 [P] [US7] Create UserProfile provider in client/lib/features/settings/providers/user_profile.dart
- [ ] T131 [US7] Create profile editor screen in client/lib/features/settings/screens/profile_edit_screen.dart with validation (name 3-50 chars)
- [ ] T132 [US7] Implement profile image upload in client/lib/features/settings/providers/image_upload.dart proxied through Sidecar to Blossom (FR-055)
- [ ] T133 [US7] Implement profile saving in client/lib/features/settings/providers/user_profile.dart publishing Kind 0 with 20-bit PoW (FR-054)
- [ ] T134 [US7] Create first-run profile creation flow in client/lib/features/settings/screens/onboarding_screen.dart

### Sidecar Implementation

- [ ] T135 [US7] Implement POST /proxy/blossom in sidecar/internal/handlers/proxy.go hiding user IP (FR-051)

**Checkpoint**: Profile identity complete - user reputation system enabled

---

## Phase 10: User Story 8 - Manage Network Connections (Relays) (Priority: P3)

**Goal**: Users can configure relay connections with hardcoded seed relay fallback

**Independent Test**: Navigate Settings > Relays, add wss:// URL, verify connection status display, test NIP-11 synchrono_city detection

### Client Implementation

- [ ] T136 [P] [US8] Create Relay model in client/lib/core/models/relay.dart with connection status
- [ ] T137 [P] [US8] Create RelayList provider in client/lib/features/settings/providers/relay_list.dart
- [ ] T138 [US8] Implement seed relay connection in client/lib/core/network/nostr_client.dart with hardcoded URL (FR-046)
- [ ] T139 [US8] Create relay settings screen in client/lib/features/settings/screens/relay_settings_screen.dart with add/remove UI
- [ ] T140 [US8] Implement NIP-11 query in client/lib/core/network/relay_info.dart checking synchrono_city support (FR-049)
- [ ] T141 [US8] Implement relay connection retry in client/lib/core/network/nostr_client.dart with exponential backoff (FR-050)
- [ ] T142 [US8] Publish Kind 10002 Relay List in client/lib/features/settings/providers/relay_list.dart (FR-048)

**Checkpoint**: Relay management complete - decentralization features enabled

---

## Phase 11: User Story 9 - Block and Mute Other Users (Priority: P2)

**Goal**: Users can block (public, infrastructure-enforced) or mute (private, client-only) other users

**Independent Test**: Block user from profile, verify Kind 10006 published, test Sidecar rejection when blocked user tries to join call; mute user and verify content hidden

### Client Implementation

- [ ] T143 [P] [US9] Create BlockedUser model in client/lib/core/models/blocked_user.dart
- [ ] T144 [P] [US9] Create MutedUser model in client/lib/core/models/muted_user.dart
- [ ] T145 [P] [US9] Create BlockList provider in client/lib/features/settings/providers/block_list.dart
- [ ] T146 [P] [US9] Create MuteList provider in client/lib/features/settings/providers/mute_list.dart
- [ ] T147 [US9] Implement block action in client/lib/features/settings/providers/block_list.dart publishing Kind 10006 with 12-bit PoW (FR-040)
- [ ] T148 [US9] Implement mute action in client/lib/features/settings/providers/mute_list.dart publishing encrypted Kind 10000 (FR-041)
- [ ] T149 [US9] Implement block list notification to Sidecar in client/lib/core/network/sidecar_client.dart (FR-045)
- [ ] T150 [US9] Implement blocked user content filter in client/lib/features/chats/providers/group_messages.dart
- [ ] T151 [US9] Implement muted user content filter in client/lib/features/chats/providers/group_messages.dart (FR-044)
- [ ] T152 [US9] Create incoming call block warning in client/lib/features/chats/calls/screens/incoming_call_screen.dart when blocked user present (FR-042)
- [ ] T153 [US9] Implement muted participant rendering in client/lib/features/chats/calls/screens/group_call_screen.dart as silence/black screen (FR-044)

### Sidecar Implementation

- [ ] T154 [US9] Implement block list caching in sidecar/internal/blocklist/cache.go querying Kind 10006
- [ ] T155 [US9] Add block check to join validation in sidecar/internal/handlers/token.go enforcing asymmetric first-arriver rule (FR-043)

**Checkpoint**: Block/mute complete - user safety features implemented

---

## Phase 12: User Story 10 - Export and Import User Data (Priority: P3)

**Goal**: Users can export profile, contacts, relays, mute/block lists, posts, DMs and import to new device

**Independent Test**: Navigate Settings > Export, select categories, download JSON, verify contains profile (Kind 0), contacts (Kind 3), relays (Kind 10002), mutes, blocks, posts

### Client Implementation

- [ ] T156 [P] [US10] Create export models in client/lib/features/settings/models/data_export.dart
- [ ] T157 [US10] Implement data export in client/lib/features/settings/providers/data_export.dart aggregating profile, contacts, relays, mutes, blocks, posts (FR-056)
- [ ] T158 [US10] Implement encrypted DM export in client/lib/features/settings/providers/data_export.dart including encrypted content (readable only with private key)
- [ ] T159 [US10] Implement data import in client/lib/features/settings/providers/data_import.dart validating JSON and restoring to database (FR-057)
- [ ] T160 [US10] Create export screen in client/lib/features/settings/screens/export_screen.dart with category selection
- [ ] T161 [US10] Verify private keys NOT exported in client/lib/features/settings/providers/data_export.dart (FR-058)

**Checkpoint**: Data portability complete - user sovereignty features implemented

---

## Phase 13: User Story 11 - Browse Public Content Feed (Priority: P3)

**Goal**: Users can browse feed of public posts from followed users and global network

**Independent Test**: Navigate to Pulse tab, view followed users feed, tap Global tab, view global feed, compose post, verify Kind 1 published

### Client Implementation

- [ ] T162 [P] [US11] Create Post model in client/lib/features/pulse/models/post.dart
- [ ] T163 [P] [US11] Create Feed provider in client/lib/features/pulse/providers/feed.dart with followed/global tabs
- [ ] T164 [P] [US11] Create feed item widget in client/lib/features/pulse/widgets/feed_item.dart displaying post content and author
- [ ] T165 [US11] Create Pulse tab screen in client/lib/features/pulse/screens/pulse_screen.dart with tab switching
- [ ] T166 [US11] Implement post composer in client/lib/features/pulse/widgets/post_composer.dart
- [ ] T167 [US11] Implement post interactions in client/lib/features/pulse/providers/post_actions.dart (reply via Kind 1 with 'e', repost via Kind 6, react via Kind 7) (FR-061)
- [ ] T168 [US11] Implement media attachment in client/lib/features/pulse/providers/post_actions.dart with Kind 1063 File Metadata (FR-062)

### Relay Implementation

- [ ] T169 [US11] Add Kind 1 global query handler in relay/pkg/storage/query.go without group filter

**Checkpoint**: Feed complete - broader network discovery enabled

---

## Phase 14: User Story 12 - Search for Users and Content (Priority: P3)

**Goal**: Users can search by username, hashtag, npub, or free text

**Independent Test**: Tap search icon, enter "@username" verify user results, enter hashtag verify post results, enter npub verify exact user profile

### Client Implementation

- [ ] T170 [P] [US12] Create Search provider in client/lib/shared/providers/search_provider.dart
- [ ] T171 [P] [US12] Create search screen in client/lib/shared/screens/search_screen.dart with input and results
- [ ] T172 [US12] Implement username search in client/lib/shared/providers/search_provider.dart querying Kind 0 name field (FR-063)
- [ ] T173 [US12] Implement hashtag search in client/lib/shared/providers/search_provider.dart querying Kind 1 't' tag (FR-064)
- [ ] T174 [US12] Implement npub lookup in client/lib/shared/providers/search_provider.dart (FR-065)
- [ ] T175 [US12] Display recent searches and trending topics in client/lib/shared/screens/search_screen.dart (FR-066)

**Checkpoint**: Search complete - active discovery features implemented

---

## Phase 15: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories and final validation

### Error Handling & UX Polish

- [ ] T176 [P] Implement user-friendly error messages in client/lib/shared/widgets/error_display.dart for all Protocol Specification §10 error codes (FR-067)
- [ ] T177 [P] Implement exponential backoff retry in client/lib/core/network/retry_handler.dart for all transient failures (FR-068)
- [ ] T178 Handle "Zombie Room" scenario in client/lib/core/network/livekit_client.dart with 5-second timeout and recovery (FR-070)

### Bot Identification

- [ ] T179 Implement bot detection in client/lib/core/models/user_helpers.dart checking Kind 0 `"bot": true` or Kind 30078 (FR-071)
- [ ] T180 Display "Bot" badge on profiles in client/lib/features/settings/widgets/user_profile_header.dart (FR-072)
- [ ] T181 Display "Automated" label on bot posts in client/lib/features/pulse/widgets/feed_item.dart

### Static Assets for Web Client

- [ ] T182 Implement static asset serving in sidecar/internal/handlers/assets.go with cache-control and ETags (FR-076)
- [ ] T183 Implement asset manifest endpoint in sidecar/internal/handlers/assets.go GET /assets/manifest.json
- [ ] T184 Create Service Worker registration in client/web/service_worker.js for offline capability (FR-077)

### Documentation & Validation

- [ ] T185 Create deployment documentation in deployments/docker/README.md
- [ ] T186 Create Kubernetes manifests in deployments/kubernetes/ for relay and sidecar
- [ ] T187 Run quickstart.md validation scenarios from /specs/001-geo-social-platform/quickstart.md

### Security Hardening

- [ ] T188 Implement clock drift warning UI in client/lib/shared/widgets/clock_warning_dialog.dart
- [ ] T189 Refuse event creation when clock drift > ±5 minutes in client/lib/core/crypto/nostr_signer.dart
- [ ] T190 Implement secure key deletion on logout in client/lib/core/crypto/secure_storage.dart

### Performance Optimization

- [ ] T191 [P] Optimize map rendering with marker pool pattern in client/lib/features/world/widgets/group_pin_marker.dart (R009)
- [ ] T192 [P] Implement bounds debouncing for map loading in client/lib/features/world/screens/map_screen.dart
- [ ] T193 Optimize feed scrolling with 60fps rendering in client/lib/features/pulse/screens/pulse_screen.dart using ListView.builder

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-14)**: All depend on Foundational phase completion
  - User stories can proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Phase 15)**: Depends on all desired user stories being complete

### User Story Dependencies

| Story | Priority | Depends On | Can Start After |
|-------|----------|------------|-----------------|
| US1 - Discover Groups | P1 | Foundational only | Phase 2 |
| US2 - Create Groups | P1 | Foundational only | Phase 2 |
| US3 - Group Messages | P1 | Foundational only | Phase 2 |
| US4 - Group Calls | P1 | US3 (needs group chat context) | Phase 5 |
| US5 - DMs | P2 | Foundational only | Phase 2 |
| US6 - DM Calls | P2 | US5 (needs DM context) | Phase 7 |
| US7 - Profile | P2 | Foundational only | Phase 2 |
| US8 - Relays | P3 | Foundational only | Phase 2 |
| US9 - Block/Mute | P2 | Foundational only | Phase 2 |
| US10 - Export/Import | P3 | US7 (needs profile) | Phase 9 |
| US11 - Feed | P3 | Foundational only | Phase 2 |
| US12 - Search | P3 | Foundational only | Phase 2 |

### Within Each User Story

- Models before providers
- Providers before screens/widgets
- Core implementation before integration
- Tests (if included) MUST be written and FAIL before implementation

### Parallel Opportunities

**Setup Phase (T001-T009)**: All [P] tasks can run in parallel

**Foundational Phase**:
- Client: T011, T012, T016, T017, T019, T020, T021 can run in parallel
- Relay: T026, T027 can run in parallel
- Sidecar: T031, T032, T034, T037 can run in parallel

**User Story 1 (T038-T052)**: T038, T039, T040, T041, T049, T050 can run in parallel

**User Story 4 (Group Calls - T076-T107)**: T076, T077, T078, T079, T080, T093, T094, T105 can run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch all models/providers for User Story 1 together:
Task T038: Create Geohash utility
Task T039: Create location service
Task T040: Create Group model
Task T041: Create GroupsNearby provider
Task T049: Create NIP-29 groups table handler
Task T050: Create group members handler
```

---

## Implementation Strategy

### MVP First (User Stories 1-4 Only)

1. Complete Phase 1: Setup (T001-T009)
2. Complete Phase 2: Foundational (T010-T037) - CRITICAL
3. Complete Phase 3: US1 - Discover Groups (T038-T052)
4. Complete Phase 4: US2 - Create Groups (T053-T062)
5. Complete Phase 5: US3 - Group Messages (T063-T075)
6. Complete Phase 6: US4 - Group Calls (T076-T107)
7. **STOP and VALIDATE**: Core P1 features complete - deploy/demo MVP

### Incremental Delivery (Priority Order)

1. **MVP (P1)**: US1 → US2 → US3 → US4 → Deploy
2. **V1.1 (P2)**: US5 → US6 → US7 → US9 → Deploy
3. **V1.2 (P3)**: US8 → US10 → US11 → US12 → Deploy
4. **V1.3**: Polish Phase → Deploy

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - **Developer A**: US1 (Discover Groups)
   - **Developer B**: US2 (Create Groups)
   - **Developer C**: US3 (Group Messages)
   - **Developer D**: US4 foundation (MLS, LiveKit setup)
3. Merge and integrate; Developer D completes US4
4. **Developer A**: US5 + US6 (DMs and calls)
   - **Developer B**: US7 + US9 (Profile, block/mute)
   - **Developer C**: US11 + US12 (Feed, search)
5. **Developer D**: US8 + US10 (Relays, export/import)
6. Team completes Polish phase together

---

## Summary

| Metric | Count |
|--------|-------|
| **Total Tasks** | 193 |
| **Setup Phase** | 9 |
| **Foundational Phase** | 31 |
| **US1 - Discover Groups** | 15 |
| **US2 - Create Groups** | 10 |
| **US3 - Group Messages** | 13 |
| **US4 - Group Calls** | 32 |
| **US5 - DMs** | 10 |
| **US6 - DM Calls** | 10 |
| **US7 - Profile** | 7 |
| **US8 - Relays** | 7 |
| **US9 - Block/Mute** | 13 |
| **US10 - Export/Import** | 6 |
| **US11 - Feed** | 8 |
| **US12 - Search** | 6 |
| **Polish Phase** | 18 |

### Task Count by Component

| Component | Tasks |
|-----------|-------|
| Client (Flutter/Dart) | ~131 |
| Relay (Go) | ~21 |
| Sidecar (Go) | ~26 |
| MLS Service (Rust) | ~5 |
| Shared/Infrastructure | ~10 |

### Independent Test Criteria Summary

| Story | Independent Test |
|-------|------------------|
| US1 | Launch app → grant location → view map → tap pins → join group |
| US2 | Tap Create → select location → enter details → publish → verify Kind 9007 |
| US3 | Join group → send message → receive from other → test reply/react |
| US4 | Initiate call → verify Kind 1020 → connect LiveKit → second participant joins |
| US5 | Tap Message → compose DM → verify NIP-44 delivery → view in Chats tab |
| US6 | Initiate DM call → recipient sees incoming UI → accept → verify connection |
| US7 | Settings > Profile → edit fields → upload avatar → save → verify Kind 0 |
| US8 | Settings > Relays → add wss:// URL → verify connection status |
| US9 | Block user → verify Kind 10006 → test Sidecar rejection in call |
| US10 | Settings > Export → select categories → download JSON → verify contents |
| US11 | Pulse tab → view followed feed → switch to Global → compose post |
| US12 | Search → enter "@username" → verify results → enter hashtag → verify posts |

---

**Next Command**: `/speckit.implement` to execute these tasks, OR `/speckit.plan` to adjust design, OR `/speckit.clarify` to resolve remaining ambiguities
