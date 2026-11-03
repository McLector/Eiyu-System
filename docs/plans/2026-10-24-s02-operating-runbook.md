# S02 operating runbook (decisions 1 to 7)

Date: 2026-10-24. Owner: the project owner, as sole reviewer and sole operator. Source of the numbers: `2026-10-24-s02-adopted-decisions.md`. Numbers marked "orchestrator's call" there can be changed by the owner; if one changes, change it here, in the notices (`packages/shared/src/logic/legal-content.ts`) and in the Privacy Policy together.

This runbook describes what to do. It contains no credentials and no deletion SQL that runs by itself. Nothing in it is scheduled or automated.

## 0. Ground rules

- Never ask for, open, copy or forward IDs, selfies or documents.
- When a case is unclear, the answer is "pending". Never "approved by default".
- Basic quests, history, recovery, birthday correction and data requests keep working for everyone, always.
- Never paste quest text, correspondence or attachments into a decision record.
- Never put secrets, keys or `.env` values in chat, files, tickets or commits.

## 1. Teen review (decision 1, option C)

Applies when an account declared as 12 to 17 asks for AI, custom tracker or fitness. Basic tracking stays open and is not reviewed. Until you record a decision, the purpose stays pending: no AI and no protected processing for that purpose.

**What you look at (only these four things):**
1. The declared age status.
2. The purpose asked for.
3. What the person wrote themselves in the optional request, if anything.
4. Whether the contact information is consistent.

**What you never look at:** IDs, selfies, documents, or the contents of their quests, workouts or AI reviews.

**Deciding:**
- Clear and consistent: approve. Anything unclear: leave pending, and reply once asking only for a plain-words clarification (never evidence).
- A guardian is involved only if a reviewed case says own consent is not enough. Confirming two mailboxes proves only that someone controls them; it does not prove parental responsibility.

**Recording the decision.** Use the trusted operation described in section 4.
- Custom tracker or fitness: `private.record_tracker_processing_authority(p_user_id uuid, p_purpose text, p_state text, p_expected_age_version integer, p_review_reference uuid)` (migration `053_tracker_processing.sql`).
  - `p_purpose` is `'custom-tracker'` or `'fitness-tracking'`.
  - `p_state` is one of `'not-required'`, `'pending'`, `'approved'`, `'revoked'`.
  - `p_expected_age_version` must equal the account's current age revision, read first from `private.account_age.version`. If it does not match, the call refuses with "Tracker access changed" (the birthday changed since you looked); re-read and review again.
  - `p_review_reference` is a fresh random UUID you generate as the case number. Write the same UUID in your case log (section 4). It is not a user-facing link and it is not the contact/review reference of section 2.
- AI and age screening use the older `private.record_processing_authority(p_user_id uuid, p_state text, p_purposes text[], p_expected_age_version integer, p_review_reference uuid)` with purposes drawn from `'age-screening'` and `'weekly-debrief'` (migrations `050` and `053`).
- Both functions write the current state and an event row in `private.processing_authority_events` (account, state, purposes, age revision, version, case reference, time). That is the whole record.
- An approval is bound to the age revision. If the person corrects their birthday, the state returns to pending and you review again.

## 2. Contact and review references (decision 2, option B)

Rules to apply when a reference-issuing flow is built:
- Valid for **7 days**. Single use. Bound to one account, one purpose and one revision.
- A new request cancels the old one.
- At most **3 re-sends per day**.
- No reference text in logs.
- A changed birthday declaration or purpose invalidates it.

**Status today: no reference-issuing flow exists in the code.** References stay unusable (deny) until one is built, so these rules are recorded here only. Do not hand-make references. A reference confers no authority by itself; only a recorded decision does.

## 3. Disputes and revocation (decision 3, option A)

1. A credible report (from the teen, a parent, or anyone) that a consent was not valid, or a withdrawal of approval, **pauses the affected purpose first.** Record `revoked` or `pending` for that purpose using the operation in section 1. This denies generation, reading of derived output and protected writes, and keeps history, recovery, birthday correction and data requests.
2. Note the date you received the report. Reply once saying the purpose is paused and a decision will follow. Ask for no evidence.
3. **Record your decision within 14 days** of the report (inside the 30-day request target). Record the outcome with the same operation.
4. Unresolved disputes stay paused. The person can always still export and ask for deletion.
5. A false report can pause someone else's account; accept that cost and resolve it on the 14-day clock.
6. The record is two lines in your case log: account reference, what changed, time, decision.

## 4. Operator access (decision 4, option A)

- Only the owner, from their own machine, using the database SQL editor or the project's secure access, and only for a recorded case.
- The functions in section 1 have execute revoked from `public`, `anon`, `authenticated` and `service_role`. They run only as the database owner role in the SQL editor. Do not grant execute to anything to make a call easier, and do not build an admin screen (out of scope for S02).
- Each use writes the minimal record: account reference, purpose, revisions, decision, time. Keep a short case log (outside the repository; never committed) with the case UUID, date opened, date decided, date closed, and a one-line outcome. No quest text, no correspondence.
- Before running, check you are on the intended project, and confirm with a read-only query that the account exists and the expected age revision matches.

## 5. Withdrawal retention and removal (decision 5, option B)

