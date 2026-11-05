# S03 implementation plan: Google sign-in (2026-11-05)

Design: `docs/plans/2026-11-05-s03-google-auth-design.md` (read it first; it holds the decisions and the GoTrue evidence).
Implementor: Sonnet 5.5, effort up to high; subagent models chosen by fit (Haiku 5.5 is an option, not the default). Context limits 250k Opus/Sonnet, 100k Haiku; at a limit write an `...-INCOMPLETE.md` checkpoint and a continuation prompt. No deploys or hosted setting changes without the owner's yes. Small commits, Conventional Commits, no Co-Authored-By trailer, no secrets or personal emails (the repo is public).
Branch: create `feat/s03-google-auth` from `feat/s02-consent-admin`.
Test conventions found: SQL tests are `supabase/tests/NNN_name.test.sql` run by `npm run db:test`; real Auth/Mailpit integration scripts are `scripts/s0X-*-local.test.mjs` (model the new one on `scripts/s02-mailbox-local.test.mjs`); next migration number is 063 in `backend/supabase/`.

## Before any code

1. Owner supplies (see "Needs from the owner" below): a Google OAuth Web client and test-user setup. Without it, tasks 1-6 can still run with a stubbed provider; tasks 7+ cannot.
2. Read Expo SDK 54 docs for `expo-web-browser` and AuthSession (`https://docs.expo.dev/versions/v54.0.0/sdk/webbrowser/`, `.../sdk/auth-session/`) and the current Supabase Google doc. `npm ci` first if `node_modules` is missing.
3. Confirm the local stack: which one (54321 disposable vs 55321 personal), that GoTrue is v2.196.0 or note the actual version, and that `supabase_admin` owns the objects (see S02 notes on ownership-sensitive guards).

## Tasks (each: red test, then code, then green with real output, then commit)

**T1. Prove the hook fires (spike, no commit of product code).**
Write `scripts/s03-google-linking-local.test.mjs` first. Create a password user, then drive a Google-shaped login. A real Google round trip is not needed to learn what the hook sees: use the local stack's ability to log the hook payload from a throwaway `before_user_created` function that records `event` to a temp table in a scratch run. Answer: does it fire for a link to an existing user, what keys carry provider and `email_verified`, and how does a rejection reach the client. Record the answers in the design doc ("Findings") and stop to re-plan if the hook does not fire (fallback B2).

> **Re-planned 2026-11-06 after T1.** T2 to T4 below replace the original hook-based tasks. The reasons and decisions are in the design doc, "Re-plan (2026-11-06)". T1 showed the `before_user_created` hook is skipped for a link to an existing user, so the linking gate is a trigger on `auth.identities`. Google sign-up gets past EP003 by letting a Google-created account start without age consent and finishing it on a required screen right after the callback.

Read `backend/supabase` and `supabase/tests` for the next free numbers; the migration is likely 063 and the test numbering is separate. Implementer: Sonnet 5.5. Every task is red test, then code, then green with real output, then a commit.

**T2. SQL: the linking gate (negative tests first).**
Migration `backend/supabase/063_google_auth.sql` plus a SQL test under `supabase/tests/`. A `BEFORE INSERT` trigger on `auth.identities`, scoped to `provider = 'google'`. It raises, with a distinctive message for the auth log, only when the user already has a non-Google identity AND `private.mailbox_verified(user)` is false. Red tests first:
- unproved password account plus a Google insert raises, no Google identity remains, no proof is granted;
- proved account plus a Google insert is allowed;
- a user whose only identity is Google (the create path) is allowed; a plain proof check would block every Google sign-up, so this test must exist and must fail against that naive version;
- non-Google inserts are untouched;
- an `UPDATE` of a Google identity (a returning login) is never blocked;
- email case and whitespace variants do not change the outcome.
`security definer set search_path=''`, revoke from public, anon, authenticated, service_role, in the file-header style of 048.

