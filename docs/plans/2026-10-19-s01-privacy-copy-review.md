# S01 privacy-copy reconciliation — INCOMPLETE, unpublished

This review concerns the existing shared Privacy Policy, not a new phase or legal approval. The owner approved local technical corrections on October 19 ("Do whats best, with my best interest considered ofc"). Those corrections are now implemented test first in the existing four shared sections, with Terms and the existing no-ads/no-selling/no-trackers promise preserved. Nothing was published. The broader candidate below remains a review artifact; the exact implemented text is in `packages/shared/src/logic/legal-content.ts`. Do not infer hosted Groq-only activation from local copy.

## Verified pre-change discrepancies

Source: `packages/shared/src/logic/legal-content.ts` and its regression test; current SQL047/048, shared weekly-summary history gathering and Auth initialization.

| Pre-change statement | Why it cannot describe the reviewed S02 candidate |
| --- | --- |
| Account email, display name, quests and completion history, “Nothing else.” | Profiles also contain title/class, timezone and preferences. The candidate adds birthday/eligibility revisions, mailbox proof/challenge metadata, and existing quota/request metadata. Initial signup birthday also resides in Auth user metadata/session payloads; private-table storage does not mean it never reaches device Auth storage. |
| Only account/sync processing | Weekly debrief generation processes quest activity; email verification/recovery use Auth and email delivery. Operational and quota records also exist. |
| Password stored encrypted and never visible to us | Password authentication uses Supabase Auth; the client necessarily submits the password over the configured connection. Do not equate hashing with reversible encryption or promise operator impossibility based only on UI behavior. |
| Quest names sent to Google's Gemini for optional, never-auto-saved suggestions | Current reviewed route permits weekly-summary only and targets direct Groq `openai/gpt-oss-20b`; it sends week activity, not merely a quest title. Debriefs are saved and current flow can generate on opening Weekly. Hosted v24 remains fallback-capable until separately activated; do not claim a live Groq-only route today. |
| Export JSON/delete account at any time in Settings | S01 inventory found no shipped account deletion/export controls. Do not implement later-phase deletion/export merely to make this statement true. Reconcile the actual request/response process before promising it. |

## Proposed candidate Privacy Policy copy

The following describes the intended reviewed Groq-only S02 release. It must be reconciled with the actual deployed route before publication. Keep the existing Privacy Policy and Terms dialogs and plain-language sections; do not create an extra consent/account system in this slice.

**WHO RUNS EIYU**

Eiyu System is operated under the name McLector Dev in the Philippines. Contact: privacy@eiyusystem.app.

**DATA WE USE**

We use your account email, profile details, timezone and preferences, quests, and completion history to run your account and sync progress. If you supply a birthday, we use it to screen access to AI features and keep an eligibility record. We also keep current-email verification status, temporary verification challenge information, and records needed to control verification attempts and AI usage. Supabase provides account authentication and database storage. Account sessions may remain stored on your device or browser until you sign out.

**BIRTHDAY AND EMAIL CHECKS**

AI access requires an adult birthday declaration with no pending correction. Birthday entry is declaration screening; it does not independently verify adulthood. Email verification checks access to your account's current mailbox and is required for weekly debriefs. It does not prove age or parental consent. Your quests remain available without mailbox verification. You can update your birthday in Profile. Changes to your birthday or email can remove access to AI content until the applicable checks pass again.

**AI DEBRIEFS**

For eligible accounts, weekly debrief generation sends the week's quest/activity information to Groq, which hosts the OpenAI-authored `openai/gpt-oss-20b` model. Your birthday and verification code are not included in the debrief prompt. The intended route uses Groq Free with global zero data retention for inference inputs/outputs and no permission granted for model training; those controls do not mean that all service metadata or Eiyu's saved content is deleted. Eiyu saves generated debriefs. When free capacity is unavailable, AI may be temporarily unavailable; quests and saved data are retained. Opening Status or Weekly may automatically request a debrief.

**EMAIL AND RECOVERY**

Supabase Auth and the configured Resend delivery service process your email to send verification and account-recovery messages. Keep verification codes and sign-in/recovery links private. Recovery does not by itself grant Eiyu's separate mailbox proof. Email delivery, verification and recovery can fail or expire; quest access remains separate from mailbox proof.

**YOUR QUESTIONS AND DATA REQUESTS**

Contact privacy@eiyusystem.app with privacy questions or requests concerning your data.

## Facts the draft intentionally does not invent

- The operator's legal controller identity/registration, lawful conditions for sensitive birthday/age data and children's quest data, parental involvement where required, child-facing notice and assessed suitability of trusted declarations. Brand/contact details are known; those decisions are not supplied by a code review.
- Exact retention periods for Auth metadata, eligibility/proof/challenge records, saved debriefs, operational logs/backups and quota records. Challenge validity is ten minutes, but expiry is not automatic row erasure. Some older quota ledgers prune opportunistically; that does not establish a guaranteed retention schedule.
- Processor/country/transfer terms for actual enabled services, including current pre-cutover recipients. No paid service, contractual exception or provider approval is inferred.
- A working export/deletion request process, response commitment, verified deletion URL or store declaration. Account-deletion/export implementation is not pulled into S01/S02 from later phases.
- That global Groq ZDR deletes Supabase/Auth/Resend records, Eiyu's saved summaries, or all metadata; that an already-trained model could never use customer data later; or that mailbox proof establishes adulthood.

## Next review boundary

Local technical corrections are implemented under the owner approval above. Initial tests reproduced three missing-disclosure failures (3 failed/3 passed); follow-up tests reproduced the missing preserved promise and Android automatic Status trigger (2 failed/4 passed) before those refinements. Final full shared verification passed 620 tests with 8 existing skips; affected mobile Auth passed 26 tests and affected web legal/layout passed 7 tests. The authorized reviewer found the Android trigger omission, verified it against the actual mount/foreground paths, and confirmed its final resolution. Browser acceptance showed the exact corrected copy in the existing scrollable policy dialog, with contact text and Close both available. The full mobile 1,555 and full web 1,242 runs started before the final copy refinements; they are qualified by the later affected Auth/dialog runs. All three workspace type checks, affected mobile test lint and web production build passed. Reconcile the unresolved facts above before publication. Terms and the no-ads/no-selling/no-trackers promise remain unchanged. A technical-copy repair closes those specific inaccuracies, but cannot mark the incomplete child-data/processing/retention assessment complete or authorize publishing. The installed Oppo snapshot predates this shared-copy update; no rebuilt-device policy acceptance is claimed.

This draft is an unpublished review artifact; the privacy assessment remains incomplete. It preserves the owner's trusted-declaration decision without certifying its suitability. Both checkpoints remain INCOMPLETE; no 027/S03 or production change.
