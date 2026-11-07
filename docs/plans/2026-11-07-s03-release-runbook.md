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

## Backup and rehearsal (done 2026-11-07)

- Backup taken by the owner (roles, schema, data; git-ignored, `.superpowers/hosted-backup/2026-11-07-0735/`): 11 users, 11 identities, 11 profiles, 61 habits, 37 tables with data.
- Rehearsal stack `eiyu-rehearsal-047` (58321/58322) restored as a faithful copy of live, real data included with the owner's yes. Three dump gaps were made up from live reads: local default grants switched off during the restore (otherwise `anon` gains EXECUTE live never had), the one live trigger on `auth.users`, and live's three `storage.objects` policies. Live is on a newer Auth/Storage version: 6 empty tables and 1 pending sign-in token were left out, plus two new `storage.buckets` columns.
- **README marker query on the copy: 46/46** — the live schema for 001-046 matches committed SQL (closes the old "drift of 001-045" unknown).
- **047-064 applied cleanly on the copy** (each ~0.3 s, no warnings); no rows lost (172 completions, 371 occurrences, 16 gym sessions kept); 048 backfilled 11 mailbox rows. Existing accounts keep basic quests (`canWriteBasic` true); AI review and custom/fitness trackers (Gym) wait for each person's birthday and permission.
- SQL suite on the copy: 2019/2025 pass; the 6 failures (`044_tracker_lint_fixes`) pin the function owner to `supabase_admin`, the role the local stacks used. Live applies as `postgres`, as the rehearsal did; grants are identical apart from that name. Test follow-up only.
- The exact live procedure is a script, `.superpowers/rehearsal-047/apply.ps1 -Target live` (git-ignored): precheck that the target is the 046 base, 047-052 one by one, **053-056 as one transaction**, 057-064 one by one, stop at the first error, then pg_cron, schedules (`ai-admission-prune` every 15 min, `tracker-retention` 18:15 UTC daily), first prune, open AI admission, postcheck. Run end to end on a fresh copy; a second run is refused by the precheck.

## Why the order below changed

Live today still lets signed-in users write `habits` (insert/update), `long_quests` and `weekly_quests` directly, and the live site (`origin/main`) does exactly that. After 047-064 those writes are refused. So from the database step until the new site is live, creating or editing quests on the old site fails. Everything that does not need the new database goes first; the database step, the `ai-proxy` deploy and the push to `main` run back to back.

## Order (revised)

A. **YES: push `feat/s03-google-auth` to GitHub** (public repo) so GitHub CI runs on it. No deploy: only `main` deploys.
B. **Auth settings (owner in the dashboard, Claude guides)**: Google provider on with client ID/secret; Google Cloud OAuth client gets the hosted callback URI; consent screen to In production; redirect allow-list additions. Harmless to the old site (it has no Google button).
C. **YES: deploy `account-export` and `mailbox-verification`** (JWT verification on). Old clients never call them.
D. **One sitting, minutes apart:**
   1. owner runs `apply.ps1 -Target live` (the database step);
   2. **YES:** deploy `ai-proxy` (it needs 051's functions);
   3. **YES:** fast-forward `main` to the release commit and push → Vercel Production;
   4. smoke test on the live site with a disposable account, then delete it.
E. Mobile: new EAS build (runtime 1.3.0), owner installs.
F. After release: watch `ai-proxy` logs; keep the backup.

The original order below is kept for reference.

## Original order

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
