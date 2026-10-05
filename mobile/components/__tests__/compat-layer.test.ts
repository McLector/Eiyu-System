import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

// Slice 5 deleted the glass-era compatibility layer. This pins it: the old pieces must not come back through an
// import, a dependency, or the old theme shape on the stores.
const ROOT = path.resolve(__dirname, '..', '..');
const SOURCE_DIRS = ['app', 'components', 'contexts', 'lib', 'constants'];

function sourceFiles(dir: string): string[] {
  const full = path.join(ROOT, dir);
  return readdirSync(full, { withFileTypes: true }).flatMap(item => {
    const rel = path.join(dir, item.name);
    if (item.isDirectory()) return item.name === '__tests__' || item.name === 'node_modules' ? [] : sourceFiles(rel);
    return /\.tsx?$/.test(item.name) ? [rel] : [];
  });
}

const FILES = SOURCE_DIRS.flatMap(sourceFiles);
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf-8');

describe('glass-era compatibility layer is gone', () => {
  it('scans real files', () => {
    expect(FILES.length).toBeGreaterThan(50);
    expect(statSync(path.join(ROOT, 'package.json')).isFile()).toBe(true);
  });

  it.each([
    'components/eiyu/glass-view.tsx',
    'components/eiyu/page-background.tsx',
    'components/eiyu/settings-content.tsx',
    'components/eiyu/ghost-button.tsx',
    'components/eiyu/divider.tsx',
    'constants/palette-theme.ts',
  ])('%s no longer exists', file => {
    expect(existsSync(path.join(ROOT, file))).toBe(false);
  });

  it.each(['expo-blur', 'expo-linear-gradient', 'glass-view', 'page-background', 'settings-content', 'ghost-button', 'eiyu/divider', 'palette-theme'])(
    'no source file imports %s',
    name => {
      const offenders = FILES.filter(file => new RegExp(`from ['"][^'"]*${name}['"]|require\\(['"][^'"]*${name}['"]\\)`).test(read(file)));
      expect(offenders).toEqual([]);
    },
  );

  it('does not depend on expo-blur or expo-linear-gradient', () => {
    const pkg = JSON.parse(read('package.json')) as { dependencies?: Record<string, string> };
    expect(Object.keys(pkg.dependencies ?? {})).not.toContain('expo-blur');
    expect(Object.keys(pkg.dependencies ?? {})).not.toContain('expo-linear-gradient');
  });

  it('keeps the old EiyuTheme colour table out of constants and both stores', () => {
    expect(read('constants/eiyu-theme.ts')).not.toMatch(/EiyuTheme|darkTheme|lightTheme|pageGradient/);
    expect(read('contexts/eiyu-store.tsx')).not.toMatch(/EiyuTheme|\bdarkMode\b|setDarkMode/);
    expect(read('contexts/theme-store.tsx')).not.toMatch(/EiyuTheme|buildEiyuTheme/);
  });

  it('keeps the fonts the screens import', () => {
    expect(read('constants/eiyu-theme.ts')).toMatch(/export const fonts/);
  });

  it('has no screen reading the old theme keys (accentGlass, glassBorder, glassSm) from a store', () => {
    const offenders = FILES.filter(file => /\b(accentGlass|accentBorder|glassBorder|glassSm|navBorder)\b/.test(read(file)));
    expect(offenders).toEqual([]);
  });
});
