import { currentAppScheme, DEFAULT_SCHEME, schemeForApplicationId } from '../app-variant';

let mockApplicationId: string | null | undefined = 'com.mclector.eiyusystem';
let mockThrow = false;

jest.mock('expo-application', () => ({
  get applicationId() {
    if (mockThrow) throw new Error('native module missing');
    return mockApplicationId;
  },
}));

afterEach(() => {
  mockApplicationId = 'com.mclector.eiyusystem';
  mockThrow = false;
});

describe('schemeForApplicationId', () => {
  it.each([
    ['com.mclector.eiyusystem', 'eiyusystem'],
    ['com.mclector.eiyusystem.preview', 'eiyusystem-preview'],
    ['com.mclector.eiyusystem.dev', 'eiyusystem-dev'],
  ])('maps %s to %s', (id, scheme) => {
    expect(schemeForApplicationId(id)).toBe(scheme);
  });

  it.each([
    undefined,
    null,
    '',
    'com.other.app',
    'com.mclector.eiyusystem.staging',
    'com.mclector.eiyusystem.preview.extra',
    'COM.MCLECTOR.EIYUSYSTEM.PREVIEW',
    42 as unknown as string,
  ])('falls back to the production scheme for %p', id => {
    expect(schemeForApplicationId(id)).toBe(DEFAULT_SCHEME);
    expect(DEFAULT_SCHEME).toBe('eiyusystem');
  });
});

describe('currentAppScheme', () => {
  it('reads the running app\'s native application id', () => {
    mockApplicationId = 'com.mclector.eiyusystem.preview';
    expect(currentAppScheme()).toBe('eiyusystem-preview');
  });

  it('falls back when the id is missing, as on a platform without one', () => {
    mockApplicationId = null;
    expect(currentAppScheme()).toBe(DEFAULT_SCHEME);
  });

  it('falls back instead of throwing when the native module is not there (an old build)', () => {
    mockThrow = true;
    expect(currentAppScheme()).toBe(DEFAULT_SCHEME);
  });
});
