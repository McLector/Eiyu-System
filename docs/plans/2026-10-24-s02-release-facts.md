# S02 release facts inventory (gate 5)

Recorded 2026-10-24 from a read-only pass over the repo. Nothing was changed, deployed or called on a hosted service. No secret values, emails or tokens are recorded; environment variables appear by name only.

S01 COMPLETE; S02 INCOMPLETE; public release BLOCKED. This document grants no deployment, publishing or configuration authority.

Status key:
- **VERIFIED** means a source was read (named in the row) or the orchestrator checked it read-only on 2026-10-24.
- **CONFIGURED-IN-SOURCE** means the repo says so; it is not proven deployed.
- **UNKNOWN** means nothing readable proves it, so the gate stays open.

Repo state at the time: branch `main`, HEAD and `origin/main` both `46aeebc`, with 239 dirty or untracked paths (local S02 work, not committed).

## 1. Hosted facts (orchestrator, read-only, 2026-10-24)

| Fact | Status | Source |
| --- | --- | --- |
| Live project `rrshxkwukhhvioulfqsj` has none of migrations 047-056 applied; 046 is present | VERIFIED | Orchestrator read-only check, also recorded in `2026-10-24-s02-orchestration-checkpoint.md` |
| Only Edge function deployed is `ai-proxy`, version 26 | VERIFIED | Same |
| `account-export` and `mailbox-verification` are not deployed | VERIFIED | Same |
| 11 Auth users exist | VERIFIED | Same |
| Deployed `ai-proxy` v26 `verify_jwt` setting today | UNKNOWN | Older docs record `verify_jwt=true` for v24 (`2026-10-16-s01-s02-verification.md`). v26 is not recorded there. |
| Deployed `ai-proxy` v26 source equals any local source | UNKNOWN | Local `ai-proxy-core.ts`, `-generator.ts`, `index.ts` and tests are modified relative to `46aeebc` (git status). Earlier docs say "historical v26/JWT/disabled evidence is not current global parity" (closure ledger gate 5). |
| Deployed `ai-proxy` secrets and env values | UNKNOWN | Not read. Names only are listed in section 4. |

## 2. Web origin and CORS

| Item | Value | Status | Source |
| --- | --- | --- | --- |
| Hosting | Vercel, SPA rewrite `/(.*)` to `/index.html` | CONFIGURED-IN-SOURCE | root `vercel.json` |
| Vercel build command, output dir, root dir, env vars, domains | not in the repo (no `.vercel/` folder; `vercel.json` has only the rewrite) | UNKNOWN | repo listing |
| Web build tool | Vite (`web/vite.config.ts`, no `base`, no origin setting) | CONFIGURED-IN-SOURCE | `web/vite.config.ts` |
| Web client env var names | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (also in `web/.env.example`; `web/.env` is untracked) | CONFIGURED-IN-SOURCE | `web/.env.example`, `.github/workflows/ci.yml` |
| Origin the repo names as the live web app | `https://eiyu-system.vercel.app` | CONFIGURED-IN-SOURCE | `README.md` line 5; all three Edge entrypoints |
| That origin returns 200 with the EIYU SYSTEM marker | reachable on a public GET | VERIFIED (historical, 2026-10-23 transport observation; not repeated this pass) | closure ledger, "Narrowed source/origin gaps" |
| `https://eiyusystem.app` | unreachable from earlier checks; ownership and DNS unknown | UNKNOWN | closure ledger |
| Owner's intended launch origin | not decided | UNKNOWN | closure ledger gate 5; `2026-10-24-s02-owner-decisions.md` Decision 12 item 1 |
| Web production deploy trigger | a push to `main` deploys to Vercel Production | CONFIGURED-IN-SOURCE (documented, not re-observed) | `docs/handoff/022-handoff.md`, `026-handoff.md` |
| Vercel preview origin pattern | `https://eiyu-system-<slug>-myres-projects.vercel.app` | CONFIGURED-IN-SOURCE | regex in the Edge entrypoints |

