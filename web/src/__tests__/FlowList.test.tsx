// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { useState } from 'react';
import FlowList from '../components/FlowList';

function Exercises({ count = 8 }: { count?: number }) {
  const [weights, setWeights] = useState<Record<string, string>>({});
  return <FlowList label="Exercises" size={6} narrowSize={3}>{Array.from({ length: count }, (_, i) =>
    <div key={i} data-item-id={'exercise-' + i}><label>Weight {i}<input value={weights[i] ?? ''} onChange={event => setWeights({ ...weights, [i]: event.target.value })} /></label></div>
  )}</FlowList>;
}
const resize = (width: number, height = 900) => act(() => {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true });
  window.dispatchEvent(new Event('resize'));
});
beforeEach(() => resize(1440));
afterEach(() => { cleanup(); resize(1440); });

it('keeps the focused exercise and entered value when desktop rows become narrow cards', () => {
  render(<Exercises />);
  const field = screen.getByRole('textbox', { name: 'Weight 5' });
  fireEvent.change(field, { target: { value: '20' } }); field.focus();
  resize(390);
  expect(screen.getAllByRole('textbox')).toHaveLength(3);
  expect(screen.getByRole('textbox', { name: 'Weight 5' })).toHaveValue('20');
  expect(screen.getByRole('textbox', { name: 'Weight 5' })).toHaveFocus();
  expect(screen.getByText('2 / 3')).toBeInTheDocument();
  resize(1440);
  expect(screen.getAllByRole('textbox')).toHaveLength(6);
  expect(screen.getByRole('textbox', { name: 'Weight 5' })).toHaveFocus();
  expect(screen.getByRole('textbox', { name: 'Weight 5' })).toHaveValue('20');
});

it('does not alter page capacity or membership when only keyboard height changes', () => {
  resize(390); render(<Exercises />);
  fireEvent.click(screen.getByRole('button', { name: 'Next Exercises page' }));
  const field = screen.getByRole('textbox', { name: 'Weight 4' }); field.focus();
  resize(390, 300);
  expect(screen.getAllByRole('textbox').map(el => el.getAttribute('value'))).toEqual(['', '', '']);
  expect(screen.getByRole('textbox', { name: 'Weight 4' })).toHaveFocus();
  expect(screen.getByText('2 / 3')).toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: 'Weight 0' })).not.toBeInTheDocument();
});

it('clamps page membership after deletion without dropping values of surviving rows', () => {
  resize(390); const view = render(<Exercises />);
  fireEvent.click(screen.getByRole('button', { name: 'Next Exercises page' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Weight 4' }), { target: { value: '0' } });
  fireEvent.click(screen.getByRole('button', { name: 'Next Exercises page' }));
  view.rerender(<Exercises count={5} />);
  expect(screen.getByText('2 / 2')).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Weight 4' })).toHaveValue('0');
  expect(screen.getByRole('button', { name: 'Next Exercises page' })).toBeDisabled();
});
