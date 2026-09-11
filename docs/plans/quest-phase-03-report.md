# Quest plan Phase 3 report

Phase / date / implementer: Phase 3 — Penalty terminology / 2026-09-11 / Codex

Base main revision / candidate revision / landed main revision: `74bdc0dd1eaf85bbfd929cecebbb50c6c1cac4ff` / recorded after this report commit / recorded after main integration

## Product decision and compatibility boundary

The scaled-down two-minute-rule fallback is now called **Penalty** in user-facing copy. This is a terminology-only change: it introduces no deduction, monetary charge, XP change, new requirement, or behavior change.

The existing persistence and transport names remain deliberately compatible: `easy_version`, `easyVersion`, completion kind `easy`, AI action key `easy-versions`, and the existing helper/function names are unchanged. Existing saved fallback text loads without transformation. The distinct difficulty value **Easy** also remains unchanged.

## Changed surfaces

- Mobile habit create/edit label and AI suggestion action.
- Mobile recovery card, long-press accessibility action, history completion label, and recovery notification.
- Web habit create/edit label and AI suggestion action, recovery card, and history legend.
- AI suggestion prompt, so generated options follow the current product vocabulary while retaining the legacy API action key.
- Active requirements, README, web UI brief, relevant design note, and Maestro selectors/help copy.
- Mobile/web terminology inventory tests and the web recovery component test's legacy-value display assertion.

User-authored fixture strings containing the old words were intentionally left intact; changing arbitrary saved/user text is outside the rename.

## RED evidence recorded before implementation

- The new mobile copy contract failed all three checks because the editor, suggestion action, recovery card/accessibility action, history, and notification still exposed the old label.
- The new web copy contract failed both checks because the editor, recovery card, and history still exposed the old label.

## Acceptance criterion -> evidence -> result

| Criterion | Test/check | Result |
| --- | --- | --- |
| Penalty appears in create/edit forms | mobile/web `penalty-copy` suites | PASS |
| Recovery cards/prompts use Penalty | copy suites and `WebBoard.recovery.test.tsx` | PASS |
| Accessible action uses Penalty | mobile source contract for the long-press action | PASS |
| History labels use Penalty | mobile/web copy suites | PASS |
| AI suggestion action/help use Penalty | mobile/web copy suites, Maestro selector, AI proxy prompt | PASS |
| Old active UI label is absent | mobile/web negative source assertions and final inventory | PASS |
| Existing saved value still loads and performs the same recovery action | web recovery component passes legacy `easyVersion`, renders it after `Penalty:`, and invokes the unchanged recovery handler | PASS |
| Difficulty Easy and quantity exemptions remain unchanged | unchanged domain/schema identifiers plus full shared/mobile/web and DB regression suites | PASS |

## Verification evidence

| Command/check | Result |
| --- | --- |
| Shared Jest suite | PASS — 18 suites, 180 tests |
| Mobile Jest suite | PASS — 3 suites, 8 tests |
| Web Vitest suite | PASS — 5 files, 16 tests |
| Shared/mobile/web TypeScript checks | PASS |
| Workspace lint | PASS — 0 errors; same 26 pre-existing mobile duplicate-import warnings |
| Web production build | PASS — pre-existing Vite native-loader and large-chunk warnings |
| Local Supabase reset/schema lint/pgTAP | PASS — no schema errors; 3 files, 111 tests |
| Expo `install --check` | PASS — dependencies current; no upgrade performed |
| Expo Android export | PASS — Hermes bundle plus 63 assets; temporary export removed |
| Gradle `assembleDebug` x86_64 | PASS — 783 tasks; local debug artifact only |

The Android build used Android Studio's bundled JDK and a temporary short-path `Q:` mapping to avoid Windows' generated C++ path limit; the mapping was removed. The local Supabase wrapper stopped its Docker containers after the regression run.

No migration, Edge Function, remote database, signed build, production service, push, or deployment occurred. The modified AI proxy prompt is source-only and was not deployed. Stateful Maestro/signed-in browser execution remains skipped because its configured account is remote/shared rather than an isolated local fixture; iOS native compilation remains unavailable on Windows.

Gate verdict: **PASS** — active mobile/web terminology, AI guidance, accessibility copy, docs, compatibility behavior, and all regression/build gates pass. Expo SDK 54 and dependencies are unchanged. Main integration follows; Phase 4 must not begin unless post-landing checks remain green.
