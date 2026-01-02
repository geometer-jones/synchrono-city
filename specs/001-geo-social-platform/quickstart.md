# Quickstart Guide: Synchrono City Implementation

**Feature**: 001-geo-social-platform
**Date**: 2025-01-01
**Status**: Phase 1 Design

## Overview

This guide provides a quick reference for implementing Synchrono City components. For detailed specifications, see the related documents in this directory.

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                         Synchrono City                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐        ┌──────────────┐      ┌─────────────┐  │
│  │   Flutter    │        │  Go Relay    │      │  Go Sidecar │  │
│  │   Client     │◄──────►│  (Khatru)    │◄────►│   + Rust    │  │
│  │              │ Nostr  │  NIP-29      │HTTP  │   MLS       │  │
│  │ ┌──────────┐ │        │  PostgreSQL  │      │  Service    │  │
│  │ │  Rust    │ │        └──────────────┘      └──────┬──────┘  │
│  │ │  Crypto  │ │                                     │         │
│  │ └────▲─────┘ │                                     │         │
│  └──────┼───────┘                                     │         │
│         │                                             │         │
└─────────┼─────────────────────────────────────────────┼─────────┘
          │                                             │
          │                   LiveKit                   │
          └─────────────────────────────────────────────┘
```

---

## Component Quickstarts

### 1. Flutter Client

**Setup**:
```bash
cd client
flutter pub get
```

**Directory Structure** (monorepo):
```
client/
├── lib/
│   ├── core/
│   │   ├── crypto/       # Rust FFI bridge
│   │   ├── models/       # Riverpod providers
│   │   ├── database/     # Drift SQLite
│   │   └── network/      # Nostr client
│   ├── features/
│   │   ├── world/        # Map, groups
│   │   ├── chats/        # Messaging
│   │   ├── calls/        # LiveKit + MLS
│   │   ├── pulse/        # Feed, search
│   │   └── settings/     # Profile, config
│   └── main.dart
├── rust/
│   └── src/              # Rust crypto core
└── pubspec.yaml
```

**Key Entry Points**:

| Feature | Provider | Location |
|---------|----------|----------|
| Nostr Client | `nostrClientProvider` | `lib/core/network/` |
| User Identity | `authProvider` | `lib/core/crypto/` |
| Group List | `groupsNearbyProvider` | `lib/features/world/` |
| Chat Messages | `messagesProvider` | `lib/features/chats/` |
| Call State | `callStateProvider` | `lib/features/calls/` |

**Common Tasks**:

```dart
// Connect to relay
final nostr = ref.read(nostrClientProvider);
await nostr.connect(relayUrl);

// Create group (28-bit PoW - takes ~30s)
final group = await ref.read(groupRepositoryProvider).createGroup(
  name: 'Central Park Chats',
  description: 'NYC meetups',
  geohash: 'dr5reg',
  privacyLevel: PrivacyLevel.public,
);

// Join call (12-bit PoW - takes ~10ms)
final token = await sidecar.getGroupToken(
  groupId: 'central-park-chats',
  callId: 'abc123...',
  video: true,
);
await livekitClient.connect(room, token);
```

---

### 2. Go Relay (Khatru)

**Setup**:
```bash
cd relay
go mod download
```

**Main File**:
```go
package main

import (
    "github.com/fiatjaf/khatru"
    "github.com/synchrono-city/relay/pkg/nip29"
    "github.com/synchrono-city/relay/pkg/storage"
)

