# Luna repair plan for the board refresh

Date: 2026-09-27. Starting review revision: `aa793ba`.
Original implementer/fixer: **Luna (`gpt-5.6-luna`, `xhigh`)**. Current implementer: **Sol (`gpt-6-sol`, `medium`)**, explicitly authorized by the user on 2026-09-29: "delegate it to sol medium. go". Reviewer: parent Codex/user-designated reviewer.
Status: **Repairs A–E implemented on `codex/board-refresh-repairs`; final review remains open because device interaction, actual 200% zoom on changed surfaces, and rollout checks are missing.** See `review-evidence/2026-09-29-repair-final-review.md` for criterion-level verdicts and `review-evidence/2026-09-29-repair-checkpoint.md` for independent execution details. Earlier instructions naming Luna below describe the original assignment; the user's explicit model change governs continued implementation.

Read `2026-09-27-post-landing-review.md` and its evidence first, then the original board-refresh plan. The old plan/handoff's Phase 0 HALTED checkpoint is historical, not the current source revision. Use current Git status and the integration ledger to establish state; preserve existing untracked user work.

The user requested this review and a fix plan with Luna implementing. This document is the concrete handoff for that implementation. These lettered repair batches avoid confusing the earlier nine-stage quest project with the seven-stage board refresh. Do not invent an original Phase 7–9 or silently substitute a different implementation model.

## Repair A — lifecycle reachability and safe deletion

Findings: BR-01, BR-02, BR-05, BR-16. Requirements: R1/R2/R12; P2-AC1–5.

1. Extend the board data contract to include archived recurring and one-time definitions. Keep active one-time eligibility restricted to today and avoid duplicate IDs.
2. Make permanent-delete confirmation use the exact retention semantics, target name, initial Cancel focus, focus containment/return, safe pending dismissal, and retry without duplicate destructive requests.
3. Reject updates of missing/deleted definitions at the authenticated write boundary. Do not rely exclusively on an in-memory same-session tombstone set.
4. Split passive reminder-permission inspection from explicit permission requests; Restore must not prompt the OS. Keep successful persistence separate from reminder warnings and provide reconciliation.

RED inputs: D01, D02, R01. Add transport-backed archive/restore-one-time tests and native store permission tests before fixes.

Acceptance: archive a one-time quest, reload both clients, restore the same ID, archive/delete it, and verify retained History/XP. Hold a stale editor open on another client and prove save rejects without misleading success/reminders. Verify Cancel/Enter/Escape/Back and repeated confirmations. Test enabled/granted, enabled/denied, undetermined, disabled, and scheduler failure without unsolicited permission requests.

## Repair B — exact, consistent historical readers

Findings: BR-03, BR-04. Requirements: R10/R12; P1-AC2/4, P5-AC2, P6-AC2.

Design one owner-scoped normalized history read boundary. Combine live and retained evidence with consistent database visibility. Use server aggregates where callers need totals; where rows are required, provide stable ordering/pagination and define consistency across a concurrent move into the ledger. Maintain date-range semantics, recurring-only weekly targets, one-time review inclusion, and current AI narrative cache policy.

RED inputs: D03/D04 are deterministic models. Add real local REST tests with more than 1,000 rows and a real read/delete concurrency test before declaring the fix verified. A passing mock is insufficient for grants, row limits, or transaction visibility.

Acceptance: exact before/after completion details, scheduled denominators, review cells, weekly target progress, and AI inputs for 0/1/1,000/1,001+ mixed records. No missing/double-counted contribution under controlled delete/read interleavings. Preserve RLS, anonymous rejection, ownership, and ledger immutability. Run existing SQL security/concurrency tests. Apply any new schema work through this repository's canonical numbered SQL convention and test only the disposable local target.

## Repair C — account modal and profile compatibility

Findings: BR-06, BR-07, BR-08, BR-09, BR-17. Requirements: R5–R8; NAV-02/03, PROFILE-01/02, SETTINGS-01, P4-AC2–6.

Create/reuse proper modal behavior on web; implement native dirty/pending policies and keyboard-aware scrolling. Reuse a single Settings overlay for ordinary and legacy routes. Remove duplicate account actions from embedded Settings while preserving genuine settings controls.

Unify the code-point and whitespace policy across UI, shared normalization, RPC, and direct-write protection. Preserve existing longer profile values until a valid user edit. Rehearse an upgrade from the schema before 026 with 81+ code-point and whitespace edge cases.

**Migration ordering matters:** appending a repair after 026 does not help a database that cannot apply 026. Design a compatible pre-026 upgrade path or narrowly reviewed historical-migration compatibility correction, document the deviation, and prove both fresh install and upgrade. Do not truncate existing data to satisfy a constraint. Ensure routine profile/timezone reads still work for grandfathered values.

RED inputs: R02/R03/R04/R06 and `profile-compatibility.audit.sql`. Extend to native dirty Back, pending late errors, actual browser Back/Forward, focus return, and 80/81 Unicode boundary cases. The SQL probe uses a temporary table for the constraint failure; replace this with a full isolated upgrade rehearsal for acceptance.

