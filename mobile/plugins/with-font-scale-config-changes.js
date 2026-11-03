/**
 * Adds `fontScale` to MainActivity's android:configChanges, so Android hands a system font-size change to the running
 * Activity instead of recreating it (which would drop an unsaved draft, the route and the keyboard). This is the public
 * Activity setting only; nothing here suppresses or caps font scaling. Native change: needs a new build, not an OTA.
 */
const { withAndroidManifest } = require('expo/config-plugins');

const ATTR = 'android:configChanges';
const VALUE = 'fontScale';

function mainActivityOf(androidManifest) {
  const applications = androidManifest && androidManifest.manifest && androidManifest.manifest.application;
  const activities = (applications && applications[0] && applications[0].activity) || [];
  return activities.find(a => a && a.$ && a.$['android:name'] === '.MainActivity') || null;
}

/** Pure manifest transform: adds fontScale once, keeps the existing flags in order, and is safe to run again. */
function addFontScaleConfigChange(androidManifest) {
  const activity = mainActivityOf(androidManifest);
  if (!activity) throw new Error('with-font-scale-config-changes: could not find .MainActivity in AndroidManifest.xml');
  const current = activity.$[ATTR];
  const flags = current ? current.split('|').filter(Boolean) : [];
  if (!flags.includes(VALUE)) activity.$[ATTR] = [...flags, VALUE].join('|');
  return androidManifest;
}

const withFontScaleConfigChanges = config =>
  withAndroidManifest(config, mod => {
    mod.modResults = addFontScaleConfigChange(mod.modResults);
    return mod;
  });

module.exports = withFontScaleConfigChanges;
module.exports.addFontScaleConfigChange = addFontScaleConfigChange;
