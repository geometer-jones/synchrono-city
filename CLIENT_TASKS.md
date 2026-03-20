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
- make marker interaction the primary presence and call-join mechanism
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
- the map remains visible while interacting with place details
- the page no longer reads as a dashboard of stacked cards

### 3. Marker selection sets presence and joins immediately

Status: `done`

Goal:

- make marker tap/click the primary place-presence action

Implementation notes:

- selecting a marker should set the active place presence to that geohash
- joining should happen immediately with no secondary confirmation
- selecting a different marker while already in a call should switch presence immediately to the newly selected tile

Likely files:

- `apps/web/src/routes/world-route.tsx`
- `apps/web/src/components/map-preview.tsx`
- `apps/web/src/app-state.tsx`
- `apps/web/src/data.ts`

Acceptance criteria:

- tapping/clicking a marker triggers the join flow immediately
- the selected marker state is visually obvious
- the user does not need to press a second Join button for marker-based place selection
- marker numbers continue to represent note count only

### 4. Marker detail overlay/card

Status: `done`

Goal:

- surface place detail without leaving the map-owned World layout

Implementation notes:

- after marker selection and join, show place detail in an overlay, anchored card, drawer, or sheet
- the detail surface should make the current selected place obvious
- preserve a fast path into geo-chat and place-note workflows from the overlay

Likely files:

- `apps/web/src/routes/world-route.tsx`
- `apps/web/src/components/map-preview.tsx`
- `apps/web/src/styles.css`

Acceptance criteria:

- selected place detail appears on top of the map
- overlay includes latest note preview, place identity, and participant roster when active
- overlay does not force full route navigation away from World

### 5. Marker state and clustering visuals

Status: `done`

Goal:

- make marker states legible while preserving the contract defined in `CLIENT_SPEC.md`

Implementation notes:

- marker number shows note count only
- active call state should be visually distinct without replacing the note count
- cluster behavior should preserve per-tile identity rather than collapsing places into a fake aggregate place

Likely files:

- `apps/web/src/components/map-preview.tsx`
- `apps/web/src/styles.css`
- `apps/web/src/data.ts`

Acceptance criteria:

- empty tiles do not render markers
- active-call tiles with zero notes render `0`
- clustering, if present, sums note counts but preserves access to underlying tiles

Current state:

- marker note-count, active/selected state, and zoom-based clustering are implemented

### 6. World note and action workflows inside overlays

Status: `done`

Goal:

- move note creation and place actions into the map-layer UI model

Implementation notes:

- remove dependence on large inline form sections in World
- keep note creation close to selected-place context
- preserve room/call actions where they remain meaningful after immediate marker-join

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
- cover marker selection, immediate join behavior, and overlay rendering

Likely files:

- `apps/web/src/app.test.tsx`
- `apps/web/src/test/*`

Acceptance criteria:

- tests verify World renders in the new full-screen layout model
- tests verify marker selection triggers join behavior
- tests verify selected-place detail renders without route transition

## Recommended Order

1. App shell chrome and navigation
2. World full-screen map layout
3. Marker selection sets presence and joins immediately
4. Marker detail overlay/card
5. World note and action workflows inside overlays
6. Marker state and clustering visuals
7. Responsive behavior and mobile polish
8. Chats, Pulse, and Settings visual alignment
9. Test coverage for the new interaction model

## Risk Notes

- The highest implementation risk is interaction conflict between marker selection, active call state, and the persistent call overlay.
- Marker switching now follows immediate presence-switch semantics; the remaining risk is UX polish rather than product ambiguity.
- Layout changes to `World` can easily spill into the app shell if the app bar, overlay, and call overlay are not designed together.

## Definition of Done

The client-spec implementation is not done until:

- World is map-owned and full-screen below the app bar
- marker selection sets presence and joins immediately
- place detail lives on top of the map instead of below it
- desktop and mobile navigation behavior matches the chosen spec
- tests cover the new core interaction path
