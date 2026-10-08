import appJson from '../../app.json';

type Plugin = string | [string, Record<string, unknown>];
interface ExpoConfig {
  name: string;
  slug: string;
  owner: string;
  version: string;
  scheme: string;
  runtimeVersion: string;
  updates: unknown;
  extra: unknown;
  android: { package: string };
  plugins: Plugin[];
}
interface AppConfigModule {
  (context: { config: ExpoConfig }): ExpoConfig;
  applyVariant: (config: ExpoConfig, variant: string) => ExpoConfig;
  resolveVariant: (raw: string | undefined) => string;
  VARIANTS: Record<string, unknown>;
}

const appConfig = jest.requireActual('../../app.config.js') as AppConfigModule;
const base = appJson.expo as unknown as ExpoConfig;

const EXPECTED = {
  development: { package: 'com.mclector.eiyusystem.dev', scheme: 'eiyusystem-dev', name: 'Eiyu Dev', widgetLabel: 'Eiyu Dev: Today' },
  preview: { package: 'com.mclector.eiyusystem.preview', scheme: 'eiyusystem-preview', name: 'Eiyu Preview', widgetLabel: 'Eiyu Preview: Today' },
  production: { package: 'com.mclector.eiyusystem', scheme: 'eiyusystem', name: 'eiyu-system', widgetLabel: 'Eiyu: Today' },
} as const;
const VARIANTS = Object.keys(EXPECTED) as (keyof typeof EXPECTED)[];

function widgetLabel(config: ExpoConfig): string {
  const plugin = config.plugins.find((item): item is [string, { widgets: { label: string }[] }] => Array.isArray(item) && item[0] === 'react-native-android-widget');
  return plugin![1].widgets[0].label;
}

describe('app config variants', () => {
  it('knows exactly the development, preview and production variants', () => {
    expect(Object.keys(appConfig.VARIANTS).sort()).toEqual([...VARIANTS].sort());
  });

  it('leaves production exactly as app.json has it', () => {
    expect(appConfig.applyVariant(base, 'production')).toEqual(base);
  });

  it.each(VARIANTS)('%s gets its own package, scheme, name and widget label', variant => {
    const config = appConfig.applyVariant(base, variant);
    expect(config.android.package).toBe(EXPECTED[variant].package);
    expect(config.scheme).toBe(EXPECTED[variant].scheme);
    expect(config.name).toBe(EXPECTED[variant].name);
    expect(widgetLabel(config)).toBe(EXPECTED[variant].widgetLabel);
  });

  it('gives every variant a different package and a different scheme, so they install side by side', () => {
    const configs = VARIANTS.map(variant => appConfig.applyVariant(base, variant));
    expect(new Set(configs.map(config => config.android.package)).size).toBe(VARIANTS.length);
    expect(new Set(configs.map(config => config.scheme)).size).toBe(VARIANTS.length);
  });

  it.each(VARIANTS)('%s keeps what must be shared: slug, owner, versions, update url, project id and the other plugins', variant => {
    const config = appConfig.applyVariant(base, variant);
    expect(config.slug).toBe(base.slug);
    expect(config.owner).toBe(base.owner);
    expect(config.version).toBe(base.version);
    expect(config.runtimeVersion).toBe(base.runtimeVersion);
    expect(config.updates).toEqual(base.updates);
    expect(config.extra).toEqual(base.extra);
    expect(config.plugins.map(plugin => (Array.isArray(plugin) ? plugin[0] : plugin))).toEqual(
      base.plugins.map(plugin => (Array.isArray(plugin) ? plugin[0] : plugin)),
    );
  });

  it.each(VARIANTS)('%s keeps every other widget setting', variant => {
    const config = appConfig.applyVariant(base, variant);
    const pick = (value: ExpoConfig) => {
      const plugin = value.plugins.find((item): item is [string, { widgets: Record<string, unknown>[] }] => Array.isArray(item) && item[0] === 'react-native-android-widget')!;
      const { label, ...rest } = plugin[1].widgets[0];
      void label;
      return rest;
    };
    expect(pick(config)).toEqual(pick(base));
  });

  it('does not change the config it is given', () => {
    const before = JSON.stringify(base);
    appConfig.applyVariant(base, 'preview');
    appConfig.applyVariant(base, 'development');
    expect(JSON.stringify(base)).toBe(before);
  });

  it('rejects a variant it does not know instead of quietly building production', () => {
    expect(() => appConfig.applyVariant(base, 'staging')).toThrow(/staging/);
  });
});

describe('resolveVariant', () => {
  it.each([[undefined, 'production'], ['', 'production'], ['development', 'development'], ['preview', 'preview'], ['production', 'production']])(
    'turns %p into %s',
    (raw, expected) => {
      expect(appConfig.resolveVariant(raw as string | undefined)).toBe(expected);
    },
  );

  it.each(['Preview', 'PRODUCTION', 'prod', 'dev', ' preview', '__proto__', 'toString'])('refuses %p with a message that names APP_VARIANT', raw => {
    expect(() => appConfig.resolveVariant(raw)).toThrow(/APP_VARIANT/);
  });
});

describe('the exported config function', () => {
  const original = process.env.APP_VARIANT;
  afterEach(() => {
    if (original === undefined) delete process.env.APP_VARIANT;
    else process.env.APP_VARIANT = original;
  });

  it('builds production when APP_VARIANT is not set, so local runs and tooling are unchanged', () => {
    delete process.env.APP_VARIANT;
    expect(appConfig({ config: base })).toEqual(base);
  });

  it('follows APP_VARIANT', () => {
    process.env.APP_VARIANT = 'preview';
    expect(appConfig({ config: base }).android.package).toBe('com.mclector.eiyusystem.preview');
  });

  it('fails loudly on a mistyped APP_VARIANT', () => {
    process.env.APP_VARIANT = 'previw';
    expect(() => appConfig({ config: base })).toThrow(/APP_VARIANT/);
  });
});
