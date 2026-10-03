// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { RewardReceipt } from '@eiyu/shared';
import RewardFeedback from '../components/RewardFeedback';

const receipt: RewardReceipt = { id: 'reward', stage_id: 'stage', done: true, changed: true, replayed: false,
  components: [{ kind: 'stage', stat: 'INT', delta: 20 }], totals: [{ stat: 'INT', before: 90, after: 110, delta: 20 }] };
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('shows the authoritative final value across a level boundary with reduced motion', () => {
  render(<RewardFeedback receipt={receipt} />);
  expect(screen.getByRole('status', { name: 'Confirmed XP reward' })).toHaveTextContent('INT +20 XP');
  expect(screen.getByText(/Level 2/)).toHaveTextContent('10 / 125 XP');
  expect(screen.getByRole('progressbar', { name: 'INT level progress' })).toHaveAttribute('value', '10');
  act(() => vi.advanceTimersByTime(4600));
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it('renders captured mixed-stat gains and final bonus separately', () => {
  render(<RewardFeedback receipt={{ ...receipt, components: [{ kind: 'stage', stat: 'WIS', delta: 20 }, { kind: 'bonus', stat: 'INT', delta: 20 }], totals: [receipt.totals[0], { stat: 'WIS', before: 0, after: 20, delta: 20 }] }} />);
  expect(screen.getByText('INT +20 XP')).toBeInTheDocument();
  expect(screen.getByText('WIS +20 XP')).toBeInTheDocument();
  expect(screen.getByText('Completion bonus: INT +20 XP')).toBeInTheDocument();
  expect(screen.getAllByRole('progressbar')).toHaveLength(2);
});

it('does not celebrate receipt replays or legacy transitions with no reward', () => {
  const view = render(<RewardFeedback receipt={{ ...receipt, replayed: true }} />);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  view.rerender(<RewardFeedback receipt={{ ...receipt, components: [], totals: [] }} />);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it('animates to the recorded total in 600ms and cancels outstanding frames on unmount', () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
  vi.spyOn(performance, 'now').mockReturnValue(0);
  let frame!: FrameRequestCallback;
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { frame = callback; return 123; }));
  const cancel = vi.fn(); vi.stubGlobal('cancelAnimationFrame', cancel);
  const view = render(<RewardFeedback receipt={receipt} />);
  expect(screen.getByText(/Level 1/)).toHaveTextContent('90 / 100 XP');
  act(() => frame(600));
  expect(screen.getByText(/Level 2/)).toHaveTextContent('10 / 125 XP');
  view.unmount(); expect(cancel).toHaveBeenCalledWith(123);
});
