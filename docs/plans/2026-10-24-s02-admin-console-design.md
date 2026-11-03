# S02 admin console and automated retention: design (2026-10-24)

**Owner request (2026-10-24):** "a basic admin console that only I can access on the web by logging in with an admin account; I am redirected to my own console instead of the normal Board." The owner also asked to automate the 30-day removal after full withdrawal, if that improves on the manual runbook. Decisions 1–7 are in `2026-10-24-s02-adopted-decisions.md`. Everything stays **local-only** until the owner chooses to release.

## Goals
- Give the owner one safe place to do the operator work they'd otherwise do in the SQL editor:
  - review teen requests (decision 1C);
  - pause a purpose on a dispute (3A);
  - see what retention will remove and when (5B, 6C).
- Give teens a way to ask for review, with no IDs, documents or attachments.
- Run the decision-5 removal automatically, with a day-23 reminder to the user.

## Non-goals and anti-goals
- **Not a general user-data browser.** The console never shows quest names, descriptions, history, Gym records, birthdays or AI output. It shows only the declared age band, the purpose, the requester's own short note, and the account's email (needed to reply).
- **No new identity checks.** No ID, selfie or document upload anywhere.
- **No access from mobile.** The console is web-only.
- **No change for anyone who is not an operator.**

## Server (migrations 060 and 061, local-only; tests come first)

### 060: operators and the review queue

- **`private.operator_accounts(user_id pk → auth.users, added_at)`**
  - The owner adds their admin account by hand in the SQL editor. There is no RPC that can add an operator.
- **`private.require_operator()`**
  - Requires `auth.uid()` to be in `operator_accounts`.
  - Requires **MFA (AAL2)**: `auth.jwt()->>'aal' = 'aal2'`.
  - On failure it raises `42501` "Operator access required."
  - Every operator RPC calls it first.
- **`public.get_operator_status()`** (authenticated) returns `{isOperator: boolean, mfaRequired: boolean, aal: 'aal1'|'aal2'}`, for the caller only.
  - The web uses it to route an operator to the console after sign-in. An operator at AAL1 is sent to the MFA step instead.
- **`private.authority_review_requests`**
  - Columns: `id uuid pk`, `user_id → auth.users on delete cascade`, `purpose in ('custom-tracker','fitness-tracking','weekly-debrief')`, `note text check (length ≤ 280)`, `status in ('open','approved','denied','withdrawn')`, `created_at`, `decided_at`, `decided_by → operator`.
  - At most one open request per user and purpose.
  - RLS on; no direct client access.
- **`public.request_authority_review(p_purpose text, p_note text)`** (authenticated)
  - Only for an account whose state for that purpose is `pending`.
  - Rate limit: 3 per day per user.
  - The note is trimmed and capped. The function itself never stores attachments or IDs.
- **`public.cancel_authority_review(p_purpose)`** (authenticated): withdraws your own open request.
- **Operator RPCs** (each calls `require_operator`, and each writes `private.operator_audit(operator, action, subject, purpose, at)` with no content):
  - `operator_list_review_requests(p_status)` returns request id, account email, declared age band (`teen`/`adult`/`unknown`, never the birthday), purpose, note, `created_at`.
  - `operator_decide_review(p_request_id, p_decision in ('approved','denied'))`
    - Records the decision with the existing trusted functions: `private.record_tracker_processing_authority` for custom/fitness, and `private.record_processing_authority` for weekly-debrief.
    - It binds to the account's current age version, and uses the request id as the review reference.
  - `operator_pause_purpose(p_user_id, p_purpose, p_reason_code)`: a dispute pause (decision 3A). It records `revoked` through the same trusted functions.
  - `operator_list_retention()`: accounts inside a full-withdrawal window, with the withdrawal date, reminder date (day 23), removal date (day 30) and status. No content.
- **Grants:**
  - Every operator RPC is executable by `authenticated`, but it refuses anyone who isn't an operator at AAL2.
  - Nothing new is granted to `anon` or `service_role`.

### 061: automated retention (decision 5B)

Follow the runbook's removal scope exactly (`2026-10-24-s02-operating-runbook.md`).

- **`private.tracker_retention_state(user_id, purpose, withdrawn_at, reminder_due_on, removal_due_on, reminded_at, removed_at)`**
  - Maintained by the consent setter and the authority functions whenever a purpose goes from permitted to fully withdrawn.
  - A regrant before removal clears the pending removal.
- **`private.run_tracker_retention(p_now timestamptz)`**
  - Idempotent.
  - On day 23 it sets `reminded_at`, which the clients show in Profile.
  - On day 30 it removes that purpose's protected records, only those that are still unpermitted and only within the runbook scope. It never touches basic records, other purposes, or other owners.
  - It records `removed_at` and keeps the content-free consent-evidence rows. Those rows have their own life-of-account-plus-12-months period, which this job does not apply.
- **Schedule:** run by `pg_cron` once a day **on the local stack only**. pg_cron is not enabled on the live project; turning it on is a release step.
- **`public.get_tracker_retention_notice()`** (authenticated): the caller's own pending reminder or removal date per purpose, for the Profile notice.

## Clients

### Shared
Typed transports for the RPCs above, with owner checks in the existing style.

### Web
- **Routing:** after sign-in, `get_operator_status`.
  - Operator at AAL2: `/admin` console.
  - Operator at AAL1: the TOTP step (enrol or verify, using the supabase-js MFA API).
  - Everyone else: the normal Board, unchanged.
- **Console:**
  - review queue (approve or deny);
  - dispute pause by account email or id;
  - retention list;
  - sign out.
- **Normal users:**
  - a "Request review" button, with an optional short note, on a pending purpose in `TrackerConsent` and the debrief consent. The note text says "Don't include IDs or documents".
  - the Profile retention notice when a reminder is due.
- Copy fix: the privacy text must not imply Supabase backups exist on the Free plan. Say that no automatic backups are kept by the database host, and that any manual export the owner makes follows the same periods.

### Mobile
- The "Request review" button and the Profile retention notice.
- No console.

## Security notes
- MFA is required for every operator action, as a server check, not just in the UI.
- The operator account should be a dedicated admin account, not the owner's personal tracker account. This is not enforced.
- The audit table holds no content, and no RPC can read it.
- All operator RPCs use `search_path=''`, explicit owner predicates, and errors that never echo payloads.

## Verification
- **SQL tests** for:
  - non-operator and AAL1 refusal on every operator RPC;
  - request rate limit and one-open rule;
  - decide-then-access (a teen gains custom permission only after approval);
  - pause revokes and keeps history;
  - retention reminder at day 23 and removal at day 30, both idempotent, with basic records untouched and a regrant cancelling removal;
  - no content in the console projections or the audit.
- **Web and mobile component/store tests**, test-first.
- **Live check:** a local MFA enrolment once on the emulator or browser, with a synthetic operator account.
