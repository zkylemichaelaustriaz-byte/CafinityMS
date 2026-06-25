import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";
import type { CampaignPreset } from "@/lib/campaignPresets";

// Live campaign motifs via vector icons (consistent across iOS/Android, unlike emoji).
const MOTIF: Record<string, keyof typeof Ionicons.glyphMap> = {
  matcha: "leaf-outline",
  mango: "sunny-outline",
  caramel: "cafe-outline",
  christmas: "snow-outline",
  valentines: "heart-outline",
  "ube-taro": "sparkles-outline",
  "blueberry-rain": "rainy-outline",
  default: "cafe-outline",
};

/**
 * Compact campaign-discovery ribbon shown below the menu search. Replaces the
 * old repetitive suggestion chips. Tapping applies the seasonal collection
 * filter; when active it switches to a selected state with a Clear action.
 */
export function CampaignRibbon({
  preset,
  active,
  onSelect,
  onClear,
}: {
  preset: CampaignPreset;
  active: boolean;
  onSelect: () => void;
  onClear: () => void;
}) {
  const icon = MOTIF[preset.key] ?? "cafe-outline";

  if (active) {
    return (
      <View className="mx-5 mb-3 flex-row items-center gap-2 rounded-2xl border border-brandPrimary bg-accent-100 px-4 py-2.5">
        <Ionicons name={icon} size={16} color={Colors.brand} />
        <Text className="flex-1 text-sm font-semibold text-textPrimary" numberOfLines={1}>
          {preset.name} collection active
        </Text>
        <Pressable
          onPress={onClear}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Clear collection filter"
          className="flex-row items-center gap-1"
        >
          <Text className="text-sm font-bold text-brandPrimary">Clear</Text>
          <Ionicons name="close-circle" size={16} color={Colors.brand} />
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole="button"
      accessibilityLabel={`View the ${preset.name} collection`}
      className="mx-5 mb-3 flex-row items-center rounded-2xl border border-accent-300 bg-accent-100 px-3 py-2.5"
    >
      <View className="h-11 w-11 items-center justify-center rounded-full bg-brand-900">
        <Ionicons name={icon} size={20} color="#fff" />
      </View>
      <View className="ml-3 flex-1">
        <Text className="text-sm font-bold text-textPrimary" numberOfLines={1}>
          {preset.name}
        </Text>
        <Text className="text-xs text-textSecondary" numberOfLines={1}>
          Seasonal drinks available now
        </Text>
      </View>
      <Text className="text-sm font-bold text-brandPrimary">View →</Text>
    </Pressable>
  );
}
