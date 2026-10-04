import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = join(__dirname, '..');
const css = readFileSync(join(src, 'index.css'), 'utf8').replace(/\r\n/g, '\n');
const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : sources(full);
    return /\.tsx?$/.test(name) ? [readFileSync(full, 'utf8')] : [];
  });
}
const code = sources(src).join('\n') + readFileSync(join(src, '..', 'index.html'), 'utf8');

describe('stylesheet hygiene', () => {
  it('has no class selector that no component uses', () => {
    const names = new Set([...bare.replace(/url\([^)]*\)/g, '').matchAll(/\.([a-zA-Z][\w-]*)/g)].map(m => m[1]));
    // Classes built from a template (`is-${kind}`) never appear whole in source.
    const dynamic = new Set(['is-loading', 'is-empty', 'is-error']);
    const unused = [...names].filter(n => !dynamic.has(n) && !new RegExp(`(?<![\\w-])${n}(?![\\w-])`).test(code));
    expect(unused.sort()).toEqual([]);
  });
  it('has no unused keyframes', () => {
    const frames = [...bare.matchAll(/@keyframes\s+([\w-]+)/g)].map(m => m[1]);
    const unused = frames.filter(name => !new RegExp(`animation(-name)?:[^;}]*\\b${name}\\b`).test(bare) && !code.includes(name));
    expect(unused).toEqual([]);
  });
  it('does not ship the retired Sidebar', () => {
    expect(() => readFileSync(join(src, 'web', 'Sidebar.tsx'))).toThrow();
  });
  it('uses the browser default cursor: no custom cursor image and no sword art shipped', () => {
    expect(bare).not.toMatch(/cursor:\s*url\(/);
    expect(existsSync(join(src, '..', 'public', 'art', 'sword-rest.svg'))).toBe(false);
    expect(existsSync(join(src, '..', 'public', 'art', 'sword-action.svg'))).toBe(false);
  });

  it('keeps !important to the few places that must beat an inline style (ratchet: lower, never raise)', () => {
    const count = (bare.match(/!important/g) ?? []).length;
    expect(count).toBeLessThanOrEqual(4);
  });
  it('marks severity with the whole border, not a thick one-sided accent stripe (a known generated-UI tell)', () => {
    expect(bare).not.toMatch(/border-(left|right):\s*[3-9]px solid/);
  });
  it('names its sections instead of leaving per-plan patch comments', () => {
    expect(css).not.toMatch(/\/\*\s*Plan 01[0-9]/);
  });
});
