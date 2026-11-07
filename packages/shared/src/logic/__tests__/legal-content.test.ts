import {
  ADULT_NOTICE_VERSION, AI_NOTICE_VERSION, DATA_REQUEST_RESPONSE, DELIVERED_REMINDER_NOTICE, LEGAL_DOCUMENTS,
  PROCESSING_NOTICES, TERMS_VERSION,
} from '../legal-content';
import * as legalContent from '../legal-content';

const privacyText = () => LEGAL_DOCUMENTS.privacy.sections.map(section => section.body).join(' ');
const termsText = () => LEGAL_DOCUMENTS.terms.sections.map(section => section.body).join(' ');
const section = (heading: string) => LEGAL_DOCUMENTS.privacy.sections.find(s => s.heading === heading)?.body ?? '';

// Words that belonged to the birthday, child-notice, teen-review and per-purpose-permission system (removed in S03b).
const REMOVED_WORDING = /birthday|date of birth|\bchild|\bteen|under 12|age 12|12 and above|\bparent|\bguardian|fitness permission|fitness notice|custom permission|separate permission|read-only|teen review|eligible declared/i;

describe('versions', () => {
  it('names the three current notices', () => {
    expect(TERMS_VERSION).toBe('2026-11-08-terms-v2');
    expect(ADULT_NOTICE_VERSION).toBe('2026-11-08-adult-v1');
    expect(AI_NOTICE_VERSION).toBe('2026-11-08-weekly-debrief-v2');
  });
  it('keeps the three versions different, so changing one asks only for that one again', () => {
    expect(new Set([TERMS_VERSION, ADULT_NOTICE_VERSION, AI_NOTICE_VERSION]).size).toBe(3);
  });
  it('no longer exports the old age notice version or the removed notices', () => {
    const exported = legalContent as Record<string, unknown>;
    for (const name of ['AGE_NOTICE_VERSION', 'CHILD_PRIVACY_NOTICE', 'TRACKER_PURPOSE_NOTICES', 'PROCESSING_AUTHORITY_REVIEW']) {
      expect(exported[name]).toBeUndefined();
    }
  });
});

describe('document structure', () => {
  it('keeps Privacy Policy and Terms of Use as separate documents', () => {
    expect(LEGAL_DOCUMENTS.privacy.title).toBe('Privacy Policy');
    expect(LEGAL_DOCUMENTS.privacy.sections.map(s => s.heading)).toEqual([
      'DATA WE COLLECT', "HOW IT'S USED", 'SIGNING IN WITH GOOGLE', 'AI FEATURES',
      'CUSTOM TRACKER AND FITNESS', 'HOW LONG WE KEEP THINGS', 'YOUR CONTROL',
    ]);
    expect(LEGAL_DOCUMENTS.terms.title).toBe('Terms of Use');
    expect(LEGAL_DOCUMENTS.terms.sections.map(s => s.heading)).toEqual(['TERMS OF USE', 'WHO CAN USE EIYU']);
  });
  it('has no empty section', () => {
    for (const doc of Object.values(LEGAL_DOCUMENTS)) for (const s of doc.sections) expect(s.body.length).toBeGreaterThan(40);
  });
});

describe('Privacy Policy: data and processors', () => {
  it('describes the data we hold and the processors', () => {
    expect(privacyText()).toMatch(/account email/i);
    expect(privacyText()).toMatch(/timezone/i);
    expect(privacyText()).toMatch(/verification status/i);
    expect(privacyText()).toMatch(/usage records/i);
    expect(privacyText()).toContain('Supabase Auth');
    expect(privacyText()).toContain('Resend');
    expect(privacyText()).toContain('sync your progress across your devices');
    expect(privacyText()).toContain('No ads, no data selling, no third-party trackers.');
    expect(privacyText()).not.toMatch(/nothing else|password is stored encrypted/i);
  });
  it('says what is kept about agreements: the Terms version and time, the 18+ yes and the AI agreement', () => {
    const data = section('DATA WE COLLECT');
    expect(data).toMatch(/Terms/);
    expect(data).toMatch(/18 or older/);
    expect(data).toMatch(/AI agreement/);
    expect(data).toMatch(/never a birthday|do not keep a birthday|no birthday/i);
  });
  it('names the operator, country and the one contact address', () => {
    expect(privacyText()).toContain('McLector Dev');
    expect(privacyText()).toContain('Philippines');
    expect(privacyText()).toContain('privacy@eiyusystem.app');
  });
});

