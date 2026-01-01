# Synchrono City Operator Guide

**Version:** 1.0.0  
**Constitution Reference:** v1.0.0  
**Protocol Specification Reference:** v1.0.0

---

## Introduction

This guide provides operational procedures for entities running Synchrono City infrastructure. As an Operator, you are responsible for maintaining the infrastructure that enables private, location-based communication while upholding the principles defined in the Constitution.

Synchrono City achieves decentralization through federation—no single entity controls the network. Users choose their infrastructure; operators compete on trust and performance.

---

## 1. Architecture Overview

### 1.1 Component Stack

A complete Synchrono City deployment consists of four components:

| Component | Purpose | Software Options |
|-----------|---------|------------------|
| **Nostr Relay** | Event storage and distribution | strfry, nostr-rs-relay |
| **Sidecar** | Token generation, webhooks, proxying, MLS key authority | Synchrono Sidecar (reference implementation) |
| **LiveKit Server** | Real-time media routing (SFU) | LiveKit |
| **Blossom Server** | Content-addressed media storage | Blossom |

All components must be deployed together under unified operational control. Users trust you as a single operator—fragmenting components across trust boundaries violates the security model.

### 1.2 Trust Model

Your infrastructure occupies a specific position in the trust hierarchy:

**You CAN see:**
- User IP addresses (for users connecting to your relay/sidecar)
- Connection metadata (timing, frequency, duration)
- Room metadata (participant count, creation patterns)
- Public profile information
- Unencrypted event metadata
- Group membership lists (NIP-29 limitation)

**You CANNOT see:**
- DM content (end-to-end encrypted)
- Call content (MLS + LiveKit frame encryption)
- Mute lists (client-side only)

**You MUST NOT attempt to:**
- Decrypt, infer, or access encrypted content
- Log token values
- Store participant identities with call metadata
- Persist MLS state beyond call duration

### 1.3 Data Flow

```
User Device
    │
    ├──► Nostr Relay (events, signaling)
    │
    ├──► Sidecar (token requests, MLS operations, proxied requests)
    │         │
    │         └──► Blossom (media storage, proxied)
    │
    └──► LiveKit (encrypted media streams)
```

---

## 2. Deployment Requirements

### 2.1 Infrastructure Prerequisites

**Minimum Server Specifications:**

| Component | CPU | RAM | Storage | Network |
|-----------|-----|-----|---------|---------|
| Relay | 2 cores | 4 GB | 100 GB SSD | 100 Mbps |
| Sidecar | 2 cores | 2 GB | 20 GB SSD | 100 Mbps |
| LiveKit | 4 cores | 8 GB | 50 GB SSD | 1 Gbps |
| Blossom | 2 cores | 4 GB | 500 GB+ SSD | 100 Mbps |

**Production Recommendations:**
- Deploy behind a reverse proxy (nginx, Caddy) with TLS termination
- Use dedicated servers or isolated VMs—never shared hosting
- Implement DDoS protection at the network edge
- Maintain separate backup infrastructure

### 2.2 Network Configuration

**Required Ports:**

| Port | Protocol | Component | Purpose |
|------|----------|-----------|---------|
| 443 | WSS | Relay | Nostr WebSocket connections |
| 443 | HTTPS | Sidecar | API endpoints |
| 443 | WSS | LiveKit | WebRTC signaling |
| 7881 | UDP | LiveKit | WebRTC media (configurable) |
| 443 | HTTPS | Blossom | Media uploads/downloads |

**TLS Requirements:**
- All endpoints MUST use TLS 1.2 or higher
- Certificates must be valid and not self-signed for production
- Implement HSTS headers

### 2.3 DNS Configuration

Configure the following subdomains (example):

```
relay.yourdomain.com      → Nostr Relay
sidecar.yourdomain.com    → Sidecar API
livekit.yourdomain.com    → LiveKit Server
media.yourdomain.com      → Blossom Server
```

---

## 3. Component Configuration

### 3.1 Nostr Relay Configuration

Your relay must advertise Synchrono City support via NIP-11:

