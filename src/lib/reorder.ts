import { uuidv4 } from "@/lib/id";
import type { CartLine, CartSelectedOption, MenuProduct, Order } from "@/types/models";

export interface ReorderResult {
  /** Lines that can be added to the cart at the current branch. */
  added: CartLine[];
  /** Items that couldn't be re-added, with a human reason. */
  skipped: { name: string; reason: string }[];
}

/**
 * Resolves a past order against the live branch menu. Order items only store
 * names (not ids), so we match products / variants / options by name and
 * rebuild fresh cart lines at current prices. Anything missing or sold out is
 * reported in `skipped` rather than silently dropped.
 */
export function resolveReorder(order: Order, menu: MenuProduct[]): ReorderResult {
  const added: CartLine[] = [];
  const skipped: { name: string; reason: string }[] = [];

  const byName = new Map<string, MenuProduct>();
  for (const p of menu) byName.set(p.name.trim().toLowerCase(), p);

  for (const item of order.order_items ?? []) {
    const label = `${item.quantity}× ${item.product_name}`;
    const product = byName.get(item.product_name.trim().toLowerCase());
    if (!product) {
      skipped.push({ name: label, reason: "No longer on the menu" });
      continue;
    }

    const wantVariant = item.variant_name.trim().toLowerCase();
    const named = product.variants.find((v) => v.name.trim().toLowerCase() === wantVariant);
    if (named && !named.is_available) {
      skipped.push({ name: label, reason: `${item.variant_name} is sold out` });
      continue;
    }
    const variant =
      named ??
      product.variants.find((v) => v.is_default && v.is_available) ??
      product.variants.find((v) => v.is_available);
    if (!variant) {
      skipped.push({ name: label, reason: "Out of stock" });
      continue;
    }

    // Rebuild customizations by matching option names inside the product groups.
    const selectedOptions: CartSelectedOption[] = [];
    for (const c of item.order_item_customization ?? []) {
      const wanted = c.option_name.trim().toLowerCase();
      for (const g of product.groups) {
        const opt = g.options.find((o) => o.name.trim().toLowerCase() === wanted);
        if (opt) {
          selectedOptions.push({
            optionId: opt.id,
            groupId: g.id,
            groupName: g.name,
            optionName: opt.name,
            additionalPrice: opt.additional_price,
            quantity: 1,
          });
          break;
        }
      }
    }

    added.push({
      lineId: uuidv4(),
      productId: product.id,
      productName: product.name,
      imageUrl: product.image_url,
      variantId: variant.id,
      variantName: variant.name,
      basePrice: variant.price,
      quantity: item.quantity,
      selectedOptions,
      notes: item.item_notes ?? "",
    });
  }

  return { added, skipped };
}
