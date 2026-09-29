// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';

import WeeklyReviewMatrix, { formatDateKey } from '../WeeklyReviewMatrix';

describe('WeeklyReviewMatrix', () => {
  it('keeps the exact calendar key at year and month boundaries in positive and negative zones', () => {
    for (const zone of ['Pacific/Kiritimati', 'Pacific/Auckland', 'Pacific/Fiji', 'America/Los_Angeles', 'Pacific/Honolulu']) {
      expect(formatDateKey('2026-12-31', zone)).toBe('December 31, 2026');
      expect(formatDateKey('2027-01-01', zone)).toBe('January 1, 2027');
      expect(formatDateKey('2027-02-01', zone)).toBe('February 1, 2027');
    }
  });
  it('renders one shared date header, five stat rows, and exact visible values', () => {
    render(
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
        timeZone="America/Los_Angeles"
      />
    );

    expect(screen.getByRole('table', { name: /weekly activity/i })).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader')).toHaveLength(8);
    expect(screen.getAllByRole('rowheader')).toHaveLength(5);
    expect(screen.getByRole('columnheader', { name: /Fri.*December 25, 2026/i })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: /WIS.*December 28, 2026.*10/i })).toHaveAttribute('data-scale', '1.00');
    expect(screen.getByRole('cell', { name: /DEX.*December 27, 2026.*4/i })).toHaveAttribute('data-scale', '0.40');
    expect(screen.getByRole('cell', { name: /WIS.*December 28, 2026.*10/i })).toHaveTextContent('10');
    expect(screen.getByRole('cell', { name: /STR.*December 31, 2026.*0/i })).toHaveTextContent('0');
  });
});