```json
{
  "name": "Your Relay Name",
  "description": "Synchrono City enabled relay",
  "software": "strfry",
  "supported_nips": [1, 2, 9, 10, 13, 17, 29, 42, 44, 51, 59, 78, 98],
  "synchrono_city": {
    "version": "1.0.0",
    "sidecar_url": "https://sidecar.yourdomain.com",
    "blossom_url": "https://media.yourdomain.com",
    "livekit_url": "wss://livekit.yourdomain.com"
  }
}
```

**Event Validation Rules:**

| Validation | Requirement |
|------------|-------------|
| Timestamp | Reject events >5 minutes from server time |
| PoW | Validate nonce for kinds with defined targets |
| Signature | Verify NIP-01 signatures on all events |
| Deletion | Honor Kind 5 deletion requests (NIP-09) |

*Refer to Protocol Specification §4 for exact JSON event structures and tag requirements.*

### 3.2 Sidecar Configuration

The Sidecar is your policy enforcement point. Configure the following:

**Environment Variables:**

```bash
# Core
RELAY_URL=wss://relay.yourdomain.com
LIVEKIT_URL=wss://livekit.yourdomain.com
LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_api_secret
BLOSSOM_URL=https://media.yourdomain.com

# Security
JWT_EXPIRY_SECONDS=180
TOKEN_CACHE_TTL_SECONDS=300
CLOCK_TOLERANCE_SECONDS=300

# Rate Limiting
RATE_LIMIT_TOKENS_PER_PUBKEY=10
RATE_LIMIT_WINDOW_SECONDS=60
```

**API Endpoints:**

| Method | Endpoint | Authentication | Purpose |
|--------|----------|----------------|---------|
| GET | /health | None | Service status |
| POST | /token/group | NIP-98 | Exchange Kind 20002 for LiveKit token |
| POST | /token/dm | NIP-98 | Exchange Kind 20010/20011 for LiveKit token |
| POST | /proxy | NIP-98 | Proxy requests to external services |
| GET | /mls/state/{room_id} | NIP-98 | Fetch current MLS epoch |
| POST | /mls/commit | NIP-98 | Submit MLS commit (Epoch Leader only) |

### 3.3 LiveKit Configuration

**Room Settings:**

```yaml
room:
  enabled_codecs:
    - mime: audio/opus
    - mime: video/VP8
    - mime: video/H264
  max_participants: 50
  empty_timeout: 300  # 5 minutes
  recording:
    enabled: false    # REQUIRED: Recording must be disabled
```

**Webhook Configuration:**

Configure LiveKit to send webhooks to your Sidecar:

```yaml
webhook:
  urls:
    - https://sidecar.yourdomain.com/webhook/livekit
  api_key: your_webhook_key
```

**Required Webhook Events:**
- `participant_joined` — Triggers Kind 20004 publication
- `participant_left` — Triggers Kind 20005 publication and potential Epoch Leader transfer
- `room_finished` — Triggers Kind 20006 publication and MLS teardown

### 3.4 Blossom Configuration

**MIME Type Allowlist:**

```
image/jpeg
image/png
image/gif
image/webp
audio/mpeg
audio/ogg
audio/wav
video/mp4
video/webm
application/pdf
```

All other MIME types must be rejected. Executables, archives, and scripts are strictly prohibited.

**Hash Matching for Illegal Content:**

Per Constitution Section 11.2, you may implement hash matching against known illegal content databases. Requirements:

- Perform matching locally against a downloaded/cached database
- Never transmit file hashes to external verification services
- If external verification is required, use privacy-preserving protocols (k-anonymity prefixes)

---

## 4. Operational Procedures

### 4.1 Health Monitoring

**Critical Metrics to Monitor:**

| Metric | Warning Threshold | Critical Threshold |
|--------|-------------------|-------------------|
| Relay connections | >80% capacity | >95% capacity |
| Sidecar response time | >500ms p95 | >2000ms p95 |
| LiveKit CPU usage | >70% | >90% |
| Blossom storage | >70% full | >90% full |
| Token issuance failures | >1% | >5% |
| WebSocket disconnection rate | >5% | >15% |

**Health Check Endpoints:**

```bash
# Relay
curl -s wss://relay.yourdomain.com | jq .

# Sidecar
curl -s https://sidecar.yourdomain.com/health | jq .

# LiveKit
curl -s https://livekit.yourdomain.com/health | jq .
```

### 4.2 Log Management

**Retention Policy:**

