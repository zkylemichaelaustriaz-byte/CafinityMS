import type { ImageSourcePropType } from "react-native";

/** Bundled evergreen branding assets (static require()). */
export const brandingImages = {
  loadingMark: require("../../assets/images/branding/cafinity-loading-mark.png") as ImageSourcePropType,
  wordmark: require("../../assets/images/branding/cafinity-wordmark.png") as ImageSourcePropType,
  homeHero: require("../../assets/images/branding/home-hero.png") as ImageSourcePropType,
  defaultAvatar: require("../../assets/images/default-avatar.png") as ImageSourcePropType,
  authHero: require("../../assets/images/branding/auth-hero.png") as ImageSourcePropType,
  rewardsHero: require("../../assets/images/branding/rewards-hero.png") as ImageSourcePropType,
  profileCover: require("../../assets/images/branding/profile-cover.png") as ImageSourcePropType,
  adminDashboardHero: require("../../assets/images/branding/admin-dashboard-hero.png") as ImageSourcePropType,
  appLogo: require("../../assets/images/cafinity-logo.png") as ImageSourcePropType,
};
