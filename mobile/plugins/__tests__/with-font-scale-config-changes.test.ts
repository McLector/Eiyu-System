const plugin = require('../with-font-scale-config-changes');

const { addFontScaleConfigChange } = plugin;

function manifest(configChanges?: string) {
  const mainActivity: Record<string, unknown> = {
    $: { 'android:name': '.MainActivity', ...(configChanges === undefined ? {} : { 'android:configChanges': configChanges }) },
    'intent-filter': [{ action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }] }],
  };
  const other = { $: { 'android:name': '.Other', 'android:configChanges': 'orientation' } };
  return { manifest: { application: [{ activity: [other, mainActivity] }] } };
}

const mainOf = (m: ReturnType<typeof manifest>) => m.manifest.application[0].activity[1] as { $: Record<string, string> };

describe('addFontScaleConfigChange', () => {
  it('adds fontScale to the main activity and keeps the values that were already there', () => {
    const m = addFontScaleConfigChange(manifest('keyboard|keyboardHidden|orientation|screenSize|screenLayout|uiMode'));
    expect(mainOf(m).$['android:configChanges']).toBe('keyboard|keyboardHidden|orientation|screenSize|screenLayout|uiMode|fontScale');
  });

  it('adds the attribute when the activity had none', () => {
    expect(mainOf(addFontScaleConfigChange(manifest())).$['android:configChanges']).toBe('fontScale');
  });

  it('is idempotent: a second run changes nothing', () => {
    const once = addFontScaleConfigChange(manifest('orientation|uiMode'));
    const twice = addFontScaleConfigChange(once);
    expect(mainOf(twice).$['android:configChanges']).toBe('orientation|uiMode|fontScale');
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });

  it('does not add a second copy when fontScale is already first or in the middle', () => {
    expect(mainOf(addFontScaleConfigChange(manifest('fontScale|uiMode'))).$['android:configChanges']).toBe('fontScale|uiMode');
    expect(mainOf(addFontScaleConfigChange(manifest('orientation|fontScale|uiMode'))).$['android:configChanges']).toBe('orientation|fontScale|uiMode');
  });

  it('leaves other activities alone', () => {
    const m = addFontScaleConfigChange(manifest('uiMode'));
    expect((m.manifest.application[0].activity[0] as { $: Record<string, string> }).$['android:configChanges']).toBe('orientation');
  });

  it('throws a clear error when there is no main activity', () => {
    expect(() => addFontScaleConfigChange({ manifest: { application: [{ activity: [] }] } })).toThrow(/MainActivity/);
    expect(() => addFontScaleConfigChange({ manifest: {} })).toThrow(/MainActivity/);
  });
});

describe('plugin export', () => {
  it('is a config plugin function', () => {
    expect(typeof plugin).toBe('function');
  });
});
