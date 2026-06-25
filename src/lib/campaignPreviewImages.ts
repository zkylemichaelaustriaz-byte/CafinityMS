import type { ImageSourcePropType } from "react-native";

/** Landscape preset thumbnails for the admin campaign picker (preset_key -> image). */
const PREVIEW_IMAGES: Record<string, ImageSourcePropType> = {
  default: require("../../assets/images/campaigns/previews/preset-default.png"),
  matcha: require("../../assets/images/campaigns/previews/preset-matcha.png"),
  mango: require("../../assets/images/campaigns/previews/preset-mango.png"),
  caramel: require("../../assets/images/campaigns/previews/preset-caramel.png"),
  christmas: require("../../assets/images/campaigns/previews/preset-christmas.png"),
  valentines: require("../../assets/images/campaigns/previews/preset-valentines.png"),
  "ube-taro": require("../../assets/images/campaigns/previews/preset-ube-taro.png"),
  "blueberry-rain": require("../../assets/images/campaigns/previews/preset-blueberry-rain.png"),
};

export function getCampaignPreview(presetKey?: string | null): ImageSourcePropType | null {
  if (!presetKey) return null;
  return PREVIEW_IMAGES[presetKey] ?? null;
}
