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
- move between tiles, beacons, and live call state

Must include:

- map or map-like world surface
- full-viewport map usage below the app bar
- pannable and zoomable map interaction
- selected-place and selected-beacon detail
- beacon/call affordance
- beacon composition and recent beacon activity visibility

Desired feel:

- spatial first
- dense enough to feel alive
- readable on laptop and mobile without collapsing into a generic feed

Layout rule:

- In World, the map owns the screen.
- The map should fill the available viewport beneath the app bar.
- The map must remain pannable and zoomable while the user is in World.
- Place detail, beacon actions, beacon composition, and recent activity should appear as overlays, sheets, drawers, or anchored cards on top of the map rather than as stacked panels that push the map down the page.
- The app bar is the only persistent non-overlay chrome that should reduce map height.

Beacon contract:

- Public place conversation is organized into NIP-29 groups called beacons.
- The stable id of a beacon is the canonical `geohash8` for that place.
- Each beacon should carry geohash tags for every prefix length from `1` through `8`.
- A beacon is permanently bound to its `geohash8` and must not be moved to a different tile after creation.
- The beacon, not the bare map tile, is the public social container for posts, membership, moderation, and LiveKit activity.
- LiveKit calls happen within the selected beacon context rather than as a standalone geohash room entered directly from the map.
- The LiveKit room id for a beacon should be `beacon:<geohash8>`.
- Beacon moderation is owned by the beacon's NIP-29 admins and owners.
- Relay policy and relay auth must override beacon-local moderation decisions when they conflict.

Beacon post contract:

- Public beacon posts remain kind `1` events.
- Beacon posts must be scoped to the selected beacon through an `h` tag that matches the beacon id.
- The client should treat kind `1` events tagged to the active beacon as that beacon's public conversation stream.
- The client should not treat raw geohash-tagged kind `1` notes as the primary public conversation model for World.
- Beacon-scoped kind `1` events should remain in `World` and should not be routed into `Pulse`.

Marker contract:

- Markers aggregate by canonical geohash tile and its corresponding beacon.
- Render one marker per visible beacon.
- A tile with no beacon should render no marker.
- Markers should present the beacon avatar as the primary visual identity.
- If no avatar exists, the marker should fall back to a stable placeholder treatment derived from beacon metadata.
- Marker styling may communicate live-call presence, but markers should not display post counts or participant counts.
- Tapping or clicking a marker selects the beacon for that exact geohash tile.
- Selecting a marker should immediately open that beacon's context, but should not auto-join LiveKit just because the map was clicked.
- Marker selection should not require a secondary confirmation step before entering the beacon context.
- After selection, beacon detail should appear in an anchored card behind the avatar marker without giving up the full-screen map.
- Marker-driven detail must preserve a fast path into the exact beacon conversation and its call controls after presence has been set.
- Marker placement must stay anchored to the map as the user pans or zooms.

Map click contract:

- Clicking empty map background resolves the nearest `geohash8`, drops a temporary pin, and opens a bottom overlay.
- The initial bottom overlay state should offer exactly two actions: `Light Beacon` and `Cancel`.
- `Cancel` should dismiss the pin and close the bottom overlay without changing call state.
- `Light Beacon` should replace the action state with a beacon-creation form in the same bottom overlay.
- If a beacon already exists for the resolved `geohash8`, the client should open that existing beacon rather than offering duplicate creation.
- A background map click is distinct from clicking a marker.

Beacon creation overlay contract:

- The beacon-creation form should include `name`, `pic`, and `about` fields.
- The creation form should expose `Submit` and `Cancel` actions.
- `Submit` should create the beacon bound to the pinned `geohash8` and then open that beacon context.
- Beacon creation should be idempotent at the `geohash8` level: if another client creates the beacon first, submit should return and open the existing beacon instead of surfacing a duplicate-creation error.
- `Cancel` should close the creation form and remove the temporary pin.
- The creation UI should make it clear that the beacon will be permanently bound to that location once created.

Marker click contract:

- Clicking a beacon marker selects that marker's exact beacon.
- Marker click should open beacon detail and expose call controls scoped to that beacon rather than immediately joining media.

Marker card contract:

- The marker detail surface represents exactly one beacon and its geohash tile.
- It should make the selected place, beacon identity, and beacon moderation context obvious.
- The card's top-left corner should be anchored at the visual center of the beacon avatar.
- The card should sit behind the avatar marker using z-index so the avatar remains the foreground anchor.
- It should show the beacon avatar, beacon name, and beacon about text.
- It should show beacon counters inside the card rather than inside the marker, including at minimum total beacon posts and live participant count.
- It should show the latest beacon activity preview for that exact beacon when one exists.
- It should show the current participant roster for that beacon when a call is active.
- Participant rows should expose media-state indicators for mic, camera, screenshare, and deafen.
- Profile inspection from the marker detail surface should route into Pulse.

### Chats `/app/chats`

Purpose:

- show the private inbox for direct messages and group DMs

Must include:

- clear distinction between DM threads and group DM threads
- active-call visibility for private threads
- obvious routing back to `World` and `Pulse` for public place context

Desired feel:

- conversational and private, without duplicating the public place surface

### Pulse `/app/pulse`

Purpose:

- inspect people and non-beacon note context

Must include:

- profile context
- authored notes or note detail context for non-beacon public events
- relationship back to place and thread surfaces

Behavior rules:

- Beacon-scoped posts identified by beacon `h` tags do not open in `Pulse`.
- `Pulse` may expose author profiles for people active in beacons, but the beacon conversation itself stays in `World`.

Desired feel:

- more intimate than World
- still obviously part of the same product

### Settings `/app/settings`

Purpose:

- expose client identity controls, relay context, and operator controls

Must include:

- three independently collapsible sections: `Keys`, `Relays`, `Admin`
- `Keys` support for generating local Nostr keypairs
- `Keys` support for importing existing private keys (`nsec` or 64-char hex)
- `Keys` support for holding multiple local keypairs in an in-browser keyring
- `Keys` support for selecting which stored local keypair is currently active
- `Keys` support for removing individual local keypairs and clearing the full keyring
- visible session identity state showing whether the client is using relay bootstrap identity or a locally managed key
- generated/imported key material shown back for the active local keypair so it can be copied or recovered
- policy and standing workflows
- room permission workflows
- audit visibility

Behavior rules:

- `Keys` and `Relays` are always available.
- `Admin` remains a distinct section within Settings instead of a separate product surface.
- `Admin` should open automatically when the current session or connected signer matches the relay operator pubkey.
- Local keys affect the in-app client identity used for notes and place presence; the app may store multiple keypairs but only one local keypair is active at a time.
- Privileged admin signing may still rely on the browser signer flow.

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
