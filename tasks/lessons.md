# Lessons

## 2026-03-21

- Mistake: wrote a settings test that used a plain text query for `ws://localhost:8080`, which matched both the relay card and the relay identity metrics.
  Root cause: the assertion targeted repeated display text instead of the relay-card-specific surface.
  Preventative rule: when adding UI assertions for repeated values, scope the query to the intended section or use role-based selectors tied to the new control.

## 2026-03-27

- Mistake: tightened a fetch-mock assertion in `app-state.test.tsx` but forgot to accept the `init` argument in the mock implementation, causing the test to fail before the real behavior executed.
  Root cause: updated the assertion surface without matching the runtime signature of `fetch(input, init)`.
  Preventative rule: when asserting on request bodies or headers in mocked `fetch` calls, always accept both `input` and `init` parameters so the test observes the real request shape.

- Mistake: invoked the web test package script with an extra file argument, which still ran the broader Vitest suite instead of only the intended test file.
  Root cause: relied on `pnpm ... test -- <file>` forwarding semantics instead of calling `vitest run <file>` directly.
  Preventative rule: when verifying a single Vitest file in this repo, use `pnpm --filter web exec vitest run <path>` so the scope is exact and unrelated suite failures do not obscure the change.
