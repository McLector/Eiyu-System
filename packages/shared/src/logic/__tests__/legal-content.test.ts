import { DATA_REQUEST_RESPONSE, LEGAL_DOCUMENTS, PROCESSING_NOTICES, TRACKER_PURPOSE_NOTICES } from '../legal-content';
import * as legalContent from '../legal-content';
import { TRACKER_NOTICE_VERSIONS } from '../../data/tracker-access';

describe('registration legal content', () => {
  it('keeps Privacy Policy and Terms of Use as separate complete documents', () => {
    expect(LEGAL_DOCUMENTS.privacy.title).toBe('Privacy Policy');
    expect(LEGAL_DOCUMENTS.privacy.sections.map(section => section.heading)).toEqual([
      'DATA WE COLLECT',
      "HOW IT'S USED",
      'SIGNING IN WITH GOOGLE',
      'AI FEATURES',
      'CUSTOM TRACKER AND FITNESS',
      'HOW LONG WE KEEP THINGS',
      'YOUR CONTROL',
    ]);
    expect(LEGAL_DOCUMENTS.terms.title).toBe('Terms of Use');
    expect(LEGAL_DOCUMENTS.terms.sections.map(section => section.heading)).toEqual(['TERMS OF USE']);
  });

  it('describes the current data and processors without claiming only profile and quest data exist', () => {
    const privacy = LEGAL_DOCUMENTS.privacy.sections.map(section => section.body).join(' ');
    expect(privacy).toMatch(/account email/i);
    expect(privacy).toMatch(/timezone/i);
    expect(privacy).toMatch(/birthday/i);
    expect(privacy).toMatch(/verification status/i);
    expect(privacy).toMatch(/usage records/i);
    expect(privacy).toContain('Supabase Auth');
    expect(privacy).toContain('Resend');
    expect(privacy).toContain('sync your progress across your devices');
    expect(privacy).toContain('No ads, no data selling, no third-party trackers.');
    expect(privacy).not.toMatch(/nothing else|password is stored encrypted/i);
  });

  it('describes the Groq debrief recipient, declaration limits, saved output and mailbox-free quests', () => {
    const privacy = LEGAL_DOCUMENTS.privacy.sections.map(section => section.body).join(' ');
    expect(privacy).toContain('Groq');
    expect(privacy).toContain('openai/gpt-oss-20b');
    expect(privacy).toMatch(/quest and activity information/i);
    expect(privacy).toMatch(/birthday and verification code are not included/i);
    expect(privacy).toMatch(/debriefs are saved/i);
    expect(privacy).toMatch(/opening Status or Weekly may automatically request a debrief/i);
    expect(privacy).toMatch(/do not independently verify age or parental authority/i);
    expect(privacy).toMatch(/quests remain available without mailbox verification/i);
    expect(privacy).not.toMatch(/Gemini|never auto-saved|two (?:total )?(?:generations|debriefs) per week/i);
  });

  it('describes the reviewed12+ permission boundary without an adult-only debrief promise', () => {
    const privacy = LEGAL_DOCUMENTS.privacy.sections.map(section => section.body).join(' ');
    expect(privacy).toMatch(/age 12 and above/i);
    expect(privacy).toMatch(/specific.*permission/i);
    expect(privacy).toMatch(/IDs, selfies or documents/i);
    expect(privacy).not.toMatch(/requires an adult birthday declaration/i);
  });

  it('provides the confirmed operator contact without promising unimplemented Settings controls', () => {
    const privacy = LEGAL_DOCUMENTS.privacy.sections.map(section => section.body).join(' ');
    expect(privacy).toContain('McLector Dev');
    expect(privacy).toContain('Philippines');
    expect(privacy).toContain('privacy@eiyusystem.app');
    expect(privacy).toContain('Profile');
    expect(privacy).not.toMatch(/export your data as JSON|delete your account at any time from Settings/i);
  });

  it('publishes one contact address and never a personal mailbox', () => {
    const addresses = JSON.stringify(legalContent).match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g) ?? [];
    expect(addresses.length).toBeGreaterThan(0);
    expect([...new Set(addresses)]).toEqual(['privacy@eiyusystem.app']);
  });

  it('preserves the separate approved Terms of Use', () => {
    const terms = LEGAL_DOCUMENTS.terms.sections.map(section => section.body).join(' ');
    expect(terms).toContain('provided as-is, without warranty');
    expect(terms).toContain('Your quest data remains yours');
  });

  it('contains no obsolete Easy Version or Freeze Shield terminology', () => {
    const content = JSON.stringify(LEGAL_DOCUMENTS);
    expect(content).not.toMatch(/Easy Version|Freeze Shield/i);
  });
});

