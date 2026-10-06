import type { ReactElement } from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import type { ColorProp } from 'react-native-android-widget';
import { PALETTE_TOKENS } from '@eiyu/shared/src/theme/palette-tokens';
import { DEFAULT_PALETTE } from '@eiyu/shared/src/theme/palettes';
import { DEFAULT_THEME } from '@eiyu/shared/src/theme/theme-mode';

import type { ViewRow, WidgetView } from '@/lib/widget-snapshot';

/**
 * What the home-screen widget looks like, as a pure function of a `WidgetView`. It is native-drawn, so it takes colours as
 * hex or rgba (the palette tokens already are) and fixed sizes in dp. Imported by the headless task handler: keep it free
 * of the app's stores, the router and the Supabase client (widget-purity.test.ts walks the import graph to make sure).
 */

/** Opens the Board on the Daily lane. The Board already applies and clears its `lane` param. */
export const BOARD_URI = 'eiyusystem://board?lane=daily';

/** Every palette token the widget uses; a test checks each is a colour format the widget library accepts. */
export const WIDGET_TOKEN_KEYS = [
  'page-flat', 'panel-border', 'text', 'accent', 'accent-text', 'success', 'warning', 'danger', 'muted-flat', 'dim-flat', 'bar-track',
] as const;

type Tokens = Record<string, string>;
const PAD = 10;
const BORDER = 1;
const ICON_WIDTH = 16;
const TAG_WIDTH = 92;
const TIME_WIDTH = 40;
const ROW_HEIGHT = 22;
const TICK = String.fromCharCode(0x2713);
const RING = String.fromCharCode(0x25cb);

const color = (value: string) => value as ColorProp;

/** How wide the filled part of the progress bar is, in dp. */
export function barFillWidth(completed: number, total: number, trackDp: number): number {
  if (!Number.isFinite(completed) || !Number.isFinite(total) || !Number.isFinite(trackDp) || total <= 0 || trackDp <= 0) return 0;
  return Math.round(trackDp * Math.min(1, Math.max(0, completed / total)));
}

function tokensFor(view: WidgetView): Tokens {
  return view.kind === 'not-set-up'
    ? PALETTE_TOKENS[DEFAULT_PALETTE][DEFAULT_THEME]
    : PALETTE_TOKENS[view.palette][view.mode];
}

function shell(
  tokens: Tokens,
  action: { clickAction: 'OPEN_URI' | 'OPEN_APP'; clickActionData?: { uri: string } },
  accessibilityLabel: string,
  children: ReactElement[],
): ReactElement {
  return (
    <FlexWidget
      clickAction={action.clickAction}
      clickActionData={action.clickActionData}
      accessibilityLabel={accessibilityLabel}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        padding: PAD,
        borderRadius: 16,
        borderWidth: BORDER,
        borderColor: color(tokens['panel-border']),
        backgroundColor: color(tokens['page-flat']),
      }}>
      {children}
    </FlexWidget>
  );
}

const OPEN_BOARD = { clickAction: 'OPEN_URI', clickActionData: { uri: BOARD_URI } } as const;
const OPEN_APP = { clickAction: 'OPEN_APP' } as const;

function header(tokens: Tokens, count: string, countColor: string, waiting: number): ReactElement {
  return (
    <FlexWidget key="header" style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <TextWidget text="EIYU" style={{ fontSize: 11, fontWeight: 'bold', letterSpacing: 1.5, color: color(tokens['accent-text']) }} />
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
        {waiting > 0 ? (
          <TextWidget text={`${waiting} waiting`} style={{ fontSize: 11, marginRight: 8, color: color(tokens.warning) }} />
        ) : null}
        <TextWidget text="TODAY" style={{ fontSize: 11, letterSpacing: 1, marginRight: 6, color: color(tokens['dim-flat']) }} />
        <TextWidget text={count} style={{ fontSize: 14, fontWeight: 'bold', color: color(countColor) }} />
      </FlexWidget>
    </FlexWidget>
  );
}

