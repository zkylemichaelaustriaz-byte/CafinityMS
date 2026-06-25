// Seasonal theme engine.
//
// The ACTIVE campaign (chosen by an admin, sourced from the server) drives a
// small set of accent tokens across the whole app. We deliberately recolor only
// the accent family + primary CTA + hero panel + decorative tint — NOT the
// neutral surfaces, body text, lines, or semantic (success/danger) colors — so
// readability stays stable no matter which season is active.
//
// Palettes are DERIVED from each preset's single accent hex (see
// campaignPresets.ts) at module load, so adding a preset needs no extra tuning.

import { presetByKey } from "@/lib/campaignPresets";
import type { ThemeVars } from "@/theme/vars";
import type { ThemeColors } from "@/constants/theme";

type RGB = [number, number, number];
type Mode = "light" | "dark";
const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];
/** Dark-mode surface base used to tint soft accent backgrounds. */
const DARK_SURFACE: RGB = [30, 28, 25];

function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Blend a→b by t (0..1). */
function mix(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}
const lighten = (c: RGB, t: number) => mix(c, WHITE, t);
const darken = (c: RGB, t: number) => mix(c, BLACK, t);

/** "R G B" channel string for NativeWind vars(). */
const ch = (c: RGB) => `${c[0]} ${c[1]} ${c[2]}`;
/** "#rrggbb" for JS color props. */
const hex = (c: RGB) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");

/** True when this key should leave the base Cafinity palette untouched. */
function isDefault(key?: string | null): boolean {
  return !key || key === "default";
}

/**
 * CSS-variable overrides for the className side (merged over the base scheme).
 * Returns {} for the default/no-campaign case so base tokens win.
 */
export function seasonalVars(key?: string | null, mode: Mode = "light"): ThemeVars {
  const preset = presetByKey(key ?? undefined);
  if (!preset || isDefault(key)) return {};
  const a = hexToRgb(preset.accent);

  if (mode === "dark") {
    return {
      "--color-accent": ch(lighten(a, 0.08)),
      "--color-accent-500": ch(a),
      "--color-accent-400": ch(lighten(a, 0.14)),
      "--color-accent-300": ch(lighten(a, 0.04)), // selected borders stay vivid
      "--color-accent-200": ch(mix(a, DARK_SURFACE, 0.55)),
      "--color-accent-100": ch(mix(a, DARK_SURFACE, 0.8)), // dark-tinted soft bg
      "--color-accent-600": ch(darken(a, 0.1)),
      "--color-accent-700": ch(darken(a, 0.22)),
      // CTA brightened so it reads on dark surfaces.
      "--color-brandPrimary": ch(lighten(a, 0.1)),
      "--color-brandSecondary": ch(lighten(a, 0.02)),
      "--color-secondary": ch(lighten(a, 0.06)),
      "--color-secondary-500": ch(lighten(a, 0.06)),
      "--color-secondary-600": ch(a),
      "--color-secondary-soft": ch(mix(a, DARK_SURFACE, 0.82)),
      // Hero panel: deep but still visibly the accent on a dark app.
      "--color-brand-900": ch(darken(a, 0.42)),
      "--color-brand-800": ch(darken(a, 0.3)),
      "--color-caramel": ch(lighten(a, 0.08)),
      "--color-matcha": ch(lighten(a, 0.06)),
    };
  }

  return {
    "--color-accent": ch(a),
    "--color-accent-500": ch(a),
    "--color-accent-400": ch(lighten(a, 0.16)),
    "--color-accent-300": ch(lighten(a, 0.42)),
    "--color-accent-200": ch(lighten(a, 0.62)),
    "--color-accent-100": ch(lighten(a, 0.84)), // soft accent background
    "--color-accent-600": ch(darken(a, 0.16)),
    "--color-accent-700": ch(darken(a, 0.3)),
    // Primary CTA carries white text → darken for contrast on every accent.
    "--color-brandPrimary": ch(darken(a, 0.3)),
    "--color-brandSecondary": ch(darken(a, 0.12)),
    // Secondary accent family.
    "--color-secondary": ch(darken(a, 0.1)),
    "--color-secondary-500": ch(darken(a, 0.1)),
    "--color-secondary-600": ch(darken(a, 0.24)),
    "--color-secondary-soft": ch(lighten(a, 0.82)),
    // Hero / dark panel background tinted to a deep version of the accent.
    "--color-brand-900": ch(darken(a, 0.58)),
    "--color-brand-800": ch(darken(a, 0.48)),
    // Decorative illustration tint tokens.
    "--color-caramel": ch(a),
    "--color-matcha": ch(darken(a, 0.1)),
  };
}

/**
 * JS-side overrides for the `Colors`/`theme` proxies (icons, tab tints, SVG
 * decorations). Returns null for the default/no-campaign case.
 */
export function seasonalColors(
  key?: string | null,
  mode: Mode = "light",
): Partial<ThemeColors> | null {
  const preset = presetByKey(key ?? undefined);
  if (!preset || isDefault(key)) return null;
  const a = hexToRgb(preset.accent);
  if (mode === "dark") {
    return {
      accent: hex(lighten(a, 0.08)),
      accentSoft: hex(mix(a, DARK_SURFACE, 0.8)),
      brandPrimary: hex(lighten(a, 0.1)),
      brandSecondary: hex(lighten(a, 0.02)),
      secondary: hex(lighten(a, 0.06)),
      secondarySoft: hex(mix(a, DARK_SURFACE, 0.82)),
    };
  }
  return {
    accent: preset.accent,
    accentSoft: hex(lighten(a, 0.84)),
    brandPrimary: hex(darken(a, 0.3)),
    brandSecondary: hex(darken(a, 0.12)),
    secondary: hex(darken(a, 0.1)),
    secondarySoft: hex(lighten(a, 0.82)),
  };
}

/** A few swatches for the admin theme preview. */
export function seasonalSwatch(key?: string | null): {
  accent: string;
  primary: string;
  soft: string;
  hero: string;
} {
  const preset = presetByKey(key ?? undefined);
  const a = hexToRgb(preset?.accent ?? "#E0832B");
  if (!preset || isDefault(key)) {
    return { accent: "#E0832B", primary: "#5A3019", soft: "#F8E4C8", hero: "#2C170A" };
  }
  return {
    accent: hex(a),
    primary: hex(darken(a, 0.3)),
    soft: hex(lighten(a, 0.84)),
    hero: hex(darken(a, 0.58)),
  };
}
