import { useState, type ReactNode } from "react";
import { Text, View, type ImageSourcePropType } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";

interface EmptyStateProps {
  /** Optional bundled illustration; falls back to icon/emoji if it fails. */
  image?: ImageSourcePropType | null;
  /** Prefer a vector icon; emoji is a fallback. */
  icon?: keyof typeof Ionicons.glyphMap;
  emoji?: string;
  title: string;
  subtitle?: string;
  children?: ReactNode;
}

export function EmptyState({
  image,
  icon,
  emoji = "🫙",
  title,
  subtitle,
  children,
}: EmptyStateProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = !!image && !imgFailed;

  return (
    <View className="flex-1 items-center justify-center px-8 py-16">
      {showImage ? (
        <Image
          source={image as ImageSourcePropType}
          style={{ width: 150, height: 150 }}
          contentFit="contain"
          transition={200}
          onError={() => setImgFailed(true)}
          accessibilityLabel={title}
        />
      ) : (
        <View className="h-20 w-20 items-center justify-center rounded-full bg-surfaceMuted">
          {icon ? (
            <Ionicons name={icon} size={34} color={Colors.brand} />
          ) : (
            <Text style={{ fontSize: 34 }}>{emoji}</Text>
          )}
        </View>
      )}
      <Text className="mt-4 text-center font-heading text-lg text-textPrimary">{title}</Text>
      {subtitle ? (
        <Text className="mt-1.5 text-center text-sm text-textSecondary">{subtitle}</Text>
      ) : null}
      {children ? <View className="mt-6 w-full">{children}</View> : null}
    </View>
  );
}
