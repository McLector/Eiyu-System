/**
 * Expo config. `app.json` stays the single source of truth; this only layers the build variant on top of it.
 *
 * Three variants can sit side by side on one phone, because each has its own package and its own deep link scheme:
 *   development  Eiyu Dev      com.mclector.eiyusystem.dev      eiyusystem-dev
 *   preview      Eiyu Preview  com.mclector.eiyusystem.preview  eiyusystem-preview
 *   production   (unchanged)   com.mclector.eiyusystem          eiyusystem
 *
 * The variant comes from the APP_VARIANT environment variable, which each profile in eas.json sets. Unset means
 * production, so local runs and every tool that reads this config behave as before. A value it does not know throws,
 * so a typo can never quietly build the wrong app.
 *
 * Changing a package, a scheme or a native plugin is a native change: bump `runtimeVersion` in app.json and build again.
 */
const VARIANTS = {
  development: { name: 'Eiyu Dev', suffix: '.dev', scheme: 'eiyusystem-dev', widgetLabel: 'Eiyu Dev: Today' },
  preview: { name: 'Eiyu Preview', suffix: '.preview', scheme: 'eiyusystem-preview', widgetLabel: 'Eiyu Preview: Today' },
  production: null,
};

const WIDGET_PLUGIN = 'react-native-android-widget';

function resolveVariant(raw) {
  if (raw === undefined || raw === '') return 'production';
  if (!Object.prototype.hasOwnProperty.call(VARIANTS, raw)) {
    throw new Error(`Unknown APP_VARIANT "${raw}". Use one of: ${Object.keys(VARIANTS).join(', ')} (or leave it unset for production).`);
  }
  return raw;
}

function applyVariant(config, variant) {
  const settings = VARIANTS[resolveVariant(variant)];
  if (!settings) return config;
  const plugins = (config.plugins ?? []).map(plugin => {
    if (!Array.isArray(plugin) || plugin[0] !== WIDGET_PLUGIN) return plugin;
    const widgets = (plugin[1].widgets ?? []).map(widget => ({ ...widget, label: settings.widgetLabel }));
    return [plugin[0], { ...plugin[1], widgets }];
  });
  return {
    ...config,
    name: settings.name,
    scheme: settings.scheme,
    android: { ...config.android, package: `${config.android.package}${settings.suffix}` },
    plugins,
  };
}

module.exports = ({ config }) => applyVariant(config, process.env.APP_VARIANT);
module.exports.applyVariant = applyVariant;
module.exports.resolveVariant = resolveVariant;
module.exports.VARIANTS = VARIANTS;
