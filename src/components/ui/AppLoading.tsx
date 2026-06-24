import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { CoffeeCup } from "@/components/brand/CoffeeCup";
import { Colors } from "@/constants/theme";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { brandingImages } from "@/lib/brandingImages";

/**
 * Branded in-app boot/loading screen (demonstrable in Expo Go). Uses the bundled
 * loading mark + wordmark, falling back to the in-app CoffeeCup SVG + text if a
 * raster asset fails. Reduced-motion-safe; includes timeout/retry.
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
  const [markFailed, setMarkFailed] = useState(false);
  const [wordmarkFailed, setWordmarkFailed] = useState(false);

  useEffect(() => {
    if (reduced) return;
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
        {markFailed ? (
          <CoffeeCup size={96} />
        ) : (
          <Image
            source={brandingImages.loadingMark}
            style={{ width: 112, height: 112 }}
            contentFit="contain"
            onError={() => setMarkFailed(true)}
            accessibilityLabel="Cafinity"
          />
        )}
      </Animated.View>

      {wordmarkFailed ? (
        <Text className="mt-4 font-display text-2xl text-brandPrimary">Cafinity</Text>
      ) : (
        <Animated.View style={{ opacity: wordmarkOpacity }}>
          <Image
            source={brandingImages.wordmark}
            style={{ width: 180, height: 56, marginTop: 12 }}
            contentFit="contain"
            onError={() => setWordmarkFailed(true)}
            accessibilityLabel="Cafinity"
          />
        </Animated.View>
      )}

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
          <ActivityIndicator className="mt-5" color={Colors.brand} />
          {message ? <Text className="mt-2 text-xs text-textMuted">{message}</Text> : null}
        </>
      )}
    </View>
  );
}
