import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, '..', 'index.css'), 'utf8').replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...css.matchAll(/(?:^|\n)([^{}\n@][^{}]*)\{([^}]*)\}/g)].map(m => ({ selector: m[1].trim(), body: m[2] }));
const body = (selector: string) => rules.filter(rule => rule.selector === selector).map(rule => rule.body).join(' ');

describe('Gym exercise detail stylesheet', () => {
  it('keeps the video in a capped column with the notes beside it, not stretched across the pane', () => {
    expect(body('.gym-detail-main')).toMatch(/display:\s*grid/);
    expect(body('.gym-detail-main')).toMatch(/grid-template-columns:\s*minmax\(0,\s*360px\)\s+minmax\(0,\s*1fr\)/);
    expect(body('.gym-media')).toMatch(/max-width:\s*100%/);
    expect(body('.gym-media')).toMatch(/aspect-ratio:\s*16\s*\/\s*9/);
  });
  it('lets long notes scroll in their column instead of growing the pane', () => {
    expect(body('.gym-notes')).toMatch(/overflow-y:\s*auto/);
    expect(body('.gym-notes')).toMatch(/max-height:\s*\d+px/);
    expect(body('.gym-notes')).toMatch(/overflow-wrap:\s*anywhere/);
  });
  it('stacks the video and notes on narrow screens', () => {
    const stacked = css.match(/@media \(max-width: 767px\) \{([^@]*)\}\s*\n/g)?.join('') ?? '';
    expect(stacked).toMatch(/\.gym-detail-main\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  });
  it('keeps the Current weight input small instead of filling its tile', () => {
    const width = /(?:^|;)\s*width:\s*(\d+(?:\.\d+)?)rem/.exec(body('.gym-weight'));
    expect(width, 'an explicit rem width').not.toBeNull();
    expect(Number(width![1])).toBeLessThanOrEqual(8);
    expect(body('.gym-log')).toMatch(/display:\s*flex/);
  });
  it('no longer styles the workout footer or the old full-width weight field', () => {
    for (const gone of ['.gym-session-actions', '.gym-weight-field']) expect(css, gone).not.toContain(gone);
  });
});
