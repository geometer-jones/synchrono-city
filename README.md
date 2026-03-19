# Synchrono City

Synchrono City is a hostable, map-native social stack for communities that coordinate through place. It combines Nostr identity and event transport, LiveKit media, Blossom storage, and relay-local policy enforced by Concierge.

## Implementation Status

The repository now includes a Phase 1 foundation scaffold:

- `apps/web`: React + Vite client shell with `World`, `Chats`, `Pulse`, and `Settings`
- `apps/concierge`: Go service with config loading, Postgres-backed policy storage, NIP-98 auth, relay authorization, audit logging, LiveKit token vending, and a `strfry` policy shim
- `db/migrations`: initial Postgres schema for policy, standing, sessions, and audit
- `runbooks`: initial operator runbooks from the roadmap
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
