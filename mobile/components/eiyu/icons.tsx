import type { ReactNode } from 'react';
import Svg, { Circle, Ellipse, Line, Path, Polygon, Polyline, Rect } from 'react-native-svg';

import { STAT_COLORS } from '@eiyu/shared';
import { Stat } from '@eiyu/shared';

export function StatIcon({ stat, size = 16 }: { stat: Stat; size?: number }) {
  const color = STAT_COLORS[stat];
  const common = { fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {stat === 'STR' && (
        <>
          <Path d="M14.5 2.5l7 7-10 10-7-7 10-10z" {...common} />
          <Path d="M2 22l4-4" {...common} />
          <Path d="M18 6l4-4" {...common} />
        </>
      )}
      {stat === 'INT' && <Path d="M13 2L4.5 13.5H11L8 22l11.5-12H13V2z" {...common} />}
      {stat === 'DEX' && (
        <>
          <Line x1="5" y1="12" x2="19" y2="12" {...common} />
          <Path d="M12 5l7 7-7 7" {...common} />
          <Path d="M5 5l3 3-3 3" {...common} />
        </>
      )}
      {stat === 'WIS' && (
        <>
          <Ellipse cx="12" cy="12" rx="10" ry="6" {...common} />
          <Circle cx="12" cy="12" r="2.5" fill={color} stroke="none" />
        </>
      )}
      {stat === 'CHA' && (
        <Polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" {...common} />
      )}
    </Svg>
  );
}

export function StarIcon({ color, size = 14 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Polygon
        points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"
        fill={color}
        stroke={color}
        strokeWidth={1}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function BoardIcon({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" />
    </Svg>
  );
}

export function StatusIcon({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="9" cy="8" r="3" />
      <Circle cx="16.5" cy="9" r="2.5" />
      <Path d="M3 20c.5-3.6 2.5-5.5 6-5.5s5.5 1.9 6 5.5" />
      <Path d="M14 15c3-.5 5.5 1.1 6.5 4.5" />
    </Svg>
  );
}

export function ScrollIcon({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
      <Path d="M9 3h6v4H9z" />
      <Line x1="9" y1="12" x2="15" y2="12" />
      <Line x1="9" y1="16" x2="13" y2="16" />
    </Svg>
  );
}

export function GearIcon({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="3" />
      <Path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </Svg>
  );
}

export function CheckIcon({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="20 6 9 17 4 12" />
    </Svg>
  );
}

export function PlusIcon({ size = 20, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round">
      <Line x1="12" y1="5" x2="12" y2="19" />
      <Line x1="5" y1="12" x2="19" y2="12" />
    </Svg>
  );
}

export function SnowflakeIcon({ size = 16, color = '#93c5fd' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Line x1="12" y1="2" x2="12" y2="22" />
      <Line x1="2" y1="12" x2="22" y2="12" />
      <Path d="M8 6l4-4 4 4" />
      <Path d="M8 18l4 4 4-4" />
      <Path d="M6 8l-4 4 4 4" />
      <Path d="M18 8l4 4-4 4" />
    </Svg>
  );
}

export function ChevronIcon({
  direction = 'right',
  size = 16,
  color = 'currentColor',
}: {
  direction?: 'right' | 'down' | 'up' | 'left';
  size?: number;
  color?: string;
}) {
  const rotate = { right: '0deg', down: '90deg', left: '180deg', up: '270deg' }[direction];
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      style={{ transform: [{ rotate }] }}>
      <Polyline points="9 18 15 12 9 6" />
    </Svg>
  );
}

export function MoonIcon({ size = 18, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </Svg>
  );
}

export function SunIcon({ size = 18, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="5" />
      <Line x1="12" y1="1" x2="12" y2="3" />
      <Line x1="12" y1="21" x2="12" y2="23" />
      <Line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <Line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <Line x1="1" y1="12" x2="3" y2="12" />
      <Line x1="21" y1="12" x2="23" y2="12" />
      <Line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <Line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </Svg>
  );
}

export function ChevronRight({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round">
      <Polyline points="9 18 15 12 9 6" />
    </Svg>
  );
}

/* Icons ported from web/src/Icons.tsx. They are decoration: the control that holds them carries the label. */

function Glyph({ size, children, mirrored }: { size: number; children: ReactNode; mirrored?: boolean }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={mirrored ? { transform: [{ scaleX: -1 }] } : undefined}>
      {children}
    </Svg>
  );
}

