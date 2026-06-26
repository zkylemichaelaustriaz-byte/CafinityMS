// Domain models mirroring the Supabase schema (see supabase/schema.sql).

export type UserRole = "customer" | "staff" | "admin";
export type OrderStatus =
  | "pending"
  | "preparing"
  | "ready"
  | "completed"
  | "cancelled";
export type PaymentStatus = "pending" | "paid" | "failed";
export type DiscountType = "fixed" | "percent";
export type SelectionType = "single" | "multiple";
export type LoyaltyTxnType = "earn" | "redeem" | "bonus" | "adjust";

export interface Profile {
  id: string;
  role: UserRole;
  first_name: string;
  last_name: string;
  email: string;
  avatar_url: string | null;
  loyalty_points: number;
  current_streak: number;
  last_order_date: string | null;
  branch_id: string | null;
  branch_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface Branch {
  id: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  opening_time: string;
  closing_time: string;
  is_active: boolean;
  created_at: string;
  // ETA configuration (phase 9 / editable in Admin Settings)
  eta_enabled?: boolean;
  base_prep_minutes?: number;
  avg_minutes_per_item?: number;
  active_staff_capacity?: number;
  max_eta_minutes?: number;
}

/** Full editable global configuration (Admin Settings). */
export interface AdminSettings {
  business_is_vat_registered: boolean;
  vat_rate: number;
  prices_are_vat_inclusive: boolean;
  show_vat_breakdown: boolean;
  service_fee_enabled: boolean;
  service_fee_type: "fixed" | "percentage";
  service_fee_value: number;
  service_fee_min_order: number;
  service_fee_max: number | null;
  service_fee_applies_pickup: boolean;
  service_fee_taxable: boolean;
  tipping_enabled: boolean;
  loyalty_points_per_peso: number;
  cancellation_policy: "until_preparing" | "within_n_minutes" | "disabled";
  cancellation_window_minutes: number;
  cancellation_reason_required: boolean;
}

export interface SettingsAuditRow {
  id: string;
  setting: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
}

/** A branch decorated with the distance from the user's current position. */
export interface BranchWithDistance extends Branch {
  distanceKm: number | null;
}

export interface Category {
  id: string;
  name: string;
  display_order: number;
}

export interface Variant {
  id: string;
  product_id: string;
  name: string;
  price: number;
  is_default: boolean;
  is_available: boolean;
}

export interface CustomizationOption {
  id: string;
  group_id: string;
  name: string;
  additional_price: number;
  is_default: boolean;
  display_order: number;
}

export interface CustomizationGroup {
  id: string;
  name: string;
  selection_type: SelectionType;
  options: CustomizationOption[];
}

export interface Product {
  id: string;
  category_id: string | null;
  name: string;
  description: string;
  image_url: string | null;
  is_available: boolean;
  is_featured: boolean;
}

/** Product enriched with variants, customization groups and branch stock. */
export interface MenuProduct extends Product {
  category_name: string;
  variants: Variant[];
  groups: CustomizationGroup[];
  /** False when every variant is out of stock at the selected branch. */
  inStock: boolean;
  /** Added to the catalogue within the last 30 days. */
  isNew: boolean;
  /** In stock, but the available stock at this branch is running low. */
  lowStock: boolean;
  /** Seasonal collection this product belongs to (matches a campaign preset_key). */
  collection_key?: string | null;
  /** True for limited-time products gated by the active seasonal campaign. */
  is_seasonal: boolean;
  /** False when a seasonal product is hidden because its campaign isn't active. */
  orderable: boolean;
  /** Remote per-presentation images (admin-uploaded). Default falls back to image_url. */
  media?: { default?: string; hot?: string; iced?: string };
}

export interface Promotion {
  id: string;
  code: string;
  description: string;
  discount_type: DiscountType;
  discount_value: number;
  min_order_amount: number;
  usage_limit: number | null;
  usage_count: number;
  starts_at: string;
  ends_at: string | null;
  is_active: boolean;
}

export type CampaignFrequency = "once" | "once_per_day" | "always";

export interface Campaign {
  id: string;
  title: string;
  subtitle: string;
  product_id: string | null;
  hero_image_url: string | null;
  dark_hero_image_url: string | null;
  badge: string | null;
  cta_label: string;
  starts_at: string | null;
  ends_at: string | null;
  priority: number;
  frequency_rule: CampaignFrequency;
  is_active: boolean;
  preset_key: string | null;
  created_at: string;
}

export interface Reward {
  id: string;
  name: string;
  description: string;
  points_cost: number;
  discount_type: DiscountType;
  discount_value: number;
  image_url: string | null;
  is_active: boolean;
}

export interface RewardRedemption {
  id: string;
  reward_id: string;
  reward_name: string;
  points_spent: number;
  code: string;
  is_used: boolean;
  created_at: string;
  expires_at?: string | null;
  used_at?: string | null;
  redemption_channel?: string;
  /** Joined from rewards — the discount this voucher applies. */
  discount_type?: DiscountType;
  discount_value?: number;
}

export interface LoyaltyTransaction {
  id: string;
  order_id: string | null;
  points: number;
  type: LoyaltyTxnType;
  description: string;
  created_at: string;
}

export interface OrderItemCustomization {
  id: string;
  option_name: string;
  quantity: number;
  additional_price: number;
}

export interface OrderItem {
  id: string;
  product_name: string;
  variant_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  item_notes: string;
  presentation_key?: "default" | "hot" | "iced" | null;
  order_item_customization: OrderItemCustomization[];
}

export interface Order {
  id: string;
  user_id: string;
  branch_id: string;
  order_number: string | null;
  /** Short per-branch, per-day pickup number (e.g. 42 → "#042"). Null for legacy. */
  display_queue_number?: number | null;
  business_date?: string | null;
  status: OrderStatus;
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  promo_code: string | null;
  payment_status: PaymentStatus;
  payment_method: string;
  paid_at: string | null;
  notes: string;
  points_earned: number;
  /** Lifecycle of points_earned: pending until completed, then earned (or reversed). */
  points_state?: "pending" | "earned" | "reversed";
  // Pricing snapshot (phase 7). subtotal = merchandise; total_amount = final.
  customization_total?: number;
  promo_discount?: number;
  loyalty_reward_discount?: number;
  statutory_discount?: number;
  vat_exempt_amount?: number;
  vat_amount?: number;
  service_fee?: number;
  delivery_fee?: number;
  tip_amount?: number;
  points_eligible_amount?: number;
  vat_rate_snapshot?: number;
  prices_vat_inclusive_snapshot?: boolean;
  // Statutory (PWD/Senior) discount + verification (phase 8)
  statutory_discount_type?: "PWD" | "Senior" | null;
  discount_verification?:
    | "not_requested"
    | "pending_verification"
    | "verified"
    | "rejected"
    | "expired";
  discount_holder_name?: string | null;
  discount_masked_id?: string | null;
  discount_rejection_reason?: string | null;
  // Estimated prep time snapshot (phase 9)
  estimated_min_minutes?: number | null;
  estimated_max_minutes?: number | null;
  estimated_ready_at?: string | null;
  eta_calculated_at?: string | null;
  // Cancellation + refund (phase 10)
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  refund_status?: "none" | "refund_pending" | "refunded" | "partially_refunded";
  refunded_amount?: number;
  refunded_at?: string | null;
  created_at: string;
  updated_at: string;
  branches?: Pick<Branch, "name" | "address"> | null;
  order_items?: OrderItem[];
}

/** Server-authoritative itemized quote (quote_order RPC). */
export interface OrderQuote {
  merchandise_subtotal: number;
  customization_total: number;
  promo_discount: number;
  loyalty_reward_discount: number;
  statutory_discount: number;
  vat_exempt_amount: number;
  vat_amount: number;
  vat_rate: number;
  prices_vat_inclusive: boolean;
  vat_registered: boolean;
  show_vat_breakdown: boolean;
  service_fee: number;
  delivery_fee: number;
  tip_amount: number;
  points_eligible_amount: number;
  points_to_earn: number;
  final_total: number;
  eta_enabled: boolean;
  eta_min: number | null;
  eta_max: number | null;
}

// ---- Notifications ---------------------------------------------------------

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface NotificationPreferences {
  order_updates: boolean;
  promotions: boolean;
  rewards: boolean;
  voucher_expiry: boolean;
  delivery_updates: boolean;
}

// ---- Cart (client-side, persisted) ----------------------------------------

export interface CartSelectedOption {
  optionId: string;
  groupId: string;
  groupName: string;
  optionName: string;
  additionalPrice: number;
  quantity: number;
}

export interface CartLine {
  /** Local unique id for this configured line. */
  lineId: string;
  productId: string;
  productName: string;
  imageUrl: string | null;
  variantId: string;
  variantName: string;
  basePrice: number;
  quantity: number;
  selectedOptions: CartSelectedOption[];
  notes: string;
  /** Seasonal collection of the product (for active-campaign cart validation). */
  collectionKey?: string | null;
  /** True if the product is a limited-time seasonal item. */
  isSeasonal?: boolean;
  /** Presentation snapshot (default/hot/iced) from the chosen Temperature. */
  presentationKey?: "default" | "hot" | "iced";
}

/** Result returned by the place_order RPC. */
export interface PlaceOrderResult {
  order_id: string;
  order_number: string;
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  points_earned: number;
  current_streak: number;
}
