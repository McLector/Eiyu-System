# S02 tracker-consent backend: independent review (2026-10-24)

This is a read-only review of `backend/supabase/053`–`057` and the tracker-input change in `functions/ai-proxy/ai-proxy-core.ts`. I checked them against the approved design (`2026-10-23-s02-tracker-consent-design.md`) and against Tasks 1–4 and the "Review focus" section of the implementation plan.

- I changed no repository file other than this one, and I did not connect to any database.
- Everything here comes from reading the source (migrations 001–057, the tests in `supabase/tests/038`–`043`, and the shared client gatherer). I executed nothing.
- Line numbers refer to the files as they are on disk today. Where 057 replaces a function from 054, the 057 line is the one that applies.

Counts: 1 high, 2 medium, 12 low (L1–L12; this includes informational, nit, process and spec-question items).

057 is included. I compared its bodies with 054. The only changes are `tracker_argument_types` going from IMMUTABLE to STABLE (needed, because it casts to an enum), a removed write-only variable, and explicit casts on initialisers. Because it uses CREATE OR REPLACE, owners, SECURITY DEFINER, `search_path=''` and grants are all kept. Every finding below cites 057 lines where 057 replaces 054.

## Findings

### H1 (high): a deleted legacy root's ID can be reused to relabel its retained history as basic

**Where:** `054_tracker_write_boundary.sql:76-79` (`save_tracker_habit`) and `057_tracker_lint_fixes.sql:43-46` (`save_tracker_chain`). The effect shows up in `056_tracker_ai_export.sql:31-54` and `055_tracker_preparation_storage.sql:226-231`.

**What the code does:**
- When a root is created, the save helpers refuse a reused ID only if a `private.tracker_input_provenance` row already exists for it (`old.id is null and (not p_create or prov.object_id is not null)`).
- Roots deleted before 053 never got a provenance row: there was no backfill, and "absence means custom".
- Their evidence survives under the same ID in `public.deleted_habit_history.source_habit_id`. That table has no foreign key to `habits`, and the owner can read those IDs from `read_history_range().rows[].source_habit_id`.
- For chains, the same applies to `long_quest_rewards.quest_id` and `private.long_quest_definition_receipts.quest_id`.

**Failure scenario:**
1. An account has a legacy custom habit X that was deleted earlier. Its completions this week sit in `deleted_habit_history` under X's ID, and the account has no custom grant.
2. A modified or buggy client calls `apply_tracker_write('habit-save', {p_id: X, p_create: true, p_mode: 'basic', p_input: {...}, p_expected_targets: []}, rev)`.
3. That operation needs only an age match. `save_tracker_habit` finds no live row and no provenance, so it inserts a live "Quest N" habit with ID X and writes basic provenance for X.
4. Effects:
   - **AI input:** in `ai_tracker_week_input` the deleted rows now group under the live basic root (`live`/`agg`), and the `protected` test at 056:45-46 sees basic provenance. The legacy custom completion counts and stat totals go into the AI input labelled as basic, without the custom permission. That is exactly the "derived aggregates of protected data" the design says must not be sent.
   - **Weekly quest:** `prepare_tracker_day`'s `basic_only_inputs` (055:228-229) treats the same deleted history as basic.
   - **History:** retained history from two different roots merges permanently under one ID. A later delete of the new root upserts into the same `(user_id, source_habit_id, historical_date)` rows, which makes the data-integrity problem worse.

**Test gap:** `039:74-77` tests ID reuse only for a root that *had* provenance. The legacy, unprovenanced tombstone case required by Review focus 2 ("tombstones, ID reuse") is not covered.

**Fix:**
- In `save_tracker_habit`, refuse creation (42501, same generic message) when the ID appears in `deleted_habit_history.source_habit_id`, `habit_completions.habit_id` or `habit_archive_intervals.habit_id`. Check for any owner, so the check also acts as a cross-owner collision guard.
- In `save_tracker_chain`, do the same for `long_quest_rewards.quest_id` and `long_quest_definition_receipts.quest_id`. This applies when the receipt belongs to a different request; the same-request replay path is already handled.
- Alternatively, or additionally, write `custom` tombstone provenance rows for every ID found in retained history at migration time. That is not a consent backfill: it records "protected", which is the conservative default.
- Add 039 cases for a deleted legacy habit and a deleted legacy chain.

