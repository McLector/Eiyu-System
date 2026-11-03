import { act, render, screen } from '@testing-library/react-native';
import type { Quest } from '@eiyu/shared';

import { TestThemeProvider } from '../../ui/test-theme';
import { QuestRow } from '../quest-row';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 360, height: 800, scale: 3, fontScale: mockScale }),
}));
beforeEach(() => { mockScale = 1; });

const quest = {
  id: 'q', name: 'Read 20 pages', stat: 'INT', difficulty: 'Easy', easyVersion: 'Read 5', description: null, questType: 'habit',
  archived: false, time: '08:00', days: [1, 3, 5], streak: 0, frozen: false, completed: false, targetCount: null,
  progressCount: 0,
} as Quest;
const row = () => (
  <TestThemeProvider>
    <QuestRow quest={quest} pending={false} onToggle={jest.fn()} onOpen={jest.fn()} onAdjustProgress={jest.fn()} onActions={jest.fn()} />
  </TestThemeProvider>
);

describe('QuestRow title font-scale nudge', () => {
  it('has no letterSpacing patch at mount and keeps its own style', async () => {
    await render(row());
    expect(screen.getByText('Read 20 pages')).not.toHaveStyle({ letterSpacing: expect.anything() });
    expect(screen.getByText('Read 20 pages')).toHaveProp('numberOfLines', 2);
  });

  it('merges the patch after a font-scale change without losing the base style', async () => {
    await render(row());
    mockScale = 1.6;
    await act(async () => { await screen.rerender(row()); });
    const title = screen.getByText('Read 20 pages');
    expect(title).toHaveStyle({ letterSpacing: 0.01, textDecorationLine: 'none' });
    expect(title).toHaveProp('numberOfLines', 2);
    mockScale = 1;
    await act(async () => { await screen.rerender(row()); });
    expect(screen.getByText('Read 20 pages')).toHaveStyle({ letterSpacing: 0.02 });
  });
});