Acceptance: dialogs preserve page/lane/scroll; keyboard cannot reach background; Escape/Back respects dirty/pending state; valid Unicode values round-trip across platforms; invalid whitespace is rejected at the server; legacy long values remain readable; profile changes never affect timezone/rank/XP. Native small-height/200% keyboard checks and legacy Settings close behavior must be executed.

## Repair D — complete board behavior

Findings: BR-11, BR-12, BR-13, BR-14. Requirements: R1/R2/R3; BOARD-01–05, P3-AC1–5.

Use shared unique-ID daily totals and deterministic lane ordering. Add lane-appropriate lifecycle menus, archived Restore/Delete controls and original-type labels. Make Daily/catalog copies reflect shared completion/quantity state without letting off-day catalog cards complete. Present native entries as separate cards and keep note/details controls independently accessible. Persist web lane/scroll context across editor routes and lifecycle operations.

RED inputs: R07/R08/R09. Add native mixed/one-time-only totals, shared state mutation, empty-lane navigation, error/retry, and archived-one-time card tests at the fetched-data boundary. Do not merely inject an impossible archived record into the component mock and call end-to-end retrieval verified.

Acceptance: complete/undo/quantity/recovery and lifecycle actions remain reachable on eligible cards, no archived/off-day completion, correct unique totals, deterministic ties, and lane preserved after archive/restore/delete/editor return. Exercise actual web routes and Android touch, not only callback mocks.

## Repair E — weekly dates and measured layout

Findings: BR-10, BR-15; follow-up keyboard/screen-reader checks. Requirements: R3/R9/R10; WEEK-01–04, LAYOUT-01/02.

Format account-local date keys without a second timezone shift. Establish bounded desktop lane/recovery scroll regions and visible overflow affordances. Keep natural page scrolling at enlarged text/short viewports. Correct tiny date labels without forcing clipping or CSS scaling.

RED input: R05. Add date/weekday tests for UTC+14, +12/+13, negative offsets, and year/month boundaries. Before CSS fixes, capture actual geometry/screenshots using synthetic 0/1/30/100-card and many-recovery datasets.

Acceptance: desktop 1366×768 and 1440×900 keep primary navigation, summary, lane headings and first cards visible under normal conditions; large lists scroll as intended. Check 390/768/1024/1366/1440/1920px, dark/light, long labels, long summary, errors, and 200% text/zoom. Record screenshot paths and numeric overflow metrics. Verify individual native matrix values can be reached with TalkBack. Respect the user's existing zoom confirmation, but test newly changed affected surfaces and previously missing stress cases.

## Repair F — evidence reconciliation and final review

Finding: BR-18; closes all prior repair findings. Requirements: R11/R13, FINAL-01–05.

Reconcile the plan/handoff/ledger/summary current-state headers without erasing dated historical evidence. Clearly distinguish the earlier nine-stage project from this seven-stage refresh and these repair batches. Intentionally version the governing plan/handoff when preparing the final reviewed documentation commit; do not stage unrelated untracked observations/raw logs. Record actual Luna model/reasoning provenance, reviewed revision, and test/artifact locations.

Promote repaired behavioral probes into their correct permanent test boundaries and replace modeled transport/concurrency evidence with the real integration tests specified above. Review every original acceptance row, including cases not represented in the 13 probes. Keep failures/missing checks visible; never mark a criterion PASS based only on aggregate suite counts or intended CSS.

Final checks: shared/web/mobile suites, relevant type/lint/build gates, local SQL/security/concurrency and upgrade checks, Expo SDK 54 compatibility/export for affected native code, Android debug/affected Maestro journey, and rendered web/accessibility review. Use the existing final journey with repaired cases and fresh disposable local accounts. No iOS build is required under the user's exclusion. Missing remote migrations remain a separately documented rollout prerequisite.

Deliver a repaired requirement/evidence matrix, resolved/open finding ledger, concise executive summary, actual tested revision, and remaining limitations. Report user-verified checks separately from agent-executed ones. Integration/publishing follows the user's applicable authorization; do not amend the prior phase commits to conceal fixes.

## Working rules for Luna

- Start from the latest verified local main and inspect dirty/untracked work before editing. Use `codex/board-refresh-repairs` or a suitably scoped repair branch.
- Read `AGENTS.md`, the exact Expo v54 docs, and relevant database/native guidance before affected implementation.
- Record meaningful RED before runtime changes, then GREEN and proportionate regression evidence. Keep intentional failing audit artifacts outside normal passing workspace discovery until promoted and repaired.
- Implement A–E in dependency order: A first; B and C have independent core changes; D depends on A; E follows D for layout; F follows all. Finish and review each batch rather than marking the entire refresh clear after the first fix.
- The review report labels evidence strength. Validate source-only/device/concurrency risks at the specified real boundary before closing them. Do not fix speculative issues without confirming their trigger.
- Preserve history, XP, identity ownership, existing SDK, theme identity, and the user's local data. Local tests must not reset an active dataset; upgrade rehearsals require an isolated disposable database.
- No product fixes were implemented as part of the review that produced this handoff. The next implementation should be carried out by the requested Luna model, with its exact changes independently reviewed.
