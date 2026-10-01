# 006 — Form validation, Unicode names and defaults

Planning only. Implementor: **Luna 6 (gpt-6-luna), extra-high (xhigh) effort**. Owns **F-014 (S3), F-017 (S3), F-031 (S3), F-034 (S4), F-021 (S4)**. Server-side F-031/F-034 belongs in migration **031**, after migrations 029 and 030. No application, shared, SQL, Maestro or README source is changed by this plan.

## Context and verified root causes

- **F-014 (S3, Android):** mobile/app/quest-editor.tsx:118-122 reduces required-field rules to a boolean. The name and recovery fallback are required unless the quantity-count path is valid, but no missing-field explanation is rendered. The action row is at the end of the scrolling Screen (lines 189, 450-497), so CREATE QUEST sits below the fold. PENALTY at lines 217-228 says “recovery fallback” but not when it is required. The database check at backend/supabase/020_habit_easy_version_exempt_quantity.sql confirms the quantity/easy-version alternatives.
- **F-017 (S3, web):** web/src/web/WebAuth.tsx:139-149 computes email, password, name and confirmation errors and uses them to disable submission. Markup at lines 225-250 never renders email, password or name errors; only confirmation mismatch is shown, with different wording. The disabled button at lines 295-297 therefore gives no explanation. Android at mobile/app/auth.tsx:72-85, 206-305, 347-359 sets attempted state, renders shared validator messages and lets the user submit to see them. Both screens use passwordStrength in packages/shared/src/logic/validation.ts:88-93; abc scores 1, which both screens map to “Okay” even though validatePassword rejects fewer than six characters (lines 71-75).
- **F-031 (S3, both):** packages/shared/src/logic/validation.ts:32-37 relies on JavaScript trim() for profile text. Database normalization at backend/supabase/027_profile_compatibility_repair.sql:8-20 explicitly trims ordinary Unicode whitespace, BOM and U+2000–U+200A, but not U+200B, U+200C, U+200D or U+2060. update_profile then checks normalized length zero (lines 103-111), and the changed-field trigger checks length (lines 29-55); an invisible-only value survives both checks. Do not fix this by deleting ZWJ/ZWNJ inside legitimate names or emoji.
- **F-034 (S4, both):** signup is capped at 40 UTF-16 code units in packages/shared/src/logic/validation.ts:12,22-28; profile edit is capped at 80 Unicode code points (lines 13,31-38); habit and long-quest names have only nonblank checks in backend/supabase/003_habits.sql:8 and 006_long_quests.sql:6,16. The run accepted a 200-character quest name on web. The mobile long-quest editor only checks `name.trim()` and sends the unbounded name (`mobile/app/long-quest-editor.tsx:79-97`); web create and edit do the same (`web/src/web/WebLongQuests.tsx:443-459,688-709`). The shared Long Quest data API sends names directly to Supabase without length validation (`packages/shared/src/data/long-quests.ts:54-69,84-96`), and existing tests cover descriptions and transport errors but not name boundaries (`packages/shared/src/data/__tests__/long-quests.test.ts:22-80,125-162`). Database profile compatibility logic already preserves unchanged grandfathered values (`027_profile_compatibility_repair.sql:26-28,36-45`; shared edit logic `validation.ts:46-61`).
- **F-021 (S4, both):** Android starts new habits with all seven days in mobile/app/quest-editor.tsx:83; web starts Monday–Friday in web/src/web/WebQuestEditor.tsx:23. The database default in backend/supabase/003_habits.sql:12 is all seven days, matching Android.

## Tests first

Add and run these tests before changing implementation. Use deferred promises for lifecycle assertions and test public form behavior, not only helper internals.

1. Extend packages/shared/src/logic/__tests__/validation.test.ts and profile-edit.test.ts:
   - Accept 80 Unicode code points and reject 81 for signup/profile/quest-name validators; include 80 emoji, a supplementary-plane letter and combining marks to catch UTF-16 versus code-point counting.
   - Keep signup’s existing two-character minimum and profile’s existing nonblank minimum; this work standardizes the maximum and blank-name rule.
   - Reject values made only from U+200B, U+200C, U+200D, U+2060, ordinary spaces, NBSP or BOM. Accept visible names with boundary separators after normalization. Preserve U+200C/U+200D inside legitimate linguistic text and a family emoji such as 👨‍👩‍👧‍👦 exactly; normalization must not strip internal joiners.
   - Preserve an unchanged legacy profile/name above 80 while rejecting a changed value above 80. A new 81-code-point value must fail.
