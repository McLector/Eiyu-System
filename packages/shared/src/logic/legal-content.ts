export type LegalDocumentId = 'privacy' | 'terms';

// Notice versions (S03b). The server accepts exactly these strings (migration 066); any later change to the matching
// text needs a new version on both sides, which asks people again for that one item only.
export const TERMS_VERSION = '2026-11-08-terms-v2';
export const ADULT_NOTICE_VERSION = '2026-11-08-adult-v1';
export const AI_NOTICE_VERSION = '2026-11-08-weekly-debrief-v2';

/**
 * The two boxes next to the AI weekly review. `age-screening` is the purpose name the server kept for the
 * "I'm 18 or older" declaration; it stores a yes and a date, never a birthday.
 */
export const PROCESSING_NOTICES = {
  'age-screening': {
    version: ADULT_NOTICE_VERSION,
    label: "I'm 18 or older.",
    body: 'Eiyu stores only that you said yes and the date, never a birthday. It is needed only for the AI weekly review; everything else works without it. This is your own statement and we do not check it.',
  },
  'weekly-debrief': {
    version: AI_NOTICE_VERSION,
    label: 'I agree to Eiyu sending my quest and activity information, including sensitive information I chose to include, to Groq to make and save AI weekly reviews.',
    body: 'The AI weekly review is optional and for people 18 or older, with a verified email. Groq processes the quest and activity information you chose to include. Eiyu saves the result. We give no permission to train on it. Turning this off stops new reviews; it does not request deletion of saved history. Your other quests work without it. You can request your information or deletion at privacy@eiyusystem.app.',
  },
} as const;

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
        body: 'Your account email, profile details, timezone and preferences, quests, and completion history. We keep the version of the Terms you accepted and when, whether you ticked the "I\'m 18 or older" box and when, and whether you gave the AI agreement and when. For the 18+ box we keep only a yes and a date, never a birthday. We also keep current-email verification status, temporary challenge information, and verification and AI usage records.',
      },
      {
        heading: "HOW IT'S USED",
        body: 'We use this data to run your account, sync your progress across your devices, decide who can use the AI weekly review, and control verification attempts and AI usage. No ads, no data selling, no third-party trackers. Supabase Auth handles authentication, Supabase stores account data, and Resend delivers verification and recovery emails through Supabase Auth. Eiyu System is operated under the name McLector Dev in the Philippines.',
      },
      {
        heading: 'SIGNING IN WITH GOOGLE',
        body: "You can create an account or sign in with Google. Google tells us your email address, whether Google has verified it, your name, your profile picture address and your Google account ID, and we keep these with your account. We never receive your Google password. A Google sign-up creates your account right away. Until you accept the Terms on the next screen, the account holds your email, name, profile picture address and Google account ID. That screen asks only one thing: to accept the Privacy Policy and Terms of Use, as a password sign-up does. If you stop before finishing, the account stays; sign in again to finish it, or write to privacy@eiyusystem.app to ask for its removal. If an Eiyu account with the same email already exists, Google is linked to it only when you have verified that email with us. Otherwise the link is refused: sign in with your password and verify your email first, then use Google. Google's own privacy policy applies to what Google processes.",
      },
      {
        heading: 'AI FEATURES',
        body: 'The AI weekly review is optional and off until you turn it on. To turn it on you tick two boxes, "I\'m 18 or older" and the AI agreement, and you need a verified email. The 18+ box is your own statement; we do not check it, and we do not ask for IDs, selfies or documents to verify you. Your quests remain available without the review or a verified email. When a review is made, Eiyu sends quest and activity information, including sensitive information you chose to include, to Groq, which hosts the OpenAI-authored openai/gpt-oss-20b model. Your verification code is not included. Reviews are saved in your account. Turning it off stops new reviews; it does not request deletion of saved reviews. When AI is paused or free capacity is unavailable, AI may be temporarily unavailable; quests and saved data are retained.',
      },
      {
        heading: 'CUSTOM TRACKER AND FITNESS',
        body: "Custom quest and chain names, descriptions and progress, and Gym routines, exercises, weights, workouts and optional exercise media, are saved with Supabase so your tracker works across your devices. These records can be sensitive, so add only what you want saved. Agreeing to the Terms is all they need: there is no extra permission to give. They are used for AI reviews only if you turn on the weekly AI review, which is a separate choice. Your saved records stay in your account until you delete them or your account is removed, and you can export them or ask for deletion at any time. We do not ask for IDs, selfies or documents.",
      },
      {
        heading: 'HOW LONG WE KEEP THINGS',
        body: "We keep your account and progress while your account is active, subject to a verified removal request and applicable exceptions. A short record of your Terms acceptance and of the 18+ box and AI agreement you gave or withdrew (versions and dates, no quest text) is kept for as long as your account exists plus 12 months. Support correspondence is deleted 30 days after the case closes. Attachments such as IDs or selfies that someone sends us without being asked are not opened or used, and are deleted within 7 days. Email delivery services keep message and delivery records separately from the short life of a verification code. Deleting your Eiyu account does not recall delivered messages, your exports or copies held by old offline apps. No automatic backups are kept by our database host; any manual export we make follows the same retention periods, and operating logs and delivery records expire on their own schedule. Our AI provider's zero-data-retention control applies to inference content, not every usage record or the AI reviews Eiyu saves.",
      },
      {
        heading: 'YOUR CONTROL',
        body: 'You can turn the AI weekly review off in Profile and download your data from there. Changing your email can remove access to the AI weekly review until you verify the new address. Contact privacy@eiyusystem.app with privacy questions or requests concerning your data. We aim to acknowledge requests within 7 days and finish within 30 days. Our reply says what was exported or removed from live records, and what can remain: operating logs and delivery records kept by our hosting and email services for a limited time (there are no automatic backups, and a manual export we make follows the same periods), emails already delivered, files you exported, and copies on your phone, browser or an old app version. We never ask for your password, a code or an ID.',
      },
    ],
  },
  terms: {
    id: 'terms',
    title: 'Terms of Use',
    sections: [
      {
        heading: 'TERMS OF USE',
        body: 'Eiyu System is provided as-is, without warranty. One account per person, keep content respectful. Your quest data remains yours. Agreeing to these Terms and the Privacy Policy covers your account, your quests and chains, and Gym; there is nothing more to agree to for them.',
      },
      {
        heading: 'WHO CAN USE EIYU',
        body: 'Eiyu is for people 13 and over. We do not ask for your age or check it when you sign up; the rule is written here and we trust you to follow it. The AI weekly review is optional and is for people 18 and over. You confirm that yourself with the 18+ box when you turn it on.',
      },
    ],
  },
};
