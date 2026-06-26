import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ActionSheet, type SheetAction } from "@/components/ui/ActionSheet";
import { Header } from "@/components/ui/Header";
import { useKeyboardAwareScroll } from "@/components/ui/KeyboardAwareScrollView";
import { OrderProgress } from "@/components/ui/OrderProgress";
import { PickupQR } from "@/components/ui/PickupQR";
import { PriceText } from "@/components/ui/PriceText";
import { ProductImage } from "@/components/ui/ProductImage";
import { Screen } from "@/components/ui/Screen";
import { Colors } from "@/constants/theme";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { presentationFromOptionNames, resolveProductImage } from "@/lib/productMedia";
import {
  cancelMyOrder,
  getAppSettings,
  getFeedbackForOrder,
  getOrder,
  getOrdersAhead,
  subscribeOrder,
  submitFeedback,
} from "@/lib/api";
import { humanizeError } from "@/lib/errors";
import { tagsForRating } from "@/lib/feedbackTags";
import {
  formatDateTime,
  formatEta,
  formatReadyAround,
  peso,
  pickupNumber,
  statusLabel,
} from "@/lib/format";
import { notifyLocal } from "@/lib/notify";
import { orderStatusTone } from "@/lib/orderStatus";
import { formatScheduled } from "@/lib/scheduling";
import { useNetwork } from "@/store/network";
import type { Order, OrderStatus } from "@/types/models";

