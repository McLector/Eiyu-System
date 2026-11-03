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
