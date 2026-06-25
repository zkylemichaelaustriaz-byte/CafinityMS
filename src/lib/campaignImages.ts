import type { ImageSourcePropType } from "react-native";

/**
 * Bundled light-mode campaign banners (9:16 portrait). Static require() calls so
 * Metro bundles them — keys must match campaign preset_key exactly.
 * Presets without a bundled asset (halloween, anniversary, default) fall back to
 * the accent/emoji banner.
 */
export type BundledCampaignPresetKey =
  | "default"
  | "matcha"
  | "mango"
  | "caramel"
  | "christmas"
  | "valentines"
  | "ube-taro"
  | "blueberry-rain";

const CAMPAIGN_IMAGES: Record<BundledCampaignPresetKey, ImageSourcePropType> = {
  default: require("../../assets/images/campaigns/campaign-default.png"),
  matcha: require("../../assets/images/campaigns/campaign-matcha.png"),
  mango: require("../../assets/images/campaigns/campaign-mango.png"),
  caramel: require("../../assets/images/campaigns/campaign-caramel.png"),
  christmas: require("../../assets/images/campaigns/campaign-christmas.png"),
  valentines: require("../../assets/images/campaigns/campaign-valentines.png"),
  "ube-taro": require("../../assets/images/campaigns/campaign-ube-taro.png"),
  "blueberry-rain": require("../../assets/images/campaigns/campaign-blueberry-rain.png"),
};

/** Bundled banner for a preset key, or null if none is bundled. */
export function getCampaignImage(presetKey?: string | null): ImageSourcePropType | null {
  if (!presetKey) return null;
  return CAMPAIGN_IMAGES[presetKey as BundledCampaignPresetKey] ?? null;
}
