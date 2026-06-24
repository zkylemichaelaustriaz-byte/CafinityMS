import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Colors, shadow } from "@/constants/theme";
import { useNotifications } from "@/store/notifications";

/** Bell with an unread badge. Reads the shared store fed by NotificationProvider. */
export function NotificationBell() {
  const router = useRouter();
  const count = useNotifications((s) => s.unread);

  return (
    <Pressable
      onPress={() => router.push("/notifications")}
      accessibilityLabel={`Notifications${count > 0 ? `, ${count} unread` : ""}`}
      className="h-10 w-10 items-center justify-center rounded-full bg-surface"
      style={shadow.card}
    >
      <Ionicons name="notifications-outline" size={20} color={Colors.brand} />
      {count > 0 ? (
        <View className="absolute -right-0.5 -top-0.5 h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1">
          <Text className="text-[10px] font-bold text-white">{count > 9 ? "9+" : count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
