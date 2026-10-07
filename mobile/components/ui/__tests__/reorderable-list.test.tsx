import { act, fireEvent, screen } from '@testing-library/react-native';
import { PanResponder, Text } from 'react-native';

import { renderWithTheme, TestThemeProvider } from '../test-theme';
import { ReorderableList } from '../reorderable-list';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const items = [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Bravo' }, { id: 'c', name: 'Charlie' }];

/** Hands the responder callbacks to the grip as plain props, so a test can run a drag without a touch history. */
beforeEach(() => {
  jest.spyOn(PanResponder, 'create').mockImplementation(config => ({
    panHandlers: {
      onResponderGrant: config.onPanResponderGrant,
      onResponderMove: config.onPanResponderMove,
      onResponderRelease: config.onPanResponderRelease,
      onResponderTerminate: config.onPanResponderTerminate,
      onResponderTerminationRequest: config.onPanResponderTerminationRequest,
      onStartShouldSetResponder: config.onStartShouldSetPanResponder,
    },
  } as unknown as ReturnType<typeof PanResponder.create>));
});
afterEach(() => jest.restoreAllMocks());

async function setup(over: Partial<React.ComponentProps<typeof ReorderableList>> = {}, list = items) {
  const onReorder = jest.fn();
  const onDragChange = jest.fn();
  const view = await renderWithTheme(
    <ReorderableList
      items={list}
      onReorder={onReorder}
      onDragChange={onDragChange}
      renderRow={(id, grip) => (<><Text>{`row ${id}`}</Text>{grip}</>)}
      {...over}
    />
  );
  return { onReorder, onDragChange, view };
}
const measure = async (heights: Record<string, number>) => {
  for (const [id, height] of Object.entries(heights)) {
    await act(async () => { fireEvent(screen.getByTestId(`reorder-row-${id}`), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 300, height } } }); });
  }
};
const grip = (id: string) => screen.getByTestId(`reorder-grip-${id}`);
const call = async (id: string, handler: string, ...args: unknown[]) => {
  await act(async () => { grip(id).props[handler](...args); });
};

describe('ReorderableList', () => {
  it('renders every row in order, each with a grip named for it', async () => {
    await setup();
    expect(screen.getAllByText(/^row /).map(node => node.props.children)).toEqual(['row a', 'row b', 'row c']);
    expect(grip('b')).toHaveProp('accessibilityLabel', 'Reorder Bravo');
  });

  it('shows no grips for a lone row, since there is nowhere to move it', async () => {
    await setup({}, [items[0]]);
    expect(screen.queryByTestId('reorder-grip-a')).toBeNull();
    expect(screen.getByText('row a')).toBeOnTheScreen();
  });

  it('renders nothing for an empty list', async () => {
    await setup({}, []);
    expect(screen.queryByText(/^row /)).toBeNull();
  });

  describe('accessibility actions', () => {
    it('moves a row down and up one place', async () => {
      const { onReorder } = await setup();
      await call('a', 'onAccessibilityAction', { nativeEvent: { actionName: 'moveDown' } });
      expect(onReorder).toHaveBeenLastCalledWith(['b', 'a', 'c']);
      await call('c', 'onAccessibilityAction', { nativeEvent: { actionName: 'moveUp' } });
      expect(onReorder).toHaveBeenLastCalledWith(['a', 'c', 'b']);
    });

    it('does nothing for a move off either end, or an unknown action', async () => {
      const { onReorder } = await setup();
      await call('a', 'onAccessibilityAction', { nativeEvent: { actionName: 'moveUp' } });
      await call('c', 'onAccessibilityAction', { nativeEvent: { actionName: 'moveDown' } });
      await call('b', 'onAccessibilityAction', { nativeEvent: { actionName: 'activate' } });
      expect(onReorder).not.toHaveBeenCalled();
    });

    it('offers Move up and Move down by name', async () => {
      await setup();
      expect(grip('b').props.accessibilityActions).toEqual([
        { name: 'moveUp', label: 'Move up' },
        { name: 'moveDown', label: 'Move down' },
      ]);
    });
  });

  describe('dragging a grip', () => {
    it('tells the screen a drag has started, so it can hold its scrolling still, and ends it on release', async () => {
      const { onDragChange } = await setup();
      await measure({ a: 50, b: 50, c: 50 });
      await call('b', 'onResponderGrant');
      expect(onDragChange).toHaveBeenLastCalledWith(true);
      await call('b', 'onResponderRelease', {}, { dy: 0 });
      expect(onDragChange).toHaveBeenLastCalledWith(false);
    });

    it('drops a row one place down when it is dragged past the next row\'s middle', async () => {
      const { onReorder } = await setup();
      await measure({ a: 50, b: 50, c: 50 });
      await call('b', 'onResponderGrant');
      await call('b', 'onResponderRelease', {}, { dy: 60 });
      expect(onReorder).toHaveBeenCalledWith(['a', 'c', 'b']);
    });

    it('drops a row to the top when it is dragged far up', async () => {
      const { onReorder } = await setup();
      await measure({ a: 50, b: 50, c: 50 });
      await call('c', 'onResponderGrant');
      await call('c', 'onResponderRelease', {}, { dy: -400 });
      expect(onReorder).toHaveBeenCalledWith(['c', 'a', 'b']);
    });

    it('does not reorder for a small drag that stays inside the row', async () => {
      const { onReorder } = await setup();
      await measure({ a: 50, b: 50, c: 50 });
      await call('b', 'onResponderGrant');
      await call('b', 'onResponderRelease', {}, { dy: 10 });
      expect(onReorder).not.toHaveBeenCalled();
    });

    it('does not reorder when the touch is taken away, and still ends the drag', async () => {
      const { onReorder, onDragChange } = await setup();
      await measure({ a: 50, b: 50, c: 50 });
      await call('b', 'onResponderGrant');
      await call('b', 'onResponderTerminate');
      expect(onReorder).not.toHaveBeenCalled();
      expect(onDragChange).toHaveBeenLastCalledWith(false);
    });

    it('refuses to give the touch up to a scroller while dragging', async () => {
      await setup();
      expect(grip('b').props.onResponderTerminationRequest()).toBe(false);
      expect(grip('b').props.onStartShouldSetResponder()).toBe(true);
    });

    it('does not reorder before the rows have been measured', async () => {
      const { onReorder } = await setup();
      await call('b', 'onResponderGrant');
      await call('b', 'onResponderRelease', {}, { dy: 200 });
      expect(onReorder).not.toHaveBeenCalled();
    });

    it('lifts the dragged row above the others while it moves', async () => {
      await setup();
      await measure({ a: 50, b: 50, c: 50 });
      await call('b', 'onResponderGrant');
      await call('b', 'onResponderMove', {}, { dy: 30 });
      const style = JSON.stringify(screen.getByTestId('reorder-row-b').props.style);
      expect(style).toContain('zIndex');
      expect(JSON.stringify(screen.getByTestId('reorder-row-a').props.style ?? {})).not.toContain('zIndex');
    });

    it('uses the latest callbacks, not the ones from when the drag was first set up', async () => {
      const first = jest.fn();
      const second = jest.fn();
      const { view } = await setup({ onReorder: first });
      await measure({ a: 50, b: 50, c: 50 });
      await view.rerender(
        <TestThemeProvider>
          <ReorderableList items={items} onReorder={second} renderRow={(id, g) => (<><Text>{`row ${id}`}</Text>{g}</>)} />
        </TestThemeProvider>
      );
      await call('b', 'onResponderGrant');
      await call('b', 'onResponderRelease', {}, { dy: 60 });
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledWith(['a', 'c', 'b']);
    });
  });
});
