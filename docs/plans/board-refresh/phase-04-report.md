# Phase 04 report — horizontal navigation and account overlays

Phase / date / implementer: Phase 4 — navigation/account / 2026-09-24 / Codex, continuing the Luna-scoped handoff

Plan: `docs/plans/2026-09-13-board-navigation-design-plan.md`

Handoff: `docs/plans/board-refresh/luna-handoff.md`

Status: **REVIEW READY — AWAITING USER**

Base revision: `01d47da94a586287fa32536045f8517b6ac6c7bc` — `feat: present quests in a responsive four-lane board`

Candidate branch: `codex/board-refresh-phase-04`; Phase 4 changes are intentionally uncommitted pending user approval.

User authorization: the user said **“commit, start phase 4”** on 2026-09-24. This authorized Phase 4 implementation and verification. It did not authorize the Phase 4 commit, Phase 5, remote push, production data changes, deployment, or publishing.

## Outcome

Phase 4 moves protected web navigation from the fixed left rail into a responsive horizontal header and gives both platforms a real identity-driven account surface:

- Web has exactly three primary destinations: Board, Status, and Long Quests. The old fixed rail and protected-layout left margin are gone.
- Mobile keeps exactly three bottom tabs: Board, Status, and Quests. Settings is an account action, not a primary tab; the compatibility Settings route remains outside the tab group.
- Status uses a gender-neutral people icon on web and native.
- The actual player name, class, and rank are shown in the identity trigger. The menu exposes exactly Edit details, Settings, and Logout.
- Edit details and Settings are overlays over the current surface. Web supports Escape/outside dismissal and focus return; native supports Android Back.
- Profile editing uses shared trim/Unicode validation, an authenticated `update_profile` RPC, profile ownership checks, and SQL grants/RLS boundaries. Timezone, XP, and rank are not writable through the profile function.
- Existing settings controls remain available inside the account Settings surface, and History remains reachable.

## Acceptance matrix

| Acceptance | Delivery and evidence | Result |
| --- | --- | --- |
| P4-AC1 / NAV-01 / LAYOUT-01 | `web/src/web/AccountShell.tsx` and `ProtectedLayout.tsx` provide horizontal navigation with no fixed rail/margin. Native `(tabs)/_layout.tsx` exposes three tabs and `mobile/app/settings.tsx` is outside the tab group. Browser semantics found exactly three primary links, no primary Settings link, and one Status people icon. Android asserted BOARD/STATUS/QUESTS and that SETTINGS is absent. | PASS for authorized web/Android scope |
| P4-AC2 / NAV-02 | Web and native identity triggers use live name/class/rank data. Menu actions are exactly Edit details, Settings, and Logout. Browser keyboard/outside dismissal and native touch/account-menu assertions passed. | PASS |
| P4-AC3 / NAV-03 | Web Settings opens as a dialog without losing the Board route; History remains reachable. Direct `/settings` redirects to `/board` and opens the settings dialog without a loop. Browser Back/history checks passed. Native Settings opens over the current shell, Android Back returns to Board, and History then returns to Board. | PASS |
| P4-AC4 / PROFILE-01–02 | Shared tests cover trimming, blank rejection, 80-code-point limits, Unicode code-point counting, and normalized input. SQL migration `026_profile_editing.sql` adds profile checks and an invoker-owned `update_profile` RPC with ownership, grants, and non-writable timezone/XP/rank fields. `supabase/tests/010_profile_editing.test.sql` is included in local verification. Browser and Android persisted profile edits; local DB verification passed 10 files / 331 tests. | PASS for local non-iOS scope |
| P4-AC5 / SETTINGS-01 / AUTH-01 | Reusable `WebSettings` and native `SettingsContent` preserve existing controls. Logout returns to auth and reports failures without clearing state prematurely. Browser Settings/History and native logout passed; auth/store caches update with the persisted profile. | PASS |
| P4-AC6 | Browser viewport checks passed at 390×844, 768×1024, 1024×768, 1366×768, 1440×900, and 1920×1080 with `scrollWidth === innerWidth`, three primary links, and a live account trigger. Native Android keyboard/profile editing, safe-area header, Back, and modal flows passed. iOS is excluded by user authorization and Windows. A separate 200% zoom screenshot was not generated; wrapping and responsive CSS remain documented review evidence rather than a claimed screenshot. | PASS with explicit stress-evidence limitation |

## Test-first evidence

The Phase 4 tests were written before the corresponding feature implementation:

- The new web navigation test was red against the fixed `Sidebar`/protected layout because the expected navigation role, three-destination contract, and account shell did not exist.
- The native `AccountHeader` test was red before the new module existed, then passed against the actual menu/modal implementation.
- Shared profile-validation/data tests were red before the profile edit validator and RPC data method existed.
- The first database verification exposed a timestamp-trigger privilege mismatch in the new profile function boundary. The trigger was corrected to a `SECURITY DEFINER` function with an empty `search_path`, then the complete local SQL verification passed.

