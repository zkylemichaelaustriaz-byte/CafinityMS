import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AnalyticsChart, type ChartPoint } from "@/components/admin/AnalyticsChart";
import { DashboardSection } from "@/components/admin/DashboardSection";
import { type ChartBucket } from "@/components/admin/RevenueChart";
import { ErrorState } from "@/components/ui/ErrorState";
import { ProductImage } from "@/components/ui/ProductImage";
import { Screen } from "@/components/ui/Screen";
import { Colors, shadow } from "@/constants/theme";
import { brandingImages } from "@/lib/brandingImages";
import {
  getCancellationsSince,
  getFeedbackList,
  getLowStockSummary,
  getOrdersSince,
  type CancellationRow,
  type FeedbackRow,
  type LowStockSummary,
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

/** Count of orders placed in [from, to) (demand, incl. all statuses). */
function ordersBetween(orders: ReportOrder[], from: number, to: number): number {
  let n = 0;
  for (const o of orders) {
    const t = new Date(o.created_at).getTime();
    if (t >= from && t < to) n += 1;
  }
  return n;
}

interface TimeBucket {
  label: string;
  start: number;
  end: number;
  highlight: boolean;
}

/** Time buckets matching the selected period (today=3h blocks, week=days, month=weeks). */
function bucketsFor(period: Period): TimeBucket[] {
  const now = new Date();
  const nowT = now.getTime();

  if (period === "today") {
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return [6, 9, 12, 15, 18, 21].map((h) => {
      const s = new Date(base);
      s.setHours(h, 0, 0, 0);
      const e = new Date(base);
      e.setHours(h + 3, 0, 0, 0);
      const start = s.getTime();
      const end = e.getTime();
      const label = h === 12 ? "12p" : h < 12 ? `${h}a` : `${h - 12}p`;
      return { label, start, end, highlight: nowT >= start && nowT < end };
    });
  }

  if (period === "week") {
    const startWeek = startOf("week");
    const names = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
    const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(startWeek);
      d.setDate(startWeek.getDate() + i);
      const start = d.getTime();
      const end = start + 86400000;
      return { label: names[i], start, end, highlight: start === todayMid };
    });
  }

  // month → by week of the month
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
  const buckets: TimeBucket[] = [];
  let wStart = startOf("month").getTime();
  let wi = 1;
  while (wStart < monthEnd) {
    const end = Math.min(wStart + 7 * 86400000, monthEnd);
    buckets.push({ label: `W${wi}`, start: wStart, end, highlight: nowT >= wStart && nowT < end });
    wStart = end;
    wi += 1;
  }
  return buckets;
}

const PERIOD_SUFFIX: Record<Period, string> = {
  today: "today, by hour",
  week: "this week, by day",
  month: "this month, by week",
};

