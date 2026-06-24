import { useState } from "react";
import { Text, View } from "react-native";
import { Image } from "expo-image";
import { Skeleton } from "@/components/ui/Skeleton";

// Soft warm blurhash shown instantly while a remote image streams in.
const BLURHASH = "L9C@~q00_3?b?bM{ayof00~q%Mxu";

type ContentFit = "cover" | "contain" | "fill" | "none" | "scale-down";

interface ProductImageProps {
  /** Local image module (require(...)) — takes priority over `uri`. */
  source?: number;
  uri?: string | null;
  emoji?: string;
  className?: string;
  contentFit?: ContentFit;
  emojiSize?: number;
  accessibilityLabel?: string;
}

/**
 * Data-driven product image: prefers a local photo, then `products.image_url`,
 * then a branded emoji fallback. Blurhash placeholder + shimmer for remote,
 * smooth fade-in, disk cache. Fixed wrapper size = no layout jump.
 */
export function ProductImage({
  source,
  uri,
  emoji = "☕",
  className,
  contentFit = "cover",
  emojiSize = 40,
  accessibilityLabel,
}: ProductImageProps) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const useRemote = !source && !!uri && !failed;
  const showFallback = !source && (!uri || failed);

  return (
    <View className={`overflow-hidden bg-surfaceMuted ${className ?? ""}`}>
      {showFallback ? (
        <View className="h-full w-full items-center justify-center bg-brand-100">
          <Text style={{ fontSize: emojiSize }}>{emoji}</Text>
        </View>
      ) : (
        <>
          {useRemote && !loaded ? <Skeleton className="absolute inset-0" /> : null}
          <Image
            source={source ?? { uri: uri ?? undefined }}
            onError={() => setFailed(true)}
            onLoadEnd={() => setLoaded(true)}
            contentFit={contentFit}
            transition={280}
            placeholder={useRemote ? { blurhash: BLURHASH } : undefined}
            cachePolicy="memory-disk"
            accessible
            accessibilityLabel={accessibilityLabel ?? "Product image"}
            style={{ width: "100%", height: "100%" }}
          />
        </>
      )}
    </View>
  );
}
