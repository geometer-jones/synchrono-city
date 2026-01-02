# Feature Specification: Synchrono City - Geo-Social Platform Implementation

**Feature Branch**: `001-geo-social-platform`
**Created**: 2025-01-01
**Status**: Draft
**Input**: User description: "read the markdown files in root, we are going to build the geo social platform it describes"

## Overview

Synchrono City is a decentralized, location-based social platform for group communication. Users drop pins on a map to start group chats (text and voice/video), then can transition to DMs and in-person meetups. The core philosophy is "Talk first, meet later" - precise location is withheld until established through dialogue.

The platform achieves decentralization through federation. A complete deployment consists of four components operated by a single entity: Nostr Relay (events/signaling), Sidecar (token generation, webhooks, proxying, MLS key authority, static asset serving), LiveKit Server (real-time media routing via SFU), and Blossom Server (media storage).

The client application supports iOS, Android, and Web platforms, with Web using Flutter Web and WASM-compiled crypto.

## Clarifications

### Session 2025-01-01

- **Q: Which relay is authoritative for a group?** → **A:** The group is bound to the relay where the Kind 9007 (Create Group) event is published. The client must treat that relay as the "home" for that group's messages, membership, and calls (per Constitution §4.5).
- **Q: What is the PoW target for call initiation?** → **A:** Kind 1020 (Call Initiation) requires 24-bit PoW target, distinguishing it from Kind 20002 (Call Join Request) which requires 12-bit.
- **Q: How are bots identified?** → **A:** Both methods are supported for backwards compatibility: (1) `"bot": true` in Kind 0 metadata content, or (2) Kind 30078 with `d` tag "synchrono:bot" (NIP-78).
- **Q: What is the repository structure for the implementation?** → **A:** Monorepo architecture with client (Flutter), relay (Go/Khatru), and sidecar (Go + Rust MLS service) all in this repository. Shared tooling and CI/CD across all components.
- **Q: What are the target platforms for the Flutter client?** → **A:** The Flutter client targets iOS 15+, Android 8+, and Web (via Flutter Web with WASM compilation for crypto).
- **Q: Does the Sidecar have additional responsibilities?** → **A:** Yes, the Sidecar also serves static assets (JavaScript bundles, CSS, images) for the web client, providing asset hosting alongside its API and proxying duties.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Discover and Join Nearby Groups (Priority: P1)

A user opens the app and sees a map centered on their location. They can view nearby groups (represented as pins), preview group details, and join conversations. This is the primary discovery mechanism and the entry point to the platform.

**Why this priority**: This is the core value proposition - location-based discovery enables users to find and participate in local conversations without algorithms or feeds.

**Independent Test**: Can be fully tested by launching the app, viewing the map, tapping on group pins, previewing group information, and joining a group. Delivers the ability to discover and enter local conversations.

**Acceptance Scenarios**:

1. **Given** the app is launched for the first time, **When** the user grants location permission, **Then** the map centers on their location at an appropriate zoom level (showing ~5-10km area)
2. **Given** the map is displayed, **When** groups exist in the visible area, **Then** group pins are displayed on the map with visual indicators for active calls
3. **Given** the user taps a group pin, **When** the group preview card appears, **Then** it displays the group name, description, member count, and active call status
4. **Given** the group preview is displayed, **When** the user taps "Join Group", **Then** they become a member and are taken to the group chat
5. **Given** the user has not granted location permission, **When** they use the app, **Then** they can manually enter a location or search for a place/landmark

---

### User Story 2 - Create a Location-Based Group (Priority: P1)

A user wants to start a community around a specific location. They drop a pin on the map, name their group, add a description, set privacy level, and publish the group to the network.

**Why this priority**: Without the ability to create groups, the platform would have no content. Group creation is the primary content generation mechanism.

**Independent Test**: Can be fully tested by tapping the "Create Group" button, selecting a location on the map, entering group details, and successfully publishing. Delivers the ability to create a persistent group anchored to a location.

**Acceptance Scenarios**:

