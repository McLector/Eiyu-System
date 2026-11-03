import {
  chainGatewayInput, habitGatewayInput, toBasicChainInput, toBasicHabitInput,
  type BasicHabitInput, type HabitEditorInput,
} from '../tracker-input';
import type {HabitInput} from '../../data/habits';
import type {LongQuestInput} from '../../data/long-quests';

const full: HabitInput = {
  name: 'Synthetic private quest', easyVersion: 'Synthetic easy text', stat: 'STR', difficulty: 'Medium', time: '07:30',
  days: [1, 3], questType: 'habit', description: 'Synthetic description', scheduledDate: null, targetCount: 3,
  genre: 'tool', timeSet: true,
};
const TEXT_KEYS = ['name', 'description', 'easyVersion', 'genre'];

describe('toBasicHabitInput', () => {
  it('drops name, description, easy version and genre', () => {
    const basic = toBasicHabitInput(full);
    for (const key of TEXT_KEYS) expect(basic).not.toHaveProperty(key);
    expect(basic).toEqual({stat: 'STR', difficulty: 'Medium', time: '07:30', days: [1, 3], questType: 'habit', scheduledDate: null, targetCount: 3, timeSet: true});
    expect(JSON.stringify(basic)).not.toContain('Synthetic');
  });
  it('does not alias the days array', () => {
    const basic = toBasicHabitInput(full);
    basic.days.push(6);
    expect(full.days).toEqual([1, 3]);
  });
  it('omits optional fields that were never supplied', () => {
    expect(toBasicHabitInput({name: 'x', stat: 'INT', difficulty: 'Easy', time: '08:00', days: []}))
      .toEqual({stat: 'INT', difficulty: 'Easy', time: '08:00', days: []});
  });
});

describe('habitGatewayInput', () => {
  it('sends a basic habit with only the allowed keys', () => {
    expect(habitGatewayInput({mode: 'basic', values: toBasicHabitInput(full)})).toEqual({
      mode: 'basic',
      input: {stat: 'STR', difficulty: 'Medium', time: '07:30', days: [1, 3], questType: 'habit', scheduledDate: null, targetCount: 3, timeSet: true},
    });
  });
  it('never lets text reach a basic payload, even from a widened or mislabelled value', () => {
    const smuggled = {mode: 'basic', values: {...full}} as unknown as HabitEditorInput;
    const {input} = habitGatewayInput(smuggled);
    for (const key of TEXT_KEYS) expect(input).not.toHaveProperty(key);
    expect(JSON.stringify(input)).not.toContain('Synthetic');
    const nulls = habitGatewayInput({mode: 'basic', values: {...toBasicHabitInput(full), name: null, description: null, genre: null} as unknown as BasicHabitInput});
    for (const key of TEXT_KEYS) expect(nulls.input).not.toHaveProperty(key);
  });
  it('omits timeSet instead of sending null or undefined', () => {
    const base = toBasicHabitInput(full);
    for (const timeSet of [undefined, null]) {
      const {input} = habitGatewayInput({mode: 'basic', values: {...base, timeSet} as BasicHabitInput});
      expect(input).not.toHaveProperty('timeSet');
    }
    expect(habitGatewayInput({mode: 'basic', values: {...base, timeSet: false}}).input.timeSet).toBe(false);
  });
  it('omits unsupplied optional keys but keeps an explicit null date and target', () => {
    const {input} = habitGatewayInput({mode: 'basic', values: {stat: 'DEX', difficulty: 'Hard', time: '06:00', days: [0], scheduledDate: null, targetCount: null}});
    expect(input).toEqual({stat: 'DEX', difficulty: 'Hard', time: '06:00', days: [0], scheduledDate: null, targetCount: null});
  });
  it('sends a custom habit with its text', () => {
    const result = habitGatewayInput({mode: 'custom', values: full});
    expect(result.mode).toBe('custom');
    expect(result.input).toEqual({
      stat: 'STR', difficulty: 'Medium', time: '07:30', days: [1, 3], questType: 'habit', scheduledDate: null, targetCount: 3, timeSet: true,
      name: 'Synthetic private quest', description: 'Synthetic description', easyVersion: 'Synthetic easy text', genre: 'tool',
    });
  });
  it('omits unsupplied custom text and timeSet but keeps explicit nulls', () => {
    const {input} = habitGatewayInput({mode: 'custom', values: {name: 'Run', stat: 'STR', difficulty: 'Easy', time: '07:00', days: [1], description: null, easyVersion: null, genre: null}});
    expect(input).toEqual({stat: 'STR', difficulty: 'Easy', time: '07:00', days: [1], name: 'Run', description: null, easyVersion: null, genre: null});
  });
  it('sends no keys beyond the gateway allow-list', () => {
    const allowed = ['stat', 'difficulty', 'time', 'days', 'questType', 'scheduledDate', 'targetCount', 'timeSet', 'name', 'description', 'easyVersion', 'genre'];
    const {input} = habitGatewayInput({mode: 'custom', values: {...full, injected: 'x', user_id: 'other'} as HabitInput});
    expect(Object.keys(input).every(key => allowed.includes(key))).toBe(true);
  });
  it('refuses a custom habit without a name', () => {
    for (const name of ['', '   ', undefined, null, 5]) {
      expect(() => habitGatewayInput({mode: 'custom', values: {...full, name: name as string}})).toThrow();
    }
  });
  it('refuses an unknown mode and incomplete required fields', () => {
    expect(() => habitGatewayInput({mode: 'other', values: full} as unknown as HabitEditorInput)).toThrow();
    expect(() => habitGatewayInput(null as unknown as HabitEditorInput)).toThrow();
    for (const key of ['stat', 'difficulty', 'time', 'days']) {
      const values = {...toBasicHabitInput(full)} as Record<string, unknown>;
      delete values[key];
      expect(() => habitGatewayInput({mode: 'basic', values: values as unknown as BasicHabitInput})).toThrow();
    }
    expect(() => habitGatewayInput({mode: 'basic', values: {...toBasicHabitInput(full), days: 'mon' as unknown as number[]}})).toThrow();
  });
});

