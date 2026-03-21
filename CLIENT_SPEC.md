# Client Specification

This document is the source of truth for future generated client work.

Use it together with `ARCHITECTURE.md`:

- `ARCHITECTURE.md` defines product behavior, system topology, and protocol-adjacent UX
- `CLIENT_SPEC.md` defines the UI contract, visual direction, and generation rules for `apps/web`
- `CLIENT_TASKS.md` defines the implementation backlog for bringing the current client into alignment with this spec

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
- an app bar that reserves the only permanent non-overlay chrome above the World surface

Desired feel:

- a command surface for a living social world
- more civic atlas than analytics SaaS

### World `/app`

Purpose:

- present place activity as the main social surface
- move between tiles, notes, and live call state

Must include:

- map or map-like world surface
- full-viewport map usage below the app bar
- pannable and zoomable map interaction
- selected-place detail
- room/call affordance
- note creation and recent note visibility

Desired feel:

- spatial first
- dense enough to feel alive
- readable on laptop and mobile without collapsing into a generic feed

Layout rule:

- In World, the map owns the screen.
- The map should fill the available viewport beneath the app bar.
- The map must remain pannable and zoomable while the user is in World.
- Place detail, room actions, note composition, and recent activity should appear as overlays, sheets, drawers, or anchored cards on top of the map rather than as stacked panels that push the map down the page.
- The app bar is the only persistent non-overlay chrome that should reduce map height.

Marker contract:

- Markers aggregate by canonical geohash tile.
- Render one marker per visible tile with activity.
- A tile with neither notes nor an active call should render no marker.
- The marker shape should remain a simple circle unless clustering or another explicit map-density rule requires otherwise.
- The numeral inside the marker is the count of kind `1` notes for that tile only.
- If a tile has an active call and zero notes, the marker should still render and should display `0`.
- Marker styling may communicate live-call presence, but the number itself should not include participant count.
- Tapping or clicking a marker sets the user's active place presence to that exact geohash tile.
- Selecting a marker should immediately initiate the join flow for that tile's call/presence context.
- Marker selection should not require a secondary confirmation step before joining.
- After selection, tile detail should appear in an overlay, anchored card, sheet, or equivalent map-layer surface without giving up the full-screen map.
- Marker-driven detail must preserve a fast path into the exact geohash conversation after presence has been set.
- Marker placement must stay anchored to the map as the user pans or zooms.

Map click contract:

- Clicking the map background relocates the user's presence to the nearest `geohash6` for that click.
- A background map click should immediately join the room for that clicked geohash.
- The join path should use the default relay's LiveKit room/token flow when that is available.
- A background map click is distinct from clicking a marker or cluster.

Marker click contract:

- Clicking a numbered marker relocates the user's presence to that marker's exact geohash tile.
- Marker click should immediately join the room for that marker geohash.

Marker card contract:

- The marker detail surface represents exactly one geohash tile unless clustering is active.
- It should make the selected place/presence state obvious.
- It should show the latest note preview for that exact geohash when one exists.
- It should show the current participant roster for that tile when a call is active.
- Participant rows should expose media-state indicators for mic, camera, screenshare, and deafen.
- Profile inspection from the marker detail surface should route into Pulse.

Clustering contract:

- Dense areas may cluster adjacent tiles for readability.
- Cluster counts should sum note counts across included tiles.
- Cluster behavior should respond to zoom level and dissolve as the user zooms in.
- Clicking a cluster should zoom in toward the clustered tiles and should not relocate user presence.
- Cluster expansion must preserve per-tile call state.
- Cluster detail should keep underlying tiles legible rather than flattening them into one synthetic place.

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

## 8. Generation Profile

Future generated client work should treat the following as the current default brief unless a newer revision replaces it.

