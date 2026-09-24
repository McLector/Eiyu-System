# Phase 05 report — compact weekly review and page sizing

Phase / date / implementer: Phase 5 — weekly review/layout / 2026-09-25 / Codex, continuing the Luna-scoped handoff

Plan: `docs/plans/2026-09-13-board-navigation-design-plan.md`

Handoff: `docs/plans/board-refresh/luna-handoff.md`

Status: **APPROVED / LANDED**

Base revision: `9681243` — `feat: move web navigation to header and add account dialogs`

Candidate branch: `codex/board-refresh-phase-05`

Landed commit: `87c370d` — `feat: compact weekly review and rebalance web layouts`.

User authorization: the user said **“proceed to next phase if everything is clear with phase 5”** on 2026-09-25 after the Phase 5 review package reported all authorized gates clear. This authorized Phase 5 landing and Phase 6 implementation. Remote push, production data changes, deployment, and publishing remain out of scope.

## Outcome

Phase 5 replaces the misleading weekly bar treatment with an exact, bounded seven-day activity matrix and rebalances protected web-page sizing:

- Shared weekly data now includes canonical oldest-to-newest account-local `dateKey` values, zero-fills all seven days, excludes future live completions, and preserves archived/deleted completion evidence.
- Web Status renders one semantic table with one shared date header, five stat rows, visible exact numbers, accessible cell labels, and a common scale that does not clip counts above 3.
- Android Status uses the same seven-column information architecture inside a horizontal-scroll boundary and exposes date/cell values through accessibility labels.
- Web Status and AI summary now have explicit loading, error, retry, regeneration, and server-cap states. Regeneration remains bounded by the existing two-per-day server reservation.
- Status, Long Quests, and History now have bounded responsive containers; History can scroll vertically at small heights/zoom instead of clipping its record.

## Acceptance matrix

| Acceptance | Delivery and evidence | Result |
| --- | --- | --- |
| P5-AC1 / WEEK-01 | `WeeklyDayDatum` carries `dateKey`; `fetchWeeklyReview` returns exactly seven ordered account-local keys and weekday labels. The lifecycle-reader test crosses December/year boundaries in `America/Los_Angeles` and asserts zero-filled absent days. | PASS |
| P5-AC2 / WEEK-02 | Shared fixture asserts exact 0/1/3/4/10 values, archived/deleted retained completions, ignored null completion rows, and future-date exclusion. Web cells expose `data-value` and a single matrix-wide `data-scale`; 10 is not clipped or saturated against a hard-coded 3. | PASS |
| P5-AC3 / WEEK-03–04 | Web table has caption, column/row headers, visible numbers, date-time keys, cell labels, and retry controls. Web Status interaction tests cover exact cells, weekly retry, and the two-regeneration cap. Android matrix tests cover accessible exact date/cell labels; existing mobile summary controls remain covered by the Android flow. | PASS |
| P5-AC4 / LAYOUT-02 | Responsive CSS collapses Status to one column below 760px, bounds Long Quests at 920px, contains matrix overflow locally, and makes History vertically scrollable. Browser geometry checks observed no horizontal overflow at a 463px viewport and a bounded 440px History dialog at desktop width. A separate 200% zoom screenshot was not generated; the stress behavior is covered by bounded CSS and the existing wrapping/content tests. | PASS with explicit screenshot limitation |
| P5-AC5 / R9–R10 / R12 | Shared 27-suite/215-test, web 13-file/39-test, and mobile 12-suite/24-test regressions pass; TypeScript, ESLint, Expo lint, web build, Android export, browser runtime checks, Impeccable detector, and Android Maestro status flow pass. Phase 4’s local SQL verification remains the database evidence because Phase 5 changed no SQL; a fresh local DB rerun was unavailable in this Windows session because Docker CLI is not installed. | PASS for authorized non-iOS scope |

## Test-first evidence

The Phase 5 tests were written before the corresponding implementation:

- The shared weekly test first failed because `WeeklyDayDatum` had no `dateKey`, then passed after the canonical date contract was added.
- The web matrix test first failed because `WeeklyReviewMatrix` did not exist, then passed against the semantic table implementation.
- The Android matrix test first failed because the native matrix component did not exist, then passed against the real horizontal-scroll/accessibility implementation.
- The web Status interaction test then verified the exact table, retry path, and AI regeneration cap against the actual query/mutation controls.

## Green verification

All commands below were run against the final Phase 5 candidate tree unless noted otherwise:

