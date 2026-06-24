import { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { AnimatedPressable } from "@/components/ui/AnimatedPressable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { PriceText } from "@/components/ui/PriceText";
import { ProductImage } from "@/components/ui/ProductImage";
import { Screen } from "@/components/ui/Screen";
import { Skeleton } from "@/components/ui/Skeleton";
import { Colors, shadow } from "@/constants/theme";
import { getOrders } from "@/lib/api";
import { getEmptyStateImage } from "@/lib/emptyStateImages";
import { humanizeError } from "@/lib/errors";
import { formatDateTime, formatEta, statusLabel } from "@/lib/format";
import { haptics } from "@/lib/haptics";
import { localProductImage } from "@/lib/productImages";
import type { Order, OrderStatus } from "@/types/models";

type Tab = "active" | "history" | "cancelled";
const ACTIVE: OrderStatus[] = ["pending", "preparing", "ready"];

function railColor(status: OrderStatus): string {
  if (status === "ready") return Colors.success;
  if (status === "preparing") return Colors.warning;
  if (status === "completed") return Colors.success;
  if (status === "cancelled") return Colors.danger;
  return Colors.info;
}
function chipTone(status: OrderStatus): "red" | "green" | "blue" | "amber" | "gray" {
  if (status === "cancelled") return "red";
  if (status === "completed") return "green";
  if (status === "ready") return "green";
  if (status === "preparing") return "amber";
  return "blue";
}
function itemCount(o: Order): number {
  return (o.order_items ?? []).reduce((n, i) => n + (i.quantity ?? 1), 0);
}

/** Bucket a date for history grouping. */
function bucket(iso: string): string {
  const now = new Date();
  const d = new Date(iso);
  const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  startOfWeek.setDate(startOfWeek.getDate() - ((now.getDay() + 6) % 7));
  if (d.getTime() >= startOfWeek.getTime()) return "This week";
  if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear())
    return "Earlier this month";
  return "Older";
}

type Row = { kind: "header"; label: string } | { kind: "order"; order: Order };

