import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Badge } from "@/components/ui/Badge";
import { BranchPickerSheet, BranchSelectorField } from "@/components/ui/BranchSelector";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { ProductImage } from "@/components/ui/ProductImage";
import { Screen } from "@/components/ui/Screen";
import { Colors } from "@/constants/theme";
import { haptics } from "@/lib/haptics";
import {
  getBranches,
  getInventory,
  InventoryConflictError,
  saveBranchInventory,
  type InventoryRow,
  type InventorySaveItem,
} from "@/lib/api";
import { humanizeError } from "@/lib/errors";
import { peso } from "@/lib/format";
import { localProductImage } from "@/lib/productImages";
import type { Branch } from "@/types/models";

type StockFilter = "all" | "low" | "out" | "hidden";

const MAX_STOCK = 100000;

/** A pending, unsaved edit for one inventory row (stock kept as raw text). */
interface Draft {
  stock: string;
  available: boolean;
}

/** null = valid. Validates a draft stock string (whole number, 0..MAX). */
function stockError(text: string): string | null {
  const t = text.trim();
  if (t === "") return "Required";
  if (!/^\d+$/.test(t)) return "Whole numbers only";
  const n = Number(t);
  if (n > MAX_STOCK) return `Max ${MAX_STOCK}`;
  return null;
}

