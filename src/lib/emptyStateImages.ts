import type { ImageSourcePropType } from "react-native";

export type EmptyStateKey =
  | "cart"
  | "orders"
  | "notifications"
  | "search"
  | "favorites"
  | "vouchers"
  | "queue";

const EMPTY_IMAGES: Record<EmptyStateKey, ImageSourcePropType> = {
  cart: require("../../assets/images/empty/empty-cart.png"),
  orders: require("../../assets/images/empty/empty-orders.png"),
  notifications: require("../../assets/images/empty/empty-notifications.png"),
  search: require("../../assets/images/empty/empty-search.png"),
  favorites: require("../../assets/images/empty/empty-favorites.png"),
  vouchers: require("../../assets/images/empty/empty-vouchers.png"),
  queue: require("../../assets/images/empty/queue-clear.png"),
};

export function getEmptyStateImage(key?: EmptyStateKey | null): ImageSourcePropType | null {
  if (!key) return null;
  return EMPTY_IMAGES[key] ?? null;
}
