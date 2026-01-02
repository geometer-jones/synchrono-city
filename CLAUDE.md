# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Synchrono City is a decentralized, location-based social platform for group communication (text and voice/video). Users drop pins on a map to start group chats, then can transition to DMs and in-person meetups. Core principles: "Talk first, meet later" - precise location is withheld until established through dialogue.

**Tech Stack:** Nostr protocol (events/signaling) + LiveKit (real-time media SFU) + MLS (end-to-end encryption for calls)

**Reference Implementation Stack:**

| Component | Technology |
|-----------|------------|
| **Client Framework** | Flutter / Dart |
| **Client Crypto/MLS** | Rust Bridge (`flutter_rust_bridge` + `openmls`) |
| **Client State** | Riverpod |
| **Client Database** | Drift (SQLite) |
| **Client Media** | LiveKit Client SDK |
| **Client Map** | flutter_map |
| **Relay Framework** | Khatru (Go) |
| **Relay Storage** | Postgres |
| **Sidecar Language** | Go |
| **Sidecar Framework** | Chi v5 |
| **Sidecar MLS** | Rust Microservice (gRPC + `openmls`) |

**Current State:** This is a specification repository containing protocol documentation. Implementation code is in separate repositories (client, sidecar, relay components).

## Document Architecture

This repository contains the authoritative protocol documentation. The documents have hierarchical relationships:

| Document | Purpose |
|----------|---------|
| `CONSTITUTION.md` | Foundational principles, governance, user rights, privacy constraints |
| `PROTOCOL_SPECIFICATION.md` | Technical protocol details: event formats, NIPs, PoW targets, API contracts, error codes |
| `DEVELOPER_GUIDELINES.md` | Code patterns, security practices, implementation guidance for all developers |
| `CLIENT_IMPLEMENTATION_GUIDE.md` | UX requirements, tab structure (World/Chats/Pulse/Settings), platform specifics |
| `OPERATOR_GUIDE.md` | Deployment procedures, configuration, monitoring for infrastructure operators |

**Important:** When making protocol changes, you must update all affected documents. For example, adding a new event kind requires updates to Protocol Specification and may require updates to Developer Guidelines and Client Implementation Guide.

## Core Architecture: Federated Four-Component System

Synchrono City achieves decentralization through federation. A complete deployment consists of four components operated by a single entity:

```
User Device
    ├──► Nostr Relay (events, signaling)
    ├──► Sidecar (token generation, webhooks, proxying, MLS key authority)
    └──► LiveKit Server (real-time media routing via SFU)
         └──► (Sidecar also proxies to) Blossom Server (media storage)
```

**Trust Boundaries:**
- **Client ↔ Relay:** Operator sees IP, event metadata
- **Client ↔ Sidecar:** Operator sees IP, validates membership
- **Client ↔ LiveKit:** Operator routes encrypted frames (cannot decrypt)
- **Sidecar ↔ External:** Proxied (client IP hidden)
- **Client ↔ Client:** Zero-trust (all content E2EE, verify signatures)

## Critical Security Constraints

### Location Privacy (NON-NEGOTIABLE)
- **Maximum precision:** Geohash level 6 (~1.2km)
- Client MUST NOT transmit location at precision > 6
- Coordinates truncated to 2 decimal places for display
- Location used transiently for discovery, then discarded
- Dual-layer enforcement: client + relay/sidecar rejection

### MLS (Message Layer Security) for Group Calls
- **REQUIRED Cipher Suite:** `MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519`
- Implementations MUST use OpenMLS library (Rust) - do not implement from scratch
- Epoch Leader model: first participant manages commits, leadership transfers on departure
- Ghost Device Detection MANDATORY: audit MLS tree against Kind 39002 (Group Members) for unauthorized keys

### Proof of Work (Resource Asymmetry)
PoW difficulty prevents abuse. Higher cost actions require higher difficulty:

| Action | Kind | Target (Bits) | Rationale |
|--------|------|---------------|-----------|
| Create Group | 9007 | 28 | Highest Cost: Permanent relay storage |
| Call Initiation | 1020 | 24 | High Cost: Persistent root, initializes MLS tree |
| Update Profile | 0 | 20 | Medium Cost: Replaceable storage |
| MLS Key Package | 20022 | 16 | Medium Cost: 7-day storage, crypto validation |
| Join Call | 20002 | 12 | Low Cost: Ephemeral, fast UX required |

Refer to Protocol Specification §6.1 for complete table. Always verify against spec before changing targets.

### Sidecar Token Security
- Tokens single-use, expire in 180 seconds
- Cryptographically bound to user's Nostr pubkey
- Returned via NIP-59 Gift Wrap (not relay)
- Sync delivery: HTTP response, not async

## Event Kinds: Persistent vs Ephemeral

Understanding the distinction is critical:

**Persistent Kinds (stored indefinitely):**
- Kind 1020: Call Initiation (immutable root of call history)
- Kind 1021: Call End (duration record)
- Kind 20022: MLS Key Packages (7-day expiration tag, but persistent storage)
- Kind 20010: DM Call Offer

