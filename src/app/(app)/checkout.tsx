import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Button } from "@/components/ui/Button";
import { Header } from "@/components/ui/Header";
import { PriceText } from "@/components/ui/PriceText";
import { ProductImage } from "@/components/ui/ProductImage";
import { QuantityStepper } from "@/components/ui/QuantityStepper";
import { Screen } from "@/components/ui/Screen";
import { StickyActionBar } from "@/components/ui/StickyActionBar";
import { useKeyboardAwareScroll } from "@/components/ui/KeyboardAwareScrollView";
import { Colors } from "@/constants/theme";
import { useKeyboardVisible } from "@/hooks/useKeyboardVisible";
import { getAppSettings, getAvailableVouchers, placeOrder, previewPromo, quoteOrder } from "@/lib/api";
import { isOnline, useNetwork } from "@/store/network";
import { getEmptyStateImage } from "@/lib/emptyStateImages";
import { classifyError, humanizeError } from "@/lib/errors";
import { formatDateTime, formatEta, lineTotal, peso } from "@/lib/format";
import { resolveProductImage } from "@/lib/productMedia";
import { useAuth } from "@/store/auth";
import { useBranch } from "@/store/branch";
import { cartSubtotal, useCart } from "@/store/cart";
import { useSeasonalTheme } from "@/store/seasonalTheme";
import type { CartLine, OrderQuote, RewardRedemption } from "@/types/models";

/** Client-side preview of a voucher's discount (server re-validates). */
function voucherDiscount(v: RewardRedemption, subtotal: number): number {
  if (v.discount_type === "percent") {
    return Math.round(((subtotal * (v.discount_value ?? 0)) / 100) * 100) / 100;
  }
  return Math.min(v.discount_value ?? 0, subtotal);
}

type Method = "GCash" | "Cash";

