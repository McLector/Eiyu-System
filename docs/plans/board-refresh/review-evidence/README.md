# Review evidence, 2026-09-27

Product revision: `aa793baf4eed94c0704f799f36c98d742853a9a4`. Product files remained unchanged.

## Existing gates rerun

Using the explicit Node/npm CLI pair from the repository's plan:

```powershell
& 'C:\Program Files\nodejs\node.exe' 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' run test --workspace @eiyu/shared -- --runInBand
& 'C:\Program Files\nodejs\node.exe' 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' run test --workspace @eiyu/web
& 'C:\Program Files\nodejs\node.exe' 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' run test --workspace @eiyu/mobile -- --runInBand
& ./scripts/local-db.ps1 test
```

All exit 0: shared 27/215; web 13/39; mobile 12/24; SQL 10 files/331 tests. Docker was accessed at `C:\Users\morad\AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe` after ordinary execution was denied by the filesystem sandbox. Escalated local diagnostic execution succeeded. No database reset was used.

## Review contract probes

Run from the repository root:

```powershell
& 'C:\Program Files\nodejs\node.exe' node_modules/vitest/vitest.mjs run --config web/vite.config.ts docs/plans/board-refresh/review-evidence/web-contract.audit.test.tsx docs/plans/board-refresh/review-evidence/data-contract.audit.test.ts --reporter=json --outputFile=docs/plans/board-refresh/review-evidence/audit-results.json
```

Final result: **exit 1; 13 assertions failed, zero passed**. These intentionally red probes assert original plan requirements against committed product code. See `audit-results.json` for actual expected/received values and traces. Earlier harness-only errors (React import and missing fixture rank) were corrected before this final run and are not counted as product findings.

SHA-256 of the final probe sources, before any repair implementation:

- `web-contract.audit.test.tsx`: `83B578BC74493089106626BD28EB71A7054582AD6641C1DDEEAB72FC43CEF42C`
- `data-contract.audit.test.ts`: `CABCEDF93D9FF3D048AA2213BA64C96512889DB86F310166468198FBF5AD0413`

| Probe | Observed failure | Finding |
| --- | --- | --- |
| R01 | Destructive confirmation focused instead of Cancel | BR-02 |
| R02 | Settings remains open after Escape | BR-06 |
| R03 | Reverse Tab leaves profile dialog | BR-06 |
| R04 | Close dismisses pending profile save | BR-07 |
| R05 | Dec 31 date key labeled Jan 1 in UTC+14 | BR-10 |
| R06 | 80 emoji pasted, 40 retained | BR-08 |
| R07 | Archived card has no Restore button | BR-12 |
| R08 | Completed card precedes incomplete card | BR-14 |
| R09 | All Habits selection lost after editor return | BR-13 |
| D01 | Archived one-time missing from fetched board | BR-01 |
| D02 | Zero-row update resolves successfully | BR-05 |
| D03 | Modeled delete/read interleaving returns zero for a preserved completion | BR-04 |
| D04 | API-cap model returns 1,000 of 1,100 completions | BR-03 |

D01/D02 use request-faithful transport responses. D03 models a real possible transaction ordering and verifies the retained row still exists in modeled storage. D04 models the repository's configured 1,000-row API cap. These are not claims of newly executed HTTP/RLS/concurrent-session integration; Luna must add those integration checks. Audit harnesses may require boundary adapters when repairs introduce a new API, but expected product outcomes must remain independent of the fix.

## Profile SQL probes

Verified target: existing local `supabase_db_eiyu-system`, database `postgres`; migration 025 table and 026 RPC were present.

```powershell
Get-Content -Raw docs/plans/board-refresh/review-evidence/profile-compatibility.audit.sql | & 'C:\Users\morad\AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe' exec -i supabase_db_eiyu-system psql -U postgres -d postgres -v ON_ERROR_STOP=1
```

Observed exit 0 with diagnostic notices:

```text
UPGRADE_REPRO: migration 026 constraint rejects a previously valid 81-character profile
WHITESPACE_REPRO: authenticated update_profile accepted tab-only display name: t
ROLLBACK
```

Exit 0 means both diagnostic probes executed; it does not mean the product behavior passed. The first probe applies the exact constraint to a temporary legacy-data table, not a complete migration rehearsal. The second invokes the actual local RPC under `authenticated` with a synthetic owner. All probe changes were rolled back.

## Scope limits

No fresh rendering/viewport screenshots, Android Maestro, TalkBack, build/export, or remote schema check was claimed in this review. Existing suite and artifact evidence is distinguished in the review report. iOS remains excluded. User-reported Board/Status/History 200% zoom acceptance remains recorded.

The Expo SDK 54 reference was consulted before adding probes: <https://docs.expo.dev/versions/v54.0.0/>. Supabase skill security guidance was used to review the grants/RLS/function boundary. Fetching the Supabase changelog markdown was unsupported by the web tool; no SDK/schema implementation decision was made from an assumed current changelog.