describe('Privacy Policy and Terms carry none of the removed age wording', () => {
  it('has no birthday, child, teen, guardian or per-purpose permission wording in the policy sections that used it', () => {
    for (const heading of ['DATA WE COLLECT', "HOW IT'S USED", 'SIGNING IN WITH GOOGLE', 'AI FEATURES', 'CUSTOM TRACKER AND FITNESS', 'HOW LONG WE KEEP THINGS', 'YOUR CONTROL']) {
      const body = section(heading);
      const allowedNegative = heading === 'DATA WE COLLECT' ? body.replace(/never a birthday|do not keep a birthday|no birthday/gi, '') : body;
      expect(allowedNegative).not.toMatch(REMOVED_WORDING);
    }
  });
  it('has none of it in the Terms either, beyond the written 13-and-over rule', () => {
    expect(termsText()).not.toMatch(/birthday|date of birth|\bchild|\bteen|guardian|read-only/i);
  });
  it('no longer promises a 30-day removal or a read-only period after a withdrawal', () => {
    expect(section('CUSTOM TRACKER AND FITNESS')).not.toMatch(/withdraw|30 days|we remove them/i);
    expect(section('AI FEATURES')).not.toMatch(/30 days/);
    expect(privacyText()).not.toMatch(/decision notes/i);
  });
  it('contains no obsolete Easy Version or Freeze Shield terminology', () => {
    expect(JSON.stringify(LEGAL_DOCUMENTS)).not.toMatch(/Easy Version|Freeze Shield/i);
  });
});

describe('Terms of Use', () => {
  it('keeps the approved as-is wording and that quest data stays the owner’s', () => {
    expect(termsText()).toContain('provided as-is, without warranty');
    expect(termsText()).toContain('Your quest data remains yours');
  });
  it('states 13 and over as a written rule that the app never asks about or checks', () => {
    expect(termsText()).toMatch(/13 and over/);
    expect(termsText()).toMatch(/do not ask for your age or check it/i);
  });
  it('says one agreement covers the account, quests, chains and Gym', () => {
    expect(termsText()).toMatch(/covers your account, your quests and chains, and Gym/);
  });
  it('says the AI weekly review is optional and for people 18 and over', () => {
    expect(termsText()).toMatch(/AI weekly review[^.]*optional/i);
    expect(termsText()).toMatch(/18 and over/);
  });
});

describe('AI features (opt-in, 18+, Groq, verified email)', () => {
  const ai = () => section('AI FEATURES');
  it('says the review is opt-in, for people 18 and over, and needs a verified email', () => {
    expect(ai()).toMatch(/until you turn it on/i);
    expect(ai()).toMatch(/18 or older/);
    expect(ai()).toMatch(/verified email/i);
    expect(ai()).toMatch(/AI agreement/);
  });
  it('names the recipient and model, what is sent, and what is not', () => {
    expect(ai()).toContain('Groq');
    expect(ai()).toContain('openai/gpt-oss-20b');
    expect(ai()).toMatch(/quest and activity information/i);
    expect(ai()).toMatch(/verification code is not included/i);
  });
  it('says saved reviews are kept, and that turning it off stops new ones without deleting saved ones', () => {
    expect(ai()).toMatch(/reviews are saved/i);
    expect(ai()).toMatch(/turning (?:it|this) off stops new reviews/i);
    expect(ai()).toMatch(/does not (?:request )?delet/i);
  });
  it('treats the 18+ box as the person’s own statement and asks for no ID', () => {
    expect(ai()).toMatch(/your own statement/i);
    expect(ai()).toMatch(/IDs, selfies or documents/i);
  });
  it('keeps quests available without the review or a verified email', () => {
    expect(ai()).toMatch(/quests remain available without/i);
  });
  it('does not still promise the old age-12 rules or an adult-birthday requirement', () => {
    expect(ai()).not.toMatch(/age 12|requires an adult birthday|do not independently verify age/i);
  });
  it('does not claim the review is requested automatically', () => {
    expect(ai()).not.toMatch(/automatically request/i);
  });
  it('mentions neither Gemini nor stale allowance promises', () => {
    expect(privacyText()).not.toMatch(/Gemini|never auto-saved|two (?:total )?(?:generations|debriefs) per week/i);
  });
});