export default function OrdersScreen() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>("active");

  const load = useCallback(async () => {
    setError(null);
    try {
      setOrders(await getOrders());
    } catch (e) {
      setError(humanizeError(e, "Could not load your orders."));
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const counts = useMemo(() => {
    let active = 0;
    let history = 0;
    let cancelled = 0;
    for (const o of orders) {
      if (o.status === "cancelled") cancelled += 1;
      else if (ACTIVE.includes(o.status)) active += 1;
      else history += 1;
    }
    return { active, history, cancelled };
  }, [orders]);

  // Flat list rows for the selected tab (history gets date-group headers).
  const rows = useMemo<Row[]>(() => {
    if (tab === "active") {
      return orders.filter((o) => ACTIVE.includes(o.status)).map((o) => ({ kind: "order", order: o }));
    }
    if (tab === "cancelled") {
      return orders.filter((o) => o.status === "cancelled").map((o) => ({ kind: "order", order: o }));
    }
    // history (completed), grouped by date
    const list = orders.filter((o) => o.status === "completed");
    const out: Row[] = [];
    let last = "";
    for (const o of list) {
      const b = bucket(o.created_at);
      if (b !== last) {
        out.push({ kind: "header", label: b });
        last = b;
      }
      out.push({ kind: "order", order: o });
    }
    return out;
  }, [orders, tab]);

  const emptyImage =
    tab === "cancelled" ? getEmptyStateImage("orders") : getEmptyStateImage("orders");

  return (
    <Screen>
      <View className="px-5 pb-2 pt-2">
        <Text className="font-display text-3xl text-textPrimary">My orders</Text>
      </View>

      {/* Tabs */}
      <View className="mx-5 mb-2 flex-row rounded-2xl bg-surfaceMuted p-1">
        {(
          [
            ["active", "Active", counts.active],
            ["history", "History", counts.history],
            ["cancelled", "Cancelled", counts.cancelled],
          ] as const
        ).map(([key, label, n]) => {
          const on = tab === key;
          return (
            <Pressable
              key={key}
              onPress={() => {
                if (key !== tab) haptics.selection();
                setTab(key);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${label}${n > 0 ? `, ${n} orders` : ""}`}
              className={`flex-1 items-center rounded-xl py-2.5 ${on ? "bg-surface" : ""}`}
              style={on ? shadow.card : undefined}
            >
              <Text className={`text-sm font-semibold ${on ? "text-textPrimary" : "text-textMuted"}`}>
                {label}
                {n > 0 ? ` ${n}` : ""}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View className="gap-3 p-4">
          {[0, 1, 2].map((i) => (
            <OrderSkeleton key={i} />
          ))}
        </View>
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r, i) => (r.kind === "header" ? `h-${r.label}-${i}` : r.order.id)}
          contentContainerClassName="p-4 gap-3"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brand} />
          }
          ListEmptyComponent={
            <EmptyState
              image={emptyImage}
              emoji="🧾"
              title={
                tab === "active"
                  ? "No active orders"
                  : tab === "cancelled"
                    ? "No cancelled orders"
                    : "No past orders yet"
              }
              subtitle={
                tab === "active"
                  ? "Place an order and track it here."
                  : "Completed orders will show up here."
              }
            >
              {tab === "active" ? (
                <Button label="Start an order" onPress={() => router.push("/menu")} />
              ) : undefined}
            </EmptyState>
          }
          renderItem={({ item }) =>
            item.kind === "header" ? (
              <Text className="mt-1 px-1 text-xs font-semibold uppercase tracking-wide text-textMuted">
                {item.label}
              </Text>
            ) : tab === "active" ? (
              <ActiveOrderCard
                order={item.order}
                onTrack={() => router.push(`/order/${item.order.id}`)}
              />
            ) : (
              <CompactOrderRow
                order={item.order}
                onOpen={() => router.push(`/order/${item.order.id}`)}
                onReorder={() => router.push(`/reorder/${item.order.id}`)}
              />
            )
          }
        />
      )}
    </Screen>
  );
}

function OrderSkeleton() {
  return (
    <View className="rounded-card border border-line bg-surface p-4">
      <View className="flex-row items-center justify-between">
        <Skeleton className="h-5 w-24 rounded-md" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </View>
      <Skeleton className="mt-2 h-3 w-44 rounded-md" />
      <View className="mt-4 flex-row items-center justify-between">
        <Skeleton className="h-9 w-24 rounded-lg" />
        <Skeleton className="h-9 w-20 rounded-full" />
      </View>
    </View>
  );
}

function Thumbs({ order }: { order: Order }) {
  const items = (order.order_items ?? []).slice(0, 2);
  if (items.length === 0) return null;
  return (
    <View className="flex-row">
      {items.map((it, i) => (
        <ProductImage
          key={i}
          source={localProductImage(it.product_name)}
          emoji="☕"
          emojiSize={14}
          className={`h-9 w-9 rounded-lg border-2 border-surface ${i > 0 ? "-ml-3" : ""}`}
          accessibilityLabel={it.product_name}
        />
      ))}
    </View>
  );
}

function ActiveOrderCard({ order, onTrack }: { order: Order; onTrack: () => void }) {
  const eta =
    order.status === "pending" || order.status === "preparing"
      ? formatEta(order.estimated_min_minutes, order.estimated_max_minutes)
      : null;
  return (
    <AnimatedPressable
      onPress={onTrack}
      haptic="light"
      accessibilityRole="button"
      accessibilityLabel={`${order.order_number ?? "Order"}, ${statusLabel(order.status)}. Tap to track.`}
      className="flex-row overflow-hidden rounded-card border border-line bg-surface"
      style={shadow.card}
    >
      <View style={{ width: 5, backgroundColor: railColor(order.status) }} />
      <View className="flex-1 p-4">
        <View className="flex-row items-center justify-between">
          <Text className="font-display text-lg text-textPrimary">
            {order.order_number ?? "Order"}
          </Text>
          <Badge label={statusLabel(order.status)} tone={chipTone(order.status)} />
        </View>
        <Text className="mt-0.5 text-xs text-textMuted">
          {order.branches?.name ?? ""} · {itemCount(order)} item
          {itemCount(order) === 1 ? "" : "s"}
          {eta ? ` · ${eta}` : order.status === "ready" ? " · ready for pickup" : ""}
        </Text>
        <View className="mt-3 flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            <Thumbs order={order} />
            <PriceText amount={order.total_amount} size="md" />
          </View>
          <View className="flex-row items-center gap-1 rounded-full bg-brandPrimary px-4 py-2">
            <Ionicons name="navigate" size={14} color="#fff" />
            <Text className="text-sm font-bold text-white">Track</Text>
          </View>
        </View>
      </View>
    </AnimatedPressable>
  );
}

function CompactOrderRow({
  order,
  onOpen,
  onReorder,
}: {
  order: Order;
  onOpen: () => void;
  onReorder: () => void;
}) {
  return (
    <AnimatedPressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${order.order_number ?? "Order"}, ${statusLabel(order.status)}. Tap for details.`}
      className="flex-row items-center rounded-card border border-line bg-surface p-3"
    >
      <Thumbs order={order} />
      <View className="ml-3 flex-1">
        <View className="flex-row items-center gap-2">
          <Text className="font-display text-base text-textPrimary">
            {order.order_number ?? "Order"}
          </Text>
          <Badge label={statusLabel(order.status)} tone={chipTone(order.status)} />
        </View>
        <Text className="text-xs text-textMuted">
          {formatDateTime(order.created_at)} · {order.branches?.name ?? ""}
        </Text>
      </View>
      <View className="items-end gap-1">
        <PriceText amount={order.total_amount} size="sm" />
        <Pressable
          onPress={() => {
            haptics.light();
            onReorder();
          }}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Reorder this order"
          className="flex-row items-center gap-1 rounded-full border border-line px-2.5 py-1"
        >
          <Ionicons name="repeat" size={13} color={Colors.brand} />
          <Text className="text-[11px] font-bold text-brandPrimary">Reorder</Text>
        </Pressable>
      </View>
    </AnimatedPressable>
  );
}
