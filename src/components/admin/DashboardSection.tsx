import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";

/**
 * Standardised admin-dashboard section: an eyebrow/title (+ optional description)
 * with an optional trailing action, followed by its content. Provides the
 * consistent top margin that creates clear separation between major sections —
 * so individual cards no longer need their own ad-hoc margins.
 */
export function DashboardSection({
  title,
  description,
  action,
  children,
  first = false,
}: {
  title: string;
  description?: string;
  action?: { label: string; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap };
  children: ReactNode;
  /** First section omits the large top margin (sits under the overview). */
  first?: boolean;
}) {
  return (
    <View className={first ? "" : "mt-8"}>
      <View className="mb-3 flex-row items-end justify-between">
        <View className="flex-1 pr-3">
          <Text className="font-heading text-lg text-textPrimary">{title}</Text>
          {description ? (
            <Text className="mt-0.5 text-xs text-textSecondary">{description}</Text>
          ) : null}
        </View>
        {action ? (
          <Pressable
            onPress={action.onPress}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            hitSlop={8}
            className="flex-row items-center gap-1"
          >
            <Text className="text-xs font-semibold text-brandPrimary">{action.label}</Text>
            <Ionicons name={action.icon ?? "chevron-forward"} size={14} color={Colors.brand} />
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}
