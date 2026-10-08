import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Structural guards for the layout-fit work. jsdom cannot lay anything out, so the real proof that rows
// fit is scripts/verify-layout-fit-browser.cjs; these tests only stop the numbers it depends on drifting.
const css = readFileSync(path.resolve(import.meta.dirname, '..', 'index.css'), 'utf-8');
// Comments sit between rules, so left in they would become part of the next rule's selector.
const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)].map(m => ({ selector: m[1].trim(), body: m[2] }));
const body = (selector: string) => rules.filter(r => r.selector === selector).map(r => r.body).join(';');
const px = (source: string, property: string) => Number(source.match(new RegExp(`(?:^|[;\\s])${property}:\\s*(\\d+)px`))?.[1]);

describe('Daily Quest row fit', () => {
  it('uses a compact quest card so one more row fits in a lane', () => {
    expect(px(body('.quest-card'), 'height')).toBe(72);
  });
  it('keeps the card tall enough for its tallest content (grip 40px + padding)', () => {
    expect(px(body('.quest-card'), 'height')).toBeGreaterThanOrEqual(64);
  });
  it('spaces cards by 6px', () => {
    expect(px(body('.paged-list-body'), 'gap')).toBe(6);
  });
  it('trims the lane header so the list gets the saved height', () => {
    const padding = body('.board-lane-header').match(/padding:\s*(\d+)px (\d+)px (\d+)px/);
    expect(padding?.slice(1).map(Number)).toEqual([12, 14, 10]);
  });
  it('keeps the card and gap comment in step with the numbers', () => {
    expect(css).not.toMatch(/fixed 80px/);
  });
});