### M1 (medium): attaching media is not bound to the upload tuple or the routine

**Where:** `057_tracker_lint_fixes.sql:185-187`, then `035_gym_workspace.sql:141-151`. The only database constraint on the path is `033_gym_progress.sql:23` (`starts_with(media_path, user_id || '/')`).

**What the code does:** the gateway checks only that `media_path` is a string. `save_gym_exercise` stores any path under the owner's prefix, whether in the new 4-segment form, the legacy 3-segment form, or a path under another of the owner's routines. Task 3 asks for "metadata/reference refusal" and "database attachment checks: denied no-grant/old tuple … cross-owner/routine, withdrawal before final attachment". `040` tests the Storage policy only; none of its assertions involve `media_path`.

**Failure scenario:**
1. The owner uploads `uid/R1/1-5-0/obj.mp4` under consent revision 5.
2. They withdraw fitness consent (revision 6). The object stays in Storage as an orphan; the design accepts that bytes may remain.
3. They regrant (revision 7).
4. A client attaches the old-tuple object, or a legacy-path object, or an object uploaded for routine R2, to an exercise in routine R1. All three are accepted.

Media collected under the earlier grant is re-linked and processed under the new one. The tuple embedded in the path, which exists precisely so stale uploads can be recognized, is never checked at attachment.

**Fix:** in the gateway's `save_gym_exercise` branch, require one of two cases:
- `media_path` is null, or it equals the exercise's currently stored path (keeping existing media);
- or it parses as `<uid>/<p_input.routine_id>/<current age-consent-authority tuple>/<uuid>.(gif|mp4)` and `media_mime` matches the extension.

Reuse the parser from `gym_media_upload_allowed`, moved into a private helper. Add 040 cases for attaching an old tuple, a legacy path, another routine's path, and attaching after withdrawal.

### M2 (medium): regranting backfills occurrences for the paused period and applies misses retroactively

**Where:** `055_tracker_preparation_storage.sql:37-54`. The `generate_series` there starts from `max(occurrence_date)+1`. It feeds the reconcile loop in `022_habit_recovery_state_machine.sql:206-274`, reached from `prepare_tracker_day`, `complete_habit` and `set_account_time_zone`.

**What the code does:** while custom permission is absent, the filter correctly skips protected roots, so nothing is materialized. On regrant, the next preparation generates every scheduled day of the pause from the last stored occurrence up to today. Completions were impossible on those days, because writes returned ET002. Reconciliation then counts them as missed: it opens recovery windows already past their deadline as `expired`, sets `current_streak` to 0 and clears `recovery_armed`.

**Failure scenario:**
1. A custom habit has a 30-day streak.
2. The owner withdraws custom permission for a week, then regrants it.
3. The first `prepare-day` creates seven past occurrences with no completions, and the streak drops to 0.

In effect a penalty is imposed for the paused period, based on occurrences invented after the fact for days the user was blocked from acting. The design says basic actions "must not trigger new protected occurrences, penalties … over paused custom activity", and that "no conversion creates duplicate progress/rewards". It does not say what regrant should do, so this needs an owner decision rather than being left as an accident. The under-12 pause in 049 already has the same property, but S02 makes the situation much more common (any withdrawal).

**Fix (pick one, then test it):**
- Record a per-root paused interval at withdrawal, or derive one from consent events. Treat it like `habit_archive_intervals`, which the generator already skips.
- Or clamp the backfill start for protected roots to the regrant date.

### L1 (low): the weekly quest's "weakest stat" is computed from unattributable protected XP

**Where:** `055_tracker_preparation_storage.sql:226-238`.

**What the code does:** `basic_only_inputs` checks live habits, `deleted_habit_history` and live chains. It does not check:
- XP from deleted chains (`long_quest_rewards`);
- XP from habits deleted before 025's history copy existed.

