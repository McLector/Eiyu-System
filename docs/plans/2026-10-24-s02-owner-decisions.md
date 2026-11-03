# S02 owner decisions - one sitting

Date: 2026-10-24. Status: S01 COMPLETE, S02 INCOMPLETE, public release BLOCKED. No 028, S03 or S04.

This page lists the product, legal and operating decisions that only you can make, and that the engineering work cannot guess. Each has a plain question, what the project documents already say, 2 to 4 options, a recommendation and what the engineering team does under each answer. Nothing here is legal advice; where a decision touches the law (Data Privacy Act, NPC Circular 2023-04 on consent), a short check by a Philippine privacy lawyer or the NPC guidance is a sensible extra step, but it is not required to answer.

Nothing in this document authorizes deployment, publishing, spending or provider contact. Answering it unblocks writing and testing code and copy locally.

## Already decided (not asked again)

- Specific, separate notices for age and for AI. No blanket consent.
- Conditional 12+ eligibility: ages 12 and up may use the app and AI, subject to the checks below. Under 12 is paused.
- Eiyu never asks for IDs, selfies or documents.
- No blanket guardian requirement for teens. A guardian is only involved when a reviewed case says own consent is not enough.
- Under-12 declarations pause all new tracker writes, and no permission overrides that.
- Mailbox (email) proof does not gate basic tracking. It is needed for AI only.
- AI is Groq only (zero data retention, no training), with no Gemini fallback.
- Neutral "basic" quests plus separate optional custom-tracker and fitness-tracking permissions (design approved for planning on 2026-10-23).
- The 7-day and 30-day request targets are targets, not promises of erasure everywhere. The 7-day execution-metadata period does not decide how long authority or support records are kept.

## What the decisions block

- Closure ledger gate 1 (processing and operating contract): decisions 1 to 7, 9, 11.
- Gate 4 (data-request response and residual copies): decisions 5, 6, 8, 13.
- Gate 5 (old clients, origin and release facts): decisions 10, 12.
- Gate 3 (acceptance batch needs final notice copy): decision 9.

## How to answer

Reply once with the answer sheet at the end (for example "1B, 2A, 3A..."). Where an option says "you choose N", write the number. Anything you skip stays "pending" and the safe default in each decision's recommendation applies in code (deny or pause, never allow).

---

## Decision 1. How do we decide whether a young user's own consent is enough, or a guardian is needed?

**Question.** When someone declared as 12 to 17 wants an optional purpose (AI, custom tracker, fitness), who decides whether their own consent is valid, or whether a parent or guardian must also agree? And what do they look at, given we never collect IDs or sensitive evidence?

**Blocks.** Gate 1. The software can already store a decision, bind it to an age revision and a purpose, and deny when it is pending, but a program cannot make the judgment. The rehearsal document says explicitly that automation cannot supply it, and synthetic tests cannot manufacture a real determination.

**What the documents say.**
- A teen does not need a guardian merely because of age. The operator must justify the arrangement used.
- Confirming two contact endpoints proves only that someone controls those mailboxes. It does not prove parental responsibility. Neither does an adult declaration, a reply or a linked email.
- Unknown cases stay pending. Pending means no AI or protected processing for that purpose, while ordinary quests, history, recovery and data requests keep working.

**Options.**
- **A. Default own consent for 12 to 17, review only on a flag.** Teens' own consent is accepted for all optional purposes. You review only if someone reports a problem, if a contact says the teen should not be using it, or if you spot something inconsistent. Fewest steps and least data, but means you are accepting the legal risk that own consent is valid for this age band for sensitive tracker and AI content. A written reasoning note from you (or counsel) is still needed.
- **B. Case-by-case review for 12 to 15, own consent for 16 to 17.** A cutoff, with a short written rationale. Adds a review queue for younger teens. The cutoff is your choice and should be backed by your own reading of the guidance; I am not stating a legal threshold.
- **C. Case-by-case review for every 12 to 17 user, for the sensitive purposes only (AI, custom, fitness).** Most cautious. Ordinary basic tracking stays open. Cost: every teen who opts in waits on you, and you need a repeatable procedure.
- **D. No teen can use the sensitive purposes at all until a guardian route is built.** Out of line with the adopted "no blanket teen guardianship" decision, so listed only to rule out.

