import {signupMetadata} from '../processing-consent';
import * as consent from '../processing-consent';

describe('signupMetadata', () => {
  it('carries only the Terms version the server accepts', () => {
    expect(signupMetadata()).toEqual({terms: {version: '2026-11-08-terms-v2'}});
  });
  it('never carries a birthday or the old consent keys', () => {
    const text = JSON.stringify(signupMetadata());
    expect(text).not.toMatch(/birth|processing_consent|age_screening|notice_version/i);
  });
  it('returns a fresh object each time, so a caller cannot change the next sign-up', () => {
    const first = signupMetadata(); first.terms.version = 'changed';
    expect(signupMetadata().terms.version).toBe('2026-11-08-terms-v2');
  });
  it('no longer exports the birthday helpers', () => {
    const exported = consent as Record<string, unknown>;
    expect(exported.initialBirthdayMetadata).toBeUndefined();
    expect(exported.validateSignupBirthday).toBeUndefined();
  });
});
