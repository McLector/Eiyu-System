import { CUSTOM_TRACKER_NOTICE_VERSION, FITNESS_TRACKER_NOTICE_VERSION } from '../data/tracker-access';
export type LegalDocumentId = 'privacy' | 'terms';

// Candidate versions for the local S02 purpose contract; not a published consent notice.
export const AGE_NOTICE_VERSION = '2026-10-20-age-v1';
export const AI_NOTICE_VERSION = '2026-10-20-weekly-debrief-v1';

/** A distinct child-oriented layer; the fuller policy remains available beside it. */
export const CHILD_PRIVACY_NOTICE = 'Eiyu saves your email, profile, quests and progress with Supabase to run your tracker. Quests can include private things, so only add what you want saved. Your birthday helps check age limits and permissions. An email check only checks your mailbox. Optional AI reviews send quest and activity information to Groq. You can say no to AI and still use ordinary quests. Ask questions or request your information at privacy@eiyusystem.app. We do not ask for IDs, selfies or documents to verify you.';
export const PROCESSING_NOTICES = {
  'age-screening': {
    version: AGE_NOTICE_VERSION,
    label: 'I agree to Eiyu using my birthday and age status for feature access and birthday corrections.',
    body: 'Eiyu stores your declared birthday with your account to check age limits and handle your corrections. A birthday supplied at signup may also be saved in sign-in data on your device. We trust your declaration; an email check does not prove your age or a guardian’s authority.',
  },
  'weekly-debrief': {
    version: AI_NOTICE_VERSION,
    label: 'I agree to Eiyu sending my quest and activity information, including sensitive information I chose to include, to Groq to make and save AI reviews.',
    body: 'Opening Status or Weekly can automatically request a review once you give permission and access is available. Groq processes the quest and activity information you chose to include. Eiyu saves the result. We give no permission to train on it. Turning this off stops new AI reviews; it does not request deletion of saved history. Ordinary quests remain available without AI permission. You can request your information or deletion at privacy@eiyusystem.app.',
  },
} as const;
// Approved wording (S02 owner decisions 5-9, adopted 2026-10-24). The versions must match the server's accepted notices
// (data/tracker-access.ts). Any later change to this text needs a new version on both sides, which asks everyone again.
// `body` is the adult text; `childBody` is the plain 12-17 explanation shown beside it.
export const TRACKER_PURPOSE_NOTICES: Record<'custom-tracker' | 'fitness-tracking', { version: string; label: string; body: string; childBody: string }> = {
  'custom-tracker': {
    version: CUSTOM_TRACKER_NOTICE_VERSION,
    label: 'I agree to Eiyu saving and using my custom quest and chain names, descriptions and progress to run my tracker. What I add may include sensitive information.',
    body: 'When you create or edit a custom quest or chain, Eiyu saves what you write (names, descriptions, easy versions, stage text) and your progress with Supabase, so your tracker works across your devices. Quests can be private, so only add what you are comfortable having saved. This does not give permission for AI reviews; that is a separate choice. If you say no, you can still use basic quests with standard names and keep your saved history. If you turn this off later, new custom quests and progress on custom quests stop. Your saved custom history stays and becomes read-only for 30 days, and you can export it or ask for deletion during that time; after 30 days we remove it. We keep a short record that you gave and withdrew permission (no quest text) for as long as your account exists plus 12 months. Turning this off in Profile takes effect when the app confirms it. You can ask to see, correct, export or delete your information at privacy@eiyusystem.app or in the Privacy Policy. We do not ask for IDs, selfies or documents.',
    childBody: "You can make your own quests with your own names. If you do, Eiyu saves what you write and your progress, so you can use it on all your devices. Quests can include private things, so only add what you want saved. Saying yes here does not turn on AI. If you say no, you can still use the simple quests with standard names, and your old progress stays. You can turn this off in Profile whenever you want. Your old custom quests will stay on your account to look at for 30 days, but you can't add to them. You can ask us to delete them sooner, and after 30 days we remove them. Questions? Use the contact in Profile. We never ask for IDs, selfies or documents. If your family needs to look at this, we may ask who you are so we can check it.",
  },
  'fitness-tracking': {
    version: FITNESS_TRACKER_NOTICE_VERSION,
    label: 'I agree to Eiyu saving and using my fitness routines, exercise details, weights and workout progress to run Gym. These records may reveal sensitive information.',
    body: 'Gym saves your routines, exercises, sets, weights, workout sessions and, only if you choose, exercise media you attach, with Supabase. It uses them to show your plan and progress. Fitness records can reveal health information, so only add what you want saved; you do not have to attach media to use Gym. This does not give permission for AI reviews. If you say no, Gym stays closed for new records, and your ordinary quests and history are unaffected. If you turn this off later, new routines, workouts and uploads stop. Your saved Gym history stays read-only for 30 days, and you can export it or ask for deletion during that time; after 30 days we remove it. We keep a short record that you gave and withdrew permission (no workout content) for as long as your account exists plus 12 months. You can turn this off in Profile and the app confirms when it has taken effect. Pictures or video you uploaded earlier may remain in storage until removed. You can ask to see, correct, export or delete your information at privacy@eiyusystem.app or in the Privacy Policy. We do not ask for IDs, selfies or documents.',
    childBody: "Gym saves your workouts, weights and the exercises you choose, plus any photos or videos you decide to add. This is so you can see your progress. Fitness details can be private, so only add what you are happy to have saved. Saying yes does not turn on AI. If you say no, you can still do your ordinary quests and keep your history. You can turn Gym off in Profile whenever you want. Your old workouts will stay to look at for 30 days but you can't add new ones, and you can ask us to delete them sooner. After 30 days we remove them. Questions? Use the contact in Profile. We never ask for IDs, selfies or documents.",
  },
};
/** Response to an export or deletion request (decision 8). Replace the bracketed choice per request type before sending. */
export const DATA_REQUEST_RESPONSE = [
  'Thanks for your request. We checked it is from your account. This is what we did and what you should know.',
  "Active records: we have [exported / removed] your account, profile, quests, progress and saved AI reviews from Eiyu's live database. We aim to acknowledge requests within 7 days and finish within 30 days.",
  'Backups and logs: no automatic backups are kept by our database host. Our hosting and email services may keep operating logs and delivery records for a limited time under their own rules; these expire on their schedule and we cannot promise a date for each. Any manual export we make follows the same retention periods as the live records.',
  'Email already sent: a verification or recovery email we delivered stays in your inbox. We cannot recall it, and the email service keeps its own delivery record for a while.',
  'Your own copies: files you exported and anything stored on your phone, browser or an old app version are not under our control. Sign out and remove the app if you want them gone from your device.',
  'AI: our AI provider does not keep the text we send for training. We do not control any separate usage record it keeps, and we cannot remove reviews already shown to you elsewhere.',
  'If anything here is wrong, or you want something corrected, reply to this message. We will never ask for your password, a code or an ID.',
].join('\n\n');
/** Said after custom permission is withdrawn: only future reminders were canceled. Copies the OS already delivered are not recalled. */
export const DELIVERED_REMINDER_NOTICE = 'Reminders already delivered to this device stay there until you clear them. Only future reminders were canceled.';
export const PROCESSING_AUTHORITY_REVIEW = 'This permission needs review. Contact privacy@eiyusystem.app. Do not send IDs, documents or private quest details. Email confirmation alone does not prove a guardian’s authority.';

