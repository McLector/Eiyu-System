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
  it('lays the selected chain beside a 250px chain list and stacks them on narrow screens', () => {
    expect(rules.find(rule => rule.selector === '.chain-layout')?.body).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s+250px/);
    const stacked = css.match(/@media \(max-width: 899px\) \{([^@]*)\}\s*\n/)?.[1] ?? '';
    expect(stacked).toMatch(/\.chain-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    // The picker moves above the chain so you choose before you read.
    expect(stacked).toMatch(/\.chain-nav\s*\{[^}]*order:\s*-1/);
  });
  it('lets a long chain name truncate in the picker instead of pushing its count out', () => {
    expect(rules.find(rule => rule.selector === '.chain-nav-name')?.body).toMatch(/text-overflow:\s*ellipsis/);
    expect(rules.find(rule => rule.selector === '.chain-nav-count')?.body).toMatch(/flex:\s*none/);
  });
  it('no longer styles the accordion that the chain list replaced', () => {
    for (const gone of ['.chain-card', '.chain-head', '.chain-body', '.chain-stage-more', '.long-quest-list']) {
      expect(css, gone).not.toContain(gone);
    }
  });
  // Measured in the browser: opacity .7 put the "Locked" chip at 2.7-2.8:1 and "Show details" at 2.9-3.1:1 in both themes.
  it('does not fade a locked stage with opacity, which drops its small text below 4.5:1', () => {
    const locked = rules.filter(rule => rule.selector === '.chain-stage.is-locked');
    expect(locked.map(rule => rule.body).join('')).not.toMatch(/opacity/);
  });
  it('draws the Locked chip in readable muted text rather than the decorative dim token', () => {
    expect(rules.find(rule => rule.selector === '.quest-chip.is-locked')?.body).toMatch(/color:\s*var\(--c-muted-flat\)/);
  });
});
