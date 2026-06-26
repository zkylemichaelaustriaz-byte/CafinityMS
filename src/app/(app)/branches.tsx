import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Linking, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import { AnimatedPressable } from "@/components/ui/AnimatedPressable";
import { Badge } from "@/components/ui/Badge";
import { BranchWorkload } from "@/components/ui/BranchWorkload";
import { ErrorState } from "@/components/ui/ErrorState";
import { Header } from "@/components/ui/Header";
import { Screen } from "@/components/ui/Screen";
import { Colors, shadow } from "@/constants/theme";
import { getBranches } from "@/lib/api";
import { formatDistance } from "@/lib/format";
import { humanizeError } from "@/lib/errors";
import { useBranch } from "@/store/branch";
import { useCart } from "@/store/cart";
import type { BranchWithDistance } from "@/types/models";

function isOpenNow(opening: string, closing: string): boolean {
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const [oh, om] = opening.split(":").map(Number);
  const [ch, cm] = closing.split(":").map(Number);
  return cur >= oh * 60 + om && cur <= ch * 60 + cm;
}

function fmtTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, "0")} ${ap}`;
}

export default function BranchesScreen() {
  const router = useRouter();
  const setBranch = useBranch((s) => s.setBranch);
  const selected = useBranch((s) => s.branch);

  const [branches, setBranches] = useState<BranchWithDistance[]>([]);
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // checking → permission not yet read; prompt → can ask; denied → can re-ask;
  // blocked → must enable in Settings; granted → located; unavailable → services off/failed.
  const [locStatus, setLocStatus] = useState<
    "checking" | "prompt" | "granted" | "denied" | "blocked" | "unavailable"
  >("checking");

  const loadBranches = useCallback(async (lat: number | null, lon: number | null) => {
    setLoading(true);
    setError(null);
    try {
      setBranches(await getBranches(lat, lon));
    } catch (e) {
      setError(humanizeError(e, "Could not load branches."));
    } finally {
      setLoading(false);
    }
  }, []);

  // Get a fix (permission already granted) and re-sort by distance.
  const locate = useCallback(async () => {
    setLocating(true);
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLocStatus("granted");
      await loadBranches(pos.coords.latitude, pos.coords.longitude);
    } catch {
      // Permission ok but no fix → device location likely off.
      setLocStatus("unavailable");
      await loadBranches(null, null);
    } finally {
      setLocating(false);
    }
  }, [loadBranches]);

  // Explicit user action — only here do we open the OS permission prompt.
  const requestAndLocate = useCallback(async () => {
    setLocating(true);
    const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
    if (status === "granted") {
      await locate();
    } else {
      setLocStatus(canAskAgain ? "denied" : "blocked");
      setLocating(false);
      await loadBranches(null, null);
    }
  }, [locate, loadBranches]);

  useEffect(() => {
    void (async () => {
      // Read current permission WITHOUT prompting; only an explicit tap prompts.
      const { status, canAskAgain } = await Location.getForegroundPermissionsAsync();
      if (status === "granted") {
        await locate();
      } else {
        setLocStatus(status === "denied" ? (canAskAgain ? "denied" : "blocked") : "prompt");
        setLocating(false);
        await loadBranches(null, null);
      }
    })();
  }, [locate, loadBranches]);

  function choose(branch: BranchWithDistance) {
    const cart = useCart.getState();
    // Non-destructive switch: keep the cart and re-point it at the new branch.
    // Any item not available there is flagged in the cart for the customer to
    // remove/edit (no silent deletion).
    if (cart.lines.length > 0 && cart.branchId && cart.branchId !== branch.id) {
      cart.rebaseBranch(branch.id);
    }
    setBranch(branch);
    router.back();
  }

  const band: {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    sub: string;
    action: { label: string; onPress: () => void } | null;
  } =
    locating || locStatus === "checking"
      ? { icon: "navigate", title: "Finding you…", sub: "Sorting branches by distance.", action: null }
      : locStatus === "granted"
        ? {
            icon: "navigate",
            title: "Sorted by what's nearest",
            sub: "Pick a store to start your order.",
            action: null,
          }
        : locStatus === "blocked"
          ? {
              icon: "lock-closed-outline",
              title: "Location is blocked",
              sub: "Turn it on in Settings to sort by distance — you can still pick any branch.",
              action: { label: "Open settings", onPress: () => void Linking.openSettings() },
            }
          : locStatus === "unavailable"
            ? {
                icon: "warning-outline",
                title: "Couldn't get your location",
                sub: "Is location turned on? You can still pick a branch.",
                action: { label: "Try again", onPress: () => void locate() },
              }
            : locStatus === "denied"
              ? {
                  icon: "location-outline",
                  title: "Location is off",
                  sub: "Enable location to sort by distance — you can still pick any branch.",
                  action: { label: "Use location", onPress: () => void requestAndLocate() },
                }
              : {
                  // prompt
                  icon: "location-outline",
                  title: "Find your nearest branch",
                  sub: "Use your location to recommend the nearest Cafinity branch. You can still pick manually.",
                  action: { label: "Use location", onPress: () => void requestAndLocate() },
                };

  return (
    <Screen edges={["top", "bottom"]}>
      <Header title="Choose a branch" />

      {/* Location status band */}
      <View className="mx-4 mt-4 flex-row items-center gap-3 rounded-2xl bg-brand-900 p-4">
        <View className="h-10 w-10 items-center justify-center rounded-full bg-white/10">
          <Ionicons name={band.icon} size={20} color={Colors.accent} />
        </View>
        <View className="flex-1">
          <Text className="text-sm font-bold text-white">{band.title}</Text>
          <Text className="text-xs text-brand-200">{band.sub}</Text>
        </View>
        {locating ? (
          <ActivityIndicator color={Colors.accent} />
        ) : band.action ? (
          <Pressable
            onPress={band.action.onPress}
            accessibilityRole="button"
            className="rounded-full bg-white/15 px-3 py-2"
          >
            <Text className="text-xs font-bold text-white">{band.action.label}</Text>
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={Colors.brand} />
          <Text className="mt-3 text-sm text-textSecondary">
            {locating ? "Finding the nearest branch…" : "Loading branches…"}
          </Text>
        </View>
      ) : error ? (
        <ErrorState message={error} onRetry={() => loadBranches(null, null)} />
      ) : (
        <FlatList
          data={branches}
          keyExtractor={(b) => b.id}
          contentContainerClassName="p-4 gap-3"
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => {
            const open = isOpenNow(item.opening_time, item.closing_time);
            const isSelected = selected?.id === item.id;
            return (
              <AnimatedPressable
                onPress={() => choose(item)}
                style={shadow.card}
                className={`rounded-card border bg-surface p-4 ${
                  isSelected ? "border-brandPrimary" : "border-line"
                }`}
              >
                <View className="flex-row items-start justify-between">
                  <View className="flex-1 pr-3">
                    <View className="flex-row flex-wrap items-center gap-2">
                      <Text className="text-base font-bold text-textPrimary">
                        {item.name}
                      </Text>
                      {index === 0 && item.distanceKm != null ? (
                        <Badge label="Nearest" tone="green" />
                      ) : null}
                      <Badge label={open ? "Open" : "Closed"} tone={open ? "green" : "gray"} />
                    </View>
                    <Text className="mt-1 text-sm text-textSecondary">{item.address}</Text>
                    <View className="mt-2 flex-row flex-wrap items-center gap-x-3 gap-y-1.5">
                      {item.distanceKm != null ? (
                        <View className="flex-row items-center gap-1">
                          <Ionicons name="navigate" size={13} color={Colors.brand} />
                          <Text className="text-xs font-medium text-brandPrimary">
                            {formatDistance(item.distanceKm)}
                          </Text>
                        </View>
                      ) : null}
                      <View className="flex-row items-center gap-1">
                        <Ionicons name="time-outline" size={13} color="#9A8A7B" />
                        <Text className="text-xs text-textMuted">
                          {fmtTime(item.opening_time)} – {fmtTime(item.closing_time)}
                        </Text>
                      </View>
                      {open ? <BranchWorkload branchId={item.id} /> : null}
                    </View>
                  </View>
                  {isSelected ? (
                    <Ionicons name="checkmark-circle" size={26} color={Colors.brand} />
                  ) : (
                    <Ionicons name="chevron-forward" size={20} color="#C9A47C" />
                  )}
                </View>
              </AnimatedPressable>
            );
          }}
        />
      )}
    </Screen>
  );
}
