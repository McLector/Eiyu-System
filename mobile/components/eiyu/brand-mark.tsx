import { useEffect } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useTokens } from '@/contexts/theme-store';
import { useReducedMotion } from '../ui/use-reduced-motion';

const HALF_CYCLE = { duration: 1400, easing: Easing.inOut(Easing.ease) };

/**
 * The logo glyph with a glow behind it. The glow is a second copy of the glyph that carries an accent text shadow;
 * only its opacity moves, so the shadow is painted once and the animation never repaints the text. The glow is
 * decoration: it is hidden from screen readers, takes no touches, and holds still under "remove animations".
 */
export function BrandMark({ children, style, testID }: { children: string; style: StyleProp<TextStyle>; testID?: string }) {
  const t = useTokens();
  const reduced = useReducedMotion();
  const glow = useSharedValue(0);

  useEffect(() => {
    if (reduced) {
      cancelAnimation(glow);
      glow.value = 0;
      return;
    }
    glow.value = withRepeat(withSequence(withTiming(1, HALF_CYCLE), withTiming(0, HALF_CYCLE)), -1, false);
    return () => cancelAnimation(glow);
  }, [reduced, glow]);

  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));

  return (
    <View>
      <Animated.Text
        testID="brand-mark-glow"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          style,
          {
            borderColor: 'transparent',
            backgroundColor: 'transparent',
            textShadowColor: t.accent,
            textShadowOffset: { width: 0, height: 0 },
            textShadowRadius: 10,
          },
          glowStyle,
        ]}>
        {children}
      </Animated.Text>
      <Text testID={testID} style={style}>{children}</Text>
    </View>
  );
}
