import { Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Header } from "@/components/ui/Header";
import { PriceText } from "@/components/ui/PriceText";
import { ProductImage } from "@/components/ui/ProductImage";
import { QuantityStepper } from "@/components/ui/QuantityStepper";
import { Screen } from "@/components/ui/Screen";
import { StickyActionBar } from "@/components/ui/StickyActionBar";
import { Colors } from "@/constants/theme";
import { getEmptyStateImage } from "@/lib/emptyStateImages";
import { lineTotal } from "@/lib/format";
import { localProductImage } from "@/lib/productImages";
import { useBranch } from "@/store/branch";
import { cartSubtotal, useCart } from "@/store/cart";

export default function CartScreen() {
  const router = useRouter();
  const branch = useBranch((s) => s.branch);
  const lines = useCart((s) => s.lines);
  const updateQuantity = useCart((s) => s.updateQuantity);
  const removeLine = useCart((s) => s.removeLine);

  const subtotal = cartSubtotal(lines);

  if (lines.length === 0) {
    return (
      <Screen edges={["top", "bottom"]}>
        <Header title="Your cart" />
        <EmptyState
          image={getEmptyStateImage("cart")}
          emoji="🛒"
          title="Your cart is empty"
          subtitle="Add a drink from the menu to get started."
        >
          <Button label="Browse menu" onPress={() => router.replace("/menu")} />
        </EmptyState>
      </Screen>
    );
  }

  return (
    <Screen edges={["top"]}>
      <Header title="Your cart" />

      <ScrollView
        contentContainerClassName="p-4"
        style={{ marginBottom: 150 }}
        showsVerticalScrollIndicator={false}
      >
        {branch ? (
          <View className="mb-3 flex-row items-center gap-1.5">
            <Ionicons name="location" size={14} color={Colors.brand} />
            <Text className="text-sm font-medium text-textSecondary">
              Pickup at {branch.name}
            </Text>
          </View>
        ) : null}

        {lines.map((line) => (
          <View
            key={line.lineId}
            className="mb-3 flex-row rounded-card border border-line bg-surface p-3"
          >
            <ProductImage
              source={localProductImage(line.productName)}
              uri={line.imageUrl}
              emoji="☕"
              className="h-20 w-20 rounded-xl"
              emojiSize={30}
              accessibilityLabel={line.productName}
            />
            <View className="ml-3 flex-1">
              <View className="flex-row items-start justify-between">
                <Text className="flex-1 pr-2 text-base font-bold text-textPrimary">
                  {line.productName}
                </Text>
                <Pressable
                  onPress={() => removeLine(line.lineId)}
                  hitSlop={8}
                  accessibilityLabel={`Remove ${line.productName}`}
                >
                  <Ionicons name="trash-outline" size={18} color={Colors.danger} />
                </Pressable>
              </View>
              <Text className="text-xs text-textSecondary">{line.variantName}</Text>
              {line.selectedOptions.length > 0 ? (
                <Text className="mt-0.5 text-xs text-textMuted" numberOfLines={2}>
                  {line.selectedOptions.map((o) => o.optionName).join(" · ")}
                </Text>
              ) : null}
              {line.notes ? (
                <Text className="mt-0.5 text-xs italic text-textMuted">“{line.notes}”</Text>
              ) : null}

              <View className="mt-2 flex-row items-center justify-between">
                <QuantityStepper
                  value={line.quantity}
                  onChange={(q) => updateQuantity(line.lineId, q)}
                  size="sm"
                />
                <PriceText amount={lineTotal(line)} size="md" />
              </View>
            </View>
          </View>
        ))}

        <Pressable
          onPress={() => router.replace("/menu")}
          className="mt-1 flex-row items-center justify-center gap-1.5 py-2"
        >
          <Ionicons name="add" size={18} color={Colors.brand} />
          <Text className="text-sm font-semibold text-brandPrimary">Add more items</Text>
        </Pressable>
      </ScrollView>

      <StickyActionBar>
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-sm text-textSecondary">Subtotal</Text>
          <PriceText amount={subtotal} size="lg" />
        </View>
        <Button
          label="Proceed to checkout"
          onPress={() => router.push("/checkout")}
          haptic="light"
        />
      </StickyActionBar>
    </Screen>
  );
}
