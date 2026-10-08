// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { RewardReceipt } from '@eiyu/shared';
import WebSettings from '../web/WebSettings';
import FireStreak from '../FireStreak';
import FrostMark from '../FrostMark';
import RewardFeedback from '../components/RewardFeedback';

afterEach(cleanup);
beforeEach(() => { vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true }))); });
afterEach(() => vi.unstubAllGlobals());

it('slides the dark-mode knob with a transform and never animates its left offset', () => {
  const props = { darkMode: false, onToggleDark: vi.fn(), palette: 'cyan' as const, onPaletteChange: vi.fn(), onShowHistory: vi.fn(), onLogout: vi.fn() };
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

it('keeps the streak flame glow static and animates only the flame shapes', () => {
  const { container } = render(<FireStreak size={14} />);
  const root = container.firstElementChild as HTMLElement;
  expect(root.style.animation).toBe('');
  expect(root).toHaveClass('fire-glow');
  for (const svg of container.querySelectorAll('svg')) expect(svg.getAttribute('style')).toMatch(/lick-/);
});

it('frost mark is decoration, fixed to its own box so the glint is never clipped or shifts the row', () => {
  const { container } = render(<FrostMark size={12} />);
  const root = container.firstElementChild as HTMLElement;
  expect(root).toHaveClass('frost-mark');
  expect(root).toHaveAttribute('aria-hidden', 'true');
  expect(root.style.width).toBe('12px');
  expect(root.style.height).toBe('12px');
  expect(root.style.animation).toBe('');
});

it('frost mark shimmers the flake and twinkles a glint, both from the stylesheet', () => {
  const { container } = render(<FrostMark />);
  expect(container.querySelectorAll('.frost-shimmer')).toHaveLength(1);
  expect(container.querySelectorAll('.frost-twinkle')).toHaveLength(1);
  expect(container.querySelector('.frost-shimmer')!.querySelectorAll('line')).toHaveLength(3);
  // no inline animation: the reduced-motion rule in index.css must be able to switch both off
  expect(container.querySelector('[style*="animation"]')).toBeNull();
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
