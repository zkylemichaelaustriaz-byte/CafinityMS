import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, StyleSheet, Text } from "react-native";
import { CoffeeCup } from "@/components/brand/CoffeeCup";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { launchPalette } from "@/theme/launchTheme";
import { useThemeTransition } from "@/store/themeTransition";

/**
 * Short branded full-screen overlay shown while light/dark mode is applied +
 * persisted. It paints in the TARGET theme palette (locked, not the live proxy)
 * so the user never sees the old colors flash. Mount once at the app root, above
 * the navigator. Reduced-motion → instant fade. Blocks taps only while active.
 */
export function ThemeTransitionOverlay() {
  const active = useThemeTransition((s) => s.active);
  const targetMode = useThemeTransition((s) => s.targetMode);
  const reduced = useReducedMotion();
  const opacity = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (active) {
      setMounted(true);
      Animated.timing(opacity, {
        toValue: 1,
        duration: reduced ? 0 : 180,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(opacity, {
        toValue: 0,
        duration: reduced ? 0 : 320,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [active, reduced, opacity]);

  if (!mounted) return null;
  const p = launchPalette(targetMode);
  const label = targetMode === "dark" ? "Switching to dark mode…" : "Switching to light mode…";

  return (
    <Animated.View
      pointerEvents={active ? "auto" : "none"}
      accessibilityLiveRegion="polite"
      accessibilityLabel={label}
      style={[
        StyleSheet.absoluteFill,
        {
          opacity,
          zIndex: 200,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: p.background,
        },
      ]}
    >
      <CoffeeCup size={84} tint={p.accent} onDark={targetMode === "dark"} />
      <Text
        style={{ color: p.indicator, fontFamily: "Fraunces_700Bold", fontSize: 26, marginTop: 14 }}
      >
        Cafinity
      </Text>
      <Text style={{ color: p.secondaryText, fontSize: 13, marginTop: 4 }}>{label}</Text>
      {!reduced ? (
        <ActivityIndicator color={p.indicator} style={{ marginTop: 16 }} />
      ) : null}
    </Animated.View>
  );
}
