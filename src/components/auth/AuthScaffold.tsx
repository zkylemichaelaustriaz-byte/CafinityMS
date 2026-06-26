import { useEffect, useRef, type ReactNode } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CampaignAwareHero } from "@/components/ui/CampaignAwareHero";
import { CoffeeCup } from "@/components/brand/CoffeeCup";
import { Wordmark } from "@/components/brand/Wordmark";
import { Colors } from "@/constants/theme";
import { brandingImages } from "@/lib/brandingImages";
import { useReducedMotion } from "@/hooks/useReducedMotion";

const BENEFITS: { icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { icon: "cafe-outline", label: "Order ahead" },
  { icon: "gift-outline", label: "Earn rewards" },
  { icon: "time-outline", label: "Skip the wait" },
];

/**
 * Shared two-part auth layout: a campaign-aware brand hero over a rounded white
 * "sheet" that holds the form.
 *
 * Responsive empty-space handling: the hero height scales with the screen, and
 * the sheet places the form near the top, a flexible spacer, then a subtle brand
 * footer. On compact phones the spacer collapses and everything scrolls; on tall
 * phones the spacer expands so the surplus is distributed naturally instead of
 * leaving a large blank gap under the form.
 */
export function AuthScaffold({
  tagline,
  children,
}: {
  tagline: string;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const { height } = useWindowDimensions();
  const heroHeight = Math.min(Math.max(Math.round(height * 0.34), 232), 320);

  const anim = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) {
      anim.setValue(1);
      return;
    }
    Animated.timing(anim, { toValue: 1, duration: 380, useNativeDriver: true }).start();
  }, [anim, reduced]);
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });

  return (
    <View className="flex-1 bg-brand-900">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="flex-grow"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {/* Campaign-aware brand hero (height scales with the screen) */}
          <CampaignAwareHero
            image={brandingImages.authHero}
            height={heroHeight}
            overlayStrength={0.46}
            align="bottom"
            contentClassName="px-6 pb-7 pt-12"
          >
            <Wordmark size="lg" onDark />
            {/* Always light over the dark hero photo + scrim (brand-100 is dark in
                dark mode, which made this invisible). */}
            <Text
              className="mt-2 text-sm font-medium text-white/90"
              style={{ textShadowColor: "rgba(0,0,0,0.5)", textShadowRadius: 4 }}
            >
              {tagline}
            </Text>
            {/* One informational strip (not three competing buttons) */}
            <View className="mt-4 flex-row items-center rounded-2xl bg-white/10 px-1 py-2">
              {BENEFITS.map((b, i) => (
                <View key={b.label} className="flex-row flex-1 items-center">
                  {i > 0 ? <View className="h-4 w-px bg-white/20" /> : null}
                  <View className="flex-1 flex-row items-center justify-center gap-1.5">
                    <Ionicons name={b.icon} size={13} color="#fff" />
                    <Text className="text-[11px] font-semibold text-white">{b.label}</Text>
                  </View>
                </View>
              ))}
            </View>
          </CampaignAwareHero>

          {/* Form sheet */}
          <Animated.View
            style={{ opacity: anim, transform: [{ translateY }] }}
            className="-mt-6 flex-1 rounded-t-[34px] bg-background px-6 pb-8 pt-7"
          >
            {children}

            {/* Flexible spacer carries a very low-contrast brand motif so the
                surplus on tall screens feels intentional, not empty. */}
            <View className="min-h-[16px] flex-1 items-center justify-center">
              <View pointerEvents="none" style={{ opacity: 0.06 }}>
                <CoffeeCup size={120} tint={Colors.brand} />
              </View>
            </View>
            <View className="mt-4 flex-row items-center justify-center gap-1.5 pt-2">
              <Ionicons name="cafe" size={12} color={Colors.textMuted} />
              <Text className="text-[11px] text-textMuted">
                Coffee made easier, from order to pickup.
              </Text>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
