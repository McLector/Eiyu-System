import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { describe, expect, it } from '@jest/globals';

import { WEEKLY_DAYS, WEEKLY_LABEL_WIDTH, weeklyColumnWidth } from '../../lib/weekly-columns';
import WeeklyReviewMatrix from '../weekly-review-matrix';

describe('WeeklyReviewMatrix', () => {
  it('exposes exact date and stat values to assistive technologies', async () => {
    await render(
      <WeeklyReviewMatrix
        data={[
          { dateKey: '2026-12-25', day: 'Fri', STR: 1, INT: 0, DEX: 0, WIS: 0, CHA: 0 },
          { dateKey: '2026-12-26', day: 'Sat', STR: 0, INT: 3, DEX: 0, WIS: 0, CHA: 0 },
          { dateKey: '2026-12-27', day: 'Sun', STR: 0, INT: 0, DEX: 4, WIS: 0, CHA: 0 },
          { dateKey: '2026-12-28', day: 'Mon', STR: 0, INT: 0, DEX: 0, WIS: 10, CHA: 0 },
          { dateKey: '2026-12-29', day: 'Tue', STR: 0, INT: 0, DEX: 0, WIS: 0, CHA: 1 },
          { dateKey: '2026-12-30', day: 'Wed', STR: 0, INT: 0, DEX: 0, WIS: 0, CHA: 2 },
          { dateKey: '2026-12-31', day: 'Thu', STR: 0, INT: 0, DEX: 0, WIS: 0, CHA: 0 },
        ]}
        colors={{ text: '#fff', muted: '#aaa', accent: '#0ff', track: '#123' }}
      />
    );

    expect(screen.getByLabelText(/WIS, Mon, December 28, 2026: 10 completions/)).toBeTruthy();
    expect(screen.getByLabelText(/STR, Thu, December 31, 2026: 0 completions/)).toBeTruthy();
  });
});

const week = [
  { dateKey: '2026-12-05', day: 'Sat', STR: 1, INT: 0, DEX: 0, WIS: 0, CHA: 0 },
  { dateKey: '2026-12-06', day: 'Sun', STR: 0, INT: 3, DEX: 0, WIS: 0, CHA: 0 },
  { dateKey: '2026-12-07', day: 'Mon', STR: 0, INT: 0, DEX: 4, WIS: 0, CHA: 0 },
  { dateKey: '2026-12-08', day: 'Tue', STR: 0, INT: 0, DEX: 0, WIS: 10, CHA: 0 },
  { dateKey: '2026-12-09', day: 'Wed', STR: 0, INT: 0, DEX: 0, WIS: 0, CHA: 1 },
  { dateKey: '2026-12-10', day: 'Thu', STR: 0, INT: 0, DEX: 0, WIS: 0, CHA: 2 },
  { dateKey: '2026-12-11', day: 'Fri', STR: 0, INT: 0, DEX: 0, WIS: 0, CHA: 0 },
];
const colors = { text: '#fff', muted: '#aaa', accent: '#0ff', track: '#123' };
const layout = (width: number) => ({ nativeEvent: { layout: { x: 0, y: 0, width, height: 300 } } });

describe('WeeklyReviewMatrix fit', () => {
  it('has no horizontal scroller', async () => {
    await render(<WeeklyReviewMatrix data={week} colors={colors} />);
    expect(JSON.stringify(screen.toJSON())).not.toContain('RCTScrollView');
  });

  it('shows a two-line header (short day, day of month without a leading zero) and keeps the full date for screen readers', async () => {
    await render(<WeeklyReviewMatrix data={week} colors={colors} />);
    const header = screen.getByLabelText('Sat, December 5, 2026');
    expect(within(header).getByText('Sa')).toBeTruthy();
    expect(within(header).getByText('5')).toBeTruthy();
    expect(within(header).queryByText('05')).toBeNull();
    expect(within(screen.getByLabelText('Tue, December 8, 2026')).getByText('Tu')).toBeTruthy();
  });

  it('keeps the cell labels', async () => {
    await render(<WeeklyReviewMatrix data={week} colors={colors} />);
    expect(screen.getByLabelText(/WIS, Tue, December 8, 2026: 10 completions/)).toBeTruthy();
  });

  it('keeps each value and stat label to one line, shrinking to fit', async () => {
    await render(<WeeklyReviewMatrix data={week} colors={colors} />);
    const value = within(screen.getByLabelText(/WIS, Tue, December 8, 2026: 10 completions/)).getByText('10');
    expect(value.props.numberOfLines).toBe(1);
    expect(value.props.adjustsFontSizeToFit).toBe(true);
    expect(screen.getByText('STR').props.numberOfLines).toBe(1);
  });

  it('sizes day columns from the measured width with the shared helper, and fits at 320 dp', async () => {
    await render(<WeeklyReviewMatrix data={week} colors={colors} />);
    await fireEvent(screen.getByTestId('weekly-matrix'), 'layout', layout(288));
    const cell = screen.getByLabelText(/STR, Sat, December 5, 2026: 1 completions/);
    const width = StyleSheet.flatten(cell.props.style).width;
    expect(width).toBe(weeklyColumnWidth(288));
    expect(WEEKLY_LABEL_WIDTH + WEEKLY_DAYS * width).toBeLessThanOrEqual(288);
  });

  it('falls back to equal flex columns before it has been measured', async () => {
    await render(<WeeklyReviewMatrix data={week} colors={colors} />);
    const cell = screen.getByLabelText(/STR, Sat, December 5, 2026: 1 completions/);
    expect(StyleSheet.flatten(cell.props.style)).toMatchObject({ flex: 1 });
  });

  it('survives a zero-width layout and an empty week', async () => {
    await render(<WeeklyReviewMatrix data={[]} colors={colors} />);
    await fireEvent(screen.getByTestId('weekly-matrix'), 'layout', layout(0));
    expect(screen.getByText('STAT')).toBeTruthy();
    expect(screen.getByText('INT')).toBeTruthy();
  });
});