export default function OrderScreen() {
  const { id, new: isNew } = useLocalSearchParams<{ id: string; new?: string }>();
  const router = useRouter();
  const reduced = useReducedMotion();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [ordersAhead, setOrdersAhead] = useState<number | null>(null);
  const [stepsExpanded, setStepsExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const online = useNetwork((s) => s.online);
  const prevStatus = useRef<OrderStatus | null>(null);

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [feedbackDone, setFeedbackDone] = useState(false);
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelPolicy, setCancelPolicy] = useState<{
    policy: "until_preparing" | "within_n_minutes" | "disabled";
    windowMin: number;
    reasonRequired: boolean;
  }>({ policy: "until_preparing", windowMin: 0, reasonRequired: false });
  const { scrollRef, handleFocus } = useKeyboardAwareScroll();

  // success check entrance
  const checkScale = useSharedValue(isNew && !reduced ? 0 : 1);
  useEffect(() => {
    if (isNew && !reduced) checkScale.value = withSpring(1, { damping: 11, stiffness: 150 });
  }, [isNew, reduced, checkScale]);
  const checkStyle = useAnimatedStyle(() => ({ transform: [{ scale: checkScale.value }] }));

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const o = await getOrder(id);
      setOrder(o);
      prevStatus.current = o?.status ?? null;
      if (o?.status === "completed") {
        const fb = await getFeedbackForOrder(id);
        if (fb) {
          setRating(fb.rating);
          setComment(fb.comment);
          setTags(fb.tags);
          setFeedbackDone(true);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Queue position for the active stages (best-effort, refreshed on status change).
  useEffect(() => {
    if (!id || !order) return;
    if (order.status === "pending" || order.status === "preparing") {
      getOrdersAhead(id)
        .then(setOrdersAhead)
        .catch(() => setOrdersAhead(null));
    } else {
      setOrdersAhead(null);
    }
  }, [id, order]);

  useEffect(() => {
    getAppSettings()
      .then((s) =>
        setCancelPolicy({
          policy: s.cancellation_policy,
          windowMin: s.cancellation_window_minutes,
          reasonRequired: s.cancellation_reason_required,
        }),
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!id) return;
    const unsub = subscribeOrder(id, (row) => {
      setOrder((prev) => (prev ? { ...prev, ...row } : prev));
      if (row.status && row.status !== prevStatus.current) {
        prevStatus.current = row.status;
        void notifyLocal("Cafinity order update", statusMessage(row.status));
      }
    });
    return unsub;
  }, [id]);

  async function saveFeedback() {
    if (!order || rating === 0) return;
    setSavingFeedback(true);
    try {
      await submitFeedback(order.id, rating, comment.trim(), tags);
      setFeedbackDone(true);
    } catch (e) {
      void e;
    } finally {
      setSavingFeedback(false);
    }
  }

  async function doCancel() {
    if (!order) return;
    if (cancelPolicy.reasonRequired && !cancelReason.trim()) {
      Alert.alert("Reason required", "Please tell us why you're cancelling.");
      return;
    }
    setCancelling(true);
    try {
      await cancelMyOrder(order.id, cancelReason.trim());
      setCancelOpen(false);
      setCancelReason("");
      await load();
    } catch (e) {
      Alert.alert("Could not cancel", humanizeError(e));
    } finally {
      setCancelling(false);
    }
  }

  if (loading) {
    return (
      <Screen edges={["top", "bottom"]}>
        <Header title="Order" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={Colors.brand} />
        </View>
      </Screen>
    );
  }
  if (!order) {
    return (
      <Screen edges={["top", "bottom"]}>
        <Header title="Order" />
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-center text-textSecondary">Order not found.</Text>
        </View>
      </Screen>
    );
  }

  const cancelled = order.status === "cancelled";
  const isReady = order.status === "ready";
  const withinWindow =
    cancelPolicy.policy !== "within_n_minutes" ||
    cancelPolicy.windowMin <= 0 ||
    Date.now() - new Date(order.created_at).getTime() < cancelPolicy.windowMin * 60000;
  const canSelfCancel =
    cancelPolicy.policy !== "disabled" && order.status === "pending" && withinWindow;
  const isTerminal = order.status === "completed" || cancelled;

  // Secondary actions live in an overflow menu so the screen has one clear focus.
  const menuActions: SheetAction[] = [];
  if (!cancelled) {
    menuActions.push({
      label: "View digital receipt",
      icon: "receipt-outline",
      onPress: () => router.push(`/receipt/${order.id}`),
    });
  }
  menuActions.push({
    label: "Get help",
    icon: "help-buoy-outline",
    onPress: () =>
      Linking.openURL(
        `mailto:support@cafinity.app?subject=${encodeURIComponent(
          `Help with order ${order.order_number ?? order.id}`,
        )}`,
      ).catch(() => {}),
  });
  if (canSelfCancel) {
    menuActions.push({
      label: "Cancel order",
      icon: "close-circle-outline",
      destructive: true,
      onPress: () => setCancelOpen(true),
    });
  }

  return (
    <Screen edges={["top"]}>
      <Header
        title="Order details"
        onBack={() => (isNew ? router.replace("/orders") : router.back())}
        right={
          <Pressable
            onPress={() => setMenuOpen(true)}
            hitSlop={10}
            accessibilityLabel="More options"
          >
            <Ionicons name="ellipsis-vertical" size={20} color={Colors.text} />
          </Pressable>
        }
      />
      <ScrollView
        ref={scrollRef}
        contentContainerClassName="p-5 pb-12"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
      >
        {isNew ? (
          <View className="mb-5 items-center overflow-hidden rounded-panel bg-brand-900 p-7">
            <Animated.View
              style={checkStyle}
              className="h-16 w-16 items-center justify-center rounded-full bg-accent"
            >
              <Ionicons name="checkmark" size={36} color="#3A2410" />
            </Animated.View>
            <Text className="mt-3 font-display text-xl text-white">Order placed!</Text>
            <Text className="mt-1 text-center text-sm text-brand-200">
              You&apos;ll earn {order.points_earned} points when this order is completed. We&apos;ll
              let you know when it&apos;s ready.
            </Text>
          </View>
        ) : null}

        {/* Ticket */}
        <View className="rounded-card border border-line bg-surface p-4">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-[11px] uppercase tracking-wide text-textMuted">
                Pickup number
              </Text>
              <Text className="font-display text-3xl text-textPrimary">
                {pickupNumber(order) ?? order.order_number ?? "—"}
              </Text>
            </View>
            <Badge label={statusLabel(order.status)} tone={orderStatusTone(order.status)} />
          </View>
          <Text className="mt-1 text-xs text-textMuted">
            {order.order_number ? `Ref ${order.order_number} · ` : ""}Placed{" "}
            {formatDateTime(order.created_at)}
          </Text>

          {order.scheduled_for ? (
            <View className="mt-2 flex-row items-center gap-1.5 self-start rounded-full bg-accent-100 px-3 py-1.5">
              <Ionicons name="calendar-outline" size={13} color={Colors.brand} />
              <Text className="text-xs font-bold text-brandPrimary">
                Scheduled pickup · {formatScheduled(order.scheduled_for)}
              </Text>
            </View>
          ) : null}

          {!online && !isTerminal ? (
            <View className="mt-2 flex-row items-center gap-1.5">
              <Ionicons name="cloud-offline-outline" size={13} color={Colors.textMuted} />
              <Text className="text-[11px] text-textMuted">
                You&apos;re offline — showing the last known status.
              </Text>
            </View>
          ) : null}

          {!cancelled ? (
            <>
              {/* Live progress — compact by default, expandable to the full timeline */}
              <View className="mt-5">
                <OrderProgress order={order} variant={stepsExpanded ? "vertical" : "horizontal"} />
                <Pressable
                  onPress={() => setStepsExpanded((v) => !v)}
                  hitSlop={6}
                  className="mt-3 flex-row items-center gap-1 self-start"
                  accessibilityLabel={stepsExpanded ? "Hide all steps" : "Show all steps"}
                >
                  <Text className="text-xs font-semibold text-brandPrimary">
                    {stepsExpanded ? "Hide steps" : "Show all steps"}
                  </Text>
                  <Ionicons
                    name={stepsExpanded ? "chevron-up" : "chevron-down"}
                    size={14}
                    color={Colors.brand}
                  />
                </Pressable>
              </View>

              {/* Contextual stage message */}
              <View
                className={`mt-4 rounded-xl p-3 ${isReady ? "bg-accent-100" : "bg-surfaceMuted"}`}
              >
                <Text
                  className={`text-sm font-medium ${isReady ? "text-textPrimary" : "text-textSecondary"}`}
                >
                  {statusMessage(order.status)}
                </Text>
              </View>

              {/* Estimated prep time — never shown once Ready */}
              {(order.status === "pending" || order.status === "preparing") &&
              order.estimated_max_minutes ? (
                <View className="mt-3 flex-row items-center gap-1.5">
                  <Ionicons name="time-outline" size={15} color={Colors.brand} />
                  <Text className="text-xs font-medium text-textSecondary">
                    {order.status === "preparing" && order.estimated_ready_at
                      ? `Ready ${formatReadyAround(order.estimated_ready_at)} (${formatEta(order.estimated_min_minutes, order.estimated_max_minutes)})`
                      : `Estimated ${formatEta(order.estimated_min_minutes, order.estimated_max_minutes)} once started`}
                  </Text>
                </View>
              ) : null}

              {/* Queue position */}
              {order.status === "pending" || order.status === "preparing" ? (
                <View className="mt-3 rounded-xl border border-line bg-surfaceMuted p-3">
                  <View className="flex-row items-center gap-1.5">
                    <Ionicons name="people-outline" size={15} color={Colors.brand} />
                    <Text className="text-xs font-medium text-textSecondary">
                      {ordersAhead == null
                        ? "Your order is in the queue. We'll update the estimate shortly."
                        : ordersAhead === 0
                          ? "You're next in the queue."
                          : `${ordersAhead} order${ordersAhead === 1 ? "" : "s"} ahead of you`}
                    </Text>
                  </View>
                  <Text className="mt-1 text-[11px] text-textMuted">
                    Updated {formatDateTime(order.eta_calculated_at ?? order.updated_at)}
                  </Text>
                </View>
              ) : null}
            </>
          ) : (
            <View className="mt-4 rounded-xl bg-dangerSoft p-3">
              <Text className="text-sm font-medium text-danger">
                This order was cancelled.
              </Text>
            </View>
          )}
        </View>

        {/* Pickup QR — active orders only (hidden once completed/cancelled) */}
        {!cancelled && order.status !== "completed" ? (
          <View className="mt-4">
            <PickupQR order={order} />
          </View>
        ) : null}

        {/* Statutory discount verification */}
        {order.statutory_discount_type ? (
          <View
            className={`mt-4 flex-row items-center gap-2 rounded-xl border p-3 ${
              order.discount_verification === "verified"
                ? "border-success bg-successSoft"
                : order.discount_verification === "rejected"
                  ? "border-danger bg-dangerSoft"
                  : "border-warning bg-warningSoft"
            }`}
          >
            <Ionicons
              name={
                order.discount_verification === "verified"
                  ? "shield-checkmark"
                  : order.discount_verification === "rejected"
                    ? "close-circle"
                    : "time-outline"
              }
              size={18}
              color={
                order.discount_verification === "verified"
                  ? Colors.success
                  : order.discount_verification === "rejected"
                    ? Colors.danger
                    : "#b45309"
              }
            />
            <Text className="flex-1 text-xs font-medium text-textSecondary">
              {order.statutory_discount_type === "Senior" ? "Senior Citizen" : "PWD"} discount —{" "}
              {order.discount_verification === "verified"
                ? "ID verified."
                : order.discount_verification === "rejected"
                  ? "ID not verified; full price applies."
                  : "show your ID at the counter for verification before payment."}
            </Text>
          </View>
        ) : null}

        {/* Pickup */}
        <View className="mt-5 flex-row items-center gap-2">
          <Ionicons name="location" size={16} color={Colors.brand} />
          <Text className="text-sm font-medium text-textPrimary">
            Pickup at {order.branches?.name ?? "your branch"}
          </Text>
        </View>

        {/* Items */}
        <Text className="mb-2 mt-5 font-heading text-base text-textPrimary">Items</Text>
        <View className="rounded-card border border-line bg-surface p-4">
          {(order.order_items ?? []).map((it) => (
            <View key={it.id} className="mb-3 flex-row">
              <ProductImage
                {...resolveProductImage(
                  { name: it.product_name },
                  it.presentation_key ??
                    presentationFromOptionNames(
                      it.order_item_customization.map((c) => c.option_name),
                    ),
                )}
                emoji="☕"
                emojiSize={18}
                className="mr-3 h-12 w-12 rounded-xl"
                accessibilityLabel={it.product_name}
              />
              <View className="flex-1">
                <View className="flex-row justify-between">
                  <Text className="flex-1 pr-2 text-sm font-semibold text-textPrimary">
                    {it.quantity}× {it.product_name}
                  </Text>
                  <Text className="text-sm font-semibold text-textPrimary">
                    {peso(it.subtotal)}
                  </Text>
                </View>
                <Text className="text-xs text-textMuted">{it.variant_name}</Text>
                {it.order_item_customization.length > 0 ? (
                  <Text className="text-xs text-textMuted">
                    {it.order_item_customization.map((c) => c.option_name).join(" · ")}
                  </Text>
                ) : null}
                {it.item_notes ? (
                  <Text className="text-xs italic text-textMuted">Note: {it.item_notes}</Text>
                ) : null}
              </View>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View className="mt-4 rounded-card border border-line bg-surface p-4">
          <Row label="Merchandise subtotal" value={peso(order.subtotal)} />
          {order.promo_discount ? (
            <Row
              label={`Promo${order.promo_code && !order.promo_code.startsWith("RWD-") ? ` (${order.promo_code})` : ""}`}
              value={`−${peso(order.promo_discount)}`}
              green
            />
          ) : null}
          {order.loyalty_reward_discount ? (
            <Row label="Loyalty reward" value={`−${peso(order.loyalty_reward_discount)}`} green />
          ) : null}
          {/* Fallback for orders created before the pricing breakdown existed. */}
          {!order.promo_discount && !order.loyalty_reward_discount && order.discount_amount > 0 ? (
            <Row
              label={`Discount${order.promo_code ? ` (${order.promo_code})` : ""}`}
              value={`−${peso(order.discount_amount)}`}
              green
            />
          ) : null}
          {order.vat_exempt_amount ? (
            <Row label="VAT exemption" value={`−${peso(order.vat_exempt_amount)}`} />
          ) : null}
          {order.statutory_discount ? (
            <Row
              label={`${order.statutory_discount_type === "Senior" ? "Senior Citizen" : "PWD"} discount (20%)`}
              value={`−${peso(order.statutory_discount)}`}
              green
            />
          ) : null}
          {order.service_fee ? <Row label="Service fee" value={peso(order.service_fee)} /> : null}
          {order.delivery_fee ? <Row label="Delivery fee" value={peso(order.delivery_fee)} /> : null}
          {order.tip_amount ? <Row label="Tip" value={peso(order.tip_amount)} /> : null}
          {order.vat_amount ? (
            <Row
              label={`VAT included${order.vat_rate_snapshot ? ` (${Math.round(order.vat_rate_snapshot * 100)}%)` : ""}`}
              value={peso(order.vat_amount)}
            />
          ) : null}
          <View className="my-2 h-px bg-line" />
          <View className="flex-row items-center justify-between py-0.5">
            <Text className="font-heading text-base text-textPrimary">Total</Text>
            <PriceText amount={order.total_amount} size="lg" />
          </View>
          <View className="mt-2 flex-row items-center justify-between">
            <Text className="text-xs text-textMuted">
              {order.payment_method} · {order.payment_status}
            </Text>
            <Text className="text-xs font-semibold text-brandPrimary">
              {order.points_state === "earned"
                ? `+${order.points_earned} pts earned`
                : order.points_state === "reversed"
                  ? "points reversed"
                  : `${order.points_earned} pts pending`}
            </Text>
          </View>
        </View>

        {/* Cancellation / refund summary */}
        {cancelled ? (
          <View className="mt-4 rounded-card border border-line bg-surface p-4">
            <Text className="font-heading text-sm text-textPrimary">Cancellation</Text>
            {order.cancellation_reason ? (
              <Text className="mt-1 text-xs text-textSecondary">
                Reason: {order.cancellation_reason}
              </Text>
            ) : null}
            {order.refund_status === "refunded" ? (
              <Text className="mt-1 text-sm font-semibold text-success">
                Refunded {peso(order.refunded_amount ?? 0)} to {order.payment_method} (simulated)
              </Text>
            ) : order.refund_status === "refund_pending" ? (
              <Text className="mt-1 text-sm font-semibold text-warning">
                Cash refund of {peso(order.refunded_amount ?? 0)} — collect at the counter
              </Text>
            ) : (
              <Text className="mt-1 text-xs text-textMuted">No payment was charged.</Text>
            )}
          </View>
        ) : null}

        {/* Customer cancellation form — opened from the overflow menu */}
        {canSelfCancel && cancelOpen ? (
          <View className="mt-4">
            {
              <View className="rounded-card border border-danger bg-surface p-4">
                <Text className="mb-1 font-heading text-sm text-textPrimary">
                  Cancel this order?
                </Text>
                <Text className="mb-2 text-xs text-textSecondary">
                  Inventory, points, and any promo or voucher will be restored
                  {order.payment_status === "paid"
                    ? order.payment_method === "GCash"
                      ? ", and your payment will be refunded"
                      : ", and your cash payment will be returned at the counter"
                    : ""}
                  .
                </Text>
                <TextInput
                  value={cancelReason}
                  onChangeText={setCancelReason}
                  onFocus={handleFocus}
                  placeholder={cancelPolicy.reasonRequired ? "Reason (required)" : "Reason (optional)"}
                  placeholderTextColor={Colors.textMuted}
                  multiline
                  maxLength={200}
                  textAlignVertical="top"
                  className="mb-3 min-h-[52px] rounded-xl border border-line bg-background px-3 py-2 text-sm text-textPrimary"
                />
                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <Button
                      label="Keep order"
                      variant="outline"
                      onPress={() => {
                        setCancelOpen(false);
                        setCancelReason("");
                      }}
                    />
                  </View>
                  <View className="flex-1">
                    <Button
                      label="Cancel order"
                      variant="danger"
                      onPress={doCancel}
                      loading={cancelling}
                    />
                  </View>
                </View>
              </View>
            }
          </View>
        ) : null}

        {/* Feedback */}
        {order.status === "completed" ? (
          <View className="mt-5 rounded-card border border-line bg-surface p-4">
            <Text className="font-heading text-base text-textPrimary">Rate your order</Text>
            <View className="mt-2 flex-row gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable
                  key={n}
                  disabled={feedbackDone}
                  onPress={() => {
                    setRating(n);
                    // Offered tags depend on the rating; drop ones no longer relevant.
                    setTags((t) => t.filter((k) => tagsForRating(n).some((x) => x.key === k)));
                  }}
                  hitSlop={6}
                  accessibilityLabel={`${n} star${n > 1 ? "s" : ""}`}
                >
                  <Ionicons
                    name={n <= rating ? "star" : "star-outline"}
                    size={30}
                    color={n <= rating ? "#E0A526" : "#C9A47C"}
                  />
                </Pressable>
              ))}
            </View>

            {/* Quick tags (positive for 4–5★, issue-focused for 1–3★) */}
            {rating > 0 ? (
              <View className="mt-3 flex-row flex-wrap gap-2">
                {tagsForRating(rating).map((t) => {
                  const on = tags.includes(t.key);
                  if (feedbackDone && !on) return null;
                  return (
                    <Pressable
                      key={t.key}
                      disabled={feedbackDone}
                      onPress={() =>
                        setTags((cur) =>
                          cur.includes(t.key) ? cur.filter((k) => k !== t.key) : [...cur, t.key],
                        )
                      }
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      className={`rounded-full border px-3 py-1.5 ${
                        on ? "border-brandPrimary bg-accent-100" : "border-line bg-surface"
                      }`}
                    >
                      <Text
                        className={`text-xs font-semibold ${on ? "text-brandPrimary" : "text-textSecondary"}`}
                      >
                        {t.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {!feedbackDone ? (
              <>
                <TextInput
                  value={comment}
                  onChangeText={setComment}
                  onFocus={handleFocus}
                  placeholder="Tell us how it was (optional)"
                  placeholderTextColor={Colors.textMuted}
                  multiline
                  className="mt-3 min-h-[56px] rounded-xl border border-line bg-background px-3 py-2 text-sm text-textPrimary"
                />
                <View className="mt-3">
                  <Button
                    label="Submit feedback"
                    onPress={saveFeedback}
                    loading={savingFeedback}
                    disabled={rating === 0}
                    haptic="success"
                  />
                </View>
              </>
            ) : (
              <Text className="mt-2 text-sm text-success">Thanks for your feedback! ☕</Text>
            )}
          </View>
        ) : null}

        {/* One status-based primary action (terminal orders → reorder) */}
        {isTerminal && (order.order_items ?? []).length > 0 ? (
          <View className="mt-6">
            <Button
              label="Reorder these items"
              onPress={() => router.push(`/reorder/${order.id}`)}
              haptic="light"
              leftIcon={<Ionicons name="repeat" size={18} color="#fff" />}
            />
          </View>
        ) : null}
      </ScrollView>

      <ActionSheet
        visible={menuOpen}
        title="Order options"
        actions={menuActions}
        onClose={() => setMenuOpen(false)}
      />
    </Screen>
  );
}

function Row({
  label,
  value,
  bold,
  green,
}: {
  label: string;
  value: string;
  bold?: boolean;
  green?: boolean;
}) {
  return (
    <View className="flex-row justify-between py-0.5">
      <Text className={`text-sm ${green ? "text-success" : "text-textSecondary"}`}>{label}</Text>
      <Text
        className={`text-sm ${bold ? "font-extrabold text-textPrimary" : green ? "font-medium text-success" : "font-medium text-textPrimary"}`}
      >
        {value}
      </Text>
    </View>
  );
}

function statusMessage(status: OrderStatus): string {
  switch (status) {
    case "preparing":
      return "Your order is now being prepared. ☕";
    case "ready":
      return "Your order is ready for pickup! 🎉";
    case "completed":
      return "Order completed. Enjoy your coffee!";
    case "cancelled":
      return "Your order was cancelled.";
    default:
      return "Order received — waiting for the barista to start.";
  }
}
