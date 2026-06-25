import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Text, View } from "react-native";
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
  const [locationDenied, setLocationDenied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    let lat: number | null = null;
    let lon: number | null = null;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        lat = pos.coords.latitude;
        lon = pos.coords.longitude;
      } else {
        setLocationDenied(true);
      }
    } catch {
      setLocationDenied(true);
    } finally {
      setLocating(false);
    }

    try {
      setBranches(await getBranches(lat, lon));
    } catch (e) {
      setError(humanizeError(e, "Could not load branches."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function choose(branch: BranchWithDistance) {
    const cart = useCart.getState();
    if (cart.lines.length > 0 && cart.branchId && cart.branchId !== branch.id) {
      Alert.alert(
        "Switch branch?",
        "Your cart has items from another branch. Switching will clear your cart.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Switch & clear",
            style: "destructive",
            onPress: () => {
              cart.clear();
              setBranch(branch);
              router.back();
            },
          },
        ],
      );
      return;
    }
    setBranch(branch);
    router.back();
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <Header title="Choose a branch" />

      {/* Location status band */}
      <View className="mx-4 mt-4 flex-row items-center gap-3 rounded-2xl bg-brand-900 p-4">
        <View className="h-10 w-10 items-center justify-center rounded-full bg-white/10">
          <Ionicons
            name={locationDenied ? "location-outline" : "navigate"}
            size={20}
            color={Colors.accent}
          />
        </View>
        <View className="flex-1">
          <Text className="text-sm font-bold text-white">
            {locating
              ? "Finding you…"
              : locationDenied
                ? "Location is off"
                : "Sorted by what's nearest"}
          </Text>
          <Text className="text-xs text-brand-200">
            {locationDenied
              ? "Enable location to sort by distance — you can still pick any branch."
              : "Pick a store to start your order."}
          </Text>
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={Colors.brand} />
          <Text className="mt-3 text-sm text-textSecondary">
            {locating ? "Finding the nearest branch…" : "Loading branches…"}
          </Text>
        </View>
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
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
                      <View className="flex-row items-center gap-1">
                        <Ionicons name="navigate" size={13} color={Colors.brand} />
                        <Text className="text-xs font-medium text-brandPrimary">
                          {formatDistance(item.distanceKm)}
                        </Text>
                      </View>
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
