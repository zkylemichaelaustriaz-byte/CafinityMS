import { supabase } from "@/lib/supabase";
import { distanceKm } from "@/lib/format";
import type {
  AdminSettings,
  AppNotification,
  Branch,
  BranchWithDistance,
  Campaign,
  Category,
  NotificationPreferences,
  SettingsAuditRow,
  CustomizationGroup,
  LoyaltyTransaction,
  MenuProduct,
  Order,
  OrderQuote,
  OrderStatus,
  PaymentStatus,
  PlaceOrderResult,
  Product,
  Profile,
  Promotion,
  Reward,
  RewardRedemption,
  UserRole,
  Variant,
} from "@/types/models";

// ---- Branches --------------------------------------------------------------

export async function getBranches(
  userLat?: number | null,
  userLon?: number | null,
): Promise<BranchWithDistance[]> {
  const { data, error } = await supabase
    .from("branches")
    .select("*")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;

  const branches: BranchWithDistance[] = (data ?? []).map((b: Branch) => ({
    ...b,
    distanceKm:
      userLat != null && userLon != null && b.latitude != null && b.longitude != null
        ? distanceKm(userLat, userLon, Number(b.latitude), Number(b.longitude))
        : null,
  }));

  branches.sort((a, b) => {
    if (a.distanceKm == null && b.distanceKm == null) return 0;
    if (a.distanceKm == null) return 1;
    if (b.distanceKm == null) return -1;
    return a.distanceKm - b.distanceKm;
  });
  return branches;
}

// ---- Menu ------------------------------------------------------------------

const PRODUCT_SELECT = `
  id, category_id, name, description, image_url, is_available, is_featured, created_at, collection_key,
  product_categories ( name, display_order ),
  product_variants ( id, product_id, name, price, is_default, is_available, deleted_at ),
  product_customization_link (
    customization_groups (
      id, name, selection_type,
      customization_options ( id, group_id, name, additional_price, is_default, display_order )
    )
  )
`;

type InventoryMap = Map<string, { stock: number; available: boolean; threshold: number }>;

async function inventoryForBranch(branchId: string): Promise<InventoryMap> {
  const { data, error } = await supabase
    .from("branch_inventory")
    .select("product_variant_id, stock_quantity, is_available, low_stock_threshold")
    .eq("branch_id", branchId);
  if (error) throw error;
  const map: InventoryMap = new Map();
  for (const row of data ?? []) {
    map.set(row.product_variant_id, {
      stock: row.stock_quantity,
      available: row.is_available,
      threshold: row.low_stock_threshold ?? 0,
    });
  }
  return map;
}

const NEW_PRODUCT_DAYS = 30;

function transformProduct(row: any, inv: InventoryMap): MenuProduct {
  const variants: Variant[] = (row.product_variants ?? [])
    .filter((v: any) => v.deleted_at == null)
    .map((v: any) => {
      const stock = inv.get(v.id);
      // Closed-by-default: a variant with no inventory row is unavailable.
      const available =
        v.is_available && (stock ? stock.available && stock.stock > 0 : false);
      return {
        id: v.id,
        product_id: v.product_id,
        name: v.name,
        price: Number(v.price),
        is_default: v.is_default,
        is_available: available,
      };
    })
    .sort((a: Variant, b: Variant) => a.price - b.price);

  // Branch stock summary across the available variants → "Few left" signal.
  const availStocks = (row.product_variants ?? [])
    .filter((v: any) => v.deleted_at == null && v.is_available)
    .map((v: any) => inv.get(v.id))
    .filter((s: any): s is { stock: number; available: boolean; threshold: number } =>
      Boolean(s && s.available && s.stock > 0),
    );
  const inStock = availStocks.length > 0;
  const totalStock = availStocks.reduce((n: number, s: any) => n + s.stock, 0);
  const maxThreshold = availStocks.reduce((m: number, s: any) => Math.max(m, s.threshold), 0);
  const lowStock = inStock && totalStock <= maxThreshold;

  const createdAt = row.created_at ? new Date(row.created_at).getTime() : 0;
  const isNew = createdAt > 0 && Date.now() - createdAt <= NEW_PRODUCT_DAYS * 86400000;

  const groups: CustomizationGroup[] = (row.product_customization_link ?? [])
    .map((link: any) => link.customization_groups)
    .filter(Boolean)
    .map((g: any) => ({
      id: g.id,
      name: g.name,
      selection_type: g.selection_type,
      options: (g.customization_options ?? [])
        .map((o: any) => ({
          id: o.id,
          group_id: o.group_id,
          name: o.name,
          additional_price: Number(o.additional_price),
          is_default: o.is_default,
          display_order: o.display_order,
        }))
        .sort((a: any, b: any) => a.display_order - b.display_order),
    }));

  return {
    id: row.id,
    category_id: row.category_id,
    name: row.name,
    description: row.description,
    image_url: row.image_url,
    is_available: row.is_available,
    is_featured: row.is_featured,
    category_name: row.product_categories?.name ?? "Other",
    variants,
    groups,
    inStock,
    isNew,
    lowStock,
    collection_key: row.collection_key ?? null,
  };
}

