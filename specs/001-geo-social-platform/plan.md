# Implementation Plan: Synchrono City - Geo-Social Platform

**Branch**: `001-geo-social-platform` | **Date**: 2025-01-01 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-geo-social-platform/spec.md`

## Summary

Synchrono City is a decentralized, location-based social platform for group communication. Users drop pins on a map to start group chats (text and voice/video), then can transition to DMs and in-person meetups. The architecture follows a federated four-component model: Nostr Relay (events/signaling), Sidecar (token generation, webhooks, proxying, MLS key authority), LiveKit Server (real-time media SFU), and Blossom Server (media storage).

The implementation consists of four separate codebases targeting different platforms:
1. **Flutter Client** (iOS/Android) - Mobile application with Rust bridge for MLS
2. **Relay** (Go with Khatru) - Nostr relay with NIP-29 group support
3. **Sidecar** (Go + Rust microservice) - API gateway and MLS key authority
4. **LiveKit Integration** - Third-party SFU for media routing

## Technical Context

**Language/Version**:
- Client: Dart 3.x (Flutter 3.x)
- Client Crypto: Rust 1.x (via flutter_rust_bridge)
- Relay: Go 1.21+ with Khatru framework
- Sidecar: Go 1.21+ (Chi v5 routing) with Rust microservice for MLS

**Primary Dependencies**:
- Client: flutter_rust_bridge, openmls, riverpod, drift, LiveKit Client SDK, flutter_map
- Relay: khatru, nostr, postgres driver
- Sidecar: chi, httpx, gRPC, openmls (Rust)

**Storage**:
- Client: Drift (SQLite) for local cache
- Relay: PostgreSQL for persistent event storage
- Sidecar: In-memory (ephemeral MLS state), optional Postgres for persistence

**Testing**:
- Client: flutter_test, integration tests for crypto
- Relay: Go testing package
- Sidecar: Go testing + Rust tests for MLS operations

**Target Platform**:
- Client: iOS 15+, Android 8+, Web (Flutter Web with WASM crypto)
- Relay/Sidecar: Linux servers (Docker containers)

**Project Type**: Monorepo with client (Flutter/Dart), relay (Go), and sidecar (Go + Rust) in a single repository

**Performance Goals**:
- Map render: <2 seconds with group pins
- Message delivery: <3 seconds average
- Call latency: <300ms for 90% of participants
- PoW computation: 28-bit in <30 seconds on typical devices
- 60fps scrolling for up to 100 cached feed items

**Constraints**:
- Location max precision: geohash level 6 (~1.2km) - NON-NEGOTIABLE
- Display coordinates: 2 decimal places max
- Private keys never leave device
- MLS cipher suite: MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519
- Clock drift: warn at ±30s, reject at ±5 minutes
- Key packages: 7-day expiration, maintain 3-5 active

**Scale/Scope**:
- Initial target: 1,000 concurrent users per operator deployment
- Group call size: 2-50 participants (practical limit)
- Map area: User-centric with ~5-10km initial view

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Requirement | Status | Notes |
|-----------|-------------|--------|-------|
| **Talk First, Meet Later** | Location precision limited to geohash level 6 | ✅ PASS | FR-008, FR-009 enforce max precision |
| **Trust Minimization** | Private keys never transmitted; E2EE for DMs/calls | ✅ PASS | FR-002, FR-021, FR-027 specify |
| **Decentralization** | Federated 4-component architecture | ✅ PASS | Users can switch relays; no central authority |
| **Resource Asymmetry** | Proof of Work for expensive operations | ✅ PASS | PoW targets: 28-bit (group), 24-bit (call init), 12-bit (join) |
| **Location Privacy** | Dual-layer enforcement (client + relay/sidecar) | ✅ PASS | FR-008 (client), relay rejection required |
| **IP Protection** | Sidecar proxies external requests | ✅ PASS | FR-049, FR-050 specify |
| **E2EE - Calls** | MLS with required cipher suite | ✅ PASS | FR-027 specifies exact cipher suite |
| **E2EE - DMs** | NIP-44 encryption in NIP-59 gift wraps | ✅ PASS | FR-021 specifies |
| **Identity Ownership** | Self-sovereign keys; no operator recovery | ✅ PASS | FR-001, FR-002 specify |
| **Data Portability** | Export all user data except private keys | ✅ PASS | FR-054, FR-055, FR-056 specify |
| **Group-Relay Binding** | Group bound to relay where Kind 9007 published | ✅ PASS | Per Constitution §4.5; FR-020 added |
| **Token Security** | Short-lived, single-use, pubkey-bound | ✅ PASS | FR-033, FR-034 specify NIP-98 auth + NIP-59 delivery |
| **MLS Epoch Leader** | First participant manages commits; auto-transfer | ✅ PASS | FR-029 specifies |
| **Ghost Device Detection** | Audit MLS tree for unauthorized keys | ✅ PASS | FR-031 specifies |
| **Bot Identification** | Must identify via Kind 0 or Kind 30078 | ✅ PASS | FR-071 specifies both methods |
| **Clock Synchronization** | Warn at ±30s, reject at ±5m | ✅ PASS | FR-005, FR-006 specify |
| **No Recording** | Call recording not supported | ✅ PASS | Constitution §14; FR-037 implies mute rendering only |
| **Block/Mute Distinction** | Block = public/infra; Mute = private/client | ✅ PASS | FR-038-FR-043 specify |
| **Asymmetric First-Arriver** | Blocker in room = blocked rejected | ✅ PASS | Constitution §16.1; FR-040, FR-041 specify |

**Constitution Gate Result**: ✅ **ALL PASS** - No violations to justify.
**Post-Phase 1 Re-check**: ✅ **ALL PASS** - Design artifacts (data-model.md, contracts/) maintain compliance.

## Project Structure

### Documentation (this feature)

```text
specs/001-geo-social-platform/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   ├── relay-api.yaml   # Nostr relay event formats
│   ├── sidecar-api.yaml # OpenAPI spec for Sidecar endpoints
│   └── mls-state.yaml   # MLS state machine and wire formats
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (monorepo)

