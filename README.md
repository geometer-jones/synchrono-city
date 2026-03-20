# Synchrono City

Synchrono City is a hostable, map-native social stack for communities that coordinate through place. It combines Nostr identity and event transport, LiveKit media, Blossom storage, and relay-local policy enforced by Concierge.

## Quick Start for Operators

**One-command setup:**

```bash
git clone https://github.com/geometer-jones/synchrono-city
cd synchrono-city
./setup.sh
```

The setup script will:
- Generate all required secrets
- Create your operator Nostr keypair
- Create `.env.docker` with everything configured
- Offer to start the stack

**After setup, your services:**
- Client: http://localhost:5173
- Relay: ws://localhost:8080
- Admin: http://localhost:5173/app/settings

### Manual Docker Setup

If you prefer to configure manually:

```bash
cp .env.docker.example .env.docker
# Edit .env.docker with your operator pubkey and secrets
docker compose up --build
```

---

## Implementation Status

The repository now includes the Phase 1 foundation, Phase 2 social layer, and Phase 3 governance surface:

- `apps/web`: React + Vite client with a splash route, application-defined places, geo-chats, Pulse profile/note context, a global geohash-scoped call overlay, and authenticated governance workflows for guest list, blocklist, standing, room permissions, and audit review
- `apps/concierge`: Go service with config loading, Postgres-backed policy storage, NIP-98 auth, relay authorization, audit logging with cursor pagination, LiveKit token vending, a `strfry` policy shim, and public social/bootstrap and admin governance endpoints for the web app
- `db/migrations`: initial Postgres schema for policy, standing, sessions, and audit
- `runbooks`: operator runbooks from the roadmap
- `apps/concierge/relay-strfry.conf.example`: sample `strfry` write-policy plugin wiring for the relay shim

### Quick Start

```bash
pnpm install
pnpm dev
```

In another shell:

```bash
cd apps/concierge
go run ./cmd/concierge
```

For the relay policy shim:

```bash
cd apps/concierge
go run ./cmd/relay-shim
```

The Concierge expects a reachable Postgres instance and the environment variables described in `OPERATIONS.md`.
Connection-pool tuning is controlled through `DB_MAX_OPEN_CONNS`, `DB_MAX_IDLE_CONNS`, and `DB_CONN_MAX_LIFETIME`.

### Docker Compose

```bash
cp .env.docker.example .env.docker
docker compose up --build
```

## Documents

- [MANIFESTO.md](MANIFESTO.md)
  Mission, principles, and political/product framing.
- [ARCHITECTURE.md](ARCHITECTURE.md)
  Client-layer behavior, system topology, and key flows.
- [CLIENT_SPEC.md](CLIENT_SPEC.md)
  UI contract, visual direction, and generation rules for future client work.
- [PROTOCOL.md](PROTOCOL.md)
  Interoperable contracts, event kinds, auth, storage, and relay policy surfaces.
- [OPERATIONS.md](OPERATIONS.md)
  Runtime configuration, security model, observability, resilience, and testing.
- [ROADMAP.md](ROADMAP.md)
  Implementation phases, deferred work, and open questions.

## Recommended Reading Order

1. `MANIFESTO.md`
2. `ARCHITECTURE.md`
3. `PROTOCOL.md`
4. `OPERATIONS.md`
5. `ROADMAP.md`
