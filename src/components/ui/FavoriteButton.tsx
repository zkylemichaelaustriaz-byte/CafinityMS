import { Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { haptics } from "@/lib/haptics";
import { useFavorites } from "@/store/favorites";

/**
 * Heart toggle for a product. Reads/writes the favorites store directly, so it
 * can be dropped onto any card without prop drilling. Stops the press from
 * bubbling to a parent card's onPress.
 */
export function FavoriteButton({
  productId,
  size = 18,
}: {
  productId: string;
  size?: number;
}) {
  const isFav = useFavorites((s) => s.ids.includes(productId));
  const toggle = useFavorites((s) => s.toggle);

  return (
    <Pressable
      onPress={() => {
        haptics.light();
        void toggle(productId);
      }}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={isFav ? "Remove from favorites" : "Add to favorites"}
      className="h-8 w-8 items-center justify-center rounded-full bg-white/90"
    >
      <Ionicons
        name={isFav ? "heart" : "heart-outline"}
        size={size}
        color={isFav ? "#E0524B" : "#7A5234"}
      />
    </Pressable>
  );
}
