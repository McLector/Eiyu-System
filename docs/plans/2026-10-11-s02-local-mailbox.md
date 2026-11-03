# Local mailbox verification implementation plan

## Current evidence amendment — 2026-10-16

See [the current S01/S02 evidence and verification ledger](2026-10-16-s01-s02-verification.md). Both checkpoints remain **INCOMPLETE**. The owner reconfirms trusted birthday screening; independent correction rechecks are no longer a product requirement. The owner explicitly attests no Groq training permission was granted, superseding earlier UNKNOWN permission entries. Existing Free/global-ZDR/20b-capacity/no-saved-rules evidence remains qualified owner evidence. Current public Free availability is corroborated; no actual 20b inference is claimed.

Resend domain verification, owner-saved Supabase SMTP/Token template and one actual Gmail Inbox delivery with a rendered eight-digit code and retained sign-in link are now established. Earlier disabled-SMTP/no-domain/unknown-Token entries below are preserved history. App redemption, callbacks, device parity and rollout are separate acceptance checks. Local strict Groq-only routing is retained; hosted v24 is unchanged and Gemini code is preserved. The requested explicit single-provider switch is implemented locally: Groq-only by default, deliberate Gemini-only with exact singleton configuration, fail-closed otherwise; no automatic fallback or hosted activation. No S03 or numbered 027.

## Owner evidence and policy — 2026-10-15

**S01 and local S02 remain INCOMPLETE.** The owner explicitly selected **“Trust initial and corrected birthday declarations.”** This supersedes the October 12 pending-independent-recheck policy below. Local valid owner saves now accept the supplied date in either direction, clear earlier local pending state and advance the private revision; an unchanged accepted date with no pending state is idempotent. Unknown/currently declared minor accounts remain denied AI. Any retained pending row stays denied until an explicit owner save. Earlier requests cannot release results or reserve further provider attempts after their birthday revision changes; missing revisions also deny retry. Mailbox proof remains separate and gates debriefs only; quests and saved server content are preserved.

This is declaration screening, not independently verified adulthood or child consent. A false adult declaration/correction can send a minor’s private habit text to the AI provider. The owner chooses trusted declarations; an independent correction-review workflow is no longer a product requirement under that decision. It is not a provider approval, completed child/privacy assessment or release authorization. No ID/selfie/biometric/paid service or replacement account flow was added.

Mailbox implementation/challenge/version/ABA controls and the October 12 Monday-fixture correction were preserved. Owner-reported custom SMTP is disabled, no sending domain is owned and presence of `{{ .Token }}` is unknown. The Gmail inbox and Oppo Reno 4/Android 12 are now known test targets, but delivery/templates/callbacks/current-build device checks still require scoped setup and verification. No hosted email action or setting was changed.


## Continuation policy — 2026-10-12

**S01 and local S02 remain INCOMPLETE.** The current continuation prompt requires suitable adult-age assurance, independent birthday-correction rechecks, and denial for unknown ages, minors and pending corrections. This current instruction supersedes the October 11 trusted-corrections policy below; those sections remain preserved history. Local code was narrowly amended test-first: an earlier birthday keeps the accepted date, stores the requested correction as pending, and advances the revision. A later birthday reduces declared age immediately without clearing an existing pending recheck. Repeating either the pending or accepted date cannot approve/cancel the recheck or grant AI. First declarations remain screening, not independent age proof. No recheck-approval endpoint or assurance provider was invented.

The local Groq-only route remains implemented and unreleased. Hosted v24 remains separate and can still select Gemini/fail over. No production change, deployment, publishing, provider contact, actual AI request or paid spend occurred. Adopted mailbox, quest, week/timezone, legacy-proof and rollout contracts remain intact. No numbered 027 or S03.

Mailbox protocol/flows were preserved. The existing SQL mailbox regression fixture was corrected after three Monday-only failures: retained content now belongs to the previous week, and an explicit allowed-reservation assertion precedes revision checks. This changes test setup only, not quota behavior. See the latest local INCOMPLETE checkpoint for fresh verification.


**Current scope amendment (2026-10-11):** The owner separately authorized local Groq-only code and trusted initial/corrected birthdays. Production proxy composition now accepts weekly-review requests only; the generic stage/easy helpers are retained for legacy compatibility/tests but those actions are denied at the production route before spending. Current-email proof, account/revision invalidation and mailbox-free quest access remain unchanged. This supersedes the earlier no-routing constraint/ordinary-suggestion clause below, without authorizing deployment or completing S01/S02. See the latest provider-evidence section and checkpoints.

