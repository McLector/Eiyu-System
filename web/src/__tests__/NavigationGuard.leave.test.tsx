// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Outlet, RouterProvider, useNavigate } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { NavigationGuard, useEditorGuard } from '../components/NavigationGuard';

afterEach(cleanup);

// Mirrors QuestEditorPage + WebQuestEditor: a dirty editor whose close action navigates away.
function Editor({ label = 'Draft' }: { label?: string }) {
  const [value, setValue] = useState('');
  const navigate = useNavigate();
  const closeEditor = useEditorGuard(value !== '');
  return <>
    <label>{label}<input value={value} onChange={event => setValue(event.target.value)} /></label>
    <button onClick={() => closeEditor(() => navigate('/board'))}>Close editor</button>
  </>;
}

function setup(editors: string[] = ['Draft']) {
  const router = createMemoryRouter([{ path: '/', element: <NavigationGuard><Outlet /></NavigationGuard>, children: [
    { path: '/board', element: <p>BOARD CONTENT</p> },
    { path: '/quest-editor', element: <>{editors.map(label => <Editor key={label} label={label} />)}</> },
  ] }], { initialEntries: ['/quest-editor'] });
  render(<RouterProvider router={router} />);
  return router;
}

describe('closing a dirty editor', () => {
  it('asks "leave without saving" once, then lands on the destination', async () => {
    const user = userEvent.setup();
    const router = setup();
    await user.type(screen.getByLabelText('Draft'), 'half-typed');
    await user.click(screen.getByRole('button', { name: 'Close editor' }));
    expect(screen.getAllByRole('dialog', { name: 'Unsaved changes' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Leave without saving' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/board'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('BOARD CONTENT')).toBeInTheDocument();
  });

  it('stays on the editor, still dirty, after "Keep editing"', async () => {
    const user = userEvent.setup();
    const router = setup();
    await user.type(screen.getByLabelText('Draft'), 'half-typed');
    await user.click(screen.getByRole('button', { name: 'Close editor' }));
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/quest-editor');
    expect(screen.getByLabelText('Draft')).toHaveValue('half-typed');
    await user.click(screen.getByRole('button', { name: 'Close editor' }));
    expect(screen.getAllByRole('dialog', { name: 'Unsaved changes' })).toHaveLength(1);
  });

  it('closes an untouched editor without any prompt', async () => {
    const user = userEvent.setup();
    const router = setup();
    await user.click(screen.getByRole('button', { name: 'Close editor' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/board'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('still guards a different dirty editor that is open at the same time', async () => {
    const user = userEvent.setup();
    const router = setup(['Draft', 'Other']);
    await user.type(screen.getByLabelText('Draft'), 'a');
    await user.type(screen.getByLabelText('Other'), 'b');
    await user.click(screen.getAllByRole('button', { name: 'Close editor' })[0]);
    await user.click(screen.getByRole('button', { name: 'Leave without saving' }));
    // The other editor still has unsaved work, so leaving the route is confirmed again.
    expect(await screen.findByRole('dialog', { name: 'Unsaved changes' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/quest-editor');
  });
});
