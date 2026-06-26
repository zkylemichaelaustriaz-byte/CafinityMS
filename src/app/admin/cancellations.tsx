import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { BranchPickerSheet, BranchSelectorField } from "@/components/ui/BranchSelector";
import { Header } from "@/components/ui/Header";
import { Screen } from "@/components/ui/Screen";
import { Colors, shadow } from "@/constants/theme";
import {
  getBranches,
  getCancellationsSince,
  getOrdersSince,
  type CancellationRow,
  type ReportOrder,
} from "@/lib/api";
import { computeCancelStats } from "@/lib/cancellationStats";
import { formatDateTime, peso } from "@/lib/format";
import type { Branch } from "@/types/models";

type Period = "today" | "week" | "month";

function startOf(period: Period): Date {
  const now = new Date();
  if (period === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === "week") {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    d.setDate(d.getDate() - ((now.getDay() + 6) % 7));
    return d;
  }
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export default function AdminCancellationsScreen() {
  const [period, setPeriod] = useState<Period>("month");
  const [branchId, setBranchId] = useState<string | null>(null);
  const [branchSheet, setBranchSheet] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [cancellations, setCancellations] = useState<CancellationRow[]>([]);
  const [orders, setOrders] = useState<ReportOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const earliest = new Date();
    earliest.setMonth(earliest.getMonth() - 1, 1);
    Promise.all([
      getCancellationsSince(earliest.toISOString()),
      getOrdersSince(earliest.toISOString()),
      getBranches(),
    ])
      .then(([c, o, b]) => {
        setCancellations(c);
        setOrders(o);
        setBranches(b);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const { stats, list } = useMemo(() => {
    const since = startOf(period).getTime();
    const inScope = (createdAt: string, bId: string) =>
      new Date(createdAt).getTime() >= since && (!branchId || bId === branchId);
    const rows = cancellations.filter((c) => inScope(c.created_at, c.branch_id));
    const total = orders.filter((o) => inScope(o.created_at, o.branch_id)).length;
    return { stats: computeCancelStats(rows, total), list: rows };
  }, [cancellations, orders, period, branchId]);

  if (loading) {
    return (
      <Screen edges={["top"]}>
        <Header title="Cancellations" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={Colors.brand} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={["top"]}>
      <Header title="Cancellations" />
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
              <Text
                className={`text-sm font-semibold ${period === p ? "text-textPrimary" : "text-textMuted"}`}
              >
                {p === "today" ? "Today" : p === "week" ? "This week" : "This month"}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Branch selector */}
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

        {/* Metrics */}
        <View className="flex-row gap-2">
          <Stat label="Cancelled" value={String(stats.count)} />
          <Stat label="Rate" value={`${(stats.rate * 100).toFixed(1)}%`} />
          <Stat label="Refunded" value={peso(stats.refunded)} />
          <Stat label="To return" value={String(stats.pendingRefunds)} />
        </View>
        <View className="mt-2 flex-row gap-2">
          <Stat label="By customer" value={String(stats.customer)} />
          <Stat label="By staff" value={String(stats.staff)} />
          <Stat label="Before pay" value={String(stats.beforePay)} />
          <Stat label="After pay" value={String(stats.afterPay)} />
        </View>

        {/* Top reasons */}
        <Text className="mb-2 mt-6 font-heading text-base text-textPrimary">Top reasons</Text>
        {stats.topReasons.length === 0 ? (
          <View className="rounded-card border border-dashed border-line bg-surface p-5">
            <Text className="text-center text-sm text-textSecondary">
              No cancellations in this view.
            </Text>
          </View>
        ) : (
          <View className="rounded-card border border-line bg-surface">
            {stats.topReasons.map((r, i) => (
              <View
                key={r.reason}
                className={`flex-row items-center justify-between px-4 py-3 ${i > 0 ? "border-t border-line" : ""}`}
              >
                <Text className="flex-1 pr-2 text-sm text-textPrimary" numberOfLines={1}>
                  {r.reason}
                </Text>
                <Text className="text-sm font-bold text-brandPrimary">{r.count}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Detail list */}
        {list.length > 0 ? (
          <>
            <Text className="mb-2 mt-6 font-heading text-base text-textPrimary">Cancelled orders</Text>
            <View className="gap-2">
              {list.map((c) => {
                const byCustomer = c.cancelled_by && c.cancelled_by === c.user_id;
                return (
                  <View key={c.id} className="rounded-card border border-line bg-surface p-3">
                    <View className="flex-row items-center justify-between">
                      <Text className="font-display text-sm text-textPrimary">
                        {c.order_number ?? "—"}
                      </Text>
                      <Text className="text-[10px] text-textMuted">
                        {formatDateTime(c.cancelled_at ?? c.created_at)}
                      </Text>
                    </View>
                    <Text className="mt-0.5 text-xs text-textSecondary">
                      {(c.cancellation_reason ?? "").trim() || "No reason provided"}
                    </Text>
                    <View className="mt-1 flex-row items-center gap-2">
                      <Text className="text-[11px] font-semibold text-textMuted">
                        {byCustomer ? "Customer" : "Staff"} · {c.branches?.name ?? ""}
                      </Text>
                      <RefundChip status={c.refund_status} amount={c.refunded_amount} />
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 rounded-card border border-line bg-surface p-3">
      <Text className="font-display text-lg text-textPrimary" numberOfLines={1}>
        {value}
      </Text>
      <Text className="mt-0.5 text-[11px] text-textMuted">{label}</Text>
    </View>
  );
}

function RefundChip({ status, amount }: { status: string; amount: number }) {
  if (status === "refunded") {
    return (
      <View className="rounded-full bg-successSoft px-2 py-0.5">
        <Text className="text-[10px] font-semibold text-success">Refunded {peso(amount)}</Text>
      </View>
    );
  }
  if (status === "refund_pending") {
    return (
      <View className="rounded-full bg-warningSoft px-2 py-0.5">
        <Text className="text-[10px] font-semibold text-warning">Return {peso(amount)}</Text>
      </View>
    );
  }
  return (
    <View className="rounded-full bg-surfaceMuted px-2 py-0.5">
      <Text className="text-[10px] font-semibold text-textSecondary">No charge</Text>
    </View>
  );
}
