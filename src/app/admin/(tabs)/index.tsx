import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { RevenueChart, type ChartBucket } from "@/components/admin/RevenueChart";
import { ErrorState } from "@/components/ui/ErrorState";
import { ProductImage } from "@/components/ui/ProductImage";
import { Screen } from "@/components/ui/Screen";
import { Colors, shadow } from "@/constants/theme";
import {
  getCancellationsSince,
  getFeedbackList,
  getOrdersSince,
  type CancellationRow,
  type FeedbackRow,
  type ReportOrder,
} from "@/lib/api";
import { computeCancelStats } from "@/lib/cancellationStats";
import { humanizeError } from "@/lib/errors";
import { formatDateTime, peso } from "@/lib/format";
import { localProductImage } from "@/lib/productImages";

type Period = "today" | "week" | "month";

const PREV_LABEL: Record<Period, string> = {
  today: "yesterday",
  week: "last week",
  month: "last month",
};

function startOf(period: Period): Date {
  const now = new Date();
  if (period === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === "week") {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dow = (now.getDay() + 6) % 7;
    d.setDate(d.getDate() - dow);
    return d;
  }
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/** Start of the period immediately before the current one (for comparison). */
function prevStartOf(period: Period): Date {
  const s = startOf(period);
  if (period === "today") return new Date(s.getFullYear(), s.getMonth(), s.getDate() - 1);
  if (period === "week") return new Date(s.getFullYear(), s.getMonth(), s.getDate() - 7);
  return new Date(s.getFullYear(), s.getMonth() - 1, 1);
}

/** Paid, non-cancelled revenue for orders in [from, to). */
function revenueBetween(orders: ReportOrder[], from: number, to: number): number {
  let sum = 0;
  for (const o of orders) {
    const t = new Date(o.created_at).getTime();
    if (t >= from && t < to && o.payment_status === "paid" && o.status !== "cancelled") {
      sum += Number(o.total_amount);
    }
  }
  return sum;
}

export default function AdminReportsScreen() {
  const router = useRouter();
  const [orders, setOrders] = useState<ReportOrder[]>([]);
  const [feedback, setFeedback] = useState<FeedbackRow[]>([]);
  const [cancellations, setCancellations] = useState<CancellationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<Period>("today");

  const load = useCallback(async () => {
    setError(null);
    try {
      // Reach back to the start of last month so the period-over-period
      // comparison and the 7-day trend chart always have their data.
      const earliest = prevStartOf("month");
      const [o, f, c] = await Promise.all([
        getOrdersSince(earliest.toISOString()),
        getFeedbackList(100),
        getCancellationsSince(earliest.toISOString()),
      ]);
      setOrders(o);
      setFeedback(f);
      setCancellations(c);
    } catch (e) {
      setError(humanizeError(e, "Could not load reports."));
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

  const stats = useMemo(() => {
    const since = startOf(period).getTime();
    const paid = orders.filter(
      (o) =>
        new Date(o.created_at).getTime() >= since &&
        o.payment_status === "paid" &&
        o.status !== "cancelled",
    );
    const revenue = paid.reduce((s, o) => s + Number(o.total_amount), 0);
    const count = paid.length;
    const productMap = new Map<string, number>();
    for (const o of paid)
      for (const it of o.order_items ?? [])
        productMap.set(it.product_name, (productMap.get(it.product_name) ?? 0) + it.quantity);
    const top = Array.from(productMap.entries())
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    // Same-length window immediately before this period.
    const prevRevenue = revenueBetween(orders, prevStartOf(period).getTime(), since);
    const delta = prevRevenue > 0 ? (revenue - prevRevenue) / prevRevenue : null;

    return { revenue, count, avg: count ? revenue / count : 0, top, prevRevenue, delta };
  }, [orders, period]);

  // Daily revenue for the trailing 7 days (independent of the period toggle).
  const chart = useMemo<ChartBucket[]>(() => {
    const names = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
    const now = new Date();
    const buckets: ChartBucket[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const start = d.getTime();
      buckets.push({
        label: names[d.getDay()],
        value: revenueBetween(orders, start, start + 86400000),
        highlight: i === 0,
      });
    }
    return buckets;
  }, [orders]);

  const cancelStats = useMemo(() => {
    const since = startOf(period).getTime();
    const periodCancels = cancellations.filter(
      (c) => new Date(c.created_at).getTime() >= since,
    );
    const periodOrders = orders.filter((o) => new Date(o.created_at).getTime() >= since).length;
    return computeCancelStats(periodCancels, periodOrders);
  }, [cancellations, orders, period]);

  const ratings = useMemo(() => {
    const since = startOf(period).getTime();
    const list = feedback.filter((f) => new Date(f.created_at).getTime() >= since);
    const sum = list.reduce((s, f) => s + f.rating, 0);
    return { avg: list.length ? sum / list.length : 0, count: list.length, list };
  }, [feedback, period]);

  return (
    <Screen>
      <View className="flex-row items-center justify-between px-5 pb-2 pt-2">
        <Text className="font-display text-2xl text-textPrimary">Dashboard</Text>
        <Pressable
          onPress={() => router.push("/admin/manage")}
          className="h-10 w-10 items-center justify-center rounded-full bg-surface"
          style={shadow.card}
        >
          <Ionicons name="person-circle-outline" size={26} color={Colors.brand} />
        </Pressable>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={Colors.brand} />
        </View>
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <ScrollView
          contentContainerClassName="px-5 pb-10"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brand} />
          }
        >
          {/* Period toggle */}
          <View className="mb-4 flex-row rounded-2xl bg-surfaceMuted p-1">
            {(["today", "week", "month"] as Period[]).map((p) => (
              <Pressable
                key={p}
                onPress={() => setPeriod(p)}
                className={`flex-1 items-center rounded-xl py-2.5 ${period === p ? "bg-surface" : ""}`}
                style={period === p ? shadow.card : undefined}
              >
                <Text
                  className={`text-sm font-semibold ${period === p ? "text-textPrimary" : "text-textMuted"}`}
                >
                  {p === "today" ? "Today" : p === "week" ? "This week" : "This month"}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Revenue hero */}
          <View className="rounded-panel bg-brand-900 p-5" style={shadow.floating}>
            <Text className="text-[11px] font-semibold uppercase tracking-widest text-accent-300">
              Revenue
            </Text>
            <Text className="font-display text-4xl text-white">{peso(stats.revenue)}</Text>
            {stats.delta !== null ? (
              <View className="mt-1 flex-row items-center gap-1">
                <Ionicons
                  name={stats.delta >= 0 ? "trending-up" : "trending-down"}
                  size={15}
                  color={stats.delta >= 0 ? "#7BD389" : "#F0A0A0"}
                />
                <Text
                  className={`text-xs font-bold ${stats.delta >= 0 ? "text-[#7BD389]" : "text-[#F0A0A0]"}`}
                >
                  {stats.delta >= 0 ? "+" : ""}
                  {(stats.delta * 100).toFixed(1)}%
                </Text>
                <Text className="text-xs text-brand-200">vs {PREV_LABEL[period]}</Text>
              </View>
            ) : stats.prevRevenue === 0 && stats.revenue > 0 ? (
              <Text className="mt-1 text-xs text-brand-200">No sales {PREV_LABEL[period]}</Text>
            ) : null}
          </View>

          {/* 7-day trend */}
          <View className="mt-3 rounded-card border border-line bg-surface p-4" style={shadow.card}>
            <Text className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-textMuted">
              Revenue · last 7 days
            </Text>
            <RevenueChart data={chart} />
          </View>

          {/* Metric cards */}
          <View className="mt-3 flex-row gap-3">
            <Metric label="Orders" value={String(stats.count)} />
            <Metric label="Avg order" value={peso(stats.avg)} />
            <Metric
              label={`${ratings.count} ratings`}
              value={ratings.avg ? `${ratings.avg.toFixed(1)}★` : "—"}
            />
          </View>

          {/* Top sellers */}
          <Text className="mb-2 mt-6 font-heading text-lg text-textPrimary">Top sellers</Text>
          {stats.top.length === 0 ? (
            <Empty text="No sales in this period yet." />
          ) : (
            <View className="rounded-card border border-line bg-surface">
              {stats.top.map((p, i) => (
                <View
                  key={p.name}
                  className={`flex-row items-center px-4 py-3 ${i > 0 ? "border-t border-line" : ""}`}
                >
                  <Text className="w-6 font-display text-base text-brand-400">{i + 1}</Text>
                  <ProductImage
                    source={localProductImage(p.name)}
                    emoji="☕"
                    emojiSize={16}
                    className="mr-3 h-9 w-9 rounded-lg"
                    accessibilityLabel={p.name}
                  />
                  <Text className="flex-1 text-sm font-medium text-textPrimary" numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Text className="text-sm font-bold text-brandPrimary">{p.qty} sold</Text>
                </View>
              ))}
            </View>
          )}

          {/* Feedback */}
          <Text className="mb-2 mt-6 font-heading text-lg text-textPrimary">Recent feedback</Text>
          {ratings.list.length === 0 ? (
            <Empty text="No feedback in this period." />
          ) : (
            <View className="gap-2">
              {ratings.list.slice(0, 5).map((f) => (
                <View key={f.id} className="rounded-card border border-line bg-surface p-3">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-sm">
                      <Text className="text-[#E0A526]">{"★".repeat(f.rating)}</Text>
                      <Text className="text-line">{"★".repeat(5 - f.rating)}</Text>
                    </Text>
                    <Text className="text-[10px] text-textMuted">{formatDateTime(f.created_at)}</Text>
                  </View>
                  {f.comment ? (
                    <Text className="mt-1 text-sm text-textSecondary">“{f.comment}”</Text>
                  ) : null}
                </View>
              ))}
            </View>
          )}

          {/* Cancellation reasons */}
          <Text className="mb-2 mt-6 font-heading text-lg text-textPrimary">
            Cancellation reasons
          </Text>
          {cancelStats.count === 0 ? (
            <Empty text="No cancellations in this period." />
          ) : (
            <Pressable
              onPress={() => router.push("/admin/cancellations")}
              className="rounded-card border border-line bg-surface p-4"
              style={shadow.card}
            >
              <View className="flex-row gap-3">
                <Metric label="Cancelled" value={String(cancelStats.count)} />
                <Metric label="Rate" value={`${(cancelStats.rate * 100).toFixed(1)}%`} />
                <Metric label="Refunded" value={peso(cancelStats.refunded)} />
                <Metric label="To return" value={String(cancelStats.pendingRefunds)} />
              </View>
              <View className="mt-3">
                {cancelStats.topReasons.slice(0, 3).map((r, i) => (
                  <View key={r.reason} className="flex-row justify-between py-0.5">
                    <Text className="flex-1 pr-2 text-sm text-textPrimary" numberOfLines={1}>
                      {i + 1}. {r.reason}
                    </Text>
                    <Text className="text-sm font-bold text-brandPrimary">{r.count}</Text>
                  </View>
                ))}
              </View>
              <View className="mt-2 flex-row items-center justify-between">
                <Text className="text-xs text-textMuted">
                  Customer {cancelStats.customer} · Staff {cancelStats.staff} · Before pay{" "}
                  {cancelStats.beforePay} · After {cancelStats.afterPay}
                </Text>
                <Ionicons name="chevron-forward" size={16} color="#C9A47C" />
              </View>
            </Pressable>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 rounded-card border border-line bg-surface p-3" style={shadow.card}>
      <Text className="font-display text-xl text-textPrimary" numberOfLines={1}>
        {value}
      </Text>
      <Text className="mt-0.5 text-[11px] text-textMuted">{label}</Text>
    </View>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <View className="rounded-card border border-dashed border-line bg-surface p-5">
      <Text className="text-center text-sm text-textSecondary">{text}</Text>
    </View>
  );
}
