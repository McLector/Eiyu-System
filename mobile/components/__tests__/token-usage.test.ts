import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { PALETTE_TOKENS, PALETTES } from '@eiyu/shared';

// A misspelled token name renders as "no colour" and nothing complains, so every name a component reads is checked here.
const ROOT = path.resolve(__dirname, '..', '..');
const SCAN: string[] = ['components/ui', 'components/board', 'components/eiyu/account-header.tsx', 'components/eiyu/archived-habits-sheet.tsx', 'app/(tabs)/_layout.tsx'];

function sourceFiles(entry: string): string[] {
  const full = path.join(ROOT, entry);
  if (statSync(full).isFile()) return [full];
  return readdirSync(full, { withFileTypes: true }).flatMap(item => {
    if (item.isDirectory()) return item.name === '__tests__' ? [] : sourceFiles(path.join(entry, item.name));
    return /\.tsx?$/.test(item.name) && !/test-theme/.test(item.name) ? [path.join(full, item.name)] : [];
  });
}

function tokensUsedIn(file: string): string[] {
  const code = readFileSync(file, 'utf-8');
  if (!/const t = useTokens\(\)/.test(code)) return [];
  const bracket = [...code.matchAll(/\bt\['([a-z0-9-]+)'\]/g)].map(match => match[1]);
  const dotted = [...code.matchAll(/(?<![\w.])t\.([a-z][a-zA-Z0-9]*)\b/g)].map(match => match[1]);
  return [...new Set([...bracket, ...dotted])];
}

const FILES = SCAN.flatMap(sourceFiles);

describe('palette tokens used by components', () => {
  it('scans real files', () => {
    expect(FILES.length).toBeGreaterThan(10);
    expect(FILES.flatMap(tokensUsedIn).length).toBeGreaterThan(30);
  });

  it.each(FILES.map(file => [path.relative(ROOT, file), file] as [string, string]))('%s only reads tokens that exist in every palette and theme', (_name, file) => {
    const missing: string[] = [];
    for (const token of tokensUsedIn(file)) {
      for (const { id } of PALETTES) for (const mode of ['dark', 'light'] as const) {
        if (typeof PALETTE_TOKENS[id][mode][token] !== 'string') missing.push(`${token} (${id} ${mode})`);
      }
    }
    expect(missing).toEqual([]);
  });
});