2. Add mobile/components/__tests__/quest-editor.validation.test.tsx or extend quest-editor.lifecycle.test.tsx:
   - Cover empty and whitespace-only name; a normal habit with no penalty and no target; invalid target count 1; valid count 2; a one-time quest requiring only a name; and a server error after valid submission.
   - Assert the action remains visible while fields scroll, every disabled state explains its unmet requirement, an 80-code-point name saves and 81 does not, and an unchanged grandfathered long name can still be saved.
   - Assert new habits start with Sunday through Saturday selected, while editing an existing Monday–Friday quest preserves Monday–Friday.
3. Add web/src/web/__tests__/WebAuth.validation.test.tsx using auth mocks/helpers from WebAuth.legal.test.tsx:
   - Submit malformed email plus abc; both exact shared-validator messages are visible, abc is not presented as acceptable, and signUp is not called. Then test blank name, mismatched confirmation and unchecked consent; each has visible, accessible copy consistent with Android.
   - Correct each value and verify valid signup reaches Supabase once. Switching auth mode clears attempted errors and sensitive fields.
4. Add/extend web quest-editor tests for F-034/F-021: zero-width-only and whitespace-only names fail, 80 code points pass, 81 fail, unchanged long legacy value survives an unrelated edit, and a new habit defaults to all seven days. An edited schedule is not reset.
   - Add `mobile/components/__tests__/long-quest-editor.validation.test.tsx` and `web/src/web/__tests__/WebLongQuests.validation.test.tsx` for both create and edit surfaces: 80 code points succeeds, 81 and invisible-only fail with visible copy, and an unchanged legacy name over 80 can be saved when only stat/description/stages change. Extend `packages/shared/src/data/__tests__/long-quests.test.ts` so `createLongQuest` and an actual rename to 81 reject before a Supabase write while a stat-only/unchanged legacy update remains allowed. Cover both `createHabit` and `updateHabit` validation at the shared boundary too.
5. Add supabase/tests/014_profile_validation.test.sql, following 010_profile_editing.test.sql transaction/rollback conventions:
   - update_profile and the profile trigger reject invisible-only display names for each missing code point and combinations; cover both the RPC and direct authenticated column updates.
   - Exact 80-code-point profile values pass; 81 fail. Internal ZWJ in a valid family emoji and ZWJ/ZWNJ in visible text survive unchanged.
   - New habit/long-quest names at 80 code points pass; 81 and invisible-only values fail at the database boundary. Existing >80 rows can still be read and updated in unrelated fields; an actual rename to >80 fails. Do not rewrite existing user data.
6. After component/SQL tests pass, extend mobile/maestro/flows/habit_create_validation.yaml to assert the required-field reason and reachable action. Keep auth_signup_negative_validation.yaml as the Android copy reference and e2e/A8_profile_edit.yaml for blank and 80/81 boundaries. Add mobile/maestro/flows/quest_name_length_boundaries.yaml for create/read/delete checks. Preserve the current uncommitted Maestro flows as baseline; save no screenshots in tracked paths. Maestro cannot type the Unicode-only cases (H-5), so those stay in Jest and pgTAP.

## Fix approach and files

Adopt one maximum: **80 Unicode code points** for display names, habit names and long-quest names, matching the existing profile-edit ceiling and PostgreSQL char_length. Signup expands from 40 to 80. Retain signup’s two-character minimum and profile/quest nonblank minimum; changing existing minimum rules is out of scope.

In packages/shared/src/logic/validation.ts, add shared name helpers for code-point length, boundary normalization and visible-content validation. Do not use String.length or native maxLength as the authority. Strip recognized separators only at the edges; separately reject values with no visible content after ignoring U+200B/U+200C/U+200D/U+2060. Keep internal U+200C/U+200D intact so language shaping and joined emoji remain valid. Reuse normalizeProfileEdit, validateDisplayName, validateProfileText and existing copy where possible. Add an edit helper that accepts an unchanged grandfathered value but validates any changed value. The shared `updateHabit`/`updateLongQuest` data APIs must receive the existing persisted name from their stores (`mobile/contexts/eiyu-store.tsx:530-541,658-667`; `web/src/store/eiyu-store.tsx:283-298`) so an unchanged legacy name can pass while a new over-limit or changed over-limit name is rejected before sending a request.

For **F-014**, replace the bare boolean with a reason-producing validation result derived from the same name rule and current quantity/penalty rules. Keep a sticky footer inside the modal’s safe-area boundary so CREATE QUEST is always reachable. Show required markers or concise live reasons beside the relevant fields and an accessible disabled state. A target count of 2 or greater removes the penalty requirement; 0/1 does not. Keep one-time quest rules unchanged.

