import { LEGAL_DOCUMENTS } from '../legal-content';

describe('registration legal content', () => {
  it('keeps Privacy Policy and Terms of Use as separate complete documents', () => {
    expect(LEGAL_DOCUMENTS.privacy.title).toBe('Privacy Policy');
    expect(LEGAL_DOCUMENTS.privacy.sections.map(section => section.heading)).toEqual([
      'DATA WE COLLECT',
      "HOW IT'S USED",
      'AI FEATURES',
      'YOUR CONTROL',
    ]);
    expect(LEGAL_DOCUMENTS.terms.title).toBe('Terms of Use');
    expect(LEGAL_DOCUMENTS.terms.sections.map(section => section.heading)).toEqual(['TERMS OF USE']);
  });

  it('preserves the user-approved account, sync, AI, control, and terms wording', () => {
    const privacy = LEGAL_DOCUMENTS.privacy.sections.map(section => section.body).join(' ');
    const terms = LEGAL_DOCUMENTS.terms.sections.map(section => section.body).join(' ');

    expect(privacy).toContain('account email, display name, and the quests and completion history');
    expect(privacy).toContain('sync your progress across your devices');
    expect(privacy).toContain("Google's Gemini API");
    expect(privacy).toContain('export your data as JSON or delete your account');
    expect(terms).toContain('provided as-is, without warranty');
    expect(terms).toContain('Your quest data remains yours');
  });

  it('contains no obsolete Easy Version or Freeze Shield terminology', () => {
    const content = JSON.stringify(LEGAL_DOCUMENTS);
    expect(content).not.toMatch(/Easy Version|Freeze Shield/i);
  });
});
