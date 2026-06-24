import { Alert, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Screen } from "@/components/ui/Screen";
import { Colors } from "@/constants/theme";
import { presetByKey } from "@/lib/campaignPresets";
import { seasonalSwatch } from "@/theme/seasonal";
import { useAuth } from "@/store/auth";
import { useSeasonalTheme } from "@/store/seasonalTheme";

export default function AdminManageScreen() {
  const router = useRouter();
  const profile = useAuth((s) => s.profile);
  const session = useAuth((s) => s.session);
  const signOut = useAuth((s) => s.signOut);
  const activeKey = useSeasonalTheme((s) => s.activeKey);

  const initials =
    `${profile?.first_name?.[0] ?? ""}${profile?.last_name?.[0] ?? ""}`.toUpperCase() || "☕";
  const fullName =
    `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() || "Administrator";

  const themeName = presetByKey(activeKey)?.name ?? "Cafinity Default";
  const swatch = seasonalSwatch(activeKey);

  function confirmSignOut() {
    Alert.alert("Sign out?", "You'll need to sign in again.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => void signOut() },
    ]);
  }

  return (
    <Screen edges={["top"]}>
      <View className="px-5 pb-2 pt-2">
        <Text className="font-display text-2xl text-textPrimary">Manage</Text>
      </View>

      <View className="p-5 pt-1">
        <View className="items-center rounded-panel bg-brand-900 p-6">
          <Avatar initials={initials} size={72} />
          <Text className="mt-3 font-display text-xl text-white">{fullName}</Text>
          <Text className="text-sm text-brand-200">
            {profile?.email || session?.user.email || ""}
          </Text>
          <View className="mt-2">
            <Badge label={(profile?.role ?? "admin").toUpperCase()} tone="green" />
          </View>
        </View>

        {/* Active seasonal theme readout */}
        <Pressable
          onPress={() => router.push("/admin/campaigns")}
          className="mt-4 flex-row items-center rounded-card border border-line bg-surface p-4"
        >
          <View className="flex-row">
            {[swatch.hero, swatch.primary, swatch.accent, swatch.soft].map((c, i) => (
              <View
                key={i}
                className="h-7 w-7 rounded-full border-2 border-surface"
                style={{ backgroundColor: c, marginLeft: i === 0 ? 0 : -8 }}
              />
            ))}
          </View>
          <View className="ml-3 flex-1">
            <Text className="text-xs text-textMuted">Active theme</Text>
            <Text className="text-base font-bold text-textPrimary">{themeName}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#C9A47C" />
        </Pressable>

        {/* Settings + Campaigns now live on the bottom bar */}
        <View className="mt-4 overflow-hidden rounded-card border border-line bg-surface">
          <Pressable
            onPress={() => router.push("/admin/campaigns")}
            className="flex-row items-center border-b border-line p-4"
          >
            <Ionicons name="megaphone-outline" size={20} color={Colors.brand} />
            <Text className="ml-3 flex-1 text-base font-medium text-textPrimary">
              Campaigns & themes
            </Text>
            <Ionicons name="chevron-forward" size={18} color="#C9A47C" />
          </Pressable>
          <Pressable
            onPress={() => router.push("/admin/settings")}
            className="flex-row items-center p-4"
          >
            <Ionicons name="settings-outline" size={20} color={Colors.brand} />
            <Text className="ml-3 flex-1 text-base font-medium text-textPrimary">Settings</Text>
            <Ionicons name="chevron-forward" size={18} color="#C9A47C" />
          </Pressable>
        </View>

        <View className="mt-6">
          <Button label="Sign out" variant="danger" onPress={confirmSignOut} />
        </View>
      </View>
    </Screen>
  );
}
