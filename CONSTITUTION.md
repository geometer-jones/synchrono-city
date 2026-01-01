# Synchrono City Constitution

> The foundational principles, constraints, and rules governing the Synchrono City platform.

**Version:** 1.0.0

---

## 1. CORE PHILOSOPHY

### 1.1 Mission Statement

Synchrono City exists to enable authentic human connection through place-based conversation.

### 1.2 Guiding Principles

1. **Talk First, Meet Later** — Precise location is withheld by the protocol until established through dialogue.
2. **Trust Minimization** — Infrastructure is untrusted by default. The architecture prevents operators from accessing private content and retains no data beyond operational necessity.
3. **Decentralization Through Federation** — No single entity controls the network. Users choose their infrastructure; operators compete on trust and performance.
4. **Resource Asymmetry** — The cost to utilize the network must be proportional to the burden imposed. Proof of Work protects the commons from abuse.

### 1.3 Threat Model

Synchrono City protects conversation content from network observers and infrastructure operators. The system is designed to defend against:

- **Passive network observers** (ISPs, public WiFi operators, network-level surveillance)
- **Honest-but-curious operators** (infrastructure providers who follow the protocol but may attempt to learn user information)
- **Other users** attempting surveillance or correlation attacks

The system does **not** protect against:

- **Compromised client devices** — A device with malware or unauthorized access can observe all user activity
- **Participants who record** — Other call participants may use external software to record; the platform cannot prevent this
- **State-level adversaries** with endpoint access or legal authority to compel cooperation
- **Traffic Analysis** — An observer of the Relay/Sidecar can infer who is talking to whom based on packet timing and size, even if content is encrypted.
- **Malicious operators who modify code** — Users can verify open-source implementations, but most will not

Users requiring protection against state-level adversaries or targeted attacks should employ additional operational security measures beyond this platform.

### 1.4 Physical Agency

The platform provides digital signals for connection but assumes no responsibility for physical interactions. Users bear sole responsibility for vetting safety before transitioning from digital dialogue to physical proximity.

---

## 2. PRIVACY FIRST

### 2.1 Location Privacy

- **Collection:** User locations are NEVER stored or transmitted at a precision greater than geohash level 6 (~1.2km).
- **Storage:** The system SHALL NOT track, store, or transmit user movement patterns.
- **Usage:** Location data is used exclusively for fetching relevant content within the visible map area.

**Geohash Constraints:**
- Precision 4: ~39km — Regional discovery
- Precision 5: ~5km — Neighborhood discovery
- Precision 6: ~1.2km — Local discovery (MAXIMUM for all contexts)

All location data—whether for users, groups, or venues—MUST NOT exceed geohash precision 6. User location is never stored; it is used transiently for content discovery and immediately discarded.

**Density Risk & User Agency:**
The platform enforces a uniform maximum precision (Level 6). In low-density (rural) environments, this precision may inherently expose a specific residence. Users in such environments bear the responsibility to manually reduce their pin accuracy or select a generic local landmark rather than their physical coordinates.

**Dual-Layer Enforcement:**
- Client MUST NOT transmit location at geohash precision > 6
- Relay/Sidecar SHOULD reject events with geohash precision > 6

### 2.2 Identity Privacy

| Data Type | Protection |
|-----------|------------|
| Private Keys | Device-only secure storage; never transmitted |
| DM Content | End-to-end encrypted |
| Call Content | End-to-end encrypted (MLS + LiveKit frame encryption) |
| Metadata | Minimized; no analytics on conversation patterns |
| IP Addresses | Protected via Sidecar proxy for external requests |

### 2.3 Metadata Limitations

NIP-29 groups inherently expose certain metadata to relays:
- Group membership lists
- Join/leave event timing
- Admin lists

Users SHOULD be informed that group participation creates observable metadata, even though message content remains protected.

### 2.4 IP Address Protection

**Trust Model:**
- Relay Operator: Sees user IP (trusted by choice of relay)
- Sidecar Operator: Sees user IP (same operator as relay)
- LiveKit Operator: Sees user IP (same operator as relay)
- External Services: No (proxied)
- Other Call Participants: No (SFU architecture)

**Proxied Requests (via Sidecar):**
- Link preview fetches
- Media uploads/downloads to external hosts
- NIP-05 verification
- Profile picture fetches
- Blossom server requests

**Sidecar Proxy Requirements:**
- MUST strip client IP from forwarded requests
- MUST NOT log client IPs with request content
- MAY log aggregate request counts for rate limiting
- SHOULD cache common resources to reduce external requests

### 2.5 Financial Privacy

