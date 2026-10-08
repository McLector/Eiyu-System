import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Line, Path } from 'react-native-svg';

import { SNOWFLAKE_BRANCHES, SNOWFLAKE_SPOKES } from '@/components/eiyu/snowflake-geometry';
import { useTokens } from '@/contexts/theme-store';
import { useReducedMotion } from './use-reduced-motion';

const SHIMMER_HALF_MS = 800;
const TWINKLE_HALF_MS = 1200;
// The glint starts part-way through the shimmer cycle so the two never peak together.
const TWINKLE_DELAY_MS = 900;

/**
 * The snowflake for a frozen streak: it shimmers slowly while a small glint twinkles on the upper-right arm, out of phase.
 * The glow is a static wider, faint stroke under the flake. With "remove animations" on, the flake is drawn once, at full
 * opacity, and the glint is not drawn at all.
 */
export function FrostMark({ size = 14 }: { size?: number }) {
  const t = useTokens();
  const reduced = useReducedMotion();
  const shimmer = useSharedValue(1);
  const twinkle = useSharedValue(0);

  useEffect(() => {
    if (reduced) {
      cancelAnimation(shimmer);
      cancelAnimation(twinkle);
      shimmer.value = 1;
      twinkle.value = 0;
      return;
    }
    const shimmerStep = { duration: SHIMMER_HALF_MS, easing: Easing.inOut(Easing.ease) };
    const twinkleStep = { duration: TWINKLE_HALF_MS, easing: Easing.inOut(Easing.ease) };
    shimmer.value = withRepeat(withSequence(withTiming(0.75, shimmerStep), withTiming(1, shimmerStep)), -1, false);
    twinkle.value = withDelay(TWINKLE_DELAY_MS, withRepeat(withSequence(withTiming(1, twinkleStep), withTiming(0, twinkleStep)), -1, false));
    return () => {
      cancelAnimation(shimmer);
      cancelAnimation(twinkle);
    };
  }, [reduced, shimmer, twinkle]);

  const shimmerStyle = useAnimatedStyle(() => ({ opacity: shimmer.value }));
  const glintStyle = useAnimatedStyle(() => ({ opacity: twinkle.value, transform: [{ scale: twinkle.value }] }));
  const glint = size * 0.5;

  return (
    <View
      testID="frost-mark"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}>
      <Animated.View style={[StyleSheet.absoluteFill, shimmerStyle]}>
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <Path d={SNOWFLAKE_BRANCHES} stroke={t['ice-glow']} strokeWidth={3.6} strokeOpacity={0.35} />
          {SNOWFLAKE_SPOKES.map(spoke => <Line key={`g${spoke.x1}:${spoke.y1}`} {...spoke} stroke={t['ice-glow']} strokeWidth={3.6} strokeOpacity={0.35} />)}
          <Path d={SNOWFLAKE_BRANCHES} stroke={t.ice} strokeWidth={1.8} />
          {SNOWFLAKE_SPOKES.map(spoke => <Line key={`${spoke.x1}:${spoke.y1}`} {...spoke} stroke={t.ice} strokeWidth={1.8} />)}
        </Svg>
      </Animated.View>
      {reduced ? null : (
        <Animated.View testID="frost-glint" style={[{ position: 'absolute', top: 0, right: 0, width: glint, height: glint }, glintStyle]}>
          <Svg width={glint} height={glint} viewBox="0 0 10 10">
            <Path d="M5 0L6 4L10 5L6 6L5 10L4 6L0 5L4 4Z" fill={t.ice} />
          </Svg>
        </Animated.View>
      )}
    </View>
  );
}