The weakest stat is chosen from `public.stats.xp`, which includes both. So an account with no custom grant, whose only remaining protected contribution is a deleted legacy chain, gets a weekly quest derived from protected aggregates.

**Impact:** low. The output is a single enum value, and finding H1 can also make this check true incorrectly.

**Fix:** also require that no `long_quest_rewards` row exists whose `quest_id` lacks basic provenance. Treat any stats row with XP not explained by basic evidence as protected. Alternatively, pick the stat deterministically without reading `stats` when `protected` is false.

### L2 (low): errors from retained routines echo caller values through the gateway

**Where:** `057_tracker_lint_fixes.sql:242-244`. The handler maps only check/not-null/unique/FK/cast errors.

**What the code does:** P0001 messages from retained bodies pass through unchanged and include caller-supplied values. Examples:
- `042:134` and `042:161`: `'habit % not found for calling user'`, `'habit % is not eligible on %'`;
- `054:369`: `'long quest % not found for calling user'`;
- `022:160`.

The plan says "No payload echoed in an error". The values are the caller's own IDs and dates, so nothing leaks across owners, but the contract is not met as written.

**Fix:** catch `raise_exception` (P0001) in the gateway and re-raise a fixed message. Keep a code-to-message map for the few P0001 messages the clients rely on, such as "Quest order is out of date".

### L3 (low): another owner's row is locked before the ownership check

**Where:** `054:75` (`select … from public.habits where id=p_id for update`), `057:42` (`long_quests`) and `057:221` (`gym_routines`).

**What the code does:** a caller who knows another owner's root UUID can take a `FOR UPDATE` lock on that row for the length of their own call before being refused. The refusal also tells them the ID exists (42501, versus success for a fresh ID). UUIDs make this hard to exploit, so the impact is small, but it does break the "owner lock before targets" ordering across tenants.

**Fix:** add `and user_id=uid` to the locking select. Then decide whether the ID is free by checking a separate unlocked existence test across all owners.

### L4 (informational): basic operations materialize custom roots under the current grant, whatever revision they captured

**Where:** `057:206-209` dispatches to `complete_habit`, `undo`, `increment` and `recovery`, which call `public.ensure_habit_occurrences` (e.g. `042:156`). The guard is `tracker_root_permitted`, with the setting unset.

**What the code does:** a basic completion sent with a stale optional revision still prepares custom roots if custom permission is *currently* granted. `prepare-day` handles the same case more narrowly (basic only, `accessChanged: true`). Because the current grant does authorize it, this is not a bypass, but the two paths behave differently.

**Fix (optional):** have the gateway set `eiyu.tracker_basic_only='on'` for every non-protected operation whose full revision does not match.

### L5 (informational): `prepare_tracker_day` resets the narrowing setting to 'off' instead of restoring the previous value

**Where:** `055:217` and `055:240`.

**What the code does:** this is safe today, because `apply_tracker_write` is the only caller, each PostgREST call is its own transaction, and an aborted subtransaction rolls the setting back. A future caller that sets 'on' and then calls this helper would silently be widened.

**Fix:** save the value with `current_setting(...,true)` and restore it at the end.

### L6 (low): tracker consent is accepted while declared under 12, and consent events omit the declaration and authority revisions

**Where:** `053:133-160` and `053:157`.

**What the code does:**
- `set_tracker_processing_consent` records a grant even when `canWriteBasic` is false (declared under 12). The grant then takes effect if the birthday is later corrected.
- `processing_consent_events` stores purpose, notice, decision and consent version only. The design (consent and retention section) says the evidence records "purpose/notice, account and declaration/authority revisions, decision and server time".

The setter does validate the captured tuple, but the tuple is not kept in the evidence.

**Fix:**
- Refuse optional grants while paused (ET001). Withdrawal must stay allowed.
- Add `age_version` and `authority_version` columns to the event insert, and update the export manifest to match.

### L7 (low, defense in depth): TRUNCATE, REFERENCES and TRIGGER may still be granted on several tracker tables

**Where:** `054:335-339`.

