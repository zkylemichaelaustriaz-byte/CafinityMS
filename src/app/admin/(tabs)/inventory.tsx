import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { Badge } from "@/components/ui/Badge";
import { ErrorState } from "@/components/ui/ErrorState";
import { ProductImage } from "@/components/ui/ProductImage";
import { Screen } from "@/components/ui/Screen";
import { Colors } from "@/constants/theme";
import { getBranches, getInventory, updateStock, type InventoryRow } from "@/lib/api";
import { humanizeError } from "@/lib/errors";
import { peso } from "@/lib/format";
import { localProductImage } from "@/lib/productImages";
import type { Branch } from "@/types/models";

type StockFilter = "all" | "low" | "out" | "hidden";

export default function AdminInventoryScreen() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StockFilter>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);

  function toggleExpand(name: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  useEffect(() => {
    getBranches()
      .then((b) => {
        setBranches(b);
        if (b.length) setBranchId((cur) => cur ?? b[0].id);
      })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    setError(null);
    try {
      setRows(await getInventory(branchId));
    } catch (e) {
      setError(humanizeError(e, "Could not load inventory."));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [branchId]);

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

  async function commitStock(row: InventoryRow, text: string) {
    const qty = Math.max(0, parseInt(text, 10) || 0);
    if (qty === row.stock_quantity) return;
    const available = qty > 0 ? row.is_available : false;
    setRows((prev) =>
      prev.map((r) =>
        r.id === row.id ? { ...r, stock_quantity: qty, is_available: available } : r,
      ),
    );
    try {
      await updateStock(row.id, qty, available);
    } catch {
      void load();
    }
  }

  async function toggleAvail(row: InventoryRow) {
    const available = !row.is_available;
    setRows((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, is_available: available } : r)),
    );
    try {
      await updateStock(row.id, row.stock_quantity, available);
    } catch {
      void load();
    }
  }

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

  return (
    <Screen>
      <View className="px-5 pb-2 pt-2">
        <Text className="font-display text-2xl text-textPrimary">Inventory</Text>
      </View>

      {/* Branch selector */}
      <View className="px-5 py-1">
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={branches}
          keyExtractor={(b) => b.id}
          contentContainerClassName="gap-2"
          renderItem={({ item }) => {
            const active = branchId === item.id;
            return (
              <Pressable
                onPress={() => setBranchId(item.id)}
                className={`rounded-full px-4 py-2 ${
                  active ? "bg-brandPrimary" : "bg-surface border border-brand-100"
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

      {/* Search */}
      <View className="mx-5 mt-2 flex-row items-center rounded-2xl border border-line bg-surface px-3">
        <Ionicons name="search" size={18} color={Colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search product or size"
          placeholderTextColor="#B8A99C"
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
        <FilterChip
          label="All"
          count={counts.all}
          active={filter === "all"}
          onPress={() => setFilter("all")}
        />
        <FilterChip
          label="Low"
          count={counts.low}
          active={filter === "low"}
          onPress={() => setFilter("low")}
        />
        <FilterChip
          label="Out"
          count={counts.out}
          active={filter === "out"}
          onPress={() => setFilter("out")}
        />
        <FilterChip
          label="Hidden"
          count={counts.hidden}
          active={filter === "hidden"}
          onPress={() => setFilter("hidden")}
        />
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={Colors.brand} />
        </View>
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(g) => g.name}
          contentContainerClassName="p-4 gap-2"
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brand} />
          }
          ListEmptyComponent={
            <View className="mt-10 items-center px-8">
              <Ionicons name="search-outline" size={32} color={Colors.textMuted} />
              <Text className="mt-2 text-center text-sm text-textSecondary">
                {query.trim() || filter !== "all"
                  ? "No items match this view."
                  : "No inventory for this branch."}
              </Text>
            </View>
          }
          renderItem={({ item: g }) => {
            const open = autoExpand || expanded.has(g.name);
            return (
              <View
                className={`overflow-hidden rounded-2xl border bg-surface ${
                  g.outC > 0 ? "border-red-200" : g.lowC > 0 ? "border-amber-200" : "border-brand-100"
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
                      {g.outC > 0 ? <Badge label={`${g.outC} out`} tone="red" /> : null}
                      {g.lowC > 0 ? <Badge label={`${g.lowC} low`} tone="amber" /> : null}
                      {g.hiddenC > 0 ? <Badge label={`${g.hiddenC} hidden`} tone="gray" /> : null}
                    </View>
                  </View>
                  {!autoExpand ? (
                    <Ionicons
                      name={open ? "chevron-up" : "chevron-down"}
                      size={20}
                      color={Colors.textMuted}
                    />
                  ) : null}
                </Pressable>

                {open ? (
                  <View className="border-t border-line px-3">
                    {g.variants.map((v, i) => (
                      <VariantRow
                        key={v.id}
                        row={v}
                        last={i === g.variants.length - 1}
                        onCommit={commitStock}
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
    </Screen>
  );
}

function VariantRow({
  row,
  last,
  onCommit,
  onToggle,
}: {
  row: InventoryRow;
  last: boolean;
  onCommit: (r: InventoryRow, text: string) => void;
  onToggle: (r: InventoryRow) => void;
}) {
  const out = row.stock_quantity <= 0;
  const low = !out && row.stock_quantity <= row.low_stock_threshold;
  return (
    <View className={`flex-row items-center py-2.5 ${last ? "" : "border-b border-line"}`}>
      <View className="flex-1 pr-2">
        <Text className="text-sm font-semibold text-espresso">{row.variant_name}</Text>
        <Text className="text-xs text-textMuted">{peso(row.price)}</Text>
        <View className="mt-0.5 flex-row gap-1.5">
          {out ? <Badge label="Out" tone="red" /> : low ? <Badge label="Low" tone="amber" /> : null}
          {!row.is_available && !out ? <Badge label="Hidden" tone="gray" /> : null}
        </View>
      </View>
      <View className="items-center">
        <Text className="text-[10px] text-textMuted">Stock</Text>
        <TextInput
          defaultValue={String(row.stock_quantity)}
          keyboardType="number-pad"
          onEndEditing={(e) => onCommit(row, e.nativeEvent.text)}
          className="w-16 rounded-xl border border-brand-200 bg-cream py-1.5 text-center text-base font-bold text-espresso"
        />
      </View>
      <Pressable
        onPress={() => onToggle(row)}
        className="ml-2 h-10 w-10 items-center justify-center rounded-full bg-cream"
        accessibilityLabel={row.is_available ? "Hide" : "Show"}
      >
        <Ionicons
          name={row.is_available ? "eye" : "eye-off"}
          size={18}
          color={row.is_available ? Colors.brand : "#a8a29e"}
        />
      </Pressable>
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
