# Client Specification

This document is the source of truth for future generated client work.

Use it together with `ARCHITECTURE.md`:

- `ARCHITECTURE.md` defines product behavior, system topology, and protocol-adjacent UX
- `CLIENT_SPEC.md` defines the UI contract, visual direction, and generation rules for `apps/web`

If the implemented client and this spec diverge, update this document before or alongside UI work.

## 1. Purpose

The client should feel like operator-run civic infrastructure, not a generic SaaS dashboard and not a playful consumer social app.

The web app exists to help a community:

- orient around place
- inspect live scene activity
- move between map, chats, profiles, and governance
- understand local operator control without losing the social layer

## 2. Architecture Snapshot

### Primary languages

- TypeScript in `apps/web`
- Go in `apps/concierge`
- SQL in `db/migrations`

### Project structure

- `apps/web`: React 19 + Vite client
- `apps/concierge`: Go HTTP API, policy service, relay shim, LiveKit token boundary
- `db/migrations`: Postgres schema
- `deploy/*`: service deployment configs
- `runbooks/*`: operator procedures

### Entry points

- `apps/web/src/main.tsx`: React bootstrap
- `apps/web/src/router.tsx`: route tree
- `apps/concierge/cmd/concierge/main.go`: API server
- `apps/concierge/cmd/relay-shim/main.go`: relay policy shim

### Core web modules

- `apps/web/src/app-state.tsx`: shared client state, bootstrap fetch, optimistic notes, call overlay state
- `apps/web/src/data.ts`: seeded data, derived views, thread/tile helpers
- `apps/web/src/routes/*`: route surfaces
- `apps/web/src/components/*`: reusable UI pieces
- `apps/web/src/styles.css`: current global visual system

### Data flow

1. The client boots from `main.tsx` and mounts the router.
2. `AppStateProvider` fetches `/api/v1/social/bootstrap`.
3. Local selectors derive places, tiles, threads, notes, and scene health.
4. Route components render those derived models.
5. Mutations post back through Concierge endpoints such as note creation and call intent.
6. Active call state is kept global so the overlay survives route changes.

### Where client design changes belong

- Route-specific layout/content changes belong in `apps/web/src/routes/*`
- Shared interaction/state changes belong in `apps/web/src/app-state.tsx` or reusable components
- Shared visual language changes belong in `apps/web/src/styles.css`
- Product-wide visual or UX direction changes must be recorded here first

## 3. Current Baseline

The current client baseline is:

- dark, atmospheric, editorial
- map-first and place-first
- glassy panels over a low-light background
- warm orange/coral accents with cool blue atmospheric support
- serif display moments paired with practical sans-serif UI text

This baseline is acceptable as a starting point, but it is not final. Future work should refine it rather than treat the current implementation as sacred.

## 4. Non-Negotiable UX Rules

- The map/world surface remains the primary application lens.
- Splash, World, Chats, Pulse, and Settings must remain visually related but not identical.
- The global call overlay must stay persistent across in-app navigation.
- Governance features must look integrated with the social product, not like a separate admin product.
- The app should avoid generic dashboard tropes unless the feature is genuinely operational.
- Generated work must preserve existing route paths unless a routing change is explicitly requested.
- Generated work must not invent a second state container or duplicate bootstrap fetching without a clear need.

## 5. Route Contracts

### Splash `/`

Purpose:

- explain the political/product thesis
- invite entry into the app
- signal that this is hostable infrastructure

Must include:

- project name
- primary thesis/tagline
- primary CTA into `/app`
- secondary CTA for self-hosting/repository access
- manifesto or equivalent mission content

Desired feel:

- high-conviction editorial landing page
- not startup-marketing polished
- not minimalist to the point of losing ideological weight

### App Shell `/app`

Purpose:

- frame the current scene
- provide persistent route navigation
- hold shared overlays and app-wide status

Must include:

- clear route navigation for World, Chats, Pulse, Settings
- visible scene/operator framing
- persistent call overlay mounting point

Desired feel:

- a command surface for a living social world
- more civic atlas than analytics SaaS

### World `/app`

Purpose:

- present place activity as the main social surface
- move between tiles, notes, and live call state

Must include:

- map or map-like world surface
- list or card treatment for places
- selected-place detail
- room/call affordance
- note creation and recent note visibility

Desired feel:

- spatial first
- dense enough to feel alive
- readable on laptop and mobile without collapsing into a generic feed

