// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { RewardReceipt } from '@eiyu/shared';
import WebSettings from '../web/WebSettings';
import JourneyMap from '../components/JourneyMap';
import FireStreak from '../FireStreak';
import RewardFeedback from '../components/RewardFeedback';

afterEach(cleanup);
beforeEach(() => { vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true }))); });
afterEach(() => vi.unstubAllGlobals());

it('slides the dark-mode knob with a transform and never animates its left offset', () => {
  const props = { darkMode: false, onToggleDark: vi.fn(), onShowHistory: vi.fn(), onLogout: vi.fn() };
  const { rerender } = render(<WebSettings {...props} />);
  const knob = () => screen.getByRole('switch', { name: 'Dark mode' }).firstElementChild as HTMLElement;
  expect(knob().style.left).toBe('2px');
  expect(knob().style.transform).toBe('translateX(0px)');
  rerender(<WebSettings {...props} darkMode />);
  expect(knob().style.left).toBe('2px');
  expect(knob().style.transform).toBe('translateX(20px)');
  expect(knob().style.transition).toMatch(/transform/);
  expect(knob().style.transition).not.toMatch(/\bleft\b|\ball\b/);
  fireEvent.click(screen.getByRole('switch', { name: 'Dark mode' }));
  expect(props.onToggleDark).toHaveBeenCalledOnce();
});

const quest = (done: number) => ({
  id: 'q', name: 'Vault', stat: 'INT', description: null, completedAt: null,
  stages: Array.from({ length: 5 }, (_, i) => ({ id: `s${i}`, name: `Step ${i + 1}`, done: i < done, description: null })),
}) as never;

it('places the hero by translating a full-size wrapper, so the move can run on the compositor', () => {
  const { container, rerender } = render(<JourneyMap quest={quest(0)} expanded onSelect={() => {}} />);
  const track = container.querySelector('.journey-hero-track') as HTMLElement;
  expect(track).not.toBeNull();
  const first = track.style.transform;
  expect(first).toMatch(/^translate\(10%, 46%\)$/);
  const hero = track.querySelector('img.journey-hero') as HTMLElement;
  expect(hero.style.left).toBe('');
  expect(hero.style.top).toBe('');
  rerender(<JourneyMap quest={quest(1)} expanded onSelect={() => {}} />);
  expect((container.querySelector('.journey-hero-track') as HTMLElement).style.transform).toBe('translate(31%, 35%)');
});

it('keeps the streak flame glow static and animates only the flame shapes', () => {
  const { container } = render(<FireStreak size={14} />);
  const root = container.firstElementChild as HTMLElement;
  expect(root.style.animation).toBe('');
  expect(root).toHaveClass('fire-glow');
  for (const svg of container.querySelectorAll('svg')) expect(svg.getAttribute('style')).toMatch(/lick-/);
});

const receipt = (before: number, after: number): RewardReceipt => ({
  id: 'r', stage_id: 's', done: true, changed: true, replayed: false,
  components: [{ kind: 'stage', stat: 'INT', delta: after - before }], totals: [{ stat: 'INT', before, after, delta: after - before }],
});

it('pulses the level label once only when the reward crosses a level boundary', () => {
  const { container, rerender } = render(<RewardFeedback receipt={receipt(90, 110)} />);
  expect(container.querySelector('.reward-stat .is-level-up')).not.toBeNull();
  rerender(<RewardFeedback receipt={{ ...receipt(10, 30), id: 'r2' }} />);
  expect(container.querySelector('.reward-stat .is-level-up')).toBeNull();
});