```yaml
client_direction:
  status: provisional
  brand_adjectives:
    - civic
    - atmospheric
    - sovereign
    - editorial
    - map-native
  anti_adjectives:
    - playful
    - glossy-startup
    - enterprise-generic
    - consumer-social
    - gamified
  typography:
    ui_face: "IBM Plex Sans or equivalent practical grotesk"
    display_face: "Iowan Old Style or equivalent old-style serif"
    rule: "Use the serif sparingly for conviction and narrative emphasis, not for dense UI."
  palette:
    base: "near-black blue-green"
    primary_accent: "warm orange/coral"
    secondary_atmosphere: "cool blue"
    status_rule: "Operational states must remain semantically distinct from brand accents."
  material:
    direction: "layered dark surfaces with restrained glass"
    rule: "Keep depth and atmosphere, but reduce excessive blur or gloss on dense operational screens."
  density:
    splash: "spacious"
    app_shell: "medium"
    world: "map-first, chrome-light"
    chats: "dense"
    pulse: "medium"
    settings: "dense"
  world_surface:
    primary_metaphor: "civic atlas"
    secondary_metaphor: "field report"
    layout_rule: "Map fills the viewport below the app bar; supporting UI lives in overlays."
    avoid:
      - "trading terminal"
      - "toy map"
      - "generic activity feed"
  navigation:
    tone: "calm and institutional"
    rule: "Navigation should orient without dominating the page."
    placement: "top app bar on desktop, bottom app bar on mobile"
  motion:
    level: "subtle"
    usage:
      - "atmospheric movement on splash"
      - "gentle transitions for overlays and route changes"
    avoid:
      - "constant motion on operational screens"
      - "decorative motion without state meaning"
  copy:
    voice: "formal, ideological, infrastructural, composed"
    rule: "Prefer direct language over hype, jokes, or engagement-product phrasing."
  governance:
    visual_rule: "Governance belongs inside the same product shell as the social surfaces."
    density_rule: "Settings may be denser than World, but should not look like a separate enterprise console."
  mobile:
    priority: "core-task parity"
    rule: "World, chats, profile inspection, and call controls must remain first-class on mobile. Dense governance detail may collapse but must stay usable."
```

## 9. Decision Worksheet

Use this section to replace provisional defaults with explicit decisions. Keep answers short and update the generation profile above when a decision is made.

| Decision | Current provisional answer | Replace with your final answer |
| --- | --- | --- |
| Brand adjectives | civic, atmospheric, sovereign, editorial, map-native | |
| UI/display font pair | IBM Plex Sans + Iowan Old Style | |
| World metaphor | civic atlas with field-report energy | |
| World layout | full-screen map below app bar; supporting UI in overlays | |
| Material treatment | layered dark surfaces with restrained glass | |
| Navigation tone | calm and institutional | |
| Navigation placement | top app bar on desktop, bottom app bar on mobile | |
| Motion level | subtle | |
| Copy voice | formal, ideological, infrastructural | |
| Settings density | dense but integrated | |
| Mobile priority | core-task parity | |

### Fast prompts for future review

- What should the World screen feel closest to: atlas, command map, transit board, or public bulletin?
- Should route navigation live in a top app bar, bottom app bar, or split by device class?
- Should the product feel more austere or more sensual than it does now?
- Should Settings feel closer to an operator cockpit or a civic ledger?
- Should typography feel more literary, more technical, or exactly as it is now?
- On mobile, should the app preserve density or sacrifice density for clarity?

## 10. Change Protocol

For future client changes:

1. Read `CLIENT_SPEC.md` and `ARCHITECTURE.md`.
2. Identify which route or shared surface the change affects.
3. Preserve route/data contracts unless the task explicitly changes them.
4. Update this document if the change alters visual direction, route responsibilities, or generation constraints.
5. Implement the smallest viable change.
6. Verify the affected route still fits the contracts above.

## 11. Acceptance Checklist

A generated client change is not complete unless it:

- matches the route purpose it touches
- fits the shared visual language or intentionally updates it in this document
- works on desktop and mobile
- preserves existing app-state and routing boundaries unless intentionally changed
- avoids unrelated rewrites
- keeps the client recognizably map-native and operator-aware