**Ephemeral Kinds (expire quickly, relay should discard):**
- Kind 20002: Call Join Request (max 1 hour expiration)
- Kind 20003: Call Token Response (delivered via HTTP, not relay)
- Kind 20004/20005: Participant Join/Leave (published by Sidecar)
- Kind 20011/20012: DM Call Answer/Reject

## Active Call Resolution ("Oldest Active Root" Rule)

To prevent split-brain when a group has multiple parallel calls:
1. Query Relay for all Kind 1020 events for the group from last 24 hours
2. Query for all Kind 1021 (Call End) events
3. Discard any Kind 1020 referenced by a Kind 1021 `e` tag
4. Sort remaining by `created_at` ASC
5. The **first (oldest)** event is the Authoritative Active Call

## SpecKit Workflow Commands

This repository uses SpecKit for feature development. Branch naming: `###-feature-name`

| Command | Purpose |
|---------|---------|
| `/speckit.specify` | Create feature specification from user description |
| `/speckit.plan` | Generate implementation plan with research, data-model, contracts |
| `/speckit.tasks` | Break plan into dependency-ordered tasks |
| `/speckit.implement` | Execute implementation tasks |
| `/speckit.checklist` | Generate custom checklist for feature |
| `/speckit.analyze` | Cross-artifact consistency analysis |
| `/speckit.clarify` | Identify underspecified areas via targeted questions |
| `/speckit.constitution` | Update project constitution (`.specify/memory/constitution.md`) |

Feature directories: `specs/###-feature-name/` containing spec.md, plan.md, tasks.md, research.md, data-model.md, quickstart.md, contracts/

## Key NIPs Required

Refer to Protocol Specification §2.1 for authoritative list. Core required NIPs:
- NIP-01: Basic Protocol
- NIP-09: Event Deletion
- NIP-13: Proof of Work
- NIP-17: Private DMs
- NIP-29: Groups (core for "Town Squares")
- NIP-44: Encryption (XChaCha20-Poly1305)
- NIP-51: Lists (mute lists)
- NIP-59: Gift Wraps (REQUIRED for token encryption)
- NIP-78: Application Data (bot identification)
- NIP-98: HTTP Auth (Sidecar API)
- NIP-B7: Blossom (media storage)

## Block vs Mute (Critical Distinction)

| Aspect | Block (Kind 10006) | Mute (Kind 10000) |
|--------|-------------------|-------------------|
| Visibility | **Public** | **Encrypted (private)** |
| Enforcement | **Infrastructure (Sidecar)** | **Client-only** |
| Scope | DMs + Calls | Content filtering |
| Sidecar Action | Rejects join if blocker in room | None |

**Asymmetric First-Arriver Rule for Calls:**
- If User A has blocked User B, and A is in room → B cannot join
- If B is in room, and A attempts to join → A warned, can choose to proceed

## Clock Synchronization Thresholds

| Threshold | Value | Action |
|-----------|-------|--------|
| Warning | ±30 seconds | Show non-blocking warning |
| Refusal | ±5 minutes | Block event creation |

Clients check offset via Sidecar `/health` endpoint `Date` header.

## Common Tasks

### Adding a New Event Kind
1. Update Protocol Specification §3 (Event Kind Registry)
2. Add event format to §4 (Event Formats)
3. Specify PoW target in §6 (if applicable)
4. Update Developer Guidelines with validation rules
5. If user-facing, update Client Implementation Guide

### Modifying Encryption Parameters
1. Update Protocol Specification §5 (Encryption Specifications)
2. Update cipher suite if changing MLS
3. Update Developer Guidelines §3 (Cryptographic Implementation)
4. Update all client integration guides

### Sidecar API Changes
1. Update Protocol Specification §8 (Sidecar API)
2. Add error code to §10 if applicable
3. Update Operator Guide §3 (Configuration)
4. Update Developer Guidelines §5 (Sidecar Integration)

## File Locations

```
.specify/memory/constitution.md       # Project constitution (source of truth)
.specify/templates/                   # SpecKit templates
.specify/scripts/bash/                # SpecKit utility scripts
.claude/commands/speckit.*.md         # Claude Code SpecKit command definitions
.cursor/commands/speckit.*.md         # Cursor IDE SpecKit command definitions
CONSTITUTION.md                       # Human-readable constitution (published)
PROTOCOL_SPECIFICATION.md             # Technical protocol details
DEVELOPER_GUIDELINES.md               # Code patterns and security practices
CLIENT_IMPLEMENTATION_GUIDE.md        # UX requirements and platform specifics
OPERATOR_GUIDE.md                     # Deployment and operations
```

## References to Related Projects

The reference implementations use the following technologies:

- **Client:** Flutter/Dart with `flutter_rust_bridge` to OpenMLS Rust core for MLS, Riverpod for state, Drift (SQLite) for local database, LiveKit Client SDK for media
- **Sidecar:** Go with Chi v5 routing; MLS operations handled by Rust microservice via gRPC using `openmls`
- **Relay:** Khatru (Go framework) with custom NIP-29 group logic and Postgres storage

These implementations reference this specification repository as the source of truth.
