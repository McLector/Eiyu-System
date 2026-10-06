import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const TABS = join(__dirname, '..', '..', 'app', '(tabs)');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? files(full) : /\.tsx?$/.test(name) ? [full] : [];
  });
}

describe('tab screens never compensate for the tab bar themselves', () => {
  const sources = files(TABS).map(path => ({ path, text: readFileSync(path, 'utf8') }));

  it('finds the tab screens', () => {
    expect(sources.length).toBeGreaterThanOrEqual(8);
  });

  it.each(sources.map(s => [s.path.replace(TABS, ''), s.text] as const))('%s has no hard-coded tab bar overlay', (_name, text) => {
    expect(text).not.toMatch(/TAB_BAR_OVERLAY/);
    expect(text).not.toMatch(/paddingBottom:\s*100\b/);
  });
});