**What the reviewer looks at (applies to A, B, C).** Only: the declared age status, the purpose asked for, what the person themselves wrote in the optional request, and whether the contact information is consistent. Never IDs, selfies, documents or the contents of their quests. If it is not clear, the answer is "pending", never "approved by default".

**Recommendation.** C for the first release (small user base, 11 Auth accounts today, most cautious, consistent with "unknown stays pending"), written down as a one-paragraph procedure with you as sole reviewer, and revisited after launch. If you prefer less friction, B is acceptable once you have recorded your reasoning for the cutoff. Avoid A unless you have taken advice, because it quietly classifies every teen.

**Engineering under each answer.**
- A: seed own-consent as the default disposition for 12 to 17, keep the flag/revocation path, show pending whenever a flag is raised. Tests: flagged account goes pending, other accounts unaffected.
- B: add the age-band rule to the authority function (server-side, tested at the boundary dates, birthday corrections change the result), pending for the review band.
- C: no code change beyond the existing pending state; adds a short "this permission needs review" screen (copy already exists) and the review runbook.
- If you do not answer: behaves as C.

---

## Decision 2. How long is a contact or review reference valid, and what stops it being reused?

**Question.** When a user or guardian is asked to confirm a contact, a short-lived reference is used. How long should it last, how many tries are allowed, and what happens if it is used twice or by the wrong account?

**Blocks.** Gate 1 (contact/reference expiry and replay). The tests show that expired, replayed or wrong-account references must be refused, but the actual time limit is an operating value that has not been chosen.

**What the documents say.** An expired or replayed reference confers no access or authority. The reference belongs to one account and one revision. Changed birthday declaration or changed purpose invalidates it. No duration has been set; I am not inventing one.

**Options (you choose the number).**
- **A. Short.** Valid for one sitting; for example, a few hours (you choose N hours). One use only. Lowest replay risk, more re-sends.
- **B. Days.** Valid a few days (you choose N days), one use only. Easier for a guardian who checks email rarely.
- **C. Open until used.** Not recommended (a stolen or forwarded link works indefinitely).

All options: one use, bound to one account, one purpose and one revision; a new request cancels the old one; a small cap on re-sends per day (you choose); no reference text is stored in logs.

**Recommendation.** B with a short window of days (your N), single use, replaced by a new request. Guardians and teens do not check mail instantly, and the reference confers no authority until you also record a decision, so the extra days add little risk.

**Engineering.** The chosen N becomes a constant checked on the server, with tests at N minus one second, N and N plus one second, and replay, wrong-account and changed-revision cases. If you do not answer: engineering keeps the references unusable (deny) and cannot rehearse the matrix end to end.

---

## Decision 3. How are disputes and revocations handled?

**Question.** If someone says "this consent was not valid" or "I withdraw my approval" (a teen, a parent, or a stranger claiming to be one), what do we do, in what order, and how fast?

**Blocks.** Gate 1.

**What the documents say.** Reported dispute or revocation raises the authority revision, denies affected generation, reading of derived output and protected writes until resolved, and keeps history, recovery, birthday correction and data-request access. No escalation to sensitive evidence.

**Options.**
- **A. Pause first, decide later.** Any credible report pauses the affected purpose immediately; you then decide and record the outcome. Protects the user, but a false report can pause someone else's account. Resolution target is yours (you choose N days).
- **B. Pause only on a report from the account's own mailbox or a confirmed contact.** Fewer false pauses, but a stranger or a worried parent without a confirmed contact has no way in, so their report waits.
- **C. Pause on any report, but only after one check-back to the account's own mailbox.** In between, a short delay (you choose N hours).

In all options: no one is asked for IDs or documents; unresolved disputes remain paused; the user can always still export and request deletion; the result is a two-line record (account reference, what changed, time, your decision).

**Recommendation.** A. It matches the existing "deny when unresolved" design and the rule that an uncertain case stays pending. State a resolution target you can keep (for example inside the 30-day request target).

**Engineering.** A: the revoke operation already exists, add the runbook and the status copy. B and C: add a "report source" field and the check-back step; more tests. No answer: behaves as A.

---

## Decision 4. Who may run the trusted record operation, and how is it kept honest?

**Question.** Recording an authority decision uses a server-only operation that cannot be called from the app. Who is allowed to run it, from where, and what is written down?

**Blocks.** Gate 1 (trusted operator access). The code exists but there is no operating rule about its use.

