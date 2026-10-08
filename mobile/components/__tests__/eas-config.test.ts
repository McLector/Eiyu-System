import { readFileSync } from 'node:fs';
import path from 'node:path';

type Profile = {
  developmentClient?: boolean;
  distribution?: string;
  channel?: string;
  environment?: string;
  node?: string;
  autoIncrement?: boolean;
  env?: Record<string, string>;
  android?: { buildType?: string };
};

const easJson = JSON.parse(readFileSync(path.resolve(__dirname, '..', '..', 'eas.json'), 'utf-8')) as {
  build: Record<string, Profile>;
};
const appConfig = jest.requireActual('../../app.config.js') as { VARIANTS: Record<string, unknown> };
const NAMES = ['development', 'preview', 'production'];

describe('eas.json build profiles', () => {
  it('has one profile for each app variant and no others', () => {
    expect(Object.keys(easJson.build).sort()).toEqual(Object.keys(appConfig.VARIANTS).sort());
  });

  it.each(NAMES)('%s builds its own variant against its own EAS environment', name => {
    expect(easJson.build[name].env?.APP_VARIANT).toBe(name);
    expect(easJson.build[name].environment).toBe(name);
  });

  it.each(NAMES)('%s pins the Node version the repo uses', name => {
    expect(easJson.build[name].node).toMatch(/^22\./);
  });

  it('makes the development profile a development client, and the others not', () => {
    expect(easJson.build.development.developmentClient).toBe(true);
    expect(easJson.build.preview.developmentClient).toBeUndefined();
    expect(easJson.build.production.developmentClient).toBeUndefined();
  });

  it('gives preview and production their own update channels', () => {
    expect(easJson.build.preview.channel).toBe('preview');
    expect(easJson.build.production.channel).toBe('production');
  });

  it.each(NAMES)('%s produces an installable APK, because the app is sideloaded', name => {
    expect(easJson.build[name].android?.buildType).toBe('apk');
  });

  it('counts up the production version code by itself', () => {
    expect(easJson.build.production.autoIncrement).toBe(true);
  });

  it('puts no secrets in the committed build env', () => {
    for (const profile of Object.values(easJson.build)) {
      expect(Object.keys(profile.env ?? {})).toEqual(['APP_VARIANT']);
    }
  });
});