> Execute sequentially with Superpowers executing-plans and test-driven-development. No delegated S02 work.

**Goal:** Implement the adopted current-mailbox proof requirement for weekly debriefs locally, preserving quest access and existing login.

**Authorization:** On 2026-10-11 the user said: “i approve of what you think is good for the remaining so if nothing else, we can start implementing”. This expands the previously limited local birthday work to remaining local S02 implementation. It does not establish missing S01 facts or authorize production configuration, deployment, publishing, provider contact or spend. S01 and S02 remain INCOMPLETE.

**Spec:** The existing roadmap's email verification section and S01 inventory's proposed S02 server flow. Keep both documents and numbered handoffs unchanged.

**Architecture:** A private, current-email-version ledger and bounded challenge live in Postgres. An authenticated Edge Function resolves the current email on the server, requests Supabase email OTP without creating users, verifies with a separate nonpersistent client and revokes that temporary session before atomically saving proof. Existing debrief components expose code entry, resend and status checks; original quest sessions stay active. Typed OTP is the local implementation; link callbacks remain a separate unverified release gate.

**Constraints:** $0 paid AI; no model calls for verification tests; no provider routing changes; no S03/S04; no age-assurance claims; no proof from metadata or auto-confirmed timestamps. Email changes, including A → B → A, permanently invalidate old proof and in-flight debrief results. Debrief reads and every debrief spending path fail closed. Birthday restrictions continue to apply to all AI. Preserve quota/week/timezone contracts and server saved content. Production SMTP/template configuration is not changed.

**Local challenge policy:** 10-minute validity, at most five verification attempts in a 10-minute account window, 60-second resend cooldown, at most five sends in that window. Resends replace the challenge without resetting the account attempt budget; delivery failures invalidate the challenge while retaining cooldown/budget. Only the authenticated account's canonical current address is used. No codes, hashes, session tokens, credentials or secret digests are stored in the proof/challenge ledger or logs.

## Tasks and test cycles

- [x] Database: write `supabase/tests/028_mailbox_proof.test.sql`, observe missing API failures in the disposable database, then add canonical `backend/supabase/048_mailbox_proof.sql`. Test self/service boundaries, unknown legacy proof, current-email version invalidation, ABA, challenge expiry/replay/attempts/resends, direct summary reads/writes and all quota paths, while quests remain available. Add proven synthetic fixtures to existing debrief quota tests so their accounting assertions remain meaningful.
- [x] Endpoint: write Deno tests before `backend/supabase/functions/mailbox-verification/mailbox-core.ts` and `index.ts`. Test malformed/oversized input, authentication, server-resolved recipient, no user creation, generic delivery errors, wrong identity, failed cleanup/persistence, expired/replayed challenges and successful OTP proof without replacing the original session. Use current Supabase APIs and nonpersistent clients.
- [x] Shared/client: write tests before mailbox status/send/verify functions and debrief-only eligibility/cache checks. Bind requests to owner and email version, check fresh state around saved/generated content, and fail closed on missing backend. Keep ordinary AI suggestions under the existing birthday gate only.
- [x] UI: write tests before adding small code-entry/send/status controls to existing web/mobile debriefs; hide cached summary while eligibility is unknown or rechecking, clear on owner change and foreground, preserve quest and saved server data.
- [x] Verify and checkpoint: run affected and appropriate regression suites, isolated canonical seed/SQL tests/lint, types, lint and build. Attempt a real GoTrue/Mailpit local protocol test with only synthetic accounts. Record actual output, remaining SMTP/template/callback/device/provider/age gates and local/Git state in the explicitly INCOMPLETE checkpoint. Stop the disposable stack. No completed numbered handoff or complete-slice claim.

## Official references read

- https://supabase.com/docs/guides/auth/passwordless-login/auth-email-otp
- https://supabase.com/docs/reference/javascript/auth-verifyotp
- https://supabase.com/docs/reference/javascript/auth-signout
- https://supabase.com/docs/guides/database/functions
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://docs.expo.dev/versions/v54.0.0/

The changelog Markdown endpoint was unsupported by the browsing tool. No API/dependency upgrade is planned. Hosted OTP length previously observed as eight; accept 6–10 digits without claiming the default docs establish hosted settings. A production template containing the typed token is required and is not configured by this work.