describe('quests, chains and Gym', () => {
  const body = () => section('CUSTOM TRACKER AND FITNESS');
  it('says no extra permission is needed beyond agreeing to the Terms', () => {
    expect(body()).toMatch(/no extra permission/i);
    expect(body()).not.toMatch(/basic quests/i);
    expect(body()).not.toMatch(/only after you give|if you say no|young person/i);
  });
  it('still says what is saved, that it can be sensitive, who stores it, and that AI use is a separate opt-in', () => {
    expect(body()).toMatch(/Custom quest and chain names, descriptions and progress/);
    expect(body()).toMatch(/Gym routines, exercises, weights, workouts and optional exercise media/);
    expect(body()).toMatch(/Supabase/);
    expect(body()).toMatch(/sensitive/i);
    expect(body()).toMatch(/only if you turn on the weekly AI review/i);
    expect(body()).toMatch(/export them or ask for deletion/i);
    expect(body()).toMatch(/do not ask for IDs, selfies or documents/i);
  });
});

describe('keeping things and your control', () => {
  it('keeps the retention statements that still apply', () => {
    expect(privacyText()).toMatch(/12 months/);
    expect(privacyText()).toMatch(/Deleting your Eiyu account does not recall delivered messages/);
    expect(privacyText()).toMatch(/zero-data-retention control applies to inference content/);
  });
  it('lets the person turn the AI weekly review off in Profile and does not offer birthday edits', () => {
    const control = section('YOUR CONTROL');
    expect(control).toMatch(/turn the AI weekly review off in Profile/i);
    expect(control).toContain('privacy@eiyusystem.app');
    expect(control).toMatch(/backups/i);
    expect(control).toMatch(/old offline|old app/i);
    expect(control).not.toMatch(/export your data as JSON|delete your account at any time from Settings/i);
  });
  it('response wording separates active records, backups and logs, delivered mail, user exports and old offline copies', () => {
    expect(DATA_REQUEST_RESPONSE).not.toMatch(/draft/i);
    for (const part of [/Active records:/, /Backups and logs:/, /Email already sent:/, /Your own copies:/, /old app version/, /AI:/, /within 7 days and finish within 30 days/]) {
      expect(DATA_REQUEST_RESPONSE).toMatch(part);
    }
    expect(DATA_REQUEST_RESPONSE).toMatch(/never ask for your password, a code or an ID/);
  });
  it('keeps the delivered-reminder notice', () => {
    expect(DELIVERED_REMINDER_NOTICE).toMatch(/already delivered/);
  });
});

describe('backup wording', () => {
  const all = () => [privacyText(), DATA_REQUEST_RESPONSE].join(' ');
  it('does not imply the database host keeps automatic backups', () => {
    expect(all()).not.toMatch(/Backups and operational records can remain/);
    expect(all()).not.toMatch(/backups and (operating )?records kept by our hosting/i);
    expect(all()).not.toMatch(/hosting and email services may keep backups/i);
  });
  it('says no automatic backups are kept and manual exports follow the same periods', () => {
    expect(all()).toMatch(/no automatic backups are kept by our database host/i);
    expect(all()).toMatch(/manual export[^.]*same (retention )?periods/i);
  });
});

