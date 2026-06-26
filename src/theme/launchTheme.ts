import { ENABLE_SEASONAL_LAUNCH_THEME } from "@/config/launch";
import { darkTheme, lightTheme } from "@/constants/theme";

// Fixed (non-reactive) palette for the launch + theme-transition screens. These
// must NOT read the live Colors proxy, because during a theme switch the proxy is
// mid-change — the overlay needs the TARGET mode's colors locked in.

export interface LaunchPalette {
  background: string;
  foreground: string;
  secondaryText: string;
  accent: string;
  indicator: string;
  logoSurface: string;
}

/**
 * Restrained, date-based seasonal accent. Centralized here; no hardcoded year,
 * falls back to null (default Cafinity) on anything unexpected. Disabled unless
 * ENABLE_SEASONAL_LAUNCH_THEME is on — never reduces contrast (accent only).
 */
export function getCurrentSeasonalLaunch(
  date: Date = new Date(),
): { accentLight: string; accentDark: string } | null {
  if (!ENABLE_SEASONAL_LAUNCH_THEME) return null;
  try {
    const m = date.getMonth(); // 0 = Jan
    if (m === 11) return { accentLight: "#8C3B3B", accentDark: "#C56B6B" }; // holiday — muted warm red
    if (m >= 5 && m <= 7) return { accentLight: "#D8922B", accentDark: "#E8B65A" }; // summer — caramel
    if (m >= 8 && m <= 10) return { accentLight: "#5A6B82", accentDark: "#8AA0BE" }; // rainy — blue-gray
    return null;
  } catch {
    return null;
  }
}

export function launchPalette(mode: "light" | "dark"): LaunchPalette {
  const t = mode === "dark" ? darkTheme : lightTheme;
  const palette: LaunchPalette = {
    background: t.background,
    foreground: t.textPrimary,
    secondaryText: t.textMuted,
    accent: t.accent,
    indicator: t.brandPrimary,
    logoSurface: t.surface,
  };
  const seasonal = getCurrentSeasonalLaunch();
  if (seasonal) palette.accent = mode === "dark" ? seasonal.accentDark : seasonal.accentLight;
  return palette;
}