export async function getMenu(branchId: string): Promise<MenuProduct[]> {
  const [{ data, error }, inv] = await Promise.all([
    supabase
      .from("products")
      .select(PRODUCT_SELECT)
      .is("deleted_at", null)
      .eq("is_available", true),
    inventoryForBranch(branchId),
  ]);
  if (error) throw error;

  const rows = (data ?? []) as any[];
  const decorated = rows.map((row) => ({
    product: transformProduct(row, inv),
    // PostgREST returns the to-one category as an object at runtime.
    order: row.product_categories?.display_order ?? 99,
  }));
  decorated.sort((a, b) =>
    a.order !== b.order
      ? a.order - b.order
      : a.product.name.localeCompare(b.product.name),
  );
  return decorated.map((d) => d.product);
}

export async function getProduct(
  productId: string,
  branchId: string,
): Promise<MenuProduct | null> {
  const [{ data, error }, inv] = await Promise.all([
    supabase.from("products").select(PRODUCT_SELECT).eq("id", productId).single(),
    inventoryForBranch(branchId),
  ]);
  if (error) throw error;
  if (!data) return null;
  return transformProduct(data, inv);
}

// ---- Promotions ------------------------------------------------------------

export interface PromoResult {
  promo: Promotion;
  discount: number;
}

/** Client-side preview of a promo code (server re-validates in place_order). */
export async function previewPromo(
  code: string,
  subtotal: number,
): Promise<PromoResult> {
  const { data, error } = await supabase
    .from("promotions")
    .select("*")
    .ilike("code", code.trim())
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Promo code not found.");

  const promo = data as Promotion;
  const now = new Date();
  if (promo.starts_at && new Date(promo.starts_at) > now)
    throw new Error("This promo is not active yet.");
  if (promo.ends_at && new Date(promo.ends_at) < now)
    throw new Error("This promo has expired.");
  if (promo.usage_limit != null && promo.usage_count >= promo.usage_limit)
    throw new Error("This promo has reached its usage limit.");
  if (subtotal < Number(promo.min_order_amount))
    throw new Error(
      `Spend at least ₱${Number(promo.min_order_amount).toFixed(0)} to use this code.`,
    );

  const discount =
    promo.discount_type === "percent"
      ? Math.round(((subtotal * Number(promo.discount_value)) / 100) * 100) / 100
      : Math.min(Number(promo.discount_value), subtotal);

  return { promo, discount };
}

// ---- Orders ----------------------------------------------------------------

export interface PlaceOrderInput {
  branchId: string;
  paymentMethod: string;
  promoCode: string | null;
  notes: string;
  /** Stable per-cart token so a retried checkout returns the same order. */
  checkoutRequestId: string;
  items: {
    product_variant_id: string;
    quantity: number;
    item_notes?: string;
    customizations: { customization_option_id: string; quantity: number }[];
  }[];
  /** Statutory discount (PWD/Senior) — requires Cash + holder identity. */
  statutory?: "PWD" | "Senior" | null;
  holderName?: string | null;
  idNumber?: string | null;
  /** Optional tip in pesos (default none). */
  tip?: number;
}

