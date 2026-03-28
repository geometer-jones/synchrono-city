<!-- /autoplan restore point: /Users/peterwei/.gstack/projects/geometer-jones-synchrono-city/main-autoplan-restore-20260327-010331.md -->
# Client Tasks

This document turns `CLIENT_SPEC.md` into an implementation backlog for `apps/web`.

Use it with:

- `CLIENT_SPEC.md` for the UI contract
- `ARCHITECTURE.md` for interaction and system behavior

Status values:

- `todo`
- `in progress`
- `blocked`
- `done`

## Objective

Bring the current web client into alignment with the client spec using the smallest viable sequence of changes.

Primary target:

- make `World` a full-screen, map-owned surface below the app bar
- make marker interaction the primary beacon-selection mechanism and gate media join behind explicit beacon detail actions
- move World support UI into overlays instead of page-stacked panels
- keep routing, app-state boundaries, and the persistent call overlay intact

## Relevant Components

- `apps/web/src/routes/app-shell.tsx`
- `apps/web/src/routes/world-route.tsx`
- `apps/web/src/components/map-preview.tsx`
- `apps/web/src/components/call-overlay.tsx`
- `apps/web/src/app-state.tsx`
- `apps/web/src/data.ts`
- `apps/web/src/styles.css`
- `apps/web/src/router.tsx`
- `apps/web/src/app.test.tsx`

## Design Decisions Locked During Review

### World interaction hierarchy

The `World` route must follow this order of operations:

1. The map is the primary canvas.
2. Marker tap or click selects a beacon and opens beacon detail.
3. Beacon detail exposes identity, recent activity, moderation context, and live roster.
4. Media join is a deliberate action from beacon detail, not a side effect of map selection.
5. The global call overlay appears only after a successful LiveKit join.

This decision supersedes any earlier wording that implied marker selection should auto-join media.

If the user is already live in one beacon and selects a different beacon on the map, the client should keep the current call active, open the newly selected beacon detail safely, and relabel the action as `Switch call` instead of silently moving the user.

### World screen hierarchy

On first scan, the user should read the screen in this order:

1. current map scene
2. selected beacon identity
3. current beacon activity and people
4. optional actions such as post, inspect profile, or join call

World should not compete with its own support UI. The overlays exist to explain the selected beacon without taking screen ownership away from the map.

### World structure

```text
APP SHELL
|-- app bar
`-- WORLD
    |-- full-screen map surface
    |   |-- avatar markers
    |   `-- temporary pin for empty-map selection
    |-- anchored beacon detail card
    |   |-- beacon identity
    |   |-- recent activity preview
    |   |-- participant roster
    |   `-- explicit actions: join call, write note, inspect profile
    `-- bottom sheet
        |-- empty-map actions: Light Beacon / Cancel
        `-- beacon creation form: name / pic / about / Submit / Cancel