If an Operator requires payment for access, they SHOULD support payment methods that do not forcibly link a real-world identity to a user's Nostr public key (e.g., Lightning Network, Chaumian E-Cash).

---

## 3. USER SOVEREIGNTY

### 3.1 Identity Ownership

User identity is self-sovereign. Private keys are generated and stored on user devices. No operator, relay, or service provider holds or can recover user keys.

Users own their cryptographic identity absolutely. Loss of private keys results in permanent loss of identity; this is an intentional tradeoff for true self-sovereignty.

### 3.2 Data Portability

Users MAY export at any time:
- Profile data
- Contact list
- Relay preferences
- Mute and block lists
- Own authored messages
- Own uploaded media

Users MAY NOT export via the application:
- Private keys (must use external backup mechanisms)
- Other users' content
- Call recordings (not stored)

### 3.3 Right to Departure

Users MAY leave the platform at any time by:
- Ceasing to use the application
- Deleting local data
- Requesting event deletion from relays (relays SHOULD honor kind 5 deletion requests)

Complete departure does not require operator cooperation. Users can simply stop participating.

**Event Deletion:**
Users MAY request deletion of their authored events by publishing Kind 5 deletion events per NIP-09. Relays SHOULD honor these requests by removing the referenced events from storage and ceasing to serve them to other clients. Deletion is a best-effort operation; federated copies on other relays or client caches may persist.

### 3.4 Failure Resilience

User identity is independent of any operator. Users MUST NOT lose access to their identity due to single-operator failure.

Group membership and message history are bound to the hosting relay. Users accept that relay failure may result in loss of group access and history. This tradeoff enables simplicity and clear authority in the federation model.

### 3.5 Automated Agents

Automated participants (bots) MUST identify themselves clearly to enable user awareness and infrastructure policy enforcement.

**Identification Requirements:**
- Bots MUST set the `bot` field to `true` in their Kind 0 (Metadata) event, OR
- Bots MUST publish a NIP-78 Application-Specific Data event (Kind 30078) with `d` tag `synchrono:bot` containing bot metadata

**Behavioral Constraints:**
- Bots MUST NOT occupy LiveKit room slots solely to record or consume bandwidth without interactive purpose.
- Bots MUST NOT impersonate human users.
- Operators MAY impose additional restrictions on bot participation.

---

## 4. FEDERATION MODEL

### 4.1 Decentralization Philosophy

Synchrono City achieves decentralization through federation rather than pure peer-to-peer architecture. Real-time media requires infrastructure, but no single operator controls the network.

### 4.2 Operator Independence

Any entity MAY operate Synchrono City infrastructure by running:
- Nostr Relay (event storage and distribution)
- Sidecar (token generation, webhooks, proxying, MLS key authority)
- LiveKit Server (real-time media routing)
- Blossom Server (media file storage)

All components are open source.


### 4.4 Operator Responsibilities

**Operators MUST:**
- Run open-source, unmodified protocol implementations
- Not log or store decrypted content
- Publish their relay/Sidecar/Blossom endpoints for client discovery
- Publish a written policy stating their jurisdiction and data practices

**Operators MAY:**
- Set their own rate limits and resource constraints
- Require payment or authentication for access
- Federate or not federate with other operators
- Publish transparency reports

### 4.5 Group-Relay Binding & Continuity

Each NIP-29 group is currently bound to exactly one relay. This relay serves as the authoritative source for group membership, metadata, and messages.

**Right of Continuity:**
While current technical constraints bind a group to a single relay, the Constitution recognizes the Right of Community Continuity. Future protocol specifications MUST prioritize mechanisms for portable group identities that survive single-operator failure.

**Sidecar Authority:**
The associated Sidecar instance is authoritative for:
- LiveKit token issuance for group calls
- MLS state management for group calls
- Participant validation via webhooks

### 4.6 Operator Economic Rights

To ensure network sustainability, Operators possess the **Right to Sustainment**.

**Monetization:**
Operators MAY condition access to resources (bandwidth, storage, relay admission) upon payment or subscription.

**Financial Privacy:**
If payment is required, Operators MUST offer payment methods that do not forcibly link a real-world financial identity (e.g., Credit Card name) to the user's cryptographic identity (Nostr Pubkey). Recommended standards include Lightning Network or Chaumian E-Cash.

---

## 5. REAL-TIME INFRASTRUCTURE

### 5.1 Architecture Principles
The platform relies on a federated infrastructure to route real-time media. This infrastructure must operate on a "Trust Minimization" basis:

