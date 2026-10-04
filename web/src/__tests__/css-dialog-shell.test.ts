import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, '..', 'index.css'), 'utf8').replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');
const count = (pattern: RegExp) => [...css.matchAll(pattern)].length;

describe('dialog shell stylesheet', () => {
  it('sizes the dialog in exactly one rule (the old file set it six times and later rules silently won)', () => {
    expect(count(/(?:^|\n)\.phase4-dialog\s*\{[^}]*max-height/g)).toBe(1);
  });
  it('has no fixed viewport cap on the body, so a form that fits never scrolls', () => {
    expect(css).not.toMatch(/\.compact-dialog-body\s*\{[^}]*max-height/);
  });
  it('defines the heading once', () => {
    expect(count(/(?:^|\n)\.phase4-dialog-heading\s*\{/g)).toBe(1);
  });
  it('draws corner brackets and the accent rule', () => {
    expect(css).toMatch(/\.phase4-dialog::before/);
    expect(css).toMatch(/\.phase4-dialog::after/);
    expect(css).toMatch(/\.dialog-rule::before/);
  });
  it('styles dialog footers as pill buttons', () => {
    expect(css).toMatch(/\.phase4-dialog \.action-footer \.btn-primary[^{]*\{[^}]*border-radius:\s*999px/);
  });
  it('keeps the Gym upload preview a compact row so the exercise form fits', () => {
    expect(css).toMatch(/\.gym-upload-preview\s*\{[^}]*grid-template-columns/);
    expect(css).toMatch(/\.gym-upload-preview img, \.gym-upload-preview video\s*\{[^}]*height:\s*88px/);
  });
});
