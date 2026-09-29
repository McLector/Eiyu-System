// @vitest-environment jsdom
// Review-only RED probes against aa793ba. Outside workspace test discovery.
import React from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { initialUser, partitionBoardQuests, type Quest } from '@eiyu/shared';

const mock = vi.hoisted(() => ({ useEiyu: vi.fn(), saveProfile: vi.fn() }));
vi.mock('../../../../web/src/store/eiyu-store', () => ({ useEiyu: mock.useEiyu }));
vi.mock('../../../../web/src/store/session-context', () => ({
  useSession: () => ({ signOut: vi.fn().mockResolvedValue({ error: null }) }),
}));
import ProtectedLayout from '../../../../web/src/ProtectedLayout';
import BoardPage from '../../../../web/src/pages/BoardPage';
import QuestEditorPage from '../../../../web/src/pages/QuestEditorPage';
import WebQuestEditor from '../../../../web/src/web/WebQuestEditor';
import WebBoard from '../../../../web/src/web/WebBoard';
import { formatDateKey } from '../../../../web/src/web/WeeklyReviewMatrix';

const habit: Quest = {
  id: 'review-habit', name: 'Review habit', stat: 'STR', difficulty: 'Medium',
  easyVersion: 'One minute', description: null, questType: 'habit', archived: false,
  time: '08:00', days: [0,1,2,3,4,5,6], streak: 0, frozen: false,
  dailyEligible: true, completed: false, targetCount: null, progressCount: 0,
};
beforeEach(() => {
  mock.saveProfile.mockReset().mockResolvedValue(undefined);
  mock.useEiyu.mockReturnValue({
    user: { ...initialUser, rank: 'E', name: 'Review User', userClass: 'Ranger', timeZone: 'UTC', quests: [habit] },
    questsLoading: false, questsError: null, saveProfile: mock.saveProfile,
    saveHabit: vi.fn(), archiveQuest: vi.fn(), restoreQuest: vi.fn(), deleteQuest: vi.fn(),
    retryQuests: vi.fn(), toggleQuest: vi.fn(), adjustProgress: vi.fn(), completeRecovery: vi.fn(),
  });
});
afterEach(cleanup);

function layout() {
  return render(<MemoryRouter initialEntries={['/board']}><Routes>
    <Route element={<ProtectedLayout />}>
      <Route path="/board" element={<BoardPage />} />
      <Route path="/quest-editor/:id" element={<QuestEditorPage />} />
    </Route>
  </Routes></MemoryRouter>);
}
async function openAccount(kind: 'Settings' | 'Edit details') {
  const user = userEvent.setup();
  layout();
  await user.click(screen.getByRole('button', { name: /Review User, Ranger/ }));
  await user.click(screen.getByRole('menuitem', { name: kind }));
  return user;
}

it('R01: permanent deletion initially focuses Cancel', async () => {
  const user = userEvent.setup();
  render(<WebQuestEditor editingQuest={habit} onClose={vi.fn()} />);
  await user.click(screen.getByRole('button', { name: 'DELETE PERMANENTLY' }));
  expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' })).toHaveFocus();
});
it('R02: Settings closes on Escape', async () => {
  const user = await openAccount('Settings');
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog', { name: 'SETTINGS' })).not.toBeInTheDocument();
});
it('R03: reverse Tab stays inside the profile dialog', async () => {
  const user = await openAccount('Edit details');
  screen.getByRole('button', { name: 'Close EDIT DETAILS' }).focus();
  await user.tab({ shift: true });
  expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
});
it('R04: pending profile save cannot be dismissed through Close', async () => {
  mock.saveProfile.mockImplementation(() => new Promise(() => {}));
  const user = await openAccount('Edit details');
  await user.click(screen.getByRole('button', { name: 'SAVE' }));
  await user.click(screen.getByRole('button', { name: 'Close EDIT DETAILS' }));
  expect(screen.queryByRole('dialog', { name: 'EDIT DETAILS' })).toBeInTheDocument();
});
it('R05: the date label preserves the account-local date key in UTC+14', () => {
  expect(formatDateKey('2026-12-31', 'Pacific/Kiritimati')).toBe('December 31, 2026');
});
it('R06: the profile field accepts 80 Unicode code points', async () => {
  const user = await openAccount('Edit details');
  const field = screen.getByRole('textbox', { name: 'Display name' });
  await user.clear(field);
  await user.paste('😀'.repeat(80));
  expect(field).toHaveValue('😀'.repeat(80));
});
it('R07: Archived exposes a Restore card action', () => {
  const value = mock.useEiyu();
  mock.useEiyu.mockReturnValue({ ...value, user: { ...value.user, quests: [{ ...habit, archived: true }] } });
  render(<WebBoard onNewQuest={vi.fn()} onEditQuest={vi.fn()} darkMode />);
  expect(within(screen.getByRole('region', { name: 'Archived' })).queryByRole('button', { name: /restore/i })).toBeInTheDocument();
});
it('R08: actionable lanes sort incomplete entries before completed entries', () => {
  const result = partitionBoardQuests([{ ...habit, id: 'done', completed: true }, { ...habit, id: 'todo' }]);
  expect(result.dailyQuests.map(q => q.id)).toEqual(['todo', 'done']);
});
it('R09: returning from the editor preserves the selected board lane', async () => {
  const user = userEvent.setup();
  layout();
  await user.click(screen.getByRole('tab', { name: /All Habits/ }));
  await user.click(within(screen.getByRole('region', { name: 'All Habits' })).getByRole('button', { name: 'Edit Review habit' }));
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByRole('tab', { name: /All Habits/ })).toHaveAttribute('aria-selected', 'true');
});
