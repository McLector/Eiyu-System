# 001 — Roadmap execution status

## Current takeover result (2026-09-30)

This section supersedes the historical status and blocker statements below.

- **Release startup:** reproduced `useLinkPreviewContext` crashing in the installed release. Its APK already matched the merged bundle; unchanged size/timestamps did not prove stale packaging. The source map contained two router context identities. Added canonical router resolution in `mobile/metro.config.js` and the artifact gate `scripts/verify-android-release.ps1`. The gate failed before the fix and passed after a targeted release rebuild. The new APK was installed; fresh private UI evidence reached authentication without the router error. Board sign-in and F-029's foreground font-scale sequence remain unverified.
- **Test repairs:** 015 discarded an assertion inside DO, emitting 12 results for a 13-test plan. It now emits the result through SELECT and verifies restoration of the temporarily replaced validator. A later full run caught 013 assuming concurrent submission order determined lock winners; it now checks exactly two accepted and one denied independent response and preserves the provider-charge assertion. `scripts/verify-tap-output.ps1` rejects the old incomplete logs and accepts the final complete run.
- **Final isolated SQL:** 15 files / **494 emitted assertions**, every TAP plan complete; all 31 README markers true; `public,private` schema lint exits 0. Tests used container-local `psql -X -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -At`; credential-free dblink calls require the local test administrator. Only ignored copies of 005/009 changed their connection port to isolated 54322. Database 55322 was not mutated. No application migration changed.
- **Client/Edge gates:** mobile 23 suites / 92 tests; shared 28 suites / 243 tests; web 18 files / 62 tests (`--maxWorkers=2`); Deno 18/18; all TypeScript projects, lint, web production build and staged/unstaged whitespace checks pass. Lint retains 40 warnings; build retains configuration-loader/bundle-size warnings. Overlapping initial workspace runs had resource-sensitive failures; controlled reruns passed without a product-code change.
- **Interaction stop:** Computer Use was stopped with physical Escape before further device/browser acceptance. No further Computer Use input was sent. Font scale remained 1.0; this takeover introduced no network/offline setting change.
- **Live connection:** this session exposes no Supabase MCP. Installed Codex configuration has no Supabase entry; the standalone workspace `.mcp.json` did not establish a connection. Add its project-scoped URL through Settings → MCP servers → Add server → Streamable HTTP, authenticate, then restart the server/session. No live deployment, SQL, dashboard/account remediation or provider request occurred.
- **Open acceptance:** F-019 real AI outputs/cache; F-025 quiet three-run Android/web timing; F-029 foreground/no-relaunch sequence; remaining Android layout, TalkBack, lifecycle/audio and real-browser width/theme/zoom checks; live security/dashboard/account gates. F-008/F-010/F-011/F-032 and original notification/email/iOS exclusions remain deferred or unverified.
- Existing changes, lockfile, ignored evidence and 27 staged evidence removals were preserved. No commit, push, history rewrite, reset or public release occurred.

## Follow-up verification (2026-09-30)

