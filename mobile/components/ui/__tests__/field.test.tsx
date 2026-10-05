import { fireEvent, screen } from '@testing-library/react-native';
import { PALETTE_TOKENS } from '@eiyu/shared';
import { StyleSheet } from 'react-native';

import { Field } from '../field';
import { renderWithTheme, TestThemeProvider } from '../test-theme';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const T = PALETTE_TOKENS.cyan.dark;

describe('Field', () => {
  it('shows its label and is reachable by it', async () => {
    await renderWithTheme(<Field label="Display name" value="" onChangeText={() => {}} />);
    expect(screen.getByText('Display name')).toBeOnTheScreen();
    expect(screen.getByLabelText('Display name')).toBeOnTheScreen();
  });

  it('reports what is typed', async () => {
    const onChangeText = jest.fn();
    await renderWithTheme(<Field label="Name" value="" onChangeText={onChangeText} />);
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Yuki');
    expect(onChangeText).toHaveBeenCalledWith('Yuki');
  });

  it('shows the value it is given', async () => {
    await renderWithTheme(<Field label="Name" value="Yuki" onChangeText={() => {}} />);
    expect(screen.getByLabelText('Name')).toHaveDisplayValue('Yuki');
  });

  it('sits on the palette track with a hairline border', async () => {
    await renderWithTheme(<Field label="Name" value="" onChangeText={() => {}} />);
    expect(screen.getByLabelText('Name')).toHaveStyle({ backgroundColor: T.track, borderColor: T['glass-border'], color: T.text });
  });

  it('lights its border while focused and puts it back after', async () => {
    await renderWithTheme(<Field label="Name" value="" onChangeText={() => {}} />);
    const input = screen.getByLabelText('Name');
    await fireEvent(input, 'focus');
    expect(input).toHaveStyle({ borderColor: T.accent });
    await fireEvent(input, 'blur');
    expect(input).toHaveStyle({ borderColor: T['glass-border'] });
  });

  it('calls the caller\'s own focus and blur handlers too', async () => {
    const onFocus = jest.fn();
    const onBlur = jest.fn();
    await renderWithTheme(<Field label="Name" value="" onChangeText={() => {}} onFocus={onFocus} onBlur={onBlur} />);
    await fireEvent(screen.getByLabelText('Name'), 'focus');
    await fireEvent(screen.getByLabelText('Name'), 'blur');
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it('shows an error as an alert and marks the border, which stays red while focused', async () => {
    await renderWithTheme(<Field label="Name" value="" onChangeText={() => {}} error="Name is required" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Name is required');
    const input = screen.getByLabelText('Name');
    expect(input).toHaveStyle({ borderColor: T.danger });
    await fireEvent(input, 'focus');
    expect(input).toHaveStyle({ borderColor: T.danger });
  });

  it('shows a hint when there is no error, and the error instead of it when there is one', async () => {
    await renderWithTheme(<Field label="Name" value="" onChangeText={() => {}} hint="Shown on your profile" />);
    expect(screen.getByText('Shown on your profile')).toBeOnTheScreen();
    await screen.rerender(
      <TestThemeProvider><Field label="Name" value="" onChangeText={() => {}} hint="Shown on your profile" error="Too long" /></TestThemeProvider>,
    );
    expect(screen.queryByText('Shown on your profile')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent('Too long');
  });

  it('is at least 48dp tall, and taller for a multiline note', async () => {
    await renderWithTheme(
      <>
        <Field label="Name" value="" onChangeText={() => {}} />
        <Field label="Note" value="" onChangeText={() => {}} multiline />
      </>,
    );
    expect(StyleSheet.flatten(screen.getByLabelText('Name').props.style).minHeight).toBeGreaterThanOrEqual(48);
    expect(StyleSheet.flatten(screen.getByLabelText('Note').props.style).minHeight).toBeGreaterThanOrEqual(96);
    expect(screen.getByLabelText('Note')).toHaveProp('multiline', true);
  });

  it('can be switched off', async () => {
    await renderWithTheme(<Field label="Name" value="Yuki" onChangeText={() => {}} editable={false} />);
    expect(screen.getByLabelText('Name')).toHaveProp('editable', false);
  });

  it('lets the label read differently for screen readers', async () => {
    await renderWithTheme(<Field label="Name" accessibilityLabel="Quest name" value="" onChangeText={() => {}} />);
    expect(screen.getByLabelText('Quest name')).toBeOnTheScreen();
  });
});
