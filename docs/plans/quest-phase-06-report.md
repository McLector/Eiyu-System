# Quest plan Phase 6 report

Phase / date / implementer: Phase 6 — Optional stage descriptions / 2026-09-12 / Codex

Requirements and decisions covered: requirement 7; stage descriptions are optional plain text, Long Quests remain on their dedicated route/tab, Phase 5 sequence rules remain authoritative, and Expo SDK 54 remains unchanged.

Base main revision / candidate revision / landed main revision: `88a1024` / recorded after this report commit / recorded after local main integration

## Implementation boundary

The existing nullable `long_quest_stages.description` column from migration 016 remains unchanged. Phase 6 adds a write-boundary trigger that trims new or edited descriptions, stores blank text as `null`, and rejects normalized values longer than 2,000 Unicode code points. Existing rows are not rewritten or backfilled, and old clients may continue to omit the field.

The shared client adapter applies the same normalization before either create or reconcile writes. Mobile and web now expose a multiline optional description field for every stage during creation and editing. Both editors use the shared code-point limit instead of platform-native UTF-16 length behavior, preserve multiline Unicode, expose the limit to assistive technology, and surface existing mutation errors. Clearing a field flows to the shared normalizer and persists as absent.

Stage display is ordinary React/React Native text. Web preserves line breaks with `white-space: pre-wrap` and wraps long unbroken text; it never uses HTML injection. Mobile no longer truncates stage descriptions to one line, while the title, sequence state, and completion controls remain separate.

## RED evidence recorded before implementation

- The shared description contract initially failed because the normalization module/export did not exist; shared data tests also showed that reconcile writes did not normalize blank text or reject oversized values before the RPC.
- Mobile and web contracts failed because stage creation/editing controls and readable multiline display behavior were absent.
- The isolated pgTAP suite initially failed 6 of 20 new assertions because trimming, blank-to-null normalization, authoritative limits, and direct-write rejection did not exist.
- Requirements review caught that the first draft used 1,000 characters although the plan specifies 2,000. A corrected test failed with `Expected: 2000; Received: 1000` before the implementation and migration were corrected.
- A Unicode boundary regression test using an astral symbol then failed because JavaScript UTF-16 `.length` rejected 2,000 database-valid characters. The shared validator and both editors were changed to count Unicode code points consistently with PostgreSQL `char_length`.

Rendered-test follow-up failures concerned only harness assertions (asynchronous navigation timing and DOM whitespace normalization); those assertions were corrected without changing product behavior or weakening description outcomes. No deliberately failing test was committed.

## Acceptance criterion -> evidence -> result

| Criterion | Test/check | Result |
| --- | --- | --- |
| Missing descriptions and old payloads remain valid | shared normalization/data tests; pgTAP omitted/null assertions | PASS |
| Create, edit, clear, reload, and cross-platform payloads preserve values | rendered mobile editor tests; rendered web Long Quest tests; shared adapter tests; pgTAP round trips | PASS |
| Blank becomes absent; multiline Unicode survives | shared normalization suite; mobile/web rendered flows; pgTAP normalization assertions | PASS |
| 2,000 accepted and 2,001 rejected consistently | shared ASCII and astral Unicode boundary tests; mobile rendered input boundary; pgTAP RPC/direct-write boundary assertions | PASS |
| Markup-like content remains inert text | shared data assertion; web rendered DOM test; pgTAP literal round trip | PASS |
| Only the owner can edit a description | pgTAP RLS visibility and cross-owner reconcile rejection | PASS |
| Long text remains readable and controls stay available | mobile non-truncated multiline layout; web pre-wrap/anywhere wrapping; rendered/source UI contracts | PASS |
| Description edits cannot bypass stage ordering | pgTAP Phase 5 skip rejection, ordered completion, and final `completed_at` assertions | PASS |

## Verification evidence

| Command/check | Result |
| --- | --- |
| Shared Jest suite | PASS — 20 suites, 197 tests |
| Mobile Jest/RNTL suite | PASS — 6 suites, 14 tests, including rendered create/edit/clear/boundary interactions |
| Web Vitest/Testing Library suite | PASS — 7 files, 23 tests, including rendered create/edit/clear/inert-text interactions |
| Shared/mobile/web TypeScript checks | PASS |
| Workspace lint | PASS — 0 errors; same 23 pre-existing mobile duplicate-import warnings in untouched files |
| Web production build | PASS — pre-existing Vite native-loader and large-chunk warnings |
| Local Supabase reset/schema lint/pgTAP | PASS — no schema errors; 6 files, 182 tests |
| Local Supabase database advisors | PASS — no errors; pre-existing `auth_rls_initplan` performance warnings only |
| Expo `install --check` | PASS — dependencies current; no upgrade performed |
| Expo Android export | PASS — Hermes bundle plus 63 assets; temporary export removed |
| Gradle `assembleDebug` x86_64 | PASS — 783 tasks; local debug artifact only |

The database suite ran against the disposable local Docker-backed Supabase stack, which was stopped after every run. It covers the real reconcile RPC, direct table writes, transaction rollback, RLS ownership, compatibility with omitted fields, and the Phase 5 stage-completion trigger. No production database or credentials were used.

The Android project is a sibling of the Expo app rather than nested under it. For this local SDK 54 build only, Gradle used a temporary settings file that pointed Expo autolinking at `mobile/`, plus a temporary `Q:` short-path mapping to avoid Windows' generated C++ path limit. The build reached and passed `app:assembleDebug`; the drive mapping, temporary settings, manifest rewrite, and phase caches were removed afterward. No SDK, dependency, or checked-in Android configuration changed.

Requirements/test review corrected the draft 1,000-character limit to the plan's 2,000-character contract and added real rendered mobile/web interaction coverage. Code/data/security review retained the existing nullable schema, avoided a destructive backfill, prevalidated before parent creation, enforced the limit on every database insert/update, revoked public execution on the trigger helper, and verified RLS/RPC ownership. UX/accessibility review kept stage title and completion controls separate, added multiline editors and accessible limit hints, removed mobile truncation, and made long web text wrap safely.

No iOS native compilation is available on the Windows host. Authenticated persistence was evaluated with isolated database users and rendered component/store boundaries rather than a shared live account; no production credentials, browser session, signed build, remote database, push, or deployment was used. Stateful Maestro remains unavailable without an isolated signed-in dev-client fixture.

Compatibility and rollback: old payloads and rows without descriptions remain valid. Rolling back the trigger restores the prior permissive write behavior without dropping data or columns; values written while Phase 6 is active remain ordinary nullable text. Old clients remain compatible, while authoritative validation protects direct and stale writes.

Gate verdict: **PASS** — Phase 6's compatibility, normalization, Unicode/limit, persistence, authorization, inert rendering, sequence regression, rendered interaction, static, bundle, and native build gates pass. Local main integration and post-landing verification follow; Phase 7 must not begin unless those checks remain green.
