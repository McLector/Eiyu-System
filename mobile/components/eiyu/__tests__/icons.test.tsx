import { render, screen } from '@testing-library/react-native';
import type { ComponentType } from 'react';

import {
  ArchiveIcon, CompletionDotIcon, DumbbellIcon, EditIcon, GripIcon, ListIcon, LockIcon, MailIcon, MoveIcon, NoteIcon,
  MoreIcon, PlayIcon, RestoreIcon, SignOutIcon, SnowflakeIcon, SparkleIcon, TrashIcon, UndoIcon,
} from '../icons';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type IconProps = { size?: number; color: string };
const NEW_ICONS: [string, ComponentType<IconProps>][] = [
  ['DumbbellIcon', DumbbellIcon], ['SignOutIcon', SignOutIcon], ['MailIcon', MailIcon], ['NoteIcon', NoteIcon],
  ['SparkleIcon', SparkleIcon], ['CompletionDotIcon', CompletionDotIcon], ['EditIcon', EditIcon], ['ArchiveIcon', ArchiveIcon],
  ['TrashIcon', TrashIcon], ['MoveIcon', MoveIcon], ['GripIcon', GripIcon], ['ListIcon', ListIcon],
  ['RestoreIcon', RestoreIcon], ['UndoIcon', UndoIcon], ['PlayIcon', PlayIcon], ['LockIcon', LockIcon], ['MoreIcon', MoreIcon],
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

describe('SnowflakeIcon', () => {
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
