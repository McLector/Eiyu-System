# S02 minimal-data debrief eligibility revision — APPROVED FOR PLANNING

S01 investigation is COMPLETE; S02 remains INCOMPLETE. This is the focused revision requested after Gemini exclusion, not a reopening of the adopted declaration policy or permission to activate hosted AI. The owner accepted continuing the review and expressly prohibited IDs and additional sensitive verification information. The existing notice/consent design remains historical context; this document proposes replacing its blanket minor-AI denial only after this replacement is approved, implemented and verified.

**October20 review:** the owner selected “Approve design for planning”. The eligibility replacement and minimal-data procedure may now be used to prepare the implementation plan. This is not an operator determination that every teen can supply every applicable consent, legal certification, or permission to enable hosted inference. Implementation remains subject to review of the concrete plan and the retained inline execution/no-implementation-delegation constraint.

## Intent and fixed constraints

Keep Eiyu useful for its intended age12+ audience without turning a habit tracker into an identity-verification service. Trust the existing initial/corrected birthday declarations. Mailbox checks establish control of the current email, not age, identity or parental responsibility. Keep ordinary quests independent of mailbox proof and optional AI permission. Preserve all histories and the adopted under12 write-pause and explicit-Retry/original-date rules.

No government IDs, document uploads, selfies, biometrics, payment-card checks, guardian birthdays, addresses, school records or new sensitive verification questions. Do not request them in app copy or through support. Do not introduce a paid assurance vendor, another identity account or an automated capacity score. Do not retain documents if someone volunteers them; the reviewed support-handling process must avoid reproducing them in account records or tests.

The operator's Groq account and keys remain server-side. Groq Free20b/global ZDR/no training permission/$0/no other-provider fallback remain fixed. Hosted ai-proxy v26 is paused under the successfully applied disabled mode. No activation, provider contact, deployment, publication or actual model call is authorized by this design. S04 generation frequency/manual-trigger changes remain deferred.

## Interpretation used for design, not certification

The owner's research and subsequent discussion support considering younger users of a customer application separately from the adult Groq account operator. Groq sections1,2,3.1–3.2 and6.2–6.3 must be read together: the agreement contemplates minors accessing customer applications but does not expressly state an exception to every possible reading of the Cloud Services age clause. Do not assert either universal minor prohibition or definitive provider permission. Written provider clarification would strengthen the evidence; it is not described as a legally mandatory contact step. Retain the uncertainty in the release record.

The adopted Philippines-first processing direction remains ordinary necessary account/tracker processing under section12(b), specific prior consent for age/sensitive information, and appropriate authority where the person cannot provide the applicable consent. The NPC child-transparency FAQ does not prescribe a universal digital-consent age, an ID requirement or one mandatory assurance method. No new13/16/18 self-consent threshold is invented by this design. A declaration or comprehension checkbox is not independent proof of legal capacity.

## Proposed replacement behavior

| Account state | Proposed debrief behavior |
| --- | --- |
| Accepted birthday unknown or retained correction pending | Deny generation and protected debrief access; offer the existing Profile declaration/correction flow. Never backfill birthday or consent from generic Terms acceptance. |
| Declared under12 | Keep AI denied. Preserve the adopted history/recovery/correction/data-request access and tracker-write pause. No new under12 signup; do not keep the rejected declaration. |
| Declared12–17, applicable own consent sufficient | Permit the same debrief feature as an adult after the recorded age-purpose and optional AI permissions, current-mailbox proof and current owner/revision checks. No routine guardian contact or evidence collection just because the person is under18. This branch requires operator review of the applicable consent arrangement, not a child-editable flag that bypasses authority. |
| Own consent insufficient, authority needed or an actual authority dispute unresolved | Keep processing that requires that authority paused until the conditional process below is completed. Age12 alone neither mandates a guardian step nor establishes capacity. Do not ask for sensitive evidence to unblock the feature. |
| Adult declaration | Recorded purpose-specific choices, current-mailbox proof and current owner/revision checks. An adult birthday does not grant missing consent. |
| Correction, consent withdrawal, authority revocation or owner/email change | Recompute access using current server state, invalidate affected pending work and hide disallowed cached content. No grandfathered permission, history erasure or automatic replay after access returns. |