| Log Type | Maximum Retention | Notes |
|----------|-------------------|-------|
| Request logs | 24 hours | No PII |
| Token usage cache | Token TTL only | Never log token values |
| MLS state | Duration of call only | Delete immediately after |
| Error logs | 7 days | Anonymize before storage |

**Prohibited Logging:**
- Token values
- Participant identities with call metadata
- User IPs correlated with content
- Any attempt to infer encrypted content

### 4.3 Backup Procedures

**What to Back Up:**

| Data | Frequency | Retention |
|------|-----------|-----------|
| Relay events | Daily | 30 days |
| Blossom media | Daily | 30 days |
| Configuration | On change | 90 days |
| TLS certificates | On renewal | Until expiry |

**What NOT to Back Up:**
- MLS state (ephemeral by design)
- Token caches (security risk)
- Session data

### 4.4 Incident Response

**Severity Levels:**

| Level | Definition | Response Time |
|-------|------------|---------------|
| P1 | Complete service outage | 15 minutes |
| P2 | Partial outage affecting calls | 1 hour |
| P3 | Degraded performance | 4 hours |
| P4 | Minor issues | 24 hours |

**Incident Checklist:**

1. Identify affected components
2. Check health endpoints
3. Review recent deployments
4. Examine error logs (within retention limits)
5. Isolate failing components
6. Restore from backup if necessary
7. Document incident and remediation

---

## 5. Security Operations

### 5.1 Token Security

**Single-Use Enforcement Flow:**

1. Sidecar generates unique `jti` for each token
2. Cache issued `jti` values for 5 minutes
3. LiveKit webhook reports `participant_joined`
4. Mark `jti` as consumed
5. Reject subsequent connection attempts with same identity

**Token Parameters:**

| Claim | Value | Purpose |
|-------|-------|---------|
| `sub` | User's Nostr pubkey (hex) | Identity binding |
| `jti` | Unique identifier | Single-use enforcement |
| `exp` | Current time + 180 seconds | Expiration |
| `roomJoin` | true | Permission |
| `room` | SHA256(group_id + call_id) | Room binding |

### 5.2 Block List Enforcement

When processing token requests, the Sidecar must:

1. Fetch requester's Block List (Kind 10006) from Relay
2. Fetch Block Lists of all current room participants
3. **Reject** if any current participant has blocked the requester
4. **Warn** (but issue token) if requester has blocked any current participant

Include `warning: "blocked_user_present"` in response metadata when applicable.

### 5.3 Rate Limiting

**Recommended Limits:**

| Resource | Limit | Window |
|----------|-------|--------|
| Token requests per pubkey | 10 | 60 seconds |
| Token requests per IP | 30 | 60 seconds |
| Blossom uploads per pubkey | 20 | 60 seconds |
| Proxy requests per pubkey | 100 | 60 seconds |

During detected abuse, you may apply stricter limits.

### 5.4 Vulnerability Management

**Disclosure Process:**

1. Receive report via published security contact
2. Acknowledge within 7 days
3. Assess severity and impact
4. Develop fix or mitigation
5. Deploy fix within 90 days for critical issues
6. Coordinate disclosure timing with reporter
7. Publish security advisory

Reporters may disclose publicly after 90 days regardless of fix status.

---

## 6. Compliance and Policy

### 6.1 Operator Responsibilities

**You MUST:**
- Run open-source, unmodified protocol implementations
- Not log or store decrypted content
- Publish relay/Sidecar/Blossom endpoints for client discovery
- Publish a written policy stating jurisdiction and data practices

**You MAY:**
- Set rate limits and resource constraints
- Require payment or authentication for access
- Federate or not federate with other operators
- Publish transparency reports

### 6.2 Enforcement Actions

You MAY terminate rooms or revoke service for:
- Technical abuse (resource exhaustion, DoS patterns)
- Valid legal process from competent authorities
- Verified user reports meeting your defined thresholds
- Violation of your published acceptable use policy

You MAY NOT terminate service based on encrypted content you cannot observe.

**Documentation Requirement:** Log termination decisions with reasoning (excluding user PII) for dispute resolution.

### 6.3 Legal Requests

When receiving legal requests:

1. Verify request authenticity and jurisdiction
2. Determine scope of request
3. Identify what data you actually possess (remember: you cannot access encrypted content)
4. Respond within legal timeframes
5. Document the request and response
6. Consider including in transparency report

