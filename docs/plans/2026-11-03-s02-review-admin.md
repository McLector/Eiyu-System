# S02 admin console and retention: independent review (2026-11-03)

A fresh read-only reviewer covered 060, 061, their tests, and the shared, web and mobile clients. It ran no tests and touched no database. This records an AI review, not a human or legal one. The orchestrator re-read the code behind each Medium finding before acting on it.

No High findings. The server-side operator gate held.

## Medium

| # | Finding | Where | Disposition |
| --- | --- | --- | --- |
| M1 | An approval binds to the age version at decision time, not the one the request was made under. A birthday corrected between listing and approval gets approved without the reviewer seeing it. | `060:76,164-175` | Confirmed. Fix in 062. |
| M2 | One failing account rolls back the whole retention run, every day, with nothing visible. | `061:93-115` | Confirmed. Fix in 062. |
| M3 | Due dates are Manila calendar days, so a 23:00 withdrawal is removed at 02:15 on D+30, about 29 days 3 hours later. | `061:45,92` | Confirmed. Fix in 062. |
| M4 | First-time authenticator enrolment needs only the password. Anyone holding it could enrol between the operator-row insert and the owner's own enrolment. | `AdminMfa.tsx:44-53` | Runbook order: enrol first, then add the operator row. |
| M5 | Removal covers only roots with explicit custom provenance, so legacy custom habits and chains stay after day 30. | `061:63-71` vs `053:178` | Kept on purpose: never auto-delete what cannot be classified. Documented as a known limit; see the owner note in the checkpoint. |

## Low

| # | Finding | Disposition |
| --- | --- | --- |
| L6 | Console state can outlive an account switch in another tab. The server still refuses real access. | Fix: key the console by user and reset the hook. |
| L7 | Email lookup trims spaces only, and the ambiguous-match branch is untested. | Fix in 062, with a test. |
| L8 | No way to lift a pause from the console. A paused account cannot re-ask, and the dialog says "until you record a decision". | Fix: add a resume action. |
| L9 | A failed decision leaves the stale row showing. | Fix: reload the queue. |
| L10 | Any operator always lands on `/admin`, and an operator can approve their own request. | Runbook: use a dedicated admin account. Not enforced. |
| L11 | If the job was down 7 or more days, a row is removed without the reminder. | Fix in 062: remind first, remove 7 days later. |
| L12 | Oldest-first 200 limit on the queue; `withdrawnAt` shown in UTC beside Manila dates; a stale `removed` row after a regrant. | Fix the date display. The others are accepted at this scale. |
| L13 | Audit keeps the subject id after account deletion, with no purge. | Accepted: the 90-day tail stays manual per decision 6. |
| L14 | Retention hard-codes notice version strings, though a grant already clears the state. | Accepted, noted for the next notice bump. |

## Checked and sound

The operator gate fails closed. Every operator RPC calls it first, and a failed call writes no audit row. No function adds operators or reads the audit. All new functions set `search_path=''`, helpers are revoked from every client role, and public RPCs go to `authenticated` only. Approval cannot override a pause. `get_my_review_requests` is own-rows only with no note. Retention is scoped by user, purpose and provenance, and is idempotent. Every client RPC name, argument and returned field matches the SQL.

## Not checked by the reviewer

Live database state, pg_cron itself, whether the 054/058 write guards allow retention deletes outside a user context, GoTrue MFA rules, web and mobile test bodies, and the legal copy.
