// Custom entry: the widget's headless task handler must be registered here, before any screen renders, because Android can
// start the JS runtime just to draw the home-screen widget. Expo Router's own entry stays the app entry.
import 'expo-router/entry';
import { registerWidgetTaskHandler } from 'react-native-android-widget';

import { widgetTaskHandler } from './widgets/widget-task-handler';

registerWidgetTaskHandler(widgetTaskHandler);
