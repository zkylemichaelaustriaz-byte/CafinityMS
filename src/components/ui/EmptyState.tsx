import { useState, type ReactNode } from "react";
import { Text, View, type ImageSourcePropType } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";
import { useReducedMotion } from "@/hooks/useReducedMotion";

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
  const reduced = useReducedMotion();
  const showImage = !!image && !imgFailed;

  return (
    <View className="flex-1 items-center justify-center px-8 py-16">
      {showImage ? (
        <View className="items-center justify-center">
          {/* Live campaign-tinted halo behind the transparent illustration */}
          <View
            pointerEvents="none"
            className="absolute h-44 w-44 rounded-full"
            style={{ backgroundColor: Colors.accent, opacity: 0.12 }}
          />
          <Image
            source={image as ImageSourcePropType}
            style={{ width: 152, height: 152 }}
            contentFit="contain"
            transition={reduced ? 0 : 200}
            onError={() => setImgFailed(true)}
            accessibilityLabel={title}
          />
        </View>
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
