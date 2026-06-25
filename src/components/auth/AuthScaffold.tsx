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
import { Wordmark } from "@/components/brand/Wordmark";
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
            <Text className="mt-2 text-sm text-brand-100">{tagline}</Text>
            <View className="mt-4 flex-row flex-wrap gap-2">
              {BENEFITS.map((b) => (
                <View
                  key={b.label}
                  className="flex-row items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5"
                >
                  <Ionicons name={b.icon} size={13} color="#fff" />
                  <Text className="text-xs font-semibold text-white">{b.label}</Text>
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

            {/* Flexible spacer + subtle brand footer absorb tall-device surplus */}
            <View className="min-h-[16px] flex-1" />
            <View className="mt-6 flex-row items-center justify-center gap-1.5 pt-2">
              <Ionicons name="cafe" size={12} color="#A8927F" />
              <Text className="text-[11px] text-textMuted">
                Order ahead · Earn rewards · Track your order live
              </Text>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