CORS allowlists in source. All three functions allow the same set: `http://localhost:8081`, `http://localhost:19006`, `http://localhost:5173`, `https://eiyu-system.vercel.app`, and the preview regex above. No wildcard is used. Native requests send no `Origin`, so the list only gates browser fetches.

| Function | CORS source | Status |
| --- | --- | --- |
| `ai-proxy` | `ALLOWED_ORIGINS`, `PRODUCTION_ORIGIN`, `PREVIEW_ORIGIN_RE` in `index.ts`. `ai-proxy-core.ts` has a permissive `defaultCorsHeaders` that echoes any origin, used only if the caller supplies none. `index.ts` supplies its own. | CONFIGURED-IN-SOURCE |
| `account-export` | inline allowlist in `index.ts`; `export-core.ts` returns 403 when an origin is present and not allowed | CONFIGURED-IN-SOURCE |
| `mailbox-verification` | inline allowlist in `index.ts` | CONFIGURED-IN-SOURCE |

Note: the hosted function's actual CORS behaviour is UNKNOWN until v26's deployed source is compared with local source.

## 3. Auth site URL and redirect allowlists per environment

The repo sets only the local stack. Hosted Auth settings were not read.

| Environment | Site URL | Redirect allowlist | Status | Source |
| --- | --- | --- | --- | --- |
| Local stack (`supabase/config.toml`) | `http://127.0.0.1:3000` | `https://127.0.0.1:3000` | CONFIGURED-IN-SOURCE | `supabase/config.toml` `[auth]` |
| Disposable test project | exact loopback web and Dev callback entries | not repeated here | CONFIGURED-IN-SOURCE (as described in docs) | `backend/supabase/README.md` Password recovery section |
| Live project `rrshxkwukhhvioulfqsj` | not read | not read | UNKNOWN | no hosted Auth config source |

Callback URLs the clients request. Each must be allowlisted exactly before activation. No wildcards.

| Client | Requested callback | Status | Source |
| --- | --- | --- | --- |
| Web | `<window.location.origin>/auth/recovery` | CONFIGURED-IN-SOURCE | `web/src/web/WebAuth.tsx` line 131 |
| Native production | `eiyusystem://auth/recovery` | CONFIGURED-IN-SOURCE | `mobile/contexts/auth-store.tsx` line 68 (`Linking.createURL`), scheme from `app.json`; README in `backend/supabase` |
| Native preview | `eiyusystem-preview://auth/recovery` | CONFIGURED-IN-SOURCE | `mobile/app.config.js` |
| Native dev | `eiyusystem-dev://auth/recovery` | CONFIGURED-IN-SOURCE | `mobile/app.config.js` |
| Each of the above is on the live Auth allowlist | not read | UNKNOWN | no hosted source |

Other local Auth settings in `supabase/config.toml` (local only, not evidence of hosted values): `enable_signup = true`, `enable_confirmations = false`, `double_confirm_changes = true`, `secure_password_change = false`, `otp_length = 6`, `otp_expiry = 3600`, `minimum_password_length = 6`, rate limit `email_sent = 2`. The disposable project README says it retains eight-digit email OTPs; that conflicts with `otp_length = 6` in the file, so the live and disposable values are UNKNOWN. Both web and mobile Auth clients disable automatic URL-session detection (closure ledger).

## 4. App variants and update channels

| Variant | Android package id | Scheme | App name | Widget label | Source |
| --- | --- | --- | --- | --- | --- |
| development | `com.mclector.eiyusystem.dev` | `eiyusystem-dev` | Eiyu Dev | Eiyu Dev: Today | `mobile/app.config.js` |
| preview | `com.mclector.eiyusystem.preview` | `eiyusystem-preview` | Eiyu Preview | Eiyu Preview: Today | `mobile/app.config.js` |
| production | `com.mclector.eiyusystem` | `eiyusystem` | eiyu-system | Eiyu: Today | `mobile/app.json`, `mobile/app.config.js` |

All rows CONFIGURED-IN-SOURCE. The variant comes from `APP_VARIANT`; unset means production; an unknown value throws. `mobile/lib/app-variant.ts` maps the native application id to a scheme at runtime.

