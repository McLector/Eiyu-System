// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WebSettings from '../WebSettings';
import { PALETTES, type Palette } from '../../palette';

afterEach(cleanup);

function setup(over: { darkMode?: boolean; palette?: Palette } = {}) {
  const onPaletteChange = vi.fn();
  render(<WebSettings darkMode={over.darkMode ?? true} onToggleDark={vi.fn()} palette={over.palette ?? 'cyan'} onPaletteChange={onPaletteChange}
    onShowHistory={vi.fn()} onLogout={vi.fn()} embedded />);
  return { onPaletteChange };
}
const group = () => screen.getByRole('radiogroup', { name: 'Colour palette' });

describe('Settings colour palette', () => {
  it('offers every palette as one choice, with the current palette selected', () => {
    setup({ palette: 'blue' });
    expect(screen.getAllByRole('radio').map(radio => radio.parentElement?.textContent)).toEqual(PALETTES.map(p => p.label));
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
    expect(onPaletteChange).toHaveBeenCalledWith(PALETTES[1].id);
  });
  it.each([true, false])('is enabled in both themes (dark mode: %s) and carries no dark-only note', darkMode => {
    setup({ darkMode, palette: 'violet' });
    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeEnabled();
    expect(screen.queryByText(/Dark mode only/)).toBeNull();
  });
  it('reports a pick made in the light theme', async () => {
    const user = userEvent.setup();
    const { onPaletteChange } = setup({ darkMode: false, palette: 'cyan' });
    await user.click(screen.getByRole('radio', { name: 'Lime' }));
    expect(onPaletteChange).toHaveBeenCalledExactlyOnceWith('lime');
  });
  it('shows each option as a swatch in its own accent colour', () => {
    setup();
    for (const { label, swatch } of PALETTES) {
      const swatchNode = screen.getByRole('radio', { name: label }).parentElement?.querySelector<HTMLElement>('.palette-swatch');
      expect(swatchNode, label).not.toBeNull();
      expect(swatchNode!.style.getPropertyValue('--swatch'), label).toBe(swatch);
    }
  });
});
