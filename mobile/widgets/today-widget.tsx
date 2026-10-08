import type { ReactElement } from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import type { ColorProp } from 'react-native-android-widget';
import { PALETTE_TOKENS } from '@eiyu/shared/src/theme/palette-tokens';
import { DEFAULT_PALETTE } from '@eiyu/shared/src/theme/palettes';
import { DEFAULT_THEME } from '@eiyu/shared/src/theme/theme-mode';

import { isSchemeName, scaledDp, WIDGET_LAYOUT, widgetFontScale, type ViewRow, type WidgetView } from '@/lib/widget-snapshot';

/**
 * What the home-screen widget looks like, as a pure function of a `WidgetView`. It is native-drawn, so it takes colours as
 * hex or rgba (the palette tokens already are) and fixed sizes in dp. Imported by the headless task handler: keep it free
 * of the app's stores, the router and the Supabase client (widget-purity.test.ts walks the import graph to make sure).
 */

/** Opens the Board on the Daily lane. The Board already applies and clears its `lane` param. */
export const BOARD_URI = 'eiyusystem://board?lane=daily';

/** The Board link for the app that wrote the snapshot (so a preview widget opens the preview app), or the production one. */
export function boardUriFor(scheme: string | undefined): string {
  return isSchemeName(scheme) ? `${scheme}://board?lane=daily` : BOARD_URI;
}

/** Every palette token the widget uses; a test checks each is a colour format the widget library accepts. */
export const WIDGET_TOKEN_KEYS = [
  'page-flat', 'panel-border', 'text', 'accent', 'accent-text', 'success', 'warning', 'danger', 'muted-flat', 'dim-flat', 'bar-track',
] as const;

type Tokens = Record<string, string>;
const PAD_X = 10;
const BORDER = WIDGET_LAYOUT.border;
const ICON_WIDTH = 16;
const TAG_WIDTH = 92;
const TIME_WIDTH = 40;
const MORE_WIDTH = 52;
const MORE_GAP = 6;
// Rough header content widths in dp at the normal font size, used only to decide whether the update time still fits.
const HEADER_BASE = 110;
const HEADER_WAITING = 66;
const HEADER_UPDATED = 44;
const TICK = String.fromCharCode(0x2713);
const RING = String.fromCharCode(0x25cb);

const color = (value: string) => value as ColorProp;

/** How wide the filled part of the progress bar is, in dp. */
export function barFillWidth(completed: number, total: number, trackDp: number): number {
  if (!Number.isFinite(completed) || !Number.isFinite(total) || !Number.isFinite(trackDp) || total <= 0 || trackDp <= 0) return 0;
  return Math.round(trackDp * Math.min(1, Math.max(0, completed / total)));
}

/** Whether the header has room for the update time. At a large font or a narrow widget it goes first, so nothing wraps. */
export function headerShowsUpdated(widthDp: number, fontScale: number, waiting: number): boolean {
  if (!Number.isFinite(widthDp)) return false;
  const inner = widthDp - 2 * (PAD_X + BORDER);
  const content = HEADER_BASE + (waiting > 0 ? HEADER_WAITING : 0) + HEADER_UPDATED;
  return content * widgetFontScale(fontScale) <= inner;
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
        paddingHorizontal: PAD_X,
        paddingVertical: WIDGET_LAYOUT.padY,
        borderRadius: 16,
        borderWidth: BORDER,
        borderColor: color(tokens['panel-border']),
        backgroundColor: color(tokens['page-flat']),
      }}>
      {children}
    </FlexWidget>
  );
}

const openBoard = (scheme: string | undefined) => ({ clickAction: 'OPEN_URI', clickActionData: { uri: boardUriFor(scheme) } }) as const;
const OPEN_APP = { clickAction: 'OPEN_APP' } as const;

