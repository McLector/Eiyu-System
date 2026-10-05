import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { useTokens } from '@/contexts/theme-store';
import { useReducedMotion } from './use-reduced-motion';

// The three flame silhouettes from web/src/FireStreak.tsx (viewBox 26x30).
const LAYERS = [
  { key: 'outer', token: 'fire-outer', ms: 1100, low: 0.94, high: 1.06, path: 'M13 2 C 7 8 3 13 3 19 C 3 25 8 29 13 29 C 18 29 23 25 23 19 C 23 13 19 8 13 2 Z' },
  { key: 'inner', token: 'fire-inner', ms: 800, low: 0.92, high: 1.08, path: 'M13 6 C 9 11 6.5 15 6.5 19.5 C 6.5 24 9.5 27 13 27 C 16.5 27 19.5 24 19.5 19.5 C 19.5 15 17 11 13 6 Z' },
  { key: 'core', token: 'fire-core', ms: 650, low: 0.9, high: 1.1, path: 'M13 12 C 11 15 10 18 10 20.5 C 10 23.5 11.3 25.5 13 25.5 C 14.7 25.5 16 23.5 16 20.5 C 16 18 15 15 13 12 Z' },
] as const;

function Layer({ layer, size, height, animate }: { layer: (typeof LAYERS)[number]; size: number; height: number; animate: boolean }) {
  const t = useTokens();
  const scale = useSharedValue(1);

  useEffect(() => {
    if (!animate) {
      cancelAnimation(scale);
      scale.value = 1;
      return;
    }
    const half = { duration: layer.ms / 2, easing: Easing.inOut(Easing.ease) };
    scale.value = withRepeat(withSequence(withTiming(layer.high, half), withTiming(layer.low, half)), -1, false);
    return () => cancelAnimation(scale);
  }, [animate, layer, scale]);

  const animated = useAnimatedStyle(() => ({ transform: [{ scaleY: scale.value }] }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { transformOrigin: '50% 100%' }, animated]}>
      <Svg width={size} height={height} viewBox="0 0 26 30">
        <Path d={layer.path} fill={t[layer.token]} />
      </Svg>
    </Animated.View>
  );
}

/**
 * The flame for an active streak: three silhouettes flicker on their own rhythms so the shape distorts frame to frame.
 * With "remove animations" on, it is drawn once and holds still.
 */
export function FireStreak({ size = 14 }: { size?: number }) {
  const reduced = useReducedMotion();
  const height = (size * 30) / 26;
  return (
    <View
      testID="fire-streak"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height }}>
      {LAYERS.map(layer => <Layer key={layer.key} layer={layer} size={size} height={height} animate={!reduced} />)}
    </View>
  );
}
