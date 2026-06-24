import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
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
import type { MenuProduct } from "@/types/models";

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
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const params = useLocalSearchParams<{ collection?: string }>();
  const [collection, setCollection] = useState<string | null>(null);

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

  // Quick suggestions when the search box is empty: a few new/featured drinks
  // the user hasn't already searched for.
  const suggestions = useMemo(() => {
    const recentLower = new Set(recent.map((t) => t.toLowerCase()));
    return menu
      .filter((p) => p.inStock && (p.isNew || p.is_featured))
      .map((p) => p.name)
      .filter((name) => !recentLower.has(name.toLowerCase()))
      .slice(0, 3);
  }, [menu, recent]);

  const showDiscovery = search.trim() === "" && (recent.length > 0 || suggestions.length > 0);

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
          placeholderTextColor="#B8A99C"
          className="flex-1 px-2 py-3 text-base text-textPrimary"
        />
        {search ? (
          <Pressable onPress={() => setSearch("")} hitSlop={10}>
            <Ionicons name="close-circle" size={18} color="#C9A47C" />
          </Pressable>
        ) : null}
      </View>

      {/* Recent searches + suggestions — single-row, horizontally scrollable */}
      {showDiscovery ? (
        <View className="mb-3">
          {recent.length > 0 ? (
            <>
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
                className="mb-2"
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
            </>
          ) : null}
          {suggestions.length > 0 ? (
            <>
              <Text className="mb-1.5 px-5 text-xs font-semibold uppercase tracking-wide text-textMuted">
                Try one of these
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="gap-2 px-5"
              >
                {suggestions.map((name) => (
                  <Pressable
                    key={name}
                    onPress={() => setSearch(name)}
                    className="h-9 justify-center rounded-full border border-accent-300 bg-accent-100 px-3"
                  >
                    <Text className="text-sm font-medium text-brand-800">{name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          ) : null}
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

      {/* Campaign collection banner */}
      {collection ? (
        effectiveCollection ? (
          <View className="mx-5 mb-2 flex-row items-center justify-between rounded-full bg-accent-100 px-4 py-2">
            <Text className="text-sm font-semibold text-brand-800">
              Showing the {collectionLabel} collection
            </Text>
            <Pressable onPress={() => setCollection(null)} hitSlop={8} accessibilityLabel="Clear collection">
              <Ionicons name="close-circle" size={18} color={Colors.brand} />
            </Pressable>
          </View>
        ) : (
          <View className="mx-5 mb-2 rounded-xl bg-surfaceMuted px-4 py-2">
            <Text className="text-xs text-textSecondary">
              No {collectionLabel} items available here yet — showing the full menu.
            </Text>
          </View>
        )
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
          data={filtered}
          keyExtractor={(p) => p.id}
          numColumns={2}
          columnWrapperClassName="gap-3 px-5"
          contentContainerClassName="gap-3 pb-32 pt-1"
          showsVerticalScrollIndicator={false}
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
              <View className="h-6 min-w-6 items-center justify-center rounded-full bg-white px-1.5">
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
