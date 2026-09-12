# Quest plan Phase 7 report

Phase / date / implementer: Phase 7 — Registration privacy and terms refresh / 2026-09-12 / Codex

Requirements and decisions covered: requirement 8 and Section 4.5; existing consent remains required and initially unchecked; the owner-approved privacy and terms wording is preserved; documents remain available before authentication; Expo SDK 54 remains unchanged.

Base main revision / candidate revision / landed main revision: `4dd3a9e` / recorded by the Phase 7 commit / recorded after local main integration

## Implementation boundary

The previously mobile-only combined legal sheet is now two independently addressable documents, Privacy Policy and Terms of Use. Their existing wording is centralized in `packages/shared/src/logic/legal-content.ts` and rendered by mobile and web. No legal, retention, vendor, contact, security, compliance, or data-practice claim was invented or broadened.

Registration state stays in the existing auth component while either document is open. The checkbox is a separate control from both links, so opening a document cannot imply consent. The existing mobile rejection and web disabled-submit behavior remain in place, and successful consent still reaches each platform's existing sign-up boundary.

Mobile uses an accessibility-modal dialog, named scroll region, automatic content insets, selectable text, visible scrollbar, hardware/accessibility close behavior, and a persistent close action. Web uses an ARIA modal, hides background registration content from assistive technology while open, locks background scrolling, moves initial focus to Close, traps forward and reverse Tab navigation, closes on Escape/backdrop/Close, and restores focus to the invoking document link.

A real-browser review found one stale public landing-page reference to “Freeze Shields.” A new regression test was written first, then the copy was changed to the implemented Penalty/recovery behavior. Saved data and internal identifiers were not renamed.

## RED evidence recorded before implementation

- Shared legal-content tests failed because the typed scaffold contained no document titles, sections, or approved text.
- The mobile rendered test could not find separate accessible Privacy Policy and Terms of Use links; the existing consent rejection test already passed and characterized the preserved boundary.
- The web rendered test could not find a Privacy Policy button or dialog; the existing consent-disabled registration path already passed.
- After the dialogs existed, the mobile accessibility test failed with `Unable to find an element with accessibility label: Privacy Policy content` before the ScrollView was named.
- Web form tests failed with `Unable to find a label with the text of: Display name` before programmatic input names were added.
- A keyboard regression test moved Shift+Tab from Close to the background Sign in control before focus trapping was implemented.
- The real browser exposed stale landing copy. `Penalty terminology on active web surfaces > uses current recovery terminology on the public landing page` then failed because `Landing.tsx` contained no `Penalty` and still contained `Freeze Shields`; it passed after the copy-only correction.

No deliberately failing test is included in the landed commit.

## Acceptance criterion -> evidence -> result

| Criterion | Test/check | Result |
| --- | --- | --- |
| Both documents open before authentication | mobile `auth-legal.test.tsx`; web `WebAuth.legal.test.tsx`; Android emulator and local browser flows | PASS |
| Close/back preserves entered data and consent | rendered platform tests; Android name/unchecked-state accessibility dump; browser Escape/Close flow | PASS |
| Full text is reachable and scrollable | named mobile/web scroll-region assertions; browser End-key check; Android 100% and 150% font scroll checks | PASS |
| Mobile safe area and large text remain usable | Android 35 `Medium_Phone` AVD screenshots/accessibility trees at 100% and temporary 150% font scale | PASS |
| Web keyboard/focus behavior works | initial focus, forward/reverse Tab trap, Escape, and focus-restoration test plus real browser flow | PASS |
| Links resolve to the intended document version | separate link-to-dialog rendered assertions on both platforms; shared content contract | PASS |
| Approved content is consistent and stale terminology is absent | shared exact-content tests; landing Penalty regression; repository active-UI search | PASS |
| Consent remains required and registration reaches the existing boundary only after acceptance | mobile and web rendered sign-up boundary tests | PASS |

## Verification evidence

| Command/check | Result |
| --- | --- |
| Shared Jest suite | PASS — 21 suites, 200 tests |
| Mobile Jest/RNTL suite | PASS — 7 suites, 16 tests |
| Web Vitest/Testing Library suite | PASS — 8 files, 26 tests after the landing regression was added |
| Shared/mobile/web TypeScript checks | PASS |
| Workspace lint | PASS — 0 errors; same 23 pre-existing mobile duplicate-import warnings in untouched files |
| Web production build | PASS — pre-existing Vite native-loader and large-chunk warnings only |
| Expo `install --check` | PASS — dependencies current; no upgrade performed |
| Expo Android export | PASS — Hermes bundle plus 63 assets; temporary export removed |
| Gradle `app:assembleDebug` x86_64 | PASS — 558 tasks; local debug artifact only |
| Real web flow | PASS — local Codex in-app browser at `127.0.0.1`, no account submission |
| Real Android flow | PASS — Android 35 `Medium_Phone` AVD through Expo Go SDK 54, no account submission |

The first Expo dependency check failed only because sandboxed network access could not fetch Expo metadata; the approved retry reported `Dependencies are up to date`. The first native build used the repository-root default and reproduced the known sibling-directory autolinking failure. A second attempt reached configuration but PowerShell split an unquoted Gradle property. The final build used quoted properties and a temporary untracked settings file setting Expo autolinking's project root to `mobile/`; it completed `app:assembleDebug`. The temporary settings file, export, screenshots, accessibility dumps, emulator font change, servers, and emulator were removed or restored afterward. No tracked Android configuration changed.

Expo Go emitted its SDK 54 warning that Android remote push notifications require a development build. That capability is unrelated to the unauthenticated legal-document flow and did not block rendering or interaction. Native compilation separately passed with the installed development-client modules.

No database schema or write path changed in Phase 7, so a new database reset or migration rehearsal was not applicable. The registration tests exercise the actual component submission boundary and prove no sign-up call occurs without consent, then assert the existing sign-up adapter call after consent. No real account was created and no production or remote data was touched.

## Review findings

Requirements/test review: separate documents, unauthenticated access, state preservation, scrollability, large text, keyboard/focus, stale terminology, rejection, and success all map to executable or recorded platform evidence. The real-browser landing finding gained an explicit RED/GREEN regression test.

Code/data/security review: one immutable shared content source prevents platform drift; React/React Native text rendering does not interpret content as HTML; no secrets, account data, schema, or authorization rule changed; checkbox activation is isolated from document navigation; modal cleanup restores body scrolling and invoking focus.

UX/accessibility review: mobile exposes separate link roles, modal semantics, a named scroll container, scalable untruncated text, safe inset behavior, and an always-available close action. Web exposes programmatic input names, dialog labelling, 44-pixel Close control, background isolation, focus trapping/restoration, Escape/backdrop dismissal, and a scrollable narrow-screen-safe panel. Android 150% font testing demonstrated that the final policy section remains reachable without obscuring Close.

No iOS native compilation is available on this Windows host. Android is the supported native target exercised for this phase. No signed release build, remote authentication, push, production service, or deployment was used.

Compatibility and rollback: the change is presentation-only. Old clients continue using their bundled legal presentation and unchanged consent behavior. Rolling back this commit restores the prior mobile combined sheet and web registration copy without any data migration or destructive rollback. The centralized text has no persisted version because the repository had no existing legal-content version convention and the wording was not substantively changed.

Gate verdict: **PASS** — Phase 7's content accuracy, unauthenticated access, state/consent preservation, accessible rendering, link resolution, real browser/Android interaction, static, bundle, native build, and regression gates pass. Local main integration and post-landing verification follow; Phase 8 must not begin unless those checks remain green.
