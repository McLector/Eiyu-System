import { Pressable, Text } from 'react-native';
import { render, screen, userEvent } from '@testing-library/react-native';

describe('mobile component test harness', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders and interacts through the accessibility contract', async () => {
    jest.useFakeTimers();
    const onPress = jest.fn();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await render(
      <Pressable role="button" aria-label="Harness probe" onPress={onPress}>
        <Text>Harness probe</Text>
      </Pressable>
    );

    await user.press(screen.getByRole('button', { name: 'Harness probe' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
