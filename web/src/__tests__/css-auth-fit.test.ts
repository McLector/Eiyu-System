import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Structural guards for the sign-in/sign-up fit. The real proof (no scrolling at 1366x625, 1536x730,
// 1920x945) is scripts/verify-layout-fit-browser.cjs auth; jsdom cannot lay anything out.
const css = readFileSync(path.resolve(import.meta.dirname, '..', 'index.css'), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '');
const compact = css.match(/@media \(max-height: 820px\) \{([\s\S]*?)\n\}/)?.[1] ?? '';

describe('sign-in page fit', () => {
  it('has a compact layout for windows up to 820px tall', () => {
    expect(compact).not.toBe('');
  });
  it('tightens the page, card, form and header spacing in the compact layout', () => {
    for (const selector of ['.auth-page', '.auth-card', '.auth-accent-line', '.auth-form', '.auth-label', '.auth-switch', '.auth-brand', '.auth-mark']) {
      expect(compact, selector).toContain(selector);
    }
  });
  it('puts the mark beside the title in the compact layout instead of above it', () => {
    expect(compact).toMatch(/\.auth-brand\s*\{[^}]*flex-direction:\s*row/);
  });
  it('keeps the roomy layout for taller windows', () => {
    expect(css).toMatch(/\.auth-page\s*\{[^}]*padding:\s*32px 16px/);
    expect(css).toMatch(/\.auth-mark\s*\{[^}]*width:\s*56px/);
  });
  it('keeps the labels at their old line height in the roomy layout and tightens it only when compact', () => {
    // .field-label sets 1.2; the labels used to inherit about 1.5, which is 13px of height across sign-up.
    expect(css).toMatch(/\.auth-label\s*\{[^}]*line-height:\s*1\.5/);
    expect(compact).toMatch(/\.auth-label\s*\{[^}]*line-height:\s*1\.2/);
  });
  it('never shrinks the form below usable sizes', () => {
    expect(compact).not.toMatch(/font-size:\s*(?:[0-9]|10)px/);
    expect(compact).not.toMatch(/\.auth-page\s*\{[^}]*padding:\s*(?:[0-7])px/);
  });
});