- **Media Routing Authority (SFU):** Media is routed through a Selective Forwarding Unit (e.g., LiveKit) to protect participant IP addresses from each other.
- **No Peer-to-Peer Leaks:** The SFU routes encrypted packets without having access to the decryption keys.
- **Ephemeral Access:** Access tokens for media rooms must be short-lived, single-use, and bound to a specific cryptographic identity.

### 5.2 Token Security
To prevent unauthorized surveillance or "room bombing":
- **Server Authority:** Only a trusted Sidecar may issue access tokens; clients cannot self-issue.
- **Identity Binding:** Tokens must be cryptographically bound to the user's public key.
- **Strict Expiry:** Tokens must expire immediately after use or within a negligible time window.
- **Synchronous Delivery:** Tokens are returned directly in the encrypted HTTP response. This eliminates relay dependency and ensures reliable delivery.

### 5.3 State Ephemerality
Call signalling events (join requests, handshakes) are ephemeral. Infrastructure operators MUST delete these events promptly after their utility expires to prevent long-term metadata leakage.

---

## 6. END-TO-END ENCRYPTION (E2EE)

### 6.1 Encryption Principles
All private communications (DMs, Calls, Private Groups) MUST be end-to-end encrypted. Infrastructure operators MUST NOT possess the keys required to decrypt content.

### 6.2 Group Key Authority

For group calls, encryption key management follows a **distributed leadership** model:

**Epoch Leader:**
- The first participant to join a call becomes the "Epoch Leader" responsible for issuing MLS commits.
- The Sidecar facilitates MLS operations (distributing welcomes, routing commits) but does not possess private key material.
- When the Epoch Leader departs, leadership automatically transfers to the longest-present participant.

**Leadership Transfer:**
- On clean departure: The Epoch Leader issues a final commit removing themselves before disconnecting.
- On unexpected disconnection: The Sidecar detects departure via webhook and assigns leadership to the next eligible participant.
- On admin action: Group administrators MAY force leadership transfer or remove the current leader at any time.

**Auditability:**
Clients reserve the right to audit the group membership list. If a client detects an unauthorized key or "ghost device" in the encryption group that does not match a known participant, the client MUST alert the user and MAY terminate the connection.

### 6.3 Resource Asymmetry (Proof of Work)
To prevent encryption-layer denial of service (flooding the Sidecar with key requests), clients MUST attach Proof of Work (NIP-13) to cryptographic handshake events.

---

## 7. MEDIA STORAGE (BLOSSOM)

### 7.1 Overview

Synchrono City uses Blossom for content-addressed media file storage with Nostr authentication.

### 7.2 Architecture Principles

All Blossom requests MUST be proxied through Sidecar to protect user IP addresses.

Blossom servers accept only approved media types (images, audio, video, PDF). Executable files, archives, and scripts are prohibited. The Protocol Specification defines the complete allowlist.

### 7.3 Privacy Considerations

- All Blossom requests proxied through Sidecar
- Blob URLs are content-addressed (hash-based), not user-identifiable
- Operators MAY implement rate limiting per pubkey
- Operators SHOULD NOT log download requests with user identifiers

---

## 8. PROTOCOL COMPLIANCE

### 8.1 Standards Foundation

Synchrono City is built on the Nostr protocol and associated NIPs (Nostr Implementation Possibilities). Required NIPs and event kinds are enumerated in the Protocol Specification.

Implementations MUST support all NIPs designated as required. Implementations MAY support NIPs designated as optional.

### 8.2 Interoperability

Clients and infrastructure implementing this constitution MUST interoperate for all features defined herein.

Operators and client developers MAY implement extensions beyond this specification provided such extensions:
- Do not break compatibility with non-extended implementations
- Are clearly documented as non-standard
- Do not degrade privacy or security for users of non-extended clients

Proprietary extensions that prevent interoperability are prohibited.

---

## 9. SIDECAR ARCHITECTURE

### 9.1 Purpose
The Sidecar is a bridge service that connects the decentralized Nostr protocol with high-performance infrastructure (LiveKit/Blossom). It acts as a "Policy Enforcement Point."

### 9.2 Trust Model
- **Network Proxy:** The Sidecar acts as a shield, hiding user IP addresses from external services.
- **Validation Authority:** The Sidecar is responsible for validating that a user actually belongs to a group before allowing them to consume resources.
- **Fail-Safe:** If the Sidecar fails, the system must default to a "closed" state—no new calls can be started, and no new participants can join existing calls.

### 9.3 Open Operation

The Sidecar software MUST be open source. Users MUST be able to verify that the code running on the server matches the published logic, particularly regarding key management and logging.

