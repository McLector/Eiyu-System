// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { initialUser, type LongQuest } from '@eiyu/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({ saveLongQuest: vi.fn(), useEiyu: vi.fn() }));
vi.mock('../../store/eiyu-store', () => ({ useEiyu: store.useEiyu }));

import WebLongQuests from '../WebLongQuests';

afterEach(cleanup);

function setup(longQuests: LongQuest[] = []) {
  store.saveLongQuest.mockReset().mockResolvedValue(undefined);
  store.useEiyu.mockReturnValue({
    user: { ...initialUser, longQuests }, longQuestsLoading: false, longQuestsError: null,
    retryLongQuests: vi.fn(), toggleStage: vi.fn(), removeLongQuest: vi.fn(), saveLongQuest: store.saveLongQuest,
  });
}

describe('web Long Quest name validation', () => {
  beforeEach(() => setup());

  it('rejects over-limit and invisible-only names; accepts 80 code points', async () => {
    const user = userEvent.setup();
    render(<WebLongQuests />);
    await user.click(screen.getByRole('button', { name: /NEW QUEST/ }));
    const name = screen.getByLabelText('Quest name');
    fireEvent.change(name, { target: { value: '😀'.repeat(81) } });
    expect(screen.getByRole('alert')).toHaveTextContent('80 characters or fewer.');
    expect(screen.getByRole('button', { name: 'CREATE' })).toBeDisabled();
    fireEvent.change(name, { target: { value: ' \u200b\u200c\u200d\u2060\ufeff ' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a quest name.');
    fireEvent.change(name, { target: { value: '😀'.repeat(80) } });
    await user.type(screen.getByPlaceholderText('Stage 1...'), 'Plan');
    await user.type(screen.getByPlaceholderText('Stage 2...'), 'Build');
    await user.click(screen.getByRole('button', { name: 'CREATE' }));
    await waitFor(() => expect(store.saveLongQuest).toHaveBeenCalledOnce());
    expect(store.saveLongQuest).toHaveBeenCalledWith(expect.objectContaining({ name: '😀'.repeat(80) }));
  });

  it('does not flag the name of a fresh New Long Quest before it is typed in', async () => {
    const user = userEvent.setup();
    render(<WebLongQuests />);
    await user.click(screen.getByRole('button', { name: /NEW QUEST/ }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'CREATE' })).toBeDisabled();
    const name = screen.getByLabelText('Quest name');
    await user.type(name, 'Vault');
    await user.clear(name);
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a quest name.');
  });

  it('allows an unchanged over-limit legacy name during an unrelated edit', async () => {
    const legacyName = '🧭'.repeat(81);
    setup([{
      id: 'legacy', name: legacyName, stat: 'INT', description: null, completedAt: null,
      stages: [{ id: 's1', name: 'Plan', done: false, description: null }, { id: 's2', name: 'Build', done: false, description: null }],
    }]);
    const user = userEvent.setup();
    render(<WebLongQuests />);
    expect(screen.getByText(legacyName).closest('button')).toHaveAttribute('aria-expanded', 'true');
    await user.click(screen.getByRole('button', { name: 'EDIT' }));
    await user.click(screen.getByRole('button', { name: 'DEX' }));
    await user.click(screen.getByRole('button', { name: 'SAVE CHANGES' }));
    await waitFor(() => expect(store.saveLongQuest).toHaveBeenCalledOnce());
    expect(store.saveLongQuest).toHaveBeenCalledWith(expect.objectContaining({ name: legacyName, stat: 'DEX' }), 'legacy');
  });
});
