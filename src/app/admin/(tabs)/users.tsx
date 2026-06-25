import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { ErrorState } from "@/components/ui/ErrorState";
import { Screen } from "@/components/ui/Screen";
import { Colors } from "@/constants/theme";
import { getAllUsers, setUserRole } from "@/lib/api";
import { humanizeError } from "@/lib/errors";
import { useAuth } from "@/store/auth";
import type { Profile, UserRole } from "@/types/models";

const ROLE_TONE: Record<UserRole, "green" | "blue" | "gray"> = {
  admin: "green",
  staff: "blue",
  customer: "gray",
};

export default function AdminUsersScreen() {
  const myId = useAuth((s) => s.session?.user.id);
  const refreshProfile = useAuth((s) => s.refreshProfile);
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setUsers(await getAllUsers());
    } catch (e) {
      setError(humanizeError(e, "Could not load users."));
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function pickRole(user: Profile) {
    const roles: UserRole[] = ["customer", "staff", "admin"];
    Alert.alert(
      `${user.first_name} ${user.last_name}`.trim() || user.email,
      `Current role: ${user.role}`,
      [
        ...roles
          .filter((r) => r !== user.role)
          .map((r) => ({ text: `Make ${r}`, onPress: () => changeRole(user, r) })),
        { text: "Cancel", style: "cancel" as const },
      ],
    );
  }

  async function changeRole(user: Profile, role: UserRole) {
    setBusyId(user.id);
    try {
      await setUserRole(user.id, role);
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, role } : u)));
      if (user.id === myId) await refreshProfile();
    } catch (e) {
      Alert.alert("Could not change role", humanizeError(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Screen>
      <View className="px-5 pb-2 pt-2">
        <Text className="font-display text-2xl text-textPrimary">Users</Text>
        <Text className="text-xs text-textMuted">{users.length} accounts · tap to change role</Text>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={Colors.brand} />
        </View>
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <FlatList
          data={users}
          keyExtractor={(u) => u.id}
          contentContainerClassName="p-4 gap-2"
          renderItem={({ item }) => {
            const initials =
              `${item.first_name?.[0] ?? ""}${item.last_name?.[0] ?? ""}`.toUpperCase() || "?";
            const fullName = `${item.first_name} ${item.last_name}`.trim() || "(no name)";
            return (
              <Pressable
                onPress={() => pickRole(item)}
                className="flex-row items-center rounded-2xl border border-brand-100 bg-surface p-3"
              >
                <Avatar uri={item.avatar_url} initials={initials} size={44} />
                <View className="ml-3 flex-1">
                  <Text className="text-sm font-bold text-espresso">
                    {fullName}
                    {item.id === myId ? (
                      <Text className="text-xs font-normal text-textMuted"> (you)</Text>
                    ) : null}
                  </Text>
                  <Text className="text-xs text-textMuted" numberOfLines={1}>
                    {item.email}
                  </Text>
                </View>
                {busyId === item.id ? (
                  <ActivityIndicator color={Colors.brand} size="small" />
                ) : (
                  <Badge label={item.role.toUpperCase()} tone={ROLE_TONE[item.role]} />
                )}
                <Ionicons name="chevron-forward" size={16} color="#c2a079" />
              </Pressable>
            );
          }}
        />
      )}
    </Screen>
  );
}
