import { useColorScheme } from "react-native";
import type { AppearancePref } from "@/store/appearance";
import { useThemeTransition } from "@/store/themeTransition";
import { useResolvedTheme } from "@/theme/AppThemeProvider";

/**
 * Change the appearance preference WITH a short branded transition overlay.
 * - Resolves the target visual mode (handles "system").
 * - Skips the overlay when the visible mode wouldn't actually change.
 * - Ignores taps while a transition is already running (no stacked overlays).
 * The persisted setPreference is applied behind the overlay; the store auto-hides
 * the overlay after the configured minimum.
 */
export function useChangeAppearance(): (pref: AppearancePref) => void {
  const { preference, mode, setPreference } = useResolvedTheme();
  const systemScheme = useColorScheme();
  const show = useThemeTransition((s) => s.show);
  const active = useThemeTransition((s) => s.active);

  return (pref) => {
    if (active || pref === preference) return;
    const target: "light" | "dark" =
      pref === "system" ? (systemScheme === "dark" ? "dark" : "light") : pref;
    // No visible mode change (e.g. system↔explicit same mode) → just persist.
    if (target === mode) {
      setPreference(pref);
      return;
    }
    show(target);
    setPreference(pref);
  };
}