describe('Google sign-in', () => {
  const google = () => section('SIGNING IN WITH GOOGLE');
  it('names what Google gives us and that we never receive the Google password', () => {
    expect(google()).toMatch(/email address/i);
    expect(google()).toMatch(/verified/i);
    expect(google()).toMatch(/name/i);
    expect(google()).toMatch(/profile picture address/i);
    expect(google()).toMatch(/Google account ID/i);
    expect(google()).toMatch(/never receive your Google password/i);
  });
  it('says the account exists straight away and what it holds until the Terms are accepted', () => {
    expect(google()).toMatch(/creates your account right away/i);
    expect(google()).toMatch(/until you accept[^.]*Terms[^.]*email[^.]*name[^.]*profile picture address[^.]*Google account ID/i);
  });
  it('says the next screen asks only for the Terms and Privacy Policy, as password sign-up does', () => {
    expect(google()).toMatch(/accept the Privacy Policy and Terms of Use/i);
    expect(google()).toMatch(/only/i);
  });
  it('says what happens to an abandoned sign-up and how to ask for removal', () => {
    expect(google()).toMatch(/stop[^.]*account stays/i);
    expect(google()).toContain('privacy@eiyusystem.app');
  });
  it('explains that an existing account is linked only after its email is verified, and what to do otherwise', () => {
    expect(google()).toMatch(/same email/i);
    expect(google()).toMatch(/only when you have verified that email/i);
    expect(google()).toMatch(/sign in with your password and verify your email first/i);
  });
  it('names Google as a processor without weakening the no-ads claim', () => {
    expect(google()).toMatch(/Google's own privacy policy/i);
    expect(privacyText()).toContain('No ads, no data selling, no third-party trackers.');
  });
});

describe('processing notices', () => {
  it('keeps the 18+ declaration separate from the AI agreement', () => {
    expect(Object.keys(PROCESSING_NOTICES).sort()).toEqual(['age-screening', 'weekly-debrief']);
    expect(PROCESSING_NOTICES['age-screening'].version).toBe(ADULT_NOTICE_VERSION);
    expect(PROCESSING_NOTICES['weekly-debrief'].version).toBe(AI_NOTICE_VERSION);
  });
  it('words the adult box as a plain 18+ statement that stores yes and the date, never a birthday', () => {
    const notice = PROCESSING_NOTICES['age-screening'];
    expect(notice.label).toMatch(/18 or older/);
    expect(notice.label).not.toMatch(/birthday|corrections/i);
    expect(notice.body).toMatch(/yes and the date/i);
    expect(notice.body).toMatch(/never a birthday/i);
    expect(notice.body).toMatch(/AI weekly review/);
  });
  it('words the AI agreement around Groq, opt-in, saving, no training and turning it off', () => {
    const notice = PROCESSING_NOTICES['weekly-debrief'];
    expect(notice.label).toContain('Groq');
    expect(notice.label).toMatch(/quest and activity information/i);
    expect(notice.body).toMatch(/18 or older/);
    expect(notice.body).toMatch(/verified email/i);
    expect(notice.body).toMatch(/saves the result/i);
    expect(notice.body).toMatch(/no permission to train/i);
    expect(notice.body).toMatch(/turning this off stops new/i);
    expect(notice.body).toContain('privacy@eiyusystem.app');
  });
  it('carries none of the removed wording', () => {
    for (const notice of Object.values(PROCESSING_NOTICES)) {
      expect(notice.label).not.toMatch(REMOVED_WORDING);
      expect(notice.body.replace(/never a birthday/gi, '')).not.toMatch(REMOVED_WORDING);
      expect(notice.body).not.toMatch(/30 days/);
    }
  });
});

describe('contact address', () => {
  it('publishes one contact address and never a personal mailbox', () => {
    const addresses = JSON.stringify(legalContent).match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g) ?? [];
    expect(addresses.length).toBeGreaterThan(0);
    expect([...new Set(addresses)]).toEqual(['privacy@eiyusystem.app']);
  });
  it('adds no other address in the Google section', () => {
    const addresses = section('SIGNING IN WITH GOOGLE').match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g) ?? [];
    expect([...new Set(addresses)]).toEqual(['privacy@eiyusystem.app']);
  });
});
