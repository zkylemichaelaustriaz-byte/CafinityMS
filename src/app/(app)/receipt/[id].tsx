import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Button } from "@/components/ui/Button";
import { Header } from "@/components/ui/Header";
import { Screen } from "@/components/ui/Screen";
import { StickyActionBar } from "@/components/ui/StickyActionBar";
import { Colors } from "@/constants/theme";
import { getOrder } from "@/lib/api";
import { humanizeError } from "@/lib/errors";
import { formatDateTime, peso, pickupNumber } from "@/lib/format";
import { haptics } from "@/lib/haptics";
import {
  buildReceiptHtml,
  DEFAULT_RECEIPT_OPTIONS,
  RECEIPT_ACCENTS,
  receiptLines,
  type ReceiptOptions,
} from "@/lib/receiptHtml";
import type { Order } from "@/types/models";

export default function ReceiptScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [opts, setOpts] = useState<ReceiptOptions>(DEFAULT_RECEIPT_OPTIONS);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (!id) return;
    getOrder(id)
      .then(setOrder)
      .catch(() => setOrder(null))
      .finally(() => setLoading(false));
  }, [id]);

  const lines = useMemo(() => (order ? receiptLines(order, opts) : []), [order, opts]);

  function set<K extends keyof ReceiptOptions>(key: K, value: ReceiptOptions[K]) {
    setOpts((p) => ({ ...p, [key]: value }));
  }

  async function onShare() {
    if (!order) return;
    setSharing(true);
    try {
      const html = buildReceiptHtml(order, opts);
      const { uri } = await Print.printToFileAsync({ html });
      haptics.success();
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          UTI: "com.adobe.pdf",
          dialogTitle: "Cafinity receipt",
        });
      } else {
        Alert.alert("Receipt saved", `Your receipt PDF was saved to:\n${uri}`);
      }
    } catch (e) {
      Alert.alert("Couldn't create the receipt", humanizeError(e));
    } finally {
      setSharing(false);
    }
  }

  if (loading) {
    return (
      <Screen edges={["top", "bottom"]}>
        <Header title="Receipt" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={Colors.brand} />
        </View>
      </Screen>
    );
  }
  if (!order) {
    return (
      <Screen edges={["top", "bottom"]}>
        <Header title="Receipt" />
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-center text-textSecondary">Order not found.</Text>
        </View>
      </Screen>
    );
  }

  const pickup = pickupNumber(order) ?? order.order_number ?? "—";

  return (
    <Screen edges={["top"]}>
      <Header title="Digital receipt" />
      <ScrollView contentContainerClassName="p-5 pb-40" showsVerticalScrollIndicator={false}>
        {/* Customize */}
        <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-textMuted">
          Theme
        </Text>
        <View className="mb-4 flex-row gap-3">
          {RECEIPT_ACCENTS.map((a) => {
            const on = opts.accent === a.value;
            return (
              <Pressable
                key={a.value}
                onPress={() => set("accent", a.value)}
                accessibilityLabel={a.label}
                accessibilityState={{ selected: on }}
                className="items-center"
              >
                <View
                  style={{ backgroundColor: a.value, borderColor: on ? a.value : "transparent" }}
                  className={`h-10 w-10 items-center justify-center rounded-full ${on ? "border-2" : ""}`}
                >
                  {on ? <Ionicons name="checkmark" size={18} color="#fff" /> : null}
                </View>
                <Text className="mt-1 text-[10px] text-textMuted">{a.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-textMuted">
          Personal note
        </Text>
        <TextInput
          value={opts.headerNote}
          onChangeText={(t) => set("headerNote", t)}
          placeholder="e.g. Thanks for the coffee run!"
          placeholderTextColor="#B8A99C"
          maxLength={80}
          className="mb-4 rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-textPrimary"
        />

        <View className="mb-5 overflow-hidden rounded-2xl border border-line bg-surface">
          <ToggleRow
            label="Item customizations"
            value={opts.showCustomizations}
            onChange={(v) => set("showCustomizations", v)}
          />
          {order.tip_amount ? (
            <ToggleRow label="Tip" value={opts.showTip} onChange={(v) => set("showTip", v)} border />
          ) : null}
          <ToggleRow
            label="Tax / VAT breakdown"
            value={opts.showTax}
            onChange={(v) => set("showTax", v)}
            border
          />
          <ToggleRow
            label="Loyalty points"
            value={opts.showPoints}
            onChange={(v) => set("showPoints", v)}
            border
          />
        </View>

        {/* Live preview */}
        <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-textMuted">
          Preview
        </Text>
        <View className="overflow-hidden rounded-card border border-line bg-surface">
          <View style={{ backgroundColor: opts.accent }} className="items-center px-6 py-5">
            <Text className="font-display text-2xl text-white">Cafinity</Text>
            <Text className="text-xs text-white/80">Coffee &amp; more</Text>
            {opts.headerNote.trim() ? (
              <Text className="mt-2 text-center text-sm italic text-white/95">
                {opts.headerNote.trim()}
              </Text>
            ) : null}
          </View>

          <View className="items-center border-b border-dashed border-line px-6 py-4">
            <Text className="text-[11px] uppercase tracking-wide text-textMuted">Pickup number</Text>
            <Text style={{ color: opts.accent }} className="font-display text-4xl">
              {pickup}
            </Text>
          </View>

          <View className="border-b border-dashed border-line px-6 py-3">
            {order.order_number ? (
              <Text className="text-xs text-textMuted">Ref {order.order_number}</Text>
            ) : null}
            <Text className="text-xs text-textMuted">{formatDateTime(order.created_at)}</Text>
            <Text className="text-xs text-textMuted">
              Pickup at {order.branches?.name ?? "your branch"}
            </Text>
          </View>

          <View className="px-6">
            {(order.order_items ?? []).map((it) => (
              <View key={it.id} className="flex-row border-b border-line py-2.5">
                <Text style={{ color: opts.accent }} className="w-8 font-bold">
                  {it.quantity}×
                </Text>
                <View className="flex-1 pr-2">
                  <Text className="text-sm font-semibold text-textPrimary">{it.product_name}</Text>
                  <Text className="text-xs text-textMuted">{it.variant_name}</Text>
                  {opts.showCustomizations && it.order_item_customization.length > 0 ? (
                    <Text className="text-xs text-textMuted">
                      {it.order_item_customization.map((c) => c.option_name).join(" · ")}
                    </Text>
                  ) : null}
                  {it.item_notes ? (
                    <Text className="text-xs italic text-textMuted">Note: {it.item_notes}</Text>
                  ) : null}
                </View>
                <Text className="text-sm font-semibold text-textPrimary">{peso(it.subtotal)}</Text>
              </View>
            ))}
          </View>

          <View className="px-6 py-3">
            {lines.map((l, i) => (
              <View key={i} className="flex-row justify-between py-0.5">
                <Text
                  className={`text-xs ${l.kind === "discount" ? "text-success" : "text-textSecondary"}`}
                >
                  {l.label}
                </Text>
                <Text
                  className={`text-xs ${l.kind === "discount" ? "text-success" : "text-textPrimary"}`}
                >
                  {l.value}
                </Text>
              </View>
            ))}
            <View className="mt-2 flex-row justify-between border-t-2 border-textPrimary pt-2">
              <Text className="font-heading text-base text-textPrimary">Total</Text>
              <Text className="font-display text-base text-textPrimary">
                {peso(order.total_amount)}
              </Text>
            </View>
          </View>

          <View className="flex-row justify-between px-6 pb-3">
            <Text className="text-xs text-textMuted">{order.payment_method}</Text>
            <Text className="text-xs text-textMuted">{order.payment_status}</Text>
          </View>

          {opts.showPoints ? (
            <View
              style={{ backgroundColor: `${opts.accent}14` }}
              className="mx-6 mb-4 rounded-xl py-2"
            >
              <Text style={{ color: opts.accent }} className="text-center text-xs font-bold">
                {order.points_state === "earned"
                  ? `+${order.points_earned} points earned`
                  : order.points_state === "reversed"
                    ? "Points reversed"
                    : `${order.points_earned} points pending`}
              </Text>
            </View>
          ) : null}

          <Text className="px-6 pb-5 text-center text-[11px] text-textMuted">
            Thank you for choosing Cafinity ☕
          </Text>
        </View>
      </ScrollView>

      <StickyActionBar>
        <Button
          label={sharing ? "Preparing…" : "Share / Save PDF"}
          onPress={onShare}
          loading={sharing}
          haptic="light"
        />
      </StickyActionBar>
    </Screen>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
  border,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  border?: boolean;
}) {
  return (
    <View
      className={`flex-row items-center justify-between px-4 py-3 ${border ? "border-t border-line" : ""}`}
    >
      <Text className="text-sm text-textPrimary">{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: Colors.brand }} />
    </View>
  );
}