function header(tokens: Tokens, count: string, countColor: string, waiting: number, updated: string, scale: number): ReactElement {
  return (
    <FlexWidget
      key="header"
      style={{ width: 'match_parent', height: scaledDp(WIDGET_LAYOUT.header, scale), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <TextWidget text="EIYU" maxLines={1} style={{ fontSize: 11, fontWeight: 'bold', letterSpacing: 1.5, color: color(tokens['accent-text']) }} />
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
        {waiting > 0 ? (
          <TextWidget text={`${waiting} waiting`} maxLines={1} style={{ fontSize: 11, marginRight: 8, color: color(tokens.warning) }} />
        ) : null}
        {updated ? <TextWidget text={updated} maxLines={1} style={{ fontSize: 11, marginRight: 8, color: color(tokens['muted-flat']) }} /> : null}
        <TextWidget text="TODAY" maxLines={1} style={{ fontSize: 11, letterSpacing: 1, marginRight: 6, color: color(tokens['dim-flat']) }} />
        <TextWidget text={count} maxLines={1} style={{ fontSize: 14, fontWeight: 'bold', color: color(countColor) }} />
      </FlexWidget>
    </FlexWidget>
  );
}

function progressBar(tokens: Tokens, completed: number, total: number, widthDp: number, more: number, scale: number): ReactElement {
  const labelWidth = more > 0 ? scaledDp(MORE_WIDTH, scale) + MORE_GAP : 0;
  const track = Math.max(0, widthDp - 2 * (PAD_X + BORDER) - labelWidth);
  return (
    <FlexWidget
      key="bar"
      style={{ width: 'match_parent', height: scaledDp(WIDGET_LAYOUT.barLine, scale), marginTop: WIDGET_LAYOUT.barGap, flexDirection: 'row', alignItems: 'center' }}>
      <FlexWidget style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: color(tokens['bar-track']) }}>
        <FlexWidget style={{ height: 3, width: barFillWidth(completed, total, track), borderRadius: 2, backgroundColor: color(tokens.accent) }} />
      </FlexWidget>
      {more > 0 ? (
        <TextWidget
          text={`+${more} more`}
          maxLines={1}
          style={{ width: scaledDp(MORE_WIDTH, scale), marginLeft: MORE_GAP, fontSize: 10, textAlign: 'right', color: color(tokens['muted-flat']) }}
        />
      ) : null}
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

function staleFooter(tokens: Tokens, text: string): ReactElement | null {
  return text ? <TextWidget key="footer" text={text} style={{ fontSize: 10, marginTop: 2, color: color(tokens['muted-flat']) }} /> : null;
}

function quest(tokens: Tokens, row: ViewRow, index: number, widthDp: number, scale: number): ReactElement {
  const tagColor = row.tag === 'failed' ? tokens.danger : tokens.warning;
  const rightText = row.tagText ?? row.time ?? '';
  const rightWidth = scaledDp(row.tagText ? TAG_WIDTH : row.time ? TIME_WIDTH : 0, scale);
  const inner = Math.max(0, widthDp - 2 * (PAD_X + BORDER));
  const iconWidth = scaledDp(ICON_WIDTH, scale);
  const nameWidth = Math.max(0, Math.floor(inner - iconWidth - rightWidth - 6));
  const name = row.progressText ? `${row.name}  ${row.progressText}` : row.name;
  return (
    <FlexWidget key={`row-${index}`} style={{ width: 'match_parent', height: scaledDp(WIDGET_LAYOUT.row, scale), flexDirection: 'row', alignItems: 'center' }}>
      <TextWidget
        text={row.done ? TICK : RING}
        style={{ width: iconWidth, fontSize: 13, fontWeight: 'bold', color: color(row.done ? tokens.success : tokens['dim-flat']) }}
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
export function renderTodayWidget(view: WidgetView, widthDp: number, fontScale: number = 1): ReactElement {
  const tokens = tokensFor(view);
  const scale = widgetFontScale(fontScale);

  switch (view.kind) {
    case 'not-set-up':
      return shell(tokens, OPEN_APP, 'Eiyu widget. Opens the app to set it up.', [message(tokens, 'Open Eiyu to set up the widget')]);

    case 'signed-out':
      return shell(tokens, OPEN_APP, 'Eiyu, signed out. Opens the app.', [message(tokens, 'Sign in to Eiyu')]);

    case 'stale':
      return shell(tokens, openBoard(view.scheme), 'Eiyu today is out of date. Opens the Board.', [
        header(tokens, `${view.completed}/${view.total}`, tokens['dim-flat'], 0, '', scale),
        message(tokens, 'Open Eiyu to load today'),
        staleFooter(tokens, view.updated ? `Last updated ${view.updated}` : ''),
      ].filter((item): item is ReactElement => item !== null));

    case 'ready': {
      const spoken = `Eiyu today, ${view.completed} of ${view.total} done${view.waiting > 0 ? `, ${view.waiting} waiting to sync` : ''}${view.updated ? `, updated ${view.updated}` : ''}. Opens the Board.`;
      const body = view.empty
        ? [message(tokens, 'No quests due today')]
        : view.rows.map((row, index) => quest(tokens, row, index, widthDp, scale));
      return shell(tokens, openBoard(view.scheme), spoken, [
        header(tokens, `${view.completed}/${view.total}`, tokens['accent-text'], view.waiting, headerShowsUpdated(widthDp, scale, view.waiting) ? view.updated : '', scale),
        progressBar(tokens, view.completed, view.total, widthDp, view.more, scale),
        ...body,
      ]);
    }
  }
}
