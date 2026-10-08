import { render, screen } from '@testing-library/react-native';
import type { ComponentType } from 'react';
import { withRepeat } from 'react-native-reanimated';

import {
  AlertIcon, ArchiveIcon, ClockIcon, CompletionDotIcon, DumbbellIcon, EditIcon, GripIcon, ListIcon, LockIcon, MailIcon, MoveIcon, NoteIcon,
  MoreIcon, PlayIcon, RestoreIcon, SignOutIcon, SnowflakeIcon, SparkleIcon, TrashIcon, UndoIcon,
} from '../icons';

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return { __esModule: true, ...actual, withRepeat: jest.fn(actual.withRepeat) };
});

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type IconProps = { size?: number; color: string };
const NEW_ICONS: [string, ComponentType<IconProps>][] = [
  ['DumbbellIcon', DumbbellIcon], ['SignOutIcon', SignOutIcon], ['MailIcon', MailIcon], ['NoteIcon', NoteIcon],
  ['SparkleIcon', SparkleIcon], ['CompletionDotIcon', CompletionDotIcon], ['EditIcon', EditIcon], ['ArchiveIcon', ArchiveIcon],
  ['TrashIcon', TrashIcon], ['MoveIcon', MoveIcon], ['GripIcon', GripIcon], ['ListIcon', ListIcon],
  ['RestoreIcon', RestoreIcon], ['UndoIcon', UndoIcon], ['PlayIcon', PlayIcon], ['LockIcon', LockIcon], ['MoreIcon', MoreIcon],
  ['ClockIcon', ClockIcon], ['AlertIcon', AlertIcon],
];
const DUOTONE = ['MailIcon', 'NoteIcon', 'SparkleIcon', 'CompletionDotIcon'];

const tree = () => JSON.stringify(screen.toJSON());
// react-native-svg hands child colours to the native side as 0xAARRGGBB integers, so that is how they show up in the tree.
const argb = (hex: string) => (0xff000000 | parseInt(hex.slice(1), 16)) >>> 0;

describe.each(NEW_ICONS)('%s', (name, Icon) => {
  it('draws at the requested size in the requested colour', async () => {
    await render(<Icon size={24} color="#112233" />);
    const root = screen.toJSON() as unknown as { props: { width: number; height: number } };
    expect(root.props.width).toBe(24);
    expect(root.props.height).toBe(24);
    expect(tree()).toContain(`"payload":${argb('#112233')}`);
  });

  it('is hidden from TalkBack, because the label belongs to the control that holds it', async () => {
    await render(<Icon color="#112233" />);
    const root = screen.toJSON() as unknown as { props: Record<string, unknown> };
    expect(root.props.accessibilityElementsHidden).toBe(true);
    expect(root.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it(DUOTONE.includes(name) ? 'has the soft tinted fill that makes it duotone' : 'is a single-colour outline or solid', async () => {
    await render(<Icon color="#112233" />);
    expect(tree().includes('fillOpacity')).toBe(DUOTONE.includes(name));
  });
});

describe('MoveIcon', () => {
  it('is mirrored when it points left', async () => {
    await render(<MoveIcon color="#112233" direction="right" />);
    const right = tree();
    await render(<MoveIcon color="#112233" direction="left" />);
    expect(tree()).not.toBe(right);
  });
});

// Must stay identical to web/src/snowflakeGeometry.ts (web has the same literal in its own test).
const SNOWFLAKE_BRANCHES =
  'M9.88 2.88L12 5L14.12 2.88M10.59 6.59L12 8L13.41 6.59M18.84 5.6L18.06 8.5L20.96 9.28M15.98 8.07L15.46 10L17.4 10.52M20.96 14.72L18.06 15.5L18.84 18.4M17.4 13.48L15.46 14L15.98 15.93M14.12 21.12L12 19L9.88 21.12M13.41 17.41L12 16L10.59 17.41M5.16 18.4L5.94 15.5L3.04 14.72M8.02 15.93L8.54 14L6.6 13.48M3.04 9.28L5.94 8.5L5.16 5.6M6.6 10.52L8.54 10L8.02 8.07';

describe('SnowflakeIcon', () => {
  it('is a six-arm snowflake: three spokes through the centre with two V-branches on every arm', async () => {
    await render(<SnowflakeIcon />);
    const t = tree();
    for (const spoke of ['"x1":12,"y1":2,"x2":12,"y2":22', '"x1":20.66,"y1":7,"x2":3.34,"y2":17', '"x1":20.66,"y1":17,"x2":3.34,"y2":7']) expect(t).toContain(spoke);
    expect(t).toContain(SNOWFLAKE_BRANCHES);
    expect(SNOWFLAKE_BRANCHES.match(/M/g)).toHaveLength(12);
  });
  it('no longer draws the old plus-and-chevrons glyph', async () => {
    await render(<SnowflakeIcon />);
    for (const old of ['M8 6l4-4 4 4', 'M8 18l4 4 4-4', 'M6 8l-4 4 4 4', 'M18 8l4 4-4 4']) expect(tree()).not.toContain(old);
  });
  it('stays static: no loop starts and it is not the animated mark', async () => {
    (withRepeat as jest.Mock).mockClear();
    await render(<SnowflakeIcon />);
    expect(withRepeat).not.toHaveBeenCalled();
    expect(screen.queryByTestId('frost-mark', { includeHiddenElements: true })).toBeNull();
  });
  it('keeps its ice colour by default', async () => {
    await render(<SnowflakeIcon />);
    expect(tree()).toContain('#93c5fd');
  });
  it('takes the colour it is given, so it can follow the palette', async () => {
    await render(<SnowflakeIcon color="#112233" />);
    expect(tree()).toContain('#112233');
    expect(tree()).not.toContain('#93c5fd');
  });
});