The current adult-only implementation remains in place until the replacement is implemented across all boundaries. Merely changing UI labels or lowering a birthday helper is insufficient.

## Conditional guardian route without sensitive evidence

This is a proposed operating procedure, not an implemented or legally certified proof of guardianship. It applies only when authority is actually required or disputed; it is not a universal extra step for every teenager.

1. The account holder uses the existing Profile/contact path. Support requests no quest text, exact birthday, ID, document or other sensitive account history. Bind the request to an authenticated account and its current declaration/consent revision using a short-lived request reference. A reference alone grants no account access and no authority.
2. Explain the relevant purposes and withdrawal choices in plain language. If a guardian is needed, the guardian contacts the existing support address separately, identifies the request reference, and declares that they are an adult with parental responsibility or other applicable authority. Retain no guardian exact birthday or document. A guardian email is additional ordinary personal data: explain why it is needed and retain it only for the reviewed authorization/contact purpose.
3. Confirm the two contact endpoints independently. Use existing account/mailbox controls for the child-account side and a separate email reply/challenge for the guardian side. Do not send account history, birthday, password links or consent approval in the reference. Do not treat matching surname, a shared email, child-entered email, a challenge response or an adult declaration as independently proving the relationship.
4. The operator reviews consistency, the stated authority, the account binding and the particular purposes. Record a narrowly scoped decision only where the operator can justify the authority under the applicable arrangement. Unresolved, inconsistent or contested cases remain pending/denied; do not escalate to collecting sensitive evidence. Offer the existing correction/data-request routes. A mailbox-only exchange is never automatically upgraded into guardian approval.
5. Retain only the account reference, relevant notice/purpose/revisions, minimal contact reference, declared basis of authority, reviewer decision/timestamp and revocation state under a reviewed retention rule. No raw correspondence, attachments, quest text or duplicate DOB in consent events. Server-controlled review state cannot be edited by the child or inferred from Auth metadata.
6. Allow withdrawal through the existing contact path and the signed-in account controls. A report of disputed authority immediately suspends the affected authorization pending resolution without deleting history. Increment its revision and stop affected in-flight generation/output. Reconfirmation is needed for a materially changed purpose; do not silently broaden an earlier grant.

The procedure must be rehearsed with synthetic account/contact references and no real documents. The operator must review its sufficiency and minimal-record retention before it can authorize a real case. This constraint cannot be closed by relabeling an OTP as proof of guardianship.

## Consent and existing-screen behavior

Reuse signup, Profile, the existing legal dialogs and debrief panel. The previous notice draft's blanket “minor AI denied” copy is historical and must be replaced together with the actual policy, never ahead of it. Put the age-purpose notice before sending the birthday to Auth. Keep Terms acceptance separate, unchecked purpose choices, and accessible scrolling/font scaling. Provide a distinct child-oriented explanation alongside access to the fuller policy; one undifferentiated adult notice is insufficient. Use understandable wording for an unknown-age account before its declaration, then the appropriate age-oriented explanation without transmitting an unconsented birthday merely to select that copy.

Optional AI consent must identify Groq, the quest/activity information sent, sensitive facts the user may have chosen to include, saving the review, withdrawal and the actual current automatic Status/Weekly trigger. The user must not encounter a first inference before consent. The S04 manual Generate change is not used as a shortcut here. Birthday, email, codes and credentials remain excluded as dedicated prompt fields; user-entered quest text is not promised anonymous.

Declining AI leaves ordinary quests available. Withdrawing AI permission stops future inference/retries/output for that grant; do not infer that it requests deletion of saved history or immediate removal from vendor backups. The separate sensitive-tracker decline/withdrawal branch remains an explicit part of the broader consent design: do not block all ordinary quests or claim free text is nonsensitive merely because of a warning. This focused revision does not pretend that unresolved branch is already implemented.

