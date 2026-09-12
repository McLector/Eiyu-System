export type LegalDocumentId = 'privacy' | 'terms';

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
        body: 'Your account email, display name, and the quests and completion history you create. Nothing else.',
      },
      {
        heading: "HOW IT'S USED",
        body: 'Only to run your account and sync your progress across your devices. No ads, no data selling, no third-party trackers. Your password is stored encrypted by our auth provider and never visible to us.',
      },
      {
        heading: 'AI FEATURES',
        body: "Quest names you submit for suggestions are processed by Google's Gemini API solely to generate those suggestions. Suggestions are always optional and never auto-saved.",
      },
      {
        heading: 'YOUR CONTROL',
        body: 'You can export your data as JSON or delete your account at any time from Settings.',
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
