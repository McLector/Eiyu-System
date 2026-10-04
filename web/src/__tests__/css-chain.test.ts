import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, '..', 'index.css'), 'utf8').replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...css.matchAll(/(?:^|\n)([^{}\n@][^{}]*)\{([^}]*)\}/g)].map(m => ({ selector: m[1].trim(), body: m[2] }));

describe('chain progression and quest card stylesheet', () => {
  it('keeps every chain, chip and card label at 11px or larger', () => {
    const small = rules
      .filter(rule => /\.chain-|\.quest-chip|\.quest-card/.test(rule.selector))
      .flatMap(rule => [...rule.body.matchAll(/font:\s*(?:[\w-]+\s+)*?(\d+(?:\.\d+)?)px/g)].filter(m => Number(m[1]) < 11).map(() => rule.selector));
    expect(small).toEqual([]);
  });
  it('no longer ships the journey map', () => {
    expect(css).not.toMatch(/\.journey/);
    expect(css).not.toMatch(/checkpoint/);
  });
  it('wraps long chain text instead of overflowing', () => {
    for (const selector of ['.chain-description', '.chain-stage-description', '.chain-title']) {
      const rule = rules.find(r => r.selector === selector);
      expect(rule?.body, selector).toMatch(/overflow-wrap:\s*anywhere/);
    }
  });
});
