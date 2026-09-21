# Phase 00 browser and native runner scenarios

Status: prepared before any board-refresh runtime feature work; browser runner execution verified on 2026-09-21 against the disposable local Supabase/Auth stack.

Purpose: provide a durable, reproducible runner path for Phase 0 and the later cross-platform gates without using the configured remote project or personal data.

## Preconditions and safety

1. Run only from the repository root on the Windows development host.
2. Confirm Docker Desktop's Linux engine is healthy before starting the local stack. Do not run reset commands against a remote or personal project.
3. Use a newly generated synthetic email and password for the local stack. Do not reuse a personal password or the repository's remote `.env` values.
4. Keep the browser and Android flows serial. The Maestro README warns that shared-account flows race when run together.
5. Stop the local Supabase stack after the run. Do not push, deploy, or modify production data.

## Local browser scenario

### Start and configure

1. Confirm Docker Desktop's Linux engine is healthy. For the authenticated browser scenario, start the full repository-local Supabase CLI stack: `node_modules\@supabase\cli-windows-x64\bin\supabase.exe --agent no --network-id eiyu-supabase-local start`. The repository `npm run db:start` wrapper intentionally excludes Auth/PostgREST and is suitable for DB-only checks, not this browser-auth scenario.
2. Read the local URL and anonymous key from the local Supabase CLI status output without committing them.
3. Start the web app with temporary process environment variables, not by overwriting `web/.env`:
   `VITE_SUPABASE_URL=<local URL> VITE_SUPABASE_ANON_KEY=<local anon key> npm run dev --workspace @eiyu/web -- --host 127.0.0.1 --port 4173`.
4. Create one synthetic local auth account through the local Auth endpoint or the local registration UI. Record only the synthetic email and a redacted run identifier in the evidence, never the password or token.
5. Open `http://127.0.0.1:4173/` in Chrome or the Codex in-app browser.

### Evidence sequence

1. Landing page loads and the authentication entry point is reachable.
2. Sign in with the synthetic local account.
3. Verify an authenticated protected route loads and shows the account-scoped shell.
4. Reload the page and verify the session/route behavior remains coherent.
5. Sign out and verify the protected route returns to authentication.
6. Capture the exact browser, local URL, viewport, route, and pass/fail result in the active phase report. Do not call this a lifecycle or board feature test; Phase 0 only proves the runner path.

## Android runner preflight

1. Set `JAVA_HOME` to `C:\Program Files\Android\Android Studio\jbr` and put its `bin` directory, the Maestro bin directory, and Android platform-tools on `PATH`.
2. Confirm `adb devices` lists an emulator in `device` state.
3. Confirm `maestro --version` runs with JDK 21 or later.
4. Build/install the existing development client only when the authorized phase requires native interaction evidence; Phase 0 does not claim an Android feature journey.
5. For later shared-account flows, run one `maestro test` file at a time. The intended cross-platform scenario is `mobile/maestro/flows/phase8_cross_platform_persistence.yaml`, parameterized with the same disposable local stack and Metro URL.
6. Record iOS native execution as unavailable on this Windows host.

## Current execution result — 2026-09-21

- Browser: local Vite auth route at `127.0.0.1:4173/auth` was opened in the Codex in-app browser. Synthetic account `phase0.browser@eiyu.test` reached `/board`, remained on `/board` after reload with the account-scoped shell and board content, then `/settings` sign-out returned to `/auth`.
- Native: ADB 37.0.0 and Maestro 2.8.0 were previously found, with an attached `emulator-5554`; JDK 21 is available at the Android Studio path.
- Database: the full disposable local Supabase/Auth stack started at `http://127.0.0.1:55321`; the checked-in remote `.env` values were not used. The local Vite server and Supabase stack were stopped after evidence capture.
- Result: browser runner/auth evidence PASS. Android availability is PASS as a runner preflight only; no native feature journey is claimed. No remote or production data was used.