/** Read-only server quote — the authoritative breakdown shown before payment. */
export async function quoteOrder(input: {
  branchId: string;
  promoCode: string | null;
  items: PlaceOrderInput["items"];
  tip?: number;
  statutory?: "PWD" | "Senior" | null;
}): Promise<OrderQuote> {
  const { data, error } = await supabase.rpc("quote_order", {
    p_branch_id: input.branchId,
    p_promo_code: input.promoCode,
    p_items: input.items,
    p_tip: input.tip ?? 0,
    p_statutory: input.statutory ?? null,
  });
  if (error) throw error;
  const q = data as Record<string, unknown>;
  const n = (k: string) => Number(q[k] ?? 0);
  return {
    merchandise_subtotal: n("merchandise_subtotal"),
    customization_total: n("customization_total"),
    promo_discount: n("promo_discount"),
    loyalty_reward_discount: n("loyalty_reward_discount"),
    statutory_discount: n("statutory_discount"),
    vat_exempt_amount: n("vat_exempt_amount"),
    vat_amount: n("vat_amount"),
    vat_rate: n("vat_rate"),
    prices_vat_inclusive: Boolean(q.prices_vat_inclusive),
    vat_registered: Boolean(q.vat_registered),
    show_vat_breakdown: Boolean(q.show_vat_breakdown),
    service_fee: n("service_fee"),
    delivery_fee: n("delivery_fee"),
    tip_amount: n("tip_amount"),
    points_eligible_amount: n("points_eligible_amount"),
    points_to_earn: n("points_to_earn"),
    final_total: n("final_total"),
    eta_enabled: Boolean(q.eta_enabled),
    eta_min: q.eta_min != null ? Number(q.eta_min) : null,
    eta_max: q.eta_max != null ? Number(q.eta_max) : null,
  };
}

export interface AppSettings {
  tipping_enabled: boolean;
  vat_rate: number;
  prices_are_vat_inclusive: boolean;
  service_fee_enabled: boolean;
  cancellation_policy: "until_preparing" | "within_n_minutes" | "disabled";
  cancellation_window_minutes: number;
  cancellation_reason_required: boolean;
}

/** Public pricing/config flags (tipping, VAT, cancellation policy …). */
export async function getAppSettings(): Promise<AppSettings> {
  const { data, error } = await supabase
    .from("app_settings")
    .select(
      "tipping_enabled, vat_rate, prices_are_vat_inclusive, service_fee_enabled, cancellation_policy, cancellation_window_minutes, cancellation_reason_required",
    )
    .maybeSingle();
  if (error) throw error;
  return {
    tipping_enabled: data?.tipping_enabled ?? true,
    vat_rate: data?.vat_rate != null ? Number(data.vat_rate) : 0.12,
    prices_are_vat_inclusive: data?.prices_are_vat_inclusive ?? true,
    service_fee_enabled: data?.service_fee_enabled ?? false,
    cancellation_policy: data?.cancellation_policy ?? "until_preparing",
    cancellation_window_minutes: data?.cancellation_window_minutes ?? 0,
    cancellation_reason_required: data?.cancellation_reason_required ?? false,
  };
}

/** Staff/admin: manually set an order's ETA range (minutes). */
export async function setOrderEta(orderId: string, min: number, max: number): Promise<void> {
  const { error } = await supabase.rpc("set_order_eta", {
    p_order_id: orderId,
    p_min: min,
    p_max: max,
  });
  if (error) throw error;
}

export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const { data, error } = await supabase.rpc("place_order", {
    p_branch_id: input.branchId,
    p_payment_method: input.paymentMethod,
    p_promo_code: input.promoCode,
    p_notes: input.notes,
    p_items: input.items,
    p_checkout_request_id: input.checkoutRequestId,
    p_statutory: input.statutory ?? null,
    p_holder_name: input.holderName ?? null,
    p_id_number: input.idNumber ?? null,
    p_tip: input.tip ?? 0,
  });
  if (error) throw error;
  return data as PlaceOrderResult;
}