- **Local automated gates:** mobile 23 suites / 91 tests, web 18 files / 62 tests, shared 28 suites / 243 tests; TypeScript checks for mobile/web/shared; workspace lint; web production build; and whitespace checks all passed. Lint has 40 warnings and no errors; web build has a Vite config-loader warning and a 988 kB chunk warning.
- **Database:** empty isolated local stack only; migrations 001–028 then 029–031 were applied in order. All 31 README markers pass. The actual full query also returned only the expected false marker for rollback-only missing-column, missing-trigger, older-body and misleading-overload probes. All 15 pgTAP files pass (489 assertions); schema lint on `public,private` found no errors. The pre-existing database on port 55322 was not changed.
- **AI:** official Deno 2.9.7 executed the production-generator/handler tests: 18/18 pass. This uses mocked provider transport. F-019 remains open until the intended project confirms primary/fallback model access and records three real successful outputs plus weekly-summary persistence and a cache revisit with no extra request.
- **Release acceptance still open:** F-025 has no three-run quiet Android-release/web timing set; F-029 has no exact foreground release font-scale reproduction/regression result. No product change was made for either. Android was rechecked: the verified SDK ADB path under `%LOCALAPPDATA%\\Android\\Sdk\\platform-tools\\adb.exe` is not exposed/executable in this sandbox, and the hidden emulator launch ended before returning a process ID. No device was confirmed, Maestro flow was run, or release APK artifact produced. The real-browser viewport/zoom matrix was not run because the CUA runtime exposes no browser or app provider (`createBrowserTab` for Chrome was unavailable). The local Vite server was wired to the isolated local project only.
- **External rollout:** none performed. The user has authorized the rollout, but this session has no Supabase MCP tools; reload/reopen with the project-scoped `.mcp.json` and complete OAuth before applying live changes. Exposed-account/session remediation, live SQL/function deployment, Auth password-protection setting and disposable live probes remain pending. Keep F-008/F-010/F-011/F-032 deferred; preserve original coverage exclusions.
- The 27 staged evidence removals, ignored local evidence and lockfile were preserved. No commit, push, history rewrite, existing-database reset, personal production session or public release occurred.


## Status

Local implementation work is prepared across plans 010, 002, 004, 005, 006, 003, 007, 008 and 009. The execution followed their dependency order. This is not a release-complete result: SQL, Edge Function, release-build, live-AI, Android-device and user-dashboard gates remain open.

## Verification run

- Mobile unit tests: 23 suites / 91 tests passed. Web: 18 files / 62 tests passed. Shared: 28 suites / 243 tests passed.
- TypeScript checks for mobile, web and shared passed. Workspace lint exited 0 with 40 mobile warnings and no errors. The web production build passed (Vite config-loader and 988 kB chunk warnings). `git diff --check` and cached diff whitespace check exited 0.
- Native Deno 2.9.7 suite: 18/18 passed. Isolated SQL stack: all migrations 001–031 applied in order, all 31 README markers true, all 15 pgTAP files passed (489 assertions), and `public,private` schema lint found no errors.
- The exact README query was verified under four rollback-only catalog mutations. Existing database port 55322 was never targeted for mutations; concurrency tests were redirected in temporary copies to isolated port 54322.
- No live project, provider, dashboard, browser or public-release operation was performed.

## Open release gates

- F-019 remains open until actual primary/fallback availability is confirmed and the three AI actions produce valid live content with a weekly-summary cache revisit that makes no extra AI request.
- F-025 and F-029 remain open pending their required release measurements/reproduction. No product changes were made for either. Android release/device acceptance is blocked on ADB/emulator access to the external SDK path; no APK or device smoke was produced. Real-browser 320/390/768/1280 viewport and 200% zoom checks could not start because CUA exposes no browser provider.
- Live SQL/Edge rollout, disposable-user REST probes, leaked-password protection and exposed-account/session remediation remain pending. The user authorized rollout, but Supabase MCP OAuth/tools are unavailable until project-scoped reconnect.
- Keep F-008/F-010/F-011/F-032 deferred. Preserve notification/email/iOS coverage exclusions.

## Exact user-side continuation

1. Reload/reopen Codex with the workspace `.mcp.json`, complete Supabase OAuth, and confirm the connected project reference matches the private app configuration.
2. Remediate the specifically identified exposed test account and its sessions; record residual token expiry. Keep replacement credentials private and preserve the required recovery fixture until checked.
3. Deploy the fail-closed Edge guard, apply reviewed SQL 029→030→031 to the confirmed live project, verify each marker and disposable-user security/quota/profile probes, then activate bounded retry/fallback only after model access and quota gates pass.
4. Complete dashboard leaked-password protection and its disposable signup tests; if the current plan lacks the feature, decide whether to upgrade.
5. Complete the missing Android release/device checks and the real-browser matrix when those surfaces are available. Capture F-025 measurements and F-029 foreground font-scale result; run the three live AI flows and cache revisit for F-019.
6. Decide separately whether public Git history cleanup is required. F-008/F-010/F-011/F-032 remain deferred.
