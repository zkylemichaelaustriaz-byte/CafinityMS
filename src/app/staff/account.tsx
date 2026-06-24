import { Alert, Text, View } from "react-native";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Header } from "@/components/ui/Header";
import { Screen } from "@/components/ui/Screen";
import { useAuth } from "@/store/auth";

export default function StaffAccountScreen() {
  const profile = useAuth((s) => s.profile);
  const session = useAuth((s) => s.session);
  const signOut = useAuth((s) => s.signOut);

  const initials =
    `${profile?.first_name?.[0] ?? ""}${profile?.last_name?.[0] ?? ""}`.toUpperCase() || "☕";
  const fullName =
    `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() || "Staff member";

  function confirmSignOut() {
    Alert.alert("Sign out?", "You'll need to sign in again.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => void signOut() },
    ]);
  }

  return (
    <Screen edges={["top"]}>
      <Header title="Account" />
      <View className="p-5">
        <View className="items-center rounded-panel bg-brand-900 p-6">
          <Avatar initials={initials} size={80} />
          <Text className="mt-3 font-display text-xl text-white">{fullName}</Text>
          <Text className="text-sm text-brand-200">
            {profile?.email || session?.user.email || ""}
          </Text>
          <View className="mt-2">
            <Badge label={(profile?.role ?? "staff").toUpperCase()} tone="blue" />
          </View>
        </View>

        <View className="mt-6">
          <Button label="Sign out" variant="danger" onPress={confirmSignOut} />
        </View>
      </View>
    </Screen>
  );
}
