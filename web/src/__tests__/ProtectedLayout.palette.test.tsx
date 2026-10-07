// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

vi.mock('../store/eiyu-store', () => ({
  useEiyu: () => ({ user: { name: 'Yuki Tanaka', userClass: 'Ranger', rank: 'C', stats: {}, quests: [], longQuests: [] }, saveProfile: vi.fn() }),
}));
vi.mock('../store/session-context', () => ({ useSession: () => ({ signOut: vi.fn().mockResolvedValue({ error: null }) }) }));

import ProtectedLayout from '../ProtectedLayout';
import { PALETTE_STORAGE_KEY } from '../palette';

const root = () => document.documentElement;
beforeEach(() => { window.localStorage.clear(); delete root().dataset.palette; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); delete root().dataset.palette; });

function renderLayout(entry = '/status?account=settings') {
  return render(<RouterProvider router={createMemoryRouter([{ element: <ProtectedLayout />, children: [{ path: '*', element: <p>Content</p> }] }], { initialEntries: [entry] })} />);
}

describe('System blue palette', () => {
  it('is blue by default, not cyan: the page root carries blue', () => {
    renderLayout('/status');
    expect(root().dataset.palette).toBe('blue');
  });
  it('keeps cyan as no palette attribute when cyan is the stored choice', () => {
    window.localStorage.setItem(PALETTE_STORAGE_KEY, 'cyan');
    renderLayout('/status');
    expect(root().dataset.palette).toBeUndefined();
  });
  it('applies a stored blue choice to the page root, so dialogs and the page behind them agree', () => {
    window.localStorage.setItem(PALETTE_STORAGE_KEY, 'blue');
    renderLayout('/status');
    expect(root().dataset.palette).toBe('blue');
  });
  it('applies a stored choice of any palette, in either theme', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(PALETTE_STORAGE_KEY, 'jade');
    renderLayout();
    expect(root().dataset.palette).toBe('jade');
    await user.click(await screen.findByRole('switch'));
    expect(document.querySelector('.surface-flat')).toHaveAttribute('data-theme', 'light');
    expect(root().dataset.palette).toBe('jade');
    expect(screen.getByRole('radio', { name: 'Jade' })).toBeEnabled();
  });
  it('ignores a stored value it does not know and shows blue', () => {
    window.localStorage.setItem(PALETTE_STORAGE_KEY, 'crimson');
    renderLayout('/status');
    expect(root().dataset.palette).toBe('blue');
  });
  it('switches live from Settings and remembers the choice', async () => {
    const user = userEvent.setup();
    renderLayout();
    // Cyan first: System blue is the default now, so picking it would not be a change.
    await user.click(await screen.findByRole('radio', { name: 'Cyan' }));
    expect(root().dataset.palette).toBeUndefined();
    expect(window.localStorage.getItem(PALETTE_STORAGE_KEY)).toBe('cyan');
    await user.click(screen.getByRole('radio', { name: 'System blue' }));
    expect(root().dataset.palette).toBe('blue');
    expect(window.localStorage.getItem(PALETTE_STORAGE_KEY)).toBe('blue');
  });
  it('goes back to the stored choice, not the palette picked here, when the signed-in area goes away', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(PALETTE_STORAGE_KEY, 'lime');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
    const view = renderLayout();
    await user.click(await screen.findByRole('radio', { name: 'Jade' }));
    expect(root().dataset.palette).toBe('jade');
    view.unmount();
    expect(root().dataset.palette).toBe('lime');
  });
  it('still applies the choice when storage is unavailable', async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
    renderLayout();
    await user.click(await screen.findByRole('radio', { name: 'Jade' }));
    expect(root().dataset.palette).toBe('jade');
  });
});

describe('leaving the signed-in area shows what a reload would show', () => {
  it('keeps a stored jade on the sign-in page', () => {
    window.localStorage.setItem(PALETTE_STORAGE_KEY, 'jade');
    const view = renderLayout('/status');
    expect(root().dataset.palette).toBe('jade');
    view.unmount();
    expect(root().dataset.palette).toBe('jade');
  });
  it('removes the attribute for a stored cyan, as a reload does', () => {
    window.localStorage.setItem(PALETTE_STORAGE_KEY, 'cyan');
    const view = renderLayout('/status');
    view.unmount();
    expect(root().dataset.palette).toBeUndefined();
  });
  it('shows blue when nothing is stored', () => {
    const view = renderLayout('/status');
    view.unmount();
    expect(root().dataset.palette).toBe('blue');
  });
  it('shows blue, and does not throw, when storage cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
    const view = renderLayout('/status');
    expect(() => view.unmount()).not.toThrow();
    expect(root().dataset.palette).toBe('blue');
  });
});

describe('dark/light theme', () => {
  it('keeps the choice across a reload', async () => {
    const user = userEvent.setup();
    const first = renderLayout();
    await user.click(await screen.findByRole('switch'));
    expect(document.querySelector('.surface-flat')).toHaveAttribute('data-theme', 'light');
    first.unmount();
    renderLayout();
    expect(document.querySelector('.surface-flat')).toHaveAttribute('data-theme', 'light');
  });
  it('starts dark when nothing is stored', () => {
    renderLayout('/status');
    expect(document.querySelector('.surface-flat')).toHaveAttribute('data-theme', 'dark');
  });
});