1. **Given** the user is on the World tab, **When** they tap the create button, **Then** they are prompted to select a location on the map
2. **Given** the user has tapped a location on the map, **When** the location is selected, **Then** coordinates are truncated to ~1.2km precision and the group details form appears
3. **Given** the group details form is displayed, **When** the user enters a name (3-50 chars), optional description, and selects privacy level, **Then** these values are validated and accepted
4. **Given** the user taps "Create Group", **When** proof-of-work computation completes (28-bit target), **Then** the group is published to the current relay as Kind 9007, which becomes the authoritative "home" relay for that group
5. **Given** the group is created, **When** creation completes, **Then** the user is taken to the new group's chat view

---

### User Story 3 - Send and Receive Group Messages (Priority: P1)

Users in a group can exchange text messages in real-time. Messages are displayed chronologically with sender identification and timestamps.

**Why this priority**: Text chat is the foundation of group communication. Without messaging, groups have no purpose.

**Independent Test**: Can be fully tested by joining a group, sending text messages, and receiving messages from other participants. Delivers basic group communication functionality.

**Acceptance Scenarios**:

1. **Given** the user is a group member, **When** they type a message and tap send, **Then** the message appears in the chat for all members
2. **Given** the user is viewing a group chat, **When** another member sends a message, **Then** it appears in the conversation in real-time
3. **Given** the user is offline, **When** another member sends messages, **Then** the messages are received and displayed when the user reconnects
4. **Given** the user is in the chat view, **When** they long-press a message, **Then** actions appear (reply, react, copy for own messages, delete for own messages)

---

### User Story 4 - Start and Join Group Voice/Video Calls (Priority: P1)

Group members can initiate real-time voice and video calls within a group. Other members can join the ongoing call. Calls are end-to-end encrypted using MLS (Message Layer Security).

**Why this priority**: Real-time communication is a core differentiator. The ability to seamlessly transition from text to voice/video creates richer social connections.

**Independent Test**: Can be fully tested by initiating a call in a group, connecting to the LiveKit SFU, and having another participant join. Delivers multi-person encrypted voice/video communication.

**Acceptance Scenarios**:

1. **Given** the user is viewing a group chat, **When** they tap the Call button and select voice or video, **Then** a Kind 1020 event is published with 24-bit PoW to initiate the call and they are connected as the first participant (Epoch Leader)
2. **Given** an active call exists in a group, **When** another member taps the Call button, **Then** they join the existing call rather than creating a new one (using Kind 20002 with 12-bit PoW)
3. **Given** the user is in a call, **When** another participant joins, **Then** their audio/video appears and the participant list updates
4. **Given** the user is in a call, **When** they toggle mute, video, or leave the call, **Then** the changes are reflected for all participants
5. **Given** the user is in a call, **When** the last participant leaves, **Then** the call ends and a Call End event is recorded

---

### User Story 5 - Send and Receive Direct Messages (Priority: P2)

Users can send private, end-to-end encrypted direct messages to other users. DMs are separate from group conversations and use NIP-44 encryption.

**Why this priority**: Private messaging enables users to build individual relationships after connecting in groups. This is secondary to group communication but essential for the "talk first, meet later" philosophy.

**Independent Test**: Can be fully tested by selecting a user from their profile, composing a message, and sending. Delivers encrypted 1:1 communication.

**Acceptance Scenarios**:

1. **Given** the user is viewing another user's profile, **When** they tap "Message", **Then** a DM conversation is opened or created
2. **Given** the user is in a DM conversation, **When** they send a message, **Then** it is encrypted with NIP-44 and delivered to the recipient
3. **Given** the user receives a DM, **When** the message arrives, **Then** it is decrypted and displayed in the Chats list with a notification
4. **Given** the user has DM conversations, **When** they view the Chats tab, **Then** DMs and group chats are unified in a single inbox sorted by recent activity

---

### User Story 6 - Start and Join DM Voice/Video Calls (Priority: P2)

Users can initiate 1:1 voice/video calls with other users. Calls are end-to-end encrypted using MLS with a two-party group.

**Why this priority**: Private calls enable deeper individual connection. This builds on DM functionality and is secondary to group calls.

**Independent Test**: Can be fully tested by initiating a call from a DM conversation, having the recipient accept, and verifying audio/video in both directions.

