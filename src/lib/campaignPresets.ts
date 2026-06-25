/**
 * Seasonal campaign presets. Each supplies sensible defaults + an accent
 * treatment so a campaign can be created and demonstrated WITHOUT uploading a
 * hero image (the modal falls back to an accent banner). Banner image files
 * are optional and documented in docs/SEASONAL-ASSETS.md.
 */
export interface CampaignPreset {
  key: string;
  name: string; // label on the selectable card
  title: string;
  subtitle: string;
  badge: string;
  cta: string;
  /** Accent for CTA + badge. */
  accent: string;
  /** Banner background when no image is supplied. */
  bg: string;
  emoji: string;
}

export const CAMPAIGN_PRESETS: CampaignPreset[] = [
  { key: "matcha", name: "Matcha Season", title: "Matcha Season is here", subtitle: "Earthy, vibrant, limited-time matcha drinks.", badge: "Seasonal", cta: "Explore matcha", accent: "#5E7A5A", bg: "#E6EDE3", emoji: "🍵" },
  { key: "mango", name: "Mango Summer", title: "Mango Summer", subtitle: "Sun-ripened mango coolers to beat the heat.", badge: "Summer", cta: "Try it", accent: "#E0892B", bg: "#FBEFD9", emoji: "🥭" },
  { key: "caramel", name: "Caramel Collection", title: "Caramel Collection", subtitle: "Buttery caramel, freshly pulled espresso.", badge: "New", cta: "Order now", accent: "#A85A2A", bg: "#F3E4D2", emoji: "🍮" },
  { key: "christmas", name: "Christmas", title: "Merry Cafinity", subtitle: "Cozy holiday flavors are back.", badge: "Holiday", cta: "See the menu", accent: "#B23B3B", bg: "#E9F1E7", emoji: "🎄" },
  { key: "valentines", name: "Valentine's", title: "Share the love", subtitle: "Sweet treats meant for two.", badge: "Limited", cta: "Treat yourself", accent: "#C2506E", bg: "#FBE7EE", emoji: "💝" },
  { key: "ube-taro", name: "Ube & Taro", title: "Ube & Taro Collection", subtitle: "Creamy, dreamy, naturally delicious.", badge: "New · Seasonal", cta: "Explore the collection", accent: "#77508F", bg: "#EEE6F3", emoji: "💜" },
  { key: "blueberry-rain", name: "Blueberry Rain", title: "Blueberry Rain", subtitle: "Cool sips for rainy days.", badge: "Seasonal", cta: "Explore the collection", accent: "#4C5FD5", bg: "#E7EAF7", emoji: "🫐" },
  { key: "default", name: "Cafinity Favorites", title: "Cafinity Favorites", subtitle: "Your everyday favorites, ready when you are.", badge: "Featured", cta: "Browse the menu", accent: "#5A3019", bg: "#FBF7F1", emoji: "☕" },
];

export function presetByKey(key?: string | null): CampaignPreset | undefined {
  if (!key) return undefined;
  return CAMPAIGN_PRESETS.find((p) => p.key === key);
}
