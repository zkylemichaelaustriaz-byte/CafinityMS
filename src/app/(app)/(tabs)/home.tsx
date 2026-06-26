import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { AnimatedPressable } from "@/components/ui/AnimatedPressable";
import { BranchSelectorField } from "@/components/ui/BranchSelector";
import { BranchWorkload } from "@/components/ui/BranchWorkload";
import { CampaignAd } from "@/components/ui/CampaignAd";
import { NotificationBell } from "@/components/ui/NotificationBell";
import { ProductCard } from "@/components/ui/ProductCard";
import { ProductImage } from "@/components/ui/ProductImage";
import { RewardsHero } from "@/components/ui/RewardsHero";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { Screen } from "@/components/ui/Screen";
import { CoffeeCup } from "@/components/brand/CoffeeCup";
import { Colors, shadow } from "@/constants/theme";
import { presetByKey } from "@/lib/campaignPresets";
import { resolveProductImage } from "@/lib/productMedia";
import { useSeasonalTheme } from "@/store/seasonalTheme";
import {
  getActiveCampaign,
  getActiveSeasonalAd,
  getCategories,
  getMenu,
  getOrders,
  getRecentProductNames,
  getRewards,
  recordCampaignAction,
  recordCampaignView,
} from "@/lib/api";
import { brandingImages } from "@/lib/brandingImages";
import { humanizeError } from "@/lib/errors";
import { formatEta, pickupOrRef, statusLabel } from "@/lib/format";
import { useAuth } from "@/store/auth";
import { useBranch } from "@/store/branch";
import { campaignSession } from "@/store/campaignSession";
import { useFavorites } from "@/store/favorites";
import type { Campaign, Category, MenuProduct, Order, OrderStatus, Reward } from "@/types/models";