**What You Can Provide:**
- Connection metadata
- Public profile information
- Group membership (NIP-29 limitation)
- Unencrypted event metadata

**What You Cannot Provide:**
- Decrypted message content
- Decrypted call content
- MLS key material (not retained)

### 6.4 Published Policy Requirements

Your public policy document must include:

1. **Jurisdiction:** Legal jurisdiction under which you operate
2. **Data Practices:** What data you collect, how long you retain it
3. **Legal Requests:** Your approach to legal process
4. **Contact Information:** How to reach you for legal matters
5. **Acceptable Use:** What behavior will result in termination
6. **Payment Terms:** If applicable, payment methods accepted

---

## 7. Financial Operations

### 7.1 Payment Requirements

If you require payment for access:

**You MUST** offer payment methods that do not forcibly link real-world financial identity to Nostr public keys:
- Lightning Network
- Chaumian E-Cash (Cashu, Fedimint)
- Other privacy-preserving methods

**You MAY** also accept:
- Credit cards (but cannot be the only option)
- Bank transfers
- Traditional payment processors

### 7.2 Pricing Models

Common pricing approaches:

| Model | Description | Considerations |
|-------|-------------|----------------|
| Free tier | Basic access, rate limited | Requires PoW to prevent abuse |
| Subscription | Monthly/annual payment | Predictable revenue |
| Pay-per-use | Charge for resources consumed | Complex metering |
| Storage quotas | Charge for Blossom storage | Easy to meter |

---

## 8. Scaling Considerations

### 8.1 Horizontal Scaling

**Relay:**
- Deploy multiple relay instances behind load balancer
- Use shared database (PostgreSQL) for event storage
- Implement WebSocket sticky sessions

**Sidecar:**
- Stateless design allows horizontal scaling
- Use Redis for token cache sharing
- Load balance API requests

**LiveKit:**
- Deploy multiple SFU nodes
- Use LiveKit's built-in node selection
- Consider geographic distribution

**Blossom:**
- Content-addressed storage enables CDN distribution
- Consider S3-compatible backends for storage
- Implement caching at edge

### 8.2 Geographic Distribution

For global reach:

1. Deploy relay nodes in multiple regions
2. Use anycast DNS for automatic routing
3. Replicate Blossom content to regional storage
4. Deploy LiveKit nodes close to users for latency

### 8.3 Capacity Planning

**Per-User Resource Estimates:**

| Resource | Estimate |
|----------|----------|
| Event storage | ~10 KB/day average |
| Media storage | ~50 MB/month active |
| Bandwidth (calls) | ~1 Mbps per participant |
| Bandwidth (events) | ~10 KB/minute active |

---

## 9. Troubleshooting

### 9.1 Common Issues

**Token Request Failures:**

| Error Code | Cause | Resolution |
|------------|-------|------------|
| `INVALID_SIGNATURE` | Bad NIP-98 header | Client issue; verify signature |
| `POW_INSUFFICIENT` | PoW target not met | Client must increase difficulty |
| `TIMESTAMP_OUT_OF_RANGE` | Clock drift >5 minutes | User must sync clock |
| `NOT_GROUP_MEMBER` | User not in NIP-29 group | Verify membership on relay |
| `BLOCKED_BY_PARTICIPANT` | Current participant blocked user | By design; cannot override |

**Call Connection Issues:**

| Symptom | Possible Cause | Resolution |
|---------|---------------|------------|
| Cannot join call | Token expired | Reduce latency between token request and connection |
| No audio/video | Frame encryption mismatch | Verify MLS epoch sync |
| Dropped from call | WebRTC connectivity | Check TURN/STUN configuration |
| Cannot hear others | MLS Welcome not received | Check relay subscription |

**Media Upload Failures:**

| Symptom | Possible Cause | Resolution |
|---------|---------------|------------|
| Upload rejected | MIME type not allowed | Verify file type |
| Upload timeout | File too large | Check size limits |
| 403 Forbidden | Authentication failure | Verify NIP-98 header |

### 9.2 Diagnostic Commands

