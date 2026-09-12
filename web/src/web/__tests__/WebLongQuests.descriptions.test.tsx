// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { initialUser } from '@eiyu/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({
  saveLongQuest: vi.fn(),
  useEiyu: vi.fn(),
}));

vi.mock('../../store/eiyu-store', () => ({ useEiyu: store.useEiyu }));

import WebLongQuests from '../WebLongQuests';

afterEach(cleanup);

describe('web Long Quest stage descriptions', () => {
  beforeEach(() => {
    store.saveLongQuest.mockReset().mockResolvedValue(undefined);
    store.useEiyu.mockReturnValue({
      user: { ...initialUser, longQuests: [] },
      longQuestsLoading: false,
      longQuestsError: null,
      retryLongQuests: vi.fn(),
      saveLongQuest: store.saveLongQuest,
    });
  });

  it('creates stages with optional multiline Unicode descriptions', async () => {
    const user = userEvent.setup();
    render(<WebLongQuests />);

    await user.click(screen.getByRole('button', { name: /NEW QUEST/ }));
    await user.type(screen.getByPlaceholderText('Quest name...'), 'Launch');
    await user.type(screen.getByPlaceholderText('Stage 1...'), 'Plan');
    await user.type(screen.getByPlaceholderText('Stage 2...'), 'Build');
    await user.type(
      screen.getByRole('textbox', { name: 'Stage 1 description. Maximum 2000 characters.' }),
      'First line{enter}勇者'
    );
    await user.click(screen.getByRole('button', { name: 'CREATE' }));

    await waitFor(() => expect(store.saveLongQuest).toHaveBeenCalledOnce());
    expect(store.saveLongQuest).toHaveBeenCalledWith(expect.objectContaining({
      stages: [
        { name: 'Plan', description: 'First line\n勇者' },
        { name: 'Build', description: '' },
      ],
    }));
  });

  it('renders markup-like multiline content as inert text and persists clearing it', async () => {
    const user = userEvent.setup();
    store.useEiyu.mockReturnValue({
      user: {
        ...initialUser,
        longQuests: [{
          id: 'quest-1', name: 'Campaign', stat: 'INT', description: null, completed: false,
          stages: [
            { id: 'stage-1', name: 'Plan', description: '<strong>literal</strong>\n勇者', done: false },
            { id: 'stage-2', name: 'Build', description: null, done: false },
          ],
        }],
      },
      longQuestsLoading: false,
      longQuestsError: null,
      retryLongQuests: vi.fn(),
      toggleStage: vi.fn(),
      removeLongQuest: vi.fn(),
      saveLongQuest: store.saveLongQuest,
    });

    const { container } = render(<WebLongQuests />);
    await user.click(screen.getByRole('button', { name: /Campaign/ }));
    expect(container).toHaveTextContent('<strong>literal</strong> 勇者');
    expect(container.querySelector('strong')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'EDIT' }));
    const description = screen.getByRole('textbox', { name: 'Stage 1 description. Maximum 2000 characters.' });
    await user.clear(description);
    await user.click(screen.getByRole('button', { name: 'SAVE CHANGES' }));

    await waitFor(() => expect(store.saveLongQuest).toHaveBeenCalledOnce());
    expect(store.saveLongQuest.mock.calls[0][0].stages[0].description).toBe('');
    expect(store.saveLongQuest.mock.calls[0][1]).toBe('quest-1');
  });
});