**Options.**
- **A. Only you, from your own machine, using the database SQL editor or the project's secure access. Each use writes the minimal record already designed (account reference, purpose, revisions, decision, time).** Simplest.
- **B. A second named person holds access as a backup.** More resilience, more people with access to private data; they also need the same procedure and a written trust basis.
- **C. A small admin screen in the app.** More convenience, but it is new software, a new attack surface and a new thing to test. Not recommended now.

**Recommendation.** A for now. Keep the use of the service key out of chat, files and tickets; run it only for a recorded case; do not paste quest text or correspondence into the record.

**Engineering.** A: write the runbook (steps, what to record, what never to record), no code. B: same plus an access note. C: out of scope for S02.

---

## Decision 5. How long do we keep records after someone fully withdraws custom-tracker and/or fitness consent?

**Question.** If a person withdraws the only permission that covers their custom quests or Gym records, the app stops new collection and makes those records read-only. But the records still exist. How long do they stay, and what happens at the end?

**Blocks.** Gate 1 and gate 4. The design states that keeping them indefinitely is not automatically acceptable; the operator must record the actual basis, scope and period before the branch closes for release. A read-only flag is not erasure. I have not picked a number.

**What the documents say.**
- History is preserved during development and nothing is deleted by this work.
- NPC Circular 2023-04 ties continued retention after withdrawal to another applicable basis and reasonable retention.
- The adopted request targets (7 and 30 days) are for requests, not a retention rule.
- Held queue entries on a device are themselves retained copies, and old offline copies cannot be recalled.

**Options.**
- **A. Keep read-only until the user asks for deletion.** The user can still see and export their own history. Simple. Weakest on "reasonable retention" if the person withdrew and asked for nothing else.
- **B. Keep read-only for a fixed period after full withdrawal (you choose N days or months), then remove them through the authorized removal process.** Gives the user time to export or change their mind. Needs a reminder before removal and a removal procedure that does not touch other data.
- **C. Remove promptly after full withdrawal unless the user opts to keep (you choose a short grace N).** Most protective, but destroys history that the product principle says to preserve, and the removal process is not yet authorized.
- **D. Hide from the user but keep for the operator.** Not recommended: keeping data the person cannot see and did not agree to is the weakest position.

Whatever you pick, state the basis in one sentence (for example "we keep read-only history so you can export it, for N days, then we remove it"), and say whether the consent evidence rows themselves (purpose, notice version, decision, time; no titles or content) are kept longer for accountability. Consent evidence holds no quest text.

**Recommendation.** B, with a period you choose that is long enough for a person to export and decide (your N), a clear notice in Profile at withdrawal time, and a reminder before removal. Keep the minimal consent-evidence rows for a separately stated, longer accountability period (you choose M; they hold no content). Held offline queue entries: expire them with the same period.

**Engineering.**
- A: no code; wording says "we keep it until you ask us to delete it".
- B: build nothing now beyond the read-only state and a documented removal runbook; scheduling automation only when you authorize it. Notice and Profile copy use N.
- C: needs an authorized removal operation first (not in scope; would be a new slice).
- If you do not answer: the app keeps records read-only, claims nothing about a period, and release stays blocked on this gate.

---

## Decision 6. How long do we keep authority and support records?

**Question.** For authority decisions, contact references, dispute notes and support correspondence, how long is each kept and then removed?

**Blocks.** Gate 1 and gate 4. The seven-day execution metadata period does not apply to these, and no other duration exists.

**What the documents say.** The minimal record is: account reference, notice/purpose/revisions, minimal contact reference, declared authority basis, reviewer decision and time, revocation state. No raw correspondence, attachments, quest text or duplicate birthdays go in consent events.

**Options (you choose the numbers).**
- **A. Tied to the account.** Kept while the account exists and removed with the account (with a short tail, you choose N, for disputes). Simple and least data.
- **B. Fixed from last activity.** Kept a fixed time after the decision or last change (you choose N months), regardless of the account. Gives a longer accountability trail, but keeps data about a person after they leave.
- **C. Split.** The decision record follows A or B; support correspondence (mail you receive) is deleted sooner (you choose N), because the decision record is the part you need later.

**Recommendation.** C: decision record kept while the account exists plus a short tail for disputes (your N), correspondence deleted soon after the case is closed (your shorter N). Keeps the least personal data that still lets you show what you decided and why.