**T3. SQL: the proof trigger (negative tests first).**
Same migration. An `AFTER INSERT OR UPDATE` trigger on `auth.identities`, also scoped to `provider = 'google'`, so by timing it runs after the gate (do not rely on name order). It sets `verified_version = version`, `verified_at = now()` in `private.mailbox_state` when `identity_data->>'email_verified'` is true and the identity email, lowercased and trimmed, equals the current `auth.users.email`. Tests: verified claim with matching email grants proof; unverified claim does not; mismatched email does not; an email change clears the proof and the old identity does not re-grant it; a non-Google identity does nothing; a repeat login keeps the proof; afterwards `current_mailbox_verified()` is true for the debrief gate.

**T3b. SQL: the EP003 exception and the create-path hook (negative tests first).**
- `create or replace` `private.capture_initial_processing_consent` (050): when `new.raw_app_meta_data->>'provider' = 'google'` and the age-screening choice is absent, skip the consent insert. The exception keys on `raw_app_meta_data` only, because GoTrue sets it and the client cannot. Tests: a password sign-up without consent still raises EP003; a password sign-up whose `raw_user_meta_data` claims Google still raises EP003; an account created with `provider = 'google'` in `raw_app_meta_data` and no consent passes and has no consent row; the existing 050 tests still pass untouched.
- `public.s03_before_user_created(event jsonb) returns jsonb`, wired as the hook, only for the create path: reject an unverified Google email with `{"error":{"http_code":403,"message":"..."}}` and a readable message (T1: an empty message counts as success). Tests for verified Google, unverified Google, and non-Google. Grant execute to `supabase_auth_admin` only. It never touches linking.

**T4. Config and real GoTrue integration.**
Enable `[auth.external.google]` (env-substituted id and secret) and the narrowed hook in `supabase/config.toml`; add the local redirect URLs for web and each mobile scheme. Disposable stack `eiyu-s02-age-demo` (API 57321, DB 57322); say which stack is used. Extend `scripts/s03-google-linking-local.test.mjs` into the real test with real Google logins:
- a new Google user is created with no consent row, has mailbox proof, and `current_mailbox_verified()` is true;
- an unproved password account plus Google with the same email is refused: still one user, no Google identity, the browser gets the generic error;
- a proved account plus Google links: one user, same id, profile and quests intact, the password still signs in, two identities.
Show the real output. The unverified-Google-email path cannot be produced with a real Google account, so it is covered at SQL level only; say so in the handoff.

**T5. Shared error mapping.**
`packages/shared/src/logic/` module mapping callback errors to messages, tests first including unknown and empty inputs: cancelled; link refused (the combined message, for `unexpected_failure` or "Error creating identity": "Google couldn't connect to this email. If you already have an Eiyu account, sign in with your password and verify your email first, then use Google."); the hook's 403 text for an unverified Google email; generic. Also `needsGoogleSignupFinish(user, processing status)`, true only for a Google-created account without age consent, so legacy password accounts are never pushed into the finish screen (tests: password account without consent is false, Google account with consent is false, Google account without consent is true, missing input is false). Run `npm run test --workspace @eiyu/shared`.

**T6. Web.**
Tests first in `web/src/web/__tests__/` (see `WebAuth.*.test.tsx` for style): button on sign-in and sign-up calls `signInWithOAuth` with the right provider, redirect and scopes; callback route handles code exchange, error parameters, missing code, replay, cancel with no retry loop; account-switch hygiene (no leftover state from a previous account). The sign-up button carries the line "You'll confirm your birthday right after Google." A required "finish sign-up" screen shows when `needsGoogleSignupFinish` is true: it reuses the existing notice, consent and birthday components and RPCs (`public.set_account_birthday`, the 050 consent setter, under-12 handling included), keeps sign-out available, blocks the rest of the app until done, and never stores a birth date in browser storage. Tests: the screen appears for a Google account without consent, does not appear for a password account, reappears after sign-out and sign-in if abandoned, and a failed save leaves the user on it. Then `WebAuth.tsx`, the callback route and the finish screen.