**Authentication:**
All Sidecar API requests MUST be authenticated using NIP-98 (HTTP Auth). This cryptographically binds each request to a Nostr identity, enabling rate limiting, access control, and audit trails without requiring account creation.

---

## 10. OPERATOR ENFORCEMENT

### 10.1 Enforcement Principles

Operators MAY terminate LiveKit rooms or revoke service for:
- Technical abuse (resource exhaustion, protocol violations, DoS patterns)
- Valid legal process from competent authorities
- Verified user reports meeting operator-defined thresholds
- Violation of operator's published acceptable use policy, based on observable metadata

Operators MAY NOT terminate service based on encrypted content they cannot observe.

Termination decisions SHOULD be logged with reasoning (excluding user PII) for dispute resolution.

### 10.2 Observable Signals

Operators may act only on information legitimately available to them:
- Connection metadata (IP addresses, timing, frequency)
- Room metadata (participant count, duration, creation patterns)
- User reports submitted through official channels
- Public profile information
- Unencrypted event metadata

Operators MUST NOT attempt to decrypt, infer, or access encrypted content for enforcement purposes.

---

## 11. LEGAL AND COMPLIANCE

### 11.1 Operator Jurisdiction

Operators are solely responsible for compliance with applicable law in their jurisdiction. The protocol does not require or prohibit cooperation with legal process.

Operators SHOULD publish a written policy stating:
- Their legal jurisdiction
- Data retention practices
- Approach to legal requests
- Contact information for legal process

### 11.2 Illegal Content

Operators cannot access encrypted content and therefore cannot proactively moderate such content.

Operators MAY act on:
- Valid legal process from competent authorities
- User reports, at operator discretion
- Automated hash-matching of unencrypted uploads against known illegal content databases

Operators MUST NOT implement hash-matching, traffic analysis, or metadata fingerprinting of encrypted content to infer its nature.

Operators who become aware of illegal content through lawful means MAY terminate associated accounts or groups.

### 11.3 Transparency

Operators MAY choose to publish transparency reports detailing:
- Volume of legal requests received
- Volume of requests complied with
- Volume of accounts/groups terminated
- General categories of enforcement actions

Transparency reports MUST NOT contain information identifying specific users.

---

## 12. SECURITY

### 12.1 Vulnerability Disclosure

Security vulnerabilities SHOULD be reported to the designated security contact published in project documentation.

The project maintainers commit to:
- Acknowledging reports within 7 days
- Providing a fix or mitigation within 90 days for critical vulnerabilities
- Coordinating disclosure timing with reporters
- Publishing security advisories for vulnerabilities affecting user privacy or safety

Reporters MAY disclose publicly after 90 days regardless of fix status.

### 12.2 Security Principles

All implementations MUST:
- Use secure random number generation for cryptographic operations
- Validate all inputs from network sources
- Implement certificate validation for TLS connections
- Clear sensitive data from memory after use

Specific security requirements for implementations are defined in the Developer Guidelines.

---

## 13. CLIENT REQUIREMENTS

### 13.1 Time Synchronization

Clients MUST maintain accurate time synchronization. Clients SHOULD check clock offset on application launch and alert users to significant drift.

Clients MAY refuse to create events if clock drift exceeds acceptable thresholds. Specific thresholds are defined in the Client Implementation Guide.

### 13.2 Clock Validation

**Client Requirements:**
- Clients SHOULD check clock offset against a trusted time source on application launch.
- Clients MUST warn users when detected clock drift exceeds **±30 seconds**.
- Clients MAY refuse to create events when drift exceeds **±5 minutes**.

**Infrastructure Requirements:**
- Sidecars and Relays MUST reject events with timestamps more than **5 minutes** in the past or future relative to server time.
- Rejected events SHOULD return error code `TIMESTAMP_OUT_OF_RANGE`.

---

## 14. CALL RECORDING

Synchrono City does not support call recording.

- Client: No recording feature implemented
- Sidecar: No access to decrypted media
- LiveKit: Rooms created with recording disabled

Users should understand that participants could use external recording software outside the platform's control (see Section 1.3 Threat Model).

---

## 15. DATA RETENTION

### 15.1 Sidecar Data Retention

| Data Type | Retention |
|-----------|-----------|
| Token usage cache | Token TTL |
| MLS state | Duration of call only |
| Request logs | Maximum 24 hours (no PII) |

**Prohibited:**
- Persisting MLS state beyond call
- Logging token values
- Storing participant identities with call metadata

### 15.2 Relay Ephemerality

Users acknowledge that Relays are independent third parties. The platform treats all remote storage as potentially ephemeral. Clients MUST NOT rely on Relays as permanent, guaranteed backups of message history; local-first storage is prioritized.

