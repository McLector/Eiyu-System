// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WebSettings from '../WebSettings';
import type { Palette } from '../../palette';

afterEach(cleanup);

function setup(over: { darkMode?: boolean; palette?: Palette } = {}) {
  const onPaletteChange = vi.fn();
  render(<WebSettings darkMode={over.darkMode ?? true} onToggleDark={vi.fn()} palette={over.palette ?? 'cyan'} onPaletteChange={onPaletteChange}
    onShowHistory={vi.fn()} onLogout={vi.fn()} embedded />);
  return { onPaletteChange };
}
const group = () => screen.getByRole('radiogroup', { name: 'Colour palette' });

describe('Settings colour palette', () => {
  it('offers Cyan and System blue as one choice, with the current palette selected', () => {
    setup({ palette: 'blue' });
    expect(screen.getAllByRole('radio').map(radio => radio.getAttribute('aria-label') ?? radio.parentElement?.textContent)).toEqual(['Cyan', 'System blue']);
    expect(screen.getByRole('radio', { name: 'System blue' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Cyan' })).not.toBeChecked();
    expect(group()).toBeInTheDocument();
  });
  it('reports the palette that was picked', async () => {
    const user = userEvent.setup();
    const { onPaletteChange } = setup({ palette: 'cyan' });
    await user.click(screen.getByRole('radio', { name: 'System blue' }));
    expect(onPaletteChange).toHaveBeenCalledExactlyOnceWith('blue');
  });
  it('does not report a pick of the palette that is already selected', async () => {
    const user = userEvent.setup();
    const { onPaletteChange } = setup({ palette: 'cyan' });
    await user.click(screen.getByRole('radio', { name: 'Cyan' }));
    expect(onPaletteChange).not.toHaveBeenCalled();
  });
  it('can be driven from the keyboard like any radio group', async () => {
    const user = userEvent.setup();
    const { onPaletteChange } = setup({ palette: 'cyan' });
    await user.tab(); // dark-mode switch
    screen.getByRole('radio', { name: 'Cyan' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(onPaletteChange).toHaveBeenCalledWith('blue');
  });
  it('is dark-mode only: disabled in the light theme, and says so', () => {
    setup({ darkMode: false, palette: 'blue' });
    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled();
    expect(screen.getByText(/Dark mode only/)).toBeInTheDocument();
  });
  it('is enabled in the dark theme without the dark-only note', () => {
    setup({ darkMode: true });
    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeEnabled();
    expect(screen.queryByText(/Dark mode only/)).toBeNull();
  });
});
