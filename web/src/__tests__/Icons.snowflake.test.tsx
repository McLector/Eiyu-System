// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { SnowflakeIcon } from '../Icons';

afterEach(cleanup);

// Must stay identical to mobile/components/eiyu/icons.tsx (mobile has the same literal in its own test).
const BRANCHES =
  'M9.88 2.88L12 5L14.12 2.88M10.59 6.59L12 8L13.41 6.59M18.84 5.6L18.06 8.5L20.96 9.28M15.98 8.07L15.46 10L17.4 10.52M20.96 14.72L18.06 15.5L18.84 18.4M17.4 13.48L15.46 14L15.98 15.93M14.12 21.12L12 19L9.88 21.12M13.41 17.41L12 16L10.59 17.41M5.16 18.4L5.94 15.5L3.04 14.72M8.02 15.93L8.54 14L6.6 13.48M3.04 9.28L5.94 8.5L5.16 5.6M6.6 10.52L8.54 10L8.02 8.07';

it('is a six-arm snowflake: three spokes through the centre and two V-branches on every arm', () => {
  const { container } = render(<SnowflakeIcon />);
  const lines = [...container.querySelectorAll('line')].map(l => ['x1', 'y1', 'x2', 'y2'].map(a => l.getAttribute(a)).join(','));
  expect(lines).toEqual(['12,2,12,22', '20.66,7,3.34,17', '20.66,17,3.34,7']);
  const paths = [...container.querySelectorAll('path')].map(p => p.getAttribute('d'));
  expect(paths).toEqual([BRANCHES]);
  expect(BRANCHES.match(/M/g)).toHaveLength(12);
});

it('no longer draws the old plus-and-chevrons glyph', () => {
  const { container } = render(<SnowflakeIcon />);
  const svg = container.innerHTML;
  for (const old of ['M8 6l4-4 4 4', 'M8 18l4 4 4-4', 'M6 8l-4 4 4 4', 'M18 8l4 4-4 4']) expect(svg).not.toContain(old);
});

it('keeps the ice stroke, takes the size and never animates', () => {
  const { container } = render(<SnowflakeIcon size={20} />);
  const svg = container.querySelector('svg')!;
  expect(svg.getAttribute('stroke')).toBe('var(--c-ice)');
  expect(svg.getAttribute('width')).toBe('20');
  expect(container.querySelector('[style*="animation"], [class*="frost"]')).toBeNull();
});