**The numbers.**
- After a person fully withdraws custom-tracker and/or fitness permission, their records stay **read-only for 30 days**, then are removed through this runbook.
- A **reminder is due on day 23** (a week before removal) so the owner can check whether the person asked for an export or changed their mind.
- Consent-evidence rows (purpose, notice version, decision, time; no content) are kept for the **life of the account plus 12 months**.
- Held offline queue entries on devices expire on the same 30-day period. Old offline copies cannot be recalled.

**How it works day to day.**
1. When a person withdraws, note the account reference, the purpose, and the withdrawal date in the case log. Set a calendar reminder for day 23 and day 30.
2. Day 23: confirm the withdrawal is still in force (the person has not re-granted). If they re-granted, cancel both reminders and stop. If they asked for an export, make sure it is delivered.
3. Day 30: carry out the removal below, only after re-checking that the purpose is still withdrawn.

**What to remove (custom tracker):** the person's custom quests and chains for the withdrawn purpose, with their schedule, progress and completion history, and stage text.
**What to remove (fitness):** the person's Gym routines, exercises, sets, weights, workout sessions, and uploaded exercise media in storage (storage files are removed separately from the database rows; check both).

**What never to touch:**
- Anything for a purpose the person has not fully withdrawn, or has re-granted.
- Basic quests and their history, the profile, the account itself, other users' rows.
- The consent-evidence rows and the authority decision record (they follow their own retention in section 6).
- Recovery, streak and birthday data not belonging to the withdrawn purpose.
- Backups and logs held by the hosting or email provider (they expire on their own schedule; the data-request wording says so honestly).

**Method.** Removal is manual and not automated or scheduled. Write the exact statements for each case, run them in a transaction in the SQL editor, and first run the matching `select count(*)` to see exactly what will go. Check the count against what you expect, then commit. Record in the case log the date and the counts removed. Do not write or install any scheduled job for this until the owner authorises automation in writing.

**If the person asks for deletion before day 30:** treat it as a data request (decision 8 wording, `DATA_REQUEST_RESPONSE` in `legal-content.ts`) and remove earlier, using the same method.

## 6. Authority and support records (decision 6, option C)

| Record | How long | How removed |
| --- | --- | --- |
| Authority decision record (current state and events) | While the account exists, plus a **90-day** tail for disputes | Manual, on a calendar reminder 90 days after the account is deleted |
| Consent evidence (no content) | Life of the account plus 12 months | Manual, same reminder style |
| Support correspondence | **30 days after the case closes** | Manual: delete the mail thread, keep only the one-line case-log entry |
| Case log lines | Same as the decision record | Manual |

The database refuses to delete the authority revision rows (`private.processing_authority`, `private.tracker_purpose_authority`) while the account exists (trigger `preserve_processing_authority_revision`), so those records follow the account. When an account is deleted, set a reminder for 90 days later to remove its decision rows, and for 12 months later to remove its consent-evidence rows. Confirm with a select first.

## 7. Unsolicited IDs, selfies or documents (decision 7, option A)

When someone sends one anyway:
1. Do not open, use or copy the attachment. Do not forward it. Do not save it to account, consent or test records.
2. Send the standard reply once (below).
3. **Delete the message and its attachment within 7 days.** Keep only a one-line note in the case log: date, "unsolicited attachment, not used".
4. If the same person sends more, do not reply again; delete within the same 7 days.

**Standard reply text:**

> Thanks for your message. We do not need IDs, selfies or documents, and we never ask for them, so we have not opened or used what you sent. Please do not send more. We are deleting the message and its attachment. If you have a question about your Eiyu account, reply with your question in words only, and we will help. We will never ask for your password, a code or an ID.

## 8. Standing reminders for the owner

- Day 23 and day 30 after each full withdrawal (section 5).
- 7 days after any unsolicited attachment (section 7).
- 30 days after each support case closes (section 6).
- 14 days after each dispute report (section 3).
- 90 days and 12 months after each account deletion (section 6).

## 9. Not covered here

Old app builds (decision 10), release facts (decision 12), the data-request reply itself (decision 8, in `legal-content.ts`), and any automation of removal. Decision 12 stays open with the owner.

## Update 2026-11-03: the admin console and automated retention

These replace the manual steps above wherever they differ. Nothing here is live until the owner releases.

- **Removal is now automated (061, 062).** "Removal is manual" in section 5 describes the earlier plan. On the live project the job needs pg_cron, which is not enabled yet, so enabling it is a release step. The notices promise removal, so they must not go live without the job.
- **Dates count full days.** The reminder is due on calendar day 24 and removal on calendar day 31, counted from the withdrawal date in Manila. The job runs at 02:15, so removal always comes at least 30 full days after withdrawal. If the job misses a reminder, it sends it first and removal moves 7 days on.
- **A failed removal shows as `failed` in the console's retention list.** The job retries it the next day. If it stays failed, check the database logs, which hold only the error code.
- **Known limit: legacy records.** The job removes only records with explicit custom provenance. Quests and chains from before tracker consent have no provenance, so they stay read-only after day 30 and are not removed automatically. Treat them by hand, on request.
- **Setting up the admin account: enrol first.** Sign in with the dedicated admin account, enrol the authenticator app, and only then add the account to `private.operator_accounts`. In the other order, anyone holding the password could enrol their own authenticator first.
- **Use a dedicated admin account,** not your personal tracker account. An operator can approve their own request, and this is not enforced.
- **Lifting a pause.** Use Resume in the console. It never grants anything: a teen returns to pending and still needs a review.
- **A request made before a birthday correction cannot be approved.** Deny it, or the person can simply ask again.
