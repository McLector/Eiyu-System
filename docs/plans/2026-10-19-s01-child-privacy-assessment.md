# S01 child/privacy assessment — ADOPTED for testing and release planning

## October 20 adopted assessment — S01 investigation COMPLETE

The owner explicitly answered “Adopt this assessment for testing and release planning”. Adopted direction: ordinary necessary account/tracker processing under section12(b); specific, informed prior consent under section13(a) for birthday/age and sensitive information; guardian authorization for children where their own consent is insufficient. This is the operator's chosen processing approach and release constraint, not a finding that present signup consent satisfies it or a universal legal rule about every child.

Keep the chosen initial/corrected birthday declarations and adult-only AI. Record false-adult declarations as a residual risk; mailbox ownership and low request frequency do not remove it. No independent correction review, ID/selfie collection, paid verification or provider contact is adopted. Public child-data/AI release stays blocked until appropriate understandable notice, consent/authority handling and under-12 treatment are designed, implemented and verified, alongside the existing S02/release gates. Preserve existing history.

This decision closes the last S01 investigation/assessment gate. It does not close S02, certify legal/provider compliance, publish policy, change live settings or authorize deployment. The unavailable-settings disposition remains in force: unknown values are not verified, and the exact strict Groq replacement must be verified before activation. See [handoff027](../handoff/027-handoff.md) for the closed S01 checklist, already-started INCOMPLETE S02, and authoritative next-session prompt. Earlier INCOMPLETE/pending statements below are historical and superseded only for S01 investigation status.


Prepared October 19 for McLector Dev's existing Philippines-first Eiyu System. This is a concrete engineering assessment for operator review, not a new product design, public notice, legal certification or deployment authorization. No real child/parent interviews, provider consultation or additional personal information were collected. Evidence is the recorded owner decisions, source, local tests and official guidance below.

## Scope and intended benefit

Eiyu is a habit/quest tracker intended for ages 12 and above. AI supplies weekly reflections; no medical, financial, employment or other high-impact decision service is intended. The private text people choose for quests can nevertheless reveal sensitive information. Tracker purpose and low AI frequency alone do not establish a processing basis.

Adopted boundaries remain: trusted initial/corrected birthday declarations; unknown/currently declared minor/retained-pending AI denial; separate current-mailbox proof for debriefs; quests without mailbox proof; direct Groq Free20b/global ZDR/no training permission; no paid fallback. No ID/selfie/biometric/independent-correction workflow is proposed. The S04 generation-limit/manual-Generate change is not pulled into this assessment.

## Observed data flow and control evidence

1. Existing signup requires a valid civil birthday and acceptance of the linked Privacy Policy/Terms. Auth initial metadata receives the birthday; SQL047 captures private accepted date/revision. Later metadata editing cannot authorize AI. Legacy unknown accounts can use quests and supply a birthday in Profile.
2. Account, profile, quest and completion data use existing Supabase storage and owner-scoped access. Birthday revisions and current-email proof use private server state. Device/browser sessions may include initial birthday metadata; private database storage does not eliminate that duplicate.
3. Eligible debrief requests gather quest/activity data and send it through the server route. Dedicated birthday, email, OTP and session fields are not added to model prompts; user-entered quest text is not guaranteed anonymous or nonsensitive.
4. The reviewed local route permits only direct Groq20b weekly summaries. The unchanged deployed v24 may still use Gemini, Groq120b and OpenRouter. Local policy text and guards must not be represented as deployed.
5. Android can request a debrief when Status mounts/returns to foreground; web Weekly can request one. Opening the tracker is not currently equivalent to an explicit manual Generate action. Local technical disclosures now describe this; automatic triggering must be considered when evaluating permission and notice.
6. Local source/tests establish adult/mailbox/owner/revision checks and failure/refund controls, real local mail redemption and retained quests. Remaining physical identity/callback/font and hosted activation checks are S02/release acceptance, not missing evidence that all existing controls are absent.

**Age-boundary limitation:** current birthday validation checks validity/future dates, and server eligibility checks adult AI. Neither is evidence of a registration-wide under-12 denial. The intended audience must not be described as an implemented age-12 admission gate. Handling an under-12 declaration is a release-policy/implementation decision; existing history must not be silently erased. This does not change the intended minimum age or authorize a new account flow.

## Risk and residual limitations