For **F-017**, bring web auth in line with Android: render shared field errors after submit or field touch, use consistent mismatch copy and make invalid submission explain itself. The handler should set attempted state and return before calling Supabase when invalid; the button may be disabled only while submitting, not silently for invalid data. Show consent error after invalid signup. Keep backend auth errors in the existing general error region. Show “Too short” (or equivalent unmet-minimum text) for passwords under six characters on both surfaces; do not alter the shared minimum.

For **F-031/F-034**, prepare backend/supabase/031_profile_name_validation.sql and the pgTAP file above. Extend trim_profile_text and the changed-field profile validation path, and reject names containing only invisible formatting characters. Preserve ZWJ/ZWNJ embedded in visible text. Enforce 80 code points for new/changed habit and long-quest names at the server boundary, validating inserts and actual name changes only. Add client validation in shared profile/habit/Long Quest data functions and render field-specific messages in the mobile long-quest editor and web Long Quests create/edit panels (not only a generic Supabase error). This mirrors existing profile grandfathering: no mass rewrite, and an old over-limit value remains usable until the user changes it. Review each function’s search_path and effective EXECUTE grants; do not expose a new SECURITY DEFINER helper through PostgREST. Mirror normalization, boundaries and copy in shared web/mobile editors.

For **F-021**, export one immutable shared default day set [0,1,2,3,4,5,6]; initialize new web/mobile editors from a fresh copy and continue using saved days for edits. Do not change one-time quest date behavior.

Expected files: packages/shared/src/logic/validation.ts and its tests; packages/shared/src/data/habits.ts and long-quests.ts plus their tests; mobile/app/auth.tsx, mobile/app/quest-editor.tsx, mobile/app/long-quest-editor.tsx, mobile/contexts/eiyu-store.tsx and focused component tests; web/src/web/WebAuth.tsx, web/src/web/WebQuestEditor.tsx, web/src/web/WebLongQuests.tsx, web/src/store/eiyu-store.tsx and focused web tests; backend/supabase/031_profile_name_validation.sql; supabase/tests/014_profile_validation.test.sql; backend/supabase/README.md (031 function-body markers coordinated with plan 010); and narrowly extended/new Maestro flows. Keep migrations 029/030, previously applied SQL, and unrelated editor-layout/accessibility work intact.

## Acceptance criteria

- **F-014:** At default Android font size and while the form is scrolled, CREATE QUEST stays visible and tappable. Empty name shows a name reason; a normal habit without penalty/valid target explains the penalty requirement. A quantity habit with count 2 and a one-time quest with a name can save.
- **F-017:** Invalid web signup visibly reports email, password, name, confirmation and consent errors with copy matching mobile where applicable. Short passwords never read “Okay” or imply acceptance. Invalid submit never calls Supabase; valid signup and legal-document flows still work.
- **F-031:** Profile RPC, insert trigger and direct owner update reject values containing only invisible/whitespace characters. Normal Unicode, combining marks, internal ZWJ emoji and internal ZWJ/ZWNJ linguistic text remain intact.
- **F-034:** Signup, profile edit, habit and long-quest forms and server boundaries agree on the 80-code-point maximum. At 80 the value is accepted; at 81 a clear validation error appears and direct server writes fail. Existing >80 records are not rewritten, remain usable/editable without renaming, and can be renamed only to a valid value.
- **F-021:** New mobile and web recurring habits start with all seven days selected; changing one screen’s default cannot reintroduce divergence. Existing stored days remain unchanged when editing.

## Verification commands and expected results

Run from repository root in PowerShell. Use npm.cmd ci first only if root node_modules is absent. These run after the named tests are added; no tests or migrations run as part of planning.

    npm.cmd run test --workspace @eiyu/shared -- --runInBand src/logic/__tests__/validation.test.ts src/logic/__tests__/profile-edit.test.ts
    npm.cmd run test --workspace @eiyu/mobile -- --runInBand components/__tests__/quest-editor.validation.test.tsx components/__tests__/quest-editor.lifecycle.test.tsx components/__tests__/long-quest-editor.validation.test.tsx
    npm.cmd run test --workspace @eiyu/web -- src/web/__tests__/WebAuth.validation.test.tsx src/web/__tests__/WebQuestEditor.validation.test.tsx src/web/__tests__/WebLongQuests.validation.test.tsx src/web/__tests__/WebAuth.legal.test.tsx
    npm.cmd run test --workspace @eiyu/shared -- --runInBand src/data/__tests__/habits.test.ts src/data/__tests__/long-quests.test.ts
    npm.cmd run db:lint
    npm.cmd run db:test
    npx.cmd tsc --noEmit -p packages/shared/tsconfig.json
    npx.cmd tsc --noEmit -p mobile/tsconfig.json
    npx.cmd tsc --noEmit -p web/tsconfig.json
    git diff --check

