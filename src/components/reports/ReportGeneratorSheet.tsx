import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/ui/Button";
import { Colors } from "@/constants/theme";
import {
  fetchReportFeedback,
  fetchReportOrders,
  ReportScopeError,
  type ReportFullOrder,
} from "@/lib/api";
import { humanizeError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { haptics } from "@/lib/haptics";
import {
  parseYmd,
  presetRange,
  PRESET_LABEL,
  rangeLabel,
  buildReportSummary,
  type PresetKey,
} from "@/lib/reportData";
import {
  ordersCsv,
  productSalesCsv,
  reportHtml,
  sanitizeFilename,
  shareCsv,
  sharePdf,
  type ReportMeta,
} from "@/lib/reportExport";
import { useAuth } from "@/store/auth";
import type { Branch } from "@/types/models";

type Format = "pdf" | "orders_csv" | "product_csv" | "all";
type Phase = "config" | "working" | "done" | "error";
type StatusFilter = "all" | "completed" | "cancelled";
type MethodFilter = "all" | "GCash" | "Cash";

const PRESETS: PresetKey[] = ["today", "yesterday", "week", "last_week", "month", "last_month", "custom"];
const FORMATS: { key: Format; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "pdf", label: "PDF summary", icon: "document-text-outline" },
  { key: "orders_csv", label: "Orders CSV", icon: "grid-outline" },
  { key: "product_csv", label: "Product sales CSV", icon: "cube-outline" },
  { key: "all", label: "All files", icon: "albums-outline" },
];

