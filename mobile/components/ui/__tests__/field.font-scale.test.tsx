import { act, render, screen } from '@testing-library/react-native';

import { Field } from '../field';
import { TestThemeProvider } from '../test-theme';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 360, height: 800, scale: 3, fontScale: mockScale }),
}));
beforeEach(() => { mockScale = 1; });

const ui = () => (
  <TestThemeProvider>
    <Field label="Email" value="a" onChangeText={() => {}} error="Bad" />
    <Field label="Name" value="b" onChangeText={() => {}} hint="Shown on the board" />
  </TestThemeProvider>
);

describe('Field font-scale nudge', () => {
  it('leaves label, input and notes with their own spacing at mount', async () => {
    await render(ui());
    expect(screen.getByText('Email')).toHaveStyle({ letterSpacing: 1.2 });
    expect(screen.getByLabelText('Email')).not.toHaveStyle({ letterSpacing: expect.anything() });
    expect(screen.getByText('Bad')).not.toHaveStyle({ letterSpacing: expect.anything() });
  });

  it('adds a tiny letterSpacing offset after the system font scale changes, keeping every other style', async () => {
    await render(ui());
    mockScale = 1.6;
    await act(async () => { await screen.rerender(ui()); });
    expect(screen.getByText('Email')).toHaveStyle({ letterSpacing: 1.21, fontSize: 11, textTransform: 'uppercase' });
    expect(screen.getByLabelText('Email')).toHaveStyle({ letterSpacing: 0.01, minHeight: 48, fontSize: 15 });
    expect(screen.getByText('Bad')).toHaveStyle({ letterSpacing: 0.01, fontSize: 12 });
    expect(screen.getByText('Shown on the board')).toHaveStyle({ letterSpacing: 0.01 });
    mockScale = 1;
    await act(async () => { await screen.rerender(ui()); });
    expect(screen.getByLabelText('Email')).toHaveStyle({ letterSpacing: 0.02 });
  });

  it('keeps value, focus callbacks and font scaling untouched', async () => {
    await render(ui());
    mockScale = 1.6;
    await act(async () => { await screen.rerender(ui()); });
    const input = screen.getByLabelText('Email');
    expect(input).toHaveProp('value', 'a');
    expect(input.props.allowFontScaling).not.toBe(false);
    expect(screen.getByText('Email').props.allowFontScaling).not.toBe(false);
  });
});