**What the code does:** this revokes only INSERT/UPDATE/DELETE. These tables were never given `revoke all`: `habits`, `habit_completions`, `streaks`, `long_quests`, `long_quest_stages`, `weekly_quests` and `habit_progress`. Under Supabase's default privileges they may still allow TRUNCATE to `authenticated`, and TRUNCATE bypasses RLS and the row-level `guard_tracker_writes` trigger.

**Impact:** PostgREST cannot issue TRUNCATE, so no API path exists, and this is informational.

**Fix:** `revoke truncate, references, trigger on … from public, anon, authenticated`. The manifest test should also assert it.

### L8 (low): `reconcile_long_quest_stages` runs as an invoker with a mutable search path inside a definer chain, and its receipt scan is not owner-filtered

**Where:** `054:352-387`.

**What the code does:** the function is called from the definer `save_long_quest_definition`, so it runs as the owner role with `search_path = public`. Every relation is schema-qualified, so I found no exploitable hijack. However, the `long_quest_definition_receipts` scan at 385-387 reads all owners' receipts (a full scan per stage). Its only effect is a refusal, so the most it can reveal is whether some stage ID appears in another owner's receipt.

**Fix:** set `search_path=''`. Keep the global check, since it is a collision guard, but add a supporting index or a stage-ID tombstone table.

### L9 (nit): revision comparisons are case-sensitive on `userId`

**Where:** `053:121` accepts upper-case hex, but `053:145`, `057:172` and `057:239` compare the jsonb text exactly.

**What happens:** a client that sends an upper-case UUID gets ET003 on every protected operation, and `prepare-day` never prepares protected roots. This is a functional problem only.

**Fix:** accept only lower-case UUIDs in `validate_tracker_revision`, or compare the four fields individually.

### L10 (process): 057 sits outside the plan's apply allowlist

The plan specifies a "literal 053–056 complete-bundle-only apply allowlist". 057 replaces `apply_tracker_write`, `save_tracker_chain` and `tracker_argument_types`, so applying 053–056 without 057 would deploy the 054 bodies; in 054, `tracker_argument_types` is wrongly marked IMMUTABLE. Make sure the runner allowlist, the README order and the reconstruction evidence all treat 053–057 as one atomic bundle.

### L11 (spec question, does not block): teens need an operator decision for every optional purpose

**Where:** `053:75`. With no scoped row, a non-adult gets `pending`, so `canWriteCustom` and `canWriteFitness` are false. `038:60` confirms this is the intent.

This mirrors 050's AI model and the plan's "conditional minor authority follows the existing reviewed model". In practice, though, every 12–17 account needs a trusted `record_tracker_processing_authority` decision before custom quests or Gym will work. The owner should confirm this matches the design's "no routine teen guardian requirement".

### L12 (nit): the upload-path version segments allow at most 9 digits

**Where:** `055:256` (`[0-9]{1,9}`).

Versions are integers up to 2147483647, which is 10 digits. Once any of the three versions reaches 10⁹, every upload is refused. Use `{1,10}`.

## Verify items (not findings)

- **Upload racing withdrawal:** `gym_media_upload_allowed` (055:248-262) reads access without locking the owner. An upload whose policy check runs just before a concurrent withdrawal commits can still be stored. The plan accepts this transport uncertainty. With M1 fixed, the object can never be attached afterwards.
- **Signed upload URLs:** none are used. The client uploads directly (`packages/shared/src/data/gym-media.ts:13`), so the restrictive INSERT policy runs on the real insert.

## Checked and found sound

