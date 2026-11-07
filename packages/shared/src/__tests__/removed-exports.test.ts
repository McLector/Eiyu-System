jest.mock('../supabase/client', () => ({supabase: {rpc: jest.fn(), auth: {getSession: jest.fn()}, functions: {invoke: jest.fn()}}}));
import * as shared from '../index';

// The birthday flow, the operator console, the per-purpose tracker notices and the Google birthday finish are gone
// (S03b). A removed name that comes back would bring a birthday back into a client.
describe('the shared package after the age simplification', () => {
  it.each([
    'validateBirthday', 'validateSignupBirthday', 'initialBirthdayMetadata', 'finishGoogleSignup',
    'fetchAccountAge', 'setAccountBirthday', 'requireAdultDeclaration', 'parseAccountAge', 'notifyAccountAgeChanged',
    'subscribeAccountAgeChanges', 'ADULT_AI_MESSAGE', 'AGE_NOTICE_VERSION', 'PROCESSING_AUTHORITY_REVIEW',
    'CHILD_PRIVACY_NOTICE', 'TRACKER_PURPOSE_NOTICES', 'needsGoogleSignupFinish',
  ])('does not export %s', name => {
    expect((shared as Record<string, unknown>)[name]).toBeUndefined();
  });
  it('exports no operator function', () => {
    expect(Object.keys(shared).filter(name => /^operator|Operator/.test(name))).toEqual([]);
  });
  it.each([
    'TERMS_VERSION', 'ADULT_NOTICE_VERSION', 'AI_NOTICE_VERSION', 'fetchTermsStatus', 'acceptTerms',
    'needsTermsAcceptance', 'signupMetadata', 'setProcessingConsent', 'PROCESSING_ACCESS_MESSAGE',
  ])('exports %s', name => {
    expect((shared as Record<string, unknown>)[name]).toBeDefined();
  });
});