- Shared Jest: **27 suites / 215 tests passed**.
- Web Vitest: **13 files / 39 tests passed**.
- Mobile Jest: **12 suites / 24 tests passed**.
- Web TypeScript: exit 0.
- Mobile TypeScript: exit 0.
- Web ESLint: exit 0, no errors.
- Expo SDK 54 lint: exit 0, 0 errors / 24 incumbent warnings.
- Web production build: exit 0; 743 modules transformed. Incumbent Vite `__dirname` and large-chunk warnings remain.
- Android Expo export: exit 0; 1,815 modules bundled to `mobile/.expo/phase5-export-final`.
- `git diff --check`: exit 0; only Git LF→CRLF normalization warnings were emitted.
- Impeccable detector over changed web targets: six incumbent findings — existing width transitions, existing Long Quest easing/width transitions, and existing Inter typography warnings. No new matrix/layout anti-pattern was reported.

## Runtime evidence

### Web

The local Vite browser review covered the protected shell at narrow and desktop browser states:

1. Status collapses to one grid column at the 463px viewport; `document.documentElement.scrollWidth` equals `innerWidth` (463px), and the protected main uses bounded horizontal overflow.
2. Long Quests remains bounded to the available 426px content width under the same narrow viewport, with no document overflow.
3. History is bounded to 440px at desktop width, has `max-height: calc(100svh - 32px)`, and computes `overflow-y: auto`; its error state exposes a visible RETRY action.
4. The live configured remote Supabase project returned the existing schema-cache error for `public.deleted_habit_history`. The browser therefore verified the real Status error/retry state rather than claiming a live data matrix against an un-deployed remote schema. Fixture-backed shared/web tests verify the matrix’s exact data behavior.

### Android

The final Maestro flow passed 1/1 after connecting the existing SDK 54 development client to the local Metro server:

`C:\Users\morad\.maestro\tests\2026-09-25_004850\status_weekly_summary_and_cache\commands.json`

The flow verified Status navigation, Weekly Review, weekly summary loading/cache revisit, and regeneration completion without leaving the in-flight state. iOS remains explicitly excluded by user authorization and Windows.

## Changed files

- `packages/shared/src/data/weekly-review.ts` and `packages/shared/src/data/__tests__/lifecycle-readers.test.ts` — canonical weekly date keys, bounded live read, boundary/count/lifecycle fixtures.
- `web/src/web/WeeklyReviewMatrix.tsx` and `web/src/web/__tests__/WeeklyReviewMatrix.test.tsx` — accessible exact-value matrix and common-scale assertions.
- `web/src/web/WebStatus.tsx` and `web/src/web/__tests__/WebStatus.weekly.test.tsx` — responsive Status layout, matrix integration, weekly retry, AI retry/regeneration cap behavior.
- `mobile/components/weekly-review-matrix.tsx`, `mobile/components/__tests__/weekly-review-matrix.test.tsx`, and `mobile/app/(tabs)/status.tsx` — native matrix, accessibility contract, retry path, and Status integration.
- `web/src/index.css`, `web/src/ProtectedLayout.tsx`, `web/src/web/WebHistory.tsx`, and `web/src/web/WebLongQuests.tsx` — bounded page sizing, local matrix overflow, History vertical scrolling, and responsive Long Quest container.
- `docs/plans/board-refresh/phase-05-report.md` and `phase-05-executive-summary.md` — review package.

Preserved user files remain untouched: the design plan, Luna handoff, and `skill-observations/`.

## Limitations and reviewer decisions

- iOS native execution is explicitly excluded by the user and Windows.
- The configured remote Supabase project has not received the retained-history schema; no production or remote database change was made. The UI keeps the correct error/retry behavior, and local/shared fixtures cover the lifecycle data contract.
- A fresh local DB verification was not rerun in this session because Docker CLI is unavailable. Phase 5 contains no SQL changes; the Phase 4 local verification passed 10 SQL files / 331 tests.
- No separate 200% zoom screenshot was generated. The narrow viewport geometry and bounded vertical History overflow were manually measured.
- Phase 5 is landed locally at `87c370d`. Phase 6 is now authorized and starts from the local-main integration recorded in the ledger.

## Reviewer commands

From the repository root:

```powershell
Push-Location packages/shared; node ..\..\node_modules\jest\bin\jest.js --runInBand; Pop-Location
Push-Location web; node ..\node_modules\vitest\vitest.mjs run; Pop-Location
Push-Location mobile; node ..\node_modules\jest\bin\jest.js --runInBand; Pop-Location
Push-Location web; node ..\node_modules\typescript\bin\tsc --noEmit; Pop-Location
Push-Location mobile; node ..\node_modules\typescript\bin\tsc --noEmit; Pop-Location
Push-Location web; node ..\node_modules\eslint\bin\eslint.js .; Pop-Location
Push-Location mobile; node ..\node_modules\expo\bin\cli lint; Pop-Location
Push-Location web; node ..\node_modules\vite\bin\vite.js build; Pop-Location
Push-Location mobile; node ..\node_modules\expo\bin\cli export --platform android; Pop-Location
git diff --check
```

Review the landed diff from `9681243` to `87c370d` on `codex/board-refresh-phase-05`. Phase 6 is authorized by the user’s conditional approval above; its final commit remains subject to the Phase 6 review stop.
