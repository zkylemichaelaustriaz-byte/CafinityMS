import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getCampaignImage } from "@/lib/campaignImages";
import { presetByKey } from "@/lib/campaignPresets";
import type { Campaign } from "@/types/models";

/**
 * Full-screen seasonal advertisement shown after the boot/loading screen and in
 * the admin Preview. The supplied 9:16 artwork already contains title/product
 * text, so the app only renders a close button, a CTA, and a small disclosure.
 *
 * Image resolution: custom hero URL → bundled preset image → accent fallback.
 */
export function CampaignAd({
  campaign,
  onDismiss,
  onCta,
}: {
  campaign: Campaign;
  onDismiss: () => void;
  onCta: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [urlFailed, setUrlFailed] = useState(false);

  const preset = presetByKey(campaign.preset_key);
  const accent = preset?.accent ?? "#5A3019";
  const custom = campaign.hero_image_url?.trim();
  const bundled = getCampaignImage(campaign.preset_key);
  const source = custom && !urlFailed ? { uri: custom } : bundled;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onDismiss}>
      <View className="flex-1 bg-black">
        {source ? (
          <Image
            source={source}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={200}
            onError={() => {
              if (custom && !urlFailed) setUrlFailed(true);
            }}
            accessible
            accessibilityLabel={`${campaign.title} seasonal campaign`}
          />
        ) : (
          <View
            className="flex-1 items-center justify-center"
            style={{ backgroundColor: preset?.bg ?? "#F2E6D9" }}
          >
            <Text style={{ fontSize: 96 }}>{preset?.emoji ?? "🎉"}</Text>
          </View>
        )}

        {/* Close — translucent surface for contrast over any artwork */}
        <Pressable
          onPress={onDismiss}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close advertisement"
          style={{ top: insets.top + 10, right: 16 }}
          className="absolute h-10 w-10 items-center justify-center rounded-full bg-black/45"
        >
          <Ionicons name="close" size={22} color="#fff" />
        </Pressable>

        {/* Bottom controls over a dark scrim */}
        <View
          style={{ paddingBottom: insets.bottom + 20 }}
          className="absolute bottom-0 left-0 right-0 px-6 pt-24"
        >
          <View pointerEvents="none" className="absolute inset-0 bg-black/40" />
          <Text className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-white/80">
            Seasonal offer
          </Text>
          {campaign.subtitle ? (
            <Text className="mb-3 text-sm text-white/90" numberOfLines={2}>
              {campaign.subtitle}
            </Text>
          ) : null}
          <Pressable
            onPress={onCta}
            accessibilityRole="button"
            accessibilityLabel={campaign.cta_label || "View"}
            className="items-center rounded-2xl py-4"
            style={{ backgroundColor: accent }}
          >
            <Text className="text-base font-bold text-white">{campaign.cta_label || "View"}</Text>
          </Pressable>
          <Pressable onPress={onDismiss} className="mt-2 items-center py-2" accessibilityRole="button">
            <Text className="text-sm font-semibold text-white/80">Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