| Item | Value | Status | Source |
| --- | --- | --- | --- |
| App version | `1.2.0` | CONFIGURED-IN-SOURCE | `mobile/app.json` |
| `runtimeVersion` | `"1.2.0"` (literal string, not a policy) | CONFIGURED-IN-SOURCE | `mobile/app.json` |
| Expo SDK / expo-updates | `expo ~54.0.36`, `expo-updates ~29.0.20` | CONFIGURED-IN-SOURCE | `mobile/package.json` |
| Updates URL / EAS project | `https://u.expo.dev/08d68f23-89b3-4e52-90b8-0e650a698015`; owner `mclector` | CONFIGURED-IN-SOURCE | `mobile/app.json` (project id is not a secret) |
| iOS | only `supportsTablet`; no bundle id; no iOS build profile | CONFIGURED-IN-SOURCE | `mobile/app.json`; treat iOS as not shipped |
| `appVersionSource` | `remote` | CONFIGURED-IN-SOURCE | `mobile/eas.json` |

EAS profiles (`mobile/eas.json`):

| Profile | `APP_VARIANT` | environment | channel | distribution | Android build | Other |
| --- | --- | --- | --- | --- | --- | --- |
| development | development | development | development | internal, `developmentClient: true` | apk | node 22.18.0 |
| preview | preview | preview | preview | internal | apk | node 22.18.0 |
| production | production | production | production | store default (not set to internal) | apk | node 22.18.0, `autoIncrement: true` |

`submit.production` is empty. There is no submit config (no Play service account or track).

| Item | Status | Source |
| --- | --- | --- |
| An EAS preview build exists and is installed on the owner's phone | UNKNOWN as current fact. Handoff 022 describes the plan (one interactive EAS preview build, then OTA); handoff 026 says the OTA "Eiyu Preview" app must be opened twice and the phone was not checked. | `docs/handoff/022-handoff.md`, `026-handoff.md` |
| Published OTA: branch `preview`, runtime `1.2.0`, android, from `46aeebc`, `--environment preview`, update group `0b993be3-31b9-492b-bee5-41ef689182aa` | documented in a handoff, not re-verified against EAS this pass | `docs/handoff/026-handoff.md` (treat as CONFIGURED-IN-SOURCE history, not VERIFIED) |
| OTA branch to channel mapping (`preview` branch linked to `preview` channel) | UNKNOWN. The repo only shows the channel in `eas.json`; the branch-channel link lives on EAS. | none |
| Any production-channel build, production OTA branch, or Play listing | UNKNOWN. README/handoffs describe production as a sideloaded APK. | `docs/handoff/022-handoff.md` |
| Release builds contain the S02 local work (047-056 clients, tracker consent) | No. The last OTA was cut from `46aeebc`; S02 work is uncommitted. Any build or OTA made from today's tree needs a new runtime decision. | git state above |
| Runtime bump needed for S02 | UNKNOWN. `app.config.js` says changing a package, scheme or native plugin is a native change that needs a `runtimeVersion` bump. S02 added dependencies to `mobile/package.json` (modified in the working tree); whether any is native was not examined here. | `mobile/app.config.js` comment; git status |
| Old-client cutoff: an old app on runtime 1.2.0 talking to a server with 047-056 | UNKNOWN. Docs say absence of pause fields on old servers must not grant write access (client side). The reverse (old client versus new server) is not proven. | `backend/supabase/README.md` (049 section) |

## 5. Edge functions

Entrypoints are under `backend/supabase/functions/`. The root `supabase/functions/` directory exists but is empty. The root `supabase/config.toml` has no `[functions.*]` blocks, so `verify_jwt` is not set per function in the repo for any of them.

