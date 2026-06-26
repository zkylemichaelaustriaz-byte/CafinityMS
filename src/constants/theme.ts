// =============================================================================
// Cafinity Design Tokens — single source of truth for the visual system.
//
// Light theme is the active, shipped theme. A complete PROVISIONAL dark palette
// is defined for future use; no dark-mode toggle ships in this phase.
// NativeWind/Tailwind class equivalents live in tailwind.config.js and must be
// kept in sync with `lightTheme` below.
// =============================================================================

import { seasonalColors } from "@/theme/seasonal";

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceMuted: string;
  surfaceElevated: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textDisabled: string;
  textInverse: string;
  textLink: string;
  brandPrimary: string;
  brandSecondary: string;
  secondary: string;
  secondarySoft: string;
  accent: string;
  accentSoft: string;
  border: string;
  borderStrong: string;
  surfaceSelected: string;
  surfaceDisabled: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  onSuccess: string;
  onWarning: string;
  onDanger: string;
  onInfo: string;
  disabled: string;
  overlay: string;
  skeleton: string;
  onBrand: string;
  onAccent: string;
}

export const lightTheme: ThemeColors = {
  background: "#FAF9F7", // warm white
  surface: "#FFFFFF",
  surfaceMuted: "#F3F0EC", // soft neutral
  surfaceElevated: "#FFFFFF",
  textPrimary: "#241913", // espresso ink
  textSecondary: "#756C66",
  textMuted: "#6E665F", // darkened for 4.5:1 on white + surfaceMuted
  textDisabled: "#8B827A",
  textInverse: "#FFFFFF",
  textLink: "#2B6CB0",
  brandPrimary: "#572A15", // deep espresso — primary CTA / dark panels
  brandSecondary: "#9A6A43", // latte / mocha
  secondary: "#5E7A5A", // sage green — fresh secondary
  secondarySoft: "#E6EDE3",
  accent: "#E88725", // amber — energy, progress, highlights
  accentSoft: "#F8E4C8",
  border: "#EAE5DF", // light neutral divider
  borderStrong: "#8C8278", // 3:1 — meaningful control borders
  surfaceSelected: "#F8E4C8",
  surfaceDisabled: "#EDE8E2",
  success: "#2F855A",
  warning: "#D97E27",
  danger: "#C0392B",
  info: "#2B6CB0",
  onSuccess: "#FFFFFF",
  onWarning: "#241913",
  onDanger: "#FFFFFF",
  onInfo: "#FFFFFF",
  disabled: "#D6C9BA",
  overlay: "rgba(30,18,12,0.55)",
  skeleton: "#ECE7E1",
  onBrand: "#FFFFFF",
  onAccent: "#3A2410",
};

export const darkTheme: ThemeColors = {
  background: "#100F0D",
  surface: "#211E1B",
  surfaceMuted: "#2C2824",
  surfaceElevated: "#34302B",
  textPrimary: "#F5EFE7",
  textSecondary: "#BDB3A8",
  textMuted: "#AAA197", // lightened for 4.5:1 on raised surfaces
  textDisabled: "#968D83",
  textInverse: "#1A120A",
  textLink: "#7AAEE0",
  brandPrimary: "#C2885C", // lightened for 4.5:1 as text on surfaces
  brandSecondary: "#A86B43",
  secondary: "#7FA078",
  secondarySoft: "#27341F",
  accent: "#E8A24A",
  accentSoft: "#3A2A18",
  border: "#48423C",
  borderStrong: "#7D746B", // 3:1 — meaningful control borders
  surfaceSelected: "#3A2A18",
  surfaceDisabled: "#262320",
  success: "#48BB78",
  warning: "#E0922F",
  danger: "#E86A5C", // lightened for 4.5:1 on dangerSoft
  info: "#5A9BD4",
  onSuccess: "#1A120A",
  onWarning: "#1A120A",
  onDanger: "#1A120A",
  onInfo: "#1A120A",
  disabled: "#4A3B2C",
  overlay: "rgba(0,0,0,0.6)",
  skeleton: "#2E2216",
  onBrand: "#1A120A",
  onAccent: "#1A120A",
};

// --- Runtime scheme + seasonal palette switching -----------------------------
let _scheme: "light" | "dark" = "light";
let _seasonalKey: string | null = null;

/** Called by the root layout whenever the effective color scheme changes. */
export function applyScheme(s: "light" | "dark") {
  _scheme = s;
}

/** Called by the root layout whenever the active seasonal campaign changes. */
export function applySeasonal(key: string | null) {
  _seasonalKey = key;
}

export function activeScheme(): "light" | "dark" {
  return _scheme;
}

function activeTheme(): ThemeColors {
  const base = _scheme === "dark" ? darkTheme : lightTheme;
  // seasonal.ts only type-imports from this module, so there is no runtime cycle.
  const override = seasonalColors(_seasonalKey, _scheme);
  return override ? { ...base, ...override } : base;
}

/** Active palette — proxied so JS color reads follow the current scheme. */
export const theme = new Proxy({} as ThemeColors, {
  get: (_t, key: string | symbol) => activeTheme()[key as keyof ThemeColors],
}) as ThemeColors;

export interface ColorsShape {
  brand: string;
  brandDark: string;
  brandLight: string;
  espresso: string;
  cream: string;
  caramel: string;
  accent: string;
  secondary: string;
  matcha: string;
  text: string;
  textMuted: string;
  border: string;
  surface: string;
  danger: string;
  success: string;
  warning: string;
  info: string;
}

function colorsFrom(t: ThemeColors): ColorsShape {
  return {
    brand: t.brandPrimary,
    brandDark: _scheme === "dark" ? "#7E5234" : "#3F210F",
    brandLight: "#C9A47C",
    espresso: t.textPrimary,
    cream: t.background,
    caramel: t.accent,
    accent: t.accent,
    secondary: t.secondary,
    matcha: t.secondary,
    text: t.textPrimary,
    textMuted: t.textMuted,
    border: t.border,
    surface: t.surface,
    danger: t.danger,
    success: t.success,
    warning: t.warning,
    info: t.info,
  };
}

/** Back-compat JS color map — proxied to follow the active scheme. */
export const Colors = new Proxy({} as ColorsShape, {
  get: (_t, key: string | symbol) => colorsFrom(activeTheme())[key as keyof ColorsShape],
}) as ColorsShape;

export type AppColor = keyof ColorsShape;

// --- Shape / spacing / type / motion tokens ----------------------------------
export const radii = { xs: 8, sm: 12, md: 16, lg: 22, xl: 28, pill: 999 } as const;

export const spacing = { gutter: 20, section: 28, gap: 12, cardPad: 16 } as const;

export const fonts = {
  body: "System",
  serif: "Fraunces_400Regular",
  heading: "Fraunces_600SemiBold",
  display: "Fraunces_700Bold",
  displayBlack: "Fraunces_900Black",
} as const;

export const motion = {
  fast: 150,
  base: 240,
  slow: 360,
  spring: { damping: 16, stiffness: 180, mass: 0.7 },
} as const;

export const shadow = {
  card: {
    shadowColor: "#3A2410",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  floating: {
    shadowColor: "#3A2410",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
} as const;
