import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
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
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
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
  const [showAllActivity, setShowAllActivity] = useState(false);
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

  const claimableCount = challenges.filter((c) => !c.claimed && c.progress >= c.goal).length;
  const hasClaimable = claimableCount > 0;

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
              <CollapsibleSection
                title="Challenges"
                count={claimableCount || undefined}
                defaultOpen={hasClaimable}
                persistKey="rewards.challenges"
              >
                <View className="gap-2.5">
                  {challenges.map((c) => (
                    <ChallengeCard
                      key={c.id}
                      challenge={c}
                      busy={claimingId === c.id}
                      onClaim={() => doClaim(c)}
                    />
                  ))}
                </View>
              </CollapsibleSection>
            ) : null}

            {/* Available Rewards (redeemable + locked, with points needed) */}
            {available.length > 0 || locked.length > 0 ? (
              <CollapsibleSection
                title="Available Rewards"
                count={available.length || undefined}
                defaultOpen={!hasClaimable}
                persistKey="rewards.rewards"
              >
                <View className="gap-3">
                  {available.map((reward) => (
                    <AvailableReward
                      key={reward.id}
                      reward={reward}
                      busy={redeemingId === reward.id}
                      onRedeem={() => confirmRedeem(reward)}
                    />
                  ))}
                  {locked.length > 0 ? (
                    <>
                      {available.length > 0 ? (
                        <Text className="mt-1 text-xs font-semibold text-textMuted">
                          Keep earning to unlock
                        </Text>
                      ) : null}
                      {locked.map((reward) => (
                        <LockedReward key={reward.id} reward={reward} points={points} />
                      ))}
                    </>
                  ) : null}
                </View>
              </CollapsibleSection>
            ) : null}

            {/* My Vouchers (ready to use + used/expired) */}
            {activeVouchers.length > 0 || pastVouchers.length > 0 ? (
              <CollapsibleSection
                title="My Vouchers"
                count={activeVouchers.length || undefined}
                persistKey="rewards.vouchers"
              >
                <View className="gap-2">
                  {activeVouchers.map((r) => (
                    <Voucher key={r.id} r={r} />
                  ))}
                  {pastVouchers.length > 0 ? (
                    <>
                      <Text className="mb-1 mt-3 text-xs font-semibold text-textMuted">
                        Used &amp; expired
                      </Text>
                      {pastVouchers.map((r) => (
                        <Voucher key={r.id} r={r} />
                      ))}
                    </>
                  ) : null}
                </View>
              </CollapsibleSection>
            ) : null}

            {/* Points Activity (latest 3, expandable) */}
            {activity.length > 0 ? (
              <CollapsibleSection title="Points Activity" persistKey="rewards.activity">
                <View className="overflow-hidden rounded-card border border-line bg-surface">
                  {(showAllActivity ? activity.slice(0, 30) : activity.slice(0, 3)).map((t, i) => (
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
                        <Text className="text-[11px] text-textMuted">
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
                {!showAllActivity && activity.length > 3 ? (
                  <Pressable
                    onPress={() => setShowAllActivity(true)}
                    accessibilityRole="button"
                    className="mt-2 flex-row items-center justify-center gap-1 py-1.5"
                  >
                    <Text className="text-sm font-semibold text-brandPrimary">
                      View all activity ({activity.length})
                    </Text>
                    <Ionicons name="chevron-down" size={15} color={Colors.brand} />
                  </Pressable>
                ) : null}
              </CollapsibleSection>
            ) : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
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

  // Compact row: icon · (title/desc/progress) · reward, with a small inline
  // Claim button only when claimable.
  return (
    <View className="flex-row items-center gap-3 rounded-2xl border border-line bg-surface p-3">
      <View
        className={`h-11 w-11 items-center justify-center rounded-full ${
          challenge.claimed ? "bg-successSoft" : "bg-accent-100"
        }`}
      >
        <Ionicons
          name={
            (challenge.claimed ? "checkmark-circle" : challenge.icon) as keyof typeof Ionicons.glyphMap
          }
          size={20}
          color={challenge.claimed ? Colors.success : Colors.brand}
        />
      </View>
      <View className="flex-1">
        <View className="flex-row items-center justify-between">
          <Text className="flex-1 pr-2 text-sm font-bold text-textPrimary" numberOfLines={1}>
            {challenge.title}
          </Text>
          <Text className="text-xs font-bold text-brandPrimary">+{challenge.rewardPoints} pts</Text>
        </View>
        <Text className="text-xs text-textSecondary" numberOfLines={1}>
          {challenge.description}
        </Text>
        <View className="mt-1.5 flex-row items-center gap-2">
          <View className="h-1.5 flex-1 overflow-hidden rounded-full bg-surfaceMuted">
            <View
              className={`h-1.5 rounded-full ${challenge.claimed ? "bg-success" : "bg-accent"}`}
              style={{ width: `${Math.round(pct * 100)}%` }}
            />
          </View>
          {challenge.claimed ? (
            <View className="flex-row items-center gap-1">
              <Ionicons name="checkmark-done" size={13} color={Colors.success} />
              <Text className="text-xs font-semibold text-success">Claimed</Text>
            </View>
          ) : complete ? (
            <AnimatedPressable
              onPress={onClaim}
              disabled={busy}
              haptic="success"
              accessibilityRole="button"
              accessibilityLabel={`Claim ${challenge.rewardPoints} points for ${challenge.title}`}
              className="rounded-full bg-brandPrimary px-3.5 py-1.5"
            >
              {busy ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text className="text-xs font-bold text-white">Claim</Text>
              )}
            </AnimatedPressable>
          ) : (
            <Text className="text-[11px] font-semibold text-textMuted">
              {cur}/{goalStr}
            </Text>
          )}
        </View>
      </View>
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
  const [revealed, setRevealed] = useState(false);
  const expired = !r.is_used && !!r.expires_at && new Date(r.expires_at).getTime() < Date.now();
  const inactive = r.is_used || expired;
  const status = r.is_used ? "Used" : expired ? "Expired" : "Ready to use";
  return (
    <View
      className={`rounded-card border border-dashed p-4 ${
        inactive ? "border-line bg-surfaceMuted" : "border-accent-300 bg-surface"
      }`}
    >
      {/* Name + status lead; the code is revealed on demand, not dominant. */}
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-2">
          <Text
            className={`text-sm font-bold ${inactive ? "text-textSecondary" : "text-textPrimary"}`}
          >
            {r.reward_name}
          </Text>
          <Text className="mt-0.5 text-xs text-textMuted">
            {r.is_used && r.used_at
              ? `Used ${formatDateTime(r.used_at)}`
              : expired
                ? "Expired"
                : r.expires_at
                  ? expiryLabel(r.expires_at)
                  : formatDateTime(r.created_at)}
          </Text>
        </View>
        <View
          className={`flex-row items-center gap-1 rounded-full px-2 py-0.5 ${
            expired ? "bg-dangerSoft" : inactive ? "bg-surfaceMuted" : "bg-successSoft"
          }`}
        >
          <Ionicons
            name={r.is_used ? "checkmark-circle" : expired ? "close-circle" : "ticket-outline"}
            size={11}
            color={expired ? Colors.danger : inactive ? Colors.textMuted : Colors.success}
          />
          <Text
            className={`text-[10px] font-bold ${
              expired ? "text-danger" : inactive ? "text-textMuted" : "text-success"
            }`}
          >
            {status}
          </Text>
        </View>
      </View>
      <Pressable
        onPress={() => setRevealed((v) => !v)}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={revealed ? "Hide voucher code" : "Show voucher code"}
        className="mt-2 flex-row items-center gap-1.5 self-start"
      >
        <Ionicons
          name={revealed ? "eye-off-outline" : "eye-outline"}
          size={14}
          color={inactive ? Colors.textMuted : Colors.brand}
        />
        <Text
          className={`font-display tracking-widest ${revealed ? "text-base" : "text-sm"} ${
            inactive ? "text-textMuted" : "text-brandPrimary"
          }`}
        >
          {revealed ? r.code : "Show code"}
        </Text>
      </Pressable>
    </View>
  );
}
