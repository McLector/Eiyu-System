# Local S02 birthday groundwork — limited scope

## Current evidence amendment — 2026-10-16

See [the current S01/S02 evidence and verification ledger](2026-10-16-s01-s02-verification.md). Both checkpoints remain **INCOMPLETE**. The owner reconfirms trusted birthday screening; independent correction rechecks are no longer a product requirement. The owner explicitly attests no Groq training permission was granted, superseding earlier UNKNOWN permission entries. Existing Free/global-ZDR/20b-capacity/no-saved-rules evidence remains qualified owner evidence. Current public Free availability is corroborated; no actual 20b inference is claimed.

Resend domain verification, owner-saved Supabase SMTP/Token template and one actual Gmail Inbox delivery with a rendered eight-digit code and retained sign-in link are now established. Earlier disabled-SMTP/no-domain/unknown-Token entries below are preserved history. App redemption, callbacks, device parity and rollout are separate acceptance checks. Local strict Groq-only routing is retained; hosted v24 is unchanged and Gemini code is preserved. The requested explicit single-provider switch is implemented locally: Groq-only by default, deliberate Gemini-only with exact singleton configuration, fail-closed otherwise; no automatic fallback or hosted activation. No S03 or numbered 027.

## Owner evidence and policy — 2026-10-15

**S01 and local S02 remain INCOMPLETE.** The owner explicitly selected **“Trust initial and corrected birthday declarations.”** This supersedes the October 12 pending-independent-recheck policy below. Local valid owner saves now accept the supplied date in either direction, clear earlier local pending state and advance the private revision; an unchanged accepted date with no pending state is idempotent. Unknown/currently declared minor accounts remain denied AI. Any retained pending row stays denied until an explicit owner save. Earlier requests cannot release results or reserve further provider attempts after their birthday revision changes; missing revisions also deny retry. Mailbox proof remains separate and gates debriefs only; quests and saved server content are preserved.

This is declaration screening, not independently verified adulthood or child consent. A false adult declaration/correction can send a minor’s private habit text to the AI provider. The owner chooses trusted declarations; an independent correction-review workflow is no longer a product requirement under that decision. It is not a provider approval, completed child/privacy assessment or release authorization. No ID/selfie/biometric/paid service or replacement account flow was added.

Implementation remains within existing draft SQL 047 and its 027 pgTAP suite. Tests first reproduced 11 failures of 57 assertions for the owner policy; after the setter change, a stale-revision retry assertion remained red. A missing-revision negative test then produced two failures of 58 before tightening the existing age retry wrapper. Final 58/58 passed. Canonical local seeds use the updated 047; in the retained 001–048 disposable stack the age helper is already renamed by 048, so only that private helper and the setter were replaced without resetting or overwriting the public mailbox wrapper.


## Continuation policy — 2026-10-12

**S01 and local S02 remain INCOMPLETE.** The current continuation prompt requires suitable adult-age assurance, independent birthday-correction rechecks, and denial for unknown ages, minors and pending corrections. This current instruction supersedes the October 11 trusted-corrections policy below; those sections remain preserved history. Local code was narrowly amended test-first: an earlier birthday keeps the accepted date, stores the requested correction as pending, and advances the revision. A later birthday reduces declared age immediately without clearing an existing pending recheck. Repeating either the pending or accepted date cannot approve/cancel the recheck or grant AI. First declarations remain screening, not independent age proof. No recheck-approval endpoint or assurance provider was invented.

The local Groq-only route remains implemented and unreleased. Hosted v24 remains separate and can still select Gemini/fail over. No production change, deployment, publishing, provider contact, actual AI request or paid spend occurred. Adopted mailbox, quest, week/timezone, legacy-proof and rollout contracts remain intact. No numbered 027 or S03.


**Current policy amendment (2026-10-11):** The owner subsequently authorized local Groq-only routing and explicitly answered "Trust corrected birthdays too". Both valid initial and corrected owner declarations are accepted immediately, in either direction; explicit saves clear prior local pending state. A changed declaration increments its private revision; unchanged saves remain idempotent. Unknown/currently declared minors still cannot use AI, and mailbox proof remains a separate debrief gate. This supersedes the earlier pending/independent-recheck design below, which is retained as implementation history. The local SQL setter and tests were updated test-first. No independent adult-age validation, production change or rollout approval is claimed. See the latest provider-evidence risk decision and both INCOMPLETE checkpoints.

Date: 2026-10-11, Asia/Manila. **S01 and S02 remain INCOMPLETE. No rollout approval.**

The short design was recorded in the S01 provider-evidence companion before coding. After the user asked to keep changes small, the scope question explicitly proposed local S02 implementation of signup/Profile birthday validation, server AI restrictions and controlled corrections, while preserving S01's incomplete status and production/provider settings. The user answered **“Do what you think is good on this.”** This authorizes the local groundwork below, not provider selection, full S02 completion or deployment.

Use the existing account, Profile editor, quota RPCs, proxy and refund paths. Keep mailbox ownership separate. Do not change quest XP, scheduling, week/time-zone contracts, signup confirmation settings, provider routing or paid settings. S04 still owns manual Generate, the two-total-per-week allowance and its cutover.

1. Write failing civil-date and private-age SQL tests. Capture the optional initial Auth declaration for every authentication method; absent declarations remain unknown. Store accepted date, pending correction and revision privately. Never authorize later edits to Auth metadata.
2. Add the empty birthday field to existing signup and Profile on web/mobile. Allow ordinary name/class edits when birthday settings are unavailable. Keep failed saves editable and explain a pending correction. Bind the editor and birthday writes to their account.
3. Wrap existing quota functions with current server age restrictions. Unknown age, under 18 and any pending correction deny every AI action, saved summary access and regeneration. Bind a model request to the birthday revision and recheck before releasing its result. Reuse the refund path. An older backend lacking this contract must fail closed.
4. Check current age before cached suggestions/summaries. Scope suggestion cache keys by account/revision; ignore the old global cache. Hide loaded summaries and recheck after local birthday saves or foreground/mount. Preserve stored content and quest statistics.
5. Run affected suites, full regression suites, types, lint, web build, clean canonical database seeds and direct-server tests in an isolated local database. Record actual results and outstanding release prerequisites; stop the disposable stack.

The implementation uses declaration screening, **not validated adult-age assurance**. First declarations may be adult or minor; no independent verification is claimed. Every earlier-date correction increases declared age and remains pending; later dates can reduce age immediately, and cannot clear an existing pending recheck. There is deliberately no client approval/cancel-to-unlock path. The independent recheck standard and operator workflow must be settled under S01 before rollout. No identity-document collection or paid verification service was introduced. Minimum-age admission for the intended age-12 audience remains part of that unresolved release assessment.

Adult boundary uses the civil date in Asia/Manila independently of quest/account quota time zones. A leap-day birthday reaches the 18-year boundary on March 1 in a non-leap year. This is an explicit engineering rule for evaluation, not a legal determination or modification of the adopted quota calendar.

Official docs read before implementation:

- https://docs.expo.dev/versions/v54.0.0/
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/database/functions
- https://supabase.com/docs/reference/javascript/auth-getuser

Superpowers planning/TDD/verification guidance was used. The original Supabase changelog Markdown fetch was unavailable; no dependency or API upgrade was made. Current documentation and the installed repository APIs were checked. See the local INCOMPLETE checkpoint for the red/green and regression evidence.