```bash
# Check relay connectivity
websocat wss://relay.yourdomain.com

# Verify Sidecar health
curl -v https://sidecar.yourdomain.com/health

# Test LiveKit connectivity
livekit-cli test-egress --url wss://livekit.yourdomain.com

# Check Blossom storage
curl -v https://media.yourdomain.com/list
```

### 9.3 Debug Logging

Enable debug logging temporarily for troubleshooting:

```bash
# Sidecar
export LOG_LEVEL=debug

# Relay (strfry)
export STRFRY_LOG_LEVEL=debug

# LiveKit
export LK_LOG_LEVEL=debug
```

**Warning:** Debug logging may capture sensitive information. Disable after troubleshooting and purge logs.

---

## 10. Maintenance Windows

### 10.1 Planned Maintenance

**Notification Requirements:**
- Announce maintenance 72 hours in advance
- Use in-app messaging where possible
- Post to status page

**Maintenance Procedure:**

1. Announce maintenance window
2. Stop accepting new call initiations
3. Allow existing calls to complete (or set timeout)
4. Perform maintenance
5. Verify all health checks pass
6. Resume normal operations
7. Monitor for issues

### 10.2 Emergency Maintenance

For critical security issues:

1. Assess immediate risk
2. Take affected components offline if necessary
3. Apply fix
4. Verify fix effectiveness
5. Restore service
6. Post-incident communication

---

## 11. Decommissioning

If you need to shut down operations:

### 11.1 User Notification

- Provide minimum 90 days notice
- Explain how users can migrate
- Offer data export assistance

### 11.2 Data Handling

| Data Type | Action |
|-----------|--------|
| Relay events | Allow user export, then delete |
| Blossom media | Allow user download, then delete |
| Logs | Delete per retention policy |
| Backups | Securely destroy |
| Keys | Securely destroy |

### 11.3 Graceful Shutdown

1. Stop accepting new registrations
2. Stop accepting new group creation
3. Allow existing functionality to continue
4. Reduce to read-only after notice period
5. Final data export window
6. Complete shutdown

---

## Appendix A: Configuration Templates

### A.1 Nginx Reverse Proxy

```nginx
# Relay
server {
    listen 443 ssl http2;
    server_name relay.yourdomain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://127.0.0.1:7777;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
    }
}

# Sidecar
server {
    listen 443 ssl http2;
    server_name sidecar.yourdomain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### A.2 Docker Compose

```yaml
version: '3.8'

services:
  relay:
    image: synchrono/relay:latest
    ports:
      - "7777:7777"
    volumes:
      - relay-data:/data
    environment:
      - RELAY_NAME=Your Relay
      
  sidecar:
    image: synchrono/sidecar:latest
    ports:
      - "8080:8080"
    environment:
      - RELAY_URL=wss://relay.yourdomain.com
      - LIVEKIT_URL=wss://livekit.yourdomain.com
      - LIVEKIT_API_KEY=${LIVEKIT_API_KEY}
      - LIVEKIT_API_SECRET=${LIVEKIT_API_SECRET}
      
  livekit:
    image: livekit/livekit-server:latest
    ports:
      - "7880:7880"
      - "7881:7881/udp"
    volumes:
      - ./livekit.yaml:/livekit.yaml
    command: --config /livekit.yaml
    
  blossom:
    image: synchrono/blossom:latest
    ports:
      - "3000:3000"
    volumes:
      - blossom-data:/data

volumes:
  relay-data:
  blossom-data:
```

---

## Appendix B: Checklist

### Pre-Launch Checklist

- [ ] All four components deployed and healthy
- [ ] TLS configured on all endpoints
- [ ] NIP-11 document includes synchrono_city object
- [ ] PoW validation enabled on relay
- [ ] LiveKit recording disabled
- [ ] Blossom MIME allowlist configured
- [ ] Rate limiting enabled
- [ ] Monitoring and alerting configured
- [ ] Backup procedures tested
- [ ] Public policy document published
- [ ] Security contact published
- [ ] Log retention configured per spec

### Ongoing Operations Checklist

- [ ] Daily: Review health metrics
- [ ] Weekly: Review error rates and patterns
- [ ] Monthly: Test backup restoration
- [ ] Quarterly: Review and update policies
- [ ] Annually: Security audit

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | — | Initial release |

---

*This guide is a living document. Submit corrections and improvements to the project repository.*