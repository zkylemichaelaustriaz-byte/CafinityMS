import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, ScrollView, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BranchPickerSheet, BranchSelectorField } from "@/components/ui/BranchSelector";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Header } from "@/components/ui/Header";
import { Screen } from "@/components/ui/Screen";
import { Colors, shadow } from "@/constants/theme";
import { getBranches, getOrdersSince, type ReportOrder } from "@/lib/api";
import { humanizeError } from "@/lib/errors";
import { peso } from "@/lib/format";
import { computeSalesReport } from "@/lib/salesReport";
import type { Branch } from "@/types/models";

type Period = "today" | "week" | "month";
const PREV_LABEL: Record<Period, string> = { today: "yesterday", week: "last week", month: "last month" };

function startOf(period: Period): number {
  const now = new Date();
  if (period === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (period === "week") {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    d.setDate(d.getDate() - ((now.getDay() + 6) % 7));
    return d.getTime();
  }
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}
function prevStartOf(period: Period): number {
  const s = new Date(startOf(period));
  if (period === "today") return new Date(s.getFullYear(), s.getMonth(), s.getDate() - 1).getTime();
  if (period === "week") return new Date(s.getFullYear(), s.getMonth(), s.getDate() - 7).getTime();
  return new Date(s.getFullYear(), s.getMonth() - 1, 1).getTime();
}

function deltaPct(cur: number, prev: number): number | null {
  if (prev <= 0) return null; // avoid misleading % when the baseline is zero
  return ((cur - prev) / prev) * 100;
}

export default function AdminReportsScreen() {
  const [orders, setOrders] = useState<ReportOrder[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("today");
  const [branchId, setBranchId] = useState<string | null>(null);
  const [branchSheet, setBranchSheet] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    // Reach back to the start of last month so monthly comparisons have data.
    const earliest = new Date();
    earliest.setMonth(earliest.getMonth() - 1, 1);
    Promise.all([getOrdersSince(earliest.toISOString()), getBranches()])
      .then(([o, b]) => {
        setOrders(o);
        setBranches(b);
      })
      .catch((e) => setError(humanizeError(e, "Could not load reports.")))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const { report, prev } = useMemo(() => {
    const start = startOf(period);
    const now = Date.now();
    return {
      report: computeSalesReport(orders, start, now, branchId),
      prev: computeSalesReport(orders, prevStartOf(period), start, branchId),
    };
  }, [orders, period, branchId]);

  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? "—";

  if (loading) {
    return (
      <Screen edges={["top"]}>
        <Header title="Sales report" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={Colors.brand} />
        </View>
      </Screen>
    );
  }
  if (error) {
    return (
      <Screen edges={["top"]}>
        <Header title="Sales report" />
        <ErrorState message={error} onRetry={load} />
      </Screen>
    );
  }

  const grossDelta = deltaPct(report.gross, prev.gross);
  const ordersDelta = deltaPct(report.paidOrders, prev.paidOrders);

  return (
    <Screen edges={["top"]}>
      <Header title="Sales report" />
      <ScrollView contentContainerClassName="p-5 pb-10" showsVerticalScrollIndicator={false}>
        {/* Period */}
        <View className="mb-3 flex-row rounded-2xl bg-surfaceMuted p-1">
          {(["today", "week", "month"] as Period[]).map((p) => (
            <Pressable
              key={p}
              onPress={() => setPeriod(p)}
              className={`flex-1 items-center rounded-xl py-2.5 ${period === p ? "bg-surface" : ""}`}
              style={period === p ? shadow.card : undefined}
            >
              <Text className={`text-sm font-semibold ${period === p ? "text-textPrimary" : "text-textMuted"}`}>
                {p === "today" ? "Today" : p === "week" ? "This week" : "This month"}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Branch */}
        <View className="mb-4">
          <BranchSelectorField
            branch={branches.find((b) => b.id === branchId) ?? null}
            showAll
            label="Branch"
            onPress={() => setBranchSheet(true)}
          />
        </View>
        <BranchPickerSheet
          visible={branchSheet}
          branches={branches}
          selectedId={branchId}
          allowAll
          onSelect={setBranchId}
          onClose={() => setBranchSheet(false)}
        />

        {report.paidOrders === 0 && report.cancelledOrders === 0 ? (
          <EmptyState
            icon="bar-chart-outline"
            title="No sales"
            subtitle="No paid orders in this period."
          />
        ) : (
          <>
            {/* Headline */}
            <View className="rounded-card border border-line bg-surface p-4" style={shadow.card}>
              <Text className="text-xs font-semibold uppercase tracking-wide text-textMuted">
                Gross sales
              </Text>
              <Text className="mt-0.5 font-display text-4xl text-textPrimary">
                {peso(report.gross)}
              </Text>
              <Delta pct={grossDelta} label={PREV_LABEL[period]} />
              <View className="mt-3 flex-row gap-3">
                <Mini label="Net (after refunds)" value={peso(report.net)} />
                <Mini label="Avg order" value={peso(report.aov)} />
              </View>
            </View>

            {/* Counts */}
            <View className="mt-3 flex-row gap-2">
              <Stat label="Paid orders" value={String(report.paidOrders)} delta={ordersDelta} />
              <Stat label="Completed" value={String(report.completedOrders)} />
              <Stat label="Cancelled" value={String(report.cancelledOrders)} />
            </View>

            {/* Money breakdown */}
            <Section title="Breakdown">
              <Line label="Tips collected" value={peso(report.tips)} />
              <Line label="Discounts given" value={`−${peso(report.discounts)}`} green />
              <Line
                label={`Loyalty vouchers (${report.loyaltyCount})`}
                value={`−${peso(report.loyaltyAmount)}`}
                green
              />
              <Line label="VAT included" value={peso(report.vat)} />
              <Line label="Refunds" value={`−${peso(report.refunds)}`} red border />
            </Section>

            {/* Payment methods */}
            <Section title="Payment methods">
              {report.byMethod.length === 0 ? (
                <Text className="py-2 text-sm text-textMuted">No paid orders.</Text>
              ) : (
                report.byMethod.map((m, i) => (
                  <Line
                    key={m.method}
                    label={`${m.method} (${m.count})`}
                    value={peso(m.amount)}
                    border={i > 0}
                  />
                ))
              )}
            </Section>

            {/* Sales by branch (only when viewing all) */}
            {!branchId && report.byBranch.length > 1 ? (
              <Section title="Sales by branch">
                {report.byBranch.map((b, i) => (
                  <Line
                    key={b.branchId}
                    label={`${branchName(b.branchId)} (${b.count})`}
                    value={peso(b.amount)}
                    border={i > 0}
                  />
                ))}
              </Section>
            ) : null}

            {/* Top products */}
            <Section title="Top products">
              {report.topProducts.length === 0 ? (
                <Text className="py-2 text-sm text-textMuted">No items sold.</Text>
              ) : (
                report.topProducts.map((p, i) => (
                  <View
                    key={p.name}
                    className={`flex-row items-center justify-between py-2.5 ${i > 0 ? "border-t border-line" : ""}`}
                  >
                    <Text className="flex-1 pr-2 text-sm text-textPrimary" numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Text className="mr-3 text-xs text-textMuted">{p.qty} sold</Text>
                    <Text className="text-sm font-semibold text-brandPrimary">{peso(p.revenue)}</Text>
                  </View>
                ))
              )}
            </Section>

            <Text className="mt-4 text-[11px] leading-4 text-textMuted">
              Sales count PAID, non-cancelled orders. Unpaid/pending cash, failed payments, and
              cancelled orders are excluded from gross. Refunds are deducted to get net.
            </Text>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function Delta({ pct, label }: { pct: number | null; label: string }) {
  if (pct === null) {
    return <Text className="mt-1 text-xs text-textMuted">No {label} to compare</Text>;
  }
  const up = pct >= 0;
  return (
    <View className="mt-1 flex-row items-center gap-1">
      <Ionicons name={up ? "trending-up" : "trending-down"} size={13} color={up ? Colors.success : Colors.danger} />
      <Text className={`text-xs font-semibold ${up ? "text-success" : "text-danger"}`}>
        {up ? "+" : ""}
        {pct.toFixed(0)}% vs {label}
      </Text>
    </View>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 rounded-xl border border-line bg-surfaceMuted px-3 py-2">
      <Text className="text-[11px] text-textMuted">{label}</Text>
      <Text className="font-heading text-sm text-textPrimary">{value}</Text>
    </View>
  );
}

function Stat({ label, value, delta }: { label: string; value: string; delta?: number | null }) {
  return (
    <View className="flex-1 items-center rounded-2xl border border-line bg-surface py-2.5">
      <Text className="font-display text-xl text-textPrimary">{value}</Text>
      <Text className="text-[11px] text-textMuted">{label}</Text>
      {delta != null ? (
        <Text className={`text-[10px] font-semibold ${delta >= 0 ? "text-success" : "text-danger"}`}>
          {delta >= 0 ? "+" : ""}
          {delta.toFixed(0)}%
        </Text>
      ) : null}
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <Text className="mb-2 mt-6 font-heading text-base text-textPrimary">{title}</Text>
      <View className="rounded-card border border-line bg-surface px-4 py-1">{children}</View>
    </>
  );
}

function Line({
  label,
  value,
  green,
  red,
  border,
}: {
  label: string;
  value: string;
  green?: boolean;
  red?: boolean;
  border?: boolean;
}) {
  return (
    <View className={`flex-row items-center justify-between py-2.5 ${border ? "border-t border-line" : ""}`}>
      <Text className="text-sm text-textSecondary">{label}</Text>
      <Text
        className={`text-sm font-semibold ${green ? "text-success" : red ? "text-danger" : "text-textPrimary"}`}
      >
        {value}
      </Text>
    </View>
  );
}
