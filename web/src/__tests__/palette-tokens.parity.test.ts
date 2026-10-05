import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PALETTE_TOKENS, PALETTES } from '@eiyu/shared';

const css = readFileSync(path.resolve(import.meta.dirname, '..', 'index.css'), 'utf-8').replace(/\r\n/g, '\n');
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function tokens(block: RegExp): Map<string, string> {
  const body = css.match(block)?.[1] ?? '';
  return new Map([...body.matchAll(/--c-([a-z0-9-]+)\s*:\s*([^;]+);/gi)].map(m => [m[1], m[2].trim()]));
}
const root = tokens(/:root\s*\{([^}]*)\}/);
const lightBase = tokens(/\[data-theme="light"\]\s*\{([^}]*)\}/);
const darkOf = (id: string) => tokens(new RegExp(`:root\\[data-palette="${esc(id)}"\\]\\s*\\{([^}]*)\\}`));
const lightOf = (id: string) => tokens(new RegExp(`:root\\[data-palette="${esc(id)}"\\]\\s*\\[data-theme="light"\\]\\s*\\{([^}]*)\\}`));
const drop = (m: Map<string, string>) => Object.fromEntries([...m].filter(([, v]) => !v.includes('gradient(')));

describe('shared PALETTE_TOKENS match web/src/index.css', () => {
  it.each(PALETTES.map(p => p.id))('%s dark and light', id => {
    const dark = drop(new Map([...root, ...(id === 'cyan' ? [] : darkOf(id))]));
    const light = drop(new Map([...root, ...lightBase, ...(id === 'cyan' ? [] : lightOf(id))]));
    const hint = 'Regenerate with: node scripts/generate-palette-tokens.cjs';
    expect(PALETTE_TOKENS[id].dark, hint).toEqual(dark);
    expect(PALETTE_TOKENS[id].light, hint).toEqual(light);
  });
  it('never carries a gradient, which mobile cannot use as a colour', () => {
    for (const { id } of PALETTES) for (const mode of ['dark', 'light'] as const)
      for (const [name, value] of Object.entries(PALETTE_TOKENS[id][mode])) expect(value, `${id} ${mode} ${name}`).not.toContain('gradient(');
  });
});
