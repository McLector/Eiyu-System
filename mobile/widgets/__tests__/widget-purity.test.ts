import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * The widget's task handler runs headless, on Android's schedule, with no screen. Decision D19: no auth and no network in
 * that code. The Supabase client restores and refreshes a session as soon as it is created, so nothing the handler imports
 * may reach it, the stores that own it, or the router. This walks the handler's real import graph.
 */
const mobileRoot = path.resolve(__dirname, '..', '..');
const sharedSrc = path.resolve(mobileRoot, '..', 'packages', 'shared', 'src');
const handler = path.join(mobileRoot, 'widgets', 'widget-task-handler.tsx');

const IMPORT_RE = /^\s*(?:import|export)\s+(type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/gm;
const EXTENSIONS = ['.ts', '.tsx', '/index.ts', '/index.tsx'];

function resolveFile(specifier: string, from: string): string | null {
  let base: string;
  if (specifier.startsWith('.')) base = path.resolve(path.dirname(from), specifier);
  else if (specifier.startsWith('@/')) base = path.join(mobileRoot, specifier.slice(2));
  else if (specifier.startsWith('@eiyu/shared/src/')) base = path.join(sharedSrc, specifier.slice('@eiyu/shared/src/'.length));
  else return null;
  for (const extension of ['', ...EXTENSIONS]) {
    const candidate = base + extension;
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // not a file under this extension: try the next form
    }
  }
  return null;
}

function walk(entry: string) {
  const files = new Set<string>();
  const packages = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (files.has(file)) continue;
    files.add(file);
    const source = readFileSync(file, 'utf-8');
    for (const match of source.matchAll(IMPORT_RE)) {
      const [, typeOnly, specifier] = match;
      if (typeOnly) continue; // erased at build time
      const resolved = resolveFile(specifier, file);
      if (resolved) queue.push(resolved);
      else packages.add(specifier);
    }
  }
  return { files: [...files].map(file => path.relative(mobileRoot, file).replace(/\\/g, '/')), packages: [...packages] };
}

describe('widget task handler import graph', () => {
  const graph = walk(handler);

  it('actually walks the app code it is meant to police', () => {
    expect(graph.files).toEqual(expect.arrayContaining([
      'widgets/widget-task-handler.tsx',
      'widgets/today-widget.tsx',
      'lib/widget-snapshot.ts',
      'lib/write-queue.ts',
    ]));
    expect(graph.files.some(file => file.includes('packages/shared/src/logic/quest-recurrence'))).toBe(true);
    expect(graph.packages).toEqual(expect.arrayContaining(['react-native-android-widget', '@react-native-async-storage/async-storage']));
  });

  it('never reaches the Supabase client or library', () => {
    expect(graph.packages.filter(name => name.includes('supabase'))).toEqual([]);
    expect(graph.files.filter(file => /supabase/i.test(file))).toEqual([]);
  });

  it('never reaches the shared barrel, which re-exports the data layer', () => {
    expect(graph.packages).not.toContain('@eiyu/shared');
  });

  it('never reaches the stores, contexts, router or React Query', () => {
    expect(graph.files.filter(file => /(^|\/)(contexts|app)\//.test(file))).toEqual([]);
    expect(graph.packages.filter(name => /expo-router|@tanstack|react-navigation|expo-notifications|expo-network/.test(name))).toEqual([]);
  });

  it('uses only the packages a headless draw needs', () => {
    // react-native is only for PixelRatio.getFontScale(), the phone's font size.
    const allowed = new Set(['react', 'react-native', 'react-native-android-widget', '@react-native-async-storage/async-storage']);
    expect(graph.packages.filter(name => !allowed.has(name))).toEqual([]);
  });
});