/** Staff/admin: approve or reject a PWD/Senior ID (reject recomputes totals). */
export async function verifyStatutoryDiscount(
  orderId: string,
  approve: boolean,
  reason = "",
): Promise<void> {
  const { error } = await supabase.rpc("verify_statutory_discount", {
    p_order_id: orderId,
    p_approve: approve,
    p_reason: reason,
  });
  if (error) throw error;
}

const ORDER_SELECT = `
  *,
  branches ( name, address ),
  order_items (
    id, product_name, variant_name, quantity, unit_price, subtotal, item_notes,
    order_item_customization ( id, option_name, quantity, additional_price )
  )
`;

export async function getOrders(): Promise<Order[]> {
  const { data, error } = await supabase
    .from("orders")
    .select("*, branches ( name, address ), order_items ( product_name, quantity )")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Order[];
}

export async function getOrder(orderId: string): Promise<Order | null> {
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_SELECT)
    .eq("id", orderId)
    .single();
  if (error) throw error;
  return (data ?? null) as Order | null;
}

/**
 * Distinct product names from the user's recent orders, newest first (RLS scopes
 * to their own orders). Powers the "Order again" rail.
 */
export async function getRecentProductNames(limit = 12): Promise<string[]> {
  const { data, error } = await supabase
    .from("orders")
    .select("created_at, order_items ( product_name )")
    .order("created_at", { ascending: false })
    .limit(25);
  if (error) throw error;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const o of (data ?? []) as { order_items: { product_name: string }[] }[]) {
    for (const it of o.order_items ?? []) {
      const key = it.product_name.trim().toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(it.product_name);
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}

/** Customer: cancel one's own order while it is still pending (server-enforced). */
export async function cancelMyOrder(orderId: string, reason = ""): Promise<void> {
  const { error } = await supabase.rpc("cancel_my_order", {
    p_order_id: orderId,
    p_reason: reason,
  });
  if (error) throw error;
}

/** Staff/admin: advance an order to the next valid status (server-enforced). */
export async function advanceOrderStatus(orderId: string): Promise<OrderStatus> {
  const { data, error } = await supabase.rpc("advance_order_status", {
    p_order_id: orderId,
  });
  if (error) throw error;
  return (data as { status: OrderStatus }).status;
}

/** Staff/admin: atomically cancel an order (restores stock, reverses points). */
export async function cancelOrder(orderId: string, reason = ""): Promise<void> {
  const { error } = await supabase.rpc("cancel_order", {
    p_order_id: orderId,
    p_reason: reason,
  });
  if (error) throw error;
}

/** Staff/admin: mark a Cash order as paid. */
export async function confirmCashPayment(orderId: string): Promise<void> {
  const { error } = await supabase.rpc("confirm_cash_payment", {
    p_order_id: orderId,
  });
  if (error) throw error;
}

/** Subscribe to status/payment changes for a single order. Returns unsubscribe. */
export function subscribeOrder(orderId: string, onChange: (o: Order) => void) {
  const channel = supabase
    .channel(`order-${orderId}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${orderId}` },
      (payload) => onChange(payload.new as Order),
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

// ---- Rewards & loyalty -----------------------------------------------------

export async function getRewards(): Promise<Reward[]> {
  const { data, error } = await supabase
    .from("rewards")
    .select("*")
    .eq("is_active", true)
    .order("points_cost");
  if (error) throw error;
  return (data ?? []) as Reward[];
}

export async function redeemReward(
  rewardId: string,
): Promise<{ code: string; reward_name: string; points_spent: number }> {
  const { data, error } = await supabase.rpc("redeem_reward", {
    p_reward_id: rewardId,
  });
  if (error) throw error;
  return data as { code: string; reward_name: string; points_spent: number };
}

export async function getLoyaltyTransactions(): Promise<LoyaltyTransaction[]> {
  const { data, error } = await supabase
    .from("loyalty_transactions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as LoyaltyTransaction[];
}

function mapRedemption(r: any): RewardRedemption {
  return {
    id: r.id,
    reward_id: r.reward_id,
    reward_name: r.reward_name,
    points_spent: r.points_spent,
    code: r.code,
    is_used: r.is_used,
    created_at: r.created_at,
    expires_at: r.expires_at ?? null,
    used_at: r.used_at ?? null,
    redemption_channel: r.redemption_channel ?? "app",
    discount_type: r.rewards?.discount_type,
    discount_value: r.rewards?.discount_value != null ? Number(r.rewards.discount_value) : undefined,
  };
}

const REDEMPTION_SELECT = "*, rewards ( discount_type, discount_value )";

export async function getRedemptions(): Promise<RewardRedemption[]> {
  const { data, error } = await supabase
    .from("reward_redemptions")
    .select(REDEMPTION_SELECT)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapRedemption);
}

/** Vouchers the user can apply right now: unused and not expired. */
export async function getAvailableVouchers(): Promise<RewardRedemption[]> {
  const nowISO = new Date().toISOString();
  const { data, error } = await supabase
    .from("reward_redemptions")
    .select(REDEMPTION_SELECT)
    .eq("is_used", false)
    .or(`expires_at.is.null,expires_at.gte.${nowISO}`)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapRedemption);
}

// ---- Profile ---------------------------------------------------------------

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return (data ?? null) as Profile | null;
}

