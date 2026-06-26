import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { AnimatedPressable } from "@/components/ui/AnimatedPressable";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { CampaignRibbon } from "@/components/ui/CampaignRibbon";
import { ProductGridCard } from "@/components/ui/ProductGridCard";
import { Screen } from "@/components/ui/Screen";
import { Skeleton } from "@/components/ui/Skeleton";
import { Colors, shadow } from "@/constants/theme";
import { getMenu } from "@/lib/api";
import { humanizeError } from "@/lib/errors";
import { peso } from "@/lib/format";
import { useBranch } from "@/store/branch";
import { cartCount, cartSubtotal, useCart } from "@/store/cart";
import { presetByKey } from "@/lib/campaignPresets";
import { getEmptyStateImage } from "@/lib/emptyStateImages";
import { useFavorites } from "@/store/favorites";
import { useRecentSearches } from "@/store/recentSearches";
import { useSeasonalTheme } from "@/store/seasonalTheme";
import type { MenuProduct } from "@/types/models";

type SortKey = "recommended" | "newest" | "price_asc" | "price_desc" | "name";
const SORT_LABEL: Record<SortKey, string> = {
  recommended: "Recommended",
  newest: "Newest",
  price_asc: "Price ↑",
  price_desc: "Price ↓",
  name: "Name A–Z",
};
const minPrice = (p: MenuProduct) =>
  p.variants.length ? Math.min(...p.variants.map((v) => v.price)) : 0;

