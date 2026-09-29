import { render, screen } from '@testing-library/react-native';
import { describe, expect, it } from '@jest/globals';

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