function ymd(d: Date): string {
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Shared report configuration + generation sheet. Admins choose any branch (or
 * all); baristas are shown their assigned branch locked. The database RPCs
 * enforce the same scope, so the lock can't be bypassed.
 */
export function ReportGeneratorSheet({
  visible,
  onClose,
  mode,
  branches = [],
}: {
  visible: boolean;
  onClose: () => void;
  mode: "admin" | "staff";
  branches?: Branch[];
}) {
  const insets = useSafeAreaInsets();
  const profile = useAuth((s) => s.profile);

  const [preset, setPreset] = useState<PresetKey>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [branchScope, setBranchScope] = useState<string | null>(null); // admin only; null = all
  const [format, setFormat] = useState<Format>("pdf");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [methodFilter, setMethodFilter] = useState<MethodFilter>("all");
  const [advanced, setAdvanced] = useState(false);

  const [phase, setPhase] = useState<Phase>("config");
  const [progress, setProgress] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // An all-access barista can choose branches just like an admin; a normal
  // barista is locked to their assigned branch. (RPCs enforce this server-side.)
  const allAccessStaff = mode === "staff" && !!profile?.all_branches_access;
  const canChooseBranch = mode === "admin" || allAccessStaff;
  const staffNoBranch = mode === "staff" && !profile?.branch_id && !allAccessStaff;
  const scopeBranchId = canChooseBranch ? branchScope : profile?.branch_id ?? null;
  const scopeLabel = !canChooseBranch
    ? profile?.branch_name ?? "Your branch"
    : branchScope
      ? branches.find((b) => b.id === branchScope)?.name ?? "Branch"
      : "All branches";

  // Resolve the chosen date range (custom is validated on generate).
  const resolvedRange = useMemo(() => {
    if (preset !== "custom") return presetRange(preset);
    const from = parseYmd(customFrom);
    const toDay = parseYmd(customTo);
    if (!from || !toDay) return null;
    const to = new Date(toDay.getTime() + 86_400_000); // inclusive end day
    if (to <= from) return null;
    return { from, to };
  }, [preset, customFrom, customTo]);

  function reset() {
    setPhase("config");
    setProgress("");
    setErrorMsg("");
  }

  function fail(message: string) {
    setErrorMsg(message);
    setPhase("error");
    haptics.warning();
  }

  async function run() {
    if (staffNoBranch) return;
    if (!resolvedRange) {
      fail("Enter a valid custom date range (YYYY-MM-DD), with the end on or after the start.");
      return;
    }
    const { from, to } = resolvedRange;
    setPhase("working");
    setErrorMsg("");
    try {
      setProgress("Preparing data…");
      let orders: ReportFullOrder[] = await fetchReportOrders(
        from.toISOString(),
        to.toISOString(),
        scopeBranchId,
      );
      orders = orders.filter(
        (o) =>
          (statusFilter === "all" || o.status === statusFilter) &&
          (methodFilter === "all" || o.payment_method === methodFilter),
      );
      if (orders.length === 0) {
        fail("No orders match this selection. Try a different date range or filters.");
        return;
      }

      const feedback = await fetchReportFeedback(from.toISOString(), to.toISOString(), scopeBranchId).catch(
        () => null,
      );

      setProgress("Generating report…");
      const summary = buildReportSummary(orders);
      const meta: ReportMeta = {
        title: "Sales & Operations Report",
        scopeLabel,
        rangeLabel: rangeLabel(from, to),
        generatedAt: formatDateTime(new Date().toISOString()),
        generatedBy: `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() || "Cafinity user",
        role: mode === "admin" ? "Administrator" : "Barista",
      };

      const scopeTok = sanitizeFilename(scopeBranchId ? scopeLabel : "All_Branches");
      const dateTok = `${ymd(from)}_to_${ymd(new Date(to.getTime() - 86_400_000))}`;

      setProgress("Creating file…");
      if (format === "pdf" || format === "all") {
        await sharePdf(reportHtml(meta, summary, feedback, mode === "admin" && !scopeBranchId), `Cafinity_Sales_${scopeTok}_${dateTok}.pdf`);
      }
      if (format === "orders_csv" || format === "all") {
        await shareCsv(ordersCsv(orders), `Cafinity_Orders_${scopeTok}_${dateTok}.csv`);
      }
      if (format === "product_csv" || format === "all") {
        await shareCsv(productSalesCsv(orders), `Cafinity_Product_Sales_${scopeTok}_${dateTok}.csv`);
      }

      setProgress("Ready to share");
      setPhase("done");
      haptics.success();
    } catch (e) {
      if (e instanceof ReportScopeError) {
        fail(e.message);
      } else {
        fail(humanizeError(e, "Could not generate the report. Please try again."));
      }
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/40" onPress={phase === "working" ? undefined : onClose}>
        <Pressable
          onPress={() => {}}
          style={{ paddingBottom: insets.bottom + 16, maxHeight: "90%" }}
          className="rounded-t-3xl bg-surface px-5 pt-3"
        >
          <View className="mb-3 items-center">
            <View className="h-1.5 w-10 rounded-full bg-line" />
          </View>
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="font-heading text-lg text-textPrimary">Generate report</Text>
            <Pressable onPress={onClose} hitSlop={10} disabled={phase === "working"} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={Colors.textMuted} />
            </Pressable>
          </View>

          {/* ---- Working / Done / Error states ---- */}
          {phase === "working" ? (
            <View className="items-center py-10">
              <ActivityIndicator color={Colors.brand} size="large" />
              <Text className="mt-4 text-sm font-semibold text-textPrimary">{progress}</Text>
              <Text className="mt-1 text-xs text-textMuted">This may take a moment for large ranges.</Text>
            </View>
          ) : phase === "done" ? (
            <View className="items-center py-8">
              <View className="h-14 w-14 items-center justify-center rounded-full bg-successSoft">
                <Ionicons name="checkmark" size={30} color={Colors.success} />
              </View>
              <Text className="mt-3 font-heading text-base text-textPrimary">Report generated</Text>
              <Text className="mt-1 px-6 text-center text-xs text-textMuted">
                The share sheet opened with your file{format === "all" ? "s" : ""}. You can save or send it
                from there.
              </Text>
              <View className="mt-5 w-full gap-2">
                <Button label="Generate another" variant="outline" onPress={reset} />
                <Button label="Close" onPress={onClose} />
              </View>
            </View>
          ) : phase === "error" ? (
            <View className="items-center py-6">
              <View className="h-14 w-14 items-center justify-center rounded-full bg-dangerSoft">
                <Ionicons name="alert" size={30} color={Colors.danger} />
              </View>
              <Text className="mt-3 px-6 text-center text-sm font-medium text-textPrimary">{errorMsg}</Text>
              <View className="mt-5 w-full gap-2">
                <Button label="Back to options" variant="outline" onPress={reset} />
              </View>
            </View>
          ) : staffNoBranch ? (
            <View className="items-center py-8">
              <Ionicons name="business-outline" size={34} color={Colors.textMuted} />
              <Text className="mt-3 px-6 text-center text-sm font-medium text-textPrimary">
                Your staff account isn&apos;t assigned to a branch yet.
              </Text>
              <Text className="mt-1 px-6 text-center text-xs text-textMuted">
                Ask an administrator to assign your branch before generating a report.
              </Text>
              <View className="mt-5 w-full">
                <Button label="Close" variant="outline" onPress={onClose} />
              </View>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Date range */}
              <Text className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-textMuted">
                Date range
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <Chip key={p} label={PRESET_LABEL[p]} active={preset === p} onPress={() => setPreset(p)} />
                ))}
              </View>
              {preset === "custom" ? (
                <View className="mt-2 flex-row gap-2">
                  <DateField label="From" value={customFrom} onChange={setCustomFrom} />
                  <DateField label="To" value={customTo} onChange={setCustomTo} />
                </View>
              ) : null}

              {/* Branch scope */}
              <Text className="mb-1.5 mt-5 text-[11px] font-semibold uppercase tracking-wide text-textMuted">
                Branch
              </Text>
              {!canChooseBranch ? (
                <View className="flex-row items-center gap-2 rounded-xl border border-line bg-surfaceMuted px-3 py-2.5">
                  <Ionicons name="lock-closed" size={14} color={Colors.textMuted} />
                  <Text className="text-sm font-semibold text-textPrimary">{scopeLabel}</Text>
                  <Text className="text-xs text-textMuted">· your assigned branch</Text>
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
                  <Chip label="All branches" active={branchScope === null} onPress={() => setBranchScope(null)} />
                  {branches.map((b) => (
                    <Chip key={b.id} label={b.name} active={branchScope === b.id} onPress={() => setBranchScope(b.id)} />
                  ))}
                </ScrollView>
              )}

              {/* Format */}
              <Text className="mb-1.5 mt-5 text-[11px] font-semibold uppercase tracking-wide text-textMuted">
                Export
              </Text>
              <View className="gap-2">
                {FORMATS.map((f) => (
                  <Pressable
                    key={f.key}
                    onPress={() => setFormat(f.key)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: format === f.key }}
                    accessibilityLabel={f.label}
                    className={`flex-row items-center rounded-xl border p-3 ${
                      format === f.key ? "border-brandPrimary bg-accent-100" : "border-line bg-surface"
                    }`}
                  >
                    <Ionicons name={f.icon} size={18} color={Colors.brand} />
                    <Text className="ml-3 flex-1 text-sm font-semibold text-textPrimary">{f.label}</Text>
                    <Ionicons
                      name={format === f.key ? "radio-button-on" : "radio-button-off"}
                      size={20}
                      color={format === f.key ? Colors.brand : "#C9A47C"}
                    />
                  </Pressable>
                ))}
              </View>

              {/* Advanced filters */}
              <Pressable
                onPress={() => setAdvanced((a) => !a)}
                className="mt-4 flex-row items-center gap-1.5 py-1"
              >
                <Ionicons name={advanced ? "chevron-down" : "chevron-forward"} size={16} color={Colors.textMuted} />
                <Text className="text-sm font-semibold text-textSecondary">Advanced filters</Text>
              </Pressable>
              {advanced ? (
                <View className="gap-3 pt-1">
                  <View>
                    <Text className="mb-1.5 text-xs text-textMuted">Order status</Text>
                    <View className="flex-row gap-2">
                      {(["all", "completed", "cancelled"] as StatusFilter[]).map((s) => (
                        <Chip key={s} label={s === "all" ? "All" : s} active={statusFilter === s} onPress={() => setStatusFilter(s)} />
                      ))}
                    </View>
                  </View>
                  <View>
                    <Text className="mb-1.5 text-xs text-textMuted">Payment method</Text>
                    <View className="flex-row gap-2">
                      {(["all", "GCash", "Cash"] as MethodFilter[]).map((m) => (
                        <Chip key={m} label={m === "all" ? "All" : m} active={methodFilter === m} onPress={() => setMethodFilter(m)} />
                      ))}
                    </View>
                  </View>
                </View>
              ) : null}

              <View className="mt-6">
                <Button label="Generate report" onPress={run} haptic="light" />
              </View>
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      className={`h-9 justify-center rounded-full px-3.5 ${
        active ? "bg-brandPrimary" : "border border-line bg-surface"
      }`}
    >
      <Text className={`text-xs font-semibold ${active ? "text-white" : "text-textSecondary"}`}>{label}</Text>
    </Pressable>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (t: string) => void;
}) {
  return (
    <View className="flex-1">
      <Text className="mb-1 text-xs text-textMuted">{label} (YYYY-MM-DD)</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="2026-06-01"
        placeholderTextColor={Colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="numbers-and-punctuation"
        className="rounded-xl border border-line bg-surface px-3 py-2.5 text-base text-textPrimary"
      />
    </View>
  );
}