func main() {
    relay := khatru.NewRelay()

    // PostgreSQL storage
    db := storage.NewPostgresStore(os.Getenv("DATABASE_URL"))
    relay.QueryEvents = db.QueryEvents
    relay.DeleteEvent = db.DeleteEvent

    // NIP-29 group handling
    groupHandler := nip29.NewGroupHandler(db)
    relay.AddHandler = nip29Middleware(relay.AddHandler, groupHandler)

    // Start server
    log.Println("Starting relay on :8080")
    http.ListenAndServe(":8080", relay)
}
```

**NIP-29 Event Kinds**:

| Kind | Name | PoW | Handler |
|------|------|-----|---------|
| 39000 | Group Metadata | No | Store/Query |
| 39002 | Admin List | No | Store/Query |
| 9007 | Create Group | 28-bit | `CreateGroup` |
| 9008 | Delete Group | No | `DeleteGroup` |
| 9021 | Add Member | No | `AddMember` |
| 9022 | Remove Member | No | `RemoveMember` |
| 9023 | Promote Admin | No | `UpdateRole` |
| 9024 | Demote Admin | No | `UpdateRole` |

**Geohash Query Pattern**:
```sql
-- Find groups within ~5km (precision 5)
SELECT * FROM groups
WHERE geohash LIKE 'dr5re%'
  AND privacy_level = 'public';
```

---

### 3. Go Sidecar + Rust MLS

**Setup**:
```bash
cd sidecar
go mod download
cd mls-service
cargo build
```

**Main Sidecar Server**:
```go
package main

import (
    "github.com/go-chi/chi/v5"
    "github.com/synchrono-city/sidecar/internal/handlers"
    "github.com/synchrono-city/sidecar/internal/mls"
)

func main() {
    r := chi.NewRouter()

    // NIP-98 auth middleware
    r.Use(handlers.NIP98Auth)

    // Token endpoints
    r.Post("/token/group", handlers.GetGroupToken)
    r.Post("/token/dm", handlers.GetDMToken)

    // MLS proxy to Rust service
    mlsClient := mls.NewGRPCClient("localhost:50051")
    r.Post("/mls/welcome/{group_id}", handlers.GetMLSWelcome(mlsClient))
    r.Get("/mls/state/{group_id}", handlers.GetMLSState(mlsClient))

    // Proxy endpoints
    r.Post("/proxy/blossom", handlers.ProxyBlossom)
    r.Post("/proxy/link", handlers.ProxyLink)

    // Webhooks
    r.Post("/webhook/nip29", handlers.NIP29Webhook)
    r.Post("/webhook/livekit", handlers.LiveKitWebhook)

    http.ListenAndServe(":8081", r)
}
```

**Rust MLS Service**:
```rust
use openmls::prelude::*;
use tonic::transport::Server;

