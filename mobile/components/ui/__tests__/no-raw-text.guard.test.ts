import fs from 'fs';
import path from 'path';

// All app text goes through AppText so the font-scale behaviour is identical everywhere (decision 8).
const ROOT = path.resolve(__dirname, '..', '..', '..');
const ALLOW = new Set([path.join('components', 'ui', 'app-text.tsx')]);
const ALLOW_INPUT = new Set([path.join('components', 'ui', 'app-text-input.tsx')]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx?|jsx?)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)) out.push(full);
  }
  return out;
}

/** A default, namespace or require import can reach every component, so the guard cannot see what it uses. */
function importsWholeModule(source: string): boolean {
  return /import\s+(?!type\b)(?:\*\s*as\s+\w+|\w+)[^;'"]*from\s*['"]react-native['"]/.test(source)
    || /require\(\s*['"]react-native['"]\s*\)/.test(source);
}

function importsNamed(source: string, name: string): boolean {
  const re = /(?:import|export)\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"]react-native['"]/g;
  for (const match of source.matchAll(re)) {
    const specifiers = match[1].split(',').map(s => s.trim());
    if (specifiers.some(s => s === name || new RegExp(`^${name}\\s+as\\s`).test(s))) return true;
  }
  return false;
}

const importsRawText = (source: string) => importsNamed(source, 'Text') || importsWholeModule(source);
const importsRawInput = (source: string) => importsNamed(source, 'TextInput') || importsWholeModule(source);

describe('no raw Text from react-native', () => {
  it('detects a raw Text import (guard self-check)', () => {
    expect(importsRawText("import { View, Text } from 'react-native';")).toBe(true);
    expect(importsRawText("import {\n  Text,\n  View,\n} from 'react-native';")).toBe(true);
    expect(importsRawText("import { Text as T } from 'react-native';")).toBe(true);
    expect(importsRawText("import { View, TextInput } from 'react-native';")).toBe(false);
    expect(importsRawText("import type { TextProps, TextStyle } from 'react-native';")).toBe(false);
  });

  it.each([
    ['a default import', "import RN from 'react-native';"],
    ['a namespace import', "import * as RN from 'react-native';"],
    ['a require', "const { Text } = require('react-native');"],
  ])('treats %s as reaching the raw components (guard self-check)', (_name, source) => {
    expect(importsRawText(source)).toBe(true);
    expect(importsRawInput(source)).toBe(true);
  });

  it('sees a re-export of the raw components (guard self-check)', () => {
    expect(importsRawText("export { Text } from 'react-native';")).toBe(true);
    expect(importsRawInput("export { TextInput } from 'react-native';")).toBe(true);
  });

  it('detects a raw TextInput import, but not its types (guard self-check)', () => {
    expect(importsRawInput("import { View, TextInput } from 'react-native';")).toBe(true);
    expect(importsRawInput("import { TextInput as Box } from 'react-native';")).toBe(true);
    expect(importsRawInput("import { View, type TextInputProps } from 'react-native';")).toBe(false);
    expect(importsRawInput("import { View, Text } from 'react-native';")).toBe(false);
  });

  it('leaves an unrelated module alone (guard self-check)', () => {
    expect(importsRawText("import RN from 'react-native-svg';")).toBe(false);
    expect(importsRawInput("import type RN from 'react-native';")).toBe(false);
  });

  it('is not used by any UI file under app/ or components/', () => {
    const offenders = ['app', 'components']
      .flatMap(dir => walk(path.join(ROOT, dir)))
      .filter(file => !ALLOW.has(path.relative(ROOT, file)))
      .filter(file => importsRawText(fs.readFileSync(file, 'utf8')))
      .map(file => path.relative(ROOT, file));
    expect(offenders).toEqual([]);
  });

  it('has no raw TextInput in any UI file under app/ or components/', () => {
    const offenders = ['app', 'components']
      .flatMap(dir => walk(path.join(ROOT, dir)))
      .filter(file => !ALLOW_INPUT.has(path.relative(ROOT, file)))
      .filter(file => importsRawInput(fs.readFileSync(file, 'utf8')))
      .map(file => path.relative(ROOT, file));
    expect(offenders).toEqual([]);
  });
});
