// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { UndoIcon } from '../Icons';

afterEach(cleanup);

it('keeps every UndoIcon path coordinate inside the 24x24 viewBox', () => {
  const { container } = render(<UndoIcon />);
  const d = container.querySelector('path')!.getAttribute('d')!;
  // Walk each command with its running pen position and record every endpoint.
  let x = 0, y = 0, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const record = () => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); };
  for (const [, cmd, args] of d.matchAll(/([a-zA-Z])([^a-zA-Z]*)/g)) {
    const n = (args.match(/-?\d*\.?\d+/g) ?? []).map(Number);
    const rel = cmd === cmd.toLowerCase();
    if (/h/i.test(cmd)) n.forEach(v => { x = rel ? x + v : v; record(); });
    else if (/v/i.test(cmd)) n.forEach(v => { y = rel ? y + v : v; record(); });
    else if (/a/i.test(cmd)) { for (let i = 0; i < n.length; i += 7) { x = rel ? x + n[i + 5] : n[i + 5]; y = rel ? y + n[i + 6] : n[i + 6]; record(); } }
    else { for (let i = 0; i < n.length; i += 2) { x = rel ? x + n[i] : n[i]; y = rel ? y + n[i + 1] : n[i + 1]; record(); } }
  }
  expect(minX).toBeGreaterThanOrEqual(0); expect(minY).toBeGreaterThanOrEqual(0);
  expect(maxX).toBeLessThanOrEqual(23); expect(maxY).toBeLessThanOrEqual(23);
});
