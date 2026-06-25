/**
 * Local product photos (in assets/images/products/, PNG).
 *
 * To add/replace: drop a file using the matching name, keep its line here.
 * Keys are the LOWERCASED product name exactly as stored in the database.
 * The app prefers a local photo, then `products.image_url`, then a fallback.
 */
export const PRODUCT_IMAGES: Record<string, number> = {
  "caramel macchiato": require("../../assets/images/products/caramel-macchiato.png"),
  "spanish latte": require("../../assets/images/products/spanish-latte.png"),
  "brown sugar latte": require("../../assets/images/products/brown-sugar-latte.png"),
  americano: require("../../assets/images/products/americano.png"),
  cappuccino: require("../../assets/images/products/cappuccino.png"),
  "flat white": require("../../assets/images/products/flat-white.png"),
  "matcha latte": require("../../assets/images/products/matcha-latte.png"),
  "strawberry milk": require("../../assets/images/products/strawberry-milk.png"),
  "hot chocolate": require("../../assets/images/products/hot-chocolate.png"),
  "butter croissant": require("../../assets/images/products/butter-croissant.png"),
  "chocolate muffin": require("../../assets/images/products/chocolate-muffin.png"),
  "cheesecake slice": require("../../assets/images/products/cheesecake-slice.png"),
  // Seasonal collection (phase 15)
  "mango latte": require("../../assets/images/products/mango-latte.png"),
  "mango cream frappe": require("../../assets/images/products/mango-cream-frappe.png"),
  "matcha strawberry latte": require("../../assets/images/products/matcha-strawberry-latte.png"),
  "caramel cookie latte": require("../../assets/images/products/caramel-cookie-latte.png"),
  "peppermint mocha": require("../../assets/images/products/peppermint-mocha.png"),
  "gingerbread latte": require("../../assets/images/products/gingerbread-latte.png"),
  "strawberry red velvet latte": require("../../assets/images/products/strawberry-red-velvet-latte.png"),
  "choco strawberry mocha": require("../../assets/images/products/choco-strawberry-mocha.png"),
  "ube latte": require("../../assets/images/products/ube-latte.png"),
  "taro milk tea": require("../../assets/images/products/taro-milk-tea.png"),
  // Blueberry Rain collection (phase 16)
  "blueberry cloud latte": require("../../assets/images/products/blueberry-cloud-latte.png"),
  "butterfly pea blueberry fizz": require("../../assets/images/products/blueberry-rain-fizz.png"),
  "blueberry cheesecake": require("../../assets/images/products/blueberry-cheesecake.png"),
};

/** Returns a local image module for a product name, if one has been added. */
export function localProductImage(name?: string | null): number | undefined {
  if (!name) return undefined;
  return PRODUCT_IMAGES[name.trim().toLowerCase()];
}