**Note**: This is a monorepo with all components in a single repository.

```text
synchrono-city/                 # Root of monorepo
├── CLAUDE.md                    # Project documentation
├── CONSTITUTION.md              # Platform constitution
├── PROTOCOL_SPECIFICATION.md    # Protocol reference
├── specs/                       # Feature specifications
│   └── 001-geo-social-platform/
├── docker-compose.yml           # Development environment
├── .github/                     # CI/CD workflows
│   └── workflows/
│       ├── client-ci.yml
│       ├── relay-ci.yml
│       └── sidecar-ci.yml
│
├── client/                      # Flutter mobile app
│   ├── lib/
│   │   ├── core/
│   │   │   ├── crypto/          # Rust bridge to OpenMLS
│   │   │   ├── models/          # Riverpod providers
│   │   │   ├── database/        # Drift (SQLite) schema
│   │   │   └── network/         # Nostr client, WebSocket
│   │   ├── features/
│   │   │   ├── world/           # Map, groups
│   │   │   ├── chats/           # Messaging
│   │   │   ├── calls/           # LiveKit + MLS
│   │   │   ├── pulse/           # Feed, search
│   │   │   └── settings/        # Profile, config
│   │   └── shared/
│   │       ├── widgets/
│   │       ├── theme/
│   │       └── utils/
│   ├── rust/
│   │   └── src/                # Rust crypto core
│   ├── test/
│   └── pubspec.yaml
│
├── relay/                       # Go Nostr relay
│   ├── cmd/
│   │   └── relay/
│   │       └── main.go
│   ├── pkg/
│   │   ├── storage/            # PostgreSQL backend
│   │   ├── nip29/              # Group logic
│   │   └── synchrono/          # Synchrono-specific
│   ├── migrations/
│   │   └── postgres/
│   └── go.mod
│
├── sidecar/                     # Go API gateway
│   ├── cmd/
│   │   └── sidecar/
│   │       └── main.go
│   ├── internal/
│   │   ├── handlers/           # Chi routes
│   │   ├── mls/                # gRPC client
│   │   ├── livekit/            # LiveKit client
│   │   ├── proxy/              # Blossom/link proxy
│   │   └── webhook/            # NIP-29 webhooks
│   ├── rpc/
│   │   └── mls/
│   │       └── service.proto   # gRPC definitions
│   ├── mls-service/            # Rust MLS microservice
│   │   └── src/
│   │       └── lib.rs          # OpenMLS wrapper
│   │   └── Cargo.toml
│   └── go.mod
│
├── shared/                      # Shared code across components
│   ├── proto/                  # Shared protobuf definitions
│   └── scripts/                # Development utilities
│       ├── dev-setup.sh
│       ├── docker-dev.sh
│       └── test-all.sh
│
└── deployments/                 # Infrastructure as code
    ├── docker/
    │   ├── Dockerfile.client   # Multi-stage for Flutter
    │   ├── Dockerfile.relay
    │   └── Dockerfile.sidecar
    └── kubernetes/
        ├── relay/
        └── sidecar/
```

**Structure Decision**: Monorepo architecture with client, relay, and sidecar in a single repository. Shared CI/CD, tooling, and local development environment via Docker Compose. Each component has its own language-specific build artifacts (pubspec.yaml, go.mod, Cargo.toml).

## Phase 0: Research Questions

The following technical unknowns require research before detailed design:

| ID | Question | Impact | Priority |
|----|----------|--------|----------|
| R001 | Flutter + Rust FFI pattern for MLS operations | Crypto core must be in Rust; efficient bridge critical | P0 |
| R002 | OpenMLS Rust API patterns and lifetime management | MLS state management is complex; errors compromise security | P0 |
| R003 | Khatru NIP-29 extension patterns and plugin architecture | Groups require custom relay logic | P0 |
| R004 | LiveKit Go client library and room management patterns | Token issuance and webhook handling | P0 |
| R005 | NIP-98 HTTP Auth implementation patterns in Go | Sidecar security depends on this | P0 |
| R006 | Efficient PoW mining in Dart/Flutter | UX depends on responsive computation | P1 |
| R007 | Flutter Riverpod architecture patterns for large apps | State management complexity | P1 |
| R008 | Drift (SQLite) schema design for Nostr event caching | Offline-first requirements | P1 |
| R009 | flutter_map performance with dynamic pin clusters | Map UX at spec performance targets | P1 |
| R010 | gRPC interop between Go and Rust for MLS operations | Sidecar microservice communication | P0 |
| R011 | flutter_rust_bridge Web/WASM compilation for crypto | Web client requires WASM-compiled Rust for MLS operations | P0 |

## Complexity Tracking

> No constitutional violations; this section not populated.
