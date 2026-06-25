import { useCallback, useEffect, useState } from "react";
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
import { useLocalSearchParams } from "expo-router";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Header } from "@/components/ui/Header";
import { useKeyboardAwareScroll } from "@/components/ui/KeyboardAwareScrollView";
import { PriceText } from "@/components/ui/PriceText";
import { ProductImage } from "@/components/ui/ProductImage";
import { Screen } from "@/components/ui/Screen";
import { StickyActionBar } from "@/components/ui/StickyActionBar";
import { Colors } from "@/constants/theme";
import { localProductImage } from "@/lib/productImages";
import {
  advanceOrderStatus,
  cancelOrder,
  confirmCashPayment,
  getAppSettings,
  getOrder,
  getOrderCustomer,
  setOrderEta,
  subscribeOrder,
  verifyStatutoryDiscount,
} from "@/lib/api";
import { humanizeError } from "@/lib/errors";
import { formatDateTime, formatEta, peso, pickupOrRef, statusLabel } from "@/lib/format";
import { mapOrderError } from "@/lib/orderErrors";
import type { Order, OrderStatus } from "@/types/models";

function nextAction(status: OrderStatus): { label: string } | null {
  if (status === "pending") return { label: "Start preparing" };
  if (status === "preparing") return { label: "Mark as ready" };
  if (status === "ready") return { label: "Complete order" };
  return null;
}