export async function updateProfile(
  _userId: string,
  patch: { first_name: string; last_name: string },
): Promise<void> {
  // Goes through a restricted RPC — direct updates to public.users are blocked
  // so customers cannot change role/points/etc.
  const { error } = await supabase.rpc("update_my_profile", {
    p_first_name: patch.first_name,
    p_last_name: patch.last_name,
  });
  if (error) throw error;
}

// ---- Feedback --------------------------------------------------------------

export async function submitFeedback(
  orderId: string,
  rating: number,
  comment: string,
): Promise<void> {
  // Server validates ownership + that the order is completed.
  const { error } = await supabase.rpc("submit_feedback", {
    p_order_id: orderId,
    p_rating: rating,
    p_comment: comment,
  });
  if (error) throw error;
}

export async function getFeedbackForOrder(
  orderId: string,
): Promise<{ rating: number; comment: string } | null> {
  const { data, error } = await supabase
    .from("feedback")
    .select("rating, comment")
    .eq("order_id", orderId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

// ---- Favorites -------------------------------------------------------------

/** Product ids the current user has favorited (RLS scopes to their own rows). */
export async function getFavoriteIds(): Promise<string[]> {
  const { data, error } = await supabase.from("favorites").select("product_id");
  if (error) throw error;
  return (data ?? []).map((r: { product_id: string }) => r.product_id);
}

/** Favorite a product. user_id defaults to auth.uid(); duplicates are ignored. */
export async function addFavorite(productId: string): Promise<void> {
  const { error } = await supabase.from("favorites").insert({ product_id: productId });
  // 23505 = unique_violation (already favorited) — treat as success.
  if (error && error.code !== "23505") throw error;
}

export async function removeFavorite(productId: string): Promise<void> {
  const { error } = await supabase.from("favorites").delete().eq("product_id", productId);
  if (error) throw error;
}

// ---- Notifications ---------------------------------------------------------

export async function getNotifications(limit = 50): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as AppNotification[];
}

export async function getUnreadNotificationCount(): Promise<number> {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  if (error) throw error;
  return count ?? 0;
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .is("read_at", null);
  if (error) throw error;
}

export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  if (error) throw error;
}

