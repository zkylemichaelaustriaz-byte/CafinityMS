import { useState, type ReactNode } from "react";
import { StyleSheet, View, type ImageSourcePropType } from "react-native";
import { Image } from "expo-image";
import { CoffeeCup } from "@/components/brand/CoffeeCup";
import { Colors } from "@/constants/theme";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface CampaignAwareHeroProps {
  /** Bundled image module (preferred). */
  image?: ImageSourcePropType | null;
  /** Remote image URL (used when no bundled image). */
  uri?: string | null;
  /** Explicit hero height (avoids layout jump). */
  height: number;
  /** 0..1 darkness of the contrast scrim over the image. Default 0.42. */
  overlayStrength?: number;
  /** Vertical placement of the content. */
  align?: "top" | "center" | "bottom";
  /** Tailwind rounded class for the container, e.g. "rounded-panel". */
  roundedClassName?: string;
  /** Extra padding class for the content layer. Default "p-5". */
  contentClassName?: string;
  /** Show the decorative CoffeeCup (tinted by the active campaign). */
  decoration?: boolean;
  children?: ReactNode;
}

/**
 * Reusable image hero with a campaign-colored overlay. The same image works
 * under every seasonal palette: a translucent accent layer tints the photo to
 * the active campaign, and a dark scrim guarantees readable text on top. Falls
 * back to a campaign-tinted panel + CoffeeCup if the image fails. The caller
 * supplies its own live content (titles, stats, buttons) as children — nothing
 * is baked into the image.
 */
export function CampaignAwareHero({
  image,
  uri,
  height,
  overlayStrength = 0.42,
  align = "bottom",
  roundedClassName = "",
  contentClassName = "p-5",
  decoration = false,
  children,
}: CampaignAwareHeroProps) {
  const reduced = useReducedMotion();
  const [failed, setFailed] = useState(false);

  const hasImage = (!!image || !!uri) && !failed;
  const justify =
    align === "top" ? "justify-start" : align === "center" ? "justify-center" : "justify-end";

  return (
    <View style={{ height }} className={`overflow-hidden bg-brand-900 ${roundedClassName}`}>
      {hasImage ? (
        <Image
          source={image ?? { uri: uri ?? undefined }}
          onError={() => setFailed(true)}
          contentFit="cover"
          transition={reduced ? 0 : 300}
          cachePolicy="memory-disk"
          style={StyleSheet.absoluteFill}
          accessible={false}
        />
      ) : (
        <View
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          className="items-center justify-center"
        >
          <CoffeeCup size={Math.min(160, height * 0.7)} onDark tint={Colors.accent} />
        </View>
      )}

      {/* Campaign accent tint over the photo. */}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: Colors.accent, opacity: 0.16 }]}
      />
      {/* Dark scrim for legible text. */}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: "#000", opacity: overlayStrength }]}
      />

      {decoration ? (
        <View pointerEvents="none" className="absolute -right-6 -top-6 opacity-20">
          <CoffeeCup size={150} onDark tint={Colors.accent} />
        </View>
      ) : null}

      <View className={`flex-1 ${justify} ${contentClassName}`}>{children}</View>
    </View>
  );
}
