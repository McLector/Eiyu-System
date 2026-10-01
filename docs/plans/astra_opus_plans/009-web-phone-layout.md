# 009 — Web phone-width navigation and scrollbar layout

Planning only. Implementor: **Luna 6 (`gpt-6-luna`), extra-high (`xhigh`) effort**. Owns **F-036 (S3)**. No backend migration.

## Context and verified root cause

The run reproduced overlapping/clipped primary navigation and a bright lane scrollbar at a 390 px iframe width; 768 px was acceptable. A real phone viewport and 200% browser zoom remain unverified.

- `web/src/web/AccountShell.tsx:233` renders brand, primary navigation and account controls as siblings in one header. The three links are defined at line 21 and rendered at line 238.
- `web/src/index.css:149` uses a flex header; line 168 gives the brand a max-content minimum; line 186 makes navigation the shrinking flex child. At the phone breakpoint, line 248 centers this horizontally scrollable navigation. This combination can put overflowing content beyond the reachable start edge when space is insufficient. Verify rectangles and scroll offsets in the browser before treating that explanation as proven.
- `web/src/index.css:636` gives lane tabs `scrollbar-width: thin`, but no standard `scrollbar-color`. Lines 587–589 already define WebKit track/thumb colors. Thus “there is no scrollbar styling” would be incorrect; inspect which rules win in the actual browser. Browser handling of standard versus vendor scrollbar rules is the remaining hypothesis.
- Existing lane selection and session persistence are in `web/src/web/WebBoard.tsx:313` and line 328; do not replace them to solve layout.

## Tests first

1. Extend `web/src/web/__tests__/AccountShell.navigation.test.tsx` to assert all three named links, active-route semantics, accessible account control and keyboard menu behavior survive the responsive markup change. Include a long profile name and missing/empty board data. These are behavioral tests, not proof of geometry.
2. Before CSS changes, add a reproducible browser scenario document under `web/maestro/` for 320, 390, 768 and 1280 px viewports, both themes, plus real 200% browser zoom. Record failing measurements privately: brand/nav/account rectangles must not intersect, all nav labels must be reachable, and document scroll width must not exceed viewport width. Exercise keyboard focus and touch/horizontal scroll to Archived.
3. Reproduce the white scrollbar with computed styles and a screenshot in the same browser engine as the finding. Record expected theme colors from existing CSS variables. Do not make a jsdom geometry assertion or claim iframe resizing verifies browser zoom.

## Fix approach and reuse

At phone widths, use a two-row header: brand and account on the first row, primary navigation spanning the second. Keep desktop layout at its existing breakpoint. Let link labels remain readable and focus-visible; if a narrow viewport still requires horizontal scrolling, use start alignment and scroll the focused item into view. Reuse the existing NavLink mapping, account menu, theme variables and Board lane state.

In `web/src/index.css`, make the lane scrollbar use theme track/thumb colors consistently through standard `scrollbar-color` and existing vendor selectors, subject to the computed-style reproduction. Preserve a visible scrolling affordance; do not solve this by globally hiding scrollbars or clipping navigation. Change `AccountShell.tsx` only if CSS cannot express the two-row layout cleanly. Preserve logical DOM/tab order.

## Acceptance criteria

**F-036:** At 390 px, the brand, BOARD, STATUS, LONG QUESTS and account control do not overlap. All three route labels can be read and activated; all four lane tabs can be reached. The lane scrollbar matches dark/light theme tokens. At 320/768/1280 px and 200% browser zoom there is no page-level horizontal overflow and keyboard focus is visible. Account overlays retain Escape, focus restoration and menu behavior.

## Verification commands and flows

Run from the repository root in PowerShell; use `npm.cmd ci` first only if `node_modules` is absent.

```powershell
npm.cmd run test --workspace @eiyu/web
npx.cmd tsc --noEmit -p web/tsconfig.json
npm.cmd run dev --workspace @eiyu/web -- --host 127.0.0.1 --port 5174
```

Expected: Vitest and TypeScript exit 0. Use the isolated `http://127.0.0.1:5174/board` origin with a disposable account for the browser scenario. The user’s existing localhost and production sessions must remain untouched. Inspect each link's `getBoundingClientRect()`, horizontal scroll reachability and computed scrollbar colors; save screenshots only to ignored `maestro-logs/`.

The existing `web/maestro/flows/00_signup_fresh.yaml` uses a different origin and the run documented a web-driver signup blocker (H-4). Before running it, parameterize its origin in the future implementation and use the isolated test origin. Run `maestro test -e E2E_EMAIL=$env:E2E_EMAIL -e E2E_PASSWORD=$env:E2E_PASSWORD -e E2E_NAME=$env:E2E_NAME web/maestro/flows/00_signup_fresh.yaml` individually only with a fresh disposable fixture. If H-4 persists, report the harness limitation and complete signup/browser checks through an isolated browser; an error is not a passed flow. No mobile flow is required for this web-only CSS change. Full shared regressions are part of roadmap final verification.

## Risks and rollout

The header becomes taller on phones; check sticky position, content visibility and overlay anchoring. Avoid expanding the 720 px breakpoint into unrelated desktop redesign. Browser scrollbar differences require visual verification, not source-only confidence. Ship with the next web release after the viewport matrix passes; no data or schema rollout.

## Needs you (user-side actions)

- Provide an isolated disposable test account if one is unavailable; keep credentials out of tracked files.
- If no automation surface supports real browser zoom, perform the 200% zoom check in a separate test profile and report the result.
- No live database or dashboard action is required.
