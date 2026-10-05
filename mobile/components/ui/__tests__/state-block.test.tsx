import { screen, userEvent } from '@testing-library/react-native';
import { PALETTE_TOKENS } from '@eiyu/shared';

import { StateBlock } from '../state-block';
import { renderWithTheme } from '../test-theme';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const T = PALETTE_TOKENS.cyan.dark;

describe('StateBlock', () => {
  it('announces loading politely, with its copy', async () => {
    await renderWithTheme(<StateBlock kind="loading" title="Reading the board">Hold on.</StateBlock>);
    const block = screen.getByRole('progressbar');
    expect(block).toHaveProp('accessibilityLiveRegion', 'polite');
    expect(screen.getByText('Reading the board')).toHaveStyle({ textTransform: 'uppercase' });
    expect(screen.getByText('Hold on.')).toBeOnTheScreen();
  });

  it('announces an error assertively, in the danger colour, with a Retry', async () => {
    const onRetry = jest.fn();
    await renderWithTheme(<StateBlock kind="error" title="The System could not load this" onRetry={onRetry}>Check your connection.</StateBlock>);
    expect(screen.getByRole('alert')).toHaveProp('accessibilityLiveRegion', 'assertive');
    expect(screen.getByText('Check your connection.')).toHaveStyle({ color: T.danger });
    await userEvent.setup().press(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('lets the caller word the Retry button', async () => {
    await renderWithTheme(<StateBlock kind="error" onRetry={() => {}} retryLabel="Try again">Failed.</StateBlock>);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
  });

  it('has no Retry when there is nothing to retry, and none outside an error', async () => {
    await renderWithTheme(
      <>
        <StateBlock kind="error">No retry here.</StateBlock>
        <StateBlock kind="empty" onRetry={() => {}}>Nothing yet.</StateBlock>
      </>,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('is quiet when empty: no alert and no progress role', async () => {
    await renderWithTheme(<StateBlock kind="empty" title="Nothing here">Add a quest to begin.</StateBlock>);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByText('Add a quest to begin.')).toHaveStyle({ color: T['dim-flat'] });
  });

  it('works with only a title, or only a message', async () => {
    await renderWithTheme(
      <>
        <StateBlock kind="empty" title="Just a title" />
        <StateBlock kind="empty">Just a message</StateBlock>
      </>,
    );
    expect(screen.getByText('Just a title')).toBeOnTheScreen();
    expect(screen.getByText('Just a message')).toBeOnTheScreen();
  });
});
