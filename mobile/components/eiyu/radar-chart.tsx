import Svg, { Circle, Line, Polygon, Text as SvgText } from 'react-native-svg';

import { STAT_COLORS, STATS } from '@eiyu/shared';
import { fonts } from '@/constants/eiyu-theme';
import { Stat } from '@eiyu/shared';

function pointAt(cx: number, cy: number, r: number, index: number, count: number) {
  const angle = (index * 2 * Math.PI) / count - Math.PI / 2;
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

export function RadarChart({
  values,
  maxValue,
  size = 240,
  accent,
  fill,
  gridStroke,
}: {
  values: Record<Stat, number>;
  maxValue: number;
  size?: number;
  accent: string;
  fill: string;
  gridStroke: string;
}) {
  const count = STATS.length;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 34;
  const rings = [0.25, 0.5, 0.75, 1];

  const dataPoints = STATS.map((stat, i) =>
    pointAt(cx, cy, radius * Math.min(values[stat], maxValue) / maxValue, i, count)
  );
  const dataPolygon = dataPoints.map(p => `${p.x},${p.y}`).join(' ');

  return (
    <Svg width={size} height={size}>
      {rings.map(f => {
        const ringPoints = STATS.map((_, i) => pointAt(cx, cy, radius * f, i, count));
        return (
          <Polygon
            key={f}
            points={ringPoints.map(p => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke={gridStroke}
            strokeWidth={1}
          />
        );
      })}
      {STATS.map((_, i) => {
        const outer = pointAt(cx, cy, radius, i, count);
        return <Line key={i} x1={cx} y1={cy} x2={outer.x} y2={outer.y} stroke={gridStroke} strokeWidth={1} />;
      })}
      <Polygon points={dataPolygon} fill={fill} stroke={accent} strokeWidth={1.5} />
      {dataPoints.map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={3} fill={accent} />
      ))}
      {STATS.map((stat, i) => {
        const label = pointAt(cx, cy, radius + 18, i, count);
        return (
          <SvgText
            key={stat}
            x={label.x}
            y={label.y}
            fontFamily={fonts.display}
            fontSize={13}
            fontWeight="700"
            fill={STAT_COLORS[stat]}
            textAnchor="middle"
            alignmentBaseline="middle">
            {stat}
          </SvgText>
        );
      })}
    </Svg>
  );
}
