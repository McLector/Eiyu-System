// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { initialUser, type Quest } from '@eiyu/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({ useEiyu: vi.fn() }));
vi.mock('../../store/eiyu-store', () => ({ useEiyu: store.useEiyu }));

import QuestEditorPage from '../QuestEditorPage';

afterEach(cleanup);

const idea: Quest = {
  id: 'idea-0', name: 'Try Obsidian', stat: 'INT', difficulty: 'Easy', easyVersion: null,
  description: 'A note app to try.', questType: 'backlog', archived: false, time: '08:00', days: [], streak: 0,
  frozen: false, completed: false, targetCount: null, progressCount: 0, genre: 'tool', timeSet: false,
};

function renderAt(path: string, state: { backlog?: Quest[]; backlogLoading?: boolean; quests?: Quest[] }) {
  store.useEiyu.mockReturnValue({
    user: { ...initialUser, timeZone: 'UTC', quests: state.quests ?? [], longQuests: [] },
    questsLoading: false, backlog: state.backlog ?? [], backlogLoading: state.backlogLoading ?? false,
    saveHabit: vi.fn(), archiveQuest: vi.fn(), restoreQuest: vi.fn(), deleteQuest: vi.fn(),
  });
  render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/quest-editor/:id" element={<QuestEditorPage />} />
    <Route path="/board" element={<p>BOARD PAGE</p>} />
  </Routes></MemoryRouter>);
}

describe('QuestEditorPage', () => {
  it('opens a Backlog quest for editing (Backlog quests are not in the board quest list)', () => {
    renderAt('/quest-editor/idea-0', { backlog: [idea] });
    expect(screen.getByRole('dialog', { name: 'EDIT QUEST' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Quest name' })).toHaveValue('Try Obsidian');
  });

  it('waits for the Backlog to load before judging the id', () => {
    renderAt('/quest-editor/idea-0', { backlogLoading: true });
    expect(screen.queryByText('BOARD PAGE')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('still sends an unknown id back to the board', () => {
    renderAt('/quest-editor/missing', { backlog: [idea] });
    expect(screen.getByText('BOARD PAGE')).toBeInTheDocument();
  });
});
