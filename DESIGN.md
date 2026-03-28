# Synchrono City Design System

This document is the design source of truth for `apps/web`.

Use it with:

- `MANIFESTO.md` for mission and political framing
- `ARCHITECTURE.md` for product behavior and system flows
- `CLIENT_SPEC.md` for route contracts and generation constraints
- `CLIENT_TASKS.md` for the current implementation backlog

If the implemented client and this document diverge, update this file before or alongside UI work.

## 1. What This Product Should Feel Like

Synchrono City should feel like operator-run civic infrastructure for real-world scenes.

Not a generic SaaS dashboard.
Not a playful consumer social app.
Not a glossy startup landing page with a map dropped into it.

The right feeling is:

- civic
- atmospheric
- sovereign
- editorial
- map-native
- operationally serious

The wrong feeling is:

- gamified
- glossy-startup
- enterprise-generic
- playful consumer-social
- template-SaaS

Short version:

The product should feel like a public atlas, a field report, and an operator console all living in the same system.

## 2. Core Design Principles

### Place is the main character

The map is not decoration. It is the primary social index.

If a screen fights the map for dominance, the screen is usually wrong.

### Presence is deliberate

Selection is safe.
Joining is explicit.
The product should never trick the user into live presence because they tapped the wrong marker.

### Identity before metrics

Beacon identity, people, and recent context matter more than abstract counts.

Numbers belong in support roles. They do not get first billing.

### Governance is part of the product

Settings and operator controls should feel like the same world as social surfaces. Serious, denser, more operational, yes. Detached back-office software, no.

### Editorial conviction, operational restraint

Use the display voice where conviction matters. Use the UI face where clarity matters. Do not smear the same dramatic treatment across every surface.

### Empty states are product moments

"No items found" is not a design. The product should explain what is quiet, what is broken, and what the user can do next.

## 3. Brand Sentence

Chosen Presence. Sovereign Infrastructure. Portable Community.

This is not just splash copy. It is the design brief.

- `Chosen Presence` means explicit location and call actions, not passive tracking.
- `Sovereign Infrastructure` means operator-visible controls, serious materials, and anti-platform posture.
- `Portable Community` means identity, memory, and route relationships should feel durable and legible.

## 4. Typography

Use at most two faces.

### Primary UI face

- Preferred: `IBM Plex Sans`
- Acceptable equivalents: `Avenir Next`, `Source Sans 3`, practical grotesk-style sans serif
- Use for navigation, controls, dense lists, metadata, settings, forms, and route body copy

### Display face

- Preferred: `Iowan Old Style`
- Acceptable equivalents: old-style serif with literary weight, not luxury-magazine theatrics
- Use for splash headings, high-conviction route headings, key mission copy, and occasional emphasis

### Monospace face

- Preferred: `IBM Plex Mono`
- Use for room IDs, geohashes, keys, technical values, durations when appropriate

### Typography rules

- Display type is sparse. Use it to signal conviction, not everywhere.
- UI text stays highly legible in dense layouts.
- Route headings should feel related, but not identical in rhythm.
- Avoid tiny washed-out metadata that turns the interface into atmospheric soup.

### Type scale guidance

- App shell title: `1.4rem` to `2.2rem`
- Route title: `1.9rem` to `3rem`
- Major splash/display headline: `2.4rem` to `4.8rem`
- Section labels / eyebrows: `0.74rem` to `0.8rem`, uppercase, high tracking
- Dense metadata: `0.82rem` to `0.92rem`
- Body copy: `0.95rem` to `1rem`

## 5. Color System

Keep the palette restrained.

The product already has the right bones in `apps/web/src/styles.css`. Formalize them. Do not drift into purple gradients or random accents.

### Core tokens

```css
:root {
  --color-bg-base: #091018;
  --color-bg-elevated: #0a131b;
  --color-bg-panel: rgba(10, 19, 27, 0.78);
  --color-bg-panel-strong: rgba(9, 16, 24, 0.94);
  --color-bg-field: rgba(7, 16, 24, 0.9);

  --color-text-primary: #f6f3ea;
  --color-text-muted: rgba(246, 243, 234, 0.75);
  --color-text-dim: rgba(246, 243, 234, 0.62);

  --color-accent-heat: #f6a56f;
  --color-accent-heat-strong: #de5d3d;
  --color-accent-atmosphere: #68b4ff;

  --color-status-live: #67d69e;
  --color-status-danger: #de5d3d;
  --color-status-warning: #ffd6b9;

  --color-border-soft: rgba(246, 243, 234, 0.08);
  --color-border-medium: rgba(246, 243, 234, 0.12);
  --color-border-strong: rgba(246, 243, 234, 0.18);
}
```