```

### Interaction state coverage

The client must specify what the user sees in non-happy-path states. Backend correctness is not enough.

| Feature | Loading | Empty | Error | Success | Partial |
|---------|---------|-------|-------|---------|---------|
| World bootstrap | Full-map loading veil with route title and one-line status copy, while preserving app chrome | If bootstrap returns no visible beacons, show an empty-world HUD with warm copy, primary `Light Beacon`, and secondary guidance to pan the map | Replace the loading veil with a retry state that explains the world could not load and offers `Retry` plus a path to `Chats` or `Settings` | Reveal the live map with markers and the last selected viewport restored | If cached world data exists but refresh fails, keep stale markers visible and show a subtle "connection degraded" banner |
| Empty visible viewport | Keep map interactive while nearby beacon query resolves | Explain that no beacon is lit in this view yet, invite the user to light the first beacon here, and keep a secondary cue to pan or zoom for nearby activity | If viewport query fails, keep the map visible and show a non-blocking inline error instead of wiping the world surface | As soon as a beacon becomes visible, remove the empty HUD without route transition | If only some markers load, show the markers that exist and an understated note that nearby activity may be incomplete |
| Empty-map click and beacon creation sheet | Bottom sheet slides in with a temporary pin and a short "resolving location" state if geohash lookup is still pending | First sheet state shows `Light Beacon` and `Cancel`; second sheet state explains no beacon exists here yet and that creation permanently binds the beacon to this location | If creation fails, keep the sheet open, preserve entered values, explain the failure plainly, and offer `Retry` plus `Cancel` | On success, close the creation form, keep the map anchored, and open the new beacon detail card | If another user creates the beacon first, treat it as a race won elsewhere, resolve the existing beacon, and open that detail state instead of surfacing a terminal error |
| Selected beacon detail card | Show skeleton rows for identity, activity, and roster in the anchored card while detail hydrates | If the beacon has no posts yet, say it is newly lit, show zero activity warmly, and push the user toward the first note or first join action | If beacon detail fails to hydrate, keep the selected marker active and replace card content with retryable error copy | Card shows beacon identity first, then activity preview, then roster, then explicit actions | If activity loads before roster or vice versa, render whichever is available and label the missing section as still loading |
| Explicit LiveKit join | Disable repeated taps and show joining progress inside the beacon card button itself | If no one else is present yet, joining still succeeds and the card explains the user is the first live participant | If token vending or room connect fails, keep the user in beacon detail, explain that media did not connect, and offer `Try again` without dropping selection | Transition from beacon card join action to persistent global call overlay while leaving beacon detail intact | If media connects with degraded capabilities, show connected state with a capability warning instead of pretending everything worked |
| Global call overlay | Show compact connecting state with mic and camera controls visibly disabled until the room is ready | Minimized overlay should still communicate that the user is connected even when no remote participants are present | If the call drops, preserve overlay position, explain that the call ended or disconnected, and offer reconnect when valid | Overlay shows active room, elapsed time, media controls, and explicit leave action across route changes | If signaling drops but local selection remains valid, keep the beacon selected and downgrade the overlay to reconnecting instead of tearing down the entire context |
| Chats inbox | Show thread list skeletons and keep route framing visible | If there are no DMs or group DMs, present a dedicated empty inbox state that points back to `World` as the way to start from place context | If inbox fetch fails, explain that private threads could not load and offer `Retry` | Render unread-first thread list with thread detail when selected | If thread list loads but selected thread fails, keep the list usable and isolate the failure to the detail pane |
| Pulse route | Show profile/feed skeletons that match Pulse rhythm instead of generic blocks | If no profile or feed items match, explain what Pulse is for and point users back to `World` for beacon activity | If Pulse data fails, show inline retry copy without collapsing the whole app shell | Render people and non-beacon public context with clear separation from World content | If some relay-backed feed lanes fail, show available lanes and label the missing lane as temporarily unavailable |

### User journey storyboard

| Step | User does | User feels | Plan specifies? |
|------|-----------|------------|-----------------|
| 1 | Lands in the app shell or enters `World` from splash | Oriented but curious, should feel like they entered a living civic map rather than a dashboard | Yes, the map is the primary canvas and app chrome stays subordinate |
| 2 | Sees no beacon in the current viewport | Brief uncertainty, then possibility, the place is quiet but not broken | Yes, empty World should explain that no beacon is lit here yet and offer `Light Beacon` as the primary action |
| 3 | Taps a visible marker | Focused, inspecting a real place without fear of accidental commitment | Yes, marker selection opens beacon detail first and does not auto-join media |
| 4 | Reads beacon identity, activity, and roster | Grounded, this is a specific place with real people and recent context | Yes, the anchored card hierarchy is identity first, activity second, people third, actions fourth |
| 5 | Clicks bare map and chooses to create a beacon | Intentional, slightly ceremonial, aware this action binds a social surface to a real location | Yes, beacon creation copy and flow should feel restrained but weighty rather than chat-room casual |
| 6 | Submits beacon creation | Confident if successful, not punished if another user won the race first | Yes, create-or-return-existing resolves races into the existing beacon instead of surfacing a terminal error |
| 7 | Explicitly joins live media from beacon detail | Committed, stepping into live presence rather than triggering a side effect | Yes, join is explicit from beacon detail and transitions into the persistent call overlay |
| 8 | Navigates while still in a call | Reassured that presence persists and the product has not lost context | Yes, the global call overlay persists across route changes |
| 9 | Experiences a join failure or dropped call | Momentary frustration, but should still feel located and in control | Yes, failures keep beacon detail intact, explain what happened plainly, and offer reconnect or retry |

### Emotional arc rules

- First 5 seconds: the product should feel spatial, intentional, and inhabited, not like a generic admin dashboard.
- First 5 minutes: the user should understand that beacon selection is safe to inspect, while media join is a separate commitment.
- Long-term relationship: the app should make place-claiming and operator control feel trustworthy, legible, and durable.
- Beacon creation language should be ceremonial but restrained. "Lighting" a beacon should feel like opening a meaningful social surface in a real place, not spinning up another disposable room.

### Specific UI patterns to avoid design drift

- Desktop `World` uses an anchored beacon detail card behind the selected avatar marker.
- Mobile `World` uses a bottom sheet tied to the selected beacon instead of a shrunken floating desktop card.
- The plan should not use interchangeable language such as "overlay, anchored card, drawer, or sheet" for the same interaction. The viewport-specific pattern is now fixed.
- The map remains the only full-bleed visual anchor. Secondary UI earns space by explaining the selected beacon or enabling the next deliberate action.
- Marker visuals should privilege beacon identity over counts or decorative chrome.
- Motion should be restrained and functional: marker selection reveals the anchored card or bottom sheet, bottom-sheet transitions should preserve map context, and call-overlay transitions should communicate connection state rather than decorative flourish.
- Copy should use product language tied to place and presence. Avoid generic SaaS phrases such as "create room", "launch experience", or "unlock connection".

### Design system alignment

`DESIGN.md` now exists in this repo and is the design source of truth for `apps/web`. `CLIENT_SPEC.md` still defines route contracts and generation constraints, while `DESIGN.md` defines the shared visual system and route-level design rules.

Existing design decisions to reuse:

- `World` remains dark, atmospheric, editorial, and map-first rather than becoming a bright generic dashboard.
- Accent language should stay in the warm orange/coral family with cool atmospheric support, matching the current baseline described in `CLIENT_SPEC.md`.
- Serif display moments paired with practical sans-serif UI text remain the default typography direction unless a future design-system document replaces them.
- `app-bar`, `app-nav`, `world-hud-card`, `world-sheet`, `marker-card`, and `call-overlay` are the existing product vocabulary and should be extended instead of replaced with parallel component patterns.
- Governance surfaces in `Settings` should continue to feel like part of the same product family rather than a detached back-office console.

Alignment rules for new or changed UI:

- New `World` work should extend the existing map, marker, sheet, and overlay language instead of introducing a second panel system.
- New beacon-specific states should inherit the same visual family as existing `world-hud-card`, `world-sheet`, and `marker-card` treatments.
- Shared interactions that cross routes belong in reusable components or `styles.css`, not route-local one-off visual systems.
- If a future design pass changes typography, color tokens, spacing scale, or motion language across the product, update `DESIGN.md` first and then update this task plan.

### Responsive and accessibility rules

Viewport behavior must be intentional by breakpoint, not reduced to "stack it on mobile."

#### Desktop

- `World` uses the full-screen map beneath the app bar.
- Selected beacon detail appears as an anchored card behind the marker avatar.
- The global call overlay sits above the lower viewport edge without obscuring the primary map interaction zone.

#### Tablet

- `World` keeps the map dominant, but beacon detail may grow wider and detach slightly from the avatar anchor when needed for readability.
- Any bottom sheet used in intermediate widths must preserve visible map context behind it.

#### Mobile

- Bottom navigation remains pinned to the viewport edge.
- When active, the global call overlay sits above the bottom navigation.
- The selected-beacon bottom sheet docks above both the call overlay and bottom navigation, with a bounded max height so the map remains visible behind it.
- Opening beacon detail must not hide active-call state or strand the user without route navigation.

Accessibility requirements:

- Minimum touch target size for all primary interactive elements is `44px`.
- Beacon markers, anchored cards, sheets, and call controls must be reachable by keyboard in a logical order.
- Marker selection must have a visible focus state that is distinct from hover and active-call styling.
- The map route must expose clear landmarks for app navigation, map region, beacon detail, chats, and settings content.
- Beacon markers and call controls need descriptive accessible names that identify the beacon or action, not generic labels such as "button".
- Bottom-sheet open and close transitions must manage focus predictably and return focus to the triggering control when dismissed.
- Color contrast must meet accessible contrast standards for text, controls, and state indicators, especially within dark atmospheric surfaces.
- Status changes such as join success, join failure, reconnecting, and creation race resolution should be announced to assistive technology without forcing visual users through blocking dialogs.

## What already exists

- `DESIGN.md` now defines the shared design system for typography, color, materials, motion, and route-level rules.
- `CLIENT_SPEC.md` already defines the route contracts, current visual baseline, and the anti-dashboard product posture.
- `apps/web/src/routes/app-shell.tsx` already provides the top app bar, mobile bottom navigation, and persistent call-overlay mounting point.
- `apps/web/src/routes/world-route.tsx` already establishes the map-first route, selected place state, and marker-driven detail flow.
- `apps/web/src/components/map-preview.tsx` already provides the map/marker interaction layer that the beacon migration should extend.
- `apps/web/src/styles.css` already contains the shared product vocabulary for app shell, sheets, marker cards, and call overlay.

## NOT in scope

- Rebranding the client away from its current dark, atmospheric, editorial baseline.
- Replacing the existing app-shell or state-management architecture with a new frontend system.
- Turning `Settings` into a separate admin product with detached visual language.

## Task Backlog

### 1. App shell chrome and navigation

Status: `done`

Goal:

- establish the permanent app bar and nav model that World will sit beneath

Implementation notes:

- keep route paths unchanged
- implement the provisional nav placement rule from `CLIENT_SPEC.md`: top app bar on desktop, bottom app bar on mobile
- ensure the app bar becomes the only permanent non-overlay chrome above the World map

Likely files:

- `apps/web/src/routes/app-shell.tsx`
- `apps/web/src/styles.css`

Acceptance criteria:

- desktop shows navigation in the top app bar
- mobile shows navigation in a bottom app bar
- app chrome does not consume additional vertical space inside World beyond the app bar itself
- global call overlay still renders across routes

### 2. World full-screen map layout

Status: `done`

Goal:

- convert World from a stacked dashboard layout into a map-owned screen

Implementation notes:

- the map should fill the viewport below the app bar
- remove page-stacked panels from the primary World layout
- selected place information should no longer require the map to shrink or scroll out of view

Likely files:

- `apps/web/src/routes/world-route.tsx`
- `apps/web/src/components/map-preview.tsx`
- `apps/web/src/styles.css`

Acceptance criteria:

- entering `/app` shows a full-screen map below the app bar
- the map is pannable and zoomable
- clicking bare map background relocates presence to the clicked `geohash8`
- the map remains visible while interacting with place details
- the page no longer reads as a dashboard of stacked cards

### 3. Marker selection sets presence and opens beacon detail

Status: `done`

Goal:

- make marker tap/click the primary place-presence action

Implementation notes:

- selecting a marker should set the active place presence to that geohash
- selecting a marker should open the selected beacon detail without auto-joining LiveKit
- joining media should remain a clear follow-up action from the beacon detail surface
- selecting a different marker while already in a call should update selected beacon state without silently forcing the user into a different call

Likely files:

- `apps/web/src/routes/world-route.tsx`
- `apps/web/src/components/map-preview.tsx`
- `apps/web/src/app-state.tsx`
- `apps/web/src/data.ts`

Acceptance criteria:

- tapping/clicking a marker opens the selected beacon detail immediately
- the selected marker state is visually obvious
- the user does not need a second confirmation to inspect the selected beacon
- media join remains a separate explicit action
- marker numbers continue to represent note count only

### 4. Marker detail overlay/card

Status: `done`

Goal:

- surface place detail without leaving the map-owned World layout

Implementation notes:

- after marker selection, show place detail as an anchored beacon card on desktop and a selected-beacon bottom sheet on mobile
- the detail surface should make the current selected place obvious
- preserve a fast path into geo-chat, place-note workflows, and explicit media join from the overlay

Likely files:

- `apps/web/src/routes/world-route.tsx`
- `apps/web/src/components/map-preview.tsx`
- `apps/web/src/styles.css`

Acceptance criteria:

- selected place detail appears on top of the map
- overlay includes latest note preview, place identity, and participant roster when active
- overlay does not force full route navigation away from World

### 5. Marker state visuals

Status: `done`

Goal:

- make marker states legible while preserving the contract defined in `CLIENT_SPEC.md`

Implementation notes:

- marker number shows note count only
- active call state should be visually distinct without replacing the note count

Likely files:

- `apps/web/src/components/map-preview.tsx`
- `apps/web/src/styles.css`
- `apps/web/src/data.ts`

Acceptance criteria:

- empty tiles do not render markers
- active-call tiles with zero notes render `0`

Current state:

- marker note-count and active/selected state are implemented

### 6. World note and action workflows inside overlays

Status: `done`

Goal:

- move note creation and place actions into the map-layer UI model

Implementation notes:

- remove dependence on large inline form sections in World
- keep note creation close to selected-place context
- preserve room/call actions where they remain meaningful after marker selection opens beacon detail

Likely files:

- `apps/web/src/routes/world-route.tsx`
- `apps/web/src/app-state.tsx`
- `apps/web/src/styles.css`

Acceptance criteria:

- place note composition is available from the selected place overlay or sheet
- the user can reach geo-chat from the selected place state
- actions feel tied to the selected location rather than to a dashboard panel

### 7. Chats, Pulse, and Settings visual alignment

Status: `done`

Goal:

- align the other routes with the updated app shell and visual system without flattening them into the same layout

Implementation notes:

- World should remain the most map-dominant route
- Chats should feel denser and conversational
- Pulse should feel more intimate
- Settings should remain integrated rather than becoming a detached admin console

Likely files:

- `apps/web/src/routes/chats-route.tsx`
- `apps/web/src/routes/pulse-route.tsx`
- `apps/web/src/routes/settings-route.tsx`
- `apps/web/src/routes/app-shell.tsx`
- `apps/web/src/styles.css`

Acceptance criteria:

- all app routes inherit the same product language
- route differences remain clear and intentional
- Settings still feels like part of Synchrono City rather than a separate back office

### 8. Responsive behavior and mobile polish

Status: `done`

Goal:

- make the new shell and World interaction model actually usable on mobile

Implementation notes:

- preserve the full-screen map concept
- use bottom navigation on mobile unless the spec changes
- ensure selected-place overlays and call controls do not fight for the same screen real estate

Likely files:

- `apps/web/src/styles.css`
- `apps/web/src/routes/app-shell.tsx`
- `apps/web/src/routes/world-route.tsx`
- `apps/web/src/components/call-overlay.tsx`

Acceptance criteria:

- navigation remains reachable by thumb
- the map remains the primary surface on mobile
- marker selection, place detail, and call controls remain usable together on small screens

### 9. Test coverage for the new interaction model

Status: `done`

Goal:

- add minimal coverage for the new shell and World behavior

Implementation notes:

- prefer focused route and interaction tests over broad snapshots
- cover marker selection, explicit join behavior, and overlay rendering

Likely files:

- `apps/web/src/app.test.tsx`
- `apps/web/src/test/*`

Acceptance criteria:

- tests verify World renders in the new full-screen layout model
- tests verify marker selection opens beacon detail without auto-joining media
- tests verify explicit join controls trigger media join from beacon detail
- tests verify selected-place detail renders without route transition

## Recommended Order

1. App shell chrome and navigation
2. World full-screen map layout
3. Marker selection sets presence and opens beacon detail
4. Marker detail overlay/card
5. World note and action workflows inside overlays
6. Marker state visuals
7. Responsive behavior and mobile polish
8. Chats, Pulse, and Settings visual alignment
9. Test coverage for the new interaction model

## Risk Notes

- The highest implementation risk is interaction conflict between marker selection, active call state, and the persistent call overlay.
- Marker selection and media join are now intentionally separate; the remaining risk is keeping that distinction legible on mobile and during active calls.
- Layout changes to `World` can easily spill into the app shell if the app bar, overlay, and call overlay are not designed together.

## Definition of Done

The client-spec implementation is not done until:

- World is map-owned and full-screen below the app bar
- marker selection opens beacon detail without auto-joining media
- media join happens from explicit controls inside beacon detail
- place detail lives on top of the map instead of below it
- desktop and mobile navigation behavior matches the chosen spec
- tests cover the new core interaction path

---

## Beacon Migration Backlog (2026-03-26)

### 10. Replace geohash room selection with beacon selection

Status: `todo`

Goal:

- make `World` select or create NIP-29 beacons instead of joining raw geohash rooms from map interaction

Implementation notes:

- marker tap should open beacon context without auto-joining LiveKit
- empty-map click should drop a temporary pin and open the bottom overlay flow
- beacon identity is the bare `geohash8`

Likely files:

- `apps/web/src/routes/world-route.tsx`
- `apps/web/src/components/map-preview.tsx`
- `apps/web/src/app-state.tsx`
- `apps/web/src/data.ts`

Acceptance criteria:

- clicking empty map background drops a pin and opens `Light Beacon` / `Cancel`
- clicking an existing beacon marker opens that beacon's detail state
- the client no longer auto-joins media as a side effect of map selection alone

### 11. Add beacon creation bottom-sheet flow

Status: `done`

Goal:

- implement the bottom overlay contract for beacon creation

Implementation notes:

- first state: `Light Beacon` and `Cancel`
- second state: `name`, `pic`, `about`, `Submit`, `Cancel`
- `Submit` should follow create-or-return-existing behavior so duplicate beacon creation does not surface as a terminal error

Likely files:

- `apps/web/src/routes/world-route.tsx`
- `apps/web/src/app-state.tsx`
- `apps/web/src/api.ts`
- `apps/web/src/styles.css`

Acceptance criteria:

- the overlay opens from a dropped pin
- submit creates or resolves the beacon for that `geohash8`
- cancel removes the temporary pin and closes the overlay
- the UI makes the location binding feel permanent and explicit

### 12. Migrate World conversation to beacon-scoped kind `1` events

Status: `todo`

Goal:

- move public place posting and reading from raw geohash notes to beacon-scoped notes

Implementation notes:

- load and publish kind `1` events with `h=<geohash8>`
- stop treating raw geohash-tagged notes as the primary World conversation source
- keep beacon-scoped conversation inside `World`

Likely files:

- `apps/web/src/nostr.ts`
- `apps/web/src/social-payload.ts`
- `apps/web/src/app-state.tsx`
- `apps/web/src/routes/world-route.tsx`
- `apps/concierge/internal/httpapi/server.go`
- `apps/concierge/internal/social/service.go`
- `apps/concierge/internal/httpapi/server_test.go`

Acceptance criteria:

- beacon activity in World is keyed by beacon `h` scope
- posting from World produces beacon-scoped kind `1` events
- beacon posts do not route into `Pulse`

### 13. Replace numeric markers with avatar markers and attached cards

Status: `done`

Goal:

- render beacon identity and metadata directly on the map instead of numeric note-count markers

Implementation notes:

- marker foreground is the beacon avatar
- attached card sits behind the avatar with its top-left corner anchored at the avatar center
- card shows beacon name, about, total post count, live participant count, latest activity, and roster

Likely files:

- `apps/web/src/components/map-preview.tsx`
- `apps/web/src/routes/world-route.tsx`
- `apps/web/src/styles.css`
- `apps/web/src/data.ts`

Acceptance criteria:

- markers no longer show counts inside the marker itself
- selected beacon card renders behind the avatar anchor
- card counters and roster stay legible on desktop and mobile

### 14. Gate LiveKit join behind beacon context

Status: `in progress`

Goal:

- make media join an explicit action within the selected beacon rather than a map-click side effect

Implementation notes:

- explicit beacon selection and explicit join UI already exist in `world-route.tsx`
- remaining work is the contract cutover so room id becomes `beacon:<geohash8>` end-to-end
- beacon selection and media join should remain separate state transitions
- the global call overlay should continue to persist across route changes

Likely files:

- `apps/web/src/app-state.tsx`
- `apps/web/src/livekit-session.ts`
- `apps/web/src/components/call-overlay.tsx`
- `apps/web/src/routes/world-route.tsx`
- `apps/concierge/internal/httpapi/server.go`
- `apps/concierge/internal/social/service.go`
- `apps/concierge/internal/httpapi/server_test.go`

Acceptance criteria:

- selecting a beacon does not auto-join media
- joining from beacon detail requests a token for `beacon:<geohash8>`
- leaving media keeps beacon detail intact unless the user also deselects the beacon

### 15. Keep Pulse out of beacon-thread content

Status: `todo`

Goal:

- enforce the new route boundary where `Pulse` handles profiles and non-beacon public events, not beacon conversation

Implementation notes:

- profile inspection from beacon cards should still open Pulse
- beacon activity previews and thread drill-down stay inside World
- filter or ignore beacon-scoped `h` posts in Pulse route logic

Likely files:

- `apps/web/src/routes/pulse-route.tsx`
- `apps/web/src/routes/world-route.tsx`
- `apps/web/src/data.ts`
- `apps/web/src/app-state.tsx`

Acceptance criteria:

- author profile navigation still works from beacon UI
- beacon notes never open in Pulse
- Pulse remains functional for non-beacon public events

### 16. Add focused tests for beacon workflows

Status: `in progress`

Goal:

- cover the new beacon interaction model with minimal, high-signal tests

Implementation notes:

- prefer route and state tests over broad snapshots
- existing route/state/map tests already cover map pin flow, explicit join, and avatar-card rendering basics
- remaining coverage should focus on beacon-scoped posting, Pulse exclusion, `beacon:` room ids, and rollout compatibility between legacy `g` and new `h` note scope

Likely files:

- `apps/web/src/routes/world-route.test.tsx`
- `apps/web/src/app-state.test.tsx`
- `apps/web/src/components/map-preview.test.tsx`
- `apps/web/src/nostr.test.ts`
- `apps/concierge/internal/httpapi/server_test.go`
- `apps/concierge/internal/social/service_test.go`

Acceptance criteria:

- tests verify map click opens beacon creation flow
- tests verify duplicate beacon creation resolves existing beacon cleanly
- tests verify beacon posts stay in World and do not route to Pulse
- tests verify LiveKit token requests use `beacon:<geohash8>`

## AUTOPLAN PHASE 1 — CEO REVIEW (2026-03-27)

### Repository Reconnaissance

Task classification: `New Feature` plan review.

Primary languages:

- TypeScript in `apps/web`
- Go in `apps/concierge`

Project structure and major directories:

- `apps/web` — React 19 + Vite client
- `apps/concierge` — Go API, policy, social, LiveKit token, and relay-auth boundary
- `deploy` and `docker-compose.yml` — local/runtime packaging
- top-level docs (`README.md`, `ARCHITECTURE.md`, `PROTOCOL.md`, `OPERATIONS.md`, `ROADMAP.md`, `DESIGN.md`) — product, protocol, and ops source of truth
- `runbooks` — operator incident docs

Application entry points:

- web: `apps/web/src/main.tsx`
- concierge API: `apps/concierge/cmd/concierge/main.go`
- relay shim: `apps/concierge/cmd/relay-shim/main.go`
- migrations: `apps/concierge/cmd/migrate/main.go`

Core modules and responsibilities:

- `apps/web/src/app-state.tsx` — client bootstrap, state graph, call lifecycle, relay refresh
- `apps/web/src/routes/world-route.tsx` — map-owned World route and beacon inspection flow
- `apps/web/src/components/map-preview.tsx` — mapbox/fallback map interaction and marker rendering
- `apps/web/src/beacon-projection.ts` — adapts place/note/call state into beacon-shaped UI objects
- `apps/web/src/nostr.ts` — publish/query relay events
- `apps/web/src/media-client.ts` and `apps/web/src/livekit-session.ts` — NIP-98/LiveKit media path
- `apps/concierge/internal/httpapi/server.go` — `/api/v1/*` boundary
- `apps/concierge/internal/social/service.go` — bootstrap, notes, call-intent social model

Dependency management:

- root `package.json` + `pnpm-lock.yaml`
- Go modules in `apps/concierge/go.mod`

Build/compilation system:

- web: `vite build` + `tsc -b`
- backend: `go build`/`go test`
- repo verify: root `pnpm verify`

Test framework and locations:

- frontend: Vitest + Testing Library in `apps/web/src/**/*.test.ts?(x)`
- backend: Go `testing` in `apps/concierge/internal/**/*_test.go`

Configuration and environment:

- root `.env.docker` and `.env.docker.example`
- `apps/web/.env.example`
- `apps/concierge/.env.example`
- `docker-compose.yml`

Shared utilities/common libraries:

- client normalization and model helpers in `apps/web/src/data.ts`, `apps/web/src/social-payload.ts`, `apps/web/src/nostr-utils.ts`
- backend shared persistence/contracts in `apps/concierge/internal/store`

Internal APIs and service boundaries:

- web talks to Concierge over `/api/v1/social/*`, `/api/v1/token`, `/api/v1/admin/*`
- web talks directly to relay via WebSocket Nostr events
- web talks directly to LiveKit/Blossom after Concierge or signed auth setup
- Concierge is the policy, token, and relay-local truth boundary

### Architecture Summary

System purpose:

- Synchrono City is a hostable, map-native social stack that turns place into the organizing primitive for public conversation and live presence.

Key modules:

- `apps/web` owns route/UI/state behavior.
- `apps/concierge` owns policy, bootstrap payloads, token vending, and social API contracts.
- Nostr/LiveKit/Blossom sit outside the repo as protocol/runtime dependencies.

Data flow between components:

```text
World route / map click
  -> app-state selection + API fetch
  -> Concierge bootstrap/call-intent/token endpoints
  -> relay publish/query for public notes
  -> LiveKit connect for media
  -> beacon projection back into World/Pulse/Chats UI
```

Where the requested change logically belongs:

- Primarily in the web World/beacon layer.
- But the plan is incomplete if it stops there, because beacon identity, note scope, and room naming currently cross the Concierge API and Nostr contract boundary.

### Step 0 — Nuclear Scope Challenge + Mode Selection

#### 0A. Premise Challenge

This plan is directionally right on the core problem. The product says place is the primitive, explicit presence matters, and beacons are the social object. The current codebase still runs on raw `place` + `geo:` semantics underneath a beacon-shaped UI, so the migration is solving a real mismatch rather than a hypothetical refactor.

The first blind spot is that the latest design doc in `~/.gstack/projects/geometer-jones-synchrono-city/peterwei-main-design-20260326-234346.md` is about study-circle office hours, not generic beacon plumbing. That does not make this plan wrong, but it means one premise must be explicit: this is an infrastructure-first migration intended to support later product wedges, not the wedge itself. If that premise is false, this plan is spending time on substrate before proving the host/circle job to be done.

The second blind spot is the `geohash8 == one canonical beacon forever` assumption. It aligns with the current architecture doc, but it may look foolish in 6 months if one venue or host needs multiple recurring circles in the same physical tile. If the product really wants "one social object per tile" long term, fine. If it wants "multiple durable rooms per venue," this plan is baking a harder constraint than the current backlog admits.

The third blind spot is scope. `CLIENT_TASKS.md` presents the work as a web-client backlog, but tasks 11, 12, and 14 change permanence, public-event scope, and room identity. Those are not frontend-only changes. If we "complete" this in `apps/web` alone, the user gets a split-brain system: beacon language in the UI, place/geo semantics in the backend.

Actual user/business outcome:

- give users a durable place object they can inspect safely
- keep World public conversation separate from Pulse
- make joining media a deliberate beacon action rather than an accidental map click

What happens if we do nothing:

- the codebase keeps lying to itself
- the UI says "beacon"
- the service layer says "place"
- calls say `geo:`
- public conversation still routes around the intended object model

That is not fatal today, but it compounds every future product bet.

#### 0B. Existing Code Leverage

| Sub-problem | Existing code | Reuse judgment |
|---|---|---|
| Beacon-shaped UI objects | `apps/web/src/beacon-projection.ts` | Reuse directly. Do not build a second projection layer. |
| Marker selection and explicit join | `apps/web/src/routes/world-route.tsx`, `apps/web/src/app-state.tsx` | Reuse. Extend selection/create states rather than replacing route structure. |
| Map interaction and viewport persistence | `apps/web/src/components/map-preview.tsx` | Reuse. This is already the right place for empty-map selection and marker behavior. |
| Social bootstrap / call intent transport | `apps/web/src/api.ts`, `apps/concierge/internal/httpapi/server.go`, `apps/concierge/internal/social/service.go` | Reuse endpoint shape, but promote the contract from place/geo to beacon semantics. |
| Media join lifecycle | `apps/web/src/media-client.ts`, `apps/web/src/livekit-session.ts` | Reuse. Change room naming and error handling, not the whole media stack. |
| Existing test harness | `apps/web/src/routes/world-route.test.tsx`, `apps/web/src/app-state.test.tsx`, `apps/web/src/components/map-preview.test.tsx`, Go server tests | Reuse. Add focused regression coverage instead of inventing a new harness. |

#### 0C. Dream State Mapping

```text
CURRENT STATE
UI and docs talk about beacons, but the persisted social contract is still
raw geohash places, `geo:` room ids, and geohash-tagged public notes.

          ---> THIS PLAN
               World selection, creation, public posting, and call join all
               center on an explicit beacon object with a clear World/Pulse
               boundary and deliberate live-presence entry.

                              ---> 12-MONTH IDEAL
                                   Beacon is a first-class durable object with
                                   canonical metadata, moderation/audit hooks,
                                   product-specific overlays (for example study
                                   circles), and a scaling story that does not
                                   require fetching the whole world at once.
```

Dream state delta:

- This plan moves toward the right object model.
- It does not yet answer host/cadence metadata, multi-circle-per-venue, or large-world query scaling.
- That is acceptable if those omissions are explicit and the contract migration is complete.

#### 0C-bis. Implementation Alternatives

```text
APPROACH A: UI-Only Beacon Shim
  Summary: Keep Concierge/place semantics as-is and translate them in the client.
  Effort:  S
  Risk:    High
  Pros:    Small diff in `apps/web`; fast to ship; no API coordination.
  Cons:    Permanent split-brain risk; hard rollout bugs around `h=` and `beacon:`;
           teaches the codebase two truths for the same concept.
  Reuses:  Existing web state and route code only.

APPROACH B: End-to-End Beacon Contract
  Summary: Update the web state, Concierge social contract, room naming, and note scope together.
  Effort:  M
  Risk:    Medium
  Pros:    One canonical concept; cleaner future for World/Pulse separation;
           easier to layer study-circle or other beacon-specific products later.
  Cons:    Touches more files; requires rollout sequencing; needs explicit compatibility handling.
  Reuses:  Existing route/app-state/media/api/test architecture on both web and Concierge.

APPROACH C: Wedge-First Study Circle Model
  Summary: Skip generic migration and jump straight to host/circle-specific metadata and flows.
  Effort:  L
  Risk:    High
  Pros:    Closer to the latest office-hours design doc; more user-visible differentiation.
  Cons:    Builds product-specific semantics on top of a still-misaligned core object model;
           higher chance of rework; too much scope for this backlog.
  Reuses:  Current map/call/beacon UI language, but needs more new product logic.
```

**RECOMMENDATION:** Choose Approach B because it fixes the real semantic mismatch without overreaching into a new wedge before the substrate is coherent.

#### 0D. SELECTIVE_EXPANSION Analysis

Complexity check:

- The visible backlog items touch more than 8 files even before the missing backend blast radius is counted.
- That is a smell if the plan tries to do protocol migration, visual marker replacement, creation flow, and route-boundary cleanup as loosely related frontend chores.

Minimum set that actually achieves the stated goal:

1. canonical beacon lookup/create flow
2. canonical public-note scope for World
3. canonical `beacon:` media join flow
4. canonical Pulse exclusion for beacon-thread content
5. focused tests for the new contract

Auto-decided blast-radius expansions, approved into scope:

- Add Concierge/API contract work to the plan for beacon create/lookup, call-intent naming, and bootstrap payload truth.
- Add rollout compatibility notes so `g`/`h` and `geo:`/`beacon:` transitions do not strand users mid-deploy.
- Add observability for creation conflicts, degraded world refresh, and token/connect failures.

Expansion scan:

- 10x check: the 10x version is not prettier markers. It is a durable beacon object that can later carry host identity, cadence, summaries, moderation, and product-specific community rituals.
- Delight opportunities: creation-race resolution that feels magical instead of error-like; stronger ceremony copy for "Light Beacon"; degraded-world banner that keeps map context; explicit "Switch call" state when inspecting another beacon mid-call; first-beacon empty-world guidance that feels alive instead of blank.
- Platform potential: if the contract is truly beacon-first, later products can attach richer metadata without redoing World/Pulse/call identity again.

Cherry-pick decisions:

- Accepted now: backend contract completion, rollout sequencing, observability hooks.
- Deferred, not load-bearing for this migration: host/cadence metadata, multi-circle-per-venue model, viewport-scaled beacon queries, browser E2E.

#### 0E. Temporal Interrogation

```text
HOUR 1
User opens World, taps a marker, inspects a beacon, does not get yanked into a call.

HOUR 6
User clicks empty map, lights a beacon, and if another user won the race they land
in the existing beacon instead of hitting a dead-end error.

DAY 7
Operators and users understand that World posts are beacon-bound and Pulse remains for
profiles / non-beacon public context.

MONTH 6
If beacon identity is still only geohash-bound with no higher-level room model,
product wedges like recurring circles may start to fight the model.
```

#### 0F. Mode Selection

Mode selected: `SELECTIVE EXPANSION`

Why:

- the current scope is mostly right
- the incomplete part is not "dream bigger"
- it is "finish the blast radius so the plan does not create two truths"

### CEO Dual Voices

#### CODEX SAYS (CEO — strategy challenge)

Attempted via `codex exec`, but the local Codex state database emitted repeated migration/path errors and never returned a usable strategic review. No reliable outside-voice output was produced.

#### CLAUDE SUBAGENT (CEO — strategic independence)

Unavailable in this environment. The required subagent tool is not exposed in this session.

#### CEO DUAL VOICES — CONSENSUS TABLE

```text
═══════════════════════════════════════════════════════════════
  Dimension                           Claude  Codex  Consensus
  ──────────────────────────────────── ─────── ─────── ─────────
  1. Premises valid?                   N/A     N/A     N/A
  2. Right problem to solve?           N/A     N/A     N/A
  3. Scope calibration correct?        N/A     N/A     N/A
  4. Alternatives sufficiently explored?N/A    N/A     N/A
  5. Competitive/market risks covered? N/A     N/A     N/A
  6. 6-month trajectory sound?         N/A     N/A     N/A
═══════════════════════════════════════════════════════════════
CONFIRMED = both agree. DISAGREE = models differ (-> taste decision).
Missing voice = N/A. Outside voices unavailable for this phase.
```

### Section 1: Architecture Review

The current plan is architecturally sound only if it becomes an end-to-end beacon contract. Right now tasks 10-16 mostly list web files, but the actual authority for bootstrap payloads, note creation, and call intent still lives in Concierge. That is a critical gap because a user cannot feel "durable beacon object" if persistence and room identity still disagree underneath the UI.

The clean architecture is:

```text
Map click / marker tap
  -> World route selection state
  -> app-state beacon intent
  -> Concierge beacon lookup/create + call intent
  -> Nostr beacon-scoped note publish/query
  -> LiveKit `beacon:<id>` room join
  -> beacon projection back to World / Pulse filters
```

Auto-decision:

- Expand the plan's likely-file list to include Concierge/API/protocol surfaces for the semantic changes it already claims.
- Keep the route/app-state/component architecture. Do not add a second state container or a beacon-specific API client parallel to `api.ts`.

### Section 2: Error & Rescue Map

The plan has good user-facing state coverage, but it still needs named failure handling at the contract seams. The dangerous failures here are not dramatic crashes. They are the quiet lies: a create flow that duplicates state, a Pulse feed that accidentally shows beacon-thread content, a call join that silently falls back to the wrong room name, or a World refresh that partially succeeds without telling the user which truth they are seeing.

```text
METHOD/CODEPATH                    | WHAT CAN GO WRONG                      | EXCEPTION/ERROR CLASS
-----------------------------------|----------------------------------------|-----------------------
empty-map beacon create            | duplicate create race                  | BeaconConflictError
empty-map beacon create            | invalid geohash / missing form fields  | BeaconValidationError
empty-map beacon create            | API timeout / 5xx                      | ApiError
World note publish                 | signer unavailable                     | MediaAuthError / SignerUnavailableError
World note publish                 | relay rejects event / bad payload      | RelayPublishError
beacon call intent                 | backend still returns `geo:` room id   | ContractMismatchError
LiveKit token join                 | token vending fails                    | ApiError
LiveKit connect                    | room connect fails after token issued   | LiveKitConnectError
Pulse filtering                    | beacon `h` posts leak into Pulse       | BeaconScopeFilterError
bootstrap refresh                  | stale cache kept but refresh fails      | ApiError

EXCEPTION/ERROR CLASS              | RESCUED? | RESCUE ACTION                            | USER SEES
-----------------------------------|----------|-------------------------------------------|-------------------------------
BeaconConflictError                | Y        | open existing beacon                       | existing beacon detail opens
BeaconValidationError              | Y        | keep sheet open, preserve inputs           | inline actionable error
ApiError (create/bootstrap)        | Y        | retry + degraded banner / retry CTA        | map stays visible, retry offered
SignerUnavailableError             | Y        | stay in World, block publish/join intent   | explicit signer-required copy
RelayPublishError                  | Y        | keep draft, surface retry                  | note not lost silently
ContractMismatchError              | N -> GAP | reject release until both sides agree      | should never ship silently
LiveKitConnectError                | Y        | preserve beacon detail, reconnect option   | media failed, selection remains
BeaconScopeFilterError             | N -> GAP | regression test + explicit filter path     | otherwise Pulse shows wrong content
```

### Section 3: Security & Threat Model

Beacon creation is a public-surface mutation. The plan currently describes permanence and ceremony, but it does not say who is allowed to light a beacon, how abuse is throttled, or whether creation is audited. That is a security hole disguised as product copy.

Threat table:

| Threat | Likelihood | Impact | Mitigation decision |
|---|---|---|---|
| beacon spam / beacon squatting | Medium | High | require existing relay auth boundary + rate limiting + audit event |
| oversized or hostile beacon metadata (`name`, `pic`, `about`) | High | Medium | length/type validation and sanitization at API boundary |
| unauthorized `beacon:` room join | Medium | High | token vending must enforce beacon room policy, not trust client room id |
| Pulse leakage of beacon-thread content | Medium | Medium | explicit filter + regression tests |

### Section 4: Data Flow & Interaction Edge Cases

The non-happy-path UX is mostly well-specified. The missing pieces are contract and concurrency edge cases, not screen polish.

```text
INPUT ──▶ VALIDATION ──▶ TRANSFORM ──▶ PERSIST ──▶ OUTPUT
  │           │             │             │            │
  │           │             │             │            └─ stale bootstrap? show degraded banner
  │           │             │             └─ duplicate beacon? open existing beacon
  │           │             └─ room id mismatch? reject and log
  │           └─ invalid form / invalid geohash? keep sheet open
  └─ empty map click? drop pin, resolve geohash, allow cancel
```

Interaction gaps that need to be explicit in the plan:

| Interaction | Edge case | Decision |
|---|---|---|
| create beacon | double-click submit | disable submit after first send until resolved |
| create beacon | user navigates away mid-submit | abort or safely ignore late response |
| active call + new marker selection | user inspects another beacon | keep current call, relabel CTA to `Switch call` |
| rollout window | one client publishes `h=` while another reads only `g` | require dual-read compatibility until cutover completes |

### Section 5: Code Quality Review

The main code-quality risk is permanent dual vocabulary. `joinPlaceCall: joinBeaconCall` already exists as a compatibility alias in `apps/web/src/app-state.tsx`. That is fine during migration, but the plan should state which legacy names stay as compatibility shims and which get retired when the beacon contract lands.

Auto-decision:

- keep one projection/state path
- avoid parallel "place" and "beacon" helpers that do the same thing
- add explicit cleanup notes for legacy `geo:` and raw geohash-room assumptions once migration is complete

### Section 6: Test Review

The plan says "add focused tests," which is right, but not complete enough yet. The critical regressions are contract regressions, not only UI regressions.

Required additions to task 16:

- create-or-return-existing race resolution
- `beacon:` room id request path and failure fallback
- Pulse exclusion for beacon-thread content
- signer-missing and relay-reject note publish failures
- degraded bootstrap refresh that preserves visible map state

### Section 7: Performance Review

Nothing in this migration looks like an immediate p99 disaster for the current scale. The real performance risk is architectural drift: if beacon creation and selection become canonical while bootstrap still returns the whole world, the first scaling pain will be payload size and repeated client-side projection work, not marker rendering itself.

Auto-decision:

- keep viewport-scaled beacon query redesign out of this PR
- record it as deferred work because it is real, but not required to stop the semantic split-brain now

### Section 8: Observability & Debuggability Review

This plan needs observable counters and structured logs for the exact moments users will blame on "the map is broken." At minimum:

- beacon create attempted / created / conflict-resolved / failed
- world bootstrap refreshed / degraded / failed
- call intent resolved with room prefix and source
- LiveKit token request failed
- Pulse filter dropped beacon-scoped items

If these are not logged and counted, every future bug report will collapse into "sometimes it doesn't work."

### Section 9: Deployment & Rollout Review

This is the highest operational blind spot in the current plan. Shipping `h=`-scoped World writes before readers understand them breaks conversation discovery. Shipping `beacon:` room ids before token vending and call-intent understand them breaks live presence. Shipping Pulse exclusion before World dual-read may hide legitimate posts.

Required rollout sequence:

```text
1. ship backend dual-read / dual-name support
2. ship web read compatibility
3. ship web write path to beacon contract
4. verify bootstrap, create, post, join, and Pulse exclusion
5. remove legacy compatibility only after soak
```

Rollback posture:

- web-only revert if UI breaks but backend remains backward compatible
- feature-flag or compatibility-path rollback if contract mismatch appears
- do not ship a one-way cutover with no dual-read period

### Section 10: Long-Term Trajectory Review

This migration improves long-term coherence. Reversibility is `3/5`: reversible with compatibility layers, not reversible if the product starts emitting irreversible beacon semantics without a fallback read path.

The debt item to watch is identity rigidity. If the product later wants multiple durable communities within one venue tile, `geohash8` as the sole public id may become the next constraint to unwind. That is not a blocker for this plan, but it is too important to leave implicit.

### Section 11: Design & UX Review

The plan is already materially stronger than a normal engineering backlog on hierarchy, empty/error states, emotional arc, responsive behavior, and design-system alignment. That work is real. The remaining CEO-level UX issue is product truth: the UI promises permanence and intentionality, so the implementation cannot quietly fall back to ad-hoc place semantics under the hood without eroding trust.

### NOT in scope

- Host/cadence/study-circle metadata, because that is a product wedge decision beyond this contract migration.
- Multi-circle-per-venue modeling, because the current architecture still assumes one canonical beacon per `geohash8`.
- Viewport-scoped beacon discovery/query redesign, because it is a scaling follow-up rather than a blocker for semantic coherence.
- Browser E2E harness, because focused integration coverage is enough for this migration and the relay-native flow is still in motion.

### What already exists

- `beacon-projection.ts` already gives the client a beacon-shaped read model.
- `world-route.tsx` already enforces safe inspection before join.
- `app-state.tsx` already owns the call lifecycle and is the right place for contract migration.
- Concierge social/bootstrap/call-intent endpoints already exist and should be extended, not replaced.
- Existing Vitest and Go tests already cover the right seams for focused regression work.

### Failure Modes Registry

```text
CODEPATH                        | FAILURE MODE                         | RESCUED? | TEST? | USER SEES?                     | LOGGED?
--------------------------------|--------------------------------------|----------|-------|--------------------------------|--------
beacon create submit            | duplicate create race                | Y        | N     | existing beacon opens          | N
beacon create submit            | validation failure                   | Y        | N     | inline error                   | N
World beacon note publish       | signer unavailable                   | Y        | N     | signer-required message        | N
World beacon note publish       | relay rejects `h=` event             | Y        | N     | retryable publish failure      | N
beacon call join                | token request fails                  | Y        | N     | beacon detail stays, retry CTA | N
beacon call join                | backend returns legacy room id       | N        | N     | silent semantic mismatch       | N
Pulse route filtering           | beacon content leaks into Pulse      | N        | N     | wrong route content            | N
bootstrap refresh               | stale data shown after refresh fail  | Y        | N     | degraded banner                | N
```

Critical gaps:

- `backend returns legacy room id`
- `beacon content leaks into Pulse`

Both are silent-contract failures unless the plan adds explicit tests and logging.

### Completion Summary

```text
+====================================================================+
|            MEGA PLAN REVIEW — COMPLETION SUMMARY                   |
+====================================================================+
| Mode selected        | SELECTIVE EXPANSION                         |
| System Audit         | Beacon UI exists; backend truth still place |
| Step 0               | Approach B selected; backend blast radius   |
| Section 1  (Arch)    | 2 major issues found                        |
| Section 2  (Errors)  | 8 error paths mapped, 2 CRITICAL GAPS       |
| Section 3  (Security)| 2 issues found, 1 High severity             |
| Section 4  (Data/UX) | 4 edge cases mapped, 1 rollout hazard       |
| Section 5  (Quality) | 1 issue found                               |
| Section 6  (Tests)   | key gaps identified                         |
| Section 7  (Perf)    | 1 deferred scaling issue                    |
| Section 8  (Observ)  | 4 observability gaps found                  |
| Section 9  (Deploy)  | 1 critical rollout risk flagged             |
| Section 10 (Future)  | Reversibility: 3/5, debt items: 1           |
| Section 11 (Design)  | 1 product-truth issue                       |
+--------------------------------------------------------------------+
| NOT in scope         | written (4 items)                           |
| What already exists  | written                                     |
| Dream state delta    | written                                     |
| Error/rescue registry| 9 methods, 2 CRITICAL GAPS                  |
| Failure modes        | 8 total, 2 CRITICAL GAPS                    |
| TODOS.md updates     | pending Phase 3                             |
| Scope proposals      | 3 approved into plan blast radius           |
| CEO plan             | skipped by /autoplan                        |
| Outside voice        | unavailable                                 |
| Lake Score           | 4/4 recommendations chose complete option   |
| Diagrams produced    | architecture, data flow, rollout            |
| Stale diagrams found | 0                                            |
| Unresolved decisions | 1 (premise gate below)                      |
+====================================================================+
```

### Premise Gate

Human confirmation required before Phase 2:

1. This plan is intentionally infrastructure-first. It is meant to make the beacon contract coherent before product-specific wedges like study-circle office hours are layered in.
2. `geohash8` remains the canonical beacon identity for this migration, even though future products may eventually need more than one durable community object per venue/tile.
3. The migration is not allowed to stop at frontend semantics. Concierge/API/protocol work is in scope anywhere the current contract would otherwise stay `place`/`geo:` while the UI becomes `beacon`.

Premise gate status:

- confirmed by the user on 2026-03-27

## AUTOPLAN PHASE 2 — DESIGN REVIEW (2026-03-27)

### Step 0: Design Scope Assessment

Overall design completeness: `9/10`.

This plan is already unusually strong on design detail for an implementation backlog. It specifies hierarchy, state coverage, emotional arc, responsive behavior, and accessibility in plain language. What keeps it from a 10 is not more visual invention. It is plan drift. Several `World` interaction tasks are still marked `todo` even though the current code already ships those surfaces, which would pull an implementer toward redoing UI that is already working while the real remaining work is contract truth.

`DESIGN.md` exists in this repo, so all design decisions stay calibrated against the current dark, atmospheric, editorial system rather than drifting into a second visual language.

Existing design leverage to preserve:

- `apps/web/src/routes/world-route.tsx` already implements the core selected-beacon flow, creation sheet, and explicit join controls.
- `apps/web/src/components/map-preview.tsx` already owns marker interaction, marker-card attachment, and viewport persistence.
- `apps/web/src/components/call-overlay.tsx` already carries the persistent live-call vocabulary.
- `apps/web/src/styles.css` already contains the product language named in `DESIGN.md`.

Focus areas auto-decided: all 7 design dimensions. The plan has meaningful UI scope, and the remaining risks are spread across hierarchy, contract-state clarity, responsive continuity, and accessibility.

### Design Dual Voices

#### CODEX SAYS (design — UX challenge)

Attempted via `codex exec`, but the local CLI could not complete a usable response in this environment. Model refresh and response streaming failed repeatedly under the current restricted network/runtime conditions, so there is no reliable outside-voice design critique to include.

#### CLAUDE SUBAGENT (design — independent review)

Unavailable in this session. The required subagent tool is not exposed here.

#### DESIGN DUAL VOICES — CONSENSUS TABLE

```text
══════════════════════════════════════════════════════════════════════
  Dimension                              Claude  Codex  Consensus
  ────────────────────────────────────── ─────── ─────── ─────────
  1. Information hierarchy               N/A     N/A     N/A
  2. Interaction state coverage          N/A     N/A     N/A
  3. User journey / emotional arc        N/A     N/A     N/A
  4. Specificity vs generic UI           N/A     N/A     N/A
  5. Design-system alignment             N/A     N/A     N/A
  6. Responsive strategy                 N/A     N/A     N/A
  7. Accessibility coverage              N/A     N/A     N/A
══════════════════════════════════════════════════════════════════════
CONFIRMED = both agree. DISAGREE = models differ (-> taste decision).
Missing voice = N/A. Outside voices unavailable for this phase.
```

### Pass 1: Information Architecture

Score: `9/10`.

The hierarchy is already explicit and user-first: map scene, selected beacon identity, current activity and people, then deliberate actions. That is the right order. It respects the product's place-first thesis and avoids the normal dashboard trap.

The remaining issue is operational, not conceptual. Tasks `11`, `13`, and part of `14` were still marked `todo` even though the current code already ships beacon creation, avatar-marker selection, and explicit join-from-detail behavior. That mismatch would make the next implementer waste time on already-landed UI. Fix applied: those statuses are now reconciled to current reality so the remaining work stays focused on note scope, room identity, and route truth.

### Pass 2: Interaction State Coverage

Score: `9/10`.

The state table is real, not decorative. It covers loading, empty, error, success, and partial states for World bootstrap, empty-map creation, beacon detail, call join, chats, and Pulse. That is design work, not filler.

The gap is one product-truth state that only shows up during migration: what the user sees when the UI promises a beacon contract but backend/API compatibility still returns legacy `geo:` or legacy note scope. The right answer is not silent fallback. It is an explicit degraded state or blocked action with honest copy, so the interface never pretends the contract is coherent when it is not.

### Pass 3: User Journey & Emotional Arc

Score: `9/10`.

The plan clearly understands the user's emotional sequence: inspect safely, commit deliberately, keep context while live. The strongest decision is still the best one, marker selection is safe, and joining live presence is separate.

The one requirement to keep crisp in implementation is cross-beacon continuity during an active call. If the user is live in one beacon and inspects another, the interface should keep the current call grounded, keep the new beacon inspectable, and relabel the action as `Switch call`. The plan already says this. Good. Keep it.

### Pass 4: AI Slop Risk

Score: `10/10`.

This plan does not read like generic generated UI. It names anchored cards behind avatar markers, mobile bottom sheets instead of shrunken desktop cards, specific copy patterns to avoid, and product language that stays tied to place and presence. That is enough specificity to keep the implementer out of generic overlay/card-grid sludge.

No change required here.

### Pass 5: Design System Alignment

Score: `9/10`.

`DESIGN.md` is present and the plan correctly routes new work through the existing system vocabulary: `app-bar`, `world-sheet`, `marker-card`, `call-overlay`, warm accent language, restrained motion, and the existing route family. Good.

The main alignment rule that needed to stay explicit is boundary discipline. Newer study-room office-hours design docs exist for this branch family, but they are a different wedge than this infrastructure-first beacon migration. Auto-decision: do not import that host/circle product language into this plan. Keep this review pinned to beacon contract coherence, not a separate product thesis.

### Pass 6: Responsive & Accessibility

Score: `9/10`.

The responsive plan is intentional by breakpoint, which is rare and correct. Desktop gets anchored detail, mobile gets a sheet, and active-call state must remain legible above bottom navigation. Accessibility requirements are also concrete: focus order, touch targets, labels, landmarks, and live region announcements.

The remaining implementation nuance is migration-state accessibility. Any degraded banner, retry state, or contract-mismatch warning needs to announce itself without stealing map focus or trapping keyboard users inside an overlay.

### Pass 7: Unresolved Design Decisions

Score: `9/10`.

There are no major aesthetic taste disputes left in this plan. The remaining unresolved issue is product-truth behavior during compatibility windows.

Auto-decision:

- prefer explicit degraded-copy or blocked-action states over silent legacy fallbacks whenever backend contract and UI contract disagree

That is not a taste flourish. It is trust preservation.

### Design Completion Summary

```text
+====================================================================+
|                DESIGN REVIEW — COMPLETION SUMMARY                  |
+====================================================================+
| Step 0               | 9/10, strong plan with stale task drift     |
| Pass 1 (Hierarchy)   | 9/10, user-first ordering is clear          |
| Pass 2 (States)      | 9/10, add migration-truth degraded state    |
| Pass 3 (Journey)     | 9/10, inspect-vs-join split is sound        |
| Pass 4 (AI slop)     | 10/10, specific and non-generic             |
| Pass 5 (System)      | 9/10, aligned with DESIGN.md                |
| Pass 6 (Resp/A11y)   | 9/10, breakpoint intent is explicit         |
| Pass 7 (Decisions)   | 9/10, no major taste disputes remain        |
+--------------------------------------------------------------------+
| NOT in scope         | host/circle wedge kept out                  |
| What already exists  | reconciled against current code             |
| TODOS.md updates     | pending Phase 3                             |
| Outside voices       | unavailable                                 |
| Unresolved decisions | 0 taste decisions, 1 product-truth rule     |
+====================================================================+
```

**Phase 2 complete.** Codex: 0 usable outputs. Claude subagent: unavailable. Consensus: 0 confirmed, 0 disagreements, outside voices unavailable. Passing to Phase 3.

## AUTOPLAN PHASE 3 — ENG REVIEW (2026-03-27)

### Step 0: Scope Challenge

What existing code already solves the sub-problems:

- `apps/web/src/routes/world-route.tsx` already handles empty-map selection, the `Light Beacon` flow, selected-beacon detail, and explicit join.
- `apps/web/src/components/map-preview.tsx` already owns marker selection, background selection, stable map instance behavior, and card anchoring.
- `apps/web/src/beacon-projection.ts` already turns place/note/call state into beacon-shaped UI objects.
- `apps/web/src/app-state.tsx` already centralizes bootstrap, creation, note publishing, and call lifecycle.
- `apps/concierge/internal/httpapi/server.go` and `apps/concierge/internal/social/service.go` already expose bootstrap, beacon create-or-return-existing, note create, and call-intent endpoints.

Minimum remaining change set:

1. Move room identity and note scope to shared contract helpers first.
2. Add dual-read / compatibility behavior for rollout.
3. Keep Pulse out of beacon-thread content once beacon note scope lands.
4. Add focused regression tests for all compatibility and migration paths.

Complexity check:

The original blast radius is larger than 8 files, but the real active implementation scope is smaller because significant UI pieces already shipped. Auto-decision: reduce the remaining implementation scope to the semantic cutover and regression coverage, not a second pass of World UI rebuild work.

Search check:

Search unavailable in this environment, proceeding with in-distribution knowledge only.

TODOS cross-reference:

- Browser E2E remains correctly deferred until the room-id and note-scope contract settles.
- Viewport-scaled discovery remains deferred and should not be bundled into this migration.
- A new TODO is required for post-cutover cleanup of compatibility shims so dual-read does not become permanent debt.

Completeness check:

Choose the complete migration path: dual-read / compatibility rollout plus regression tests. Reject the shortcut where the web app changes strings to `beacon` while backend semantics remain `geo:` and `g`.

### Eng Dual Voices

#### CODEX SAYS (eng — architecture challenge)

Attempted via `codex exec`, but the local CLI failed to produce a stable response in this environment. Model refresh and response streams repeatedly disconnected, so there is no reliable Codex outside-voice output for this phase.

#### CLAUDE SUBAGENT (eng — independent review)

Unavailable in this session. The required subagent tool is not exposed here.

#### ENG DUAL VOICES — CONSENSUS TABLE

```text
═══════════════════════════════════════════════════════════════
  Dimension                           Claude  Codex  Consensus
  ──────────────────────────────────── ─────── ─────── ─────────
  1. Architecture sound?               N/A     N/A     N/A
  2. Test coverage sufficient?         N/A     N/A     N/A
  3. Performance risks addressed?      N/A     N/A     N/A
  4. Security threats covered?         N/A     N/A     N/A
  5. Error paths handled?              N/A     N/A     N/A
  6. Deployment risk manageable?       N/A     N/A     N/A
═══════════════════════════════════════════════════════════════
CONFIRMED = both agree. DISAGREE = models differ (-> taste decision).
Missing voice = N/A. Outside voices unavailable for this phase.
```

### Section 1: Architecture Review

The current code confirms the CEO-phase concern. The UI vocabulary has already moved toward beacons, but the contract seam still speaks legacy place/geohash in the most important flows:

- `apps/web/src/nostr.ts` publishes and queries kind `1` events with `["g", geohash]`
- `apps/web/src/data.ts` and `apps/web/src/beacon-projection.ts` still derive `geo:${operator}:${geohash}` room ids
- `apps/web/src/app-state.tsx` joins beacon calls through `/api/v1/social/call-intent`, but its fallback room id is still legacy `geo:`
- `apps/web/src/data.ts` lifts all local notes into Pulse through `buildPulseFeedItems()`
- `apps/concierge/internal/social/service.go` still resolves call intent through `ResolveRoomID()` returning the legacy room format

The architecture needs one explicit cut line:

```text
WorldRoute
  -> MapPreview (marker / background selection)
  -> AppState
      -> createBeacon() ---------> POST /api/v1/social/beacons
      -> createPlaceNote() ------> publishGeoNote() + POST /api/v1/social/notes
      -> joinBeaconCall() -------> POST /api/v1/social/call-intent
                                  -> POST /api/v1/token
                                  -> connectLiveKitSession()
      -> listBeacon*() ----------> buildBeaconProjection()
      -> pulseFeedItems ---------> buildPulseFeedItems()

Concierge HTTP API
  -> handleSocialBeacons() -----> social.Service.CreateOrReturnBeacon()
  -> handleSocialNotes() -------> social.Service.CreateNote()
  -> handleSocialCallIntent() --> social.Service.ResolveCallIntent()
  -> handleToken() -------------> policy + token service
```

Opinionated recommendation:

- change shared scope helpers first, then route consumers

That means:

1. define the room-scope contract in `apps/web/src/data.ts` and `apps/concierge/internal/social/service.go`
2. define the note-scope contract in `apps/web/src/nostr.ts` and corresponding relay query helpers
3. add compatibility read paths before switching writes
4. update Pulse filtering after note-scope helpers exist

Real production failure scenario:

- If the web client starts requesting `beacon:<geohash8>` before `/api/v1/social/call-intent` and `/api/v1/token` agree on that namespace, users will either fail to connect or silently join the wrong room. The plan now explicitly needs a staged rollout and regression tests at that boundary.

### Section 2: Code Quality Review

The main code-quality issue is semantic duplication.

`resolveRoomID()` exists in `apps/web/src/data.ts` and `ResolveRoomID()` exists in `apps/concierge/internal/social/service.go`. That is acceptable cross-language duplication, but only if the plan treats the format as a protocol contract with mirrored tests. Trying to get "perfect DRY" here through a shared generator or extra package would be over-engineering. The right move is explicit mirrored helpers plus contract tests on both sides.

The second issue is plan drift. `CLIENT_TASKS.md` still described some already-shipped UI as future work, which would encourage unnecessary churn. Fix applied above: task statuses are now aligned with the current code, and the remaining implementation target is the shared contract cutover plus tests.

The third issue is cleanup discipline. `joinPlaceCall: joinBeaconCall` is a fine temporary alias in `apps/web/src/app-state.tsx`, but the plan should treat it as a compatibility shim with a named cleanup step after rollout. Otherwise the repo keeps both vocabularies forever.

Stale diagrams check:

- no stale inline ASCII diagrams were found in the touched code paths reviewed for this plan

### Section 3: Test Review

Current tests already cover meaningful parts of the shipped UI and backend:

- `apps/web/src/routes/world-route.test.tsx` covers background selection, beacon creation, explicit join, query-param-opened beacon detail, and message grouping
- `apps/web/src/components/map-preview.test.tsx` covers background click routing, marker selection, wheel forwarding, and stable map instance behavior
- `apps/web/src/app-state.test.tsx` covers strict-mode media control idempotence through the current join flow
- `apps/web/src/nostr.test.ts` covers legacy kind `1` geohash query and signer behavior
- `apps/concierge/internal/httpapi/server_test.go` and `apps/concierge/internal/social/service_test.go` cover bootstrap, create-or-return-existing, note creation, and legacy call-intent room id resolution

What is missing is the migration-specific coverage. The current suite proves the old and partly-shipped beacon UI flows. It does not yet prove the new contract.

```text
CODE PATH COVERAGE
===========================
[+] apps/web/src/routes/world-route.tsx
    ├── [★★★ TESTED] Background click opens Light Beacon flow
    ├── [★★★ TESTED] Beacon create submit opens created beacon
    ├── [★★★ TESTED] Marker selection opens beacon card, join is explicit
    └── [GAP]         Active-call + inspect-other-beacon => `Switch call` state

[+] apps/web/src/app-state.tsx
    ├── [★★  TESTED] Join flow stays stable under StrictMode media toggles
    ├── [GAP]        `/api/v1/social/call-intent` returning `beacon:<id>`
    ├── [GAP]        Fallback / degraded state when backend still returns `geo:`
    ├── [GAP]        Token vending reject / 401 / 403 keeps beacon detail intact
    └── [GAP]        Dual-read compatibility during rollout (`geo:` + `beacon:`)

[+] apps/web/src/nostr.ts
    ├── [★★  TESTED] Legacy `#g` query path
    ├── [GAP]        Publish beacon-scoped kind `1` with `h=<geohash8>`
    ├── [GAP]        Query dual-read path (`#h` first, compat `#g` during rollout)
    └── [GAP]        Relay reject / signer-missing migration copy for beacon posts

[+] apps/web/src/data.ts + apps/web/src/routes/pulse-route.tsx
    ├── [★★  TESTED] Pulse feed merge, ordering, and provenance
    ├── [GAP]        Beacon-thread posts excluded from Pulse local lane
    └── [GAP]        Profile navigation still works after exclusion logic lands

[+] apps/concierge/internal/httpapi/server.go + social/service.go
    ├── [★★★ TESTED] Create-or-return-existing beacon semantics
    ├── [★★★ TESTED] Legacy `geo:` call intent and ad-hoc room title
    ├── [GAP]        `beacon:<geohash8>` room intent contract
    ├── [GAP]        Token validation / policy for beacon room namespace
    └── [GAP]        Compatibility window: read old + new without split-brain

─────────────────────────────────
COVERAGE: 7/18 paths tested (39%)
  Code paths: 7/12
  Migration-specific user flows: 0/6
QUALITY:  ★★★: 5  ★★: 2  ★: 0
GAPS: 11 paths need tests
  -> 8 focused unit/integration tests
  -> 3 route/state integration tests
─────────────────────────────────
```

Regression-rule decisions:

- regression tests for Pulse exclusion are mandatory
- regression tests for `beacon:<geohash8>` room ids are mandatory
- regression tests for compatibility rollout are mandatory

Test plan artifact:

- `/Users/peterwei/.gstack/projects/geometer-jones-synchrono-city/peterwei-main-eng-review-test-plan-20260327-182500.md`

### Section 4: Performance Review

Nothing here requires a brand-new scaling system. The performance risk is not marker rendering. It is migration waste.

If the implementation performs dual-read or dual-query work at every consumer callsite, render cost and debugging cost both climb. The current code already does the right basic thing in several places, `buildPlaceTiles()`, `buildGeoThreads()`, and `buildBeaconProjection()` pre-group notes instead of repeatedly filtering inside loops. Preserve that pattern. Keep compatibility logic near the query/normalization layer, not sprayed through `WorldRoute`, `PulseRoute`, and every selector.

The other performance risk is payload growth during compatibility. If bootstrap starts shipping both old and new note forms forever, the migration never ends. The plan now explicitly requires a bounded compatibility window plus cleanup.

### NOT in scope

- Hybrid study-room office-hours product wedges from newer design docs
- Multi-circle-per-venue modeling
- Viewport-scoped discovery redesign
- Browser E2E harness in the same protocol-cut PR
- Cross-language code generation just to avoid mirrored scope helpers in TS and Go

### What already exists

- Beacon creation bottom-sheet flow is already implemented in `apps/web/src/routes/world-route.tsx`
- Avatar-marker plus attached-card behavior is already implemented through `apps/web/src/components/map-preview.tsx` and `world-route.tsx`
- Explicit join-from-beacon-detail is already implemented in `apps/web/src/routes/world-route.tsx` and `apps/web/src/app-state.tsx`
- Create-or-return-existing beacon semantics already exist in `apps/concierge/internal/social/service.go`
- Existing tests already cover most of the shipped UI behaviors that should not be reimplemented

### Failure Modes Registry

```text
CODEPATH                             | FAILURE MODE                               | RESCUED? | TEST? | USER SEES?                           | LOGGED?
-------------------------------------|--------------------------------------------|----------|-------|--------------------------------------|--------
World create beacon                  | duplicate create race                      | Y        | Y     | existing beacon opens                | N
World create beacon                  | invalid/missing beacon metadata            | Y        | Y     | inline form error                    | N
World publish beacon note            | signer missing                             | Y        | N     | local save + signer-required copy    | N
World publish beacon note            | relay rejects `h` event                    | Y        | N     | retryable publish failure            | N
joinBeaconCall -> call-intent        | backend still returns legacy `geo:`        | N        | N     | silent wrong-room or mismatch risk   | N
joinBeaconCall -> token vending      | backend rejects `beacon:` room             | Y        | N     | beacon detail stays, retry offered   | N
Pulse local feed                     | beacon-thread items leak into Pulse        | N        | N     | wrong route content                  | N
compat rollout                       | readers understand only old scope          | N        | N     | empty world or missing history       | N
bootstrap refresh                    | stale data persists after refresh failure  | Y        | N     | degraded banner, stale scene remains | N
compat cleanup omitted               | permanent dual vocabulary in repo          | N        | N     | slow future work, harder debugging   | N
```

Critical gaps:

- `backend still returns legacy geo room ids`
- `Pulse local feed includes beacon-thread content`
- `compat rollout can split writers and readers`

### Engineering Completion Summary

```text
+====================================================================+
|                 ENG REVIEW — COMPLETION SUMMARY                    |
+====================================================================+
| Step 0               | Scope reduced to semantic cutover + tests   |
| Architecture         | 2 major contract-boundary issues            |
| Code quality         | 3 issues: drift, shim cleanup, room helper  |
| Test review          | 11 gaps, 3 mandatory regression classes     |
| Performance          | 2 migration/perf risks, no new infra needed |
+--------------------------------------------------------------------+
| NOT in scope         | written (5 items)                           |
| What already exists  | rewritten to reflect shipped UI             |
| Test diagram         | written                                     |
| Test plan artifact   | required path recorded                      |
| Failure modes        | 10 total, 3 critical gaps                  |
| TODOS.md updates     | required for compat-shim cleanup            |
| Outside voices       | unavailable                                 |
| Unresolved decisions | 0 taste decisions                           |
+====================================================================+
```

## AUTOPLAN CROSS-PHASE THEMES

### Theme: Product truth must beat terminology

Flagged independently in CEO, design, and eng review.

The main risk is not that the UI looks wrong. It is that the UI says `beacon` while the protocol and room contract still behave like `place` + `geo:`. That would quietly erode trust because the interface would promise one social object while the system still routes another.

### Theme: Plan drift is now a real maintenance cost

Flagged in design and eng review.

Several high-visibility `World` interaction tasks were still listed as future work even though the code already ships them. Left uncorrected, that would create duplicate work and muddy the actual remaining scope. The plan now has to stay synchronized with reality so implementation effort goes into the contract cutover, not cosmetic rework.

## Decision Audit Trail

| # | Phase | Decision | Principle | Rationale | Rejected |
|---|-------|----------|-----------|-----------|----------|
| 1 | Intake | Use `CLIENT_TASKS.md` as the active plan file | P5 Explicit over clever | It is the only branch-local plan with concrete objective, files, and backlog. | Ad hoc review of diff only |
| 2 | Intake | Treat UI scope as present and material | P1 Completeness | The plan changes World, markers, creation flow, Pulse boundaries, and call behavior. | Skipping design-aware review |
| 3 | CEO 0C-bis | Prefer end-to-end beacon contract over UI-only shim | P1 Completeness | A UI-only rename leaves the core mismatch intact and makes future wedges harder. | UI-only shim |
| 4 | CEO 0D | Expand scope to include Concierge/API/protocol blast radius | P2 Boil lakes | Web-only implementation would ship two truths for one concept. | Client-only migration |
| 5 | CEO 0D | Keep host/cadence product wedge out of this migration | P3 Pragmatic | It is adjacent but not required to fix the semantic split. | Wedge-first study-circle implementation now |
| 6 | CEO 0D | Defer viewport-scaled beacon discovery redesign | P3 Pragmatic | Real issue, but not blocking correctness of the current migration. | Bundling scaling redesign now |
| 7 | CEO 5 | Preserve one state/projection path in `app-state` + `beacon-projection` | P4 DRY | Reusing existing state shape minimizes diff and future cleanup. | Parallel beacon-specific store/client |
| 8 | CEO 9 | Require dual-read/compatibility rollout sequence | P1 Completeness | Shipping one-way contract changes would create silent broken states mid-deploy. | Hard cutover |
| 9 | Gate | Continue review after premise confirmation | P6 Bias toward action | The user confirmed the infrastructure-first premises, so the plan can move through the remaining phases without re-litigating the wedge. | Restarting around a different plan |
| 10 | Design 0 | Review all 7 design dimensions despite strong baseline | P1 Completeness | The plan has material UI scope, and the remaining risk is contract-state truth rather than surface polish. | Spot-checking only |
| 11 | Design 1 | Reconcile shipped World UI tasks with current code | P3 Pragmatic | Leaving shipped work marked `todo` would cause pointless UI churn. | Treating finished interaction work as still unbuilt |
| 12 | Design 7 | Prefer explicit degraded state over silent legacy fallback | P5 Explicit over clever | Users must see when backend contract lags the promised beacon UX. | Silent compatibility fallback |
| 13 | Eng 0 | Reduce active implementation scope to semantic cutover + tests | P3 Pragmatic | The code already ships creation, avatar markers, and explicit join UI. | Rebuilding the World surface again |
| 14 | Eng 1 | Change shared room/note scope helpers before route polish | P5 Explicit over clever | Central helpers shrink blast radius and make rollback understandable. | File-by-file string rewrites |
| 15 | Eng 2 | Keep mirrored TS/Go scope helpers instead of cross-language abstraction | P5 Explicit over clever | A protocol contract plus mirrored tests is simpler than inventing shared-generation machinery. | Cross-language generator package |
| 16 | Eng 3 | Require regression tests for `beacon:` room ids and Pulse exclusion | P1 Completeness | Both failures would be silent and user-visible if left untested. | Happy-path-only migration coverage |
| 17 | Eng 3 | Keep browser E2E deferred until protocol cutover stabilizes | P3 Pragmatic | The existing harness can cover the current cutover cheaper and with less churn. | Adding browser infrastructure in the same PR |
| 18 | Eng 4 | Add a TODO for post-cutover compatibility cleanup | P2 Boil lakes | Compatibility logic without cleanup becomes permanent debt. | Leaving dual-read open-ended |

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | ISSUES OPEN | 2 critical gaps, rollout hazard, premise gate passed |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | UNAVAILABLE | local CLI failed under current environment |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | ISSUES OPEN | remaining scope reduced to contract cutover, 11 test gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | ISSUES OPEN | strong baseline, 1 product-truth rule, 0 taste disputes |

**UNRESOLVED:** 3
**VERDICT:** AUTOPLAN REVIEW COMPLETE — approval gate pending
