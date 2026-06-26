import { useEffect, useRef } from "react";
import { ActivityIndicator, Animated, Pressable, Text, View } from "react-native";
import { CoffeeCup } from "@/components/brand/CoffeeCup";
import { Colors } from "@/constants/theme";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/**
 * Branded in-app boot/loading screen.
 *
 * NOTE: the supplied cafinity-loading-mark.png / cafinity-wordmark.png ship with
 * a checkerboard BAKED into their pixels (RGB, no real alpha), so they would
 * render an ugly checker on the cream background. We therefore use the in-app
 * CoffeeCup SVG + styled wordmark text instead — branded, crisp, and tinted by
 * the active seasonal campaign accent. Reduced-motion-safe; timeout/retry.
 */
export function AppLoading({
  message,
  timedOut,
  onRetry,
}: {
  message?: string;
  timedOut?: boolean;
  onRetry?: () => void;
}) {
  const reduced = useReducedMotion();
  const pulse = useRef(new Animated.Value(reduced ? 1 : 0.5)).current;
  const wordmarkOpacity = useRef(new Animated.Value(reduced ? 1 : 0)).current;

  useEffect(() => {
    if (reduced) {
      pulse.setValue(1);
      wordmarkOpacity.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    Animated.timing(wordmarkOpacity, {
      toValue: 1,
      duration: 600,
      delay: 200,
      useNativeDriver: true,
    }).start();
    return () => loop.stop();
  }, [reduced, pulse, wordmarkOpacity]);

  return (
    <View className="flex-1 items-center justify-center bg-background">
      <Animated.View style={{ opacity: reduced ? 1 : pulse }}>
        <CoffeeCup size={104} tint={Colors.accent} />
      </Animated.View>

      <Animated.View style={{ opacity: wordmarkOpacity }}>
        <Text className="mt-4 font-display text-3xl text-brandPrimary">Cafinity</Text>
        <Text className="mt-1 text-center text-xs text-textMuted">
          Coffee, prepared your way.
        </Text>
      </Animated.View>

      {timedOut ? (
        <View className="mt-6 items-center px-10">
          <Text className="text-center text-sm text-textSecondary">
            This is taking longer than usual. Check your connection.
          </Text>
          {onRetry ? (
            <Pressable onPress={onRetry} className="mt-3 rounded-full bg-brandPrimary px-6 py-2.5">
              <Text className="text-sm font-bold text-white">Retry</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <>
          <ActivityIndicator className="mt-6" color={Colors.brand} />
          {message ? <Text className="mt-2 text-xs text-textMuted">{message}</Text> : null}
        </>
      )}
    </View>
  );
}
