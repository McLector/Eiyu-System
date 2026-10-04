import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = join(__dirname, '..');
const css = readFileSync(join(src, 'index.css'), 'utf8').replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');

function tsxSources(dir = src): { file: string; text: string }[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : tsxSources(full);
    return /\.tsx$/.test(name) ? [{ file: relative(src, full).replace(/\\/g, '/'), text: readFileSync(full, 'utf8') }] : [];
  });
}

/** Top-level CSS chunks (rules and at-rules) split by brace depth. */
function topLevel(text: string): string[] {
  const chunks: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') depth++;
    if (text[i] === '}') { depth--; if (depth === 0) { chunks.push(text.slice(start, i + 1).trim()); start = i + 1; } }
  }
  return chunks;
}
const chunks = topLevel(css);
const keyframes = chunks.filter(c => c.startsWith('@keyframes'));
const bodiesFor = (needle: RegExp) => chunks.filter(c => !c.startsWith('@') && needle.test(c.split('{')[0].trim())).map(c => c.slice(c.indexOf('{') + 1)).join(';');

describe('only compositor properties animate', () => {
  const SLOW = /\b(box-shadow|text-shadow|filter|width|height|left|top|right|bottom|margin|padding)\s*:/;
  it('no keyframes animate paint or layout properties', () => {
    const offenders = keyframes.filter(k => SLOW.test(k.slice(k.indexOf('{') + 1))).map(k => k.split('{')[0].trim());
    expect(offenders).toEqual([]);
  });
  it('no stylesheet transition names a layout property or "all"', () => {
    const transitions = [...css.matchAll(/transition:\s*([^;}]+)/g)].map(m => m[1]);
    expect(transitions.filter(t => /\b(all|left|top|width|height|margin|padding)\b/.test(t))).toEqual([]);
  });
  it('no component animates "all" or a layout property inline', () => {
    const offenders = tsxSources().flatMap(({ file, text }) =>
      [...text.matchAll(/transition:\s*'([^']*)'/g)].filter(m => /\b(all|left|top|width|height)\b/.test(m[1])).map(m => `${file}: ${m[1]}`));
    expect(offenders).toEqual([]);
  });
});

describe('shared easing and duration tokens', () => {
  it('uses tokens instead of keyword easings for the interactive transitions', () => {
    const shared = css.match(/\.btn-primary,\s*\.btn-secondary,[^{]*\{([^}]*)\}/)?.[1] ?? '';
    expect(shared).toMatch(/transform var\(--dur-press\) var\(--ease-out\)/);
  });
  it('inline progress transitions use the 300ms in-out token, not a literal', () => {
    const offenders = tsxSources().flatMap(({ file, text }) =>
      [...text.matchAll(/transition:\s*'transform ([^']*)'/g)].filter(m => /\d+(\.\d+)?s\b/.test(m[1])).map(m => `${file}: ${m[1]}`));
    expect(offenders).toEqual([]);
  });
});

describe('press feedback', () => {
  it('scales every button role slightly on press, only when it is enabled', () => {
    const active = css.match(/\.btn-primary:active:not\(:disabled\)[^{]*\{([^}]*)\}/)?.[1] ?? '';
    expect(active).toMatch(/transform:\s*scale\(0\.97\)/);
    for (const role of ['.btn-secondary', '.btn-quiet', '.btn-destructive', '.btn-ghost']) {
      expect(css).toContain(`${role}:active:not(:disabled)`);
    }
  });
  it('gives the chips the same press response', () => {
    expect(css).toMatch(/\.stat-chip:active[^{]*\{[^}]*scale\(0\.97\)/);
    expect(css).toMatch(/\.choice-chip:active[^{]*\{[^}]*scale\(0\.97\)/);
  });
});

describe('entrances', () => {
  it('fades the dialog overlay and scales the panel in from 96%, centred', () => {
    const starting = chunks.filter(c => c.startsWith('@media (prefers-reduced-motion: no-preference)') || c.startsWith('@starting-style')).join('\n');
    expect(starting).toMatch(/\.phase4-overlay\s*\{\s*opacity:\s*0/);
    expect(starting).toMatch(/\.phase4-dialog\s*\{[^}]*opacity:\s*0[^}]*scale\(0\.96\)/);
    expect(bodiesFor(/^\.phase4-dialog$/)).toMatch(/transition:[^;]*transform var\(--dur-base\) var\(--ease-out\)/);
  });
  it('grows the account menu from its trigger corner', () => {
    expect(bodiesFor(/^\.phase4-account-menu$/)).toMatch(/transform-origin:\s*top right/);
    expect(chunks.join('\n')).toMatch(/\.phase4-account-menu\s*\{[^}]*scale\(0\.97\)/);
  });
  it('grows the row action menu from its trigger corner, the same way', () => {
    expect(bodiesFor(/^\.action-menu$/)).toMatch(/transform-origin:\s*top right/);
    expect(chunks.join('\n')).toMatch(/\.action-menu\s*\{[^}]*scale\(0\.97\)/);
  });
  it('slides feedback cards in with transitions, and the reward card from below on the drawer curve', () => {
    expect(bodiesFor(/^\.feedback-card$/)).toMatch(/transition:[^;]*var\(--ease-out\)/);
    expect(bodiesFor(/^\.reward-feedback$/)).toMatch(/transition:[^;]*500ms var\(--ease-drawer\)/);
    expect(chunks.join('\n')).toMatch(/\.reward-feedback\s*\{[^}]*translateY\(100%\)/);
  });
  it('keeps every transform entrance inside a no-preference media block so reduced motion only fades', () => {
    const offenders = chunks
      .filter(c => /@starting-style/.test(c) && /(scale|translate)/.test(c.slice(c.indexOf('@starting-style'))))
      .filter(c => !c.startsWith('@media (prefers-reduced-motion: no-preference)'));
    expect(offenders).toEqual([]);
  });
});

describe('ambient loops', () => {
  it('has no infinite glow on the logo, and no animated drop-shadow on the streak flame', () => {
    expect(css).not.toMatch(/@keyframes eiyuStar/);
    expect(css).not.toMatch(/@keyframes fireGlow/);
    expect(css).not.toMatch(/animation:\s*eiyuStar/);
  });
  it('pulses the available checkpoint by opacity on a pseudo-element, not by box-shadow', () => {
    const k = keyframes.find(c => c.startsWith('@keyframes checkpoint-light'))!;
    expect(k).toMatch(/opacity/);
    expect(k).not.toMatch(/box-shadow/);
    expect(css).toMatch(/\.journey-checkpoint\.available \.journey-checkpoint-icon::after/);
  });
  it('moves the hero with a transform on a wrapper, not left/top', () => {
    expect(bodiesFor(/^\.journey-hero$/)).not.toMatch(/transition/);
    expect(bodiesFor(/^\.journey-hero-track$/)).toMatch(/transition:\s*transform 600ms var\(--ease-in-out\)/);
  });
});

describe('reduced motion', () => {
  const reduce = chunks.filter(c => c.startsWith('@media (prefers-reduced-motion: reduce)')).join('\n');
  it('drops the press scale, the hero travel and the checkpoint pulse', () => {
    expect(reduce).toMatch(/\.btn-primary:active/);
    expect(reduce).toMatch(/\.journey-hero-track\s*\{\s*transition:\s*none/);
    expect(reduce).toMatch(/\.journey-checkpoint\.available \.journey-checkpoint-icon::after\s*\{\s*animation:\s*none/);
  });
});