describe('Google sign-in (S03)', () => {
  const google = () => LEGAL_DOCUMENTS.privacy.sections.find(s => s.heading === 'SIGNING IN WITH GOOGLE')?.body ?? '';

  it('names what Google gives us and that we never receive the Google password', () => {
    expect(google()).toMatch(/email address/i);
    expect(google()).toMatch(/verified/i);
    expect(google()).toMatch(/name/i);
    expect(google()).toMatch(/profile picture address/i);
    expect(google()).toMatch(/Google account ID/i);
    expect(google()).toMatch(/never receive your Google password/i);
  });

  it('says the account exists before the birthday step and what it holds until the user finishes', () => {
    expect(google()).toMatch(/creates your account before you confirm your birthday/i);
    expect(google()).toMatch(/until you finish[^.]*email[^.]*name[^.]*profile picture address[^.]*Google account ID/i);
    expect(google()).toMatch(/birthday[^.]*only after[^.]*specific permission/i);
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

  it('names Google as a processor without ads or selling claims being weakened', () => {
    expect(google()).toMatch(/Google's own privacy policy/i);
    const privacy = LEGAL_DOCUMENTS.privacy.sections.map(s => s.body).join(' ');
    expect(privacy).toContain('No ads, no data selling, no third-party trackers.');
  });

  it('adds no new contact address', () => {
    const addresses = google().match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g) ?? [];
    expect([...new Set(addresses)]).toEqual(['privacy@eiyusystem.app']);
  });
});

describe('approved tracker notices and policy additions (S02 decisions 5-9, 13)', () => {
  const purposes = ['custom-tracker', 'fitness-tracking'] as const;
  it('carries no draft marker and keeps the notice versions unchanged', () => {
    for (const purpose of purposes) {
      const notice = TRACKER_PURPOSE_NOTICES[purpose];
      expect(JSON.stringify(notice)).not.toMatch(/draft|provisional|pending owner/i);
    }
    expect(TRACKER_PURPOSE_NOTICES['custom-tracker'].version).toBe('2026-10-23-custom-tracker-v1');
    expect(TRACKER_PURPOSE_NOTICES['fitness-tracking'].version).toBe('2026-10-23-fitness-tracking-v1');
  });
  it('states the adopted 30-day read-only period in the adult and the 12-17 text', () => {
    for (const purpose of purposes) {
      const notice = TRACKER_PURPOSE_NOTICES[purpose];
      expect(notice.body).toMatch(/30 days/);
      expect(notice.childBody).toMatch(/30 days/);
      expect(notice.body).toMatch(/read-only/);
      expect(notice.childBody).toMatch(/can't add/i);
    }
  });
  it('has a plain child-oriented version that never asks for IDs and keeps AI separate', () => {
    for (const purpose of purposes) {
      const child = TRACKER_PURPOSE_NOTICES[purpose].childBody;
      expect(child).toMatch(/does not turn on AI/i);
      expect(child).toMatch(/never ask for IDs, selfies or documents/i);
      expect(child).toMatch(/Profile/);
      expect(child.length).toBeGreaterThan(200);
    }
    expect(TRACKER_PURPOSE_NOTICES['custom-tracker'].childBody).toMatch(/who you are/);
  });
  it('names data, storage, decline result, withdrawal result and rights in each adult body', () => {
    const custom = TRACKER_PURPOSE_NOTICES['custom-tracker'];
    expect(custom.label).toMatch(/custom quest and chain names, descriptions and progress/i);
    expect(custom.body).toMatch(/Supabase/);
    expect(custom.body).toMatch(/If you say no, you can still use basic quests/i);
    expect(custom.body).toMatch(/export it or ask for deletion/i);
    expect(custom.body).toMatch(/see, correct, export or delete/i);
    expect(custom.body).toMatch(/do not ask for IDs, selfies or documents/i);
    const fit = TRACKER_PURPOSE_NOTICES['fitness-tracking'];
    expect(fit.body).toMatch(/Supabase/);
    expect(fit.body).toMatch(/Gym stays closed for new records/i);
    expect(fit.body).toMatch(/may remain in storage/i);
    expect(fit.body).toMatch(/see, correct, export or delete/i);
    expect(fit.body).toMatch(/do not ask for IDs, selfies or documents/i);
  });
  it('adds a purposes section and a keeping-things section to the privacy policy', () => {
    const headings = LEGAL_DOCUMENTS.privacy.sections.map(s => s.heading);
    expect(headings).toEqual(['DATA WE COLLECT', "HOW IT'S USED", 'SIGNING IN WITH GOOGLE', 'AI FEATURES', 'CUSTOM TRACKER AND FITNESS', 'HOW LONG WE KEEP THINGS', 'YOUR CONTROL']);
    const text = LEGAL_DOCUMENTS.privacy.sections.map(s => s.body).join(' ');
    expect(text).toMatch(/30 days/);
    expect(text).toMatch(/12 months/);
    expect(text).toMatch(/Deleting your Eiyu account does not recall delivered messages/);
    expect(text).toMatch(/zero-data-retention control applies to inference content/);
  });
  it('response wording separates active records, backups and logs, delivered mail, user exports and old offline copies', () => {
    expect(DATA_REQUEST_RESPONSE).not.toMatch(/draft/i);
    for (const part of [/Active records:/, /Backups and logs:/, /Email already sent:/, /Your own copies:/, /old app version/, /AI:/, /within 7 days and finish within 30 days/]) {
      expect(DATA_REQUEST_RESPONSE).toMatch(part);
    }
    expect(DATA_REQUEST_RESPONSE).toMatch(/never ask for your password, a code or an ID/);
    const control = LEGAL_DOCUMENTS.privacy.sections.find(s => s.heading === 'YOUR CONTROL')!.body;
    expect(control).toMatch(/backups/i);
    expect(control).toMatch(/old offline|old app/i);
  });
});

describe('backup wording', () => {
  const all = () => [...LEGAL_DOCUMENTS.privacy.sections.map(s => s.body), DATA_REQUEST_RESPONSE].join(' ');
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

describe('tracker purpose notices', () => {
  it('has one notice per purpose, at the version the server accepts', () => {
    expect(Object.keys(TRACKER_PURPOSE_NOTICES).sort()).toEqual(['custom-tracker', 'fitness-tracking']);
    for (const purpose of ['custom-tracker', 'fitness-tracking'] as const) {
      expect(TRACKER_PURPOSE_NOTICES[purpose].version).toBe(TRACKER_NOTICE_VERSIONS[purpose]);
      expect(TRACKER_PURPOSE_NOTICES[purpose].label.length).toBeGreaterThan(20);
      expect(TRACKER_PURPOSE_NOTICES[purpose].body.length).toBeGreaterThan(40);
    }
  });
  it('keeps the two tracker purposes and the AI permission separate', () => {
    const versions = [TRACKER_PURPOSE_NOTICES['custom-tracker'].version, TRACKER_PURPOSE_NOTICES['fitness-tracking'].version, PROCESSING_NOTICES['weekly-debrief'].version, PROCESSING_NOTICES['age-screening'].version];
    expect(new Set(versions).size).toBe(4);
    for (const notice of Object.values(TRACKER_PURPOSE_NOTICES)) expect(`${notice.label} ${notice.body}`).toMatch(/does not give permission for AI/i);
  });
  it('says what each purpose covers and that the information may be sensitive', () => {
    expect(TRACKER_PURPOSE_NOTICES['custom-tracker'].label).toMatch(/custom quest and chain names, descriptions and progress/i);
    expect(TRACKER_PURPOSE_NOTICES['fitness-tracking'].label).toMatch(/routines, exercise details, weights and workout progress/i);
    for (const notice of Object.values(TRACKER_PURPOSE_NOTICES)) expect(notice.label).toMatch(/sensitive/i);
  });
  it('promises withdrawal in Profile with a read-only period rather than instant deletion, and does not promise recall of delivered media', () => {
    for (const notice of Object.values(TRACKER_PURPOSE_NOTICES)) {
      expect(notice.body).toMatch(/Profile/);
      expect(notice.body).toMatch(/read-only/i);
      expect(notice.body).not.toMatch(/deleted (?:right away|immediately)/i);
    }
    expect(TRACKER_PURPOSE_NOTICES['fitness-tracking'].body).toMatch(/media/i);
  });
});
