import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BranchPickerSheet, BranchSelectorField } from "@/components/ui/BranchSelector";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Header } from "@/components/ui/Header";
import { Screen } from "@/components/ui/Screen";
import { Colors, shadow } from "@/constants/theme";
import { getBranches, getFeedbackList, type FeedbackRow } from "@/lib/api";
import { humanizeError } from "@/lib/errors";
import { tagLabel } from "@/lib/feedbackTags";
import { formatDateTime } from "@/lib/format";
import type { Branch } from "@/types/models";

type Period = "today" | "week" | "month" | "all";

function startOf(period: Period): number {
  if (period === "all") return 0;
  const now = new Date();
  if (period === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (period === "week") {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    d.setDate(d.getDate() - ((now.getDay() + 6) % 7));
    return d.getTime();
  }
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

export default function AdminFeedbackScreen() {
  const [feedback, setFeedback] = useState<FeedbackRow[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("month");
  const [branchId, setBranchId] = useState<string | null>(null);
  const [branchSheet, setBranchSheet] = useState(false);
  const [minRating, setMinRating] = useState<0 | 5 | 4 | 3>(0); // 3 = "3★ and below"

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([getFeedbackList(300), getBranches()])
      .then(([f, b]) => {
        setFeedback(f);
        setBranches(b);
      })
      .catch((e) => setError(humanizeError(e, "Could not load feedback.")))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const since = startOf(period);
    return feedback.filter(
      (f) =>
        new Date(f.created_at).getTime() >= since &&
        (!branchId || f.branch_id === branchId) &&
        (minRating === 0 || (minRating === 3 ? f.rating <= 3 : f.rating === minRating)),
    );
  }, [feedback, period, branchId, minRating]);

  const stats = useMemo(() => {
    const count = filtered.length;
    const avg = count ? filtered.reduce((s, f) => s + f.rating, 0) / count : 0;
    const dist = [5, 4, 3, 2, 1].map((r) => filtered.filter((f) => f.rating === r).length);
    const tagCounts = new Map<string, number>();
    for (const f of filtered) for (const t of f.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    return { count, avg, dist, topTags };
  }, [filtered]);

  const maxDist = Math.max(1, ...stats.dist);

  if (loading) {
    return (
      <Screen edges={["top"]}>
        <Header title="Feedback" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={Colors.brand} />
        </View>
      </Screen>
    );
  }
  if (error) {
    return (
      <Screen edges={["top"]}>
        <Header title="Feedback" />
        <ErrorState message={error} onRetry={load} />
      </Screen>
    );
  }

  return (
    <Screen edges={["top"]}>
      <Header title="Feedback" />
      <ScrollView contentContainerClassName="p-5 pb-10" showsVerticalScrollIndicator={false}>
        {/* Period */}
        <View className="mb-3 flex-row rounded-2xl bg-surfaceMuted p-1">
          {(["today", "week", "month", "all"] as Period[]).map((p) => (
            <Pressable
              key={p}
              onPress={() => setPeriod(p)}
              className={`flex-1 items-center rounded-xl py-2.5 ${period === p ? "bg-surface" : ""}`}
              style={period === p ? shadow.card : undefined}
            >
              <Text
                className={`text-xs font-semibold ${period === p ? "text-textPrimary" : "text-textMuted"}`}
              >
                {p === "today" ? "Today" : p === "week" ? "Week" : p === "month" ? "Month" : "All"}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Branch */}
        <View className="mb-3">
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

        {/* Rating filter */}
        <View className="mb-4 flex-row gap-2">
          {(
            [
              [0, "All"],
              [5, "5★"],
              [4, "4★"],
              [3, "≤3★"],
            ] as const
          ).map(([val, label]) => {
            const on = minRating === val;
            return (
              <Pressable
                key={val}
                onPress={() => setMinRating(val)}
                className={`flex-1 items-center rounded-full py-2 ${
                  on ? "bg-brandPrimary" : "border border-line bg-surface"
                }`}
              >
                <Text className={`text-xs font-semibold ${on ? "text-white" : "text-textSecondary"}`}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {stats.count === 0 ? (
          <EmptyState
            icon="chatbubble-ellipses-outline"
            title="No feedback"
            subtitle="No reviews match these filters yet."
          />
        ) : (
          <>
            {/* Summary */}
            <View className="flex-row gap-3">
              <View
                className="items-center justify-center rounded-card border border-line bg-surface px-5 py-4"
                style={shadow.card}
              >
                <Text className="font-display text-4xl text-textPrimary">
                  {stats.avg.toFixed(1)}
                </Text>
                <View className="mt-1 flex-row">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Ionicons
                      key={n}
                      name={n <= Math.round(stats.avg) ? "star" : "star-outline"}
                      size={13}
                      color="#E0A526"
                    />
                  ))}
                </View>
                <Text className="mt-1 text-[11px] text-textMuted">{stats.count} reviews</Text>
              </View>

              {/* Distribution */}
              <View className="flex-1 justify-center rounded-card border border-line bg-surface p-4">
                {[5, 4, 3, 2, 1].map((r, i) => (
                  <View key={r} className="flex-row items-center gap-2 py-0.5">
                    <Text className="w-3 text-[11px] text-textMuted">{r}</Text>
                    <View className="h-1.5 flex-1 overflow-hidden rounded-full bg-surfaceMuted">
                      <View
                        className="h-1.5 rounded-full bg-accent"
                        style={{ width: `${Math.round((stats.dist[i] / maxDist) * 100)}%` }}
                      />
                    </View>
                    <Text className="w-6 text-right text-[11px] text-textMuted">
                      {stats.dist[i]}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Common tags */}
            {stats.topTags.length > 0 ? (
              <>
                <Text className="mb-2 mt-6 font-heading text-base text-textPrimary">
                  Common feedback
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {stats.topTags.map(([key, n]) => (
                    <View
                      key={key}
                      className="flex-row items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5"
                    >
                      <Text className="text-xs font-medium text-textSecondary">{tagLabel(key)}</Text>
                      <Text className="text-xs font-bold text-brandPrimary">{n}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            {/* Recent comments */}
            <Text className="mb-2 mt-6 font-heading text-base text-textPrimary">Recent reviews</Text>
            <View className="gap-2">
              {filtered.slice(0, 40).map((f) => (
                <View key={f.id} className="rounded-card border border-line bg-surface p-3">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Ionicons
                          key={n}
                          name={n <= f.rating ? "star" : "star-outline"}
                          size={13}
                          color="#E0A526"
                        />
                      ))}
                    </View>
                    <Text className="text-[10px] text-textMuted">{formatDateTime(f.created_at)}</Text>
                  </View>
                  {f.comment ? (
                    <Text className="mt-1.5 text-sm text-textPrimary">{f.comment}</Text>
                  ) : null}
                  {f.tags.length > 0 ? (
                    <View className="mt-1.5 flex-row flex-wrap gap-1.5">
                      {f.tags.map((t) => (
                        <View key={t} className="rounded-full bg-surfaceMuted px-2 py-0.5">
                          <Text className="text-[10px] font-medium text-textSecondary">
                            {tagLabel(t)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                  <Text className="mt-1.5 text-[11px] text-textMuted">
                    {f.branch_name || "—"}
                    {f.order_number ? ` · ${f.order_number}` : ""}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
