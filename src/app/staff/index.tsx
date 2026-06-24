import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { AnimatedPressable } from "@/components/ui/AnimatedPressable";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { PriceText } from "@/components/ui/PriceText";
import { Screen } from "@/components/ui/Screen";
import { Colors, shadow } from "@/constants/theme";
import {
  advanceOrderStatus,
  confirmCashPayment,
  getActiveOrders,
  getBranches,
  subscribeAllOrders,
} from "@/lib/api";
import { getEmptyStateImage } from "@/lib/emptyStateImages";
import { humanizeError } from "@/lib/errors";
import { formatEta, statusLabel } from "@/lib/format";
import { mapOrderError } from "@/lib/orderErrors";
import type { Branch, Order, OrderStatus } from "@/types/models";

function nextAction(
  status: OrderStatus,
): { label: string; tone: string } | null {
  if (status === "pending") return { label: "Start", tone: "bg-info" };
  if (status === "preparing") return { label: "Mark ready", tone: "bg-warning" };
  if (status === "ready") return { label: "Complete", tone: "bg-success" };
  return null;
}

function waitMinutes(iso: string, now: number): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
}

function cashUnpaidFor(o: Order): boolean {
  return o.payment_method === "Cash" && o.payment_status !== "paid";
}

function needsVerifyFor(o: Order): boolean {
  return !!o.statutory_discount_type && o.discount_verification === "pending_verification";
}

type Urgency = "normal" | "waiting" | "overdue";

/** Age-based urgency tiers used to colour the wait time + card accent. */
function urgencyOf(wait: number): Urgency {
  if (wait >= 10) return "overdue";
  if (wait >= 5) return "waiting";
  return "normal";
}

