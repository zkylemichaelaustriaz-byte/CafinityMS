import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { AppearanceToggle } from "@/components/ui/AppearanceToggle";
import { AvatarPicker } from "@/components/ui/AvatarPicker";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Screen } from "@/components/ui/Screen";
import { Colors } from "@/constants/theme";
import { brandingImages } from "@/lib/brandingImages";
import { presetByKey } from "@/lib/campaignPresets";
import { formatDateTime } from "@/lib/format";
import { seasonalSwatch } from "@/theme/seasonal";
import { useAuth } from "@/store/auth";
import { useSeasonalTheme } from "@/store/seasonalTheme";

export default function AdminManageScreen() {
  const router = useRouter();
  const profile = useAuth((s) => s.profile);
  const session = useAuth((s) => s.session);
  const signOut = useAuth((s) => s.signOut);
  const activeKey = useSeasonalTheme((s) => s.activeKey);
  const [coverFailed, setCoverFailed] = useState(false);

  const fullName =
    `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() || "Administrator";

  const themeName = presetByKey(activeKey)?.name ?? "Cafinity Default";
  const swatch = seasonalSwatch(activeKey);

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
      <View className="px-5 pb-2 pt-2">
        <Text className="font-display text-2xl text-textPrimary">Manage</Text>
      </View>

      <View className="p-5 pt-1">
        <View className="items-center overflow-hidden rounded-panel bg-brand-900 p-6">
          {!coverFailed ? (
            <Image
              source={brandingImages.adminDashboardHero}
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
            style={[StyleSheet.absoluteFill, { backgroundColor: Colors.accent, opacity: 0.14 }]}
          />
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: "#000", opacity: 0.5 }]}
          />
          <AvatarPicker size={72} />
          <Text className="mt-3 font-display text-xl text-white">{fullName}</Text>
          <Text className="text-sm text-brand-200">
            {profile?.email || session?.user.email || ""}
          </Text>
          <View className="mt-2">
            <Badge label={(profile?.role ?? "admin").toUpperCase()} tone="green" />
          </View>
          {profile ? (
            <Text className="mt-1 text-xs text-brand-300">
              Member since {formatDateTime(profile.created_at)}
            </Text>
          ) : null}
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