| Situation | Existing mitigation | What remains to resolve |
| --- | --- | --- |
| A minor declares an adult date, initially or by correction | Neutral declaration, authoritative private revision, denial for the currently declared minor/unknown/pending state | False-adult declarations remain possible. The owner must assess this residual exposure for the actual audience/data; the system does not independently prove adulthood. |
| Child account/quest data collected without an applicable basis or understandable notice | Existing account flow and local technical privacy corrections; AI denial does not block quests | General Terms/Privacy acceptance is not by itself evidence that every sensitive-data/child-consent condition is met. Current code has no separate child notice or demonstrated guardian-authority process. |
| Birthday data exposed beyond its screening purpose | Private table/restricted RPCs, no dedicated DOB in provider prompt | Initial Auth metadata/session duplication, retention and staff/support access need reviewed limits. Do not collect IDs or new verification documents merely to close this row. |
| Sensitive quest content reaches a model unexpectedly | Declared-adult/current-mailbox gates, reviewed narrow prompt, direct-recipient restriction | People can type sensitive facts; automatic Status/Weekly requests require clear notice and an applicable permission basis. Missing email/DOB payload fields do not guarantee de-identification. |
| Owner/email changes during in-flight or cached debrief access | Captured owner authorization, revision checks, server policies and reviewed cache/UI invalidation | Physical race and old-client offline-cache acceptance remain S02/release work. Already downloaded copies cannot be remotely recalled by a database policy. |
| Gemini or an unreviewed router processes an intended mixed-age release | Strict replacement is tested locally, reviewed fail-closed activation/rollback plan | v24 is unchanged. No mixed-age release may treat Gemini as already off; no router/paid fallback is permitted in the intended route. |
| Expired proof metadata, old content, logs or backups outlive a promise | Bounded challenge validity/attempts, adopted active-account retention and verified-request operating targets | Expiry is not erasure. Maintenance/request handling must be rehearsed; actual vendor windows and exceptions must be documented before promises are published. |
| Privacy questions or an incident cannot be handled consistently | Supplied public contact and owner-adopted acknowledgment/completion targets | Confirm the operator can perform verified export/deletion and incident handling without asking for passwords/ID images or losing another account's data. No such request is executed here. |

No numeric probability, assurance accuracy or claim that the app is automatically low risk is invented. The controls reduce specific bypasses; they do not eliminate declaration, consent or retention risks.

## Processing-basis direction for review

The [Data Privacy Act](https://privacy.gov.ph/data-privacy-act/) distinguishes ordinary personal-information conditions from sensitive-data conditions; age is expressly sensitive. A candidate direction is necessary account/tracker processing under section12(b), with specific prior consent considered under section13(a) for birthday/age and sensitive quest content. Applicability, especially children's capacity/authority and any guardian involvement, still needs an actual operator assessment. Do not claim that contract alone covers sensitive data or that one generic signup tick proves all required permissions. This is a proposal for review, not a conclusion that those conditions are already met.

The [NPC child-transparency FAQ](https://privacy.gov.ph/wp-content/uploads/2024/12/FAQs-Advisory-on-Guidelines-on-Child-Oriented-Transparency.pdf) explains a pre-launch child assessment, risk-based assurance and understandable child notices. It sets no universal digital-consent age or mandatory assurance tool; self-declaration may be inadequate for high-risk processing. It does not make parental consent universal merely by listing parental involvement as an assessment factor. Do not silently replace age12 with age13/18 for quests, or infer guardian authority from the child's email.

Recommended current disposition: continue development with the adopted declaration design and documented residual risks. Keep public child-data/AI activation blocked until the operator records the applicable processing condition, child/guardian treatment and necessary notices. Approval to proceed with development is not a finding that public minor processing is lawful or that the provider has approved this architecture.

## Short child-notice candidate for the intended strict Groq release — not implemented or published

> Eiyu helps you track your quests and progress. We keep your email, profile, birthday and quest information to run your account and check which features you can use. Supabase stores account data and handles sign-in. Some features check access to your email. You can still track quests without that email check. AI reviews require an adult birthday declaration. Accounts with a missing birthday, a birthday showing under 18, or a pending correction cannot use AI. The email check does not prove your age or grant AI access. For eligible accounts, weekly AI reviews send quest and activity information to Groq. You can read the full Privacy Policy and ask questions at privacy@eiyusystem.app. Keep passwords, sign-in links and email codes private.

This is a starting point for a separate understandable notice, not evidence that a child has understood or agreed. Delivery, placement, age suitability and guardian handling must be reviewed before release. Reuse the existing legal entry points if later approved; do not introduce another account system from this draft.

**October 20 review amendment:** the existing S01 reviewer identified the need to state adult-only AI and the strict-release scope explicitly in this child-facing candidate; both are corrected above. Other assessment boundaries were accepted without substantive finding. No product text, consent flow, native dependency or production setting changed in this amendment. The deployed v24 route still differs from this intended-release notice.

## Decision boundary and next action

- **Already adopted:** intended audience and declaration policy, adult-only AI/current-mailbox gates, provider/budget direction, testing-phase retention and verified-request operating targets. Do not request those decisions again.
- **Configuration evidence:** dashboard walkthrough is exhausted: retry value hidden behind a digest, no known saved provider JSON; two Gemini model overrides absent. Following explanation of the limitation and effect, the October 20 “continue” accepts recording these as unavailable with mandatory verification before activation. Values remain unknown; this is not approval of v24 or deployment. No settings change or hash collection is needed.
- **Still pending operator assessment:** actual processing condition for age/sensitive quest data, child/guardian treatment, and whether the declaration controls are suitable with the documented residual risks. This draft does not substitute operator approval or invent existing consent evidence.
- **Carry to S02/release:** required notices/consent implementation if the assessment calls for them, under-12 handling, physical acceptance, final origin/build, old-client/drain procedure, and coordinated strict-route activation. A recorded constraint is not a completed implementation test.

S01 and local S02 remain INCOMPLETE. This draft makes the remaining S01 decision concrete; it does not allocate027, start S03, alter software/production, contact anyone or spend money. Once actual S01 gates pass, create the next unused numbered handoff carrying already-started S02 and its exact prompt, then STOP.

**October 20 read-only follow-up:** the existing S01 reviewer confirmed the adult-only AI and intended-release notice findings resolved. The remaining substantive S01 item is the operator assessment decision, not S02 device/rollout implementation. A concrete adoption question is pending with the owner; no answer is inferred from elapsed time.
