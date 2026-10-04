// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { initialUser, UncertainSaveError, type LongQuest } from '@eiyu/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({ saveLongQuest: vi.fn(), removeLongQuest: vi.fn(), useEiyu: vi.fn() }));
vi.mock('../../store/eiyu-store', () => ({ useEiyu: store.useEiyu }));

import WebLongQuests from '../WebLongQuests';
import { NavigationGuard } from '../../components/NavigationGuard';

afterEach(cleanup);

const quest = (id: string, name: string): LongQuest => ({
  id, name, stat: 'INT', description: null, completedAt: null,
  stages: [{ id: `${id}-1`, name: 'Plan', done: false, description: null }, { id: `${id}-2`, name: 'Build', done: false, description: null }],
});

function setup(longQuests: LongQuest[] = []) {
  store.saveLongQuest.mockReset().mockResolvedValue(undefined);
  store.removeLongQuest.mockReset().mockResolvedValue(undefined);
  store.useEiyu.mockReturnValue({
    user: { ...initialUser, longQuests }, longQuestsLoading: false, longQuestsError: null,
    retryLongQuests: vi.fn(), toggleStage: vi.fn(), removeLongQuest: store.removeLongQuest, saveLongQuest: store.saveLongQuest,
    stageRewardNotice: null, rewardReceipt: null,
  });
  const router = createMemoryRouter([{ path: '/', element: <NavigationGuard><WebLongQuests /></NavigationGuard> }]);
  return render(<RouterProvider router={router} />);
}

describe('Long Quest create dialog', () => {
  beforeEach(() => setup());

  it('opens in a modal dialog with the name field focused and the page behind it inert', async () => {
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /NEW QUEST/ }));
    const dialog = screen.getByRole('dialog', { name: 'New Long Quest' });
    expect(within(dialog).getByLabelText('Quest name')).toHaveFocus();
    // jsdom does not reflect `inert`, so check the aria-hidden the dialog sets alongside it.
    expect(screen.getByRole('button', { name: /NEW QUEST/, hidden: true }).closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('closes a pristine form with Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    const trigger = screen.getByRole('button', { name: /NEW QUEST/ });
    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('asks before discarding a dirty form and keeps the typing when told to keep editing', async () => {
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /NEW QUEST/ }));
    await user.type(screen.getByLabelText('Quest name'), 'Learn Rust');
    await user.keyboard('{Escape}');
    const guard = screen.getByRole('dialog', { name: 'Unsaved changes' });
    expect(guard).toHaveTextContent('Leave without saving? Unsaved changes will be lost. Your last saved version stays.');
    // Escape inside the guard dismisses only the guard (topmost dialog), not the editor beneath it.
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Unsaved changes' })).toBeNull();
    expect(guard).not.toBeInTheDocument();
    expect(screen.getByLabelText('Quest name')).toHaveValue('Learn Rust');
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Leave without saving' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes after a successful create and does not keep the old draft', async () => {
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /NEW QUEST/ }));
    await user.type(screen.getByLabelText('Quest name'), 'Learn Rust');
    await user.type(screen.getByPlaceholderText('Stage 1...'), 'Book');
    await user.click(screen.getByRole('button', { name: 'CREATE' }));
    await waitFor(() => expect(store.saveLongQuest).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(screen.getByRole('button', { name: /NEW QUEST/ }));
    expect(screen.getByLabelText('Quest name')).toHaveValue('');
  });

  it('stays open and blocks closing while an uncertain save awaits its result', async () => {
    store.saveLongQuest.mockRejectedValueOnce(new UncertainSaveError());
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /NEW QUEST/ }));
    await user.type(screen.getByLabelText('Quest name'), 'Learn Rust');
    await user.type(screen.getByPlaceholderText('Stage 1...'), 'Book');
    await user.click(screen.getByRole('button', { name: 'CREATE' }));
    expect(await screen.findByRole('button', { name: 'CHECK SAVE RESULT' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent("couldn't create that quest");
    expect(screen.getByRole('dialog', { name: 'New Long Quest' })).toBeInTheDocument();
  });

  it('does not create a quest without a named stage', async () => {
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /NEW QUEST/ }));
    await user.type(screen.getByLabelText('Quest name'), 'Learn Rust');
    await user.click(screen.getByRole('button', { name: 'CREATE' }));
    expect(store.saveLongQuest).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'New Long Quest' })).toBeInTheDocument();
  });
});

describe('Long Quest edit dialog', () => {
  it('edits in a dialog seeded from the quest, saves with the quest id and restores focus to Edit', async () => {
    setup([quest('lq', 'Ship it')]);
    const user = userEvent.setup();
    expect(screen.getByText('Ship it').closest('button')).toHaveAttribute('aria-expanded', 'true');
    const edit = screen.getByRole('button', { name: 'EDIT' });
    await user.click(edit);
    const dialog = screen.getByRole('dialog', { name: 'Edit Long Quest' });
    expect(within(dialog).getByLabelText('Quest name')).toHaveValue('Ship it');
    await user.click(within(dialog).getByRole('button', { name: 'DEX' }));
    await user.click(within(dialog).getByRole('button', { name: 'SAVE CHANGES' }));
    await waitFor(() => expect(store.saveLongQuest).toHaveBeenCalledWith(expect.objectContaining({ stat: 'DEX' }), 'lq'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('button', { name: 'EDIT' })).toHaveFocus();
  });

  it('re-seeds from the quest each time it opens, discarding an abandoned draft', async () => {
    setup([quest('lq', 'Ship it')]);
    const user = userEvent.setup();
    expect(screen.getByText('Ship it').closest('button')).toHaveAttribute('aria-expanded', 'true');
    await user.click(screen.getByRole('button', { name: 'EDIT' }));
    fireEvent.change(screen.getByLabelText('Quest name'), { target: { value: 'Scrapped' } });
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Leave without saving' }));
    await user.click(screen.getByRole('button', { name: 'EDIT' }));
    expect(screen.getByLabelText('Quest name')).toHaveValue('Ship it');
  });

  it('opens the editor for a quest on the second page of the list', async () => {
    setup([quest('a', 'Alpha'), quest('b', 'Beta'), quest('c', 'Gamma')]);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Next Chains page' }));
    expect(screen.getByText('Gamma')).toBeInTheDocument();
    await user.click(screen.getByText('Gamma').closest('button')!);
    await user.click(screen.getByRole('button', { name: 'EDIT' }));
    expect(screen.getByRole('dialog', { name: 'Edit Long Quest' })).toBeInTheDocument();
  });
});