function progressBar(tokens: Tokens, completed: number, total: number, widthDp: number): ReactElement {
  const track = Math.max(0, widthDp - 2 * (PAD + BORDER));
  return (
    <FlexWidget key="bar" style={{ width: 'match_parent', height: 3, marginTop: 5, marginBottom: 4, borderRadius: 2, backgroundColor: color(tokens['bar-track']) }}>
      <FlexWidget style={{ height: 3, width: barFillWidth(completed, total, track), borderRadius: 2, backgroundColor: color(tokens.accent) }} />
    </FlexWidget>
  );
}

function message(tokens: Tokens, text: string): ReactElement {
  return (
    <FlexWidget key="message" style={{ width: 'match_parent', flex: 1, justifyContent: 'center' }}>
      <TextWidget text={text} style={{ fontSize: 14, color: color(tokens.text) }} />
    </FlexWidget>
  );
}

function footer(tokens: Tokens, text: string): ReactElement | null {
  return text ? <TextWidget key="footer" text={text} style={{ fontSize: 10, marginTop: 2, color: color(tokens['muted-flat']) }} /> : null;
}

function quest(tokens: Tokens, row: ViewRow, index: number, widthDp: number): ReactElement {
  const tagColor = row.tag === 'failed' ? tokens.danger : tokens.warning;
  const rightText = row.tagText ?? row.time ?? '';
  const rightWidth = row.tagText ? TAG_WIDTH : row.time ? TIME_WIDTH : 0;
  const inner = Math.max(0, widthDp - 2 * (PAD + BORDER));
  const nameWidth = Math.max(0, Math.floor(inner - ICON_WIDTH - rightWidth - 6));
  const name = row.progressText ? `${row.name}  ${row.progressText}` : row.name;
  return (
    <FlexWidget key={`row-${index}`} style={{ width: 'match_parent', height: ROW_HEIGHT, flexDirection: 'row', alignItems: 'center' }}>
      <TextWidget
        text={row.done ? TICK : RING}
        style={{ width: ICON_WIDTH, fontSize: 13, fontWeight: 'bold', color: color(row.done ? tokens.success : tokens['dim-flat']) }}
      />
      <TextWidget
        text={name}
        maxLines={1}
        truncate="END"
        style={{ width: nameWidth, fontSize: 13, color: color(row.done ? tokens['dim-flat'] : tokens.text) }}
      />
      {rightText ? (
        <TextWidget
          text={rightText}
          maxLines={1}
          truncate="END"
          style={{ width: rightWidth, fontSize: 11, textAlign: 'right', color: color(row.tagText ? tagColor : tokens['muted-flat']) }}
        />
      ) : null}
    </FlexWidget>
  );
}

/** The widget for a view. `widthDp` is the widget's current width, which the handler reads from Android. */
export function renderTodayWidget(view: WidgetView, widthDp: number): ReactElement {
  const tokens = tokensFor(view);

  switch (view.kind) {
    case 'not-set-up':
      return shell(tokens, OPEN_APP, 'Eiyu widget. Opens the app to set it up.', [message(tokens, 'Open Eiyu to set up the widget')]);

    case 'signed-out':
      return shell(tokens, OPEN_APP, 'Eiyu, signed out. Opens the app.', [message(tokens, 'Sign in to Eiyu')]);

    case 'stale':
      return shell(tokens, OPEN_BOARD, 'Eiyu today is out of date. Opens the Board.', [
        header(tokens, `${view.completed}/${view.total}`, tokens['dim-flat'], 0),
        message(tokens, 'Open Eiyu to load today'),
        footer(tokens, view.updated ? `Last updated ${view.updated}` : ''),
      ].filter((item): item is ReactElement => item !== null));

    case 'ready': {
      const spoken = `Eiyu today, ${view.completed} of ${view.total} done${view.waiting > 0 ? `, ${view.waiting} waiting to sync` : ''}. Opens the Board.`;
      const body = view.empty
        ? [message(tokens, 'No quests due today')]
        : view.rows.map((row, index) => quest(tokens, row, index, widthDp));
      const status = [view.updated ? `Updated ${view.updated}` : '', view.more > 0 ? `+${view.more} more` : ''].filter(Boolean).join('  ');
      return shell(tokens, OPEN_BOARD, spoken, [
        header(tokens, `${view.completed}/${view.total}`, tokens['accent-text'], view.waiting),
        progressBar(tokens, view.completed, view.total, widthDp),
        ...body,
        footer(tokens, status),
      ].filter((item): item is ReactElement => item !== null));
    }
  }
}
