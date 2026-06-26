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
import { formatDateTime, peso, pickupNumber, statusLabel } from "@/lib/format";
import { haptics } from "@/lib/haptics";
import {
  buildReceiptHtml,
  DEFAULT_RECEIPT_OPTIONS,
  RECEIPT_ACCENTS,
  receiptLines,
  type ReceiptOptions,
} from "@/lib/receiptHtml";
import type { Order } from "@/types/models";

// Theme-neutral receipt "paper" — always warm ivory + espresso ink so the
// on-screen preview matches the exported PDF in both light and dark mode.
const PAPER = {
  bg: "#FBF7EF",
  ink: "#2A1D14",
  sub: "#8A7C6E",
  body: "#4A3D31",
  line: "#EFE7D9",
  dash: "#DCD0BF",
  good: "#2E7D52",
  pending: "#B23B0E",
};

export default function ReceiptScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [opts, setOpts] = useState<ReceiptOptions>(DEFAULT_RECEIPT_OPTIONS);
  const [sharing, setSharing] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);

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
  const paymentPending = order.payment_method === "Cash" && order.payment_status !== "paid";

  return (
    <Screen edges={["top"]}>
      <Header title="Digital receipt" />
      <ScrollView contentContainerClassName="p-5 pb-40" showsVerticalScrollIndicator={false}>
        {/* Collapsed customize controls — the preview stays the focus */}
        <Pressable
          onPress={() => setCustomizeOpen((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: customizeOpen }}
          className="mb-4 flex-row items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3"
        >
          <View className="flex-row items-center gap-2">
            <Ionicons name="options-outline" size={18} color={Colors.brand} />
            <Text className="text-sm font-semibold text-textPrimary">Customize receipt</Text>
          </View>
          <Ionicons
            name={customizeOpen ? "chevron-up" : "chevron-down"}
            size={18}
            color={Colors.textMuted}
          />
        </Pressable>

        {customizeOpen ? (
          <View className="mb-4">
            <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-textMuted">
              Accent
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
                      style={{ backgroundColor: a.value }}
                      className={`h-10 w-10 items-center justify-center rounded-full ${on ? "border-2 border-textPrimary" : ""}`}
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
              placeholderTextColor={Colors.textMuted}
              maxLength={80}
              className="mb-4 rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-textPrimary"
            />

            <View className="overflow-hidden rounded-2xl border border-line bg-surface">
              <ToggleRow
                label="Item customizations"
                value={opts.showCustomizations}
                onChange={(v) => set("showCustomizations", v)}
              />
              {order.tip_amount ? (
                <ToggleRow
                  label="Tip"
                  value={opts.showTip}
                  onChange={(v) => set("showTip", v)}
                  border
                />
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
          </View>
        ) : null}

        {/* Live preview — theme-neutral ivory paper (matches the PDF) */}
        <View
          style={{ backgroundColor: PAPER.bg, borderColor: PAPER.line }}
          className="overflow-hidden rounded-card border"
        >
          <View style={{ backgroundColor: opts.accent }} className="mx-6 mt-5 h-1 rounded-full" />
          <View className="items-center px-6 pt-3">
            <Text style={{ color: opts.accent }} className="font-display text-2xl">
              Cafinity
            </Text>
            <Text style={{ color: PAPER.sub }} className="text-xs">
              Coffee &amp; more
            </Text>
            <Text style={{ color: PAPER.ink }} className="mt-2 text-sm font-bold">
              {order.branches?.name ?? "Cafinity"}
            </Text>
            {order.branches?.address ? (
              <Text style={{ color: PAPER.sub }} className="text-[11px]">
                {order.branches.address}
              </Text>
            ) : null}
            {opts.headerNote.trim() ? (
              <Text style={{ color: PAPER.body }} className="mt-2 text-center text-sm italic">
                {opts.headerNote.trim()}
              </Text>
            ) : null}
          </View>

          <View style={{ borderColor: PAPER.dash }} className="mx-6 my-3 border-t border-dashed" />
          <View className="items-center px-6">
            <Text style={{ color: PAPER.sub }} className="text-[10px] uppercase tracking-[2px]">
              Pickup number
            </Text>
            <Text style={{ color: opts.accent }} className="font-display text-4xl">
              {pickup}
            </Text>
          </View>
          <View style={{ borderColor: PAPER.dash }} className="mx-6 my-3 border-t border-dashed" />

          <View className="px-6">
            {order.order_number ? (
              <MetaRow label="Reference" value={order.order_number} />
            ) : null}
            <MetaRow label="Date" value={formatDateTime(order.created_at)} />
            <MetaRow label="Status" value={statusLabel(order.status)} />
          </View>

          <View className="mt-2 px-6">
            {(order.order_items ?? []).map((it) => (
              <View
                key={it.id}
                style={{ borderColor: PAPER.line }}
                className="flex-row border-b py-2.5"
              >
                <Text style={{ color: opts.accent }} className="w-7 font-bold">
                  {it.quantity}×
                </Text>
                <View className="flex-1 pr-2">
                  <Text style={{ color: PAPER.ink }} className="text-sm font-semibold">
                    {it.product_name}
                  </Text>
                  <Text style={{ color: PAPER.sub }} className="text-xs">
                    {it.variant_name}
                  </Text>
                  {opts.showCustomizations && it.order_item_customization.length > 0 ? (
                    <Text style={{ color: PAPER.sub }} className="text-xs">
                      {it.order_item_customization.map((c) => c.option_name).join(" · ")}
                    </Text>
                  ) : null}
                  {it.item_notes ? (
                    <Text style={{ color: PAPER.sub }} className="text-xs italic">
                      Note: {it.item_notes}
                    </Text>
                  ) : null}
                </View>
                <Text
                  style={{ color: PAPER.ink, fontVariant: ["tabular-nums"] }}
                  className="text-sm font-semibold"
                >
                  {peso(it.subtotal)}
                </Text>
              </View>
            ))}
          </View>

          <View className="px-6 pt-3">
            {lines.map((l, i) => (
              <View key={i} className="flex-row justify-between py-0.5">
                <Text style={{ color: l.kind === "discount" ? PAPER.good : PAPER.body }} className="text-xs">
                  {l.label}
                </Text>
                <Text
                  style={{
                    color: l.kind === "discount" ? PAPER.good : PAPER.ink,
                    fontVariant: ["tabular-nums"],
                  }}
                  className="text-xs"
                >
                  {l.value}
                </Text>
              </View>
            ))}
          </View>

          <View
            style={{ borderColor: PAPER.ink }}
            className="mx-6 mt-2 flex-row justify-between border-t-2 pt-2"
          >
            <Text style={{ color: PAPER.ink }} className="font-display text-base">
              Total
            </Text>
            <Text
              style={{ color: PAPER.ink, fontVariant: ["tabular-nums"] }}
              className="font-display text-base"
            >
              {peso(order.total_amount)}
            </Text>
          </View>

          {paymentPending ? (
            <Text style={{ color: PAPER.pending }} className="mx-6 mt-2 text-xs font-bold">
              {order.payment_method} — Payment pending
            </Text>
          ) : (
            <View className="mx-6 mt-2 flex-row justify-between">
              <Text style={{ color: PAPER.sub }} className="text-xs">
                {order.payment_method}
              </Text>
              <Text style={{ color: PAPER.sub }} className="text-xs">
                {order.payment_status}
              </Text>
            </View>
          )}

          {opts.showPoints ? (
            <View
              style={{ backgroundColor: `${opts.accent}14` }}
              className="mx-6 mt-3 rounded-xl py-2"
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

          <Text style={{ color: PAPER.sub }} className="px-6 pb-5 pt-4 text-center text-[11px]">
            Thank you for choosing Cafinity ☕
          </Text>
        </View>
      </ScrollView>

      <StickyActionBar>
        <Button
          label={sharing ? "Preparing…" : "Share or save receipt"}
          onPress={onShare}
          loading={sharing}
          haptic="light"
          leftIcon={<Ionicons name="share-outline" size={18} color="#fff" />}
        />
      </StickyActionBar>
    </Screen>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between py-0.5">
      <Text style={{ color: PAPER.sub }} className="text-xs">
        {label}
      </Text>
      <Text style={{ color: PAPER.ink }} className="text-xs font-semibold">
        {value}
      </Text>
    </View>
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
