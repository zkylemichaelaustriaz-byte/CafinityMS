import type { ReactNode } from "react";
import { View } from "react-native";
import { vars } from "nativewind";
import { DARK_VARS, LIGHT_VARS } from "@/theme/vars";
import { seasonalVars } from "@/theme/seasonal";

/**
 * Applies the active theme's CSS variables to the whole tree via NativeWind's
 * vars(). Deterministic (JS-driven), and merges the active seasonal campaign's
 * accent palette on top of the base scheme.
 */
export function ThemeProvider({
  scheme,
  seasonalKey,
  children,
}: {
  scheme: "light" | "dark";
  seasonalKey?: string | null;
  children: ReactNode;
}) {
  const base = scheme === "dark" ? DARK_VARS : LIGHT_VARS;
  const merged = { ...base, ...seasonalVars(seasonalKey, scheme) };
  return (
    <View style={vars(merged)} className="flex-1">
      {children}
    </View>
  );
}
