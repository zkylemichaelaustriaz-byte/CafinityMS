import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Header } from "@/components/ui/Header";
import { useKeyboardAwareScroll } from "@/components/ui/KeyboardAwareScrollView";
import { PriceText } from "@/components/ui/PriceText";
import { ProductImage } from "@/components/ui/ProductImage";
import { Screen } from "@/components/ui/Screen";
import { Colors } from "@/constants/theme";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { localProductImage } from "@/lib/productImages";
import {
  cancelMyOrder,
  getAppSettings,
  getFeedbackForOrder,
  getOrder,
  subscribeOrder,
  submitFeedback,
} from "@/lib/api";
import { humanizeError } from "@/lib/errors";
import { formatDateTime, formatEta, formatReadyAround, peso, statusLabel } from "@/lib/format";
import { notifyLocal } from "@/lib/notify";
import type { Order, OrderStatus } from "@/types/models";

const STEPS: OrderStatus[] = ["pending", "preparing", "ready", "completed"];
const STEP_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  pending: "receipt-outline",
  preparing: "cafe-outline",
  ready: "checkmark-circle-outline",
  completed: "bag-check-outline",
};

export default function OrderScreen() {
  const { id, new: isNew } = useLocalSearchParams<{ id: string; new?: string }>();
  const router = useRouter();
  const reduced = useReducedMotion();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const prevStatus = useRef<OrderStatus | null>(null);

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
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
      await submitFeedback(order.id, rating, comment.trim());
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
  const currentIndex = STEPS.indexOf(order.status);
  const isReady = order.status === "ready";
  const withinWindow =
    cancelPolicy.policy !== "within_n_minutes" ||
    cancelPolicy.windowMin <= 0 ||
    Date.now() - new Date(order.created_at).getTime() < cancelPolicy.windowMin * 60000;
  const canSelfCancel =
    cancelPolicy.policy !== "disabled" && order.status === "pending" && withinWindow;

  return (
    <Screen edges={["top"]}>
      <Header
        title="Order details"
        onBack={() => (isNew ? router.replace("/orders") : router.back())}
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
                Order number
              </Text>
              <Text className="font-display text-xl text-textPrimary">
                {order.order_number ?? "—"}
              </Text>
            </View>
            <Badge
              label={statusLabel(order.status)}
              tone={
                cancelled
                  ? "red"
                  : order.status === "completed"
                    ? "green"
                    : isReady
                      ? "blue"
                      : "amber"
              }
            />
          </View>
          <Text className="mt-1 text-xs text-textMuted">
            Placed {formatDateTime(order.created_at)}
          </Text>

          {!cancelled ? (
            <>
              {/* Timeline */}
              <View className="mt-5 flex-row">
                {STEPS.map((s, i) => {
                  const done = i <= currentIndex;
                  const active = i === currentIndex;
                  return (
                    <View key={s} className="flex-1 items-center">
                      <View className="w-full flex-row items-center">
                        <View
                          className={`h-1 flex-1 rounded-full ${i === 0 ? "opacity-0" : done ? "bg-brandPrimary" : "bg-line"}`}
                        />
                        <View className="items-center justify-center">
                          {active && !cancelled && order.status !== "completed" ? (
                            <PulseRing />
                          ) : null}
                          <View
                            className={`h-9 w-9 items-center justify-center rounded-full ${
                              done ? "bg-brandPrimary" : "bg-surfaceMuted"
                            }`}
                          >
                            <Ionicons
                              name={STEP_ICON[s]}
                              size={18}
                              color={done ? "#fff" : "#C9A47C"}
                            />
                          </View>
                        </View>
                        <View
                          className={`h-1 flex-1 rounded-full ${i === STEPS.length - 1 ? "opacity-0" : i < currentIndex ? "bg-brandPrimary" : "bg-line"}`}
                        />
                      </View>
                      <Text
                        className={`mt-1.5 text-center text-[10px] font-semibold ${
                          done ? "text-brandPrimary" : "text-textMuted"
                        }`}
                      >
                        {statusLabel(s)}
                      </Text>
                    </View>
                  );
                })}
              </View>

              {/* Contextual stage message */}
              <View
                className={`mt-4 rounded-xl p-3 ${isReady ? "bg-accent-100" : "bg-surfaceMuted"}`}
              >
                <Text
                  className={`text-sm font-medium ${isReady ? "text-brand-800" : "text-textSecondary"}`}
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
            </>
          ) : (
            <View className="mt-4 rounded-xl bg-red-50 p-3">
              <Text className="text-sm font-medium text-danger">
                This order was cancelled.
              </Text>
            </View>
          )}
        </View>

        {/* Statutory discount verification */}
        {order.statutory_discount_type ? (
          <View
            className={`mt-4 flex-row items-center gap-2 rounded-xl border p-3 ${
              order.discount_verification === "verified"
                ? "border-green-200 bg-green-50"
                : order.discount_verification === "rejected"
                  ? "border-red-200 bg-red-50"
                  : "border-amber-300 bg-amber-50"
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
                source={localProductImage(it.product_name)}
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

        {/* Customer cancellation (policy-gated, only while still pending) */}
        {canSelfCancel ? (
          <View className="mt-4">
            {!cancelOpen ? (
              <>
                <Button
                  label="Cancel order"
                  variant="danger"
                  onPress={() => setCancelOpen(true)}
                />
                <Text className="mt-1.5 text-center text-xs text-textMuted">
                  You can cancel until the barista starts preparing it.
                </Text>
              </>
            ) : (
              <View className="rounded-card border border-line bg-surface p-4">
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
                  placeholderTextColor="#B8A99C"
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
            )}
          </View>
        ) : null}

        {/* Reorder */}
        {(order.order_items ?? []).length > 0 ? (
          <View className="mt-5">
            <Button
              label="Reorder these items"
              variant="outline"
              onPress={() => router.push(`/reorder/${order.id}`)}
            />
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
                  onPress={() => setRating(n)}
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
            {!feedbackDone ? (
              <>
                <TextInput
                  value={comment}
                  onChangeText={setComment}
                  onFocus={handleFocus}
                  placeholder="Tell us how it was (optional)"
                  placeholderTextColor="#B8A99C"
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

        {isNew ? (
          <View className="mt-5">
            <Button
              label="Back to home"
              variant="outline"
              onPress={() => router.replace("/home")}
            />
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function PulseRing() {
  const reduced = useReducedMotion();
  const v = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    v.value = withRepeat(withTiming(1, { duration: 1400 }), -1, false);
    return () => cancelAnimation(v);
  }, [reduced, v]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + v.value * 0.8 }],
    opacity: 0.45 * (1 - v.value),
  }));
  return (
    <Animated.View
      style={style}
      className="absolute h-9 w-9 rounded-full bg-accent"
      pointerEvents="none"
    />
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
