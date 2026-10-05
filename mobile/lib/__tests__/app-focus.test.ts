import { installAppFocus } from '../app-focus';

function fakes() {
  const handlers: Array<(state: string) => void> = [];
  const remove = jest.fn();
  const appState = {
    currentState: 'active',
    addEventListener: jest.fn((_event: string, handler: (state: string) => void) => {
      handlers.push(handler);
      return { remove };
    }),
  };
  let setup: ((onFocus: (focused?: boolean) => void) => () => void) | undefined;
  const focusManager = { setEventListener: jest.fn((fn: typeof setup) => { setup = fn; }) };
  const install = () => installAppFocus({ appState: appState as never, focusManager: focusManager as never });
  return { appState, focusManager, handlers, remove, install, start: (onFocus: (focused?: boolean) => void) => setup!(onFocus) };
}

describe('installAppFocus', () => {
  it('reports focus when the app becomes active and blur for every other state', () => {
    const f = fakes();
    f.install();
    const onFocus = jest.fn();
    f.start(onFocus);
    f.handlers[0]('background');
    expect(onFocus).toHaveBeenLastCalledWith(false);
    f.handlers[0]('active');
    expect(onFocus).toHaveBeenLastCalledWith(true);
    f.handlers[0]('inactive');
    expect(onFocus).toHaveBeenLastCalledWith(false);
  });

  it('subscribes to the change event only, and only once TanStack asks for the listener', () => {
    const f = fakes();
    f.install();
    expect(f.appState.addEventListener).not.toHaveBeenCalled();
    f.start(jest.fn());
    expect(f.appState.addEventListener).toHaveBeenCalledTimes(1);
    expect(f.appState.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('removes its AppState subscription when TanStack tears the listener down, so remounts do not stack listeners', () => {
    const f = fakes();
    f.install();
    const teardown = f.start(jest.fn());
    expect(f.remove).not.toHaveBeenCalled();
    teardown();
    expect(f.remove).toHaveBeenCalledTimes(1);
  });
});
