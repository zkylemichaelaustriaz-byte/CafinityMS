import type { ImageSourcePropType } from "react-native";

/** Bundled evergreen branding assets (static require()). */
export const brandingImages = {
  loadingMark: require("../../assets/images/branding/cafinity-loading-mark.png") as ImageSourcePropType,
  wordmark: require("../../assets/images/branding/cafinity-wordmark.png") as ImageSourcePropType,
  homeHero: require("../../assets/images/branding/home-hero.png") as ImageSourcePropType,
  defaultAvatar: require("../../assets/images/default-avatar.png") as ImageSourcePropType,
};