type GlyphProps = { size?: number; color: string };
const outline = (color: string) => ({ fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const });

export function DumbbellIcon({ size = 22, color }: GlyphProps) {
  return (
    <Glyph size={size}>
      <Path d="M6.5 6.5v11" {...outline(color)} />
      <Path d="M17.5 6.5v11" {...outline(color)} />
      <Path d="M3.5 9v6" {...outline(color)} />
      <Path d="M20.5 9v6" {...outline(color)} />
      <Path d="M6.5 12h11" {...outline(color)} />
    </Glyph>
  );
}

export function SignOutIcon({ size = 22, color }: GlyphProps) {
  return (
    <Glyph size={size}>
      <Path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" {...outline(color)} />
      <Polyline points="16 17 21 12 16 7" {...outline(color)} />
      <Line x1="21" y1="12" x2="9" y2="12" {...outline(color)} />
    </Glyph>
  );
}

export function MailIcon({ size = 16, color }: GlyphProps) {
  return (
    <Glyph size={size}>
      <Rect x="2" y="4" width="20" height="16" rx="2" fill={color} fillOpacity={0.15} stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      <Path d="M2 6l10 7 10-7" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </Glyph>
  );
}

export function NoteIcon({ size = 14, color }: GlyphProps) {
  return (
    <Glyph size={size}>
      <Path d="M6 3h9l3 3v15H6z" fill={color} fillOpacity={0.12} stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      <Path d="M9 9h6M9 13h6M9 17h4" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </Glyph>
  );
}

export function SparkleIcon({ size = 15, color }: GlyphProps) {
  return (
    <Glyph size={size}>
      <Path d="M12 2l2.5 6.5L21 10l-5 4.5L17.5 21 12 17.5 6.5 21 8 14.5 3 10l6.5-1.5z" fill={color} fillOpacity={0.2} stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </Glyph>
  );
}

export function CompletionDotIcon({ size = 8, color }: GlyphProps) {
  return (
    <Glyph size={size}>
      <Circle cx="12" cy="12" r="11" fill={color} fillOpacity={0.25} />
      <Circle cx="12" cy="12" r="6" fill={color} />
    </Glyph>
  );
}

export function EditIcon({ size = 16, color }: GlyphProps) {
  return (
    <Glyph size={size}>
      <Path d="M4 20h4L19 9l-4-4L4 16z" {...outline(color)} />
      <Path d="M13.5 6.5l4 4" {...outline(color)} />
    </Glyph>
  );
}

export function ArchiveIcon({ size = 16, color }: GlyphProps) {
  return (
    <Glyph size={size}>
      <Rect x="3" y="4" width="18" height="5" rx="1" {...outline(color)} />
      <Path d="M5 9v10h14V9M10 13h4" {...outline(color)} />
    </Glyph>
  );
}

export function TrashIcon({ size = 16, color }: GlyphProps) {
  return (
    <Glyph size={size}>
      <Path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13" {...outline(color)} />
    </Glyph>
  );
}

export function MoveIcon({ size = 16, color, direction = 'right' }: GlyphProps & { direction?: 'right' | 'left' }) {
  return (
    <Glyph size={size} mirrored={direction === 'left'}>
      <Path d="M4 12h14M13 6l6 6-6 6" {...outline(color)} />
    </Glyph>
  );
}

