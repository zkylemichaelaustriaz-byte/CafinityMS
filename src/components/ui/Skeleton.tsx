import { useEffect } from "react";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/** Shimmering placeholder block. Size/shape via className (e.g. "h-5 w-24 rounded-md"). */
export function Skeleton({ className }: { className?: string }) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    if (reduced) {
      opacity.value = 0.6;
      return;
    }
    opacity.value = withRepeat(withTiming(1, { duration: 850 }), -1, true);
    return () => cancelAnimation(opacity);
  }, [reduced, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={style} className={`bg-skeleton ${className ?? ""}`} />;
}