export default function AdminReportsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [orders, setOrders] = useState<ReportOrder[]>([]);
  const [feedback, setFeedback] = useState<FeedbackRow[]>([]);
  const [cancellations, setCancellations] = useState<CancellationRow[]>([]);
  const [lowStock, setLowStock] = useState<LowStockSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<Period>("today");
  const [chartTab, setChartTab] = useState<"revenue" | "orders">("revenue");
  const [showAllSellers, setShowAllSellers] = useState(false);
  const [heroFailed, setHeroFailed] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      // Reach back to the start of last month so the period-over-period
      // comparison and the 7-day trend chart always have their data.
      const earliest = prevStartOf("month");
      const [o, f, c, ls] = await Promise.all([
        getOrdersSince(earliest.toISOString()),
        getFeedbackList(100),
        getCancellationsSince(earliest.toISOString()),
        getLowStockSummary().catch(() => null),
      ]);
      setOrders(o);
      setFeedback(f);
      setCancellations(c);
      setLowStock(ls);
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

  // Charts bucketed to MATCH the selected period (revenue trend + demand).
  const revenueSeries = useMemo<ChartBucket[]>(
    () =>
      bucketsFor(period).map((b) => ({
        label: b.label,
        value: revenueBetween(orders, b.start, b.end),
        highlight: b.highlight,
      })),
    [orders, period],
  );
  const ordersSeries = useMemo<ChartBucket[]>(
    () =>
      bucketsFor(period).map((b) => ({
        label: b.label,
        value: ordersBetween(orders, b.start, b.end),
        highlight: b.highlight,
      })),
    [orders, period],
  );
  const ordersInPeriod = ordersSeries.reduce((s, b) => s + b.value, 0);
  const periodNoun = period === "today" ? "today" : period === "week" ? "this week" : "this month";

  const revenuePoints = useMemo<ChartPoint[]>(
    () =>
      revenueSeries.map((r, i) => ({
        label: r.label,
        value: r.value,
        highlight: r.highlight,
        readout: `${peso(r.value)} · ${ordersSeries[i].value} ${ordersSeries[i].value === 1 ? "order" : "orders"}`,
      })),
    [revenueSeries, ordersSeries],
  );
  const ordersPoints = useMemo<ChartPoint[]>(
    () =>
      ordersSeries.map((o, i) => ({
        label: o.label,
        value: o.value,
        highlight: o.highlight,
        readout: `${o.value} ${o.value === 1 ? "order" : "orders"} · ${peso(revenueSeries[i].value)}`,
      })),
    [ordersSeries, revenueSeries],
  );

  // One short, deterministic insight from real aggregates (never AI-generated).
  const insight = useMemo<{ icon: keyof typeof Ionicons.glyphMap; text: string }>(() => {
    if (stats.revenue === 0)
      return { icon: "information-circle-outline", text: "No sales recorded for the selected period." };
    if (stats.delta != null && Math.abs(stats.delta) >= 0.05) {
      const up = stats.delta >= 0;
      return {
        icon: up ? "trending-up" : "trending-down",
        text: `Revenue is ${up ? "up" : "down"} ${(Math.abs(stats.delta) * 100).toFixed(1)}% vs ${PREV_LABEL[period]}.`,
      };
    }
    if (stats.top[0]) return { icon: "trophy-outline", text: `${stats.top[0].name} is the top seller ${periodNoun}.` };
    const best = revenueSeries.reduce((a, b) => (b.value > a.value ? b : a), revenueSeries[0]);
    if (best && best.value > 0)
      return { icon: "bar-chart-outline", text: `${best.label} had the highest revenue ${periodNoun}.` };
    return { icon: "cafe-outline", text: "Sales are steady this period." };
  }, [stats, period, periodNoun, revenueSeries]);

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
          contentContainerClassName="px-5"
          contentContainerStyle={{ paddingBottom: insets.bottom + 88 }}
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
                accessibilityRole="tab"
                accessibilityState={{ selected: period === p }}
                accessibilityLabel={p === "today" ? "Today" : p === "week" ? "This week" : "This month"}
                className={`flex-1 items-center rounded-xl py-2.5 ${period === p ? "bg-surface" : ""}`}
                style={period === p ? shadow.card : undefined}
              >
                <Text
                  className={`text-sm font-semibold ${period === p ? "text-brandPrimary" : "text-textMuted"}`}
                >
                  {p === "today" ? "Today" : p === "week" ? "This week" : "This month"}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Revenue hero — decorative image, restrained campaign accent */}
          <View className="overflow-hidden rounded-panel bg-brand-900 p-5" style={shadow.floating}>
            {!heroFailed ? (
              <Image
                source={brandingImages.adminDashboardHero}
                onError={() => setHeroFailed(true)}
                contentFit="cover"
                transition={300}
                cachePolicy="memory-disk"
                style={StyleSheet.absoluteFill}
                accessible={false}
              />
            ) : null}
            <View
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, { backgroundColor: Colors.accent, opacity: 0.12 }]}
            />
            <View
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, { backgroundColor: "#000", opacity: 0.52 }]}
            />
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

          {/* KPI row (same selected period as the hero) */}
          <View className="mt-3 flex-row gap-3">
            <Metric label="Orders" value={String(stats.count)} />
            <Metric label="Avg order" value={peso(stats.avg)} />
            <Metric
              label={ratings.count ? `${ratings.count} ratings` : "No ratings yet"}
              value={ratings.avg ? `${ratings.avg.toFixed(1)}★` : "—"}
            />
          </View>

          {/* Analytics — one section; Revenue/Orders shown one at a time */}
          <Text className="mb-3 mt-8 font-heading text-lg text-textPrimary">Analytics</Text>
          <View className="rounded-card border border-line bg-surface p-4" style={shadow.card}>
            <View className="mb-3 flex-row items-center justify-between">
              <View className="flex-row rounded-xl bg-surfaceMuted p-1">
                {(["revenue", "orders"] as const).map((t) => (
                  <Pressable
                    key={t}
                    onPress={() => setChartTab(t)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: chartTab === t }}
                    className={`rounded-lg px-3 py-1.5 ${chartTab === t ? "bg-surface" : ""}`}
                    style={chartTab === t ? shadow.card : undefined}
                  >
                    <Text
                      className={`text-xs font-semibold ${chartTab === t ? "text-brandPrimary" : "text-textMuted"}`}
                    >
                      {t === "revenue" ? "Revenue" : "Orders"}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text className="text-[11px] font-semibold uppercase tracking-widest text-textMuted">
                {PERIOD_SUFFIX[period]}
              </Text>
            </View>
            {chartTab === "revenue" ? (
              stats.revenue === 0 ? (
                <Text className="py-6 text-center text-xs text-textMuted">
                  No revenue in this period yet.
                </Text>
              ) : (
                <AnalyticsChart
                  data={revenuePoints}
                  kind="area"
                  accessibilityLabel={`Revenue chart, ${PERIOD_SUFFIX[period]}. Total ${peso(stats.revenue)}.`}
                />
              )
            ) : ordersInPeriod === 0 ? (
              <Text className="py-6 text-center text-xs text-textMuted">
                No orders in this period yet.
              </Text>
            ) : (
              <AnalyticsChart
                data={ordersPoints}
                kind="bars"
                accessibilityLabel={`Orders chart, ${PERIOD_SUFFIX[period]}. ${ordersInPeriod} orders.`}
              />
            )}
          </View>

          {/* Performance insight (deterministic, from real aggregates) */}
          <View
            className="mt-3 flex-row items-center gap-3 rounded-card border border-line bg-surface p-4"
            style={shadow.card}
          >
            <View className="h-9 w-9 items-center justify-center rounded-full bg-accent-100">
              <Ionicons name={insight.icon} size={18} color={Colors.brand} />
            </View>
            <Text className="flex-1 text-sm font-medium text-textPrimary">{insight.text}</Text>
          </View>

          {/* Needs attention — inventory health, separated from analytics */}
          {lowStock ? (
            <>
              <Text className="mb-3 mt-8 font-heading text-lg text-textPrimary">Needs attention</Text>
              <LowStockCard summary={lowStock} onPress={() => router.push("/admin/inventory")} />
            </>
          ) : null}

          {/* Quick actions — 2-column grid (roomier than four narrow tiles) */}
          <Text className="mb-3 mt-8 font-heading text-lg text-textPrimary">Quick actions</Text>
          <View className="flex-row flex-wrap gap-3">
            <QuickAction icon="bar-chart-outline" label="Reports" onPress={() => router.push("/admin/reports")} />
            <QuickAction icon="add-circle-outline" label="Add product" onPress={() => router.push("/admin/product/new")} />
            <QuickAction icon="cube-outline" label="Inventory" onPress={() => router.push("/admin/inventory")} />
            <QuickAction icon="megaphone-outline" label="Campaigns" onPress={() => router.push("/admin/campaigns")} />
          </View>

          {/* Top sellers — first 3, expandable */}
          <DashboardSection
            title="Top sellers"
            action={
              stats.top.length > 3
                ? {
                    label: showAllSellers ? "Show less" : "View all",
                    onPress: () => setShowAllSellers((v) => !v),
                    icon: showAllSellers ? "chevron-up" : "chevron-down",
                  }
                : undefined
            }
          >
            {stats.top.length === 0 ? (
              <Empty text="No sales in this period yet." />
            ) : (
              <View className="rounded-card border border-line bg-surface">
                {(showAllSellers ? stats.top : stats.top.slice(0, 3)).map((p, i) => (
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
          </DashboardSection>

          {/* Recent feedback */}
          <DashboardSection
            title="Recent feedback"
            action={{ label: "View all", onPress: () => router.push("/admin/feedback") }}
          >
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
          </DashboardSection>

          {/* Cancellation reasons */}
          <DashboardSection title="Cancellation reasons">
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
          </DashboardSection>
        </ScrollView>
      )}
    </Screen>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="w-[48%] flex-row items-center gap-2 rounded-card border border-line bg-surface px-3 py-3.5"
      style={shadow.card}
    >
      <View className="h-9 w-9 items-center justify-center rounded-full bg-accent-100">
        <Ionicons name={icon} size={18} color={Colors.brand} />
      </View>
      <Text className="flex-1 text-xs font-semibold text-textSecondary" numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function StockStat({ label, value, tone }: { label: string; value: number; tone: "red" | "amber" }) {
  return (
    <View className="flex-1 items-center rounded-xl border border-line bg-surfaceMuted py-2">
      <Text className={`font-display text-xl ${tone === "red" ? "text-danger" : "text-warning"}`}>
        {value}
      </Text>
      <Text className="text-[11px] text-textMuted">{label}</Text>
    </View>
  );
}

function LowStockCard({
  summary,
  onPress,
}: {
  summary: LowStockSummary;
  onPress: () => void;
}) {
  const total = summary.out + summary.critical + summary.low;
  if (total === 0) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Inventory healthy. Open inventory."
        className="flex-row items-center gap-2 rounded-card border border-line bg-surface p-4"
        style={shadow.card}
      >
        <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
        <Text className="flex-1 text-sm font-medium text-textPrimary">All inventory healthy</Text>
        <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Low stock: ${summary.out} out, ${summary.critical} critical, ${summary.low} low. Open inventory.`}
      className="rounded-card border border-line bg-surface p-4"
      style={shadow.card}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Ionicons name="alert-circle" size={18} color={Colors.warning} />
          <Text className="font-heading text-base text-textPrimary">Low stock</Text>
        </View>
        <Text className="text-xs font-medium text-textMuted">
          {summary.affectedBranches} branch{summary.affectedBranches === 1 ? "" : "es"} affected
        </Text>
      </View>
      <View className="mt-3 flex-row gap-2">
        <StockStat label="Out" value={summary.out} tone="red" />
        <StockStat label="Critical" value={summary.critical} tone="red" />
        <StockStat label="Low" value={summary.low} tone="amber" />
      </View>
      <View className="mt-3 gap-1.5">
        {summary.items.slice(0, 3).map((it, i) => (
          <View key={i} className="flex-row items-center gap-2">
            <View
              style={{ backgroundColor: it.status === "low" ? Colors.warning : Colors.danger }}
              className="h-1.5 w-1.5 rounded-full"
            />
            <Text className="flex-1 text-xs text-textSecondary" numberOfLines={1}>
              {it.product_name} ({it.variant_name}) · {it.branch_name}
            </Text>
            <Text className="text-xs font-semibold text-textMuted">{it.stock} left</Text>
          </View>
        ))}
        <Text className="mt-0.5 text-xs font-semibold text-brandPrimary">
          {summary.items.length > 3 ? `+${summary.items.length - 3} more · ` : ""}View inventory
        </Text>
      </View>
    </Pressable>
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