export default function MenuScreen() {
  const router = useRouter();
  const branch = useBranch((s) => s.branch);
  const lines = useCart((s) => s.lines);
  const favIds = useFavorites((s) => s.ids);
  const loadFavorites = useFavorites((s) => s.load);
  const recent = useRecentSearches((s) => s.terms);
  const addRecent = useRecentSearches((s) => s.add);
  const removeRecent = useRecentSearches((s) => s.remove);

  const [menu, setMenu] = useState<MenuProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const params = useLocalSearchParams<{ collection?: string }>();
  const [collection, setCollection] = useState<string | null>(null);
  const seasonalKey = useSeasonalTheme((s) => s.activeKey);
  const seasonalPreset =
    seasonalKey && seasonalKey !== "default" ? presetByKey(seasonalKey) : null;
  const listRef = useRef<FlatList<MenuProduct>>(null);
  const [sort, setSort] = useState<SortKey>("recommended");

  useEffect(() => {
    if (params.collection) setCollection(String(params.collection));
  }, [params.collection]);

  const load = useCallback(async () => {
    if (!branch) return;
    setLoading(true);
    setError(null);
    void loadFavorites();
    try {
      setMenu(await getMenu(branch.id));
    } catch (e) {
      setError(humanizeError(e, "Could not load the menu."));
      setMenu([]);
    } finally {
      setLoading(false);
    }
  }, [branch, loadFavorites]);

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

  const categories = useMemo(() => {
    const seen: string[] = [];
    for (const p of menu) if (!seen.includes(p.category_name)) seen.push(p.category_name);
    const base = ["All", ...seen];
    // Surface a Favorites filter only once the user has some.
    return favIds.length > 0 ? ["All", "Favorites", ...seen] : base;
  }, [menu, favIds]);

  // Campaign collection filter (from a campaign CTA). Falls back to the full
  // menu when the collection has no products at this branch.
  const collectionHasItems = collection ? menu.some((p) => p.collection_key === collection) : false;
  const effectiveCollection = collection && collectionHasItems ? collection : null;
  const collectionLabel = collection ? presetByKey(collection)?.name ?? "Seasonal" : "";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return menu.filter((p) => {
      const matchCat = effectiveCollection
        ? p.collection_key === effectiveCollection
        : activeCategory === "All" ||
          (activeCategory === "Favorites"
            ? favIds.includes(p.id)
            : p.category_name === activeCategory);
      const matchText =
        !q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);
      return matchCat && matchText;
    });
  }, [menu, search, activeCategory, favIds, effectiveCollection]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    switch (sort) {
      case "newest":
        return arr.sort((a, b) => Number(b.isNew) - Number(a.isNew) || a.name.localeCompare(b.name));
      case "price_asc":
        return arr.sort((a, b) => minPrice(a) - minPrice(b));
      case "price_desc":
        return arr.sort((a, b) => minPrice(b) - minPrice(a));
      case "name":
        return arr.sort((a, b) => a.name.localeCompare(b.name));
      default:
        return arr; // recommended = the existing category/name order
    }
  }, [filtered, sort]);

  function openSort() {
    Alert.alert("Sort by", undefined, [
      ...(["recommended", "newest", "price_asc", "price_desc", "name"] as SortKey[]).map((k) => ({
        text: `${SORT_LABEL[k]}${k === sort ? "  ✓" : ""}`,
        onPress: () => setSort(k),
      })),
      { text: "Cancel", style: "cancel" as const },
    ]);
  }

  const showDiscovery = search.trim() === "" && recent.length > 0;

  function commitSearch() {
    // Only remember terms that actually found something.
    if (search.trim().length >= 2 && filtered.length > 0) addRecent(search);
  }

  if (!branch) {
    return (
      <Screen>
        <View className="px-5 pt-2">
          <Text className="font-display text-3xl text-textPrimary">Menu</Text>
        </View>
        <EmptyState
          emoji="📍"
          title="Choose a branch first"
          subtitle="The menu and stock depend on the branch you order from."
        >
          <Button label="Select a branch" onPress={() => router.push("/branches")} />
        </EmptyState>
      </Screen>
    );
  }

  const count = cartCount(lines);

  return (
    <Screen>
      {/* Header */}
      <View className="px-5 pb-3 pt-2">
        <Text className="font-display text-3xl text-textPrimary">Menu</Text>
        <Pressable
          onPress={() => router.push("/branches")}
          className="mt-1 flex-row items-center gap-1"
        >
          <Ionicons name="location" size={14} color={Colors.brand} />
          <Text className="text-sm font-medium text-brandPrimary">{branch.name}</Text>
          <Ionicons name="chevron-down" size={14} color={Colors.brand} />
        </Pressable>
      </View>

      {/* Search */}
      <View className="mx-5 mb-3 flex-row items-center rounded-2xl border border-line bg-surface px-3">
        <Ionicons name="search" size={18} color="#B8A99C" />
        <TextInput
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={commitSearch}
          returnKeyType="search"
          placeholder="Search drinks…"
          placeholderTextColor={Colors.textMuted}
          className="flex-1 px-2 py-3 text-base text-textPrimary"
        />
        {search ? (
          <Pressable onPress={() => setSearch("")} hitSlop={10}>
            <Ionicons name="close-circle" size={18} color="#C9A47C" />
          </Pressable>
        ) : null}
      </View>

      {/* Campaign discovery ribbon (replaces the old suggestion chips) */}
      {seasonalPreset ? (
        <CampaignRibbon
          preset={seasonalPreset}
          active={collection === seasonalPreset.key}
          onSelect={() => {
            setCollection(seasonalPreset.key);
            listRef.current?.scrollToOffset({ offset: 0, animated: true });
          }}
          onClear={() => setCollection(null)}
        />
      ) : null}

      {/* Recent searches — single-row, horizontally scrollable */}
      {showDiscovery ? (
        <View className="mb-3">
          <View className="mb-1.5 flex-row items-center justify-between px-5">
            <Text className="text-xs font-semibold uppercase tracking-wide text-textMuted">
              Recent
            </Text>
            <Pressable onPress={() => useRecentSearches.getState().clear()} hitSlop={8}>
              <Text className="text-xs font-semibold text-brandPrimary">Clear</Text>
            </Pressable>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2 px-5"
          >
            {recent.map((t) => (
              <Pressable
                key={t}
                onPress={() => setSearch(t)}
                onLongPress={() => removeRecent(t)}
                className="h-9 flex-row items-center gap-1.5 rounded-full border border-line bg-surface px-3"
              >
                <Ionicons name="time-outline" size={13} color={Colors.textMuted} />
                <Text className="text-sm text-textSecondary">{t}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* Category chips */}
      <View className="mb-2 max-h-12">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2 px-5"
        >
          {categories.map((c) => {
            const active = c === activeCategory;
            return (
              <Pressable
                key={c}
                onPress={() => setActiveCategory(c)}
                className={`h-9 justify-center rounded-full px-4 ${
                  active ? "bg-brandPrimary" : "bg-surface border border-line"
                }`}
              >
                <Text
                  className={`text-sm font-semibold ${active ? "text-white" : "text-textSecondary"}`}
                >
                  {c}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Collection has no items at this branch (ribbon shows the active state) */}
      {collection && !effectiveCollection ? (
        <View className="mx-5 mb-2 rounded-xl bg-surfaceMuted px-4 py-2">
          <Text className="text-xs text-textSecondary">
            No {collectionLabel} items available here yet — showing the full menu.
          </Text>
        </View>
      ) : null}

      {/* Result count + sort */}
      {!loading && !error && menu.length > 0 ? (
        <View className="mb-1 flex-row items-center justify-between px-5">
          <Text className="text-xs text-textMuted">
            {filtered.length} {filtered.length === 1 ? "item" : "items"}
            {activeCategory !== "All" && !effectiveCollection ? ` · ${activeCategory}` : ""}
          </Text>
          <Pressable
            onPress={openSort}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Sort menu"
            className="flex-row items-center gap-1"
          >
            <Ionicons name="swap-vertical" size={14} color={Colors.brand} />
            <Text className="text-xs font-semibold text-brandPrimary">{SORT_LABEL[sort]}</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Grid */}
      {loading && menu.length === 0 ? (
        <View className="flex-row flex-wrap gap-3 px-5 pt-1">
          {[0, 1, 2, 3].map((i) => (
            <View key={i} className="overflow-hidden rounded-card bg-surface" style={{ width: "47.5%" }}>
              <Skeleton className="h-36 w-full" />
              <View className="gap-2 p-3">
                <Skeleton className="h-4 w-24 rounded-md" />
                <Skeleton className="h-3 w-full rounded-md" />
                <Skeleton className="h-4 w-14 rounded-md" />
              </View>
            </View>
          ))}
        </View>
      ) : error && menu.length === 0 ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <FlatList
          ref={listRef}
          data={sorted}
          keyExtractor={(p) => p.id}
          numColumns={2}
          columnWrapperClassName="gap-3 px-5"
          contentContainerClassName="gap-3 pb-32 pt-1"
          showsVerticalScrollIndicator={false}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brand} />
          }
          ListFooterComponent={
            sorted.length === 0 ? null : (
              <MenuFooter
                filtered={
                  search.trim() !== "" || activeCategory !== "All" || !!effectiveCollection
                }
                onClear={() => {
                  setSearch("");
                  setActiveCategory("All");
                  setCollection(null);
                }}
                onNotify={() => router.push("/notifications")}
              />
            )
          }
          ListEmptyComponent={
            <EmptyState
              image={getEmptyStateImage(activeCategory === "Favorites" ? "favorites" : "search")}
              emoji="🔍"
              title="No drinks found"
              subtitle={
                search.trim()
                  ? `Nothing matches "${search.trim()}"${
                      activeCategory !== "All" ? ` in ${activeCategory}` : ""
                    }.`
                  : "Try another category."
              }
            >
              {search.trim() || activeCategory !== "All" ? (
                <Button
                  label="Clear search"
                  variant="outline"
                  onPress={() => {
                    setSearch("");
                    setActiveCategory("All");
                  }}
                />
              ) : undefined}
            </EmptyState>
          }
          renderItem={({ item }) => <ProductGridCard product={item} />}
        />
      )}

      {/* Floating cart bar */}
      {count > 0 ? (
        <View className="absolute bottom-4 left-5 right-5">
          <AnimatedPressable
            onPress={() => router.push("/cart")}
            haptic="light"
            className="flex-row items-center justify-between rounded-2xl bg-brandPrimary px-5 py-4"
            style={shadow.floating}
          >
            <View className="flex-row items-center gap-2">
              <View className="h-6 min-w-6 items-center justify-center rounded-full bg-surface px-1.5">
                <Text className="text-xs font-extrabold text-brandPrimary">{count}</Text>
              </View>
              <Text className="text-base font-bold text-white">View cart</Text>
            </View>
            <Text className="font-display text-base text-white">
              {peso(cartSubtotal(lines))}
            </Text>
          </AnimatedPressable>
        </View>
      ) : null}
    </Screen>
  );
}

/** End-of-menu footer: marketing message normally, or a clear-filters prompt. */
function MenuFooter({
  filtered,
  onClear,
  onNotify,
}: {
  filtered: boolean;
  onClear: () => void;
  onNotify: () => void;
}) {
  if (filtered) {
    return (
      <View className="items-center px-8 pb-4 pt-8">
        <Text className="text-center text-sm text-textSecondary">
          You&apos;ve reached the end of these results.
        </Text>
        <Pressable
          onPress={onClear}
          className="mt-3 rounded-full border border-line px-5 py-2"
          accessibilityRole="button"
        >
          <Text className="text-sm font-semibold text-brandPrimary">Clear filters</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View className="items-center px-8 pb-6 pt-10">
      <View className="mb-4 h-px w-16 bg-line" />
      <View className="flex-row items-center gap-2">
        <Ionicons name="cafe" size={15} color={Colors.accent} />
        <Text className="text-xs font-bold uppercase tracking-[2px] text-textPrimary">
          More good things are brewing
        </Text>
      </View>
      <Text className="mt-2 text-center text-sm text-textSecondary">
        New drinks, café favorites, and seasonal creations will continue to arrive at Cafinity.
      </Text>
      <Pressable
        onPress={onNotify}
        className="mt-4 flex-row items-center gap-1.5"
        accessibilityRole="button"
        accessibilityLabel="Turn on notifications"
      >
        <Ionicons name="notifications-outline" size={14} color={Colors.brand} />
        <Text className="text-sm font-semibold text-brandPrimary">Turn on notifications</Text>
      </Pressable>
    </View>
  );
}
