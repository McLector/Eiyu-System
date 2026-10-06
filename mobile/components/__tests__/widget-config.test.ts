import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..', '..');
const appJson = JSON.parse(readFileSync(path.join(root, 'app.json'), 'utf-8')) as {
  expo: { version: string; runtimeVersion: string; scheme: string; plugins: (string | [string, Record<string, unknown>])[] };
};
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf-8')) as {
  main: string;
  version: string;
  dependencies: Record<string, string>;
};

type Widget = { name: string; label: string; minWidth: string; minHeight: string; updatePeriodMillis: number; resizeMode?: string };
const widgetPlugin = appJson.expo.plugins.find(
  (plugin): plugin is [string, { widgets: Widget[] }] => Array.isArray(plugin) && plugin[0] === 'react-native-android-widget',
);

describe('home screen widget config', () => {
  it('registers the android widget plugin with exactly one widget', () => {
    expect(widgetPlugin).toBeDefined();
    expect(widgetPlugin![1].widgets).toHaveLength(1);
  });

  it('names the widget EiyuToday, labelled for the picker', () => {
    const widget = widgetPlugin![1].widgets[0];
    expect(widget.name).toBe('EiyuToday');
    expect(widget.label).toBe('Eiyu: Today');
  });

  it('refreshes at Android\'s 30 minute floor and no faster', () => {
    expect(widgetPlugin![1].widgets[0].updatePeriodMillis).toBe(1800000);
  });

  it('is resizable and big enough for a header and a few rows', () => {
    const widget = widgetPlugin![1].widgets[0];
    expect(widget.resizeMode).toBe('horizontal|vertical');
    expect(parseInt(widget.minWidth, 10)).toBeGreaterThanOrEqual(250);
    expect(parseInt(widget.minHeight, 10)).toBeGreaterThanOrEqual(110);
  });

  it('ships a native module, so the app and runtime version moved past 1.1.0 together', () => {
    expect(appJson.expo.version).toBe('1.2.0');
    expect(appJson.expo.runtimeVersion).toBe('1.2.0');
    expect(pkg.version).toBe('1.2.0');
  });

  it('pins the library to the version the spike used', () => {
    expect(pkg.dependencies['react-native-android-widget']).toBe('0.22.1');
  });

  it('keeps the deep link scheme the widget tap uses', () => {
    expect(appJson.expo.scheme).toBe('eiyusystem');
  });
});

describe('app entry', () => {
  it('points main at the custom entry, not straight at expo-router', () => {
    expect(pkg.main).toBe('index.ts');
    expect(existsSync(path.join(root, 'index.ts'))).toBe(true);
  });

  it('registers the widget task handler next to the expo-router entry', () => {
    const entry = readFileSync(path.join(root, 'index.ts'), 'utf-8');
    const register = entry.indexOf('registerWidgetTaskHandler(');
    const router = entry.indexOf("import 'expo-router/entry'");
    expect(register).toBeGreaterThan(-1);
    expect(router).toBeGreaterThan(-1);
    expect(entry).toMatch(/from '\.\/widgets\/widget-task-handler'/);
  });
});
