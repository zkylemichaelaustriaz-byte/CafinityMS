import { useState } from "react";
import { Text, View } from "react-native";
import { Image } from "expo-image";
import { brandingImages } from "@/lib/brandingImages";

/**
 * Circular avatar with a resilient fallback chain:
 * real uploaded photo (uri) → bundled default-avatar.png → user initials.
 */
export function Avatar({
  uri,
  initials,
  size = 56,
}: {
  uri?: string | null;
  initials: string;
  size?: number;
}) {
  // 0 = uri, 1 = default-avatar, 2 = initials
  const [stage, setStage] = useState<0 | 1 | 2>(uri ? 0 : 1);
  const source = stage === 0 ? { uri: uri as string } : stage === 1 ? brandingImages.defaultAvatar : null;

  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2 }}
      className="items-center justify-center overflow-hidden bg-accent"
    >
      {source ? (
        <Image
          source={source}
          style={{ width: size, height: size }}
          contentFit="cover"
          onError={() => setStage((s) => (s + 1) as 0 | 1 | 2)}
          accessibilityLabel="Profile photo"
        />
      ) : (
        <Text style={{ fontSize: size * 0.36 }} className="font-display text-[#3A2410]">
          {initials}
        </Text>
      )}
    </View>
  );
}
