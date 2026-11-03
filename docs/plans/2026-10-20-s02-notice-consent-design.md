# S02 notice, consent and child-authority design — FOR REVIEW

S01 investigation is COMPLETE. S02 remains INCOMPLETE. This document develops the direction the owner selected on October 20: existing signup/Profile entry points, understandable prior notice, separate specific consent, no new under-12 registration, preserved existing histories, and conditional guardian authorization. Approval to develop this design is not approval of its unresolved authority procedure, implementation, legal certification or release. No S03/S04 change is included.

**Later October20 eligibility revision:** the owner subsequently approved the [minimal-data eligibility design](2026-10-20-s02-minimal-data-eligibility-design.md) for implementation planning after Gemini exclusion. It proposes eligible12+ debrief access rather than blanket minor denial, with applicable purpose consent/mailbox/authority checks; no routine guardian step solely for being under18. No IDs, documents or additional sensitive verification evidence may be requested. Earlier minor-denial statements below describe the previous design/current installed guards, not a veto over the approved replacement direction. The replacement is not implemented or activated; the broader sensitive-tracker decline/withdrawal branch remains open.

**Adopted existing-under12 behavior, October 20:** the owner selected “Preserve access, pause new writes”. Preserve ordinary tracker-history reading, sign-in/recovery, birthday correction and data-request access; pause new tracker writes pending contact-led review. Keep existing AI denial and preserve stored histories. This settles that product choice, not the remaining guardian-authority procedure or a claim that the control is already implemented.

