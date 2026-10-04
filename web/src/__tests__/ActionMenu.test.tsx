// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ActionMenu from '../components/ActionMenu';

afterEach(cleanup);

const items = (spies: Record<string, () => void> = {}) => [
  { label: 'Details', ariaLabel: 'Open Walk details', onSelect: spies.details ?? vi.fn() },
  { label: 'Archive', ariaLabel: 'Archive Walk', onSelect: spies.archive ?? vi.fn() },
  { label: 'Delete', ariaLabel: 'Delete Walk', onSelect: spies.remove ?? vi.fn(), danger: true },
];
const trigger = () => screen.getByRole('button', { name: 'More actions for Walk' });

describe('ActionMenu', () => {
  it('is a labelled menu button that starts closed', () => {
    render(<ActionMenu label="More actions for Walk" items={items()} />);
    expect(trigger()).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens on click, names the menu after its trigger and focuses the first item', async () => {
    const user = userEvent.setup();
    render(<ActionMenu label="More actions for Walk" items={items()} />);
    await user.click(trigger());
    const menu = screen.getByRole('menu', { name: 'More actions for Walk' });
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(trigger()).toHaveAttribute('aria-controls', menu.id);
    expect(within(menu).getAllByRole('menuitem').map(i => i.getAttribute('aria-label'))).toEqual(['Open Walk details', 'Archive Walk', 'Delete Walk']);
    expect(within(menu).getAllByRole('menuitem')[0]).toHaveFocus();
  });

  it('moves with the arrow keys, wraps at both ends, and Home/End jump', async () => {
    const user = userEvent.setup();
    render(<ActionMenu label="More actions for Walk" items={items()} />);
    await user.click(trigger());
    const [a, b, c] = screen.getAllByRole('menuitem');
    await user.keyboard('{ArrowDown}'); expect(b).toHaveFocus();
    await user.keyboard('{ArrowDown}'); expect(c).toHaveFocus();
    await user.keyboard('{ArrowDown}'); expect(a).toHaveFocus();
    await user.keyboard('{ArrowUp}'); expect(c).toHaveFocus();
    await user.keyboard('{Home}'); expect(a).toHaveFocus();
    await user.keyboard('{End}'); expect(c).toHaveFocus();
  });

  it('skips disabled items when moving', async () => {
    const user = userEvent.setup();
    render(<ActionMenu label="More actions for Walk" items={[{ label: 'A', onSelect: vi.fn() }, { label: 'B', onSelect: vi.fn(), disabled: true }, { label: 'C', onSelect: vi.fn() }]} />);
    await user.click(trigger());
    const [a, , c] = screen.getAllByRole('menuitem');
    expect(a).toHaveFocus();
    await user.keyboard('{ArrowDown}'); expect(c).toHaveFocus();
    await user.keyboard('{ArrowUp}'); expect(a).toHaveFocus();
  });

  it('closes on Escape and gives focus back to the trigger', async () => {
    const user = userEvent.setup();
    render(<ActionMenu label="More actions for Walk" items={items()} />);
    await user.click(trigger());
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger()).toHaveFocus();
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes on Tab and keeps focus on the trigger rather than losing it to the page', async () => {
    const user = userEvent.setup();
    render(<ActionMenu label="More actions for Walk" items={items()} />);
    await user.click(trigger());
    await user.keyboard('{Tab}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger()).toHaveFocus();
  });

  it('closes on a press outside, a scroll, and a resize', async () => {
    const user = userEvent.setup();
    render(<div><ActionMenu label="More actions for Walk" items={items()} /><p>elsewhere</p></div>);
    await user.click(trigger());
    await user.click(screen.getByText('elsewhere'));
    expect(screen.queryByRole('menu')).toBeNull();
    await user.click(trigger());
    fireEvent.scroll(window);
    expect(screen.queryByRole('menu')).toBeNull();
    await user.click(trigger());
    fireEvent(window, new Event('resize'));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('keeps focus on the trigger when a scroll or resize closes the menu while focus is inside it', async () => {
    const user = userEvent.setup();
    render(<ActionMenu label="More actions for Walk" items={items()} />);
    await user.click(trigger());
    expect(screen.getAllByRole('menuitem')[0]).toHaveFocus();
    fireEvent.scroll(window);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger()).toHaveFocus();
    await user.click(trigger());
    fireEvent(window, new Event('resize'));
    expect(trigger()).toHaveFocus();
  });

  it('focuses the first item without scrolling the page', async () => {
    const user = userEvent.setup();
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    render(<ActionMenu label="More actions for Walk" items={items()} />);
    await user.click(trigger());
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    focus.mockRestore();
  });

  it('does not steal focus when a press elsewhere closes it', async () => {
    const user = userEvent.setup();
    render(<div><ActionMenu label="More actions for Walk" items={items()} /><input aria-label="other" /></div>);
    await user.click(trigger());
    await user.click(screen.getByLabelText('other'));
    expect(screen.getByLabelText('other')).toHaveFocus();
  });

  it('toggles closed when the trigger is pressed again', async () => {
    const user = userEvent.setup();
    render(<ActionMenu label="More actions for Walk" items={items()} />);
    await user.click(trigger());
    await user.click(trigger());
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('selects an item: returns focus to the trigger first, then runs the action once, and closes', async () => {
    const user = userEvent.setup();
    const seenFocus: (Element | null)[] = [];
    const remove = vi.fn(() => { seenFocus.push(document.activeElement); });
    render(<ActionMenu label="More actions for Walk" items={items({ remove })} />);
    await user.click(trigger());
    await user.click(screen.getByRole('menuitem', { name: 'Delete Walk' }));
    expect(remove).toHaveBeenCalledOnce();
    // A dialog opened by the action remembers the focused element, so it must already be the trigger.
    expect(seenFocus[0]).toBe(trigger());
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('activates an item from the keyboard', async () => {
    const user = userEvent.setup();
    const archive = vi.fn();
    render(<ActionMenu label="More actions for Walk" items={items({ archive })} />);
    await user.click(trigger());
    await user.keyboard('{ArrowDown}{Enter}');
    expect(archive).toHaveBeenCalledOnce();
  });

  it('does not run a disabled item', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ActionMenu label="More actions for Walk" items={[{ label: 'Archive', ariaLabel: 'Archive Walk', onSelect, disabled: true }, { label: 'Delete', ariaLabel: 'Delete Walk', onSelect: vi.fn() }]} />);
    await user.click(trigger());
    expect(screen.getByRole('menuitem', { name: 'Archive Walk' })).toBeDisabled();
    await user.click(screen.getByRole('menuitem', { name: 'Archive Walk' }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('cannot be opened while disabled, and says it is busy', async () => {
    const user = userEvent.setup();
    render(<ActionMenu label="More actions for Walk" items={items()} disabled busy />);
    expect(trigger()).toBeDisabled();
    expect(trigger()).toHaveAttribute('aria-busy', 'true');
    await user.click(trigger());
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('keeps only one menu open at a time', async () => {
    const user = userEvent.setup();
    render(<><ActionMenu label="More actions for A" items={items()} /><ActionMenu label="More actions for B" items={items()} /></>);
    await user.click(screen.getByRole('button', { name: 'More actions for A' }));
    await user.click(screen.getByRole('button', { name: 'More actions for B' }));
    expect(screen.getAllByRole('menu')).toHaveLength(1);
    expect(screen.getByRole('menu', { name: 'More actions for B' })).toBeInTheDocument();
  });

  it('marks a dangerous item for styling without changing its role', async () => {
    const user = userEvent.setup();
    render(<ActionMenu label="More actions for Walk" items={items()} />);
    await user.click(trigger());
    expect(screen.getByRole('menuitem', { name: 'Delete Walk' })).toHaveClass('is-danger');
    expect(screen.getByRole('menuitem', { name: 'Archive Walk' })).not.toHaveClass('is-danger');
  });

  it('removes its menu and listeners when unmounted while open', async () => {
    const user = userEvent.setup();
    const view = render(<ActionMenu label="More actions for Walk" items={items()} />);
    await user.click(trigger());
    view.unmount();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(() => fireEvent.scroll(window)).not.toThrow();
  });

  it('renders an icon and a tone on an item for the redesigned menu', async () => {
    const user = userEvent.setup();
    render(<ActionMenu label="More actions for Walk" items={[{ label: 'Archive', onSelect: vi.fn(), icon: <svg data-testid="icon" />, tone: 'warn' }]} />);
    await user.click(screen.getByRole('button', { name: 'More actions for Walk' }));
    const item = screen.getByRole('menuitem', { name: 'Archive' });
    expect(item).toHaveAttribute('data-tone', 'warn');
    expect(within(item).getByTestId('icon')).toBeInTheDocument();
  });
});