**Engineering.** Documents the numbers in the runbook and disclosure; no scheduled deletion code unless you ask for it (manual removal on a calendar reminder is the default). No answer: keep nothing beyond the minimal record and mark the gate open.

---

## Decision 7. What do we do when someone sends an ID, selfie or document anyway?

**Question.** We never ask for these, but people may attach them to support mail. What is the rule?

**Blocks.** Gate 1. The rehearsal says actual support-mail attachment handling and retention are unproved.

**Options.**
- **A. Do not open, use or copy it. Reply once that we do not need it and ask them not to send more. Delete the message and attachment as soon as practical (you choose N days), keeping only a one-line note (date, "unsolicited attachment, not used").** Most protective and matches "no IDs".
- **B. Same as A, but keep the message until the case is closed in case of a dispute.** Slightly more evidence, more sensitive data held.
- **C. Open it to confirm who sent it.** Contradicts the adopted rule. Not recommended.

In all options: attachments are never copied into account, consent or test records and never forwarded.

**Recommendation.** A.

**Engineering.** Adds a standard reply text and a runbook line; the in-app "Do not send IDs" wording is already in the review notice. No code beyond that.

---

## Decision 8. What exactly do we say when someone asks for their data or deletion?

**Question.** Approve the wording for the response to an export or deletion request, so it tells the truth about what is and is not removed.

**Blocks.** Gate 4. The retention evidence is a candidate disclosure, not published copy.

**What the documents say.** The email provider keeps delivery records separately for its own period; the hosting provider keeps backups and logs for periods that depend on the plan and settings (actual settings still unknown, see decision 12); delivered mail and user exports cannot be recalled; old offline apps hold copies we cannot reach; the AI provider's zero-retention setting covers inference content, not every usage record or the reviews we save. The numbers 7 and 30 days stay targets. Do not put provider windows into promises until their applicability is recorded.

**Draft response (edit freely).**

> Thanks for your request. We checked it is from your account. This is what we did and what you should know.
>
> Active records: we have [exported / removed] your account, profile, quests, progress and saved AI reviews from Eiyu's live database. We aim to acknowledge requests within 7 days and finish within 30 days.
> Backups and logs: our hosting and email services may keep backups and operating records for a limited time under their own rules. These are not used for your account and are overwritten or expire on their schedule. We cannot promise a date for each.
> Email already sent: a verification or recovery email we delivered stays in your inbox. We cannot recall it, and the email service keeps its own delivery record for a while.
> Your own copies: files you exported and anything stored on your phone, browser or an old app version are not under our control. Sign out and remove the app if you want them gone from your device.
> AI: our AI provider does not keep the text we send for training. We do not control any separate usage record it keeps, and we cannot remove reviews already shown to you elsewhere.
> If anything here is wrong, or you want something corrected, reply to this message. We will never ask for your password, a code or an ID.

**Options.**
- **A. Approve as drafted** (with the tense chosen per request type).
- **B. Shorter version** without the sections, one paragraph.
- **C. You edit it** (send your changes).

**Recommendation.** A. It names each place a copy can remain, which is exactly what gate 4 requires, and it promises only the already adopted targets.

**Engineering.** Puts the text in the support runbook and, in a compact form, in the Privacy Policy "Your control" section (see decision 13). No promises of immediate or universal erasure.

---

## Decision 9. Final wording of the two new notices

**Question.** Approve (or edit) the notice text for `2026-10-23-custom-tracker-v1` (custom quests and chains) and `2026-10-23-fitness-tracking-v1` (Gym). Each has an adult version and a child-oriented 12 to 17 explanation. These follow the structure of the age and AI notices: a one-line checkbox label, a short body, and a plain child-layer.

**Blocks.** Gate 1 and gate 3 (readable notices on the exact candidate). Notices can be changed later only with a new version, which asks everyone again, so it is best to settle them now.

**Pattern to match.** Label starts "I agree to Eiyu...", body names the data, the purpose, where it is stored, what happens if you say no or withdraw, and your rights. The contact line uses the same privacy contact already shown in the app and Privacy Policy (engineering inserts it).

### Custom tracker, adult version

