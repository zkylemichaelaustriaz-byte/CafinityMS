import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button } from "@/components/ui/Button";
import { Header } from "@/components/ui/Header";
import { PriceText } from "@/components/ui/PriceText";
import { ProductImage } from "@/components/ui/ProductImage";
import { Screen } from "@/components/ui/Screen";
import { Colors } from "@/constants/theme";
import { getMenu, getOrder } from "@/lib/api";
import { lineTotal, peso } from "@/lib/format";
import { haptics } from "@/lib/haptics";
import { localProductImage } from "@/lib/productImages";
import { resolveReorder, type ReorderResult } from "@/lib/reorder";
import { useBranch } from "@/store/branch";
import { useCart } from "@/store/cart";

export default function ReorderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const branch = useBranch((s) => s.branch);
  const addLine = useCart((s) => s.addLine);

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [result, setResult] = useState<ReorderResult | null>(null);

  const load = useCallback(async () => {
    if (!id || !branch) return;
    setLoading(true);
    try {
      const [order, menu] = await Promise.all([getOrder(id), getMenu(branch.id)]);
      if (!order) {
        setNotFound(true);
        return;
      }
      setResult(resolveReorder(order, menu));
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [id, branch]);

  useEffect(() => {
    void load();
  }, [load]);

  function confirm() {
    if (!result || !branch || result.added.length === 0) return;
    for (const line of result.added) addLine(line, branch.id);
    haptics.success();
    router.replace("/cart");
  }

  if (!branch) {
    return (
      <Screen edges={["top", "bottom"]}>
        <Header title="Reorder" />
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-center text-textSecondary">
            Choose a pickup branch first, then try again.
          </Text>
          <View className="mt-4">
            <Button label="Select a branch" onPress={() => router.replace("/branches")} />
          </View>
        </View>
      </Screen>
    );
  }

  if (loading) {
    return (
      <Screen edges={["top", "bottom"]}>
        <Header title="Reorder" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={Colors.brand} />
        </View>
      </Screen>
    );
  }

  if (notFound || !result) {
    return (
      <Screen edges={["top", "bottom"]}>
        <Header title="Reorder" />
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-center text-textSecondary">
            We couldn&apos;t load that order. Please try again.
          </Text>
        </View>
      </Screen>
    );
  }

  const total = result.added.reduce((s, l) => s + lineTotal(l), 0);
  const allGone = result.added.length === 0;

  return (
    <Screen edges={["top"]}>
      <Header title="Reorder" />
      <ScrollView contentContainerClassName="p-5 pb-40" showsVerticalScrollIndicator={false}>
        <View className="mb-4 flex-row items-center gap-2">
          <Ionicons name="location" size={16} color={Colors.brand} />
          <Text className="text-sm text-textSecondary">
            Adding to your cart at{" "}
            <Text className="font-semibold text-textPrimary">{branch.name}</Text>
          </Text>
        </View>

        {allGone ? (
          <View className="items-center rounded-card border border-dashed border-line bg-surface p-8">
            <Text style={{ fontSize: 34 }}>😕</Text>
            <Text className="mt-2 text-center text-base font-bold text-textPrimary">
              Nothing available to reorder
            </Text>
            <Text className="mt-1 text-center text-sm text-textSecondary">
              These items aren&apos;t available at this branch right now.
            </Text>
          </View>
        ) : (
          <>
            <Text className="mb-2 font-heading text-base text-textPrimary">
              Adding {result.added.length} item{result.added.length === 1 ? "" : "s"}
            </Text>
            <View className="rounded-card border border-line bg-surface">
              {result.added.map((line, i) => (
                <View
                  key={line.lineId}
                  className={`flex-row items-center p-3 ${i > 0 ? "border-t border-line" : ""}`}
                >
                  <ProductImage
                    source={localProductImage(line.productName)}
                    uri={line.imageUrl}
                    emoji="☕"
                    emojiSize={20}
                    className="mr-3 h-12 w-12 rounded-xl"
                    accessibilityLabel={line.productName}
                  />
                  <View className="flex-1 pr-2">
                    <Text className="text-sm font-semibold text-textPrimary" numberOfLines={1}>
                      {line.quantity}× {line.productName}
                    </Text>
                    <Text className="text-xs text-textMuted" numberOfLines={1}>
                      {line.variantName}
                      {line.selectedOptions.length > 0
                        ? ` · ${line.selectedOptions.map((o) => o.optionName).join(", ")}`
                        : ""}
                    </Text>
                  </View>
                  <PriceText amount={lineTotal(line)} size="sm" />
                </View>
              ))}
            </View>
          </>
        )}

        {result.skipped.length > 0 ? (
          <>
            <Text className="mb-2 mt-6 font-heading text-base text-textPrimary">
              Couldn&apos;t add
            </Text>
            <View className="rounded-card border border-line bg-surfaceMuted">
              {result.skipped.map((s, i) => (
                <View
                  key={`${s.name}-${i}`}
                  className={`flex-row items-center gap-2 p-3 ${i > 0 ? "border-t border-line" : ""}`}
                >
                  <Ionicons name="close-circle" size={16} color={Colors.danger} />
                  <Text className="flex-1 text-sm text-textSecondary" numberOfLines={1}>
                    {s.name}
                  </Text>
                  <Text className="text-xs text-textMuted">{s.reason}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>

      {!allGone ? (
        <View className="absolute bottom-0 left-0 right-0 border-t border-line bg-surface px-5 pb-8 pt-3">
          <Button
            label={`Add to cart · ${peso(total)}`}
            onPress={confirm}
            haptic="success"
          />
        </View>
      ) : null}
    </Screen>
  );
}
