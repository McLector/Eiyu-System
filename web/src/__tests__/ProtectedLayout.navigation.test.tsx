// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

vi.mock('../store/eiyu-store', () => ({
  useEiyu: () => ({
    user: {
      name: 'Yuki Tanaka',
      userClass: 'Ranger',
      rank: 'C',
      stats: {},
      quests: [],
      longQuests: [],
    },
    saveProfile: vi.fn(),
  }),
}));
vi.mock('../store/session-context', () => ({
  useSession: () => ({ signOut: vi.fn().mockResolvedValue({ error: null }) }),
}));

import ProtectedLayout from '../ProtectedLayout';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/status']}>
      <Routes>
        <Route element={<ProtectedLayout />}>
          <Route path="*" element={<Outlet />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('Phase 4 account navigation', () => {
  it('has four primary destinations and no Settings destination', () => {
    renderLayout();
    expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Primary navigation' })).getAllByRole('link')).toHaveLength(4);
    expect(screen.queryByRole('link', { name: /settings/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'STATUS' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'GYM PROGRESS' })).toBeInTheDocument();
  });

  it('opens Edit details, Settings, Archived habits, and Logout from the real identity trigger', async () => {
    const user = userEvent.setup();
    renderLayout();
    await user.click(screen.getByRole('button', { name: /Yuki Tanaka.*Ranger.*rank C/i }));
    expect(screen.getAllByRole('menuitem')).toHaveLength(4);
    expect(screen.getByRole('menuitem', { name: 'Edit details' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Logout' })).toBeInTheDocument();
  });
});