/** Live updates for a user's notifications (insert/update). Returns unsubscribe. */
export function subscribeNotifications(userId: string, onChange: () => void) {
  const channel = supabase
    .channel(`notifications-${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
      () => onChange(),
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("order_updates, promotions, rewards, voucher_expiry, delivery_updates")
    .maybeSingle();
  if (error) throw error;
  return {
    order_updates: data?.order_updates ?? true,
    promotions: data?.promotions ?? true,
    rewards: data?.rewards ?? true,
    voucher_expiry: data?.voucher_expiry ?? true,
    delivery_updates: data?.delivery_updates ?? true,
  };
}

export async function updateNotificationPreferences(
  prefs: NotificationPreferences,
): Promise<void> {
  const uid = (await supabase.auth.getUser()).data.user?.id;
  if (!uid) throw new Error("Not authenticated");
  const { error } = await supabase
    .from("notification_preferences")
    .upsert({ user_id: uid, ...prefs, updated_at: new Date().toISOString() });
  if (error) throw error;
}

// ---- Campaigns -------------------------------------------------------------

/** The top campaign this user is still eligible to see (frequency-aware). */
export async function getActiveCampaign(): Promise<Campaign | null> {
  const { data, error } = await supabase.rpc("get_active_campaign");
  if (error) throw error;
  return (data as Campaign | null) ?? null;
}

/** Record that the modal was shown; returns the impression id for follow-ups. */
export async function recordCampaignView(campaignId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("campaign_impressions")
    .insert({ campaign_id: campaignId })
    .select("id")
    .single();
  if (error) return null; // non-fatal — never block the UI on telemetry
  return data?.id ?? null;
}

export async function recordCampaignAction(
  impressionId: string,
  action: "dismiss" | "click",
): Promise<void> {
  const patch = action === "dismiss" ? { dismissed_at: new Date().toISOString() } : { clicked_at: new Date().toISOString() };
  await supabase.from("campaign_impressions").update(patch).eq("id", impressionId);
}

// Admin campaign management ---------------------------------------------------

export async function getCampaigns(): Promise<Campaign[]> {
  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Campaign[];
}

export type CampaignInput = Partial<Omit<Campaign, "id" | "created_at">> & { id?: string };

export async function upsertCampaign(input: CampaignInput): Promise<void> {
  const { error } = await supabase.from("campaigns").upsert(input);
  if (error) throw error;
}

export async function deleteCampaign(id: string): Promise<void> {
  const { error } = await supabase.from("campaigns").delete().eq("id", id);
  if (error) throw error;
}

// ============================================================================
// STAFF + ADMIN
// ============================================================================

const ACTIVE_STATUSES: OrderStatus[] = ["pending", "preparing", "ready"];

/** FIFO list of active orders (optionally for one branch). Oldest first. */
export async function getActiveOrders(branchId?: string | null): Promise<Order[]> {
  let q = supabase
    .from("orders")
    .select(ORDER_SELECT)
    .in("status", ACTIVE_STATUSES)
    .order("created_at", { ascending: true });
  if (branchId) q = q.eq("branch_id", branchId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Order[];
}

/** Completed/cancelled orders (most recent first). */
export async function getFinishedOrders(
  branchId?: string | null,
  limit = 40,
): Promise<Order[]> {
  let q = supabase
    .from("orders")
    .select(ORDER_SELECT)
    .in("status", ["completed", "cancelled"])
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (branchId) q = q.eq("branch_id", branchId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Order[];
}

/** Subscribe to ANY order change (staff queue). Returns unsubscribe. */
export function subscribeAllOrders(onChange: () => void) {
  const channel = supabase
    .channel("orders-all")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "orders" },
      () => onChange(),
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

// ---- Reports ---------------------------------------------------------------

export interface ReportOrder {
  id: string;
  total_amount: number;
  status: OrderStatus;
  payment_status: PaymentStatus;
  created_at: string;
  branch_id: string;
  order_items: { product_name: string; quantity: number; subtotal: number }[];
}

export async function getOrdersSince(fromISO: string): Promise<ReportOrder[]> {
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, total_amount, status, payment_status, created_at, branch_id, order_items ( product_name, quantity, subtotal )",
    )
    .gte("created_at", fromISO)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as ReportOrder[];
}

export interface CancellationRow {
  id: string;
  order_number: string | null;
  created_at: string;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  cancelled_by: string | null;
  user_id: string;
  refund_status: "none" | "refund_pending" | "refunded" | "partially_refunded";
  refunded_amount: number;
  total_amount: number;
  branch_id: string;
  payment_method: string;
  branches?: { name: string } | null;
}

/** Cancelled orders placed since the given time (admin reporting). */
export async function getCancellationsSince(fromISO: string): Promise<CancellationRow[]> {
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, created_at, cancelled_at, cancellation_reason, cancelled_by, user_id, refund_status, refunded_amount, total_amount, branch_id, payment_method, branches ( name )",
    )
    .eq("status", "cancelled")
    .gte("created_at", fromISO)
    .order("cancelled_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as CancellationRow[];
}

export interface FeedbackRow {
  id: string;
  rating: number;
  comment: string;
  created_at: string;
}

export async function getFeedbackList(limit = 20): Promise<FeedbackRow[]> {
  const { data, error } = await supabase
    .from("feedback")
    .select("id, rating, comment, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as FeedbackRow[];
}

// ---- Inventory -------------------------------------------------------------

export interface InventoryRow {
  id: string;
  stock_quantity: number;
  low_stock_threshold: number;
  is_available: boolean;
  product_variant_id: string;
  variant_name: string;
  product_name: string;
  price: number;
}

export async function getInventory(branchId: string): Promise<InventoryRow[]> {
  const { data, error } = await supabase
    .from("branch_inventory")
    .select(
      "id, stock_quantity, low_stock_threshold, is_available, product_variant_id, product_variants ( name, price, products ( name ) )",
    )
    .eq("branch_id", branchId);
  if (error) throw error;
  return (data ?? [])
    .map((r: any) => ({
      id: r.id,
      stock_quantity: r.stock_quantity,
      low_stock_threshold: r.low_stock_threshold,
      is_available: r.is_available,
      product_variant_id: r.product_variant_id,
      variant_name: r.product_variants?.name ?? "",
      product_name: r.product_variants?.products?.name ?? "",
      price: Number(r.product_variants?.price ?? 0),
    }))
    .sort(
      (a: InventoryRow, b: InventoryRow) =>
        a.product_name.localeCompare(b.product_name) ||
        a.price - b.price,
    );
}

export async function updateStock(
  id: string,
  stock_quantity: number,
  is_available: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("branch_inventory")
    .update({ stock_quantity, is_available, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

// ---- Menu CRUD -------------------------------------------------------------

export interface AdminProduct extends Product {
  category_name: string;
  variants: Variant[];
}

export async function getCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from("product_categories")
    .select("*")
    .order("display_order");
  if (error) throw error;
  return (data ?? []) as Category[];
}

export async function getAdminProducts(): Promise<AdminProduct[]> {
  const { data, error } = await supabase
    .from("products")
    .select(
      "id, category_id, name, description, image_url, is_available, is_featured, product_categories ( name ), product_variants ( id, product_id, name, price, is_default, is_available, deleted_at )",
    )
    .is("deleted_at", null)
    .order("name");
  if (error) throw error;
  return (data ?? []).map((p: any) => ({
    id: p.id,
    category_id: p.category_id,
    name: p.name,
    description: p.description,
    image_url: p.image_url,
    is_available: p.is_available,
    is_featured: p.is_featured,
    category_name: p.product_categories?.name ?? "Other",
    variants: (p.product_variants ?? [])
      .filter((v: any) => v.deleted_at == null)
      .map((v: any) => ({
        id: v.id,
        product_id: v.product_id,
        name: v.name,
        price: Number(v.price),
        is_default: v.is_default,
        is_available: v.is_available,
      }))
      .sort((a: Variant, b: Variant) => a.price - b.price),
  }));
}

export interface NewProductInput {
  name: string;
  description: string;
  category_id: string | null;
  is_featured: boolean;
  is_available: boolean;
  variant_name: string;
  variant_price: number;
}

/** Create a product plus its first (default) variant. Returns the product id. */
export async function createProduct(input: NewProductInput): Promise<string> {
  const { data, error } = await supabase
    .from("products")
    .insert({
      name: input.name,
      description: input.description,
      category_id: input.category_id,
      is_featured: input.is_featured,
      is_available: input.is_available,
    })
    .select("id")
    .single();
  if (error) throw error;
  const productId = data.id as string;
  const { error: vErr } = await supabase.from("product_variants").insert({
    product_id: productId,
    name: input.variant_name,
    price: input.variant_price,
    is_default: true,
    is_available: true,
  });
  if (vErr) throw vErr;
  return productId;
}

export async function updateProduct(
  id: string,
  patch: Partial<
    Pick<Product, "name" | "description" | "is_available" | "is_featured" | "category_id">
  >,
): Promise<void> {
  const { error } = await supabase.from("products").update(patch).eq("id", id);
  if (error) throw error;
}

export async function softDeleteProduct(id: string): Promise<void> {
  const { error } = await supabase
    .from("products")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function updateVariant(
  id: string,
  patch: Partial<Pick<Variant, "name" | "price" | "is_available">>,
): Promise<void> {
  const { error } = await supabase.from("product_variants").update(patch).eq("id", id);
  if (error) throw error;
}

export async function createVariant(
  productId: string,
  name: string,
  price: number,
): Promise<void> {
  const { error } = await supabase.from("product_variants").insert({
    product_id: productId,
    name,
    price,
    is_default: false,
    is_available: true,
  });
  if (error) throw error;
}

export async function deleteVariant(id: string): Promise<void> {
  const { error } = await supabase
    .from("product_variants")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

// ---- Users -----------------------------------------------------------------

export async function getAllUsers(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Profile[];
}

export async function setUserRole(userId: string, role: UserRole): Promise<void> {
  const { error } = await supabase.rpc("set_user_role", {
    p_user_id: userId,
    p_role: role,
  });
  if (error) throw error;
}

// ---- Admin settings --------------------------------------------------------

export async function getAdminSettings(): Promise<AdminSettings> {
  const { data, error } = await supabase.from("app_settings").select("*").maybeSingle();
  if (error) throw error;
  const d = (data ?? {}) as Record<string, unknown>;
  const num = (k: string, def: number) => (d[k] != null ? Number(d[k]) : def);
  const bool = (k: string, def: boolean) => (d[k] != null ? Boolean(d[k]) : def);
  return {
    business_is_vat_registered: bool("business_is_vat_registered", true),
    vat_rate: num("vat_rate", 0.12),
    prices_are_vat_inclusive: bool("prices_are_vat_inclusive", true),
    show_vat_breakdown: bool("show_vat_breakdown", true),
    service_fee_enabled: bool("service_fee_enabled", false),
    service_fee_type: (d.service_fee_type as "fixed" | "percentage") ?? "fixed",
    service_fee_value: num("service_fee_value", 0),
    service_fee_min_order: num("service_fee_min_order", 0),
    service_fee_max: d.service_fee_max != null ? Number(d.service_fee_max) : null,
    service_fee_applies_pickup: bool("service_fee_applies_pickup", true),
    service_fee_taxable: bool("service_fee_taxable", false),
    tipping_enabled: bool("tipping_enabled", true),
    loyalty_points_per_peso: num("loyalty_points_per_peso", 1),
    cancellation_policy:
      (d.cancellation_policy as AdminSettings["cancellation_policy"]) ?? "until_preparing",
    cancellation_window_minutes: num("cancellation_window_minutes", 0),
    cancellation_reason_required: bool("cancellation_reason_required", false),
  };
}

export async function updateAppSettings(patch: Partial<AdminSettings>): Promise<void> {
  const { error } = await supabase.rpc("update_app_settings", { p_patch: patch });
  if (error) throw error;
}

export async function getSettingsAudit(limit = 20): Promise<SettingsAuditRow[]> {
  const { data, error } = await supabase
    .from("app_settings_audit")
    .select("id, setting, old_value, new_value, changed_at")
    .order("changed_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as SettingsAuditRow[];
}

export async function updateBranchEta(
  branchId: string,
  patch: {
    eta_enabled?: boolean;
    base_prep_minutes?: number;
    avg_minutes_per_item?: number;
    active_staff_capacity?: number;
    max_eta_minutes?: number;
  },
): Promise<void> {
  const { error } = await supabase.rpc("update_branch_eta", {
    p_branch_id: branchId,
    p_patch: patch,
  });
  if (error) throw error;
}

/** All branches incl. ETA config (admin). */
export async function getBranchesAdmin(): Promise<Branch[]> {
  const { data, error } = await supabase.from("branches").select("*").order("name");
  if (error) throw error;
  return (data ?? []) as Branch[];
}