**Acceptance Scenarios**:

1. **Given** the user is in a DM conversation, **When** they tap the Call button, **Then** a call offer is sent to the recipient
2. **Given** the recipient receives a call offer, **When** they are not already in a call, **Then** a full-screen incoming call UI appears with caller info
3. **Given** the incoming call UI is displayed, **When** the recipient taps Accept, **Then** both parties connect to LiveKit and exchange MLS keys
4. **Given** the incoming call UI is displayed, **When** the recipient taps Decline, **Then** a rejection is sent and the caller is notified
5. **Given** either party ends the call, **Then** a Call End event is published recording the duration

---

### User Story 7 - Manage User Profile and Identity (Priority: P2)

Users can create and manage their profile including display name, username, about text, profile picture, website, and NIP-05 identifier. The profile is stored as a Kind 0 event.

**Why this priority**: Profile identity enables users to present themselves and build reputation. This is secondary to core communication features.

**Independent Test**: Can be fully tested by navigating to Settings > Profile, editing fields, uploading an avatar, and saving. Delivers a persistent user identity.

**Acceptance Scenarios**:

1. **Given** the user is a new user, **When** they first open the app, **Then** they are prompted to create a profile with at least a display name
2. **Given** the user is in the profile editor, **When** they enter a display name (3-50 chars), username, and optional details, **Then** the values are validated
3. **Given** the user selects a profile image, **When** they upload it, **Then** the image is proxied through Sidecar to Blossom and the content-addressed URL is stored in their profile
4. **Given** the user saves their profile, **When** the save completes, **Then** a Kind 0 event with PoW (20-bit target) is published to relays
5. **Given** another user views their profile, **When** the profile loads, **Then** it displays the latest published information including avatar and all fields

---

### User Story 8 - Manage Network Connections (Relays) (Priority: P3)

Users can configure which relays they connect to. The app includes a hardcoded seed relay for initial bootstrapping, but users can add, remove, and configure relay preferences.

**Why this priority**: Relay configuration is important for power users and decentralization, but the seed relay provides default functionality. This is tertiary to core features.

**Independent Test**: Can be fully tested by navigating to Settings > Relays, adding a new relay URL, and verifying connection status.

**Acceptance Scenarios**:

