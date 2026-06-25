import { PRODUCT_IMAGES } from "@/lib/productImages";

export type Presentation = "default" | "hot" | "iced";

/**
 * Bundled Hot/Iced photos, keyed by the LOWERCASED PRODUCT NAME (with spaces —
 * matches productImages.ts), NOT the hyphenated file slug. The default photo
 * stays in productImages.ts; products missing a Hot or Iced entry fall back to
 * that default via resolveProductImage().
 */
export const PRESENTATION_IMAGES: Record<string, { hot?: number; iced?: number }> = {
  americano: {
    hot: require("../../assets/images/products/americano-hot.png"),
    iced: require("../../assets/images/products/americano-iced.png"),
  },
  cappuccino: {
    iced: require("../../assets/images/products/cappuccino-iced.png"),
  },
  "spanish latte": {
    hot: require("../../assets/images/products/spanish-latte-hot.png"),
    iced: require("../../assets/images/products/spanish-latte-iced.png"),
  },
  "brown sugar latte": {
    hot: require("../../assets/images/products/brown-sugar-latte-hot.png"),
    iced: require("../../assets/images/products/brown-sugar-latte-iced.png"),
  },
  "flat white": {
    iced: require("../../assets/images/products/flat-white-iced.png"),
  },
  "caramel macchiato": {
    hot: require("../../assets/images/products/caramel-macchiato-hot.png"),
    iced: require("../../assets/images/products/caramel-macchiato-iced.png"),
  },
  "matcha latte": {
    hot: require("../../assets/images/products/matcha-latte-hot.png"),
    iced: require("../../assets/images/products/matcha-latte-iced.png"),
  },
  "hot chocolate": {
    iced: require("../../assets/images/products/hot-chocolate-iced.png"),
  },
  "caramel cookie latte": {
    hot: require("../../assets/images/products/caramel-cookie-latte-hot.png"),
    iced: require("../../assets/images/products/caramel-cookie-latte-iced.png"),
  },
  "peppermint mocha": {
    hot: require("../../assets/images/products/peppermint-mocha-hot.png"),
    iced: require("../../assets/images/products/peppermint-mocha-iced.png"),
  },
  "gingerbread latte": {
    hot: require("../../assets/images/products/gingerbread-latte-hot.png"),
    iced: require("../../assets/images/products/gingerbread-latte-iced.png"),
  },
  "strawberry red velvet latte": {
    hot: require("../../assets/images/products/strawberry-red-velvet-latte-hot.png"),
    iced: require("../../assets/images/products/strawberry-red-velvet-latte-iced.png"),
  },
  "choco strawberry mocha": {
    hot: require("../../assets/images/products/choco-strawberry-mocha-hot.png"),
    iced: require("../../assets/images/products/choco-strawberry-mocha-iced.png"),
  },
  "mango latte": {
    hot: require("../../assets/images/products/mango-latte-hot.png"),
    iced: require("../../assets/images/products/mango-latte-iced.png"),
  },
  "matcha strawberry latte": {
    hot: require("../../assets/images/products/matcha-strawberry-latte-hot.png"),
    iced: require("../../assets/images/products/matcha-strawberry-latte-iced.png"),
  },
  "ube latte": {
    hot: require("../../assets/images/products/ube-latte-hot.png"),
    iced: require("../../assets/images/products/ube-latte-iced.png"),
  },
  "blueberry cloud latte": {
    hot: require("../../assets/images/products/blueberry-cloud-latte-hot.png"),
    iced: require("../../assets/images/products/blueberry-cloud-latte-iced.png"),
  },
};

/** Map the selected Temperature option(s) to a presentation key. */
export function presentationFromOptionNames(names: (string | undefined)[]): Presentation {
  const lower = names.filter(Boolean).map((n) => (n as string).toLowerCase());
  if (lower.includes("iced")) return "iced";
  if (lower.includes("hot")) return "hot";
  return "default";
}

interface MediaProduct {
  name: string;
  image_url?: string | null;
  media?: { default?: string; hot?: string; iced?: string } | null;
}

/**
 * Resolve the best image for a product + presentation. Picks the SELECTED
 * presentation first (bundled, then remote), then falls back to the default
 * (bundled → remote → legacy products.image_url). Returns {} → emoji placeholder.
 * Works even when only a default image exists.
 */
export function resolveProductImage(
  p: MediaProduct,
  presentation: Presentation = "default",
): { source?: number; uri?: string } {
  const slug = p.name.trim().toLowerCase();
  const bundled = PRESENTATION_IMAGES[slug];

  if (presentation !== "default") {
    if (bundled?.[presentation]) return { source: bundled[presentation] };
    const remote = p.media?.[presentation];
    if (remote) return { uri: remote };
  }

  const localDefault = PRODUCT_IMAGES[slug];
  if (localDefault) return { source: localDefault };
  if (p.media?.default) return { uri: p.media.default };
  if (p.image_url) return { uri: p.image_url };
  return {};
}
