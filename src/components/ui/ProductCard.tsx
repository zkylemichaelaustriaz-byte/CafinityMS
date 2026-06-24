import { Text, View } from "react-native";
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

/** Image-led featured card used in horizontal rails. */
export function ProductCard({ product }: { product: MenuProduct }) {
  const router = useRouter();
  const badge = getProductBadge(product);
  const from = product.variants.length
    ? Math.min(...product.variants.map((v) => v.price))
    : 0;

  return (
    <AnimatedPressable
      onPress={() => router.push(`/product/${product.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`${product.name}, from ${from} pesos`}
      className="w-44 overflow-hidden rounded-card bg-surface"
      style={shadow.card}
    >
      <View>
        <ProductImage
          source={localProductImage(product.name)}
          uri={product.image_url}
          emoji={categoryEmoji(product.category_name)}
          className="h-32 w-full"
          accessibilityLabel={product.name}
        />
        {badge ? (
          <View className="absolute left-2 top-2">
            <Badge label={badge.label} tone={badge.tone} />
          </View>
        ) : null}
        <View className="absolute right-2 top-2">
          <FavoriteButton productId={product.id} />
        </View>
      </View>
      <View className="p-3">
        <Text className="text-sm font-bold text-textPrimary" numberOfLines={1}>
          {product.name}
        </Text>
        <Text className="mt-0.5 text-xs text-textSecondary" numberOfLines={1}>
          {product.category_name}
        </Text>
        <PriceText amount={from} size="md" className="mt-2" />
      </View>
    </AnimatedPressable>
  );
}