- **Label:** I agree to Eiyu saving and using my custom quest and chain names, descriptions and progress to run my tracker. What I add may include sensitive information.
- **Body:** When you create or edit a custom quest or chain, Eiyu saves what you write (names, descriptions, easy versions, stage text) and your progress with Supabase, so your tracker works across your devices. Quests can be private, so only add what you are comfortable having saved. This does not give permission for AI reviews; that is a separate choice. If you say no, you can still use basic quests with standard names and keep your saved history. If you turn this off later, new custom quests and progress on custom quests stop; your saved custom history stays and becomes read-only, and you can export it or ask for deletion. Turning this off in Profile takes effect when the app confirms it. You can ask to see, correct, export or delete your information at the contact in Profile or the Privacy Policy. We do not ask for IDs, selfies or documents.

### Custom tracker, child-oriented (12 to 17)

> You can make your own quests with your own names. If you do, Eiyu saves what you write and your progress, so you can use it on all your devices. Quests can include private things, so only add what you want saved. Saying yes here does not turn on AI. If you say no, you can still use the simple quests with standard names, and your old progress stays. You can turn this off in Profile whenever you want. Your old custom quests will stay on your account to look at, but you can't add to them. You can also ask us to delete them. Questions? Use the contact in Profile. We never ask for IDs, selfies or documents. If your family needs to look at this, we may ask who you are so we can check it.

(Remove the final sentence if you pick decision 1 option A.)

### Fitness tracking, adult version

- **Label:** I agree to Eiyu saving and using my fitness routines, exercise details, weights and workout progress to run Gym. These records may reveal sensitive information.
- **Body:** Gym saves your routines, exercises, sets, weights, workout sessions and, only if you choose, exercise media you attach, with Supabase. It uses them to show your plan and progress. Fitness records can reveal health information, so only add what you want saved; you do not have to attach media to use Gym. This does not give permission for AI reviews. If you say no, Gym stays closed for new records, and your ordinary quests and history are unaffected. If you turn this off later, new routines, workouts and uploads stop; your saved Gym history stays read-only and you can export it or ask for deletion. You can turn this off in Profile and the app confirms when it has taken effect. Pictures or video you uploaded earlier may remain in storage until removed. You can ask to see, correct, export or delete your information at the contact in Profile or the Privacy Policy. We do not ask for IDs, selfies or documents.

### Fitness tracking, child-oriented (12 to 17)

> Gym saves your workouts, weights and the exercises you choose, plus any photos or videos you decide to add. This is so you can see your progress. Fitness details can be private, so only add what you are happy to have saved. Saying yes does not turn on AI. If you say no, you can still do your ordinary quests and keep your history. You can turn Gym off in Profile whenever you want. Your old workouts will stay to look at but you can't add new ones, and you can ask us to delete them. Questions? Use the contact in Profile. We never ask for IDs, selfies or documents.

**Options.**
- **A. Approve all four texts as drafted.**
- **B. Approve with your edits** (send replacement text or the sentence to change).
- **C. Merge custom and fitness into one notice.** Not recommended: the design deliberately separates them so declining one does not force the other.

**Recommendation.** A. Two sentences to confirm in particular: (1) "your old custom or Gym history stays read-only" is only true if you adopt a retention answer in decision 5; if you pick a fixed period, add "for [N]" to the body. (2) The child text offers a way for a family to ask; delete it if you choose decision 1 option A.

**Engineering.** Puts the text into the shared notice source next to the existing age and AI notices, with the two version strings, adds tests that each notice names the data, purpose, decline and withdrawal result, storage and rights, and shows the child layer in the editor. Any later change needs a new version.

---

## Decision 10. What happens to people on old app builds once enforcement is live?

**Question.** Old builds cannot show the new notices, so they cannot collect valid consent. What do those users see, and how long do we wait before the server refuses them?

**Blocks.** Gate 5 (old-client disposition). Today the live project has none of the new controls applied and 11 Auth accounts, so the group is small and you can reach them directly.

**What the documents say.** The server is the authority: direct writes and old-client paths must be refused for protected purposes, and an offline client cannot know of a remote withdrawal. Cached grants and queued actions on old binaries are not proof of permission. Old copies on devices cannot be recalled. Old-client disposition is a release gate.