1. **Given** the user launches the app for the first time, **When** the app initializes, **Then** it connects to the hardcoded seed relay
2. **Given** the user is in the relay settings, **When** they add a valid relay URL (wss://), **Then** the app attempts to connect and displays connection status
3. **Given** a relay is added, **When** the relay supports Synchrono City (NIP-11 synchrono_city object), **Then** full features are enabled for that relay
4. **Given** a relay connection fails, **When** the error occurs, **Then** the relay is marked as disconnected with a retry option
5. **Given** the user removes a relay, **When** the removal completes, **Then** the app disconnects and updates the Kind 10002 Relay List event

---

### User Story 9 - Block and Mute Other Users (Priority: P2)

Users can block other users (public list, infrastructure-enforced) or mute them (private list, client-only). Blocked users cannot join calls the blocker is in. Muted users' content is hidden locally.

**Why this priority**: User safety and control are essential. Block/mute features enable users to curate their experience and avoid harassment.

**Independent Test**: Can be fully tested by blocking/muting a user and verifying that their content is hidden and interactions are prevented.

**Acceptance Scenarios**:

1. **Given** the user is viewing another user's profile or a message, **When** they select "Block", **Then** the user is added to their public Block List (Kind 10006) with PoW
2. **Given** the user has blocked someone, **When** the blocked user tries to join a call they're in, **Then** the Sidecar rejects the join request
3. **Given** the user is in a call, **When** they try to join and someone they blocked is already present, **Then** they are warned and can choose to proceed or cancel
4. **Given** the user selects "Mute" for another user, **When** the mute is applied, **Then** the user is added to their private Mute List (Kind 10000 encrypted)
5. **Given** the user has muted someone, **When** the muted user posts content, **Then** it is hidden from feeds and chats, and in calls they appear as silence/black screen

---

### User Story 10 - Export and Import User Data (Priority: P3)

Users can export their profile, contacts, relay preferences, mute/block lists, posts, and DMs. They can also import their data to a new device or client. This ensures data portability.

**Why this priority**: Data portability is important for user sovereignty but is not required for core functionality. This is tertiary.

**Independent Test**: Can be fully tested by initiating an export, receiving the data file, and importing it to a fresh installation.

**Acceptance Scenarios**:

1. **Given** the user is in Settings > Export Data, **When** they select data categories and tap Export, **Then** a JSON file containing their selected data is generated and downloaded
2. **Given** the export completes, **When** the user opens the file, **Then** it contains their profile (Kind 0), contacts (Kind 3), relays (Kind 10002), mutes (Kind 10000), blocks (Kind 10006), and their own posts
3. **Given** a user has encrypted DMs, **When** exporting, **Then** the DMs are included in encrypted form, readable only with the user's private key
4. **Given** a user on a new device, **When** they import their data file and provide their private key, **Then** their profile, contacts, relays, and preferences are restored

---

### User Story 11 - Browse Public Content Feed (Priority: P3)

Users can browse a feed of public posts from people they follow and from the global network. This is the "Pulse" tab - a content discovery mechanism beyond location-based groups.

**Why this priority**: The feed enables broader network discovery but is secondary to the location-based group model. This is tertiary.

**Independent Test**: Can be fully tested by navigating to the Pulse tab and viewing posts from followed users and global content.

**Acceptance Scenarios**:

1. **Given** the user navigates to the Pulse tab, **When** the feed loads, **Then** public posts (Kind 1) from followed users appear in reverse chronological order
2. **Given** the user taps the "Global" tab, **When** the global feed loads, **Then** public posts from across the connected relays are displayed
3. **Given** the user views a post, **When** they interact (reply, repost, react), **Then** the corresponding event is published to relays
4. **Given** the user taps the compose button, **When** they create a post, **Then** it is published as a Kind 1 event and appears in their feed and followers' feeds

---

### User Story 12 - Search for Users and Content (Priority: P3)

Users can search for other users by name/username, search for content by hashtags or free text, and look up users by their public key (npub).

**Why this priority**: Search enables active discovery but is not required for core functionality. This is tertiary.

**Independent Test**: Can be fully tested by entering search queries and verifying results include relevant users and content.

**Acceptance Scenarios**:

1. **Given** the user taps the search icon, **When** they enter a username prefixed with "@", **Then** user profiles matching the name appear in results
2. **Given** the user enters a hashtag, **When** they search, **Then** posts containing that hashtag appear in results
3. **Given** the user enters an npub, **When** they search, **Then** the exact user profile is displayed
4. **Given** the user enters free text, **When** they search, **Then** relevant posts are displayed if the relay supports full-text search

---

### Edge Cases

- **Location permission denied**: User can manually enter location or search for landmarks; map remains functional but does not auto-center
- **No internet connectivity**: Offline mode displays cached content; outgoing operations are queued; user is notified of offline status
- **Clock desynchronization**: When device clock is off by >±30 seconds, user is warned; when off by >±5 minutes, event creation is blocked
- **Low-density location**: When geohash precision 6 (~1.2km) could expose a specific residence (rural areas), user is warned and offered to reduce precision or select a landmark
- **Relay connection failure**: App gracefully degrades; seed relay provides backup; user can manually configure alternative relays
- **Sidecar unavailable**: Group calls cannot be initiated or joined; text messaging remains functional
- **LiveKit connection failure**: Active calls are terminated; user can rejoin when connectivity returns; call state is recovered via relay events
- **MLS epoch mismatch**: Client fetches current MLS state from Sidecar and resynchronizes; user sees "Reconnecting..." message
- **Ghost device detected**: Client alerts user to unauthorized key in MLS tree and offers to leave call for security
- **Blocked user in call**: If blocker is in room, blocked user cannot join; if blocked user is in room, blocker is warned and can choose to proceed
- **PoW computation timeout**: If mining takes too long, user can cancel; partial progress is cached for retry
- **Key package expiration**: Client auto-refreshes Key Packages before 7-day expiration; maintains 3-5 active packages
- **Group deletion**: Group admin can delete group via Kind 9008; relay removes group metadata; historical events may persist on other relays
- **Simultaneous call creation**: Multiple users may initiate calls simultaneously; "Oldest Active Root" rule determines which call is authoritative

## Requirements *(mandatory)*

### Functional Requirements

**Identity and Cryptography**
- **FR-001**: System MUST generate a cryptographic identity (secp256k1 keypair) for each user on first launch
- **FR-002**: System MUST store private keys in platform-appropriate secure storage (Keychain on iOS, Keystore on Android) and never transmit them over the network
- **FR-003**: System MUST sign all Nostr events locally before transmission using the user's private key
- **FR-004**: System MUST validate signatures on all received events before processing
- **FR-005**: System MUST check clock synchronization on app launch and warn when drift exceeds ±30 seconds
- **FR-006**: System MUST refuse to create events when clock drift exceeds ±5 minutes

**Location and Map**
- **FR-007**: System MUST request location permission with clear explanation of usage
- **FR-008**: System MUST NEVER transmit location at precision greater than geohash level 6 (~1.2km)
- **FR-009**: System MUST truncate display coordinates to 2 decimal places (~1.1km)
- **FR-010**: System MUST use location transiently for discovery and immediately discard after fetching relevant content
- **FR-011**: System MUST provide manual location entry option (search for address/landmark or enter coordinates)
- **FR-012**: System MUST display low-density warning when geohash precision 6 could expose a specific residence

**Group Management**
- **FR-013**: System MUST allow users to create groups with a name, description, geohash-encoded location, and privacy level
- **FR-014**: System MUST compute Proof of Work (28-bit target) for group creation (Kind 9007) before publishing to the current relay, which becomes the authoritative "home" relay for that group
- **FR-015**: System MUST publish group metadata to the authoritative relay as Kind 39000 events
- **FR-016**: System MUST query for groups within visible map area using geohash prefix matching
- **FR-017**: System MUST display group pins on map with visual indicators for active calls and membership status
- **FR-018**: System MUST allow users to join public groups without approval
- **FR-019**: System MUST handle private groups requiring admin approval for membership
- **FR-020**: System MUST connect to the group's authoritative relay (where Kind 9007 was published) for all group operations (messages, calls, membership)

**Messaging**
- **FR-021**: System MUST allow sending text messages to groups (Kind 1 with `h` tag)
- **FR-022**: System MUST allow sending encrypted direct messages using NIP-44 wrapping in NIP-59 Gift Wraps
- **FR-023**: System MUST display messages in chronological order with sender identification and timestamps
- **FR-024**: System MUST support message replies with proper threading references (`e` and `p` tags)
- **FR-025**: System MUST queue outgoing messages when offline and send when connection is restored
- **FR-026**: System MUST support message reactions (Kind 7) with emoji selection

**Voice/Video Calling**
- **FR-027**: System MUST support group voice/video calls using LiveKit SFU for media routing
- **FR-028**: System MUST use MLS (Message Layer Security, RFC 9420) with cipher suite MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519 for end-to-end call encryption
- **FR-029**: System MUST derive LiveKit frame encryption keys from MLS exporter secret using label "synchrono-city-frame-key"
- **FR-030**: System MUST implement Epoch Leader model where first participant manages MLS commits
- **FR-031**: System MUST maintain 3-5 active MLS Key Packages (Kind 30022) and refresh before 7-day expiration
- **FR-032**: System MUST audit MLS tree for unauthorized keys ("ghost devices") and alert user if detected
- **FR-033**: System MUST initiate group calls by publishing Kind 1020 with 24-bit PoW target
- **FR-034**: System MUST support call join requests via Kind 20002 with 12-bit PoW
- **FR-035**: System MUST obtain LiveKit tokens from Sidecar via POST /token/group or /token/dm
- **FR-036**: System MUST deliver tokens wrapped in NIP-59 Gift Wraps (Kind 1059)
- **FR-037**: System MUST implement "Oldest Active Root" rule to resolve multiple parallel calls in a group
- **FR-038**: System MUST support screen sharing with visual indicator to all participants
- **FR-039**: System MUST render muted participants as silence (audio) and black frame (video)

**Block and Mute**
- **FR-040**: System MUST support public Block Lists (Kind 10006) for infrastructure enforcement
- **FR-041**: System MUST support private Mute Lists (Kind 10000 encrypted) for client-side content filtering
- **FR-042**: System MUST warn user before joining a call where a blocked user is present
- **FR-043**: System MUST prevent blocked users from joining calls the blocker is already in (enforced by Sidecar)
- **FR-044**: System MUST hide muted users' content from feeds and chats
- **FR-045**: System MUST notify Sidecar of block list updates (publish Kind 10006 with 12-bit PoW)

**Relay and Network**
- **FR-046**: System MUST include a hardcoded seed relay for initial bootstrapping
- **FR-047**: System MUST allow users to add, remove, and configure relay connections
- **FR-048**: System MUST publish relay preferences as Kind 10002 (Relay List)
- **FR-049**: System MUST check NIP-11 relay information for synchrono_city support
- **FR-050**: System MUST gracefully handle relay connection failures with retry logic
- **FR-051**: System MUST proxy all external requests (Blossom uploads, link previews) through Sidecar to hide user IP
- **FR-052**: System MUST authenticate all Sidecar requests using NIP-98 HTTP Auth

**Profile and Settings**
- **FR-053**: System MUST allow users to set display name, username, about text, picture URL, website, and NIP-05 identifier
- **FR-054**: System MUST publish profile as Kind 0 event with 20-bit PoW
- **FR-055**: System MUST support profile picture upload via Sidecar proxy to Blossom
- **FR-056**: System MUST allow users to export profile, contacts, relays, mute/block lists, posts, and DMs
- **FR-057**: System MUST allow users to import data from a JSON export file
- **FR-058**: System MUST NOT allow exporting private keys (must use separate backup mechanism)

**Content Feed**
- **FR-059**: System MUST display a feed of public posts (Kind 1) from followed users
- **FR-060**: System MUST support global feed from all connected relays
- **FR-061**: System MUST support post interactions: reply (Kind 1 with `e` tag), repost (Kind 6), react (Kind 7)
- **FR-062**: System MUST support media attachments (images, audio, video) via Kind 1063 File Metadata

**Search**
- **FR-063**: System MUST support searching for users by name (Kind 0 `name` field)
- **FR-064**: System MUST support searching for content by hashtags (Kind 1 `t` tag)
- **FR-065**: System MUST support direct lookup by public key (npub bech32 format)
- **FR-066**: System MUST display recent searches and trending topics in the user's area

**Error Handling**
- **FR-067**: System MUST display user-friendly error messages for all error codes defined in Protocol Specification §10
- **FR-068**: System MUST implement exponential backoff for retryable errors
- **FR-069**: System MUST recover MLS state after MLS_EPOCH_MISMATCH by fetching /mls/state/{room_id}
- **FR-070**: System MUST handle "Zombie Room" scenario (connect to LiveKit but no MLS Welcome within 5 seconds)

**Bot Identification**
- **FR-071**: System MUST identify bots by checking for `"bot": true` in Kind 0 metadata content OR Kind 30078 with `d` tag "synchrono:bot" (NIP-78)
- **FR-072**: System MUST display "Bot" badge on bot profiles and "Automated" label on bot posts

**Push Notifications**
- **FR-073**: System MUST support push notifications for new DMs, group mentions, incoming calls, missed calls, and group invites
- **FR-074**: System MUST use generic notifications ("New message") when encrypted push is unavailable, fetching details locally

**Static Assets (Web Client)**
- **FR-075**: System MUST serve static assets (HTML, JavaScript bundles, CSS, images) via Sidecar for the web client
- **FR-076**: System MUST support cache-control headers for static assets with appropriate ETags for versioning
- **FR-077**: System MUST support Service Worker registration for offline-capable web experience

### Key Entities

**User**
- Represents a participant on the platform
- Attributes: public key (npub), display name, username, about text, profile picture URL, website, NIP-05 identifier, bot status
- Relationships: belongs to many groups, follows many users, has many DM conversations

**Group**
- Represents a location-anchored community
- Attributes: group ID, name, description, geohash (max precision 6), display coordinates, privacy level (public/private), creation timestamp, authoritative relay URL (the relay where Kind 9007 was published)
- Relationships: has many members, has many messages, may have active call, bound to authoritative relay for all group operations

**Message**
- Represents a text communication in a group or DM
- Attributes: event ID, content, timestamp, author pubkey, parent event ID (for replies)
- Relationships: belongs to group or DM conversation, authored by user

**Call**
- Represents a real-time voice/video session
- Attributes: call ID (Kind 1020 event ID), group ID or DM participants, creation timestamp, active status, epoch leader pubkey
- Relationships: belongs to group or is DM between two users, has many participants

**Call Participant**
- Represents a user's presence in a call
- Attributes: participant pubkey, join timestamp, mute state, video state, screen sharing state
- Relationships: belongs to call, represents user

**Key Package**
- Represents an MLS encryption key package
- Attributes: package ID, public key data, expiration timestamp (7 days)
- Relationships: owned by user, used by others to add user to MLS group

**Block List**
- Public list of users the account has blocked
- Attributes: list of blocked pubkeys
- Relationships: owned by user, enforced by Sidecar for calls

**Mute List**
- Private encrypted list of users whose content is hidden
- Attributes: list of muted pubkeys (encrypted)
- Relationships: owned by user, enforced only by client

**Relay**
- Represents a Nostr relay server connection
- Attributes: URL, connection status, latency, supported features, permissions (read/write/sync)
- Relationships: used by user, hosts groups

**Media File**
- Represents uploaded content via Blossom
- Attributes: SHA-256 hash, URL, MIME type, size, upload timestamp
- Relationships: uploaded by user, attached to message or profile

## Success Criteria *(mandatory)*

### Measurable Outcomes

**Core Functionality**
- **SC-001**: Users can complete first-time onboarding (key generation, profile creation, relay connection) in under 2 minutes
- **SC-002**: Users can discover and join a nearby group within 30 seconds of app launch
- **SC-003**: Users can create a new group with location, name, and description in under 1 minute
- **SC-004**: Group messages are delivered to all members within 3 seconds on average
- **SC-005**: Group calls can be initiated and the first participant connected within 10 seconds

**Call Quality**
- **SC-006**: Voice/video calls maintain acceptable quality with latency under 300ms for 90% of participants
- **SC-007**: Users can join an ongoing group call within 5 seconds
- **SC-008**: Call setup success rate exceeds 95% for users with adequate connectivity

**Privacy and Security**
- **SC-009**: Location is never transmitted or stored at precision greater than geohash level 6 (~1.2km)
- **SC-010**: Private keys are never transmitted over the network or stored in plaintext
- **SC-011**: MLS key packages are refreshed before expiration at least 99% of the time
- **SC-012**: Ghost device detection alerts users to unauthorized keys within 1 second of MLS tree sync

**Reliability**
- **SC-013**: App remains functional with cached content when offline for up to 24 hours
- **SC-014**: Queued messages are sent within 5 seconds of reconnection
- **SC-015**: App recovers from temporary relay disconnection without user intervention
- **SC-016**: MLS state recovery succeeds within 3 seconds after epoch mismatch

**User Experience**
- **SC-017**: 90% of users successfully create their first group without errors
- **SC-018**: 90% of users successfully join their first call without assistance
- **SC-019**: Block/mute features are discoverable and usable within 3 taps from any content view
- **SC-020**: Data export completes within 10 seconds for typical user accounts

**Performance**
- **SC-021**: Map renders with group pins within 2 seconds of location acquisition
- **SC-022**: PoW computation for group creation (28-bit) completes within 30 seconds on typical devices
- **SC-023**: Feed scrolls smoothly with 60fps rendering for up to 100 cached items
- **SC-024**: Search returns results within 2 seconds for user lookups

**Decentralization**
- **SC-025**: Users can switch to an alternative relay and maintain full functionality
- **SC-026**: Users can export their data and import to a different client implementation
- **SC-027**: Block lists are public and enforceable by any compliant Sidecar implementation
