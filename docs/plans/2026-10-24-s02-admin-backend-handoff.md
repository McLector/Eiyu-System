# S02 admin backend (060/061) running handoff, 2026-10-24

Scope: backend/supabase/060_operator_review.sql, 061_tracker_retention.sql, tests supabase/tests/047_operator_review.test.sql and 048_tracker_retention.test.sql, README canonical-order line. Local-only; DB supabase_db_eiyu-s02-age-demo; 053-059 already applied; 22 retained users.

## Decisions recorded
- operator_list_retention is created in 061 (it reads 061's table; 060 cannot depend on it).
- Denied review records authority 'pending' (not 'revoked'), so the teen can ask again and a dispute pause is never overwritten; approve requires the purpose to still be pending.
- Note longer than 280 after trim is rejected (22023), not truncated.
- Retention clock starts only when consent is withdrawn after having been granted. Authority revoke/pause never starts it (a dispute pause keeps history).
- Removal scope: roots with explicit custom provenance only (legacy roots with no provenance are left; narrower than tracker_root_permitted).

## Log
- (start) orientation done; writing 047 test first.
- RED 060: runner `adm-047-red-01` fail (42P01 missing private.operator_accounts) as expected.
- 060 written (tables, require_operator, 6 RPCs, export-manifest wrap). Throwaway GREEN: 047 = 99/99 ok.
- Regressions found and fixed in scope-adjacent test edits (flag to owner): 039 public-entry-point allowlist (+6 RPC names), 036 section count 36->37 (authority_review_requests exported as an owner section; manifest wrapped in 060 like 056). Without the manifest wrap 036/043 fail closed with "Export schema needs review".
- Throwaway regression over every wrapped single-session test on top of 060: all pass except 013 (dblink statement timeout; known dblink-in-held-DDL-lock case, to be run via runner after apply).
- 060 applied permanently; runner GREEN adm-047-green-01 (99/99); post-apply 036,039,043,013,037 via runner pass; races 009/030/041 pass. Transient user count 23 seen once right after apply (leftover from timed-out throwaway 013 dblink fixtures; cleaned by the runner 013 run), now 22. 048 test written; next RED.
- Coordinator additions (test-first): RED runner `adm-047-red-02`; GREEN throwaway 110/110. Added get_my_review_requests, operator_pause_purpose(+p_email), userId in queue rows; 060 file updated and the delta (drop old pause signature, create/replace 3 functions, grants) applied by hand to the already-applied DB.
- 061 applied; runner GREEN adm-048-green-01 (65), adm-047-green-02 (110), 036/039/043/013/037 and races 009/030/041 pass post-apply (adm-061-*). Users 22. pg_cron 1.6.4 enabled locally, job `tracker-retention` `15 18 * * *` (02:15 Manila) active. README line added.
- Known harness quirk: a dblink test (013) run inside the throwaway wrapper times out and leaves a committed fixture user (count 23); running 013 via the runner cleans it.

## Final signatures (all `public`, authenticated only, security definer, search_path empty)
- get_operator_status() -> {isOperator, mfaRequired, aal}
- request_authority_review(p_purpose, p_note) -> {requestId, purpose, status:'open'}; errors ER001 rate limit, ER002 already open, ER003 not pending, 22023 invalid
- cancel_authority_review(p_purpose) -> {cancelled: bool}
- get_my_review_requests() -> [{requestId, purpose, status, createdAt}] (open + latest approved/denied per purpose; [] when none)
- operator_list_review_requests(p_status default 'open') -> [{requestId, userId, email, ageBand, purpose, note, status, createdAt}]
- operator_decide_review(p_request_id, p_decision 'approved'|'denied') -> {requestId, status}; ER004 not open, ER003 no longer applies
- operator_pause_purpose(p_user_id, p_purpose, p_reason_code 'dispute'|'report'|'other', p_email default null) -> {purpose, state:'revoked'}; exactly one of p_user_id / p_email (case-insensitive exact, trimmed); unknown -> 42501
- operator_list_retention() -> [{email, purpose, withdrawnAt (timestamptz), reminderDueOn, removalDueOn (yyyy-mm-dd), status 'pending'|'reminded'|'removed'}]
- get_tracker_retention_notice() -> [{purpose, reminderDueOn, removalDueOn, reminded}] pending only; [] (not null) when nothing