**Options.**
- **A. Refuse protected writes from old builds the moment enforcement is live; show "update to continue".** Old builds can still sign in, read history, export and request deletion. Cleanest. Old users lose the ability to log progress on legacy quests until they update and grant consent.
- **B. A grace period (you choose N days) with a one-time notice to the people involved, then A.** Gentler; during the grace period the old builds keep writing without valid consent, which weakens the position.
- **C. Block old builds from everything with a minimum-version gate.** Strongest, but locks people out of export and deletion, which we should preserve.
- **D. Do nothing.** Not acceptable, since the server would refuse writes with no explanation.

**Recommendation.** A, with a direct message to the 11 existing accounts before activation (outside the app; you send it). No grace period, because the grace period is the time when consent is missing.

**Engineering.** A: the server already refuses; add the "update to continue" message mapping in the shared error handling, plus tests that read/export/delete still work. B: add a dated constant. C: new version gate, more scope. Held offline queues from old builds are not replayed with new dates (existing original-date rule).

---

## Decision 11. Confirm the usability cost of declining

**Question.** The design approved for planning says that without the custom-tracker permission people cannot name quests or keep logging progress on their existing custom quests. Is that acceptable for release?

**Blocks.** Gate 1 and acceptance. The ledger notes that approval to develop the branch is not acceptance of these concrete usability choices.

**What the documents say.**
- Every existing quest with free text is protected, even generic names. Titles are never scanned to relabel them as basic.
- Declining leaves basic quests with fixed server names ("Quest 1"...), existing schedule/difficulty/target controls, and all history readable.
- Existing history is not renamed, copied or migrated to new basic quests, so there is no way to carry existing progress over without granting.

**Options.**
- **A. Accept as designed.** Declining means: new neutral quests only; old custom quests are read-only until the user grants.
- **B. Let people keep logging progress on existing custom quests without a grant, since the data is already there.** Does not fit the design (a completion adds information to a protected quest) and needs a separate accepted risk.
- **C. Require the grant at signup for everyone.** Conflicts with adopted decisions (no prechecked or bundled consent, no optional checkboxes at registration).

**Recommendation.** A.

**Engineering.** A: proceed as planned. B: reopens enforcement design (re-plan; not recommended). C: not buildable under the adopted rules.

---

## Decision 12. Release facts only you hold

**Question.** Confirm, or supply, the facts below. Anything you cannot confirm stays "UNKNOWN" in the release record and keeps the gate open; I will not guess them.

1. **Launch web origin.** The documented option reachable today is the existing hosted Vercel address; the other custom address was unreachable from our checks. Which one do you intend to ship? (Affects allowed origins, redirect lists and email links.)
2. **Hosting plan and backups.** The actual Supabase plan and its backup retention for the project, and whether any exports of the database are kept by you.
3. **Email provider settings.** The actual log retention for your plan, and whether any optional AI editing or support features are on.
4. **Store disclosures.** Whether the Play Store (and any other store) data-safety and privacy forms will be filled from the final notices.
5. **Which builds are the release builds.** App ids, versions and whether you ship an over-the-air update, a new APK or both.

**Options per item:** A. You supply it now. B. You will supply it before release (gate stays open). C. Not applicable (say why).

**Recommendation.** A where you know it, B otherwise. Nothing about these needs a guess.

**Engineering.** Records each fact in the release record (no secrets, no keys), removes UNKNOWN markers, and keeps CORS and redirects restricted to what you name.

---

## Decision 13. Approve the privacy-policy additions

**Question.** Publish, in the Privacy Policy, (a) a short section for the two new purposes and (b) the vendor-retention paragraph from the retention evidence, with the request-response wording in decision 8 reflected in "Your control"?

**Blocks.** Gate 4. The candidate paragraph exists but is not yet published, and it is not a working service until the support procedure in decisions 1 to 8 exists.

**Candidate paragraph (from the retention evidence, edited).**

> We keep your account and progress while your account is active, subject to a verified removal request and applicable exceptions. Email delivery services keep message and delivery records separately from the short life of a verification code. Deleting your Eiyu account does not recall delivered messages, your exports or copies held by old offline apps. Backups and operational records can remain for their applicable retention periods. Our AI provider's zero-data-retention control applies to inference content, not every usage record or the AI reviews Eiyu saves.

**Options.**
- **A. Publish the paragraph and the new-purpose section together, once decisions 5, 6, 8 are answered.** Recommended.
- **B. Publish the paragraph now, new-purpose section with the release.** The paragraph is true today; the new purposes are not live yet.
- **C. Hold both until you have confirmed decision 12 facts.** Safest on accuracy, delays disclosure.