export function GripIcon({ size = 16, color }: GlyphProps) {
  return (
    <Glyph size={size}>
      <Circle cx="9" cy="6" r="1.4" fill={color} />
      <Circle cx="15" cy="6" r="1.4" fill={color} />
      <Circle cx="9" cy="12" r="1.4" fill={color} />
      <Circle cx="15" cy="12" r="1.4" fill={color} />
      <Circle cx="9" cy="18" r="1.4" fill={color} />
      <Circle cx="15" cy="18" r="1.4" fill={color} />
    </Glyph>
  );
}

export function ListIcon({ size = 16, color }: GlyphProps) {
  return (
    <Glyph size={size}>
      <Path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" {...outline(color)} />
    </Glyph>
  );
}

export function RestoreIcon({ size = 16, color }: GlyphProps) {
  return (
    <Glyph size={size}>
      <Path d="M4 12a8 8 0 1 0 8-8M4 4v5h5" {...outline(color)} />
    </Glyph>
  );
}

export function UndoIcon({ size = 16, color }: GlyphProps) {
  return (
    <Glyph size={size}>
      <Path d="M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" {...outline(color)} />
    </Glyph>
  );
}

export function PlayIcon({ size = 16, color }: GlyphProps) {
  return (
    <Glyph size={size}>
      <Path d="M8 5l11 7-11 7z" {...outline(color)} />
    </Glyph>
  );
}

export function LockIcon({ size = 16, color }: GlyphProps) {
  return (
    <Glyph size={size}>
      <Rect x="5" y="11" width="14" height="9" rx="1.5" {...outline(color)} />
      <Path d="M8 11V8a4 4 0 0 1 8 0v3" {...outline(color)} />
    </Glyph>
  );
}

export function MoreIcon({ size = 20, color }: GlyphProps) {
  return (
    <Glyph size={size}>
      <Circle cx="5" cy="12" r="1.8" fill={color} />
      <Circle cx="12" cy="12" r="1.8" fill={color} />
      <Circle cx="19" cy="12" r="1.8" fill={color} />
    </Glyph>
  );
}

export function ClockIcon({ size = 14, color }: GlyphProps) {
  return (
    <Glyph size={size}>
      <Circle cx="12" cy="12" r="9" {...outline(color)} />
      <Path d="M12 7v5l3 2" {...outline(color)} />
    </Glyph>
  );
}

export function AlertIcon({ size = 14, color }: GlyphProps) {
  return (
    <Glyph size={size}>
      <Path d="M12 3L2.5 20h19L12 3z" {...outline(color)} />
      <Path d="M12 10v4M12 17.5v.5" {...outline(color)} />
    </Glyph>
  );
}

export function EyeIcon({ size = 20, color }: GlyphProps) {
  return (
    <Glyph size={size}>
      <Path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" {...outline(color)} />
      <Circle cx="12" cy="12" r="3" {...outline(color)} />
    </Glyph>
  );
}

export function EyeOffIcon({ size = 20, color }: GlyphProps) {
  return (
    <Glyph size={size}>
      <Path d="M3 3l18 18" {...outline(color)} />
      <Path d="M10.6 5.2A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.5 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7c1.5 0 2.9-.4 4.1-1" {...outline(color)} />
      <Path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" {...outline(color)} />
    </Glyph>
  );
}

export function UploadIcon({ size = 20, color }: GlyphProps) {
  return (
    <Glyph size={size}>
      <Path d="M12 16V4" {...outline(color)} />
      <Path d="M7 9l5-5 5 5" {...outline(color)} />
      <Path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" {...outline(color)} />
    </Glyph>
  );
}

export function VolumeIcon({ size = 20, color }: GlyphProps) {
  return (
    <Glyph size={size}>
      <Path d="M4 9h4l5-4v14l-5-4H4z" {...outline(color)} />
      <Path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11" {...outline(color)} />
    </Glyph>
  );
}

export function VolumeOffIcon({ size = 20, color }: GlyphProps) {
  return (
    <Glyph size={size}>
      <Path d="M4 9h4l5-4v14l-5-4H4z" {...outline(color)} />
      <Path d="M17 9.5l4 5M21 9.5l-4 5" {...outline(color)} />
    </Glyph>
  );
}
