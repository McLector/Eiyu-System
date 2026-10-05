import { readFileSync } from 'node:fs';
import path from 'node:path';

import { PALETTE_TOKENS } from '@eiyu/shared';

type SplashOptions = { backgroundColor: string; dark?: { backgroundColor?: string } };
const config = JSON.parse(readFileSync(path.resolve(__dirname, '..', '..', 'app.json'), 'utf-8')) as {
  expo: { plugins: (string | [string, SplashOptions])[] };
};
const splash = config.expo.plugins.find((plugin): plugin is [string, SplashOptions] => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen')![1];

describe('flat splash', () => {
  it('uses the default palette page colour in light mode, not white', () => {
    expect(splash.backgroundColor.toLowerCase()).toBe(PALETTE_TOKENS.cyan.light['page-flat'].toLowerCase());
  });

  it('uses the default palette page colour in dark mode, not black', () => {
    expect(splash.dark?.backgroundColor?.toLowerCase()).toBe(PALETTE_TOKENS.cyan.dark['page-flat'].toLowerCase());
  });
});
