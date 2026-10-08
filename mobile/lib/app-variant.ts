import * as Application from 'expo-application';

/**
 * Which build of the app this is, told by the native application id (fixed when the app was built and signed). The deep
 * link scheme follows from it, so the home-screen widget opens the app that drew it even when a development, preview and
 * production build are all installed. It is not read from the Expo config on purpose: after an over-the-air update that
 * comes from the update's manifest, which depends on the environment the update was published from.
 */
export const DEFAULT_SCHEME = 'eiyusystem';

const PRODUCTION_ID = 'com.mclector.eiyusystem';
const SCHEME_BY_ID: Readonly<Record<string, string>> = {
  [PRODUCTION_ID]: DEFAULT_SCHEME,
  [`${PRODUCTION_ID}.preview`]: 'eiyusystem-preview',
  [`${PRODUCTION_ID}.dev`]: 'eiyusystem-dev',
};

/** The scheme for an application id, or the production scheme when the id is missing or not one of ours. */
export function schemeForApplicationId(applicationId: string | null | undefined): string {
  return typeof applicationId === 'string' && Object.prototype.hasOwnProperty.call(SCHEME_BY_ID, applicationId)
    ? SCHEME_BY_ID[applicationId]
    : DEFAULT_SCHEME;
}

/** The running app's scheme. Falls back to production when the native module is missing (an old build) or has no id. */
export function currentAppScheme(): string {
  try {
    return schemeForApplicationId(Application.applicationId);
  } catch {
    return DEFAULT_SCHEME;
  }
}
