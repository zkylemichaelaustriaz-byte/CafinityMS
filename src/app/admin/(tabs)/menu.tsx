import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { Badge } from "@/components/ui/Badge";
import { ErrorState } from "@/components/ui/ErrorState";
import { ProductImage } from "@/components/ui/ProductImage";
import { Screen } from "@/components/ui/Screen";
import { Colors } from "@/constants/theme";
import { getAdminProducts, updateProduct, type AdminProduct } from "@/lib/api";
import { humanizeError } from "@/lib/errors";
import { categoryEmoji, peso } from "@/lib/format";
import { localProductImage } from "@/lib/productImages";

export default function AdminMenuScreen() {
  const router = useRouter();
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");

  const load = useCallback(async () => {
    setError(null);
    try {
      setProducts(await getAdminProducts());
    } catch (e) {
      setError(humanizeError(e, "Could not load the menu."));
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function toggle(p: AdminProduct, field: "is_available" | "is_featured") {
    const value = !p[field];
    setProducts((prev) =>
      prev.map((x) => (x.id === p.id ? { ...x, [field]: value } : x)),
    );
    try {
      await updateProduct(p.id, { [field]: value });
    } catch {
      void load();
    }
  }

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) if (p.category_name) set.add(p.category_name);
    return ["all", ...Array.from(set)];
  }, [products]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (category !== "all" && p.category_name !== category) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q);
    });
  }, [products, query, category]);

  function priceLabel(p: AdminProduct): string {
    if (p.variants.length === 0) return "—";
    const min = Math.min(...p.variants.map((v) => v.price));
    const max = Math.max(...p.variants.map((v) => v.price));
    return min === max ? peso(min) : `${peso(min)}–${peso(max)}`;
  }

  return (
    <Screen>
      <View className="flex-row items-center justify-between px-5 pb-2 pt-2">
        <Text className="font-display text-2xl text-textPrimary">Menu</Text>
        <Pressable
          onPress={() => router.push("/admin/product/new")}
          className="flex-row items-center gap-1 rounded-full bg-brandPrimary px-3.5 py-2"
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text className="text-sm font-bold text-white">New</Text>
        </Pressable>
      </View>

      {/* Search */}
      <View className="mx-5 mt-1 flex-row items-center rounded-2xl border border-line bg-surface px-3">
        <Ionicons name="search" size={18} color={Colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search products"
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

      {/* Category filter */}
      <View className="py-2">
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={categories}
          keyExtractor={(c) => c}
          contentContainerClassName="gap-2 px-5"
          renderItem={({ item }) => {
            const active = category === item;
            return (
              <Pressable
                onPress={() => setCategory(item)}
                className={`h-9 justify-center rounded-full px-4 ${
                  active ? "bg-brandPrimary" : "border border-line bg-surface"
                }`}
              >
                <Text
                  className={`text-sm font-semibold ${active ? "text-white" : "text-textSecondary"}`}
                >
                  {item === "all" ? "All" : item}
                </Text>
              </Pressable>
            );
          }}
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
          data={visible}
          keyExtractor={(p) => p.id}
          contentContainerClassName="p-4 gap-2"
          ListEmptyComponent={
            <View className="mt-10 items-center px-8">
              <Ionicons name="search-outline" size={32} color={Colors.textMuted} />
              <Text className="mt-2 text-center text-sm text-textSecondary">
                No products match this view.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/admin/product/${item.id}`)}
              className="flex-row items-center rounded-2xl border border-line bg-surface p-3"
            >
              <ProductImage
                source={localProductImage(item.name)}
                uri={item.image_url}
                emoji={categoryEmoji(item.category_name)}
                emojiSize={20}
                className="mr-3 h-12 w-12 rounded-xl"
                accessibilityLabel={item.name}
              />
              <View className="flex-1 pr-2">
                <Text className="text-base font-bold text-espresso" numberOfLines={1}>
                  {item.name}
                </Text>
                <Text className="text-xs text-textMuted">
                  {item.category_name} · {priceLabel(item)} · {item.variants.length} size
                  {item.variants.length === 1 ? "" : "s"}
                </Text>
                <View className="mt-1 flex-row gap-1.5">
                  {!item.is_available ? <Badge label="Hidden" tone="gray" /> : null}
                  {item.is_featured ? <Badge label="Featured" tone="amber" /> : null}
                </View>
              </View>

              <Pressable
                onPress={() => toggle(item, "is_featured")}
                hitSlop={8}
                className="h-10 w-10 items-center justify-center"
              >
                <Ionicons
                  name={item.is_featured ? "star" : "star-outline"}
                  size={20}
                  color={item.is_featured ? "#e0a526" : "#c2a079"}
                />
              </Pressable>
              <Pressable
                onPress={() => toggle(item, "is_available")}
                hitSlop={8}
                className="h-10 w-10 items-center justify-center"
              >
                <Ionicons
                  name={item.is_available ? "eye" : "eye-off"}
                  size={20}
                  color={item.is_available ? Colors.brand : "#a8a29e"}
                />
              </Pressable>
              <Ionicons name="chevron-forward" size={18} color="#c2a079" />
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}