export default function AdminInventoryScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [branchSheet, setBranchSheet] = useState(false);
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [dataBranchId, setDataBranchId] = useState<string | null>(null); // branch the rows belong to
  const [loading, setLoading] = useState(false); // a fetch is in flight
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StockFilter>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Concurrency guards: dedupe requests, ignore stale branch responses, and keep
  // effects free of churny state deps so the screen can't enter a refetch loop.
  const reqIdRef = useRef(0);
  const inflightRef = useRef(false);
  const dataBranchRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);

  // Unsaved edits keyed by inventory row id. Absent = unchanged.
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function toggleExpand(name: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function showFlash(msg: string) {
    setFlash(msg);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 2800);
  }
  useEffect(() => {
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  useEffect(() => {
    getBranches()
      .then((b) => {
        setBranches(b);
        if (b.length) setBranchId((cur) => cur ?? b[0].id);
      })
      .catch(() => {});
  }, []);

  // Stable loader (no reactive deps → can't drive a refetch loop). Tags each
  // request with an id so a slow response from a previous branch is ignored.
  const load = useCallback(async (bId: string, mode: "initial" | "refresh") => {
    if (!bId) return;
    const id = ++reqIdRef.current;
    inflightRef.current = true;
    if (mode === "refresh") setRefreshing(true);
    else setLoading(true);
    setError(null);
    // Defensive safeguard: a request that never settles can't leave the UI
    // spinning forever — surface a retryable error instead.
    const safety = setTimeout(() => {
      if (reqIdRef.current === id && inflightRef.current) {
        inflightRef.current = false;
        setLoading(false);
        setRefreshing(false);
        setError("Inventory is taking too long to load. Check your connection and try again.");
        if (__DEV__) console.warn("[inventory] load safeguard fired for branch", bId);
      }
    }, 15000);
    try {
      const data = await getInventory(bId);
      if (reqIdRef.current !== id) return; // superseded by a newer branch selection
      setRows(data);
      setDataBranchId(bId);
      dataBranchRef.current = bId;
    } catch (e) {
      if (reqIdRef.current !== id) return;
      setError(humanizeError(e, "Inventory could not be loaded."));
    } finally {
      clearTimeout(safety);
      if (reqIdRef.current === id) {
        inflightRef.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  // Load when the selected branch changes (initial load / branch switch).
  useEffect(() => {
    if (branchId) void load(branchId, "initial");
  }, [branchId, load]);

  // Light refresh on tab focus — only when this branch's data is already loaded,
  // there are no unsaved edits, and nothing is in flight (so it can't loop).
  useFocusEffect(
    useCallback(() => {
      if (
        branchId &&
        dataBranchRef.current === branchId &&
        !dirtyRef.current &&
        !inflightRef.current
      ) {
        void load(branchId, "refresh");
      }
    }, [branchId, load]),
  );

  function onRefresh() {
    if (branchId) void load(branchId, "refresh");
  }

  // ---- Draft helpers --------------------------------------------------------
  const draftFor = (r: InventoryRow): Draft => drafts[r.id] ?? {
    stock: String(r.stock_quantity),
    available: r.is_available,
  };
  const isDirty = useCallback(
    (r: InventoryRow): boolean => {
      const d = drafts[r.id];
      if (!d) return false;
      const err = stockError(d.stock);
      const stockChanged = err ? true : Number(d.stock) !== r.stock_quantity;
      return stockChanged || d.available !== r.is_available;
    },
    [drafts],
  );

  function editStock(r: InventoryRow, text: string) {
    setDrafts((prev) => ({
      ...prev,
      [r.id]: { stock: text, available: (prev[r.id] ?? draftFor(r)).available },
    }));
  }
  function toggleAvail(r: InventoryRow) {
    haptics.selection();
    setDrafts((prev) => {
      const cur = prev[r.id] ?? { stock: String(r.stock_quantity), available: r.is_available };
      return { ...prev, [r.id]: { ...cur, available: !cur.available } };
    });
  }

  const dirtyRows = useMemo(() => rows.filter(isDirty), [rows, isDirty]);
  const dirtyCount = dirtyRows.length;
  // Mirror dirtiness into a ref so the focus effect can read it without taking a
  // reactive dependency (which would otherwise re-fire the effect).
  useEffect(() => {
    dirtyRef.current = dirtyCount > 0;
  }, [dirtyCount]);
  const hasInvalid = useMemo(
    () => dirtyRows.some((r) => stockError(drafts[r.id]?.stock ?? "")),
    [dirtyRows, drafts],
  );

  function discardAll() {
    setDrafts({});
    haptics.light();
  }

  // ---- Save -----------------------------------------------------------------
  function attemptSave() {
    if (dirtyCount === 0) return;
    if (hasInvalid) {
      showFlash("Fix the highlighted values first.");
      haptics.warning();
      return;
    }
    // Require a review step for risky batches: many edits, a zero-out, or a drop
    // into the low-stock zone that may make a product unavailable.
    const goesZero = dirtyRows.some((r) => Number(drafts[r.id]!.stock) === 0);
    const bigDrop = dirtyRows.some((r) => {
      const n = Number(drafts[r.id]!.stock);
      return n < r.stock_quantity && n <= r.low_stock_threshold;
    });
    if (dirtyCount >= 3 || goesZero || bigDrop) {
      setReviewOpen(true);
    } else {
      void doSave();
    }
  }

  async function doSave() {
    setReviewOpen(false);
    const items: InventorySaveItem[] = dirtyRows.map((r) => ({
      id: r.id,
      stock_quantity: Number(drafts[r.id]!.stock),
      is_available: drafts[r.id]!.available,
      updated_at: r.updated_at,
    }));
    setSaving(true);
    try {
      const newUpdatedAt = await saveBranchInventory(items);
      // Update baseline in place (preserves scroll + expanded groups), clear dirty.
      setRows((prev) =>
        prev.map((r) => {
          const it = items.find((i) => i.id === r.id);
          return it
            ? { ...r, stock_quantity: it.stock_quantity, is_available: it.is_available, updated_at: newUpdatedAt }
            : r;
        }),
      );
      setDrafts({});
      haptics.success();
      showFlash(`Saved ${items.length} change${items.length === 1 ? "" : "s"}.`);
    } catch (e) {
      if (e instanceof InventoryConflictError) {
        haptics.warning();
        Alert.alert(
          "Inventory changed elsewhere",
          "This inventory value changed elsewhere. Refresh before saving — your edits will be kept so you can re-apply them.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Refresh", onPress: () => branchId && void load(branchId, "refresh") },
          ],
        );
      } else {
        haptics.warning();
        showFlash(humanizeError(e, "Could not save. Try again."));
      }
    } finally {
      setSaving(false);
    }
  }

  // ---- Navigation / branch guards ------------------------------------------
  function guardThen(action: () => void) {
    if (dirtyCount === 0) {
      action();
      return;
    }
    Alert.alert(
      "Unsaved inventory changes",
      `You have ${dirtyCount} unsaved change${dirtyCount === 1 ? "" : "s"}.`,
      [
        { text: "Keep editing", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: () => { setDrafts({}); action(); } },
      ],
    );
  }

  function requestBranch(id: string | null) {
    if (!id || id === branchId) {
      setBranchId(id);
      return;
    }
    guardThen(() => setBranchId(id));
  }

  // Block leaving the screen (back/close) while edits are pending.
  useEffect(() => {
    const sub = navigation.addListener("beforeRemove", (e: any) => {
      if (dirtyCount === 0 || saving) return;
      e.preventDefault();
      Alert.alert(
        "Unsaved inventory changes",
        `You have ${dirtyCount} unsaved change${dirtyCount === 1 ? "" : "s"}.`,
        [
          { text: "Keep editing", style: "cancel" },
          { text: "Discard", style: "destructive", onPress: () => navigation.dispatch(e.data.action) },
        ],
      );
    });
    return sub;
  }, [navigation, dirtyCount, saving]);

  const counts = useMemo(() => {
    let low = 0;
    let out = 0;
    let hidden = 0;
    for (const r of rows) {
      const isOut = r.stock_quantity <= 0;
      if (isOut) out += 1;
      else if (r.stock_quantity <= r.low_stock_threshold) low += 1;
      if (!r.is_available && !isOut) hidden += 1;
    }
    return { all: rows.length, low, out, hidden };
  }, [rows]);

  // Group variants under their product; filter/search at the variant level.
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const variantState = (r: InventoryRow) => {
      const out = r.stock_quantity <= 0;
      const low = !out && r.stock_quantity <= r.low_stock_threshold;
      const hidden = !r.is_available && !out;
      return { out, low, hidden };
    };
    const matchesFilter = (r: InventoryRow) => {
      const s = variantState(r);
      if (filter === "low") return s.low;
      if (filter === "out") return s.out;
      if (filter === "hidden") return s.hidden;
      return true;
    };

    const map = new Map<string, InventoryRow[]>();
    for (const r of rows) {
      const arr = map.get(r.product_name) ?? [];
      arr.push(r);
      map.set(r.product_name, arr);
    }

    const allDefault = filter === "all" && !q;
    const out: {
      name: string;
      variants: InventoryRow[];
      total: number;
      lowC: number;
      outC: number;
      hiddenC: number;
      size: number;
    }[] = [];
    for (const [name, variants] of map) {
      const matchesSearch = (r: InventoryRow) =>
        !q || name.toLowerCase().includes(q) || r.variant_name.toLowerCase().includes(q);
      const shown = variants.filter((r) => matchesFilter(r) && matchesSearch(r));
      if (shown.length === 0) continue;
      let lowC = 0;
      let outC = 0;
      let hiddenC = 0;
      for (const r of variants) {
        const s = variantState(r);
        if (s.out) outC += 1;
        else if (s.low) lowC += 1;
        if (s.hidden) hiddenC += 1;
      }
      out.push({
        name,
        variants: allDefault ? variants : shown,
        total: variants.reduce((n, r) => n + r.stock_quantity, 0),
        lowC,
        outC,
        hiddenC,
        size: variants.length,
      });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, [rows, query, filter]);

  const autoExpand = filter !== "all" || query.trim() !== "";
  // We have rows for the *currently selected* branch (vs. still fetching them).
  const hasData = dataBranchId !== null && dataBranchId === branchId;
  const initialLoading = loading && !hasData;

  return (
    <Screen>
      <View className="px-5 pb-2 pt-2">
        <Text className="font-display text-2xl text-textPrimary">Inventory</Text>
      </View>

      {/* Branch selector */}
      <View className="px-5 py-1">
        <BranchSelectorField
          branch={branches.find((b) => b.id === branchId) ?? null}
          label="Branch"
          onPress={() => setBranchSheet(true)}
        />
      </View>
      <BranchPickerSheet
        visible={branchSheet}
        branches={branches}
        selectedId={branchId}
        onSelect={(id) => id && requestBranch(id)}
        onClose={() => setBranchSheet(false)}
      />

      {/* Search */}
      <View className="mx-5 mt-2 flex-row items-center rounded-2xl border border-line bg-surface px-3">
        <Ionicons name="search" size={18} color={Colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search product or size"
          placeholderTextColor={Colors.textMuted}
          autoCorrect={false}
          className="flex-1 px-2 py-3 text-base text-textPrimary"
        />
        {query ? (
          <Pressable onPress={() => setQuery("")} hitSlop={10} accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {/* Filter chips */}
      <View className="flex-row gap-2 px-5 py-2">
        <FilterChip label="All" count={counts.all} active={filter === "all"} onPress={() => setFilter("all")} />
        <FilterChip label="Low" count={counts.low} active={filter === "low"} onPress={() => setFilter("low")} />
        <FilterChip label="Out" count={counts.out} active={filter === "out"} onPress={() => setFilter("out")} />
        <FilterChip label="Hidden" count={counts.hidden} active={filter === "hidden"} onPress={() => setFilter("hidden")} />
      </View>

      {flash ? (
        <View className="mx-5 mb-1 flex-row items-center gap-2 rounded-xl bg-successSoft px-3 py-2">
          <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
          <Text className="flex-1 text-xs font-medium text-success">{flash}</Text>
        </View>
      ) : null}

      {/* Error with no data to fall back on → full error state with retry. */}
      {error && hasData ? (
        <View className="mx-5 mb-1 flex-row items-center gap-2 rounded-xl bg-dangerSoft px-3 py-2">
          <Ionicons name="alert-circle" size={16} color={Colors.danger} />
          <Text className="flex-1 text-xs font-medium text-danger">{error}</Text>
          <Pressable onPress={onRefresh} hitSlop={8}>
            <Text className="text-xs font-bold text-danger">Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {initialLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={Colors.brand} />
        </View>
      ) : error && !hasData ? (
        <ErrorState
          message={error}
          onRetry={() => branchId && void load(branchId, "initial")}
        />
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(g) => g.name}
          extraData={drafts}
          contentContainerClassName="p-4 gap-2"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          removeClippedSubviews
          initialNumToRender={10}
          windowSize={11}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brand} />
          }
          ListEmptyComponent={
            <View className="mt-10 items-center px-8">
              <Ionicons name="cube-outline" size={32} color={Colors.textMuted} />
              <Text className="mt-2 text-center text-sm text-textSecondary">
                {query.trim() || filter !== "all"
                  ? "No items match this view."
                  : "No inventory records found for this branch."}
              </Text>
              {!query.trim() && filter === "all" ? (
                <Pressable onPress={onRefresh} hitSlop={8} className="mt-3">
                  <Text className="text-sm font-semibold text-brandPrimary">Refresh</Text>
                </Pressable>
              ) : null}
            </View>
          }
          renderItem={({ item: g }) => {
            const open = autoExpand || expanded.has(g.name);
            const dirtyInGroup = g.variants.some(isDirty);
            return (
              <View
                className={`overflow-hidden rounded-2xl border bg-surface ${
                  dirtyInGroup
                    ? "border-brandPrimary"
                    : g.outC > 0
                      ? "border-danger"
                      : g.lowC > 0
                        ? "border-warning"
                        : "border-line"
                }`}
              >
                <Pressable
                  onPress={() => !autoExpand && toggleExpand(g.name)}
                  className="flex-row items-center p-3"
                >
                  <ProductImage
                    source={localProductImage(g.name)}
                    emoji="☕"
                    emojiSize={20}
                    className="mr-3 h-12 w-12 rounded-xl"
                    accessibilityLabel={g.name}
                  />
                  <View className="flex-1 pr-2">
                    <Text className="text-sm font-bold text-espresso" numberOfLines={1}>
                      {g.name}
                    </Text>
                    <Text className="text-xs text-textMuted">
                      {g.size} size{g.size === 1 ? "" : "s"} · {g.total} in stock
                    </Text>
                    <View className="mt-1 flex-row gap-1.5">
                      {dirtyInGroup ? <Badge label="Edited" tone="brand" /> : null}
                      {g.outC > 0 ? <Badge label={`${g.outC} out`} tone="red" /> : null}
                      {g.lowC > 0 ? <Badge label={`${g.lowC} low`} tone="amber" /> : null}
                      {g.hiddenC > 0 ? <Badge label={`${g.hiddenC} hidden`} tone="gray" /> : null}
                    </View>
                  </View>
                  {!autoExpand ? (
                    <Ionicons name={open ? "chevron-up" : "chevron-down"} size={20} color={Colors.textMuted} />
                  ) : null}
                </Pressable>

                {open ? (
                  <View className="border-t border-line px-3">
                    {g.variants.map((v, i) => (
                      <VariantRow
                        key={v.id}
                        row={v}
                        draft={draftFor(v)}
                        dirty={isDirty(v)}
                        error={drafts[v.id] ? stockError(drafts[v.id]!.stock) : null}
                        last={i === g.variants.length - 1}
                        onStock={editStock}
                        onToggle={toggleAvail}
                      />
                    ))}
                  </View>
                ) : null}
              </View>
            );
          }}
        />
      )}

      {/* Sticky save bar — only when there are unsaved edits */}
      {dirtyCount > 0 ? (
        <View
          style={{ paddingBottom: insets.bottom + 8 }}
          className="border-t border-line bg-surface px-4 pt-3"
        >
          <View className="flex-row items-center gap-3">
            <View className="flex-1">
              <Text className="text-sm font-bold text-textPrimary">
                {dirtyCount} unsaved change{dirtyCount === 1 ? "" : "s"}
              </Text>
              {hasInvalid ? (
                <Text className="text-xs font-medium text-danger">Some values need fixing</Text>
              ) : (
                <Text className="text-xs text-textMuted">Review and save when ready</Text>
              )}
            </View>
            <Button label="Discard" variant="outline" onPress={discardAll} disabled={saving} className="px-4" />
            <Button
              label="Save changes"
              onPress={attemptSave}
              loading={saving}
              disabled={hasInvalid}
              haptic="success"
              className="px-4"
            />
          </View>
        </View>
      ) : null}

      {/* Review sheet for risky batches */}
      <Modal visible={reviewOpen} transparent animationType="slide" onRequestClose={() => setReviewOpen(false)}>
        <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setReviewOpen(false)}>
          <Pressable
            onPress={() => {}}
            style={{ paddingBottom: insets.bottom + 16 }}
            className="rounded-t-3xl bg-surface px-5 pt-4"
          >
            <Text className="font-heading text-lg text-textPrimary">Review inventory changes</Text>
            <Text className="mb-3 mt-0.5 text-xs text-textSecondary">
              {dirtyCount} change{dirtyCount === 1 ? "" : "s"} for{" "}
              {branches.find((b) => b.id === branchId)?.name ?? "this branch"}.
            </Text>
            <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
              {dirtyRows.map((r, idx) => {
                const next = Number(drafts[r.id]!.stock);
                const zero = next === 0;
                return (
                  <View key={r.id} className={`py-2.5 ${idx > 0 ? "border-t border-line" : ""}`}>
                    <Text className="text-sm font-semibold text-textPrimary">
                      {r.product_name} — {r.variant_name}
                    </Text>
                    <View className="mt-0.5 flex-row items-center gap-2">
                      <Text className="text-sm text-textMuted">{r.stock_quantity}</Text>
                      <Ionicons name="arrow-forward" size={13} color={Colors.textMuted} />
                      <Text className={`text-sm font-bold ${zero ? "text-danger" : "text-textPrimary"}`}>
                        {next}
                      </Text>
                      {zero ? <Badge label="Out of stock" tone="red" /> : null}
                      {!drafts[r.id]!.available ? <Badge label="Hidden" tone="gray" /> : null}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
            <View className="mt-4 flex-row gap-3">
              <Button label="Cancel" variant="outline" onPress={() => setReviewOpen(false)} className="flex-1" />
              <Button label="Confirm changes" onPress={() => void doSave()} loading={saving} haptic="success" className="flex-1" />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function VariantRow({
  row,
  draft,
  dirty,
  error,
  last,
  onStock,
  onToggle,
}: {
  row: InventoryRow;
  draft: Draft;
  dirty: boolean;
  error: string | null;
  last: boolean;
  onStock: (r: InventoryRow, text: string) => void;
  onToggle: (r: InventoryRow) => void;
}) {
  const stockNum = Number(draft.stock);
  const out = !error && stockNum <= 0;
  const low = !error && !out && stockNum <= row.low_stock_threshold;
  return (
    <View className={`py-2.5 ${last ? "" : "border-b border-line"}`}>
      <View className="flex-row items-center">
        <View className="flex-1 pr-2">
          <Text className="text-sm font-semibold text-espresso">{row.variant_name}</Text>
          <Text className="text-xs text-textMuted">{peso(row.price)}</Text>
          <View className="mt-0.5 flex-row gap-1.5">
            {out ? <Badge label="Out" tone="red" /> : low ? <Badge label="Low" tone="amber" /> : null}
            {!draft.available && !out ? <Badge label="Hidden" tone="gray" /> : null}
            {dirty ? <Badge label="Edited" tone="brand" /> : null}
          </View>
        </View>
        <View className="items-center">
          <Text className="text-[10px] text-textMuted">Stock</Text>
          <TextInput
            value={draft.stock}
            keyboardType="number-pad"
            onChangeText={(t) => onStock(row, t)}
            accessibilityLabel={`${row.product_name} ${row.variant_name} stock`}
            className={`w-16 rounded-xl border bg-cream py-1.5 text-center text-base font-bold text-espresso ${
              error ? "border-danger" : dirty ? "border-brandPrimary" : "border-brand-200"
            }`}
          />
        </View>
        <Pressable
          onPress={() => onToggle(row)}
          className="ml-2 h-10 w-10 items-center justify-center rounded-full bg-cream"
          accessibilityLabel={draft.available ? "Hide from menu" : "Show on menu"}
        >
          <Ionicons
            name={draft.available ? "eye" : "eye-off"}
            size={18}
            color={draft.available ? Colors.brand : "#a8a29e"}
          />
        </Pressable>
      </View>
      {error ? <Text className="mt-1 text-[11px] font-medium text-danger">{error}</Text> : null}
    </View>
  );
}

function FilterChip({
  label,
  count,
  active,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 items-center rounded-full border py-2 ${
        active ? "border-brandPrimary bg-brandPrimary" : "border-line bg-surface"
      }`}
    >
      <Text className={`text-xs font-semibold ${active ? "text-white" : "text-textSecondary"}`}>
        {label} {count}
      </Text>
    </Pressable>
  );
}