| Function | Entrypoint | Required env var names (read in source) | `verify_jwt` | Deployed | Status |
| --- | --- | --- | --- | --- | --- |
| `ai-proxy` | `ai-proxy/index.ts` (handler from `ai-proxy-route.ts`) | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `AI_PROVIDERS` (must match the one approved Groq entry exactly), `GROQ_API_KEY`; optional `AI_PROVIDER_MODE` (unset or `groq-only` is the production route; any other value ignores `AI_PROVIDERS` and denies) | not set in repo; v24 recorded `true`; v26 UNKNOWN | v26 (VERIFIED) | CONFIGURED-IN-SOURCE for env names; deployed secrets UNKNOWN |
| `account-export` | `account-export/index.ts` | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | not set in repo; source comment says retain JWT verification in any serving config | not deployed (VERIFIED) | CONFIGURED-IN-SOURCE |
| `mailbox-verification` | `mailbox-verification/index.ts` | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | not set in repo | not deployed (VERIFIED) | CONFIGURED-IN-SOURCE |

Notes:
- Env var lists come from `Deno.env.get` calls in the three `index.ts` files and from `getEnv(...)` in `ai-proxy-route.ts`. Other modules (`ai-proxy-admission.ts`, `mailbox-core.ts`, `export-core.ts`) were only searched for env reads, and none were found. A deeper review might find more.
- `ai-proxy-providers.ts` still contains a Gemini base URL and `GEMINI_API_KEY`, but the configured route is Groq only; Gemini is unreachable in the production entry point (comment in `ai-proxy-route.ts`).
- Whether Supabase injects `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` on the live project is platform behaviour, not read here. Deployed secret names are UNKNOWN.
- Provider facts from earlier docs (Groq zero data retention, usage-metadata retention) are owner observations in `2026-10-20-s02-retention-evidence.md`. They are not verified here.
- 051 scheduling: no pg_cron schedule is installed by the migration; hosted schedule and history are UNKNOWN (closure ledger gate 5).

## 6. Email: sender, templates, SMTP

| Item | Status | Source / reason |
| --- | --- | --- |
| Local stack SMTP | CONFIGURED-IN-SOURCE: `[local_smtp] enabled = true` (Mailpit, local only) | `supabase/config.toml` |
| Hosted SMTP provider | UNKNOWN as a setting. Docs repeatedly refer to Resend and an owner "Tokyo sending-region observation", which is an owner statement, not a read of the hosted setting. | `2026-10-20-s02-retention-evidence.md` |
| Sender name and address (From) | UNKNOWN. Nothing in the repo names it. | no source |
| Email template files | None in repo: `supabase/config.toml` has no `[auth.email.template.*]` or notification blocks. | `supabase/config.toml` |
| Signup confirmation template (hosted) | UNKNOWN. Local `enable_confirmations = false`; hosted setting unknown. | no hosted source |
| Recovery template (hosted) | UNKNOWN. Must retain the Supabase confirmation link and deliver the requested callback. | `backend/supabase/README.md`; closure ledger gate 5 |
| Email-change template (hosted) | UNKNOWN. Neither Profile screen has an email editor, and no email-change receiving implementation exists in the client paths read. | closure ledger "Narrowed source/origin gaps" |
| Mailbox-proof template (Magic Link carrying `{{ .Token }}`) | UNKNOWN on hosted. Source requires an approved Magic Link template containing `{{ .Token }}` and a suitable SMTP service; only a disposable local template was changed. | `backend/supabase/README.md` header |
| Email OTP length and expiry on hosted | UNKNOWN | see section 3 |
| Resend plan, log retention, optional AI-editor features | UNKNOWN | owner decision 12 item 3 |
| Delivered hosted Recovery email to a real inbox and callback acceptance | UNKNOWN. Only local Dev recovery receiving is accepted. | `2026-10-21-s02-current-device-acceptance.md` |

## 7. Store and privacy disclosures; legal-content versions

