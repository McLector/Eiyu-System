import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ReactElement } from 'react';
import { PixelRatio } from 'react-native';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';

import { decodeSnapshot, widgetFontScale, widgetView, WIDGET_KEY } from '@/lib/widget-snapshot';

import { renderTodayWidget } from './today-widget';

/**
 * Draws the home-screen widget. Android can start this with no app screen at all (when the widget is added, resized, or
 * on its 30-minute refresh), so it only reads the snapshot the app last wrote and never touches the network or an account
 * (D19). A tap is an open-app action Android handles itself, so clicks and removals draw nothing.
 */
async function readSnapshot(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(WIDGET_KEY);
  } catch {
    return null;
  }
}

function readFontScale(): number {
  try {
    return widgetFontScale(PixelRatio.getFontScale());
  } catch {
    return 1;
  }
}

/** The widget as it should look right now at this size. Shared with the app's own redraw request. */
export async function drawTodayWidget(size: { height: number; width: number }): Promise<ReactElement> {
  // The widget draws text in sp, so rows grow with the phone's font size. Unreadable means the normal size.
  const fontScale = readFontScale();
  const view = widgetView(decodeSnapshot(await readSnapshot()), new Date(), size.height, fontScale);
  return renderTodayWidget(view, size.width, fontScale);
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  if (props.widgetAction === 'WIDGET_DELETED' || props.widgetAction === 'WIDGET_CLICK') return;
  props.renderWidget(await drawTodayWidget(props.widgetInfo));
}
