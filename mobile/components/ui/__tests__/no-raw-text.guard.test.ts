import fs from 'fs';
import path from 'path';

// All app text goes through AppText so the font-scale behaviour is identical everywhere (decision 8).
const ROOT = path.resolve(__dirname, '..', '..', '..');
const ALLOW = new Set([path.join('components', 'ui', 'app-text.tsx')]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx?|jsx?)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)) out.push(full);
  }
  return out;
}

function importsRawText(source: string): boolean {
  const re = /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"]react-native['"]/g;
  for (const match of source.matchAll(re)) {
    const specifiers = match[1].split(',').map(s => s.trim().replace(/^type\s+/, ''));
    if (specifiers.some(s => s === 'Text' || /^Text\s+as\s/.test(s))) return true;
  }
  return false;
}

describe('no raw Text from react-native', () => {
  it('detects a raw Text import (guard self-check)', () => {
    expect(importsRawText("import { View, Text } from 'react-native';")).toBe(true);
    expect(importsRawText("import {\n  Text,\n  View,\n} from 'react-native';")).toBe(true);
    expect(importsRawText("import { Text as T } from 'react-native';")).toBe(true);
    expect(importsRawText("import { View, TextInput } from 'react-native';")).toBe(false);
    expect(importsRawText("import type { TextProps, TextStyle } from 'react-native';")).toBe(false);
  });

  it('is not used by any UI file under app/ or components/', () => {
    const offenders = ['app', 'components']
      .flatMap(dir => walk(path.join(ROOT, dir)))
      .filter(file => !ALLOW.has(path.relative(ROOT, file)))
      .filter(file => importsRawText(fs.readFileSync(file, 'utf8')))
      .map(file => path.relative(ROOT, file));
    expect(offenders).toEqual([]);
  });
});
