import { useEffect, useState } from "react";
import { Alert, Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { AnimatedPressable } from "@/components/ui/AnimatedPressable";
import { AppearanceToggle } from "@/components/ui/AppearanceToggle";
import { AvatarPicker } from "@/components/ui/AvatarPicker";
import { brandingImages } from "@/lib/brandingImages";
import { Button } from "@/components/ui/Button";
import { Screen } from "@/components/ui/Screen";
import { Colors } from "@/constants/theme";
import { getOrders } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { useAuth } from "@/store/auth";
import { useBranch } from "@/store/branch";

export default function ProfileScreen() {
  const router = useRouter();
  const profile = useAuth((s) => s.profile);
  const session = useAuth((s) => s.session);
  const signOut = useAuth((s) => s.signOut);
  const branch = useBranch((s) => s.branch);

  const [orderCount, setOrderCount] = useState<number | null>(null);
  const [coverFailed, setCoverFailed] = useState(false);

  useEffect(() => {
    getOrders()
      .then((o) => setOrderCount(o.length))
      .catch(() => {});
  }, []);

  const fullName =
    `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() || "Cafinity member";
  const email = profile?.email || session?.user.email || "";

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

  function changePassword() {
    if (!email) {
      Alert.alert("No email on file", "We couldn't find an email for your account.");
      return;
    }
    Alert.alert(
      "Change password",
      `We'll email a secure reset link to ${email}.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send link",
          onPress: async () => {
            try {
              const { error } = await supabase.auth.resetPasswordForEmail(email);
              if (error) throw error;
              Alert.alert("Check your email", "We sent a password reset link.");
            } catch {
              Alert.alert("Couldn't send link", "Please try again in a moment.");
            }
          },
        },
      ],
    );
  }

  function reportProblem() {
    Linking.openURL(
      "mailto:support@cafinity.app?subject=Cafinity%20problem%20report",
    ).catch(() => Alert.alert("Email unavailable", "Reach us at support@cafinity.app."));
  }

  function helpFaqs() {
    Alert.alert(
      "Help & FAQs",
      "• Track an order: Home → your active order banner, or Profile → My orders.\n• Pay with Cash: pay at the counter; staff confirm before preparing.\n• PWD/Senior discount: select it at checkout and show your ID at pickup.\n\nNeed more help? Email support@cafinity.app.",
    );
  }

  function about() {
    Alert.alert(
      "About Cafinity",
      "Cafinity Management & Ordering System\nVersion 1.0.0\nAn academic software-engineering project.",
    );
  }

  function terms() {
    Alert.alert(
      "Terms & Privacy",
      "We store only what's needed to fulfil your orders. PWD/Senior IDs are stored masked (last 4 digits only). Simulated payments are for demonstration. Contact support@cafinity.app for data requests.",
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerClassName="pb-10" showsVerticalScrollIndicator={false}>
        <View className="px-5 pb-3 pt-2">
          <Text className="font-display text-3xl text-textPrimary">Profile</Text>
        </View>

        {/* Identity hero (read-first) — profile cover with campaign overlay */}
        <View className="mx-5 items-center overflow-hidden rounded-panel bg-brand-900 p-6">
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
          <Text className="text-sm text-brand-200">{email}</Text>
          {profile ? (
            <Text className="mt-1 text-xs text-brand-300">
              Member since {formatDateTime(profile.created_at)}
            </Text>
          ) : null}
          <AnimatedPressable
            onPress={() => router.push("/edit-profile")}
            className="mt-4 flex-row items-center gap-1.5 rounded-full bg-white/10 px-4 py-2"
          >
            <Ionicons name="create-outline" size={16} color="#fff" />
            <Text className="text-sm font-semibold text-white">Edit profile</Text>
          </AnimatedPressable>
        </View>

        {/* Stats */}
        <View className="mx-5 mt-4 flex-row gap-3">
          <Stat value={String(profile?.loyalty_points ?? 0)} label="Points" />
          <Stat value={String(profile?.current_streak ?? 0)} label="Day streak" />
          <Stat value={orderCount == null ? "—" : String(orderCount)} label="Orders" />
        </View>

        {/* Quick actions */}
        <View className="mx-5 mt-4 flex-row gap-3">
          <QuickAction icon="receipt-outline" label="My orders" onPress={() => router.push("/orders")} />
          <QuickAction icon="heart-outline" label="Favorites" onPress={() => router.push("/menu")} />
          <QuickAction icon="gift-outline" label="Rewards" onPress={() => router.push("/rewards")} />
          <QuickAction
            icon="ticket-outline"
            label="Vouchers"
            onPress={() => router.push("/rewards")}
          />
        </View>

        {/* Ordering */}
        <SectionTitle>Ordering</SectionTitle>
        <View className="mx-5 overflow-hidden rounded-card border border-line bg-surface">
          <Row
            icon="location-outline"
            label="Pickup branch"
            value={branch?.name ?? "Not selected"}
            onPress={() => router.push("/branches")}
          />
          <Row icon="receipt-outline" label="My orders" onPress={() => router.push("/orders")} last />
        </View>

        {/* Rewards */}
        <SectionTitle>Rewards</SectionTitle>
        <View className="mx-5 overflow-hidden rounded-card border border-line bg-surface">
          <Row
            icon="gift-outline"
            label="Rewards & vouchers"
            value={`${profile?.loyalty_points ?? 0} pts`}
            onPress={() => router.push("/rewards")}
            last
          />
        </View>

        {/* Preferences */}
        <SectionTitle>Preferences</SectionTitle>
        <View className="mx-5 overflow-hidden rounded-card border border-line bg-surface">
          <Row
            icon="notifications-outline"
            label="Notification preferences"
            onPress={() => router.push("/notifications")}
            last
          />
        </View>
        <Text className="mx-5 mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-textMuted">
          Appearance
        </Text>
        <View className="mx-5">
          <AppearanceToggle />
        </View>

        {/* Account */}
        <SectionTitle>Account</SectionTitle>
        <View className="mx-5 overflow-hidden rounded-card border border-line bg-surface">
          <Row icon="person-outline" label="Edit profile" onPress={() => router.push("/edit-profile")} />
          <Row icon="key-outline" label="Change password" onPress={changePassword} last />
        </View>

        {/* Support */}
        <SectionTitle>Support</SectionTitle>
        <View className="mx-5 overflow-hidden rounded-card border border-line bg-surface">
          <Row icon="help-circle-outline" label="Help & FAQs" onPress={helpFaqs} />
          <Row icon="bug-outline" label="Report a problem" onPress={reportProblem} />
          <Row icon="information-circle-outline" label="About Cafinity" onPress={about} />
          <Row icon="shield-checkmark-outline" label="Terms & privacy" onPress={terms} last />
        </View>

        {/* Sign out */}
        <View className="mx-5 mt-8">
          <Button label="Sign out" variant="danger" onPress={confirmSignOut} />
        </View>

        <Text className="mt-6 text-center text-xs text-textMuted">
          Cafinity v1.0.0 ·{" "}
          {isSupabaseConfigured ? "Connected to Supabase" : "Supabase not connected"}
        </Text>
      </ScrollView>
    </Screen>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text className="mx-5 mb-2 mt-6 font-heading text-base text-textPrimary">{children}</Text>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View className="flex-1 items-center rounded-card border border-line bg-surface py-4">
      <Text className="font-display text-2xl text-brandPrimary">{value}</Text>
      <Text className="text-xs text-textSecondary">{label}</Text>
    </View>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <AnimatedPressable
      onPress={onPress}
      haptic="light"
      accessibilityRole="button"
      accessibilityLabel={label}
      className="flex-1 items-center gap-2 rounded-card border border-line bg-surface py-4"
    >
      <View className="h-10 w-10 items-center justify-center rounded-full bg-accent-100">
        <Ionicons name={icon} size={20} color={Colors.brand} />
      </View>
      <Text className="text-[11px] font-semibold text-textSecondary" numberOfLines={1}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

function Row({
  icon,
  label,
  value,
  onPress,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <AnimatedPressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      className={`flex-row items-center px-4 py-4 ${last ? "" : "border-b border-line"}`}
    >
      <Ionicons name={icon} size={20} color={Colors.brand} />
      <Text className="ml-3 flex-1 text-base font-medium text-textPrimary">{label}</Text>
      {value ? <Text className="mr-2 text-sm text-textMuted">{value}</Text> : null}
      <Ionicons name="chevron-forward" size={18} color="#C9A47C" />
    </AnimatedPressable>
  );
}
