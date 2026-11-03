import { trackerAccess } from './tracker-fixtures';

/** Stand-ins for the tracker functions of @eiyu/shared, for tests that only need the store to see a fully granted owner. */
export function trackerSharedMocks(owner: string, over: Parameters<typeof trackerAccess>[0] = {}) {
  return {
    fetchTrackerAccess: async () => trackerAccess(over, owner),
    prepareDay: async () => ({ basicPrepared: true, protectedPrepared: true, accessChanged: false }),
    subscribeTrackerAccessChanges: () => () => undefined,
    trackerErrorKind: () => null,
  };
}