## Coordinated server/client contract

- Preserve `adultDeclared` as a truthful age18+ fact for old-client compatibility; never change its meaning to12+. Add an explicit server-computed debrief age/consent/authority result with an access-contract version. Missing/old/malformed fields deny new AI access. An old client may continue denying teens, but must never bypass server consent requirements.
- Keep accepted birthday and pending-correction state private. Store owner-bound purpose grants, notice version, server timestamps, withdrawal and consent/authority revisions in existing private account controls. No affirmative backfill, editable metadata grants or another identity system.
- Use the same current eligibility at generation reservation, every provider-attempt reservation, final output release, persistence and protected table/RPC reads. Replace the adult-only restrictive policies deliberately; adding a permissive policy alongside a restrictive adult policy cannot enable teens safely. Do not weaken table ownership, mailbox/email-version or birthday-revision checks.
- Purpose/authority revocation and birthday/email corrections must serialize against relevant authorization operations. A response cannot be released using a captured older grant after revocation. Preserve quota/refund/request identities and the existing week/timezone contracts.
- Invalidate owner-bound AI memory/persistence on relevant revisions without deleting ordinary tracker queues, widgets, histories or Auth sessions. Old downloaded copies cannot be remotely recalled; old-client cache treatment and request drain remain release gates.

## Test-first implementation and acceptance scope

After review, write the smallest implementation plan that covers the contract together, then start with failing tests. No product code or SQL is changed by this design.

1. SQL/shared: age12 and18 boundaries, leap days/adopted timezone, unknown/pending/under12 denial, capable-teen path, authority pending/revoked path, explicit purpose/notice versions, no legacy affirmative backfill and no client metadata bypass. Preserve adult fact semantics and fail closed against old servers.
2. SQL/Edge: direct table/RPC bypass, wrong owner/session/email version, quota reservation/retry/release/save, concurrent birthday/consent/authority revocation and no provider request after denial. Fake provider only; no paid or real inference is needed for these tests.
3. Web/mobile: prior notice, unchecked specific choices, decline/withdrawal and ordinary quest access, stale owner/status/consent response rejection, missing-contract denial and unchanged signup/recovery access. Use exact ExpoSDK54/current Supabase docs before implementation.
4. Physical/browser: readable notices at large fonts, actual local mailbox/callback receiving flows, account/email/ABA isolation, preserved queued original dates and matching origin/native artifact. No ID upload or guardian-sensitive-data field exists in either client.
5. Synthetic authority rehearsal: wrong account/reference, expired/replayed reference, child-only mailbox confirmation, inconsistent declaration, disputed/revoked authority, purpose change and denied sensitive-evidence escalation. A passing rehearsal demonstrates the procedure's behavior, not independent identity or legal-capacity proof.

## Status and source record

Owner constraint: no IDs or additional sensitive verification data — adopted. Younger-user and conditional authority design — approved for implementation planning. Sensitive-tracker decline/withdrawal, final minimal-record retention and applicability/sufficiency of authority for actual processing remain release/design dependencies; approval does not manufacture evidence for a real case. Hosted AI stays paused, public release blocked, S02 INCOMPLETE, no028/S03/S04.

Official references checked October20: [Groq agreement](https://console.groq.com/docs/legal/services-agreement), [Groq AUP](https://console.groq.com/docs/legal/ai-policy), [Philippine Data Privacy Act](https://privacy.gov.ph/data-privacy-act/) and [NPC child-transparency FAQ](https://privacy.gov.ph/wp-content/uploads/2024/12/FAQs-Advisory-on-Guidelines-on-Child-Oriented-Transparency.pdf). Interpretations above are engineering proposals under the adopted assessment, not provider confirmation or legal certification. The [cutover record](2026-10-20-s02-groq-only-eligibility-review.md) and [existing notice design](2026-10-20-s02-notice-consent-design.md) retain earlier evidence and decisions.