**Write boundary**
- **Table writes:** all 19 tables in the 049 list have INSERT/UPDATE/DELETE revoked from public, anon and authenticated (054:335). REVOKE on a table also removes the earlier column-level grants, such as `035:6` on `gym_routines`. I compared the list against every `create table public.*`. The remaining tables, `profiles` and `weekly_summaries`, are outside the tracker scope.
- **Old mutation entry points:** every one is revoked, including `save_long_quest_definition`, `reconcile_long_quest_stages`, both stage-done aliases, the gym RPCs, the three preparation wrappers, `handle_new_user` and the new `reconcile_one_habit_recovery` wrapper. `increment_stat_xp` was already revoked in 029.
- **Still-callable functions:** of the authenticated-callable functions that write, `set_account_time_zone` prepares only permitted roots, through the filtered helpers and under the under-12 wrapper. The rest touch profile, consent or cleanup state only (`initialize_account_time_zone`, `update_profile`, `set_profile_theme` and `set_profile_palette`, `ack_gym_media_cleanup`, the two consent setters).
- **Retained routines:** every routine the gateway dispatches to is SECURITY DEFINER with `search_path=''` and explicit `auth.uid()` owner predicates. `set_long_quest_stage_done` is an invoker but filters on `quest.user_id=auth.uid()`. Dispatch is a static CASE with no dynamic SQL.
- **New SECURITY DEFINER functions:** all set `search_path=''`, carry explicit owner predicates and revoke all before granting. Only `get_*`, `set_tracker_processing_consent`, `apply_tracker_write` and `gym_media_upload_allowed` are granted to authenticated, and `ai_tracker_week_input` only to service_role. `processing_access` keeps its `postgres` grant from `050:394`.

**Revisions, provenance and locking**
- **Revision binding:** consent and logical authority versions only increase. Withdraw then regrant leaves an old protected intent with ET003. Personalizing a root changes its snapshot `inputKind`, so an old basic intent is refused without any consent change. Snapshot comparison is a true set comparison: distinct IDs, equal lengths and containment both ways. A caller claiming `basic` for a custom root is reclassified from the server's own provenance. Basic-only operations ignore unrelated optional-revision changes, as specified.
- **Provenance:** it only ever moves basic→custom (054:111, 057:87), and basic-mode saves on protected roots are refused (054:79, 057:46). It survives root deletion because it has no live foreign key, and it is removed with the account. Ordinals are computed under the owner lock, never reused, and unique per owner and kind. Reuse of a *provenanced* deleted ID is refused (039:75).
- **Logical authority version:** each decision adds exactly 1, so `processing_authority_events unique(user_id,version)` cannot collide. Integer overflow raises an error and rolls back. Revision rows cannot be deleted or decreased while the account exists.
- **Lock order:** the gateway, the consent setter, the authority recorders and `ai_tracker_week_input` all take `auth.users FOR UPDATE` before any target row. The under-12 trigger's FOR SHARE runs inside the same transaction.

**Preparation and Storage**
- **Public reads:** `get_habits_for_date`, `get_open_habit_recoveries` and `read_history_range` no longer write. The rewritten occurrence and rollover bodies match the 042/038 originals plus the permission filter. Bulk reorders no longer rewrite paused siblings. `tracker_history_snapshot` keeps the 028 keys and normalization and has owner predicates on every source and join.
- **Narrowing setting:** `eiyu.tracker_basic_only` can only narrow, because any value other than 'on' falls back to normal checks. It is transaction-local, rolls back on abort, and clients cannot set it through PostgREST.
- **Storage path parsing:** the policies require exactly 4 segments. The owner must equal `auth.uid()::text`, and routine and object IDs must be lower-case UUIDs with a `gif` or `mp4` extension. The tuple must match the current one with no leading zeros, and the routine must be live and owned. The UPDATE `WITH CHECK` validates the new name, which covers renames and upserts. Other buckets are unaffected. The helper being callable over RPC reveals only the caller's own routine existence.

**AI input and export**
- **AI input (056 and Edge):**
  - The owner comes from the verified JWT. The body may contain only `action`, `weekStart` and `processingAccess`.
  - The canonical input matches the client `gatherWeekData` in membership, order, counts and totals.
  - Over-limit input (more than 100 habits, or too many bytes) is refused before admission, with no truncation and no quota spent.
  - A withdrawal between the canonical read and admission is caught by the begin-version comparison in `ai-proxy-core.ts:450`. A withdrawal after admission is caught by `processing_request_current` at dispatch.
  - `easy-versions` and `stage-breakdown` are still refused at `051:81`.
- **Export manifest:** the new tables' export and exclude lists cover every column exactly (6 and 7). The FK entries match `pg_get_constraintdef` output, the merged list is re-sorted the same way as the drift query, the table set is compared order-independently, and the processing_consent columns are extended in place. Review references and `next_stage_ordinal` are excluded.
