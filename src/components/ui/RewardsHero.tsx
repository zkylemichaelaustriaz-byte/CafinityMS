import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { CoffeeCup } from "@/components/brand/CoffeeCup";
import { Colors, shadow } from "@/constants/theme";
import { brandingImages } from "@/lib/brandingImages";

/**
 * Rewards hero card. All figures are LIVE props — points, streak, and the next
 * attainable reward are passed in, never baked into an image. Decoration is the
 * in-app CoffeeCup SVG (no asset required).
 */
export function RewardsHero({
  points,
  streak,
  nextReward,
  onViewRewards,
  onVouchers,
}: {
  points: number;
  streak: number;
  nextReward: { name: string; points_cost: number } | null;
  onViewRewards: () => void;
  onVouchers: () => void;
}) {
  const remaining = nextReward ? Math.max(0, nextReward.points_cost - points) : 0;
  const progress = nextReward ? Math.min(1, points / nextReward.points_cost) : 1;
  const [bgFailed, setBgFailed] = useState(false);

  return (
    <View
      className="mx-5 overflow-hidden rounded-panel bg-brand-900 p-5"
      style={shadow.floating}
    >
      {!bgFailed ? (
        <Image
          source={brandingImages.rewardsHero}
          onError={() => setBgFailed(true)}
          contentFit="cover"
          transition={300}
          cachePolicy="memory-disk"
          style={StyleSheet.absoluteFill}
          accessible={false}
        />
      ) : null}
      {/* Campaign accent tint + layered scrim keep text readable under any photo. */}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: Colors.accent, opacity: 0.16 }]}
      />
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: "#000", opacity: 0.5 }]}
      />
      {/* Extra darkening over the lower half where the progress + buttons sit. */}
      <View
        pointerEvents="none"
        className="absolute bottom-0 left-0 right-0 h-2/3"
        style={{ backgroundColor: "#000", opacity: 0.22 }}
      />
      <View pointerEvents="none" className="absolute -right-6 -top-6 opacity-20">
        <CoffeeCup size={150} onDark tint={Colors.accent} />
      </View>

      <Text className="text-[11px] font-semibold uppercase tracking-widest text-accent-300">
        Cafinity Rewards
      </Text>

      <View className="mt-1 flex-row items-end justify-between">
        <View>
          <Text className="font-display text-5xl leading-tight text-white">{points}</Text>
          <Text className="text-xs font-medium text-white/75">points</Text>
        </View>
        <View className="flex-row items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5">
          <Text style={{ fontSize: 14 }}>🔥</Text>
          <Text className="text-xs font-bold text-white">{streak}-day streak</Text>
        </View>
      </View>

      {nextReward ? (
        <View className="mt-5">
          <View className="h-2 overflow-hidden rounded-full bg-white/20">
            <View
              className="h-2 rounded-full bg-accent"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </View>
          <Text
            className="mt-2 text-xs font-medium text-white/90"
            style={{ textShadowColor: "rgba(0,0,0,0.55)", textShadowRadius: 3 }}
          >
            {remaining > 0 ? `${remaining} points to ${nextReward.name}` : `${nextReward.name} unlocked!`}
          </Text>
        </View>
      ) : (
        <Text
          className="mt-5 text-xs font-medium text-white/90"
          style={{ textShadowColor: "rgba(0,0,0,0.55)", textShadowRadius: 3 }}
        >
          You can redeem any reward — nice work!
        </Text>
      )}

      <View className="mt-4 flex-row gap-2">
        <Pressable
          onPress={onViewRewards}
          accessibilityRole="button"
          className="flex-1 flex-row items-center justify-center gap-1.5 rounded-full bg-accent py-3"
        >
          <Ionicons name="gift" size={15} color="#3A2410" />
          <Text className="text-sm font-bold text-[#3A2410]">View rewards</Text>
        </Pressable>
        <Pressable
          onPress={onVouchers}
          accessibilityRole="button"
          className="flex-1 items-center justify-center rounded-full border border-white/25 py-3"
        >
          <Text className="text-sm font-bold text-white">My vouchers</Text>
        </Pressable>
      </View>
    </View>
  );
}