**T7. Mobile.**
Tests first in `mobile/` (see `contexts/__tests__/auth-store.recovery.test.tsx` for mock style; mock `expo-web-browser` with the real result shapes `success`, `cancel`, `dismiss`): `signInWithGoogle` in `contexts/auth-store.tsx`, `openAuthSessionAsync`, code exchange, cancel and dismiss leave the user signed out without an error, stale URL with no pending flow is ignored, callback routed in `app/+native-intent.tsx` without persisting the code, button on `app/auth/*`, and the same required finish screen with the same tests as web. Check font scale 1.6 on the new button text and the finish screen.

**T8. Privacy copy.**
Test first in the `legal-content` tests (they allow only the operator contact address), then add the Google entry to `packages/shared/src/logic/legal-content.ts`. It must also say that a Google sign-up creates the account before the birthday step, and what the account holds until the user finishes (email, name, avatar URL, Google ID).

**T9. Local CI mirror.**
Real output for: `npm run test --workspace @eiyu/shared`, `--workspace @eiyu/mobile -- --runInBand`, `--workspace @eiyu/web`, the three type checks, lint, web build, `npm run db:test`, and the Edge tests if touched. If `node_modules` was reshaped by a `deno check`, run `npm ci` again. Do not quote earlier counts.

**T10. Live Google login on the local stack.**
Web in a browser, then the emulator, then the Oppo (`adb reverse`, `adb -d`, trust screenshots not the uiautomator dumps). Cases: new Google user reaches the finish screen, then consent and birthday are saved; abandoning at the finish screen and signing in again shows it again; existing proved account links; existing unproved account is refused with the combined message and creates nothing; cancel on the consent screen; denied consent; second login after sign-out. Check the database afterwards: user and identity counts, profile and quest counts unchanged, no stray test accounts left (delete the disposable ones and report the counts).

**T11. Handoff and stop.**
Re-scan `docs/handoff/` and take the next unused number after 028. Include commits, real test output, device evidence, what was not proved, hosted state (unchanged), rollback (revert the migration and config), and the next slice (S04). Write the continuation prompt, give it to the owner, stop. Do not start S04.

## Needs from the owner (surface at the start of the session)

- Google Cloud OAuth **Web** client: ID and secret in an ignored local env file; authorized redirect URI is the chosen local stack's `/auth/v1/callback`.
- Consent screen in Testing mode with the owner's Google account added as a test user.
- The phone on USB for the device checks.
- The hosted "Confirm email" (`enable_confirmations`) value, read from the dashboard (not visible from SQL).
- Not now, and each needs a yes: hosted Google provider settings, hosted redirect allowlist and hook, the one hosted smoke check, any push, OTA or APK release.

## Completion gates (roadmap row S03)

Identity, linking and cancellation tests pass; actual Google login works in the scoped local environment on web and mobile; the existing profile and history are preserved on a linked account; the unproved-account refusal is shown to work. A blocked or partly verified run is an INCOMPLETE checkpoint, not a numbered handoff.

## Open items for the implementor to settle with evidence

- ~~Whether the hook fires and what it receives (T1).~~ Settled by T1: it does not fire for a link; see the design doc.
- Hosted: `postgres` shows TRIGGER privilege on `auth.identities`, but only creating the trigger proves it, and that needs the owner's yes. Hosted also lacks migrations 048 and 050 (S02 not released), so S03 cannot reach hosted before S02's SQL does. If hosted refuses the trigger, Google must not be enabled there.
- Whether an in-app account deletion can be offered on the finish screen for abandoned Google accounts.
- Exact Google scopes and whether `prompt=select_account` is wanted.
- The hosted `enable_confirmations` value (read only, with the owner signed in to the dashboard in the browser pane).
- Unlinking stays out of S03 unless a test shows a user can be locked out without it.