Expected: focused Jest/Vitest tests pass; TypeScript/lint exit 0; pgTAP reports Result: PASS. db:test requires the prepared disposable local schema; never use scripts/local-db.ps1 verify because it resets the local database. SQL tests are rollback-only. Do not apply migration 031 to a live project during implementation.

Run Maestro files **one at a time** against a disposable account, never the published shared account:

    maestro test -e E2E_EMAIL=$env:E2E_EMAIL -e E2E_PASSWORD=$env:E2E_PASSWORD mobile/maestro/flows/habit_create_validation.yaml
    maestro test mobile/maestro/flows/auth_signup_negative_validation.yaml
    maestro test -e E2E_EMAIL=$env:E2E_EMAIL -e E2E_PASSWORD=$env:E2E_PASSWORD mobile/maestro/flows/e2e/A8_profile_edit.yaml
    maestro test -e E2E_EMAIL=$env:E2E_EMAIL -e E2E_PASSWORD=$env:E2E_PASSWORD mobile/maestro/flows/quest_name_length_boundaries.yaml

Expected: editor validation stays visible and explains requirements; signup stays on the form with each message; A8 keeps its 80/81 and blank checks; the new flow accepts 80, rejects 81, and cleans up test records. H-4 documents Maestro web signup is unreliable; use Vitest plus an isolated browser review for web and do not report a blocked flow as passing. Never put private credentials in plans, logs or reports.

After the user applies migration 031, run both authenticated REST probes below using only a disposable account and shell-local environment values. Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `E2E_ACCESS_TOKEN` (the disposable user's access token), and `E2E_USER_ID` privately first. Each response must be HTTP 400; the profile RPC body should say `Enter a display name.` and the direct owner PATCH should return the trigger's display-name validation error. The direct PATCH confirms the owner write path cannot bypass the trigger.

    $invisible = ([char]0x200B).ToString()
    $rpcBody = @{ p_display_name = $invisible; p_user_class = 'Pathfinder' } | ConvertTo-Json -Compress
    curl.exe --silent --show-error --include --write-out "`nHTTP %{http_code}`n" --request POST --header "apikey: $env:SUPABASE_ANON_KEY" --header "Authorization: Bearer $env:E2E_ACCESS_TOKEN" --header 'Content-Type: application/json' --data-raw $rpcBody "$env:SUPABASE_URL/rest/v1/rpc/update_profile"
    $patchBody = @{ display_name = $invisible } | ConvertTo-Json -Compress
    curl.exe --silent --show-error --include --write-out "`nHTTP %{http_code}`n" --request PATCH --header "apikey: $env:SUPABASE_ANON_KEY" --header "Authorization: Bearer $env:E2E_ACCESS_TOKEN" --header 'Content-Type: application/json' --header 'Prefer: return=representation' --data-raw $patchBody "$env:SUPABASE_URL/rest/v1/profiles?user_id=eq.$env:E2E_USER_ID"

After the user applies migration 031 in SQL Editor (only after 029/030 are confirmed applied), re-run the README drift query and disposable-user REST checks. An owner PATCH with an invisible-only profile name and an INSERT/PATCH of an 81-code-point quest name must be rejected; ordinary Unicode and internal ZWJ names must persist unchanged. Expected: 031 body markers are true and legacy unchanged rows remain usable.

## Risks and rollout

The shared editor files overlap plans 004/005 and the web account shell may overlap plan 009; serialize changes and reread files before each edit. Database and client length semantics must stay aligned. U+200C/U+200D needs explicit tests so invisible-only values fail without corrupting legitimate text. Existing long quest names must not fail on unrelated updates. Roll out in this order: red tests; shared/client implementation; migration 031 and pgTAP; db:lint/db:test; user reviews and applies 031 after 029/030; user confirms 031 README markers and REST checks; mobile/web release. Migration 031 must extend backend/supabase/README.md with body markers for the latest profile/name validators, coordinated with plan 010’s drift query and reserved supabase/tests/015_migration_markers.test.sql.

## Needs you (user-side actions)

- Review and apply backend/supabase/031_profile_name_validation.sql manually in Supabase SQL Editor after confirming 029 and 030, then run the updated read-only README query. Implementors prepare files/tests only; they do not apply live SQL.
- Run disposable-account REST probes after migration 031 and confirm invisible-only/81-code-point writes fail while valid Unicode, internal ZWJ text and unchanged legacy values continue to work. Keep tokens private.
- Approve a mobile/web release only after migration markers and client acceptance checks pass. No commit, push or deployment is authorized by this plan.
