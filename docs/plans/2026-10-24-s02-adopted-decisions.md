# S02 adopted owner decisions (2026-10-24)

On 2026-10-24 the owner said: "do what u recommend". Every decision in `2026-10-24-s02-owner-decisions.md` therefore takes its recommended option.

Where the recommendation left a number for the owner, the orchestrator chose a conservative value. Those values are marked **(orchestrator's call; owner may revise)**. Decision 12 is facts only the owner holds, so it stays open.

| # | Decision | Adopted |
| --- | --- | --- |
| 1 | Teen (12–17) consent for AI, custom and fitness | **C.** The owner reviews every teen case for these sensitive purposes, as sole reviewer, using a short written procedure. Unresolved cases stay pending. Basic tracking stays open. This needs no code beyond the existing pending state. |
| 2 | Contact/review reference validity | **B.** Valid for **7 days** **(orchestrator's call)**. Single use, bound to one account, purpose and revision. A new request cancels the old one. At most **3 re-sends per day** **(orchestrator's call)**. No reference text goes in logs. **No reference-issuing flow exists in the code yet.** References stay unusable (deny) until one is built, so the expiry is recorded in the runbook only. |
| 3 | Disputes and revocation | **A.** A credible report pauses the affected purpose first. The owner then records a decision within **14 days** **(orchestrator's call; inside the 30-day request target)**. |
| 4 | Trusted operator access | **A.** Only the owner, from their own machine, using the SQL editor or secure access, and only for a recorded case. Each use writes the minimal record. |
| 5 | Retention after full withdrawal of custom/fitness | **B.** Records stay read-only for **30 days** **(orchestrator's call)** after full withdrawal, then are removed through the documented runbook. A reminder is due at **day 23**. Consent-evidence rows (no content) are kept for the **life of the account plus 12 months** **(orchestrator's call)**. Held offline queue entries expire on the same 30-day period. Removal is not automated or scheduled until the owner authorises it. |
| 6 | Authority and support records | **C.** The decision record is kept while the account exists, plus a **90-day** dispute tail **(orchestrator's call)**. Support correspondence is deleted **30 days after the case closes** **(orchestrator's call)**. Removal is manual, on a calendar reminder. |
| 7 | Unsolicited IDs, selfies or documents | **A.** Not opened, used or copied. One reply asks the sender not to send more. The message is deleted within **7 days** **(orchestrator's call)**, keeping only a one-line note. |
| 8 | Data-request response wording | **A.** As drafted in the decisions document. |
| 9 | Wording of the two new notices | **A.** The four drafts in the decisions document (adult and 12–17 versions of each), with the periods above filled in. |
| 10 | Old app builds once live | **A.** Old writes are refused when the release is activated. The current enforcement already fails closed. |
| 11 | Usability cost of declining | **A.** Accepted. |
| 12 | Release facts | **OPEN.** Only the owner holds these. See `2026-10-24-s02-release-facts.md`. |
| 13 | Privacy-policy additions | **A.** Added, now that 5, 6 and 8 are settled. |
| 14 | Regrant and paused days | **A.** Days in a protected-purpose pause count as not scheduled: no occurrences, no misses, and streaks continue. |
| 15 | Font scaling repair | **A.** Adopt the native `fontScale` setting through an Expo config plugin (no SDK change), plus one shared text helper. Tests come first, followed by an Oppo check at 1.6 and 1.0. |

## What still needs the owner

- Decision 12 facts.
- Any change to the numbers marked as the orchestrator's call.
- Authorising automated removal for decisions 5 and 6, if ever wanted.
- Actually doing the reviews under decision 1 once teens opt in.

## Update 2026-11-03

The owner is currently the only real user. They will review these numbers and notices by using the app for a few days with some friends testing, and plan to consult a professional they know. The numbers stay as adopted unless a problem shows up. This is not legal sign-off.
