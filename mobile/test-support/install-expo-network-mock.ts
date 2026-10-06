/**
 * Puts a test's own functions on the one `expo-network` module object that the code under test also loads.
 *
 * `jest.mock('expo-network', ...)` / `jest.doMock(...)` swap the whole module through a module-id lookup. In a full
 * parallel run that swap was intermittently not applied: the store and the write-queue hook then called the real
 * module, the mock was never reached, and the suite waited out its deadline (about one full run in three). Assigning
 * onto the shared module object does not depend on that lookup, so the tests see the same functions the code calls.
 */
export function installExpoNetworkMock(mock: { getNetworkStateAsync: unknown; addNetworkStateListener: unknown }): void {
  const real = require('expo-network') as Record<string, unknown>;
  real.getNetworkStateAsync = mock.getNetworkStateAsync;
  real.addNetworkStateListener = mock.addNetworkStateListener;
}