export default function CheckoutScreen() {
  const router = useRouter();
  const branch = useBranch((s) => s.branch);
  const lines = useCart((s) => s.lines);
  const activeSeasonalKey = useSeasonalTheme((s) => s.activeKey);
  const cartBranchId = useCart((s) => s.branchId);
  const ensureCheckoutId = useCart((s) => s.ensureCheckoutId);
  const clearCart = useCart((s) => s.clear);
  const removeLine = useCart((s) => s.removeLine);
  const updateQuantity = useCart((s) => s.updateQuantity);
  const refreshProfile = useAuth((s) => s.refreshProfile);

  const [method, setMethod] = useState<Method>("GCash");
  const [gcashBalance, setGcashBalance] = useState("1000");
  const [promoInput, setPromoInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; discount: number } | null>(null);
  const [promoBusy, setPromoBusy] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [vouchers, setVouchers] = useState<RewardRedemption[]>([]);
  const [voucher, setVoucher] = useState<RewardRedemption | null>(null);
  const [statutory, setStatutory] = useState<"PWD" | "Senior" | null>(null);
  const [holderName, setHolderName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [tippingEnabled, setTippingEnabled] = useState(false);
  const [tipMode, setTipMode] = useState<"none" | "p5" | "p10" | "p15" | "custom">("none");
  const [customTip, setCustomTip] = useState("");
  const [notes, setNotes] = useState("");
  const [placing, setPlacing] = useState(false);
  // Network-uncertain state: the order MAY have been created. Retrying is safe
  // (idempotent via checkout_request_id), so we offer "check status" not "pay again".
  const [verifying, setVerifying] = useState(false);
  const online = useNetwork((s) => s.online);
  const [error, setError] = useState<string | null>(null);
  const keyboardVisible = useKeyboardVisible();
  const { scrollRef, handleFocus } = useKeyboardAwareScroll();

  const [quote, setQuote] = useState<OrderQuote | null>(null);

  const subtotal = cartSubtotal(lines);
  const clientDiscount = appliedPromo
    ? appliedPromo.discount
    : voucher
      ? voucherDiscount(voucher, subtotal)
      : 0;
  // One benefit per order — the single code sent to the server.
  const appliedCode = appliedPromo?.code ?? voucher?.code ?? null;

  // Server quote is the source of truth; client values are a fallback estimate.
  const promoRewardDiscount = quote
    ? quote.promo_discount + quote.loyalty_reward_discount
    : clientDiscount;
  const statutoryDiscount = quote?.statutory_discount ?? 0;
  const vatExempt = quote?.vat_exempt_amount ?? 0;
  const serviceFee = quote?.service_fee ?? 0;
  const vatAmount = quote?.vat_amount ?? 0;
  const showVat = !!quote?.show_vat_breakdown && vatAmount > 0;

  // Tip base = discounted merchandise (excludes fees/tip), independent of the tip itself.
  const merchBase = quote?.points_eligible_amount ?? Math.max(0, subtotal - clientDiscount);
  const tipAmount = useMemo(() => {
    if (!tippingEnabled || tipMode === "none") return 0;
    if (tipMode === "custom") return Math.max(0, Math.min(Number(customTip) || 0, 100000));
    const pct = tipMode === "p5" ? 0.05 : tipMode === "p10" ? 0.1 : 0.15;
    return Math.round(merchBase * pct * 100) / 100;
  }, [tippingEnabled, tipMode, customTip, merchBase]);

  const total = quote ? quote.final_total : Math.max(0, subtotal - clientDiscount) + tipAmount;
  const pointsToEarn = quote ? quote.points_to_earn : Math.floor(Math.max(0, subtotal - clientDiscount));
  const etaLabel = quote?.eta_enabled ? formatEta(quote.eta_min, quote.eta_max) : null;

  useEffect(() => {
    getAvailableVouchers().then(setVouchers).catch(() => setVouchers([]));
    getAppSettings()
      .then((s) => setTippingEnabled(s.tipping_enabled))
      .catch(() => setTippingEnabled(false));
  }, []);

  // Fetch the authoritative quote whenever the cart or applied benefit changes.
  useEffect(() => {
    if (!branch || lines.length === 0) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    const items = lines.map((l) => ({
      product_variant_id: l.variantId,
      quantity: l.quantity,
      item_notes: l.notes,
      customizations: l.selectedOptions.map((o) => ({
        customization_option_id: o.optionId,
        quantity: o.quantity,
      })),
    }));
    quoteOrder({
      branchId: branch.id,
      promoCode: statutory ? null : appliedCode,
      items,
      statutory,
      tip: tipAmount,
    })
      .then((q) => {
        if (!cancelled) setQuote(q);
      })
      .catch(() => {
        if (!cancelled) setQuote(null);
      });
    return () => {
      cancelled = true;
    };
  }, [branch, lines, appliedCode, statutory, tipAmount]);

  async function applyPromo() {
    setPromoError(null);
    if (!promoInput.trim()) return;
    setPromoBusy(true);
    try {
      const { promo, discount } = await previewPromo(promoInput, subtotal);
      setAppliedPromo({ code: promo.code, discount });
      setVoucher(null); // one benefit per order
      setStatutory(null);
    } catch (e) {
      setAppliedPromo(null);
      setPromoError(humanizeError(e, "Invalid promo code."));
    } finally {
      setPromoBusy(false);
    }
  }

  function selectVoucher(v: RewardRedemption) {
    if (voucher?.id === v.id) {
      setVoucher(null);
      return;
    }
    setVoucher(v);
    // one benefit per order — drop any promo / statutory
    setAppliedPromo(null);
    setPromoInput("");
    setPromoError(null);
    setStatutory(null);
  }

  function selectStatutory(type: "PWD" | "Senior") {
    if (statutory === type) {
      setStatutory(null);
      return;
    }
    setStatutory(type);
    // Statutory discounts are Cash-only and cannot stack with promo/voucher.
    setAppliedPromo(null);
    setPromoInput("");
    setPromoError(null);
    setVoucher(null);
    setMethod("Cash");
  }

  async function onPlaceOrder() {
    setError(null);
    if (!branch || lines.length === 0) return;

    if (!isOnline()) {
      setError("You're offline. Connect to the internet to place your order — your cart is saved.");
      return;
    }

    if (cartBranchId && cartBranchId !== branch.id) {
      setError(
        "Your cart was started at a different branch. Go back to the cart and review it before checking out.",
      );
      return;
    }

    if (lines.some((l) => l.isSeasonal && l.collectionKey !== activeSeasonalKey)) {
      setError(
        "A seasonal item in your cart is no longer available under the current campaign. Go back to the cart and remove it to continue.",
      );
      return;
    }

    if (statutory) {
      if (method !== "Cash") {
        setError("PWD/Senior discounts are Cash-only. Switch payment to Cash.");
        return;
      }
      if (!holderName.trim() || !idNumber.trim()) {
        setError("Enter the cardholder name and ID number for the PWD/Senior discount.");
        return;
      }
    }

    if (method === "GCash") {
      const balance = Number(gcashBalance) || 0;
      if (balance < total) {
        setError(
          `Transaction Failed — your GCash balance (${peso(balance)}) is less than the total (${peso(total)}). Your cart was kept.`,
        );
        return;
      }
    }

    setVerifying(false);
    setPlacing(true);
    try {
      const result = await placeOrder({
        branchId: branch.id,
        paymentMethod: method,
        promoCode: statutory ? null : appliedCode,
        notes: notes.trim(),
        checkoutRequestId: ensureCheckoutId(),
        items: lines.map((l) => ({
          product_variant_id: l.variantId,
          quantity: l.quantity,
          item_notes: l.notes,
          customizations: l.selectedOptions.map((o) => ({
            customization_option_id: o.optionId,
            quantity: o.quantity,
          })),
        })),
        statutory,
        holderName: statutory ? holderName.trim() : null,
        idNumber: statutory ? idNumber.trim() : null,
        tip: tipAmount,
      });
      setVerifying(false);
      clearCart();
      void refreshProfile();
      router.replace(`/order/${result.order_id}?new=1`);
    } catch (e) {
      const kind = classifyError(e);
      if (kind === "offline" || kind === "timeout") {
        // Uncertain: the order may have been created. Enter verify mode instead
        // of telling the user it failed (retry is idempotent).
        setVerifying(true);
      } else {
        setError(humanizeError(e, "Could not place your order. Please try again."));
      }
    } finally {
      setPlacing(false);
    }
  }

  if (lines.length === 0) {
    return (
      <Screen edges={["top", "bottom"]}>
        <Header title="Checkout" />
        <View className="flex-1 items-center justify-center px-8">
          <Text style={{ fontSize: 34 }}>🛒</Text>
          <Text className="mt-2 text-center text-base font-bold text-textPrimary">
            Your cart is empty
          </Text>
          <Text className="mt-1 text-center text-sm text-textSecondary">
            Add a drink before checking out.
          </Text>
          <View className="mt-4">
            <Button label="Browse menu" onPress={() => router.replace("/menu")} />
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={["top"]}>
      <Header title="Checkout" />

      <ScrollView
        ref={scrollRef}
        contentContainerClassName="p-5 pb-10"
        style={{ marginBottom: keyboardVisible ? 0 : 196 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
      >
        {/* Pickup */}
        {branch ? (
          <View className="mb-5 flex-row items-center rounded-card border border-line bg-surface p-4">
            <View className="h-10 w-10 items-center justify-center rounded-full bg-accent-100">
              <Ionicons name="location" size={18} color={Colors.brand} />
            </View>
            <View className="ml-3 flex-1">
              <Text className="text-[11px] font-medium uppercase tracking-wide text-textMuted">
                Pickup at
              </Text>
              <Text className="text-sm font-bold text-textPrimary">{branch.name}</Text>
              {etaLabel ? (
                <Text className="mt-0.5 text-xs font-semibold text-brandPrimary">
                  Ready in {etaLabel} after it&apos;s started
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* Order summary */}
        <View className="mb-2 flex-row items-center justify-between">
          <Text className="font-heading text-base text-textPrimary">Order summary</Text>
          <Text className="text-xs text-textMuted">Tap an item to review</Text>
        </View>
        <View className="rounded-card border border-line bg-surface px-4">
          {lines.map((l, i) => (
            <CheckoutLine
              key={l.lineId}
              line={l}
              last={i === lines.length - 1}
              onEdit={() => router.push(`/product/${l.productId}?edit=${l.lineId}`)}
              onRemove={() => removeLine(l.lineId)}
              onQty={(q) => updateQuantity(l.lineId, q)}
            />
          ))}
        </View>

        {/* Statutory discount (PWD / Senior) */}
        <View className="mb-2 mt-6 flex-row items-center justify-between">
          <Text className="font-heading text-base text-textPrimary">PWD / Senior discount</Text>
          <Text className="text-xs text-textMuted">Cash only</Text>
        </View>
        <View className="flex-row gap-2">
          {(["PWD", "Senior"] as const).map((t) => {
            const active = statutory === t;
            return (
              <Pressable
                key={t}
                onPress={() => selectStatutory(t)}
                className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-card border p-3 ${
                  active ? "border-brandPrimary bg-accent-100" : "border-line bg-surface"
                }`}
              >
                <Ionicons
                  name={active ? "checkmark-circle" : "ellipse-outline"}
                  size={18}
                  color={active ? Colors.brand : "#C9A47C"}
                />
                <Text
                  className={`text-sm font-bold ${active ? "text-brandPrimary" : "text-textSecondary"}`}
                >
                  {t === "PWD" ? "PWD" : "Senior Citizen"}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {statutory ? (
          <View className="mt-2 rounded-card border border-line bg-surface p-3">
            <Text className="mb-2 text-xs text-textMuted">
              20% discount + VAT exemption for the cardholder&apos;s personal consumption. Staff
              verify your ID at the counter before payment.
            </Text>
            <TextInput
              value={holderName}
              onChangeText={setHolderName}
              placeholder="Cardholder full name"
              placeholderTextColor={Colors.textMuted}
              className="mb-2 rounded-2xl border border-line bg-background px-4 py-3 text-base text-textPrimary"
            />
            <TextInput
              value={idNumber}
              onChangeText={setIdNumber}
              placeholder="PWD / Senior ID number"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="characters"
              className="rounded-2xl border border-line bg-background px-4 py-3 text-base text-textPrimary"
            />
            <Text className="mt-1.5 text-[11px] text-textMuted">
              Only a masked ID (last 4 digits) is stored. Cannot be combined with a promo or
              voucher.
            </Text>
          </View>
        ) : null}

        {/* Loyalty vouchers */}
        <View className="mb-2 mt-6 flex-row items-center justify-between">
          <Text className="font-heading text-base text-textPrimary">Rewards &amp; vouchers</Text>
          <Text className="text-xs text-textMuted">One reward or promo per order</Text>
        </View>
        {vouchers.length === 0 ? (
          <View className="items-center rounded-card border border-dashed border-line bg-surface p-4">
            <Image
              source={getEmptyStateImage("vouchers")}
              style={{ width: 64, height: 64 }}
              contentFit="contain"
              accessibilityLabel="No vouchers"
            />
            <Text className="mt-2 text-center text-sm text-textSecondary">
              No vouchers yet. Redeem points in Rewards to unlock them.
            </Text>
          </View>
        ) : (
          <View className="gap-2">
            {vouchers.map((v) => {
              const active = voucher?.id === v.id;
              const value =
                v.discount_type === "percent"
                  ? `${v.discount_value ?? 0}% off`
                  : `−${peso(v.discount_value ?? 0)}`;
              return (
                <Pressable
                  key={v.id}
                  onPress={() => selectVoucher(v)}
                  className={`flex-row items-center rounded-card border p-3.5 ${
                    active ? "border-brandPrimary bg-accent-100" : "border-line bg-surface"
                  }`}
                >
                  <View className="h-10 w-10 items-center justify-center rounded-full bg-accent-100">
                    <Ionicons name="ticket-outline" size={20} color={Colors.brand} />
                  </View>
                  <View className="ml-3 flex-1">
                    <Text className="text-sm font-bold text-textPrimary">{v.reward_name}</Text>
                    <Text className="text-xs text-textMuted">
                      Use at checkout
                      {v.expires_at ? ` · expires ${formatDateTime(v.expires_at)}` : ""}
                    </Text>
                  </View>
                  <Text className="mr-2 font-display text-sm text-brandPrimary">{value}</Text>
                  <Ionicons
                    name={active ? "radio-button-on" : "radio-button-off"}
                    size={20}
                    color={active ? Colors.brand : "#C9A47C"}
                  />
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Promo */}
        <Text className="mb-2 mt-6 font-heading text-base text-textPrimary">Promo code</Text>
        <View className="flex-row gap-2">
          <View className="flex-1 flex-row items-center rounded-2xl border border-line bg-surface px-3">
            <Ionicons name="pricetag-outline" size={18} color="#B8A99C" />
            <TextInput
              value={promoInput}
              onChangeText={(t) => setPromoInput(t.toUpperCase())}
              placeholder="e.g. WELCOME10"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="characters"
              className="flex-1 px-2 py-3 text-base text-textPrimary"
            />
          </View>
          <Button
            label={appliedPromo ? "Applied" : "Apply"}
            variant="outline"
            loading={promoBusy}
            onPress={applyPromo}
            className="px-5"
          />
        </View>
        {promoError ? (
          <Text className="mt-1.5 text-xs text-danger">{promoError}</Text>
        ) : null}
        {appliedPromo ? (
          <View className="mt-2 flex-row items-center justify-between rounded-xl bg-successSoft px-3 py-2">
            <Text className="text-sm font-semibold text-success">{appliedPromo.code} applied</Text>
            <Pressable
              onPress={() => {
                setAppliedPromo(null);
                setPromoInput("");
              }}
            >
              <Text className="text-xs font-semibold text-success">Remove</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Payment method */}
        <Text className="mb-2 mt-6 font-heading text-base text-textPrimary">Payment method</Text>
        <View className="gap-2">
          <PaymentOption
            label="GCash"
            sub={
              statutory
                ? "Unavailable — PWD/Senior discounts are Cash-only"
                : "Pay now with your e-wallet (simulated)"
            }
            icon="wallet-outline"
            active={method === "GCash"}
            disabled={!!statutory}
            onPress={() => setMethod("GCash")}
          />
          <PaymentOption
            label="Cash"
            sub="Pay at the counter on pickup"
            icon="cash-outline"
            active={method === "Cash"}
            onPress={() => setMethod("Cash")}
          />
        </View>

        {method === "GCash" ? (
          <View className="mt-3 rounded-card border border-info bg-infoSoft p-4">
            <Text className="text-[11px] font-semibold uppercase tracking-wide text-info">
              Simulated GCash balance · demo only
            </Text>
            <View className="mt-1.5 flex-row items-center">
              <Text className="font-display text-lg text-info">₱</Text>
              <TextInput
                value={gcashBalance}
                onChangeText={setGcashBalance}
                keyboardType="number-pad"
                className="ml-1 flex-1 font-display text-lg text-info"
              />
            </View>
            <Text className="mt-1 text-xs text-info">
              Set this below the total to test a failed transaction.
            </Text>
          </View>
        ) : null}

        {/* Tip */}
        {tippingEnabled ? (
          <>
            <Text className="mb-2 mt-6 font-heading text-base text-textPrimary">Add a tip</Text>
            <View className="flex-row gap-2">
              {(
                [
                  ["none", "No tip"],
                  ["p5", "5%"],
                  ["p10", "10%"],
                  ["p15", "15%"],
                  ["custom", "Custom"],
                ] as const
              ).map(([m, label]) => {
                const active = tipMode === m;
                return (
                  <Pressable
                    key={m}
                    onPress={() => setTipMode(m)}
                    className={`flex-1 items-center rounded-xl border py-2.5 ${
                      active ? "border-brandPrimary bg-accent-100" : "border-line bg-surface"
                    }`}
                  >
                    <Text
                      className={`text-xs font-bold ${active ? "text-brandPrimary" : "text-textSecondary"}`}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {tipMode === "custom" ? (
              <View className="mt-2 flex-row items-center rounded-2xl border border-line bg-surface px-3">
                <Text className="font-display text-base text-textSecondary">₱</Text>
                <TextInput
                  value={customTip}
                  onChangeText={setCustomTip}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={Colors.textMuted}
                  className="ml-1 flex-1 px-2 py-3 text-base text-textPrimary"
                />
              </View>
            ) : null}
            {tipAmount > 0 ? (
              <Text className="mt-1.5 text-xs text-textMuted">
                Tip {peso(tipAmount)} · 100% goes to staff, not eligible for points
              </Text>
            ) : null}
          </>
        ) : null}

        {/* Notes */}
        <Text className="mb-2 mt-6 font-heading text-base text-textPrimary">Notes for barista</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          onFocus={handleFocus}
          placeholder="Optional — e.g. name for the cup"
          placeholderTextColor={Colors.textMuted}
          multiline
          maxLength={300}
          textAlignVertical="top"
          className="min-h-[72px] rounded-2xl border border-line bg-surface px-4 py-3 text-base text-textPrimary"
        />
        <Text className="mt-1 self-end text-[11px] text-textMuted">{notes.length}/300</Text>

        {error ? (
          <View className="mt-5 rounded-xl bg-dangerSoft p-3">
            <Text className="text-sm font-medium text-danger">{error}</Text>
          </View>
        ) : null}
      </ScrollView>

      {keyboardVisible ? null : (
      <StickyActionBar>
        <View className="mb-1 flex-row justify-between">
          <Text className="text-sm text-textSecondary">Subtotal</Text>
          <Text className="text-sm font-medium text-textPrimary">{peso(subtotal)}</Text>
        </View>
        {promoRewardDiscount > 0 ? (
          <View className="mb-1 flex-row justify-between">
            <Text className="text-sm text-success" numberOfLines={1}>
              {voucher ? voucher.reward_name : appliedPromo ? appliedPromo.code : "Discount"}
            </Text>
            <Text className="text-sm font-medium text-success">−{peso(promoRewardDiscount)}</Text>
          </View>
        ) : null}
        {statutoryDiscount > 0 ? (
          <View className="mb-1 flex-row justify-between">
            <Text className="text-sm text-success" numberOfLines={1}>
              {statutory === "Senior" ? "Senior Citizen" : "PWD"} discount (20%)
            </Text>
            <Text className="text-sm font-medium text-success">−{peso(statutoryDiscount)}</Text>
          </View>
        ) : null}
        {vatExempt > 0 ? (
          <View className="mb-1 flex-row justify-between">
            <Text className="text-xs text-textMuted">VAT exemption</Text>
            <Text className="text-xs text-textMuted">−{peso(vatExempt)}</Text>
          </View>
        ) : null}
        {serviceFee > 0 ? (
          <View className="mb-1 flex-row justify-between">
            <Text className="text-sm text-textSecondary">Service fee</Text>
            <Text className="text-sm font-medium text-textPrimary">{peso(serviceFee)}</Text>
          </View>
        ) : null}
        {tipAmount > 0 ? (
          <View className="mb-1 flex-row justify-between">
            <Text className="text-sm text-textSecondary">Tip</Text>
            <Text className="text-sm font-medium text-textPrimary">{peso(tipAmount)}</Text>
          </View>
        ) : null}
        {showVat ? (
          <View className="mb-1 flex-row justify-between">
            <Text className="text-xs text-textMuted">
              VAT included ({Math.round((quote?.vat_rate ?? 0.12) * 100)}%)
            </Text>
            <Text className="text-xs text-textMuted">{peso(vatAmount)}</Text>
          </View>
        ) : null}
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="font-heading text-base text-textPrimary">Total</Text>
          <View className="items-end">
            <PriceText amount={total} size="xl" />
            <Text className="text-xs text-brandPrimary">Earn {pointsToEarn} pts</Text>
          </View>
        </View>
        {verifying ? (
          <View className="rounded-2xl border border-info bg-infoSoft p-3">
            <View className="flex-row items-center gap-2">
              <Ionicons name="sync-outline" size={16} color={Colors.info} />
              <Text className="font-bold text-textPrimary">Verifying your payment</Text>
            </View>
            <Text className="mt-1 text-xs text-textSecondary">
              We couldn&apos;t confirm your last attempt. Don&apos;t pay again — check the status
              first. If your order went through, it&apos;ll open automatically.
            </Text>
            <View className="mt-3 gap-2">
              <Button
                label="Check payment status"
                onPress={onPlaceOrder}
                loading={placing}
                disabled={!online}
                haptic="light"
              />
              <Pressable
                onPress={() => router.replace("/orders")}
                accessibilityRole="button"
                className="items-center py-1.5"
              >
                <Text className="text-sm font-semibold text-brandPrimary">Go to my orders</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Button
            label={online ? `Pay & place order · ${peso(total)}` : "Offline — connect to order"}
            onPress={onPlaceOrder}
            loading={placing}
            disabled={!online}
            haptic="success"
          />
        )}
      </StickyActionBar>
      )}
    </Screen>
  );
}

function PaymentOption({
  label,
  sub,
  icon,
  active,
  onPress,
  disabled,
}: {
  label: string;
  sub: string;
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      className={`flex-row items-center rounded-card border bg-surface p-4 ${
        active ? "border-brandPrimary bg-accent-100" : "border-line"
      } ${disabled ? "opacity-40" : ""}`}
    >
      <View className="h-10 w-10 items-center justify-center rounded-full bg-accent-100">
        <Ionicons name={icon} size={20} color={Colors.brand} />
      </View>
      <View className="ml-3 flex-1">
        <Text className="text-base font-bold text-textPrimary">{label}</Text>
        <Text className="text-xs text-textSecondary">{sub}</Text>
      </View>
      <Ionicons
        name={active ? "radio-button-on" : "radio-button-off"}
        size={20}
        color={active ? Colors.brand : "#C9A47C"}
      />
    </Pressable>
  );
}

function CheckoutLine({
  line,
  last,
  onEdit,
  onRemove,
  onQty,
}: {
  line: CartLine;
  last: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onQty: (q: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const free = line.selectedOptions.filter((o) => o.additionalPrice === 0);
  const paid = line.selectedOptions.filter((o) => o.additionalPrice > 0);
  const summary = line.selectedOptions.map((o) => o.optionName).join(", ");

  return (
    <View className={last ? "py-3" : "border-b border-line py-3"}>
      <Pressable onPress={() => setOpen((o) => !o)} className="flex-row">
        <ProductImage
          {...resolveProductImage(
            { name: line.productName, image_url: line.imageUrl },
            line.presentationKey,
          )}
          emoji="☕"
          emojiSize={20}
          className="mr-3 h-14 w-14 rounded-xl"
          accessibilityLabel={line.productName}
        />
        <View className="flex-1">
          <View className="flex-row justify-between">
            <Text className="flex-1 pr-2 text-sm font-bold text-textPrimary">
              {line.quantity}× {line.productName}
            </Text>
            <Text className="text-sm font-semibold text-textPrimary">{peso(lineTotal(line))}</Text>
          </View>
          <View className="flex-row items-center justify-between">
            <Text className="flex-1 pr-2 text-xs text-textMuted" numberOfLines={open ? undefined : 1}>
              {line.variantName}
              {summary ? ` · ${summary}` : ""}
            </Text>
            <Ionicons
              name={open ? "chevron-up" : "chevron-down"}
              size={16}
              color={Colors.textMuted}
            />
          </View>
        </View>
      </Pressable>

      {open ? (
        <View className="ml-[68px] mt-2">
          {free.length > 0 ? (
            <Text className="text-xs text-textSecondary">{free.map((o) => o.optionName).join(" · ")}</Text>
          ) : null}
          {paid.map((o) => (
            <Text key={o.optionId} className="text-xs text-textSecondary">
              + {o.optionName} (+{peso(o.additionalPrice)})
            </Text>
          ))}
          {line.notes ? (
            <Text className="mt-0.5 text-xs italic text-textMuted">“{line.notes}”</Text>
          ) : null}
          <View className="mt-2 flex-row items-center justify-between">
            <QuantityStepper value={line.quantity} onChange={onQty} size="sm" />
            <View className="flex-row items-center gap-4">
              <Pressable onPress={onEdit} hitSlop={8} className="flex-row items-center gap-1">
                <Ionicons name="create-outline" size={15} color={Colors.brand} />
                <Text className="text-xs font-bold text-brandPrimary">Edit</Text>
              </Pressable>
              <Pressable onPress={onRemove} hitSlop={8} className="flex-row items-center gap-1">
                <Ionicons name="trash-outline" size={15} color={Colors.danger} />
                <Text className="text-xs font-bold text-danger">Remove</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}
