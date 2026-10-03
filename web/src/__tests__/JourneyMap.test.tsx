// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it } from 'vitest';
import JourneyMap from '../components/JourneyMap';

afterEach(cleanup);
const quest = (stages: number) => ({
  id: 'q', name: 'Vault', stat: 'INT', description: null, completed_at: null,
  stages: Array.from({ length: stages }, (_, i) => ({ id: `s${i}`, name: `Step ${i + 1}`, done: false, position: i, description: null })),
}) as never;

it('draws a dotted route whose width does not collapse when the map is stretched', () => {
  const { container } = render(<JourneyMap quest={quest(3)} expanded={false} onSelect={() => {}} />);
  const svg = container.querySelector('svg.journey-route')!;
  const dotted = svg.querySelector('path[stroke-dasharray]')!;
  // The map stretches a 100x100 viewBox over a wide, short box; without a non-scaling stroke the line becomes a hairline.
  expect(dotted).toHaveAttribute('vector-effect', 'non-scaling-stroke');
  expect(Number(dotted.getAttribute('stroke-width'))).toBeGreaterThanOrEqual(2);
  expect(dotted.getAttribute('stroke-linecap')).toBe('round');
});

it('backs the route with a dark halo so it stays visible over bright terrain', () => {
  const { container } = render(<JourneyMap quest={quest(3)} expanded={false} onSelect={() => {}} />);
  const paths = [...container.querySelectorAll('svg.journey-route path')];
  expect(paths.length).toBe(2);
  const [halo, dotted] = paths;
  expect(halo).toHaveAttribute('vector-effect', 'non-scaling-stroke');
  expect(Number(halo.getAttribute('stroke-width'))).toBeGreaterThan(Number(dotted.getAttribute('stroke-width')));
  expect(halo.getAttribute('d')).toBe(dotted.getAttribute('d'));
});

it('keeps the route decorative: hidden from assistive technology', () => {
  const { container } = render(<JourneyMap quest={quest(2)} expanded={false} onSelect={() => {}} />);
  expect(container.querySelector('svg.journey-route')).toHaveAttribute('aria-hidden', 'true');
});
