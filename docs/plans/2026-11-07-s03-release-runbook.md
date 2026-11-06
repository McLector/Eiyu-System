# S02 + S03 release runbook

Written 2026-11-07 from read-only checks. Nothing hosted was changed. This document grants no deployment authority: every step marked **YES** needs the owner's explicit yes at the time it runs. It updates the checklist in `2026-10-24-s02-release-facts.md` (still the reference for the reasoning behind each step) with S03 and today's verified facts.

## Verified today (2026-11-07, read-only)

| Fact | Value |
| --- | --- |
| Candidate commit | `feat/s03-google-auth` at `e23f05b`, 84 commits ahead of `origin/main` (`46aeebc`), 0 behind; branch never pushed |
| Final checks on `e23f05b` | CI mirror all exit 0 (shared 1137, web 1552, mobile 2171 tests, web build, lint 0 errors, SQL 2025 tests); web and phone live checks passed (handoff 031) |
| Hosted schema | Has 040, 041, 045, 046. **Missing every migration from 047 to 064** (probe of one object per migration; 057 not probed, it only replaces functions) |
| Hosted Edge functions | Only `ai-proxy` v26 (`verify_jwt` on). `account-export` and `mailbox-verification` not deployed; all three changed on the branch |
| Hosted data | 11 Auth users (3 signed in within 30 days), 61 habits, 0 non-email identities |
| Plan / backups | Free plan, no automatic backups (verified 2026-10-24) |
| pg_cron | Not enabled (verified 2026-10-24) |
| Auth site URL / allow-list | `https://eiyu-system.vercel.app/auth`, one allow-list entry (verified 2026-11-03) |

## What S03 adds to the old checklist

- Migrations now run **047-064** (063 Google link gate, 064 one-call finish).
- Hosted Google provider: client ID and secret in Auth → Providers → Google; in Google Cloud the OAuth client needs the hosted callback `https://<project-ref>.supabase.co/auth/v1/callback` as an authorised redirect URI.
- Google OAuth consent screen: while it is in **Testing**, only listed test users can sign in. Public release needs it set to **In production** (email/profile scopes are non-sensitive, but Google may ask for branding verification for the app name and logo).
- Redirect allow-list additions for Google: `https://eiyu-system.vercel.app/auth/callback` and the shipped scheme callback(s) (`eiyusystem://auth/callback`; preview/dev only if those builds point at hosted). Plus the recovery callbacks already listed in the old checklist.
- Pre-release fix (local, small): an expired Google sign-in (`error_code=bad_oauth_state`) lands on the site URL `/auth` and showed nothing. **Done 2026-11-07**: `/auth` now shows "Google sign-in took too long. Try again." and clears the address bar; other errors there (such as an expired email link) are left alone. If the site URL ever stops being `/auth`, this message moves with it.

## Order

Each step names who does it. Steps 4-9 should run in one sitting: between the migrations (4) and the push (9) the live web is the old client talking to the new database.

1. **Owner decisions** (below). Nothing runs before these.
2. **Pre-release fix** for the expired sign-in message (local, Claude, tests first), then full CI mirror again on the final commit. Push the feature branch to GitHub only after a **YES** (the repo is public; GitHub CI then runs on it).
3. **Backup** — owner runs `supabase db dump` (schema and data, plus roles) for the live project with the database password; the file stays out of git. Claude does not handle the password.
4. **Rehearsal (Claude, local only)**: restore the live *schema* (no user data) into a fresh disposable stack, apply 047-064 in order as `postgres`, run the SQL suite and the marker query. Proves the migrations apply on the real base, not just on our local history.
5. **YES: apply 047-064 to hosted** in order (053-056 together), then run the marker query and the probe from this document. Enable **pg_cron** and install the 051 maintenance and retention schedules in the same step.
6. **YES: Auth settings** — Google provider on, client ID/secret (owner pastes them in the dashboard), redirect allow-list additions above, consent screen publishing status.
7. **YES: Edge functions** — confirm secrets (`AI_PROVIDERS`, provider keys) by name only, deploy `ai-proxy`, `account-export`, `mailbox-verification` with JWT verification on; then compare deployed versions with local source.
8. **Hosted smoke test** with disposable test accounts: password sign-up with notices, Google sign-up and finish screen, Google link to a verified account, recovery, mailbox proof, AI debrief, export. Delete the test accounts afterwards.
9. **Before the merge**: `CHANGELOG.md` has no S02 or S03 entries and the README does not mention Google sign-in; write both from the handoffs (Claude, local commit).
   **YES: merge to `main` and push** — this deploys web to Vercel Production. CI green first; re-check CORS from the production origin.
10. **YES: mobile** — runtime is 1.3.0 (native fontScale change), so an OTA cannot reach the installed 1.2.0 apps: a new EAS build is needed (preview first, then production). The installed production 1.2.0 on the owner's phone should be opened online once before replacing (unsynced saves).
11. **After release**: watch `ai-proxy` logs and request accounting; keep the backup until stable.

Still open from the old checklist and not re-checked today: `privacy@eiyusystem.app` must receive mail; Privacy Policy and Play data-safety forms must match the shipped notices; the Terms of Use text is a three-sentence stub.

## Owner answers (2026-11-07)

1. Mobile: only the owner uses it, so the window for the old 1.2.0 app does not matter.
2. **Release now**, step by step, each hosted step with its own yes.
3. Expired-sign-in fix: **before release**.
4. Google consent screen: **In production** at release.

## Owner decisions needed (as asked)

1. **Who uses the mobile app besides you?** If only you, the old 1.2.0 app breaking during the window does not matter; if others do, they need the new build before or right after step 5.
2. **Release now or keep it local?** Releasing means steps 3-10 within days, each with its own yes. Keeping it local means S04 can start and the release waits (the gap to hosted keeps growing).
3. **The expired-sign-in fix**: do it before release (recommended, small) or ship without it.
4. **Google consent screen**: keep it in Testing (only listed accounts can use Google sign-in) or move it to In production at release.
