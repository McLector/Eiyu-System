import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, '..', 'index.css'), 'utf8').replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');
const rule = (selector: string) => css.match(new RegExp(`(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`))?.[1];

describe('Chain stage stylesheet', () => {
  // Measured in the browser: opacity .7 put the "Locked" chip at 2.7-2.8:1 and "Show details" at 2.9-3.1:1 in both themes.
  it('does not fade a locked stage with opacity, which drops its small text below 4.5:1', () => {
    expect(rule('.chain-stage.is-locked') ?? '').not.toMatch(/opacity/);
  });
  it('draws the Locked chip in readable muted text rather than the decorative dim token', () => {
    expect(rule('.quest-chip.is-locked')).toMatch(/color:\s*var\(--c-muted-flat\)/);
  });
});
