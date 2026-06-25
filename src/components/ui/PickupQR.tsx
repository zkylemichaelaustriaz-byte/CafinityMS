import { Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { pickupNumber } from "@/lib/format";
import type { Order } from "@/types/models";

/**
 * Pickup QR shown to the customer at the counter. The code encodes ONLY an
 * opaque order identifier (for an authenticated staff lookup) — never the
 * customer's name, the price, or the items. Rendered on a fixed white tile so
 * it stays scannable in dark mode.
 */
export function PickupQR({ order, size = 176 }: { order: Order; size?: number }) {
  const value = `cafinity:order:${order.id}`;
  return (
    <View className="items-center rounded-card border border-line bg-surface p-5">
      <Text className="text-[11px] uppercase tracking-wide text-textMuted">Pickup code</Text>
      <Text className="mb-3 mt-0.5 font-display text-3xl text-textPrimary">
        {pickupNumber(order) ?? order.order_number ?? "—"}
      </Text>
      <View className="rounded-2xl bg-white p-3">
        <QRCode value={value} size={size} color="#231711" backgroundColor="#FFFFFF" />
      </View>
      <Text className="mt-3 text-center text-xs text-textSecondary">
        Show this at the counter to collect your order.
      </Text>
    </View>
  );
}
