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
docker compose --env-file .env.docker up --build
```

---

## Implementation Status

The repository now includes the Phase 1 foundation, Phase 2 social layer, Phase 3 governance surface, Phase 4 media surface, Phase 5 intelligence surface, and the Phase 6 cross-relay feed surface:

- `apps/web`: React + Vite client with a splash route, application-defined places, place-based public conversation on the World map, a private `Chats` inbox for DMs and group DMs, Pulse profile/note context, AI synthesis cards with citations, an explainable merged local-plus-remote Pulse feed with explicit relay provenance, rooms-on-map, a global geohash-scoped LiveKit call overlay, Blossom-backed place media uploads, and authenticated governance workflows for guest list, blocklist, standing, proof verification, gate stacking, editorial pinning, room permissions, and audit review
- `apps/concierge`: Go service with config loading, Postgres-backed policy storage, NIP-98 auth, relay authorization with gate stacking and proof checks, audit logging with cursor pagination, LiveKit token vending, a `strfry` policy shim, and public social/bootstrap and admin governance endpoints that now include cross-relay feed metadata for the web app
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
docker compose --env-file .env.docker up --build
```

### Local Web Dev Against Docker Backend

Run the backend stack in Docker Compose without the containerized client:

```bash
pnpm dev:backend
```

Then run the web client locally with Vite:

```bash
pnpm dev
```

In this mode the Vite dev server stays on `http://localhost:5173` and proxies `/api/*` requests to Concierge on `http://localhost:3000`, while the browser still connects directly to the relay (`ws://localhost:8080`), Blossom (`http://localhost:3001`), and LiveKit (`ws://localhost:17880`) using the existing web env values.

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
