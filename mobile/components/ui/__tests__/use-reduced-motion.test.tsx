import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { useReducedMotion } from '../use-reduced-motion';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const handlers: ((enabled: boolean) => void)[] = [];
const remove = jest.fn();
let enabled: jest.SpyInstance;
let listen: jest.SpyInstance;

beforeEach(() => {
  handlers.length = 0;
  remove.mockClear();
  enabled = jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  listen = jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((_event: string, handler: (value: boolean) => void) => {
    handlers.push(handler);
    return { remove };
  }) as never);
});
afterEach(() => {
  enabled.mockRestore();
  listen.mockRestore();
});

describe('useReducedMotion', () => {
  it('is false until the system says otherwise', async () => {
    const { result } = await renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it('turns true when the system setting is already on', async () => {
    enabled.mockResolvedValue(true);
    const { result } = await renderHook(() => useReducedMotion());
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('follows the setting when it changes while the app is open', async () => {
    const { result } = await renderHook(() => useReducedMotion());
    await waitFor(() => expect(handlers).toHaveLength(1));
    await act(async () => { handlers[0](true); });
    expect(result.current).toBe(true);
    await act(async () => { handlers[0](false); });
    expect(result.current).toBe(false);
  });

  it('listens for the reduce-motion event only, and stops when unmounted', async () => {
    const { unmount } = await renderHook(() => useReducedMotion());
    expect(listen).toHaveBeenCalledWith('reduceMotionChanged', expect.any(Function));
    await unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('stays false when the system cannot be asked', async () => {
    enabled.mockRejectedValue(new Error('unavailable'));
    const { result } = await renderHook(() => useReducedMotion());
    await act(async () => { await Promise.resolve(); });
    expect(result.current).toBe(false);
  });
});
