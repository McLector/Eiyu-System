// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { initialUser, type Quest } from '@eiyu/shared';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({ useEiyu: vi.fn() }));
vi.mock('../../store/eiyu-store', () => ({ useEiyu: store.useEiyu }));
import WebQuestEditor from '../WebQuestEditor';

const habit: Quest = {
  id: 'habit-1', name: 'Morning walk', stat: 'STR', difficulty: 'Medium', easyVersion: 'Walk for one minute', description: null,
  questType: 'habit', archived: false, time: '08:00', days: [0, 1, 2, 3, 4, 5, 6], streak: 2, frozen: false, completed: false,
  targetCount: null, progressCount: 0,
};

beforeEach(() => {
  store.useEiyu.mockReturnValue({
    user: { ...initialUser, timeZone: 'UTC', quests: [habit], longQuests: [] },
    saveHabit: vi.fn(), archiveQuest: vi.fn(), deleteQuest: vi.fn(), restoreQuest: vi.fn(),
  });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('marks the selected stat and difficulty as pressed, and moves the mark when the choice changes', async () => {
  const user = userEvent.setup();
  render(<WebQuestEditor editingQuest={habit} onClose={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'STR' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'INT' })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByRole('button', { name: 'MEDIUM' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'HARD' })).toHaveAttribute('aria-pressed', 'false');

  await user.click(screen.getByRole('button', { name: 'INT' }));
  await user.click(screen.getByRole('button', { name: 'HARD' }));
  expect(screen.getByRole('button', { name: 'INT' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'STR' })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByRole('button', { name: 'HARD' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'MEDIUM' })).toHaveAttribute('aria-pressed', 'false');
});