| Item | Value | Status | Source |
| --- | --- | --- | --- |
| Age notice version | `2026-10-20-age-v1` | CONFIGURED-IN-SOURCE | `packages/shared/src/logic/legal-content.ts` (`AGE_NOTICE_VERSION`) |
| AI notice version | `2026-10-20-weekly-debrief-v1` | CONFIGURED-IN-SOURCE | same (`AI_NOTICE_VERSION`) |
| Custom tracker notice version | `2026-10-23-custom-tracker-v1` | CONFIGURED-IN-SOURCE (contract, in `tracker-access.ts` stub per the frozen contract) | `2026-10-24-s02-parallel-contract.md` section 2.1 |
| Fitness tracking notice version | `2026-10-23-fitness-tracking-v1` | CONFIGURED-IN-SOURCE | same |
| Tracker notice copy (`TRACKER_PURPOSE_NOTICES`) | to be added by the shared lane | UNKNOWN (not confirmed in tree) | parallel contract |
| Privacy Policy source | page titled "Privacy Policy" in `legal-content.ts`; the code comment says versions are "candidate ... not a published consent notice" | CONFIGURED-IN-SOURCE | `legal-content.ts` lines 3 and 37 |
| Privacy Policy lacks the vendor-retention and request-response addition | Per closure ledger, the proposed addition is a candidate only, not source | VERIFIED as of the ledger (2026-10-23); current-tree text not re-read | closure ledger; `2026-10-20-s02-retention-evidence.md` |
| Privacy-policy additions approved for publication | open | UNKNOWN | owner decisions 13 |
| Privacy contact shown in app and policy | an address exists in notice copy (not recorded here) | CONFIGURED-IN-SOURCE | `2026-10-20-s02-notice-consent-design.md` |
| Policy public URL or in-store listing URL | none in repo | UNKNOWN | no source |
| Play Console data-safety and privacy forms | not decided or filled | UNKNOWN | owner decisions 12 item 4 |
| Hosting plan and backup retention (Supabase) | public docs give plan-dependent windows; the project's actual plan is not known | UNKNOWN | retention evidence; owner decisions 12 item 2 |
| Request targets of 7 and 30 days | adopted targets, not universal erasure promises | CONFIGURED-IN-SOURCE (documented decision) | closure ledger gate 4 |

## 8. Server source parity notes

| Topic | Note | Status |
| --- | --- | --- |
| Migrations 001-046 | Repo baseline; README says hand-applied via SQL Editor, `supabase db push` is not used. Live project has 046 (VERIFIED). A full 001-046 drift comparison was not done here, and the README's read-only marker query has not been run against live in this pass. | 046 VERIFIED; drift UNKNOWN |
| Migrations 047-056 | Local drafts. 053-056 have only rollback-only evidence; nothing from them is permanently applied anywhere. 049 and 050 apply to the retained local test database. | VERIFIED not on live |
| 047-056 must be applied as a set | README forbids a partial prefix of 053-056 and warns against applying 047-056 to a deployed project yet. | CONFIGURED-IN-SOURCE |
| `ai-proxy` | Live v26 versus local tree: local files are modified, so parity is not claimed. | UNKNOWN |
| `account-export`, `mailbox-verification` | Local source only. | VERIFIED not deployed |
| Local seed globs | `supabase/config.toml` seeds from `../backend/supabase/*.sql`, so a local reset applies 001-056 including drafts. | CONFIGURED-IN-SOURCE |
| Local config port mismatch | `config.toml` says API 55321 and DB 55322. Memory notes say a separate disposable stack uses 54321/54322, so config is not a reliable pointer to the disposable stack. | not a release fact |
| CI | `.github/workflows/ci.yml` runs on every push and pull request: `npm ci`, shared tsc + tests, mobile tsc + jest, web tsc + vitest, `npm run lint`. It runs no Deno, SQL or e2e tests and does no deploy. Env vars are placeholders (`VITE_SUPABASE_*`, `EXPO_PUBLIC_SUPABASE_*`). | CONFIGURED-IN-SOURCE |

## Release checklist (for when the owner chooses to release)

Order matters. Each step lists why it comes before the next.

