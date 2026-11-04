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

**T2. SQL: the gate (negative tests first).**
`supabase/tests/063_google_gate.test.sql` plus migration `backend/supabase/063_google_auth.sql`:
- reject Google with `email_verified` false;
- reject Google when a user with that email exists and `private.mailbox_verified` is false (case and whitespace variants);
- allow Google when no user has that email;
- allow Google when the existing user is proved;
- ignore non-Google providers and email/password signups.
Function `public.s03_before_user_created(event jsonb) returns jsonb`; grant execute to `supabase_auth_admin` only; revoke from public, anon, authenticated, service_role. Follow the file header and `security definer set search_path=''` style of 048.

**T3. SQL: the proof trigger (negative tests first).**
Same migration, test `064_google_proof.test.sql` (or extend 063's): trigger on `auth.identities` sets `verified_version = version` only for provider `google`, verified claim, and identity email equal to the current `auth.users.email`. Tests: unverified claim no proof; mismatched email no proof; email change afterwards clears it and the old identity does not re-grant it; non-Google identity no proof; a repeat login keeps it. Confirm `current_mailbox_verified()` then returns true for a debrief gate check.

**T4. Config and real GoTrue integration.**
Enable `[auth.external.google]` (env-substituted id and secret) and the hook in `supabase/config.toml`; add the local redirect URLs for web and each mobile scheme. Extend the T1 script into the real test: unproved account + Google same email rejected, one user; proved account + Google links, one user, history intact, password works; new Google user created with proof. Show the real output. Use a local fake of the Google token endpoint only if a real login is not yet available, and say so in the handoff.

**T5. Shared error mapping.**
`packages/shared/src/logic/` module mapping callback errors to messages (cancelled, rejected-unproved, unverified Google email, generic), tests first including unknown and empty inputs. Run `npm run test --workspace @eiyu/shared`.

**T6. Web.**
Tests first in `web/src/web/__tests__/` (see `WebAuth.*.test.tsx` for style): button on sign-in and sign-up calls `signInWithOAuth` with the right provider, redirect and scopes; callback route handles code exchange, error parameters, missing code, replay, cancel with no retry loop; account-switch hygiene (no leftover state from a previous account). Then `WebAuth.tsx` and the callback route.

**T7. Mobile.**
Tests first in `mobile/` (see `contexts/__tests__/auth-store.recovery.test.tsx` for mock style; mock `expo-web-browser` with the real result shapes `success`, `cancel`, `dismiss`): `signInWithGoogle` in `contexts/auth-store.tsx`, `openAuthSessionAsync`, code exchange, cancel and dismiss leave the user signed out without an error, stale URL with no pending flow is ignored, callback routed in `app/+native-intent.tsx` without persisting the code, button on `app/auth/*`. Check font scale 1.6 on the new button text.

**T8. Privacy copy.**
Test first in the `legal-content` tests (they allow only the operator contact address), then add the Google entry to `packages/shared/src/logic/legal-content.ts`.

**T9. Local CI mirror.**
Real output for: `npm run test --workspace @eiyu/shared`, `--workspace @eiyu/mobile -- --runInBand`, `--workspace @eiyu/web`, the three type checks, lint, web build, `npm run db:test`, and the Edge tests if touched. If `node_modules` was reshaped by a `deno check`, run `npm ci` again. Do not quote earlier counts.

**T10. Live Google login on the local stack.**
Web in a browser, then the emulator, then the Oppo (`adb reverse`, `adb -d`, trust screenshots not the uiautomator dumps). Cases: new Google user; existing proved account links; existing unproved account is refused with the right message and creates nothing; cancel on the consent screen; denied consent; second login after sign-out. Check the database afterwards: user and identity counts, profile and quest counts unchanged, no stray test accounts left (delete the disposable ones and report the counts).

**T11. Handoff and stop.**
Re-scan `docs/handoff/` and take the next unused number after 028. Include commits, real test output, device evidence, what was not proved, hosted state (unchanged), rollback (revert the migration and config), and the next slice (S04). Write the continuation prompt, give it to the owner, stop. Do not start S04.

## Needs from the owner (surface at the start of the session)

- Google Cloud OAuth **Web** client: ID and secret in an ignored local env file; authorized redirect URI is the chosen local stack's `/auth/v1/callback`.
- Consent screen in Testing mode with the owner's Google account added as a test user.
- The phone on USB for the device checks.
- Not now, and each needs a yes: hosted Google provider settings, hosted redirect allowlist and hook, the one hosted smoke check, any push, OTA or APK release.

## Completion gates (roadmap row S03)

Identity, linking and cancellation tests pass; actual Google login works in the scoped local environment on web and mobile; the existing profile and history are preserved on a linked account; the unproved-account refusal is shown to work. A blocked or partly verified run is an INCOMPLETE checkpoint, not a numbered handoff.

## Open items for the implementor to settle with evidence

- Whether the hook fires and what it receives (T1).
- Exact Google scopes and whether `prompt=select_account` is wanted.
- The hosted `enable_confirmations` value (read only, with the owner signed in to the dashboard in the browser pane).
- Unlinking stays out of S03 unless a test shows a user can be locked out without it.