### Chats `/app/chats`

Purpose:

- show thread inventory and selected conversation detail

Must include:

- geo-chat emphasis
- clear distinction between public place threads and private threads
- fast movement into related profile/note context when relevant

Desired feel:

- conversational, but still anchored to location and scene memory

### Pulse `/app/pulse`

Purpose:

- inspect people and note context

Must include:

- profile context
- authored notes or note detail context
- relationship back to place and thread surfaces

Desired feel:

- more intimate than World
- still obviously part of the same product

### Settings `/app/settings`

Purpose:

- expose governance and operator controls

Must include:

- policy and standing workflows
- room permission workflows
- audit visibility

Desired feel:

- operationally serious
- integrated with the app's brand language
- not visually detached "enterprise admin"

## 6. Shared UI Contracts

### Typography

- Use one practical UI face and one expressive display/editorial face at most.
- Display typography should appear in places of conviction: splash headings, major section headings, selected moments of emphasis.
- UI text should remain highly legible at dense sizes.

### Color

- Keep a restrained palette.
- Accent color should communicate heat, presence, or activation.
- Secondary atmospheric color can support depth, but should not become the primary brand.
- Status colors must remain clearly distinct from decorative accents.

### Layout

- Cards and panels are acceptable, but not every surface should read as interchangeable cards.
- World should privilege spatial hierarchy over stacked dashboard modules.
- Settings can be denser, but should still inherit the same frame and material language.

### Motion

- Use a small number of meaningful motions: page entrance, atmospheric movement, overlay transitions.
- Avoid constant motion on operational screens.
- Respect reduced-motion preferences.

### Content Tone

- Language should be direct, political, and infrastructural.
- Avoid empty growth-product language.
- Avoid whimsical copy.

## 7. Constraints For Generated Work

Generated UI work should:

- prefer the existing React, router, and CSS stack
- avoid new dependencies unless the current stack cannot reasonably support the requested result
- preserve the data contracts coming from `app-state.tsx`
- preserve the distinction between social surfaces and governance surfaces
- include mobile behavior, not just desktop screenshots-in-code form
- produce intentional visuals, not placeholder gradients and generic dashboard cards

Generated UI work should not:

- rewrite the app around a new component framework
- add Tailwind or another styling system without explicit approval
- flatten route differences into one repeated card grid
- turn Settings into a separate branded sub-product
- break the global call overlay model

## 8. Design Variables To Lock Next

These are the highest-value fields to refine so future generation becomes more deterministic.

| Area | Current baseline | What should be decided next |
| --- | --- | --- |
| Brand adjectives | atmospheric, civic, sovereign, editorial | the exact 3-5 adjectives the client must always optimize for |
| Typography | sans UI + serif display | exact font pair or acceptable substitutes |
| Density | medium, spacious cards | preferred density by route: sparse / medium / dense |
| World surface | hybrid map + panels | whether the world should feel more map-tool, atlas, transit-board, or field-report |
| Navigation tone | calm pill nav | whether nav should feel more tactical, institutional, or invisible |
| Material treatment | dark glass/panel depth | whether this should stay glassy, become flatter, or become more tactile |
| Motion level | low atmospheric motion | whether the product should feel mostly still, subtly alive, or more kinetic |
| Copy voice | ideological but composed | how formal, militant, friendly, or technical the voice should be |
| Governance styling | integrated with product shell | how much admin density is acceptable before the surface feels detached |
| Mobile priority | responsive, but desktop-led | whether mobile should be parity, reduced, or primary |

When those decisions are made, update this table with concrete answers rather than adding free-form notes elsewhere.

## 9. Change Protocol

For future client changes:

1. Read `CLIENT_SPEC.md` and `ARCHITECTURE.md`.
2. Identify which route or shared surface the change affects.
3. Preserve route/data contracts unless the task explicitly changes them.
4. Update this document if the change alters visual direction, route responsibilities, or generation constraints.
5. Implement the smallest viable change.
6. Verify the affected route still fits the contracts above.

## 10. Acceptance Checklist

A generated client change is not complete unless it:

- matches the route purpose it touches
- fits the shared visual language or intentionally updates it in this document
- works on desktop and mobile
- preserves existing app-state and routing boundaries unless intentionally changed
- avoids unrelated rewrites
- keeps the client recognizably map-native and operator-aware