---

## 16. MODERATION PRINCIPLES

### 16.1 User-Level Controls

**Mute (Client-Side):**
- Hides content from a specific user locally.
- Muted users CAN still join the same calls (audio/video rendered locally as silence/black).
- Mute lists are private, encrypted (NIP-51 Kind 10000), and enforced exclusively by the client.
- Mutes are invisible to the muted party and to infrastructure.

**Block (Infrastructure-Enforced):**
- A "Block" is a request for infrastructure-enforced separation.
- Block lists are public (Kind 10006) to enable Sidecar enforcement.
- **Direct Contexts:** Blocks strictly prevent DMs and 1:1 calls in both directions.
- **Shared Contexts (Group Calls):** Enforcement follows **asymmetric First-Arriver** rules:
    1. **Blocker Present:** If User A has blocked User B, and User A is currently in a room, the Sidecar MUST reject User B's attempt to join.
    2. **Blocked Present:** If User B is in a room, and User A (Blocker) attempts to join, the client MUST warn User A ("A user you've blocked is present"). If User A proceeds, they accept co-presence with the blocked user.
- **Abuse of Privilege (Squatting):** Repeatedly occupying a public or group space solely to prevent another user's entry is a violation of the Anti-Harassment policy and grounds for Operator intervention.

### 16.2 Group-Level Controls

**Admins MAY:**
- Remove members
- Delete messages
- Assign/revoke admin roles
- Remove participants from active calls (triggers MLS key rotation)

**Admins MAY NOT:**
- Access encrypted DMs
- Modify other users' profiles
- Override user mute lists
- Access MLS key material

### 16.3 Platform-Level Controls

**Operators MAY:**
- Adjust feature parameters via configuration
- Exclude specific relays from recommended lists
- Display maintenance or service messages
- Terminate LiveKit rooms per Section 10.1

**Operators MAY NOT:**
- Access encrypted content
- Modify user events
- Track individual user behavior beyond operational necessity
- Access decrypted call media

---

## 17. VERSIONING

### 17.1 Constitution Versioning

This constitution follows semantic versioning:
- **Major:** Breaking changes to core principles or architecture
- **Minor:** New sections or significant clarifications
- **Patch:** Typos, minor clarifications

### 17.2 Deprecation Policy

- Features deprecated with 90-day notice
- Breaking protocol changes require migration path
- Users notified via in-app messaging

### 17.3 Related Documents

This constitution is supported by:
- **Protocol Specification:** NIPs, event kinds, wire formats, cryptographic parameters
- **Client Implementation Guide:** Thresholds, offline behavior, UX requirements
- **Developer Guidelines:** Code patterns, error handling, security practices
- **Operator Guide:** Deployment, configuration, operational procedures

---

## 18. GOVERNANCE

### 18.1 The Benevolent Dictator
The Synchrono City project is governed by a Benevolent Dictator for Life (BDFL) model.
- **Authority:** The Founder ('geo') retains final authority over the "Official" protocol constitution, reference client implementation, and Sidecar architecture.
- **Responsibility:** The Founder commits to prioritizing user sovereignty and privacy over profit or convenience.

### 18.2 Succession
In the event the Founder cannot fulfill these duties, control of the repository and protocol definition defaults to a **Council of Maintainers**. This Council is formed by the top 3 active contributors based on qualitative impact and code review history over the preceding 12 months, not merely commit volume.

### 18.3 The Right to Fork
In accordance with FOSS principles, if the community believes the governance has violated the Mission Statement (Section 1.1), they possess the ultimate check on power: the right to fork the code and the protocol.

---

## APPENDIX A: DEFINITIONS

**Client:** An application implementing this constitution that runs on user devices.

**DM:** Direct message; private communication between two users.

**E2EE:** End-to-end encryption; encryption where only communicating parties can decrypt content.

**Geohash:** A hierarchical spatial encoding system that represents locations as strings of characters.

**Group:** A NIP-29 relay-based group with defined membership and administration.

**MLS:** Message Layer Security (RFC 9420); a protocol for group key agreement.

**NIP:** Nostr Implementation Possibility; a specification for Nostr protocol features.

**Operator:** An entity running Synchrono City infrastructure (relay, Sidecar, LiveKit, Blossom).

**Relay:** A Nostr relay server that stores and distributes events.

**SFU:** Selective Forwarding Unit; a server that routes media streams without decoding them.

**Sidecar:** The server component that bridges Nostr authentication with LiveKit and provides supporting services.

---

### Version 1.0.0

- Initial release