Passing characterization tests were not used as RED proof.

## Green verification

All commands below were run against the final Phase 4 candidate tree unless noted otherwise:

- Shared Jest: **27 suites / 214 tests passed**.
- Web Vitest: **11 files / 36 tests passed**.
- Mobile Jest: **11 suites / 23 tests passed** after moving the legacy Settings route outside the tab group.
- Web TypeScript: `tsc --noEmit`, exit 0.
- Mobile TypeScript: `tsc --noEmit`, exit 0.
- Web ESLint: exit 0, no errors.
- Expo SDK 54 lint: exit 0, 0 errors / 28 warnings. The warnings are incumbent duplicate shared imports and existing test/dev-ball import style.
- Web production build: exit 0; 742 modules transformed. Incumbent Vite `__dirname` and large-chunk warnings remain.
- Android Expo export: exit 0; 1,814 modules bundled.
- Local Supabase verification: `npm run db:verify`, exit 0; 10 SQL files / 331 tests passed.
- `git diff --check`: exit 0; only Git LF→CRLF normalization warnings were emitted.
- Impeccable detector over changed web targets: three `overused-font` findings for incumbent Inter typography. No new layout, overflow, or interaction anti-pattern was reported; Inter remains because the plan explicitly preserves existing EIYU typography.

## Runtime evidence

### Web

Using a disposable local Supabase account, the browser runtime verified:

1. Login reaches `/board`.
2. Exactly three primary links are present; Settings is not primary; Status has one people icon; one account trigger is present.
3. The account menu has exactly Edit details, Settings, and Logout.
4. Edit details persisted a changed display name/class and the values survived reload.
5. Settings opened as an overlay; History remained reachable; direct `/settings` redirected safely to Board with Settings open.
6. Responsive checks at all six Phase 4 viewport sizes had no document horizontal overflow.

The disposable account identifier is intentionally omitted from this report; no production or personal data was used.

### Android

The final Maestro flow passed 1/1:

`C:\Users\morad\.maestro\tests\2026-09-24_235032\phase4_account_navigation\commands.json`

The repository JUnit result is retained at:

`mobile/maestro/artifacts/phase4-account-navigation.xml`

The flow verifies the three-tab shell, absence of a Settings tab, account menu actions, profile edit/save, Settings and Quest History surfaces, Android Back restoration, and Logout back to auth. It uses only a disposable local account through Maestro `--env` values.

## Changed files

- `web/src/ProtectedLayout.tsx`, `web/src/web/AccountShell.tsx`, `web/src/index.css`, `web/src/Icons.tsx`, `web/src/web/WebSettings.tsx`, and `web/src/pages/SettingsPage.tsx` — horizontal protected shell, account overlays, status icon, settings compatibility behavior, and responsive styling.
- `mobile/app/(tabs)/_layout.tsx`, `mobile/app/settings.tsx`, `mobile/components/eiyu/account-header.tsx`, `mobile/components/eiyu/settings-content.tsx`, and `mobile/components/eiyu/icons.tsx` — three-tab shell, account/header surface, reusable settings, and people icon.
- `packages/shared/src/logic/validation.ts`, `packages/shared/src/data/profile.ts`, and `packages/shared/src/types/database.ts` — shared profile normalization and RPC boundary.
- `backend/supabase/026_profile_editing.sql` and `supabase/tests/010_profile_editing.test.sql` — database constraints, authenticated update function, grants, and isolation tests.
- Corresponding shared/web/mobile tests and `mobile/maestro/flows/phase4_account_navigation.yaml`.
- Phase 4 report, executive summary, and integration-ledger entry.

Preserved user files remain untouched: the design plan, Luna handoff, and `skill-observations/`.

## Limitations and reviewer decisions

- iOS native execution is explicitly excluded by the user and remains unexecuted on Windows.
- A separate 200% zoom screenshot was not generated. Responsive widths, keyboard, safe-area, native Back, and no-horizontal-overflow checks are recorded; long names use wrapping CSS and shared validation.
- The existing Inter typography produced Impeccable's incumbent font-overuse warning; changing it would violate the plan's preserve-existing-identity contract.
- No production database, remote push, deployment, publishing, or release action was performed.
- Phase 5 is not authorized and no Phase 5 code or tests were started.

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
npm run db:verify
git diff --check
```

Review the uncommitted candidate branch `codex/board-refresh-phase-04` against `01d47da94a586287fa32536045f8517b6ac6c7bc`. The planned landing message is `feat: move web navigation to header and add account dialogs`.

## Gate verdict and next boundary

The authorized non-iOS Phase 4 implementation, local database/profile security checks, web runtime checks, Android account journey, and static/build gates are ready for review. **Phase 4 is not committed. Phase 5 is not authorized.** Await the user's explicit approval before creating the Phase 4 commit or advancing the plan.