#[tonic::async_trait]
impl mls_server::Mls for MLSService {
    async fn create_group(
        &self,
        request: Request<CreateGroupRequest>,
    ) -> Result<Response<CreateGroupResponse>, Status> {
        let req = request.into_inner();
        let cipher_suite = Ciphersuite::MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519;

        let (group, welcome) = MlsGroup::create(
            &req.creator_pubkey,
            req.group_id,
            req.name,
        )?;

        Ok(Response::new(CreateGroupResponse {
            welcome_message: welcome.to_bytes(),
        }))
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let addr = "[::1]:50051".parse()?;
    let mls_service = MLSService::new();

    Server::builder()
        .add_service(mls_server::MlsServer::new(mls_service))
        .serve(addr)
        .await?;

    Ok(())
}
```

**Token Issuance Flow**:
```go
func GetGroupToken(w http.ResponseWriter, r *http.Request) {
    pubkey := r.Context().Value("pubkey").(string)

    var req TokenRequest
    json.NewDecoder(r.Body).Decode(&req)

    // Validate membership
    member, err := db.GetGroupMember(req.GroupID, pubkey)
    if err != nil {
        http.Error(w, "Not a member", http.StatusForbidden)
        return
    }

    // Check for blocks
    if blockedByAny(req.GroupID, pubkey) {
        http.Error(w, "Blocked from joining", http.StatusForbidden)
        return
    }

    // Create LiveKit token
    token := livekit.CreateJWTToken(livekit.RoomID(req.GroupID), pubkey)

    // Wrap in NIP-59 Gift Wrap
    giftWrap := createGiftWrap(token, pubkey)

    json.NewEncoder(w).Encode(map[string]string{
        "gift_wrap": giftWrap,
    })
}
```

---

## Event Flow Examples

### Creating a Group

```
1. User taps "Create Group" in app
2. App computes 28-bit PoW (~30s)
3. App publishes Kind 9007 event to relay
4. Relay validates PoW and stores group
5. App navigates to new group chat
```

### Starting a Call

```
1. User taps "Call" button in group chat
2. App creates Kind 1020 event (24-bit PoW ~2s)
3. App requests token from Sidecar: POST /token/group
4. Sidecar validates membership, creates LiveKit room
5. Sidecar returns token wrapped in NIP-59 Gift Wrap
6. App connects to LiveKit with token
7. App becomes Epoch Leader, initializes MLS
```

### Joining a Call

```
1. User taps "Join Call"
2. App creates Kind 20002 event (12-bit PoW ~10ms)
3. App requests token from Sidecar: POST /token/group
4. Sidecar validates membership, checks blocks
5. Sidecar returns token + sends join notification to leader
6. Leader fetches user's KeyPackage (Kind 30022)
7. Leader creates MLS Welcome via Rust service
8. Sidecar delivers Welcome to new participant
9. New participant processes Welcome, connects to LiveKit
```

---

## Proof of Work Targets

| Action | Kind | Bits | Est. Time |
|--------|------|------|-----------|
| Create Group | 9007 | 28 | ~30s |
| Initiate Call | 1020 | 24 | ~2s |
| Join Call | 20002 | 12 | ~10ms |
| Update Profile | 0 | 20 | ~5s |
| Publish KeyPackage | 30022 | 16 | ~300ms |
| Block User | 10006 | 12 | ~10ms |

---

## Environment Variables

| Component | Variable | Description | Example |
|-----------|----------|-------------|---------|
| Relay | `DATABASE_URL` | PostgreSQL connection | `postgres://...` |
| Relay | `PORT` | HTTP port | `8080` |
| Sidecar | `RELAY_URL` | WebSocket URL | `wss://relay...` |
| Sidecar | `LIVEKIT_URL` | LiveKit RPC | `localhost:7880` |
| Sidecar | `LIVEKIT_API_KEY` | LiveKit auth | `APIxyz...` |
| Sidecar | `LIVEKIT_API_SECRET` | LiveKit secret | `secret...` |
| Sidecar | `MLS_SERVICE_URL` | Rust gRPC | `localhost:50051` |
| Sidecar | `REDIS_URL` | Redis for cache | `redis://...` |
| Sidecar | `WEBHOOK_SECRET` | Webhook HMAC | `whsec...` |
| Client | `SEED_RELAY` | Default relay | `wss://relay...` |

---

## Development Workflow

1. **Start all services** (Docker Compose):
   ```bash
   docker-compose up -d
   ```

2. **Or start components individually**:
   ```bash
   # Terminal 1: Relay
   cd relay
   go run cmd/relay/main.go

   # Terminal 2: MLS Service
   cd sidecar/mls-service
   cargo run

   # Terminal 3: Sidecar
   cd sidecar
   go run cmd/sidecar/main.go

   # Terminal 4: Client
   cd client
   flutter run
   ```

---

## Key References

| Document | Path | Purpose |
|----------|------|---------|
| Specification | `../spec.md` | Full functional requirements |
| Data Model | `data-model.md` | Entity definitions and schemas |
| Research | `research.md` | Technical decisions and patterns |
| Relay API | `contracts/relay-api.yaml` | Nostr event formats |
| Sidecar API | `contracts/sidecar-api.yaml` | REST API contracts |
| MLS State | `contracts/mls-state.yaml` | MLS protocol flows |

---

## Troubleshooting

**Issue**: "Cannot join group call"
- Check: Are you a group member?
- Check: Are you blocked by anyone in the call?
- Check: Is the call still active (Kind 1021 not received)?

**Issue**: "MLS epoch mismatch"
- Action: App will auto-fetch state from Sidecar
- Manual: Pull to refresh in call view

**Issue**: "PoW taking too long"
- Check: Device performance (mobile may be slower)
- Action: Wait or cancel (progress cached for retry)

**Issue**: "Location too precise"
- Check: Geohash precision > 6
- Action: Client truncates to 6 before sending