1. **Decide the owner-only facts first** (owner decisions 12 and 13): launch web origin, Supabase plan and backups, Resend settings, store disclosures, release build type (OTA, APK or both). Everything below depends on them, and CORS, redirects and email links need the origin. Do not guess an origin.
2. **Freeze one candidate commit.** Commit the local S02 work on a feature branch in small commits, resolve the `mobile/lib/gym-media-upload.ts` ownership gap and run the justified final checks (shared, web, mobile, Deno edge, SQL). Reason: server and client changes must come from the same frozen tree so versions match everything below.
3. **Verify hosted schema drift (read-only).** Run the README marker query against the live project for 001-046, and compare the live `ai-proxy` v26 source and settings (including `verify_jwt`) with local source. Reason: migrations are hand-applied, so deployed state may differ from committed SQL. Applying 047-056 on an unknown base can fail partway.
4. **Take a backup or export of the live database.** Free-plan projects have no daily backups; with 11 real Auth users, 047-056 should not go on without a rollback path. Needs the owner (plan unknown).
5. **Apply 047-056 as an ordered set** (053-056 atomically), through the SQL Editor or an approved MCP, after a final rollback-only rehearsal against a copy. Reason: Edge functions and clients call RPCs that exist only in 047-056, and 051 is default-closed for AI admission, so applying it changes AI behaviour for existing clients immediately. Settle the old-client and global-drain disposition beforehand (closure ledger gate 5).
6. **Set hosted Auth config**: site URL, exact redirect allowlist for the chosen web origin `/auth/recovery` and each intended scheme callback, no wildcards; confirm signup confirmation, OTP length and expiry. Reason: Recovery and mailbox proof fail if callbacks are not allowlisted, and they must exist before email tests.
7. **Configure SMTP and templates**: sender, signup, Recovery (keeps the confirmation link), email-change, and the Magic Link template with `{{ .Token }}` for mailbox proof. Reason: `mailbox-verification` and Recovery depend on them. Test delivery only with test accounts.
8. **Set Edge function secrets** (names in section 5), including `AI_PROVIDERS` and `GROQ_API_KEY` for `ai-proxy`. Then **deploy the functions** with JWT verification kept on (`account-export`, `mailbox-verification`, `ai-proxy`). Reason: secrets must exist before deploy, because missing config denies AI or throws. Functions must follow the migrations because they call the new RPCs, and must precede client builds that call them.
9. **Install the 051 maintenance schedule** (pg_cron) if the owner approves, then confirm freshness. Reason: 051 fails closed on stale maintenance, so AI stays denied without it.
10. **Smoke test on the live project with disposable test accounts**: signup with notices, Recovery email to callback on web and native, mailbox proof, tracker consent decline and withdrawal, AI weekly debrief, export, under-12 pause, and a request through the old client. Delete the test accounts afterward. Reason: this is the first real hosted proof; do it before users can reach new clients.
11. **Update the Privacy Policy source and store forms** from the final notices and publish the policy URL. Reason: the policy and store disclosures must match shipped behaviour before the builds are public.
12. **Build or publish mobile**: decide `runtimeVersion` (bump if any native dependency or plugin changed), then an EAS build and/or `eas update` on the matching branch and channel, preview first. Reason: an OTA only reaches builds with the same runtime and channel, and new clients need the server from steps 5-8 already live. Verify on the device (open the app twice for an OTA).
13. **Push to `main` (production web) last**, with CI green first. Reason: a push to `main` deploys web to Vercel Production at once. The web client must not be live before the migrations, functions, Auth settings and email setup it depends on. Re-check the Vercel production origin against the CORS allowlist after deploy.
14. **After release**: watch `ai-proxy` logs and request-accounting tables, and confirm hosted Recovery on the real origin. Keep the rollback path from step 4 until stable.

**Release gates added 2026-11-03:** enable pg_cron and the retention job together with the new notices, because the notices promise removal. Bump `runtimeVersion` to 1.3.0 for the native `fontScale` change, so an update cannot reach older binaries. Migrations now run 047-062.

## UNKNOWN list (gate stays open)