/** Relative "updated …" label for the live indicator. */
function agoLabel(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

export default function StaffQueueScreen() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [now, setNow] = useState(Date.now());
  const [lastSync, setLastSync] = useState(Date.now());

  const load = useCallback(async () => {
    setError(null);
    try {
      setOrders(await getActiveOrders());
      setLastSync(Date.now());
    } catch (e) {
      setError(humanizeError(e, "Could not load the queue."));
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    getBranches().then(setBranches).catch(() => {});
  }, []);

  // Tick so wait times and the "updated …" label stay fresh between syncs.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(t);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      const unsub = subscribeAllOrders(() => void load());
      return unsub;
    }, [load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function advance(order: Order) {
    setBusyId(order.id);
    try {
      await advanceOrderStatus(order.id);
      await load();
    } catch (e) {
      const { title, message } = mapOrderError(e);
      await load(); // refresh stale actions if another staffer moved it
      Alert.alert(title, message);
    } finally {
      setBusyId(null);
    }
  }

  async function confirmCash(order: Order) {
    setBusyId(order.id);
    try {
      await confirmCashPayment(order.id);
      await load();
    } catch (e) {
      const { title, message } = mapOrderError(e);
      Alert.alert(title, message);
    } finally {
      setBusyId(null);
    }
  }

  // Branch scope drives the metrics; search narrows only the visible list.
  const inBranch = useMemo(
    () => (branchId ? orders.filter((o) => o.branch_id === branchId) : orders),
    [orders, branchId],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return inBranch;
    return inBranch.filter((o) => (o.order_number ?? "").toLowerCase().includes(q));
  }, [inBranch, query]);

  const metrics = useMemo(() => {
    let pending = 0;
    let preparing = 0;
    let ready = 0;
    let oldest = 0;
    for (const o of inBranch) {
      if (o.status === "pending") pending += 1;
      else if (o.status === "preparing") preparing += 1;
      else if (o.status === "ready") ready += 1;
      if (o.status === "pending" || o.status === "preparing") {
        oldest = Math.max(oldest, waitMinutes(o.created_at, now));
      }
    }
    return { pending, preparing, ready, oldest };
  }, [inBranch, now]);

  return (
    <Screen>
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pb-1 pt-2">
        <View>
          <Text className="font-display text-2xl text-textPrimary">Order Queue</Text>
          <View className="mt-0.5 flex-row items-center gap-1.5">
            <View className="h-2 w-2 rounded-full bg-success" />
            <Text className="text-xs text-textMuted">
              Live · updated {agoLabel(now - lastSync)}
            </Text>
          </View>
        </View>
        <AnimatedPressable
          onPress={() => router.push("/staff/account")}
          className="h-10 w-10 items-center justify-center rounded-full bg-surface"
          style={shadow.card}
        >
          <Ionicons name="person-circle-outline" size={26} color={Colors.brand} />
        </AnimatedPressable>
      </View>

      {/* Branch filter */}
      <View className="px-5 py-2">
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[{ id: "all", name: "All branches" }, ...branches]}
          keyExtractor={(b) => b.id}
          contentContainerClassName="gap-2"
          renderItem={({ item }) => {
            const id = item.id === "all" ? null : item.id;
            const active = branchId === id;
            return (
              <Pressable
                onPress={() => setBranchId(id)}
                className={`h-9 justify-center rounded-full px-4 ${
                  active ? "bg-brandPrimary" : "bg-surface border border-line"
                }`}
              >
                <Text
                  className={`text-sm font-semibold ${active ? "text-white" : "text-textSecondary"}`}
                >
                  {item.name}
                </Text>
              </Pressable>
            );
          }}
        />
      </View>

      {/* Metrics */}
      <View className="flex-row gap-2 px-5 pb-1">
        <QueueStat label="New" value={metrics.pending} tone="info" />
        <QueueStat label="Preparing" value={metrics.preparing} tone="warning" />
        <QueueStat label="Ready" value={metrics.ready} tone="success" />
        <QueueStat
          label="Oldest"
          value={metrics.oldest > 0 ? `${metrics.oldest}m` : "—"}
          tone={metrics.oldest >= 10 ? "danger" : "muted"}
        />
      </View>

      {/* Search */}
      <View className="mx-5 mb-1 mt-2 flex-row items-center rounded-2xl border border-line bg-surface px-3">
        <Ionicons name="search" size={18} color={Colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search order number"
          placeholderTextColor="#B8A99C"
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="search"
          className="flex-1 px-2 py-3 text-base text-textPrimary"
        />
        {query ? (
          <Pressable onPress={() => setQuery("")} hitSlop={10} accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={Colors.brand} />
        </View>
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(o) => o.id}
          contentContainerClassName="p-4 gap-3"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brand} />
          }
          ListEmptyComponent={
            query.trim() ? (
              <EmptyState
                icon="search-outline"
                title="No matches"
                subtitle={`No active order matches "${query.trim()}".`}
              />
            ) : (
              <EmptyState
                image={getEmptyStateImage("queue")}
                icon="checkmark-done-circle-outline"
                title="Queue is clear"
                subtitle="No active orders right now."
              />
            )
          }
          renderItem={({ item }) => {
            const action = nextAction(item.status);
            const wait = waitMinutes(item.created_at, now);
            const itemCount = (item.order_items ?? []).reduce((n, i) => n + i.quantity, 0);
            const urgency = item.status === "ready" ? "normal" : urgencyOf(wait);
            const accent =
              urgency === "overdue"
                ? { borderLeftWidth: 4, borderLeftColor: Colors.danger }
                : urgency === "waiting"
                  ? { borderLeftWidth: 4, borderLeftColor: Colors.warning }
                  : null;
            const waitClass =
              urgency === "overdue"
                ? "font-bold text-danger"
                : urgency === "waiting"
                  ? "font-semibold text-warning"
                  : "text-textMuted";
            return (
              <AnimatedPressable
                onPress={() => router.push(`/staff/order/${item.id}`)}
                className="rounded-card border border-line bg-surface p-4"
                style={[shadow.card, accent]}
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <Text className="font-display text-lg text-textPrimary">
                      {item.order_number}
                    </Text>
                    {urgency === "overdue" ? (
                      <Ionicons name="alert-circle" size={16} color={Colors.danger} />
                    ) : null}
                  </View>
                  <View className="flex-row items-center gap-1.5">
                    <View
                      className={`rounded-full px-2 py-0.5 ${
                        cashUnpaidFor(item) ? "bg-amber-100" : "bg-green-100"
                      }`}
                    >
                      <Text
                        className={`text-[10px] font-bold ${
                          cashUnpaidFor(item) ? "text-amber-800" : "text-green-700"
                        }`}
                      >
                        {cashUnpaidFor(item)
                          ? `${item.payment_method} unpaid`
                          : `${item.payment_method} paid`}
                      </Text>
                    </View>
                    <Badge
                      label={statusLabel(item.status)}
                      tone={item.status === "ready" ? "blue" : item.status === "preparing" ? "amber" : "gray"}
                    />
                  </View>
                </View>
                <Text className="mt-0.5 text-xs text-textMuted">
                  {item.branches?.name ?? ""} · {itemCount} item{itemCount === 1 ? "" : "s"} ·{" "}
                  <Text className={waitClass}>{wait} min ago</Text>
                  {item.payment_method === "Cash" && item.payment_status !== "paid"
                    ? "  · 💵 unpaid"
                    : ""}
                  {item.estimated_max_minutes
                    ? `  · ETA ${formatEta(item.estimated_min_minutes, item.estimated_max_minutes)}`
                    : ""}
                </Text>

                <View className="mt-2">
                  {(item.order_items ?? []).slice(0, 3).map((it) => (
                    <Text key={it.id} className="text-sm text-textPrimary" numberOfLines={1}>
                      • {it.quantity}× {it.product_name}{" "}
                      <Text className="text-textMuted">({it.variant_name})</Text>
                    </Text>
                  ))}
                  {(item.order_items ?? []).length > 3 ? (
                    <Text className="text-xs text-textMuted">
                      +{(item.order_items ?? []).length - 3} more…
                    </Text>
                  ) : null}
                </View>

                {item.status === "pending" && cashUnpaidFor(item) ? (
                  <Text className="mt-2 text-xs font-medium text-amber-700">
                    {needsVerifyFor(item)
                      ? "Verify the PWD/Senior ID, then confirm payment."
                      : "Confirm cash payment before preparing."}
                  </Text>
                ) : null}

                <View className="mt-3 flex-row items-center justify-between">
                  <PriceText amount={item.total_amount} size="md" />

                  {item.status === "pending" && cashUnpaidFor(item) ? (
                    <View className="flex-row items-center gap-2">
                      {needsVerifyFor(item) ? (
                        <AnimatedPressable
                          onPress={() => router.push(`/staff/order/${item.id}`)}
                          className="flex-row items-center gap-1.5 rounded-xl border border-line px-3.5 py-2.5"
                        >
                          <Ionicons name="shield-checkmark-outline" size={15} color={Colors.brand} />
                          <Text className="text-sm font-bold text-brandPrimary">Verify ID</Text>
                        </AnimatedPressable>
                      ) : (
                        <AnimatedPressable
                          onPress={() => confirmCash(item)}
                          disabled={busyId === item.id}
                          className="flex-row items-center gap-1.5 rounded-xl border border-green-300 bg-green-50 px-3.5 py-2.5"
                        >
                          {busyId === item.id ? (
                            <ActivityIndicator color={Colors.success} size="small" />
                          ) : (
                            <>
                              <Ionicons name="cash-outline" size={15} color={Colors.success} />
                              <Text className="text-sm font-bold text-success">Confirm payment</Text>
                            </>
                          )}
                        </AnimatedPressable>
                      )}
                      <View className="flex-row items-center gap-1.5 rounded-xl bg-surfaceMuted px-3.5 py-2.5 opacity-60">
                        <Text className="text-sm font-bold text-textMuted">Start</Text>
                      </View>
                    </View>
                  ) : action ? (
                    <AnimatedPressable
                      onPress={() => advance(item)}
                      disabled={busyId === item.id}
                      className={`flex-row items-center gap-1.5 rounded-xl px-4 py-2.5 ${action.tone}`}
                    >
                      {busyId === item.id ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <>
                          <Ionicons name="arrow-forward" size={15} color="#fff" />
                          <Text className="text-sm font-bold text-white">{action.label}</Text>
                        </>
                      )}
                    </AnimatedPressable>
                  ) : null}
                </View>
              </AnimatedPressable>
            );
          }}
        />
      )}
    </Screen>
  );
}

const STAT_COLOR: Record<"info" | "warning" | "success" | "danger" | "muted", string> = {
  info: "text-info",
  warning: "text-warning",
  success: "text-success",
  danger: "text-danger",
  muted: "text-textSecondary",
};

function QueueStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: keyof typeof STAT_COLOR;
}) {
  return (
    <View className="flex-1 items-center rounded-2xl border border-line bg-surface py-2.5">
      <Text className={`font-display text-xl ${STAT_COLOR[tone]}`}>{value}</Text>
      <Text className="text-[11px] text-textMuted">{label}</Text>
    </View>
  );
}