**Recommendation.** A. The text uses no provider numbers; add them only when decision 12 facts are recorded.

**Engineering.** Edits the Privacy Policy source, with tests on the sections, after your answer. Nothing is published by this step; publishing needs your release authorization.

---

## Answer sheet

Reply with one line per decision. "N" means a number you choose; "text" means your replacement wording.

| # | Decision | Options | My recommendation |
| --- | --- | --- | --- |
| 1 | Own consent vs guardian review for 12 to 17 | A default own consent / B review 12-15 only (cutoff = __) / C review all teens for sensitive purposes / D rule out | C |
| 2 | Reference expiry and replay | A hours (N) / B days (N) / C open | B, N = __ days |
| 3 | Disputes and revocation | A pause first / B pause on confirmed-contact report / C pause after check-back (N hours) | A, resolve within __ days |
| 4 | Trusted operator access | A you only / B you plus a named backup / C admin screen | A |
| 5 | Retention after full withdrawal | A until deletion request / B fixed period N then remove / C prompt removal / D hide only | B, N = __; consent-evidence period M = __ |
| 6 | Authority and support record retention | A with the account (+ tail N) / B fixed N months / C split | C, tail N = __, correspondence N = __ |
| 7 | Volunteered attachments | A do not use, delete in N days / B keep to case close / C open it | A, N = __ |
| 8 | Data-request response wording | A as drafted / B shorter / C edit (text) | A |
| 9 | New notice wording (4 texts) | A approve / B approve with edits (text) / C merge | A |
| 10 | Old app builds | A refuse at activation / B grace N days / C min-version gate / D nothing | A |
| 11 | Usability cost of declining | A accept / B allow logging / C require at signup | A |
| 12 | Release facts | per item 1 to 5: A now / B before release / C n/a, with values | supply what you know |
| 13 | Privacy-policy additions | A both after 5, 6, 8 / B paragraph now / C hold | A |

Example reply: "1C, 2B N=3 days, 3A resolve within 14 days, 4A, 5B N=__, M=__, 6C, 7A N=7, 8A, 9A, 10A, 11A, 12 (see list), 13A".

If you skip a number, code keeps the safe default (deny or pending) and the matching gate stays open.

## Added 2026-10-24 (after the independent review and the font gate)

## Decision 14. What should a regrant do to streaks for the paused days?

**Why it matters.** When someone withdraws custom-tracker permission, their custom quests are paused. The server no longer prepares days for them, so the user can't complete them. If they later grant permission again, the next preparation fills in every scheduled day from the pause, and the recovery rules count those days as missed. Streaks reset, which punishes days the user was blocked from completing. (Review finding M2; `055`, preparation step.)

**Options:**

- **A.** Treat paused days as not scheduled: no occurrences, no misses, and the streak continues from where it stopped. Engineering records the pause interval, the same way archive intervals already work, and skips it.
- **B.** Fill the paused days in as missed (today's behaviour). Simple, but it penalises users.
- **C.** Fill them in but never count them toward missed days or recovery. A middle ground, more complex.

**My recommendation: A.** It matches how archiving already pauses a quest, and it is the least surprising for the user.

## Decision 15. Font scaling repair

**Why it matters.** Gate 2 needs one product repair for text that stays clipped after the system font size changes. The only approach the evidence supports is a tiny text-spacing nudge after a font-scale change. It worked in the spikes only together with one native setting, `fontScale` in the Android activity's `configChanges`, and that setting is not in the app today. The app also uses plain `Text` in about 66 files, so the nudge would need a single shared helper. The font agent's analysis is in `docs/plans/2026-10-24-s02-font-gate-handoff.md`.

**Options:**

- **A.** Adopt both: the native `fontScale` setting, added through an Expo config plugin with no SDK change, plus one shared text helper that applies the nudge. Engineering writes the tests first, then checks it on the Oppo at 1.6 and 1.0, including the unproved multiline-edit case.
- **B.** Keep gate 2 open and ship with the known limitation documented. Users restart the app after changing font size.
- **C.** Look for a different approach later. No change now.

**My recommendation: A, but only if you're comfortable with a native config change.** Otherwise B. Either way, nothing gets rebuilt until you say so.
