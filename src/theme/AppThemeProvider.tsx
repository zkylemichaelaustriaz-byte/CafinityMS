import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import { colorScheme as nwColorScheme } from "nativewind";
import { StatusBar } from "expo-status-bar";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { applyScheme, applySeasonal, Colors, type ColorsShape } from "@/constants/theme";
import { useAppearance, type AppearancePref } from "@/store/appearance";
import { effectiveSeasonalKey, useSeasonalTheme } from "@/store/seasonalTheme";

export interface ResolvedTheme {
  preference: AppearancePref;
  mode: "light" | "dark";
  campaignKey: string | null;
  /** Reactive JS color map (Ionicons, tab bars, inline styles). */
  colors: ColorsShape;
  setPreference: (p: AppearancePref) => void;
}

const ThemeCtx = createContext<ResolvedTheme | null>(null);

/**
 * THE single runtime source of truth for the theme:
 *   appearance preference + OS scheme + active campaign  →  resolved theme.
 *
 * It feeds BOTH color pipelines from one place:
 *   - NativeWind CSS variables (className colors) via <ThemeProvider vars/>.
 *   - The JS `Colors` proxy (Ionicons / tab bars / inline styles) via applyScheme.
 *
 * Crucially it also calls NativeWind's colorScheme.set(mode) so every mounted
 * styled component re-renders on a mode change — without that, navigator-held
 * screens keep stale JS-prop colors (the "dark page, light tab bar" bug).
 *
 * Mount ONCE above all route groups. Consume via useResolvedTheme() anywhere a
 * JS color must react (e.g. tab/stack navigator options).
 */
export function AppThemeProvider({ children }: { children: ReactNode }) {
  const preference = useAppearance((s) => s.preference);
  const setPreference = useAppearance((s) => s.setPreference);
  const systemScheme = useColorScheme();
  const campaignKey = useSeasonalTheme(effectiveSeasonalKey);

  const mode: "light" | "dark" =
    preference === "system" ? (systemScheme === "dark" ? "dark" : "light") : preference;

  // Apply to the JS proxy synchronously so descendants read fresh Colors.* this
  // render (the proxy is read at render time).
  applyScheme(mode);
  applySeasonal(campaignKey);

  // Force NativeWind styled components (almost everything) to re-render so a mode
  // change reaches already-mounted screens for both className and JS colors.
  useEffect(() => {
    nwColorScheme.set(mode);
  }, [mode]);

  const value = useMemo<ResolvedTheme>(
    () => ({ preference, mode, campaignKey, colors: Colors, setPreference }),
    [preference, mode, campaignKey, setPreference],
  );

  return (
    <ThemeCtx.Provider value={value}>
      <StatusBar style={mode === "dark" ? "light" : "dark"} />
      <ThemeProvider scheme={mode} seasonalKey={campaignKey}>
        {children}
      </ThemeProvider>
    </ThemeCtx.Provider>
  );
}

export function useResolvedTheme(): ResolvedTheme {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error("useResolvedTheme must be used within AppThemeProvider");
  return ctx;
}