1. Owner's intended launch web origin (`eiyu-system.vercel.app` versus `eiyusystem.app`, whose ownership and reachability are unknown).
2. Vercel project settings (build command, output directory, env var values, domains).
3. Hosted Auth site URL and redirect allowlist, signup confirmation, OTP length and expiry.
4. Hosted SMTP provider settings, sender name and address, and all four templates (signup, Recovery, email-change, mailbox-proof Magic Link).
5. Live `ai-proxy` v26 `verify_jwt` setting, secret names and source parity with the local tree.
6. Drift of the live schema for 001-045 against committed SQL.
7. Hosted 051 pg_cron schedule and maintenance history.
8. Whether the EAS preview build is installed, whether the OTA arrived, the branch-to-channel mapping, and any production build, channel or Play listing.
9. Whether a `runtimeVersion` bump is needed for the S02 tree.
10. Old-client versus new-server behaviour (reverse compatibility) and the old-client disposition.
11. Supabase plan, backup retention, any owner-held exports; Resend plan, log retention, optional AI features.
12. Play Console data-safety and privacy forms, public policy URL, and approval of the Privacy Policy additions.
13. Current text of `TRACKER_PURPOSE_NOTICES` and the final Privacy Policy source.

## Verified 2026-10-24 (orchestrator, read-only MCP checks)

| Fact | Status | Source |
| --- | --- | --- |
| Supabase organization plan | VERIFIED: Free (`tier_free`) | Supabase MCP `get_organization` |
| Automatic database backups | VERIFIED: none. Daily backups are only for Pro/Team/Enterprise; Supabase recommends Free projects export their own copies with `supabase db dump` | Supabase "Database Backups" docs |
| Live extensions | VERIFIED: `pg_stat_statements`, `pgcrypto`, `plpgsql`, `supabase_vault`, `uuid-ossp`. **pg_cron is NOT enabled**, so scheduled jobs such as 051 maintenance or automated retention would need it enabled at release | Supabase MCP `execute_sql` |
| Vercel projects | VERIFIED: `eiyu-system` (domains `eiyu-system.vercel.app`, plus a redirecting legacy alias) and `eiyu-landing` (`eiyu-landing.vercel.app`). `eiyusystem.app` is attached to neither | Vercel MCP |
| Owner's launch intent | Owner, 2026-10-24: the site is currently `eiyu-system.vercel.app`. `eiyusystem.app` was obtained recently for email verification. Moving the site to that domain is possible later (Vercel domain plus Auth site URL/redirects plus Edge CORS plus email links); it is deferred to the release decision | Owner message |

Still unknown, because they need the owner or a dashboard the connectors can't read:
- the Play Console data-safety form status.

## Verified 2026-11-03 (read in the Supabase dashboard, owner signed in, nothing changed)

These replace the matching UNKNOWN entries above and in the UNKNOWN list. No password, key or token was read or recorded.

| Fact | Value |
| --- | --- |
| Custom SMTP | On. Provider Resend (`smtp.resend.com`, port 465). Sender name "Eiyu System"; sender is a noreply address on `auth.eiyusystem.app` |
| Site URL | `https://eiyu-system.vercel.app/auth` |
| Redirect allowlist | **One entry only:** `https://eiyu-system.vercel.app/auth` |
| Signups | On. Confirm email: off. Anonymous sign-ins: off. Manual linking: off |
| Email OTP | 8 digits, expires after 3600 seconds |
| Passwords | Minimum 6. Secure email change on. Secure password change off. Require current password off. Leaked-password check is Pro only |
| Magic Link template | Subject "Your sign-in link". Contains both `{{ .ConfirmationURL }}` and `{{ .Token }}`, as mailbox proof requires |
| Reset password template | Subject "Reset your password". Contains `{{ .ConfirmationURL }}` |
| MFA | TOTP enabled, SMS disabled (Pro only). The admin console's authenticator step can work on this project |
| `ai-proxy` | Verify JWT: on |

**Needed at release (not changed now, going live is on hold).** The allowlist does not contain any callback the current clients request: `<web origin>/auth/recovery`, `eiyusystem://auth/recovery`, `eiyusystem-preview://auth/recovery`, `eiyusystem-dev://auth/recovery`. Add the exact ones being shipped at checklist step 6, or password recovery will fall back to the Site URL instead of the recovery screen.

Still not read: Resend's plan and log retention (a separate dashboard), and whether any optional Resend features are on.
