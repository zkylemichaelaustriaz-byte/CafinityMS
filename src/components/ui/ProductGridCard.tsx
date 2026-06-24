import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { AnimatedPressable } from "@/components/ui/AnimatedPressable";
import { ProductImage } from "@/components/ui/ProductImage";
import { PriceText } from "@/components/ui/PriceText";
import { Badge } from "@/components/ui/Badge";
import { FavoriteButton } from "@/components/ui/FavoriteButton";
import { shadow } from "@/constants/theme";
import { categoryEmoji } from "@/lib/format";
import { getProductBadge } from "@/lib/productBadge";
import { localProductImage } from "@/lib/productImages";
import type { MenuProduct } from "@/types/models";

/** Vertical product card for the 2-column menu grid. */
export function ProductGridCard({ product }: { product: MenuProduct }) {
  const router = useRouter();
  const inStock = product.inStock;
  const badge = getProductBadge(product);
  const from = product.variants.length
    ? Math.min(...product.variants.map((v) => v.price))
    : 0;

  return (
    <AnimatedPressable
      disabled={!inStock}
      onPress={() => router.push(`/product/${product.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`${product.name}${inStock ? "" : ", sold out"}`}
      className="flex-1 overflow-hidden rounded-card bg-surface"
      style={shadow.card}
    >
      <View className={inStock ? "" : "opacity-50"}>
        <ProductImage
          source={localProductImage(product.name)}
          uri={product.image_url}
          emoji={categoryEmoji(product.category_name)}
          className="h-36 w-full"
          accessibilityLabel={product.name}
        />
      </View>
      {!inStock ? (
        <View className="absolute left-2 top-2">
          <Badge label="Sold out" tone="red" />
        </View>
      ) : badge ? (
        <View className="absolute left-2 top-2">
          <Badge label={badge.label} tone={badge.tone} />
        </View>
      ) : null}
      <View className="absolute right-2 top-2">
        <FavoriteButton productId={product.id} />
      </View>
      <View className="p-3">
        <Text
          className={`text-sm font-bold ${inStock ? "text-textPrimary" : "text-textMuted"}`}
          numberOfLines={1}
        >
          {product.name}
        </Text>
        <Text className="mt-0.5 text-xs text-textSecondary" numberOfLines={2}>
          {product.description}
        </Text>
        <View className="mt-2 flex-row items-center justify-between">
          <PriceText amount={from} size="md" muted={!inStock} />
          {inStock ? (
            <View className="h-8 w-8 items-center justify-center rounded-full bg-brandPrimary">
              <Ionicons name="add" size={18} color="#ffffff" />
            </View>
          ) : null}
        </View>
      </View>
    </AnimatedPressable>
  );
}
