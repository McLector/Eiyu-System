// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { initialUser } from '@eiyu/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({ useEiyu: vi.fn(), saveHabit: vi.fn() }));
vi.mock('../../store/eiyu-store', () => ({ useEiyu: store.useEiyu }));

import WebQuestEditor from '../WebQuestEditor';

afterEach(cleanup);

describe('WebQuestEditor penalty field', () => {
  beforeEach(() => {
    store.saveHabit.mockReset().mockResolvedValue(undefined);
    store.useEiyu.mockReturnValue({
      user: { ...initialUser, timeZone: 'UTC', quests: [], longQuests: [] },
      saveHabit: store.saveHabit, archiveQuest: vi.fn(), restoreQuest: vi.fn(), deleteQuest: vi.fn(),
    });
  });

  it('asks for a penalty on a habit but offers no AI suggestion for it', () => {
    render(<WebQuestEditor initialType="habit" onClose={vi.fn()} />);
    expect(screen.getByPlaceholderText('e.g. Walk for 10 min instead')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /suggest/i })).toBeNull();
    expect(screen.queryByText(/possibilities/i)).toBeNull();
  });

  it('still requires a penalty before a habit can be created', () => {
    render(<WebQuestEditor initialType="habit" onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('e.g. Morning run for 30 min'), { target: { value: 'Read every day' } });
    expect(screen.getByRole('button', { name: 'CREATE QUEST' })).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('e.g. Walk for 10 min instead'), { target: { value: 'Read one page' } });
    expect(screen.getByRole('button', { name: 'CREATE QUEST' })).toBeEnabled();
  });

  it('shows no penalty field on a 1-Time quest', () => {
    render(<WebQuestEditor initialType="one_time" onClose={vi.fn()} />);
    expect(screen.queryByPlaceholderText('e.g. Walk for 10 min instead')).toBeNull();
  });
});
