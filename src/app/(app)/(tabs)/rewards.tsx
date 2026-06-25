import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { AnimatedPressable } from "@/components/ui/AnimatedPressable";
import { CoffeeCup } from "@/components/brand/CoffeeCup";
import { brandingImages } from "@/lib/brandingImages";
import { ErrorState } from "@/components/ui/ErrorState";
import { Screen } from "@/components/ui/Screen";
import { Skeleton } from "@/components/ui/Skeleton";
import { Colors, shadow } from "@/constants/theme";
import {
  claimChallenge,
  getChallenges,
  getLoyaltyTransactions,
  getRedemptions,
  getRewards,
  redeemReward,
  type Challenge,
} from "@/lib/api";
import { humanizeError } from "@/lib/errors";
import { formatDateTime, peso } from "@/lib/format";
import { haptics } from "@/lib/haptics";
import { useAuth } from "@/store/auth";
import type { LoyaltyTransaction, Reward, RewardRedemption } from "@/types/models";

function expiryLabel(iso: string): string {
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return "Expires today";
  if (days === 1) return "Expires tomorrow";
  if (days <= 7) return `Expires in ${days} days`;
  return `Expires ${formatDateTime(iso)}`;
}

export default function RewardsScreen() {
  const profile = useAuth((s) => s.profile);
  const refreshProfile = useAuth((s) => s.refreshProfile);

  const [rewards, setRewards] = useState<Reward[]>([]);
  const [redemptions, setRedemptions] = useState<RewardRedemption[]>([]);
  const [activity, setActivity] = useState<LoyaltyTransaction[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [heroBgFailed, setHeroBgFailed] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [r, red, act, ch] = await Promise.all([
        getRewards(),
        getRedemptions(),
        getLoyaltyTransactions(),
        getChallenges().catch(() => [] as Challenge[]),
      ]);
      setRewards(r);
      setRedemptions(red);
      setActivity(act);
      setChallenges(ch);
    } catch (e) {
      setError(humanizeError(e, "Could not load rewards."));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      void refreshProfile();
    }, [load, refreshProfile]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([load(), refreshProfile()]);
    setRefreshing(false);
  }

  const points = profile?.loyalty_points ?? 0;

  const { available, locked } = useMemo(() => {
    const sorted = [...rewards].sort((a, b) => a.points_cost - b.points_cost);
    return {
      available: sorted.filter((r) => points >= r.points_cost),
      locked: sorted.filter((r) => points < r.points_cost),
    };
  }, [rewards, points]);

  const nextReward = locked[0];
  const progress = nextReward ? Math.min(1, points / nextReward.points_cost) : 1;

  const { activeVouchers, pastVouchers } = useMemo(() => {
    const active: RewardRedemption[] = [];
    const past: RewardRedemption[] = [];
    for (const r of redemptions) {
      const expired = !r.is_used && !!r.expires_at && new Date(r.expires_at).getTime() < Date.now();
      if (r.is_used || expired) past.push(r);
      else active.push(r);
    }
    return { activeVouchers: active, pastVouchers: past };
  }, [redemptions]);

  function confirmRedeem(reward: Reward) {
    if (points < reward.points_cost) return;
    Alert.alert("Redeem reward?", `Use ${reward.points_cost} points for "${reward.name}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Redeem", onPress: () => doRedeem(reward) },
    ]);
  }

  async function doRedeem(reward: Reward) {
    setRedeemingId(reward.id);
    try {
      const res = await redeemReward(reward.id);
      haptics.success();
      await Promise.all([load(), refreshProfile()]);
      Alert.alert(
        "Reward redeemed! 🎉",
        `Apply "${res.reward_name}" at checkout, or show this code at the counter:\n\n${res.code}`,
      );
    } catch (e) {
      Alert.alert("Could not redeem", humanizeError(e, "Please try again."));
    } finally {
      setRedeemingId(null);
    }
  }

  async function doClaim(challenge: Challenge) {
    setClaimingId(challenge.id);
    try {
      const res = await claimChallenge(challenge.id);
      haptics.success();
      await Promise.all([load(), refreshProfile()]);
      Alert.alert("Challenge complete! 🎉", `You earned ${res.awarded} points.`);
    } catch (e) {
      Alert.alert("Couldn't claim", humanizeError(e, "Please try again."));
    } finally {
      setClaimingId(null);
    }
  }

  if (error && !refreshing && !loading) {
    return (
      <Screen>
        <View className="px-5 pb-3 pt-2">
          <Text className="font-display text-3xl text-textPrimary">Rewards</Text>
        </View>
        <ErrorState message={error} onRetry={load} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        contentContainerClassName="pb-10"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brand} />
        }
      >
        <View className="px-5 pb-3 pt-2">
          <Text className="font-display text-3xl text-textPrimary">Rewards</Text>
        </View>

        {/* Hero */}
        <View
          className="mx-5 mb-6 overflow-hidden rounded-panel bg-brand-900 p-6"
          style={shadow.floating}
        >
          {!heroBgFailed ? (
            <Image
              source={brandingImages.rewardsHero}
              onError={() => setHeroBgFailed(true)}
              contentFit="cover"
              transition={300}
              cachePolicy="memory-disk"
              style={StyleSheet.absoluteFill}
              accessible={false}
            />
          ) : null}
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: Colors.accent, opacity: 0.16 }]}
          />
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: "#000", opacity: 0.5 }]}
          />
          <View pointerEvents="none" className="absolute -right-7 -top-7 opacity-20">
            <CoffeeCup size={150} onDark tint={Colors.accent} />
          </View>
          <View className="flex-row items-end justify-between">
            <View>
              <Text className="text-[11px] font-semibold uppercase tracking-widest text-accent-300">
                Your points
              </Text>
              <Text className="mt-1 font-display text-5xl text-white">{points}</Text>
            </View>
            <View className="flex-row items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5">
              <Text style={{ fontSize: 16 }}>🔥</Text>
              <Text className="text-sm font-bold text-white">
                {profile?.current_streak ?? 0}-day streak
              </Text>
            </View>
          </View>

          {nextReward ? (
            <View className="mt-5">
              <View className="h-2 overflow-hidden rounded-full bg-white/15">
                <View
                  className="h-2 rounded-full bg-accent"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </View>
              <Text
                className="mt-2 text-xs font-medium text-white/90"
                style={{ textShadowColor: "rgba(0,0,0,0.55)", textShadowRadius: 3 }}
              >
                {nextReward.points_cost - points} pts to “{nextReward.name}”
              </Text>
            </View>
          ) : (
            <Text
              className="mt-4 text-xs font-medium text-white/90"
              style={{ textShadowColor: "rgba(0,0,0,0.55)", textShadowRadius: 3 }}
            >
              Earn 1 point per ₱1 spent. Keep your daily streak for bonus points!
            </Text>
          )}

          {available.length > 0 ? (
            <View className="mt-4 flex-row items-center gap-1.5 self-start rounded-full bg-accent px-3 py-1.5">
              <Ionicons name="gift" size={13} color="#3A2410" />
              <Text className="text-xs font-bold text-[#3A2410]">
                {available.length} ready to redeem
              </Text>
            </View>
          ) : null}
        </View>

        {loading ? (
          <View className="px-5">
            <Skeleton className="mb-3 h-5 w-32 rounded-md" />
            <View className="gap-3">
              {[0, 1, 2].map((i) => (
                <View
                  key={i}
                  className="flex-row items-center rounded-card border border-line bg-surface p-4"
                >
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <View className="ml-3 flex-1">
                    <Skeleton className="h-4 w-32 rounded-md" />
                    <Skeleton className="mt-2 h-3 w-44 rounded-md" />
                  </View>
                  <Skeleton className="ml-2 h-9 w-20 rounded-xl" />
                </View>
              ))}
            </View>
          </View>
        ) : (
          <>
            {/* Challenges */}
            {challenges.length > 0 ? (
              <>
                <SectionTitle>Challenges</SectionTitle>
                <View className="gap-3 px-5">
                  {challenges.map((c) => (
                    <ChallengeCard
                      key={c.id}
                      challenge={c}
                      busy={claimingId === c.id}
                      onClaim={() => doClaim(c)}
                    />
                  ))}
                </View>
              </>
            ) : null}

            {/* Available now */}
            {available.length > 0 ? (
              <>
                <SectionTitle>Available now</SectionTitle>
                <View className="gap-3 px-5">
                  {available.map((reward) => (
                    <AvailableReward
                      key={reward.id}
                      reward={reward}
                      busy={redeemingId === reward.id}
                      onRedeem={() => confirmRedeem(reward)}
                    />
                  ))}
                </View>
              </>
            ) : null}

            {/* Locked */}
            {locked.length > 0 ? (
              <>
                <SectionTitle>{available.length > 0 ? "Keep earning" : "Earn to unlock"}</SectionTitle>
                <View className="gap-3 px-5">
                  {locked.map((reward) => (
                    <LockedReward key={reward.id} reward={reward} points={points} />
                  ))}
                </View>
              </>
            ) : null}

            {/* Vouchers */}
            {activeVouchers.length > 0 ? (
              <>
                <SectionTitle>My vouchers</SectionTitle>
                <View className="gap-2 px-5">
                  {activeVouchers.map((r) => (
                    <Voucher key={r.id} r={r} />
                  ))}
                </View>
              </>
            ) : null}
            {pastVouchers.length > 0 ? (
              <>
                <Text className="mb-2 mt-6 px-5 text-xs font-semibold uppercase tracking-wide text-textMuted">
                  Past vouchers
                </Text>
                <View className="gap-2 px-5">
                  {pastVouchers.map((r) => (
                    <Voucher key={r.id} r={r} />
                  ))}
                </View>
              </>
            ) : null}

            {/* Activity */}
            {activity.length > 0 ? (
              <>
                <SectionTitle>Points activity</SectionTitle>
                <View className="mx-5 overflow-hidden rounded-card border border-line bg-surface">
                  {activity.slice(0, 12).map((t, i) => (
                    <View
                      key={t.id}
                      className={`flex-row items-center justify-between px-4 py-3 ${
                        i > 0 ? "border-t border-line" : ""
                      }`}
                    >
                      <View className="flex-1 pr-2">
                        <Text className="text-sm text-textPrimary" numberOfLines={1}>
                          {t.description}
                        </Text>
                        <Text className="text-[10px] text-textMuted">
                          {formatDateTime(t.created_at)}
                        </Text>
                      </View>
                      <Text
                        className={`font-display text-sm ${t.points >= 0 ? "text-success" : "text-danger"}`}
                      >
                        {t.points >= 0 ? "+" : ""}
                        {t.points}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <Text className="mb-3 mt-7 px-5 font-heading text-lg text-textPrimary">{children}</Text>;
}

function ChallengeCard({
  challenge,
  busy,
  onClaim,
}: {
  challenge: Challenge;
  busy: boolean;
  onClaim: () => void;
}) {
  const isSpend = challenge.type === "spend_total";
  const pct = Math.min(1, challenge.goal > 0 ? challenge.progress / challenge.goal : 0);
  const cur = isSpend ? peso(challenge.progress) : String(Math.floor(challenge.progress));
  const goalStr = isSpend ? peso(challenge.goal) : String(challenge.goal);
  const complete = challenge.progress >= challenge.goal;

  return (
    <View className="rounded-card border border-line bg-surface p-4" style={shadow.card}>
      <View className="flex-row items-center">
        <View
          className={`h-12 w-12 items-center justify-center rounded-full ${
            challenge.claimed ? "bg-successSoft" : "bg-accent-100"
          }`}
        >
          <Ionicons
            name={
              (challenge.claimed
                ? "checkmark-circle"
                : challenge.icon) as keyof typeof Ionicons.glyphMap
            }
            size={22}
            color={challenge.claimed ? Colors.success : Colors.brand}
          />
        </View>
        <View className="ml-3 flex-1">
          <Text className="text-base font-bold text-textPrimary">{challenge.title}</Text>
          <Text className="text-xs text-textSecondary" numberOfLines={2}>
            {challenge.description}
          </Text>
        </View>
        <View className="ml-2 items-end">
          <Text className="text-xs font-bold text-brandPrimary">+{challenge.rewardPoints}</Text>
          <Text className="text-[10px] text-textMuted">pts</Text>
        </View>
      </View>

      {challenge.claimed ? (
        <View className="mt-3 flex-row items-center gap-1.5">
          <Ionicons name="checkmark-done" size={14} color={Colors.success} />
          <Text className="text-xs font-semibold text-success">Claimed</Text>
        </View>
      ) : complete ? (
        <AnimatedPressable
          onPress={onClaim}
          disabled={busy}
          haptic="success"
          accessibilityRole="button"
          accessibilityLabel={`Claim ${challenge.rewardPoints} points for ${challenge.title}`}
          className="mt-3 flex-row items-center justify-center rounded-xl bg-brandPrimary py-2.5"
        >
          {busy ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text className="text-sm font-bold text-white">Claim +{challenge.rewardPoints} pts</Text>
          )}
        </AnimatedPressable>
      ) : (
        <View className="mt-3">
          <View className="h-1.5 overflow-hidden rounded-full bg-surfaceMuted">
            <View
              className="h-1.5 rounded-full bg-accent"
              style={{ width: `${Math.round(pct * 100)}%` }}
            />
          </View>
          <Text className="mt-1.5 text-[11px] font-medium text-textMuted">
            {cur} / {goalStr}
          </Text>
        </View>
      )}
    </View>
  );
}

function AvailableReward({
  reward,
  busy,
  onRedeem,
}: {
  reward: Reward;
  busy: boolean;
  onRedeem: () => void;
}) {
  return (
    <View
      className="flex-row items-center rounded-card border border-line bg-surface p-4"
      style={shadow.card}
    >
      <View className="h-12 w-12 items-center justify-center rounded-full bg-accent-100">
        <Ionicons name="gift" size={20} color={Colors.brand} />
      </View>
      <View className="ml-3 flex-1">
        <Text className="text-base font-bold text-textPrimary">{reward.name}</Text>
        <Text className="text-xs text-textSecondary" numberOfLines={2}>
          {reward.description}
        </Text>
        <Text className="mt-1 text-xs font-semibold text-brandPrimary">
          {reward.points_cost} pts · saves {peso(reward.discount_value)}
        </Text>
      </View>
      <AnimatedPressable
        disabled={busy}
        onPress={onRedeem}
        haptic="light"
        accessibilityRole="button"
        accessibilityLabel={`Redeem ${reward.name} for ${reward.points_cost} points`}
        className="ml-2 rounded-xl bg-brandPrimary px-4 py-2.5"
      >
        {busy ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text className="text-sm font-bold text-white">Redeem</Text>
        )}
      </AnimatedPressable>
    </View>
  );
}

function LockedReward({ reward, points }: { reward: Reward; points: number }) {
  const progress = Math.min(1, points / reward.points_cost);
  const remaining = reward.points_cost - points;
  return (
    <View className="rounded-card border border-line bg-surfaceMuted p-4">
      <View className="flex-row items-center">
        <View className="h-12 w-12 items-center justify-center rounded-full bg-surface">
          <Ionicons name="lock-closed" size={18} color="#C9A47C" />
        </View>
        <View className="ml-3 flex-1">
          <Text className="text-base font-bold text-textSecondary">{reward.name}</Text>
          <Text className="text-xs text-textMuted" numberOfLines={1}>
            saves {peso(reward.discount_value)}
          </Text>
        </View>
        <Text className="text-xs font-bold text-textMuted">{remaining} pts to go</Text>
      </View>
      <View className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface">
        <View
          className="h-1.5 rounded-full bg-accent-300"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </View>
    </View>
  );
}

function Voucher({ r }: { r: RewardRedemption }) {
  const expired = !r.is_used && !!r.expires_at && new Date(r.expires_at).getTime() < Date.now();
  const inactive = r.is_used || expired;
  const status = r.is_used ? "Used" : expired ? "Expired" : "Use at checkout";
  return (
    <View
      className={`flex-row items-center justify-between rounded-card border border-dashed p-4 ${
        inactive ? "border-line bg-surfaceMuted" : "border-accent-300 bg-surface"
      }`}
    >
      <View className="flex-1 pr-2">
        <Text className={`text-sm font-bold ${inactive ? "text-textMuted" : "text-textPrimary"}`}>
          {r.reward_name}
        </Text>
        <Text className="text-xs text-textMuted">
          {r.is_used && r.used_at
            ? `Used ${formatDateTime(r.used_at)}`
            : expired
              ? "Expired"
              : r.expires_at
                ? expiryLabel(r.expires_at)
                : formatDateTime(r.created_at)}
        </Text>
      </View>
      <View className="items-end">
        <Text
          className={`font-display text-base tracking-widest ${inactive ? "text-textMuted line-through" : "text-brandPrimary"}`}
        >
          {r.code}
        </Text>
        <Text
          className={`text-[10px] font-semibold ${
            expired ? "text-danger" : inactive ? "text-textMuted" : "text-success"
          }`}
        >
          {status}
        </Text>
      </View>
    </View>
  );
}
