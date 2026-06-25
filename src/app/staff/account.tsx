import { useEffect, useState } from "react";
import { Alert, StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { AppearanceToggle } from "@/components/ui/AppearanceToggle";
import { AvatarPicker } from "@/components/ui/AvatarPicker";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Header } from "@/components/ui/Header";
import { Screen } from "@/components/ui/Screen";
import { Colors } from "@/constants/theme";
import { getStaffStats, type StaffStats } from "@/lib/api";
import { brandingImages } from "@/lib/brandingImages";
import { formatDateTime, peso } from "@/lib/format";
import { useAuth } from "@/store/auth";
import { useStaffPrefs } from "@/store/staffPrefs";

export default function StaffAccountScreen() {
  const profile = useAuth((s) => s.profile);
  const session = useAuth((s) => s.session);
  const signOut = useAuth((s) => s.signOut);
  const hapticOnNewOrder = useStaffPrefs((s) => s.hapticOnNewOrder);
  const setHapticOnNewOrder = useStaffPrefs((s) => s.setHapticOnNewOrder);
  const [coverFailed, setCoverFailed] = useState(false);
  const [stats, setStats] = useState<StaffStats | null>(null);

  useEffect(() => {
    getStaffStats(null)
      .then(setStats)
      .catch(() => {});
  }, []);

  const fullName =
    `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() || "Staff member";

  function confirmSignOut() {
    Alert.alert("Sign out?", "You'll need to sign in again.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          const { networkFailed } = await signOut();
          if (networkFailed) {
            Alert.alert(
              "Signed out on this device",
              "We couldn't reach the server, so another active session may remain signed in.",
            );
          }
        },
      },
    ]);
  }

  return (
    <Screen edges={["top"]}>
      <Header title="Account" />
      <View className="p-5">
        <View className="items-center overflow-hidden rounded-panel bg-brand-900 p-6">
          {!coverFailed ? (
            <Image
              source={brandingImages.profileCover}
              onError={() => setCoverFailed(true)}
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
            style={[StyleSheet.absoluteFill, { backgroundColor: "#000", opacity: 0.45 }]}
          />
          <AvatarPicker size={80} />
          <Text className="mt-3 font-display text-xl text-white">{fullName}</Text>
          <Text className="text-sm text-brand-200">
            {profile?.email || session?.user.email || ""}
          </Text>
          <View className="mt-2">
            <Badge label={(profile?.role ?? "staff").toUpperCase()} tone="blue" />
          </View>
          {profile ? (
            <Text className="mt-1 text-xs text-brand-300">
              Staff since {formatDateTime(profile.created_at)}
            </Text>
          ) : null}
        </View>

        {/* Today's tallies (all branches) */}
        {stats ? (
          <>
            <Text className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-textMuted">
              Today
            </Text>
            <View className="flex-row gap-2">
              <StatCard label="Served" value={stats.servedToday} />
              <StatCard label="Active" value={stats.activeNow} />
              <StatCard label="Ready" value={stats.readyNow} />
            </View>
            <View className="mt-2 flex-row items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3">
              <Text className="text-sm text-textSecondary">Sales today</Text>
              <Text className="font-display text-base text-textPrimary">
                {peso(stats.revenueToday)}
              </Text>
            </View>
          </>
        ) : null}

        <Text className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-textMuted">
          Preferences
        </Text>
        <View className="flex-row items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3">
          <View className="flex-1 flex-row items-center gap-2 pr-3">
            <Ionicons name="pulse-outline" size={18} color={Colors.brand} />
            <View className="flex-1">
              <Text className="text-sm font-semibold text-textPrimary">Vibrate on new order</Text>
              <Text className="text-xs text-textMuted">
                Buzz this device when an order joins the queue.
              </Text>
            </View>
          </View>
          <Switch
            value={hapticOnNewOrder}
            onValueChange={setHapticOnNewOrder}
            trackColor={{ true: Colors.brand }}
          />
        </View>

        <Text className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-textMuted">
          Appearance
        </Text>
        <AppearanceToggle />

        <View className="mt-6">
          <Button label="Sign out" variant="danger" onPress={confirmSignOut} />
        </View>
      </View>
    </Screen>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <View className="flex-1 items-center rounded-2xl border border-line bg-surface py-3">
      <Text className="font-display text-2xl text-textPrimary">{value}</Text>
      <Text className="text-[11px] text-textMuted">{label}</Text>
    </View>
  );
}