export interface LegalSection {
  heading: string;
  body: string;
}

export interface LegalDocument {
  id: LegalDocumentId;
  title: string;
  sections: LegalSection[];
}

export const LEGAL_DOCUMENTS: Record<LegalDocumentId, LegalDocument> = {
  privacy: {
    id: 'privacy',
    title: 'Privacy Policy',
    sections: [
      {
        heading: 'DATA WE COLLECT',
        body: 'Your account email, profile details, timezone and preferences, quests, and completion history. If you supply a birthday, we keep it with an AI eligibility record. We also keep current-email verification status, temporary challenge information, and verification and AI usage records. Account sessions can be saved on your device or browser and may include the birthday supplied at signup.',
      },
      {
        heading: "HOW IT'S USED",
        body: 'We use this data to run your account, sync your progress across your devices, screen AI access, and control verification attempts and AI usage. No ads, no data selling, no third-party trackers. Supabase Auth handles authentication, Supabase stores account data, and Resend delivers verification and recovery emails through Supabase Auth. Eiyu System is operated under the name McLector Dev in the Philippines.',
      },
      {
        heading: 'SIGNING IN WITH GOOGLE',
        body: "You can create an account or sign in with Google. Google tells us your email address, whether Google has verified it, your name, your profile picture address and your Google account ID, and we keep these with your account. We never receive your Google password. A Google sign-up creates your account before you confirm your birthday. Until you finish that step, the account holds your email, name, profile picture address and Google account ID. We start processing a birthday only after you read the notice and give specific permission. To finish, you also accept the Privacy Policy and Terms of Use, as with a password sign-up. If you stop before finishing, the account stays; sign in again to finish it, or write to privacy@eiyusystem.app to ask for its removal. If an Eiyu account with the same email already exists, Google is linked to it only when you have verified that email with us. Otherwise the link is refused: sign in with your password and verify your email first, then use Google. Google's own privacy policy applies to what Google processes.",
      },
      {
        heading: 'AI FEATURES',
        body: 'Weekly debrief access is for eligible declared age 12 and above, with no pending birthday correction, the applicable specific processing permission and authority, and current-mailbox verification. These checks do not independently verify age or parental authority. We do not ask for IDs, selfies or documents to verify you. Your quests remain available without mailbox verification. Weekly debrief generation sends quest and activity information, including sensitive information you chose to include, to Groq, which hosts the OpenAI-authored openai/gpt-oss-20b model. Your birthday and verification code are not included in the debrief prompt. Opening Status or Weekly may automatically request a debrief after the separate AI permission, and generated debriefs are saved in your account. Withdrawing AI permission stops new reviews, rather than requesting deletion of saved history. When AI is paused or free capacity is unavailable, AI may be temporarily unavailable; quests and saved data are retained.',
      },
      {
        heading: 'CUSTOM TRACKER AND FITNESS',
        body: "Custom quest and chain names, descriptions and progress, and Gym routines, exercises, weights, workouts and optional exercise media, are saved with Supabase only after you give a separate permission for each. These records can be sensitive, so add only what you want saved. Neither permission allows AI reviews. If you say no, basic quests with standard names and your ordinary history keep working. If you withdraw a permission, new records of that kind stop and your saved records stay read-only for 30 days, during which you can export them or ask for deletion; after 30 days we remove them. People aged 12 to 17 get a plainer explanation, and we may review a young person's request for these permissions ourselves. We do not ask for IDs, selfies or documents.",
      },
      {
        heading: 'HOW LONG WE KEEP THINGS',
        body: "We keep your account and progress while your account is active, subject to a verified removal request and applicable exceptions. A short record of the permissions you gave or withdrew (no quest text) is kept for as long as your account exists plus 12 months. Our decision notes about permissions are kept while your account exists plus 90 days, and support correspondence is deleted 30 days after the case closes. Attachments such as IDs or selfies that someone sends us without being asked are not opened or used, and are deleted within 7 days. Email delivery services keep message and delivery records separately from the short life of a verification code. Deleting your Eiyu account does not recall delivered messages, your exports or copies held by old offline apps. No automatic backups are kept by our database host; any manual export we make follows the same retention periods, and operating logs and delivery records expire on their own schedule. Our AI provider's zero-data-retention control applies to inference content, not every usage record or the AI reviews Eiyu saves.",
      },
      {
        heading: 'YOUR CONTROL',
        body: 'You can update your birthday in Profile. Birthday or email changes can remove access to AI content until the applicable checks pass again. Contact privacy@eiyusystem.app with privacy questions or requests concerning your data. We aim to acknowledge requests within 7 days and finish within 30 days. Our reply says what was exported or removed from live records, and what can remain: operating logs and delivery records kept by our hosting and email services for a limited time (there are no automatic backups, and a manual export we make follows the same periods), emails already delivered, files you exported, and copies on your phone, browser or an old app version. We never ask for your password, a code or an ID.',
      },
    ],
  },
  terms: {
    id: 'terms',
    title: 'Terms of Use',
    sections: [
      {
        heading: 'TERMS OF USE',
        body: 'Eiyu System is provided as-is, without warranty. One account per person, keep content respectful. Your quest data remains yours.',
      },
    ],
  },
};