export default function StaffOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [customer, setCustomer] = useState<{ first_name: string; last_name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [reasonRequired, setReasonRequired] = useState(false);
  const { scrollRef, handleFocus } = useKeyboardAwareScroll();

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setOrder(await getOrder(id));
      getOrderCustomer(id)
        .then(setCustomer)
        .catch(() => {});
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
    getAppSettings()
      .then((s) => setReasonRequired(s.cancellation_reason_required))
      .catch(() => {});
  }, [load]);

  useEffect(() => {
    if (!id) return;
    return subscribeOrder(id, (row) =>
      setOrder((prev) => (prev ? { ...prev, ...row } : prev)),
    );
  }, [id]);

  // Live elapsed-time ticker while the order is still active.
  const ticking = order && order.status !== "completed" && order.status !== "cancelled";
  useEffect(() => {
    if (!ticking) return;
    const t = setInterval(() => setNow(Date.now()), 20000);
    return () => clearInterval(t);
  }, [ticking]);

  async function doAdvance() {
    if (!order) return;
    setBusy(true);
    try {
      const next = await advanceOrderStatus(order.id);
      setOrder((prev) => (prev ? { ...prev, status: next } : prev));
    } catch (e) {
      await load(); // pull the latest state if it changed under us
      const { title, message } = mapOrderError(e);
      Alert.alert(title, message);
    } finally {
      setBusy(false);
    }
  }

  async function doConfirmCash() {
    if (!order) return;
    setBusy(true);
    try {
      await confirmCashPayment(order.id);
      setOrder((prev) => (prev ? { ...prev, payment_status: "paid" } : prev));
    } catch (e) {
      const { title, message } = mapOrderError(e);
      Alert.alert(title, message);
    } finally {
      setBusy(false);
    }
  }

  async function doCancel() {
    if (!order) return;
    if (reasonRequired && !cancelReason.trim()) {
      Alert.alert("Reason required", "Enter a reason to cancel this order.");
      return;
    }
    setBusy(true);
    try {
      await cancelOrder(order.id, cancelReason.trim());
      setCancelOpen(false);
      setCancelReason("");
      await load();
    } catch (e) {
      Alert.alert("Could not cancel", humanizeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function adjustEta(delta: number) {
    if (!order) return;
    const min = Math.max(0, (order.estimated_min_minutes ?? 5) + delta);
    const max = Math.max(min, (order.estimated_max_minutes ?? 10) + delta);
    setBusy(true);
    try {
      await setOrderEta(order.id, min, max);
      await load();
    } catch (e) {
      Alert.alert("Could not update ETA", humanizeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function doVerify(approve: boolean) {
    if (!order) return;
    setBusy(true);
    try {
      await verifyStatutoryDiscount(order.id, approve, approve ? "" : "ID could not be verified");
      await load();
    } catch (e) {
      Alert.alert("Could not update", humanizeError(e));
    } finally {
      setBusy(false);
    }
  }

  function confirmReject() {
    Alert.alert(
      "Reject discount?",
      "The PWD/Senior discount will be removed and the order recalculated to full price.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Reject", style: "destructive", onPress: () => void doVerify(false) },
      ],
    );
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

  const action = nextAction(order.status);
  const done = order.status === "completed" || order.status === "cancelled";
  const cashUnpaid = order.payment_method === "Cash" && order.payment_status !== "paid";
  const elapsedMin = Math.max(0, Math.floor((now - new Date(order.created_at).getTime()) / 60000));
  const elapsedColor =
    elapsedMin >= 10 ? "text-danger" : elapsedMin >= 5 ? "text-warning" : "text-textSecondary";
  const elapsedIconColor =
    elapsedMin >= 10 ? Colors.danger : elapsedMin >= 5 ? Colors.warning : Colors.textMuted;
  const customerName = customer
    ? `${customer.first_name} ${customer.last_name}`.trim()
    : order.discount_holder_name || null;
  const needsVerify =
    !!order.statutory_discount_type && order.discount_verification === "pending_verification";

  return (
    <Screen edges={["top"]}>
      <Header title={`Pickup ${pickupOrRef(order)}`} />
      <ScrollView
        ref={scrollRef}
        contentContainerClassName="p-5 pb-40"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
      >
        <View className="flex-row items-center justify-between">
          <Text className="text-xs text-textMuted">
            {order.order_number ? `Ref ${order.order_number} · ` : ""}Placed{" "}
            {formatDateTime(order.created_at)}
          </Text>
          <Badge
            label={statusLabel(order.status)}
            tone={
              order.status === "cancelled"
                ? "red"
                : order.status === "completed"
                  ? "green"
                  : order.status === "ready"
                    ? "blue"
                    : "amber"
            }
          />
        </View>

        <View className="mt-3 flex-row items-center gap-2">
          <Ionicons name="location" size={16} color={Colors.brand} />
          <Text className="text-sm font-medium text-textPrimary">
            {order.branches?.name ?? ""}
          </Text>
        </View>

        {/* Ticket header: customer + live elapsed time */}
        <View className="mt-3 flex-row items-center justify-between rounded-card border border-line bg-surface p-3">
          <View className="flex-1 flex-row items-center gap-2 pr-2">
            <Ionicons name="person-circle-outline" size={22} color={Colors.brand} />
            <Text className="flex-1 text-base font-bold text-textPrimary" numberOfLines={1}>
              {customerName ?? "Guest"}
            </Text>
          </View>
          {!done ? (
            <View className="flex-row items-center gap-1">
              <Ionicons name="time-outline" size={14} color={elapsedIconColor} />
              <Text className={`text-sm font-bold ${elapsedColor}`}>{elapsedMin}m elapsed</Text>
            </View>
          ) : null}
        </View>

        {/* Prominent payment state */}
        {cashUnpaid ? (
          <View className="mt-3 flex-row items-center gap-2 rounded-xl border border-warning bg-warningSoft p-3">
            <Ionicons name="cash-outline" size={18} color="#b45309" />
            <View className="flex-1">
              <Text className="text-sm font-bold text-warning">Payment pending</Text>
              <Text className="text-xs text-warning">
                Cash at pickup — confirm payment before you can start preparing.
              </Text>
            </View>
          </View>
        ) : (
          <View className="mt-3 flex-row items-center gap-2 rounded-xl border border-green-200 bg-successSoft p-3">
            <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
            <Text className="text-sm font-semibold text-success">
              Paid · {order.payment_method}
            </Text>
          </View>
        )}

        {/* PWD / Senior ID verification */}
        {order.statutory_discount_type ? (
          <View className="mt-3 rounded-xl border border-line bg-surface p-3">
            <Text className="text-[11px] font-semibold uppercase tracking-wide text-textMuted">
              {order.statutory_discount_type === "Senior" ? "Senior Citizen" : "PWD"} discount ·
              verification
            </Text>
            <Text className="mt-1 text-sm font-bold text-textPrimary">
              {order.discount_holder_name || "—"}
            </Text>
            <Text className="text-xs text-textMuted">ID {order.discount_masked_id || "—"}</Text>
            {needsVerify ? (
              <View className="mt-2 flex-row gap-2">
                <Pressable
                  onPress={() => void doVerify(true)}
                  disabled={busy}
                  className="flex-1 items-center rounded-xl bg-success py-2.5"
                >
                  <Text className="text-sm font-bold text-white">Verify ID</Text>
                </Pressable>
                <Pressable
                  onPress={confirmReject}
                  disabled={busy}
                  className="flex-1 items-center rounded-xl border border-danger py-2.5"
                >
                  <Text className="text-sm font-bold text-danger">Reject</Text>
                </Pressable>
              </View>
            ) : (
              <Text
                className={`mt-1 text-xs font-bold ${
                  order.discount_verification === "verified" ? "text-success" : "text-danger"
                }`}
              >
                {order.discount_verification === "verified"
                  ? "Verified"
                  : "Rejected — full price applied"}
              </Text>
            )}
          </View>
        ) : null}

        {/* Estimated prep time + manual adjust */}
        {(order.status === "pending" || order.status === "preparing") &&
        order.estimated_max_minutes ? (
          <View className="mt-3 flex-row items-center justify-between rounded-xl border border-line bg-surface p-3">
            <View className="flex-row items-center gap-2">
              <Ionicons name="time-outline" size={16} color={Colors.brand} />
              <Text className="text-sm font-medium text-textPrimary">
                ETA {formatEta(order.estimated_min_minutes, order.estimated_max_minutes)}
              </Text>
            </View>
            <View className="flex-row gap-2">
              <Pressable
                onPress={() => void adjustEta(-5)}
                disabled={busy}
                className="h-8 w-8 items-center justify-center rounded-full bg-surfaceMuted"
              >
                <Ionicons name="remove" size={16} color={Colors.brand} />
              </Pressable>
              <Pressable
                onPress={() => void adjustEta(5)}
                disabled={busy}
                className="h-8 w-8 items-center justify-center rounded-full bg-surfaceMuted"
              >
                <Ionicons name="add" size={16} color={Colors.brand} />
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* Special instructions — highlighted so a barista never misses it */}
        {order.notes ? (
          <View className="mt-3 rounded-xl border-2 border-warning bg-warningSoft p-3">
            <View className="flex-row items-center gap-1.5">
              <Ionicons name="alert-circle" size={16} color={Colors.warning} />
              <Text className="text-xs font-bold uppercase tracking-wide text-warning">
                Special instructions
              </Text>
            </View>
            <Text className="mt-1 text-base font-medium text-textPrimary">{order.notes}</Text>
          </View>
        ) : null}

        {/* Items */}
        <Text className="mb-2 mt-5 font-heading text-base text-textPrimary">
          Items to prepare
        </Text>
        <View className="rounded-card border border-line bg-surface p-4">
          {(order.order_items ?? []).map((it) => {
            const temp =
              it.presentation_key ??
              it.order_item_customization
                .find((c) => ["hot", "iced"].includes(c.option_name.toLowerCase()))
                ?.option_name.toLowerCase();
            return (
            <View key={it.id} className="mb-3 flex-row border-b border-line pb-3">
              <ProductImage
                source={localProductImage(it.product_name)}
                emoji="☕"
                emojiSize={18}
                className="mr-3 h-12 w-12 rounded-xl"
                accessibilityLabel={it.product_name}
              />
              <View className="flex-1">
                <View className="flex-row justify-between">
                  <Text className="flex-1 pr-2 text-base font-bold text-textPrimary">
                    {it.quantity}× {it.product_name}
                  </Text>
                  <Text className="text-sm font-semibold text-textPrimary">
                    {peso(it.subtotal)}
                  </Text>
                </View>
                <View className="flex-row items-center gap-2">
                  <Text className="text-sm font-semibold text-brandPrimary">{it.variant_name}</Text>
                  {temp ? (
                    <View className="rounded-full bg-accent-100 px-2 py-0.5">
                      <Text className="text-[10px] font-bold uppercase text-brandPrimary">{temp}</Text>
                    </View>
                  ) : null}
                </View>
                {it.order_item_customization.length > 0 ? (
                  <View className="mt-1">
                    {it.order_item_customization.map((c) => (
                      <Text key={c.id} className="text-sm text-textSecondary">
                        • {c.option_name}
                      </Text>
                    ))}
                  </View>
                ) : null}
                {it.item_notes ? (
                  <Text className="mt-1 text-sm font-medium italic text-warning">
                    Note: {it.item_notes}
                  </Text>
                ) : null}
              </View>
            </View>
            );
          })}
          <View className="flex-row items-center justify-between pt-1">
            <Text className="font-heading text-sm text-textPrimary">Total</Text>
            <PriceText amount={order.total_amount} size="md" />
          </View>
          <Text className="mt-1 text-xs text-textMuted">
            {order.payment_method} · {order.payment_status}
          </Text>
        </View>

        {/* Cancellation / refund summary */}
        {order.status === "cancelled" ? (
          <View className="mt-4 rounded-card border border-line bg-surface p-4">
            <Text className="font-heading text-sm text-textPrimary">Cancellation</Text>
            {order.cancellation_reason ? (
              <Text className="mt-1 text-xs text-textSecondary">
                Reason: {order.cancellation_reason}
              </Text>
            ) : null}
            {order.refund_status === "refund_pending" ? (
              <Text className="mt-1 text-sm font-semibold text-warning">
                Return {peso(order.refunded_amount ?? 0)} cash to the customer
              </Text>
            ) : order.refund_status === "refunded" ? (
              <Text className="mt-1 text-sm font-semibold text-success">
                Refunded {peso(order.refunded_amount ?? 0)} ({order.payment_method}, simulated)
              </Text>
            ) : (
              <Text className="mt-1 text-xs text-textMuted">No payment was charged.</Text>
            )}
          </View>
        ) : null}

        {/* Inline cancel with reason */}
        {cancelOpen && !done ? (
          <View className="mt-4 rounded-card border border-line bg-surface p-4">
            <Text className="mb-1 font-heading text-sm text-textPrimary">Cancel this order?</Text>
            <Text className="mb-2 text-xs text-textSecondary">
              Restores stock, points, and any promo/voucher
              {order.payment_status === "paid"
                ? order.payment_method === "GCash"
                  ? ", and records a simulated refund"
                  : ", and flags cash to return"
                : ""}
              .
            </Text>
            <TextInput
              value={cancelReason}
              onChangeText={setCancelReason}
              onFocus={handleFocus}
              placeholder={reasonRequired ? "Reason (required)" : "Reason (optional)"}
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
                <Button label="Cancel order" variant="danger" onPress={doCancel} loading={busy} />
              </View>
            </View>
          </View>
        ) : null}
      </ScrollView>

      {!done ? (
        <StickyActionBar>
          {cashUnpaid ? (
            <>
              {needsVerify ? (
                <Text className="mb-1 text-center text-xs font-medium text-warning">
                  Verify the PWD/Senior ID before confirming payment.
                </Text>
              ) : null}
              <Pressable
                onPress={doConfirmCash}
                disabled={busy || needsVerify}
                className={`mb-2 flex-row items-center justify-center gap-2 rounded-2xl border border-green-300 bg-successSoft py-3 ${
                  needsVerify ? "opacity-40" : ""
                }`}
              >
                <Ionicons name="cash-outline" size={16} color={Colors.success} />
                <Text className="text-sm font-bold text-success">Confirm cash payment</Text>
              </Pressable>
            </>
          ) : null}
          {action && cashUnpaid ? (
            <Text className="mb-1 text-center text-xs font-medium text-warning">
              Confirm cash payment to {action.label.toLowerCase()}.
            </Text>
          ) : null}
          {action ? (
            <Button label={action.label} onPress={doAdvance} loading={busy} disabled={cashUnpaid} />
          ) : null}
          <Pressable
            onPress={() => setCancelOpen((o) => !o)}
            className="mt-2 items-center py-2"
          >
            <Text className="text-sm font-semibold text-danger">
              {cancelOpen ? "Hide cancel" : "Cancel order"}
            </Text>
          </Pressable>
        </StickyActionBar>
      ) : null}
    </Screen>
  );
}