**Subsequent implementation status:** after “proceed”, the bounded server portion was implemented locally in049 and tested with47 focused plus10 concurrency assertions, with980 assertions across the full local SQL suite. The owner subsequently adopted explicit Retry/original dates, and the mobile queue implementation below now has source-level checks. This does not approve or implement the broader notice/consent/guardian design. Client signup preflight, complete notices/disabled controls, widget handling and matching-build physical under12 acceptance remain open. See the [continuation checkpoint](2026-10-20-s02-continuation.md#adopted-under12-server-boundary--subsequent-october20-work) for exact changes, regression repairs and limitations.

## Intended outcome

People can understand what Eiyu needs for tracking, what birthday screening does, and what optional AI sends elsewhere before agreeing. General Terms acceptance, a birthday declaration and mailbox proof each retain their separate meaning. None establishes guardian authority. Preserve trusted initial/corrected declarations and all existing account/quest/completion/summary history.

Use ordinary necessary account/tracker processing under the owner's adopted section 12(b) direction. Treat age and sensitive information under the adopted specific prior-consent direction, with appropriate authority when the person cannot consent for themselves. This is an engineering design under the adopted assessment, not an assertion that every child has or lacks capacity at a particular birthday.

## Existing screens and proposed copy

Keep the existing legal dialogs, signup form, Profile editor and debrief panel. Use shared copy and validation on web and mobile. Keep font scaling, scrolling, keyboard access and selectable notice text. Do not fit extra copy by shrinking or hiding it.

Before birthday submission, show:

> Eiyu saves your email, profile, quests and progress with Supabase to run your tracker. Your quest text can reveal private things about you. We use your birthday to check age limits and AI access. Email checks only check your mailbox. They do not check your age or a guardian's permission. You can ask about your information at privacy@eiyusystem.app. Read the Privacy Policy for details.

Keep Terms acceptance separate from these purposes. No prechecked controls or acceptance inferred from navigation. Proposed specific choices:

- Birthday: “I agree to Eiyu using my birthday and age status to check feature access and handle my birthday corrections.” Place the notice/choice before submission; do not send the birthday to Auth first and ask afterward.
- Sensitive tracker information: “If I put sensitive information about myself in my quests, I agree to Eiyu storing and using it to provide my tracker and sync my progress. I will not include other people's private information.” Explain that ordinary quests need not contain sensitive information. Declining must not be described as loss of all ordinary tracking rights.
- Optional AI, in the existing debrief panel: “I agree to Eiyu sending my quest and activity information, including sensitive information I chose to include, to Groq to make and save AI reviews.” Explain the current automatic Status/Weekly trigger immediately beside this control. Declining leaves ordinary quests available; never send a first prompt before consent.

AI copy describes only the intended strict Groq release and cannot be published while hosted v24 still permits other recipients. Do not imply training permission: the adopted route grants none. Dedicated birthday, email, OTP and credentials stay excluded from prompts. The S04 manual Generate/two-total-week behavior remains deferred.

## Age and authority behavior

| State | Proposed behavior |
| --- | --- |
| New declared under 12 | Explain that new Eiyu accounts are for ages 12+. Do not call signup or create profile/quest/age/consent rows. Enforce this server-side too; bypassing the UI must not create an account. Do not retain a rejected birthday or send a rejection email. |
| Existing declared under 12 | Adopted: preserve ordinary tracker-history reading, sign-in/recovery, birthday correction and data-request access, while pausing new tracker writes pending contact-led review. Keep AI denied and preserve stored histories. Do not silently delete data or automatically claim all continued processing has consent. |
| Unknown legacy birthday | Do not invent a declaration or consent from old Terms acceptance. Existing mailbox-independent quest access remains. Present the notice before an explicit Profile birthday save; AI remains denied while unknown. |
| Declared age 12–17, able to provide applicable consent | Child-oriented notice, recorded specific choice and ordinary tracker access; AI remains denied. Capacity/authority is a reviewed operating determination, not an app checkbox saying “I am allowed.” |
| Declared age 12–17, own consent insufficient or authority unresolved | Require the reviewed guardian-authority procedure before collecting/using information that relies on that authorization. No AI. A child-entered guardian email, same-mailbox OTP, checked box or adult birthday does not approve authority. Do not label this branch implemented until a genuine procedure and rehearsal exist. |
| Declared adult | Specific recorded choices plus existing age/mailbox/revision checks. AI consent does not bypass mailbox proof. |
| Correction or withdrawal | Trust valid owner birthday corrections under the existing contract. Invalidate relevant in-flight authorization and caches; never treat correcting to adult as consent. Withdrawal stops future processing that relies on that consent without silently destroying history or promising immediate backup erasure. |

The authority condition needs a concrete operating rule before coding. Recommended conservative interim handling is contact-led review through the existing address, with no automatic minor self-approval and no ID/selfie upload or paid verification service. Record only the purpose, responsible review outcome and minimal authority reference needed to justify it; do not collect full documents by default. The owner must review what evidence is sufficient, how it binds to the correct child account/enrollment, and who can record/revoke it. A manual process is not working merely because a contact address exists.

### Existing-under12 write-pause contract

Apply the adopted pause at both UI and authoritative server boundaries. It covers creating/editing/completing/undoing/archiving/restoring tracker content, including quest and workout writes, bulk RPCs, offline replay and widget actions. Reading ordinary tracker history remains available. Existing age/mailbox restrictions on saved AI content still apply; “preserve access” does not grant under12 AI access. Keep sign-out, recovery, birthday correction and verified access/export/deletion requests available as separate account/privacy operations.

Retain queued tracker writes without submitting them while the pause applies; do not discard them or silently replay them under a later owner or stale authorization. Explain the pause in the existing screens and offer the existing Profile/contact paths. A failed or denied write must leave stored progress unchanged. **Adopted October20:** after access returns, require explicit Retry and keep original account dates. Actions whose original account day has passed stay unsent; never move them to today. Preserve uncertain outcomes for reconciliation before any retry; a paused action is not proof its earlier request never committed.

Trust valid birthday corrections and recompute the age restriction under the existing declaration contract. Do not add independent birthday-correction approval or make contact-led review a hidden veto over accepted corrections. Guardian authority and purpose-specific consent remain separate applicable checks. A guardian record does not make an under12 declaration meet the intended age12 admission rule, and cannot grant minor AI access.

## Proposed server contract

Extend existing private account controls; do not create another identity system. Consent records are owner-bound, purpose-specific, notice-versioned and timestamped by the server. Record grant/withdrawal and a revision, plus a separate authority state where required. Preserve a minimal audit history under a reviewed retention rule; do not store quest text, DOB copies, codes or documents in consent events. Never backfill affirmative consent for existing users.

Enforce the applicable purpose/authority at direct server entry points, including AI reservation/retry/final output checks. A missing or withdrawn AI consent must deny before provider traffic, and a change in consent revision must prevent release of old output. Preserve existing birthday/mailbox revisions and quota/refund contracts rather than replacing them. Existing clients lacking the consent contract cannot bypass it.

Minimize initial birthday metadata without making signup nonatomic: investigate changing the existing Auth insert capture to consume and remove the birthday field before the Auth row/session is returned, with SQL tests covering trigger ordering and real Auth signup. A later metadata cleanup alone cannot undo a birthday already placed in the first session. Do not assume a BEFORE trigger can safely replace the current AFTER trigger without testing profile triggers and Auth compatibility. Later editable Auth metadata never authorizes age or consent. This proposal is not implemented.

Ordinary tracker content is free text; a UI instruction cannot prove it contains no sensitive information. Before enforcing consent on tracker writes, review the declined/withdrawn branch and existing history access so the implementation neither invents consent nor silently blocks ordinary mailbox-independent quests. This is an explicit design gate.

## Alternatives considered

1. Generic signup checkbox only: small, but does not separate purposes, establish prior specific consent or prove authority. Reject.
2. Separate account/paid identity service: substantially more collection and scope; not adopted.
3. Extend existing screens and private controls with a rehearsed conditional authority process: recommended. Costs additional server/client acceptance, while keeping existing identities and histories.

## Tests to write before implementation

- No Auth request on missing birthday consent or declared under-12 signup; direct Auth bypass rejects atomically without child/profile rows. Include birthday boundaries, leap days, invalid/future dates and client/server date parity.
- No automatic inference on Status/Weekly before the separate AI grant; decline/withdrawal leaves quests available. Direct RPC/Edge bypass, stale claims and old clients cannot grant consent.
- Old-account generic acceptance does not create consent. Wrong owner, stale notice/revision, replay, failed write and owner switch preserve the correct user's choices/history and deny stale responses.
- Minor/unknown/pending age denial remains independent of consent. An authority-pending or revoked record cannot be approved by child-editable metadata or mailbox proof. Guardian approval never enables minor AI.
- Existing under12 accounts can read ordinary history, recover, correct their declaration and request their data, but tracker writes fail through UI, direct table access, RPCs, bulk operations, offline replay and widget paths. Denials preserve histories and queued entries; owner/revision changes cannot replay another account's writes. Valid birthday corrections recompute the pause without an independent correction-review gate. Test actual birthday boundaries in the adopted civil timezone.
- Consuming initial metadata does not duplicate DOB into returned/stored Auth sessions, break existing signup/profile triggers or accept later metadata edits as age changes.
- Withdrawal, correction and account/email switches invalidate in-flight grants and cached AI without altering quest/completion/summary rows or quota semantics. Test races before and after provider response.
- Actual phone/browser notice reading, scrolling, text scaling, keyboard and accessible unchecked choices; matching native policy/build parity. Rehearse the chosen authority procedure with synthetic records only.

## Review needed before an implementation plan

Existing under12 review access/write-pause behavior and explicit Retry/original dates are adopted above; do not ask for those choices again. Resolve the concrete guardian-authority evidence/process and the declined/withdrawn sensitive-tracker branch. Review the copy and private consent-revision contract together. Then write a test-first implementation plan for that broader design and execute within S02 only. No deployment, publishing, provider contact or spend is authorized by this design.

Current official references consulted October 20: [Data Privacy Act](https://privacy.gov.ph/data-privacy-act/), [NPC child-transparency FAQ](https://privacy.gov.ph/wp-content/uploads/2024/12/FAQs-Advisory-on-Guidelines-on-Child-Oriented-Transparency.pdf), and [Supabase database functions](https://supabase.com/docs/guides/database/functions). The FAQ does not establish a universal digital-consent age or mandatory tool. The conditional operating design above is an engineering proposal under the adopted assessment.
