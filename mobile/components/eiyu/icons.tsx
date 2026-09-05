import Svg, { Circle, Ellipse, Line, Path, Polygon, Polyline } from 'react-native-svg';

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
      <Polygon points="12,3 16,8 22,9 18,14 19,21 12,17 5,21 6,14 2,9 8,8" />
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

export function SnowflakeIcon({ size = 16 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#93c5fd" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
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