const ACTIVE: OrderStatus[] = ["pending", "preparing", "ready"];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function HomeScreen() {
  const router = useRouter();
  const profile = useAuth((s) => s.profile);
  const branch = useBranch((s) => s.branch);
  const favIds = useFavorites((s) => s.ids);
  const loadFavorites = useFavorites((s) => s.load);
  const seasonalKey = useSeasonalTheme((s) => s.activeKey);
  const seasonalPreset =
    seasonalKey && seasonalKey !== "default" ? presetByKey(seasonalKey) : null;

  const [menu, setMenu] = useState<MenuProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [active, setActive] = useState<Order | null>(null);
  const [recentNames, setRecentNames] = useState<string[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [heroFailed, setHeroFailed] = useState(false);
  const impressionId = useRef<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    void loadFavorites();
    try {
      const [cats, orders, names, rwds] = await Promise.all([
        getCategories(),
        getOrders(),
        getRecentProductNames().catch(() => [] as string[]),
        getRewards().catch(() => [] as Reward[]),
      ]);
      setCategories(cats);
      setActive(orders.find((o) => ACTIVE.includes(o.status)) ?? null);
      setRecentNames(names);
      setRewards(rwds);
      setMenu(branch ? await getMenu(branch.id) : []);
    } catch (e) {
      setError(humanizeError(e, "Could not load your home feed."));
    } finally {
      setLoading(false);
    }
  }, [branch, loadFavorites]);

  const featured = useMemo(
    () => menu.filter((p) => p.is_featured && p.inStock).slice(0, 8),
    [menu],
  );
  const favorites = useMemo(
    () => menu.filter((p) => favIds.includes(p.id) && p.inStock).slice(0, 10),
    [menu, favIds],
  );
  // Cheapest reward the customer can't yet afford = the next goal (live).
  const nextReward = useMemo(() => {
    const pts = profile?.loyalty_points ?? 0;
    return (
      rewards
        .filter((r) => r.points_cost > pts)
        .sort((a, b) => a.points_cost - b.points_cost)[0] ?? null
    );
  }, [rewards, profile?.loyalty_points]);

  // Previously-ordered products that are in stock at this branch, newest first.
  const orderAgain = useMemo(() => {
    const byName = new Map(menu.map((p) => [p.name.trim().toLowerCase(), p]));
    const out: MenuProduct[] = [];
    for (const name of recentNames) {
      const p = byName.get(name.trim().toLowerCase());
      if (p && p.inStock) out.push(p);
      if (out.length >= 10) break;
    }
    return out;
  }, [menu, recentNames]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  // Show the seasonal ad once per LOGIN session (re-armed on sign-in/out), but
  // never over an active order. Prefer the non-frequency-gated active campaign so
  // the current season always appears; fall back to the RPC if that returns
  // nothing. Only consume the once-per-session flag once an ad actually loads, so
  // a transient empty/failed fetch never suppresses the ad.
  const campaignTried = useRef(false);
  useEffect(() => {
    if (campaignTried.current || !campaignSession.shouldShow() || loading || active) return;
    campaignTried.current = true;
    void (async () => {
      const c =
        (await getActiveSeasonalAd().catch(() => null)) ??
        (await getActiveCampaign().catch(() => null));
      if (!c) return;
      campaignSession.markShown();
      setCampaign(c);
      recordCampaignView(c.id)
        .then((id) => {
          impressionId.current = id;
        })
        .catch(() => {});
    })();
  }, [loading, active]);

  function dismissCampaign() {
    if (impressionId.current) void recordCampaignAction(impressionId.current, "dismiss");
    setCampaign(null);
  }

  function ctaCampaign() {
    if (impressionId.current) void recordCampaignAction(impressionId.current, "click");
    const c = campaign;
    setCampaign(null);
    if (c?.product_id) router.push(`/product/${c.product_id}`);
    else if (c?.preset_key && c.preset_key !== "default")
      router.push(`/menu?collection=${c.preset_key}`);
    else router.push("/menu");
  }

  const firstName = profile?.first_name || "there";

  if (error && !refreshing) {
    return (
      <Screen>
        <View className="px-5 pt-2">
          <Text className="font-display text-3xl text-textPrimary">Home</Text>
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
        {/* Top bar */}
        <View className="flex-row items-center justify-between px-5 pb-4 pt-1">
          <View className="flex-1 pr-3">
            <Text className="text-sm text-textSecondary">{greeting()},</Text>
            <Text className="font-display text-2xl text-textPrimary" numberOfLines={1}>
              {firstName}
            </Text>
          </View>
          <View className="flex-row items-center gap-2">
            <NotificationBell />
            <AnimatedPressable
              onPress={() => router.push("/rewards")}
              className="flex-row items-center gap-1.5 rounded-full bg-surface px-3.5 py-2"
              style={shadow.card}
            >
              <Ionicons name="star" size={15} color={Colors.accent} />
              <Text className="text-sm font-bold text-textPrimary">
                {profile?.loyalty_points ?? 0}
              </Text>
            </AnimatedPressable>
          </View>
        </View>

        {/* Branch selector (shared location-style field → geolocation picker) */}
        <View className="mx-5 mb-5">
          <BranchSelectorField
            branch={branch}
            onPress={() => router.push("/branches")}
            placeholder="Select a branch"
            extra={branch ? <BranchWorkload branchId={branch.id} /> : null}
          />
        </View>

        {/* Active order banner — live status kept near the top.
            Ready-for-pickup gets a stronger, filled treatment. */}
        {active ? (
          active.status === "ready" ? (
            <AnimatedPressable
              onPress={() => router.push(`/order/${active.id}`)}
              className="mx-5 mb-5 flex-row items-center rounded-2xl bg-brandPrimary p-4"
              style={shadow.floating}
            >
              <View className="h-10 w-10 items-center justify-center rounded-full bg-white/20">
                <Ionicons name="checkmark-circle" size={22} color="#fff" />
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-xs font-semibold uppercase tracking-wide text-white/80">
                  Pickup {pickupOrRef(active)}
                </Text>
                <Text className="text-base font-bold text-white">Ready for pickup! 🎉</Text>
                <Text className="text-xs text-white/80">Head to {branch?.name ?? "the counter"}</Text>
              </View>
              <Text className="text-sm font-bold text-white">View</Text>
              <Ionicons name="chevron-forward" size={16} color="#fff" />
            </AnimatedPressable>
          ) : (
            <AnimatedPressable
              onPress={() => router.push(`/order/${active.id}`)}
              className="mx-5 mb-5 flex-row items-center rounded-2xl border border-accent-300 bg-accent-100 p-4"
            >
              <View className="h-10 w-10 items-center justify-center rounded-full bg-brand-900">
                <Ionicons name="cafe" size={18} color="#fff" />
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-xs font-semibold uppercase tracking-wide text-textSecondary">
                  Active order · Pickup {pickupOrRef(active)}
                </Text>
                <Text className="text-sm font-bold text-textPrimary">
                  {statusLabel(active.status)}
                </Text>
                {(active.status === "pending" || active.status === "preparing") &&
                active.estimated_max_minutes ? (
                  <Text className="text-xs text-textSecondary">
                    {formatEta(active.estimated_min_minutes, active.estimated_max_minutes)}
                  </Text>
                ) : null}
              </View>
              <Text className="text-sm font-bold text-brandPrimary">Track</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.brand} />
            </AnimatedPressable>
          )
        ) : null}

        {/* Hero — order-ahead, campaign-aware accent tint */}
        <View
          className="mx-5 mb-5 overflow-hidden rounded-panel bg-brand-900 p-6"
          style={shadow.floating}
        >
          {heroFailed ? (
            <View className="absolute -right-4 -top-2 opacity-90">
              <CoffeeCup size={132} onDark />
            </View>
          ) : (
            <>
              <Image
                source={brandingImages.homeHero}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                onError={() => setHeroFailed(true)}
                accessibilityLabel="Cafinity coffee"
              />
              {/* Campaign accent tint so the hero reads under the active season */}
              <View pointerEvents="none" style={StyleSheet.absoluteFill} className="bg-accent/20" />
              <View pointerEvents="none" style={StyleSheet.absoluteFill} className="bg-black/40" />
            </>
          )}
          <Text className="text-xs font-semibold uppercase tracking-widest text-accent-300">
            Cafinity
          </Text>
          <Text className="mt-2 w-2/3 font-display text-2xl leading-7 text-white">
            Skip the line. Order ahead.
          </Text>
          <Text className="mt-1 w-2/3 text-xs text-brand-100">
            Freshly brewed, ready when you arrive.
          </Text>
          <AnimatedPressable
            onPress={() => router.push(branch ? "/menu" : "/branches")}
            haptic="light"
            className="mt-5 flex-row items-center gap-2 self-start rounded-full bg-accent px-5 py-3"
          >
            <Ionicons name="cafe" size={16} color="#3A2410" />
            <Text className="text-sm font-bold text-[#3A2410]">
              {branch ? "Start an order" : "Choose a branch"}
            </Text>
          </AnimatedPressable>
        </View>

        {/* Featured */}
        <SectionHeader
          title="Featured drinks"
          action={
            branch ? (
              <Text
                className="px-5 text-sm font-semibold text-brandPrimary"
                onPress={() => router.push("/menu")}
              >
                See all
              </Text>
            ) : undefined
          }
        />
        {!branch ? (
          <View className="mx-5 rounded-2xl border border-dashed border-line bg-surface p-6">
            <Text className="text-center text-sm text-textSecondary">
              Pick a branch to see what&apos;s brewing near you.
            </Text>
          </View>
        ) : loading ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="px-5 gap-4"
          >
            {[0, 1, 2].map((i) => (
              <View key={i} className="w-44 overflow-hidden rounded-card bg-surface">
                <Skeleton className="h-32 w-full" />
                <View className="gap-2 p-3">
                  <Skeleton className="h-4 w-28 rounded-md" />
                  <Skeleton className="h-3 w-16 rounded-md" />
                  <Skeleton className="h-4 w-14 rounded-md" />
                </View>
              </View>
            ))}
          </ScrollView>
        ) : featured.length === 0 ? (
          <View className="mx-5 rounded-2xl border border-dashed border-line bg-surface p-6">
            <Text className="text-center text-sm text-textSecondary">
              No featured drinks right now — browse the full menu!
            </Text>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="px-5 gap-4"
          >
            {featured.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </ScrollView>
        )}

        {/* Seasonal collection — one card instead of another full product rail */}
        {branch && seasonalPreset ? (
          <View className="mt-7 px-5">
            <AnimatedPressable
              onPress={() => router.push(`/menu?collection=${seasonalPreset.key}`)}
              haptic="light"
              className="flex-row items-center rounded-card border border-accent-300 bg-accent-100 p-4"
            >
              <View className="h-12 w-12 items-center justify-center rounded-full bg-brand-900">
                <Text style={{ fontSize: 24 }}>{seasonalPreset.emoji}</Text>
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-[11px] font-semibold uppercase tracking-wide text-brandPrimary">
                  Seasonal collection
                </Text>
                <Text className="font-display text-base text-textPrimary">{seasonalPreset.name}</Text>
                <Text className="text-xs text-textSecondary" numberOfLines={1}>
                  {seasonalPreset.subtitle}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.brand} />
            </AnimatedPressable>
          </View>
        ) : null}

        {/* Order again — compact pills (not another full card rail) */}
        {branch && orderAgain.length > 0 ? (
          <>
            <SectionHeader title="Order again" className="mb-3 mt-7 px-5" />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="px-5 gap-2"
            >
              {orderAgain.map((p) => (
                <AnimatedPressable
                  key={p.id}
                  onPress={() => router.push(`/product/${p.id}`)}
                  className="flex-row items-center gap-2 rounded-full border border-line bg-surface py-1.5 pl-1.5 pr-4"
                >
                  <ProductImage
                    {...resolveProductImage({ name: p.name, image_url: p.image_url, media: p.media })}
                    emoji="☕"
                    emojiSize={14}
                    className="h-9 w-9 rounded-full"
                    accessibilityLabel={p.name}
                  />
                  <Text
                    className="max-w-[130px] text-sm font-semibold text-textPrimary"
                    numberOfLines={1}
                  >
                    {p.name}
                  </Text>
                </AnimatedPressable>
              ))}
            </ScrollView>
          </>
        ) : null}

        {/* Your favorites */}
        {branch && favorites.length > 0 ? (
          <>
            <SectionHeader
              title="Your favorites"
              className="mb-3 mt-7 px-5"
              action={
                <Text
                  className="px-5 text-sm font-semibold text-brandPrimary"
                  onPress={() => router.push("/menu")}
                >
                  See all
                </Text>
              }
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="px-5 gap-4"
            >
              {favorites.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </ScrollView>
          </>
        ) : null}

        {/* Categories */}
        {categories.length > 0 ? (
          <>
            <SectionHeader title="Browse the menu" className="mb-3 mt-7 px-5" />
            <View className="flex-row flex-wrap gap-2 px-5">
              {categories.map((c) => (
                <AnimatedPressable
                  key={c.id}
                  onPress={() => router.push("/menu")}
                  className="rounded-full border border-line bg-surface px-4 py-2.5"
                >
                  <Text className="text-sm font-semibold text-textPrimary">{c.name}</Text>
                </AnimatedPressable>
              ))}
            </View>
          </>
        ) : null}

        {/* Rewards hero */}
        <View className="mt-7">
          <RewardsHero
            points={profile?.loyalty_points ?? 0}
            streak={profile?.current_streak ?? 0}
            nextReward={nextReward}
            onViewRewards={() => router.push("/rewards")}
            onVouchers={() => router.push("/rewards")}
          />
        </View>
      </ScrollView>

      {campaign ? (
        <CampaignAd campaign={campaign} onDismiss={dismissCampaign} onCta={ctaCampaign} />
      ) : null}
    </Screen>
  );
}
