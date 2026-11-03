import type { TrackerAccess } from '@eiyu/shared';

export const OWNER = 'owner-a';

export function trackerAccess(over: Partial<TrackerAccess> = {}, owner = OWNER): TrackerAccess {
  return {
    contractVersion: 1,
    revision: { userId: owner, ageVersion: 1, consentVersion: 1, authorityVersion: 0 },
    canWriteBasic: true, customConsent: true, fitnessConsent: true,
    customAuthorityState: 'not-required', fitnessAuthorityState: 'not-required',
    canWriteCustom: true, canWriteFitness: true,
    ...over,
  };
}

export const noGrant = (owner = OWNER) => trackerAccess({
  customConsent: false, fitnessConsent: false, canWriteCustom: false, canWriteFitness: false,
}, owner);

/** What the server adds to a classified, writable quest or chain. Spread it into a test's quest literals. */
export const CLASSIFIED = { inputKind: 'basic', canWrite: true } as const;

/**
 * The tracker reads and preparation a store needs, as jest functions with working defaults. Spread them into the test's
 * `@eiyu/shared` mock (the variable must be named `mock...`) and call `resetTrackerMocks` in `beforeEach`.
 */
export function createTrackerMocks() {
  return {
    fetchTrackerAccess: jest.fn(),
    fetchTrackerTargets: jest.fn(),
    prepareDay: jest.fn(),
    subscribeTrackerAccessChanges: jest.fn(),
  };
}

export function resetTrackerMocks(mocks: ReturnType<typeof createTrackerMocks>, owner = 'user-1', over: Partial<TrackerAccess> = {}) {
  mocks.fetchTrackerAccess.mockReset().mockImplementation(async () => trackerAccess(over, owner));
  mocks.fetchTrackerTargets.mockReset().mockImplementation(async (kind: string, ids: string[]) => ids.map(id => ({ kind, id, inputKind: 'basic', canWrite: true })));
  mocks.prepareDay.mockReset().mockResolvedValue({ basicPrepared: true, protectedPrepared: true, accessChanged: false });
  mocks.subscribeTrackerAccessChanges.mockReset().mockReturnValue(() => undefined);
}

/** The revision a default capability for `owner` carries, and the snapshot list for one basic root. */
export const revisionOf = (owner = 'user-1') => trackerAccess({}, owner).revision;
export const basicTarget = (id: string, kind: 'habit' | 'chain' = 'habit') => [{ kind, id, inputKind: 'basic' as const }];
