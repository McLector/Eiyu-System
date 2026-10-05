import { focusManager } from '@tanstack/react-query';
import { AppState } from 'react-native';

interface Deps {
  appState: Pick<typeof AppState, 'currentState' | 'addEventListener'>;
  focusManager: Pick<typeof focusManager, 'setEventListener'>;
}

/**
 * TanStack Query only refetches on "window focus" in a browser. On a phone that signal is the app coming back to the
 * foreground, so changes made elsewhere (the web app) show up when you return instead of at the next reconnect or midnight.
 */
export function installAppFocus(deps: Deps = { appState: AppState, focusManager }): void {
  deps.focusManager.setEventListener(onFocus => {
    const subscription = deps.appState.addEventListener('change', state => onFocus(state === 'active'));
    return () => subscription.remove();
  });
}