### Color rules

- `Warm orange/coral` is the brand accent. It signals heat, presence, emphasis, activation.
- `Cool blue` is atmospheric support. It creates depth. It should not become the primary brand.
- `Green` is for live, connected, or ready states. Do not reuse it as decoration.
- `Danger red/coral` is for destructive actions and failures. Do not blur it into the brand accent.
- Text stays warm off-white, not pure white.
- Backgrounds stay near-black blue-green, not flat charcoal and not pitch black.

## 6. Material and Surface Language

The product uses layered dark surfaces with restrained glass.

That means:

- dark translucent panels over a deeper field
- soft borders
- real depth
- limited blur
- strong enough separation to read dense information

That does not mean:

- every panel looks like a frosted-glass startup marketing template
- every section has a giant glow
- every route is a pile of interchangeable cards

### Surface tiers

- `Base field`: map, backgrounds, route floor
- `Elevated panel`: app bar, sheets, cards, overlays
- `Operational inset`: form fields, note areas, key displays, media panes

### Radius and border guidance

- Primary panels: `22px`
- Secondary cards: `16px` to `18px`
- Pills: `999px`
- Marker avatars: circular only when identity calls for it

### Shadow guidance

- Use deep, soft shadows for floating surfaces
- Avoid hard, crunchy shadows
- If removing the shadow makes the design collapse, the hierarchy is too dependent on effects

## 7. Spacing and Density

The app should not use one density everywhere.

### Density by route

- Splash: spacious
- App shell: medium
- World: chrome-light, map-first
- Chats: dense
- Pulse: medium
- Settings: dense but controlled

### Spacing system

Use an `8px` base rhythm.

Common steps:

- `8`
- `12`
- `16`
- `18`
- `20`
- `24`
- `32`

Use `18px` and `22px` strategically because the existing product already does. This is one of the few places where the spacing has some character.

## 8. Motion

Motion should communicate state, hierarchy, and atmosphere.

Never filler.

### Allowed motion

- soft page entrance on splash
- gentle route transitions
- anchored card reveal on marker selection
- bottom-sheet transitions that preserve visible map context
- call overlay transitions that communicate connecting, connected, reconnecting, or minimized states

### Avoid

- constant floating motion on operational screens
- decorative parallax on dense surfaces
- aggressive spring motion
- motion that hides latency or state ambiguity

### Motion rules

- respect reduced-motion preferences
- marker selection motion should feel precise, not playful
- call state transitions should read as operational status, not animation candy

## 9. Content Tone

Language should be direct, infrastructural, political, and composed.

Avoid:

- whimsical copy
- hype-product verbs
- growth-product filler
- startup-template slogans

Prefer:

- "Light Beacon"
- "Join call"
- "Switch call"
- "Operator controls"
- "Relay status"

Do not use:

- "Launch room"
- "Unlock community"
- "Create experience"
- "Start vibing"

## 10. Route Rules

### Splash

Purpose:

- explain the thesis
- signal seriousness
- invite entry

Rules:

- editorial, not startup-polished
- one loud headline, one support block, clear CTAs
- mission copy can be long, but hierarchy must stay controlled
- use the serif here more than in the app

### App Shell

Purpose:

- orient the user
- frame the current scene
- mount persistent cross-route UI

Rules:

- calm and institutional
- navigation never dominates the page
- app bar is the only permanent chrome above `World`
- desktop nav in top app bar, mobile nav at bottom

### World

Purpose:

- present place activity as the primary social surface

Rules:

- map owns the screen
- map is the one full-bleed visual anchor
- desktop uses an anchored beacon card behind the selected avatar marker
- mobile uses a bottom sheet tied to the selected beacon
- marker selection is safe to inspect
- media join is explicit from beacon detail
- no generic dashboard-card mosaic

World hierarchy:

1. map scene
2. selected beacon identity
3. recent activity and people
4. explicit actions

### Chats

Purpose:

- private, dense, conversational

Rules:

- tighter than World
- still clearly in the same product family
- prioritize readability and participant context over flourish

### Pulse

Purpose:

- people and non-beacon public context

Rules:

- more intimate than World
- maintain the same material and type system
- beacon-thread content stays out of Pulse

### Settings

Purpose:

- identity controls, relay context, governance, audit

Rules:

- denser and more operational
- integrated with the main brand language
- should feel like a civic ledger or operator cockpit, not a separate enterprise product

## 11. Component Vocabulary

Reuse the current vocabulary already present in `apps/web/src/styles.css`.

Primary shared surfaces:

- `app-bar`
- `app-nav`
- `world-hud-card`
- `world-sheet`
- `marker-card`
- `call-overlay`

These are not incidental class names. They are the product's UI grammar.

### Markers

- beacon identity first
- live state may accent the marker, but should not replace identity
- counts are secondary and belong in detail surfaces

### Beacon detail

- anchored to place, not floating randomly
- identity first, activity second, roster third, actions fourth
- must preserve map context

### Sheets and overlays

- should feel like support layers for the map, not full route takeovers
- mobile sheets dock above persistent bottom chrome
- avoid ambiguous "some panel appears somewhere" behavior

### Call overlay

- operationally crisp
- compact when minimized
- status legible at a glance
- persistent across navigation

## 12. Responsive Rules

Responsive does not mean "stack everything."

### Desktop

- map dominates `World`
- anchored card is tied to the selected beacon
- support UI stays off the critical map interaction zone

### Tablet

- preserve map primacy
- allow slightly wider detail surfaces for readability
- do not let intermediate layouts become accidental desktop shrunk to 80%

### Mobile

- bottom navigation is pinned
- active call overlay sits above bottom nav
- selected-beacon sheet docks above both
- sheet height is bounded so map context remains visible
- route-to-route parity matters for core tasks: World, chats, profile inspection, call controls

## 13. Accessibility Rules

Accessibility is part of the design system, not a QA afterthought.

- minimum touch target for primary actions is `44px`
- visible focus states must differ from hover and active states
- keyboard order must stay logical across app bar, map interactions, beacon detail, and call controls
- landmark structure should be clear for app nav, map region, route content, and overlays
- markers and controls need descriptive accessible names
- sheet/dialog focus must move predictably and return to the trigger on dismiss
- status changes like reconnecting or join failure should be announced without blocking the rest of the app
- contrast must remain strong enough on dark surfaces, especially for dense metadata and status icons

## 14. Implementation Guidance

Where design changes belong:

- route-specific layout/content: `apps/web/src/routes/*`
- shared interaction patterns: reusable components and `app-state.tsx`
- shared visual language: `apps/web/src/styles.css`

Preferred implementation posture:

- extend the current React + router + CSS stack
- do not add a new styling system
- do not create a second component library for one feature
- preserve route and data boundaries unless intentionally changing product behavior

## 15. Change Protocol

When changing the client:

1. Read `DESIGN.md`, `CLIENT_SPEC.md`, and `ARCHITECTURE.md`.
2. Identify which route or shared surface is affected.
3. Reuse existing vocabulary before inventing new patterns.
4. If the change alters product-wide visual rules, update this file first.
5. Implement the smallest viable change.
6. Verify desktop and mobile behavior.

## 16. Acceptance Checklist

A UI change is not done unless it:

- keeps the client recognizably map-native
- preserves the distinction between social and governance surfaces
- uses the approved type, color, and material language
- works on desktop and mobile
- covers empty, loading, error, and success states where relevant
- respects the explicit marker-select versus media-join boundary
- avoids generic dashboard-card repetition

## 17. Current Decisions Snapshot

Use this as the fast brief.

```yaml
design_direction:
  product_feel:
    - civic
    - atmospheric
    - sovereign
    - editorial
    - map-native
  avoid:
    - playful
    - glossy-startup
    - enterprise-generic
    - template-saas
  typography:
    ui: IBM Plex Sans
    display: Iowan Old Style
    mono: IBM Plex Mono
  palette:
    background: near-black blue-green
    brand_accent: warm orange/coral
    atmosphere: cool blue
    live_status: green
  world:
    metaphor: civic atlas with field-report energy
    layout: map fills the viewport below the app bar
    desktop_detail: anchored beacon card behind avatar marker
    mobile_detail: bottom sheet above bottom nav and call overlay
    interaction_rule: inspect first, join call explicitly
  settings:
    feel: dense, serious, integrated
  motion:
    level: subtle
    use: stateful, atmospheric, restrained
  copy:
    voice: direct, infrastructural, composed
```