const chain: LongQuestInput = {
  name: 'Synthetic chain', stat: 'INT', description: 'Synthetic chain note', strictOrder: false,
  stages: [{id: 'da230000-0000-4000-8000-000000000001', name: 'Synthetic stage one', description: 'Synthetic detail'}, {name: 'Synthetic stage two'}],
};

describe('toBasicChainInput', () => {
  it('drops every piece of text and keeps stage ids', () => {
    const basic = toBasicChainInput(chain);
    expect(basic).toEqual({stat: 'INT', strictOrder: false, stages: [{id: 'da230000-0000-4000-8000-000000000001'}, {}]});
    expect(JSON.stringify(basic)).not.toContain('Synthetic');
  });
  it('leaves strictOrder out when it was not supplied', () => {
    const {strictOrder, ...rest} = chain;
    void strictOrder;
    expect(toBasicChainInput(rest)).not.toHaveProperty('strictOrder');
  });
});

describe('chainGatewayInput', () => {
  it('sends a basic chain with ids only', () => {
    expect(chainGatewayInput({mode: 'basic', values: toBasicChainInput(chain)})).toEqual({
      mode: 'basic', input: {stat: 'INT', strictOrder: false, stages: [{id: 'da230000-0000-4000-8000-000000000001'}, {}]},
    });
  });
  it('never lets text reach a basic payload', () => {
    const smuggled = {mode: 'basic', values: chain} as unknown as Parameters<typeof chainGatewayInput>[0];
    const {input} = chainGatewayInput(smuggled);
    expect(JSON.stringify(input)).not.toContain('Synthetic');
    expect(input).not.toHaveProperty('name');
    expect(input).not.toHaveProperty('description');
  });
  it('omits a null stage id', () => {
    const {input} = chainGatewayInput({mode: 'basic', values: {stat: 'WIS', stages: [{id: null}]}});
    expect(input).toEqual({stat: 'WIS', stages: [{}]});
  });
  it('sends a custom chain with names and stage text', () => {
    expect(chainGatewayInput({mode: 'custom', values: chain})).toEqual({
      mode: 'custom',
      input: {
        stat: 'INT', name: 'Synthetic chain', description: 'Synthetic chain note', strictOrder: false,
        stages: [{id: 'da230000-0000-4000-8000-000000000001', name: 'Synthetic stage one', description: 'Synthetic detail'}, {name: 'Synthetic stage two'}],
      },
    });
  });
  it('requires a custom chain name and stage names', () => {
    for (const name of ['', '  ', undefined, null]) {
      expect(() => chainGatewayInput({mode: 'custom', values: {...chain, name: name as string}})).toThrow();
    }
    expect(() => chainGatewayInput({mode: 'custom', values: {...chain, stages: [{name: ''}]}})).toThrow();
    expect(() => chainGatewayInput({mode: 'custom', values: {...chain, stages: [{name: undefined as unknown as string}]}})).toThrow();
  });
  it('refuses an unknown mode and missing stages', () => {
    expect(() => chainGatewayInput({mode: 'x', values: chain} as unknown as Parameters<typeof chainGatewayInput>[0])).toThrow();
    expect(() => chainGatewayInput({mode: 'basic', values: {stat: 'INT'} as never})).toThrow();
    expect(() => chainGatewayInput({mode: 'custom', values: {...chain, stages: undefined as never}})).toThrow();
  });
});
