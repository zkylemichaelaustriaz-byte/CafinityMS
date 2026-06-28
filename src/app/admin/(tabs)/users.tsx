import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { BranchPickerSheet } from "@/components/ui/BranchSelector";
import { ErrorState } from "@/components/ui/ErrorState";
import { Screen } from "@/components/ui/Screen";
import { Colors } from "@/constants/theme";
import { getAllUsers, getBranches, setStaffBranchAccess, setUserRole } from "@/lib/api";
import { humanizeError } from "@/lib/errors";
import { useAuth } from "@/store/auth";
import type { Branch, Profile, UserRole } from "@/types/models";

const ROLE_TONE: Record<UserRole, "green" | "blue" | "gray"> = {
  admin: "green",
  staff: "blue",
  customer: "gray",
};

/** DB role `staff` is shown as "Barista" in the UI (authorization unchanged). */
function roleLabel(role: UserRole): string {
  return role === "staff" ? "Barista" : role === "admin" ? "Administrator" : "Customer";
}

const TABS: { key: UserRole; label: string }[] = [
  { key: "staff", label: "Baristas" },
  { key: "admin", label: "Admins" },
  { key: "customer", label: "Customers" },
];

function fullNameOf(u: Profile): string {
  return `${u.first_name} ${u.last_name}`.trim() || "(no name)";
}

export default function AdminUsersScreen() {
  const myId = useAuth((s) => s.session?.user.id);
  const refreshProfile = useAuth((s) => s.refreshProfile);
  const [users, setUsers] = useState<Profile[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tab, setTab] = useState<UserRole>("staff");
  const [query, setQuery] = useState("");
  const [assignFor, setAssignFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [u, b] = await Promise.all([getAllUsers(), getBranches().catch(() => [] as Branch[])]);
      setUsers(u);
      setBranches(b);
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

  const counts = useMemo(() => {
    const c: Record<UserRole, number> = { staff: 0, admin: 0, customer: 0 };
    for (const u of users) c[u.role] += 1;
    return c;
  }, [users]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = users
      .filter((u) => u.role === tab)
      .filter(
        (u) =>
          !q ||
          fullNameOf(u).toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          (u.branch_name ?? "").toLowerCase().includes(q),
      );
    return list.sort((a, b) => {
      // Signed-in admin pinned first within Admins; otherwise alphabetical.
      if (tab === "admin") {
        if (a.id === myId) return -1;
        if (b.id === myId) return 1;
      }
      return fullNameOf(a).localeCompare(fullNameOf(b));
    });
  }, [users, tab, query, myId]);

  function pickRole(user: Profile) {
    const roles: UserRole[] = ["customer", "staff", "admin"];
    Alert.alert(
      fullNameOf(user),
      `Current: ${roleLabel(user.role)}`,
      [
        ...roles
          .filter((r) => r !== user.role)
          .map((r) => ({ text: `Make ${roleLabel(r)}`, onPress: () => changeRole(user, r) })),
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

  async function assignBranch(userId: string, branchId: string | null) {
    // branchId === null means "All branches" (explicit grant) — confirm first.
    if (branchId === null) {
      Alert.alert(
        "Grant all-branch access?",
        "This staff member will be able to view and act on orders for EVERY branch. Continue?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Grant all branches", style: "destructive", onPress: () => void applyAccess(userId, null, true) },
        ],
      );
      return;
    }
    void applyAccess(userId, branchId, false);
  }

  async function applyAccess(userId: string, branchId: string | null, allAccess: boolean) {
    setBusyId(userId);
    try {
      await setStaffBranchAccess(userId, branchId, allAccess);
      const name = allAccess ? null : branches.find((b) => b.id === branchId)?.name ?? null;
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? { ...u, branch_id: allAccess ? null : branchId, branch_name: name, all_branches_access: allAccess }
            : u,
        ),
      );
    } catch (e) {
      Alert.alert("Could not update branch access", humanizeError(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Screen>
      <View className="px-5 pb-1 pt-2">
        <Text className="font-display text-2xl text-textPrimary">Users</Text>
      </View>

      {/* Role tabs with counts */}
      <View className="mx-5 mb-2 flex-row rounded-2xl bg-surfaceMuted p-1">
        {TABS.map(({ key, label }) => {
          const on = tab === key;
          return (
            <Pressable
              key={key}
              onPress={() => setTab(key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${label}, ${counts[key]}`}
              className={`flex-1 items-center rounded-xl py-2 ${on ? "bg-surface" : ""}`}
            >
              <Text className={`text-sm font-semibold ${on ? "text-brandPrimary" : "text-textMuted"}`}>
                {label} {counts[key]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Search within the selected role */}
      <View className="mx-5 mb-1 flex-row items-center rounded-2xl border border-line bg-surface px-3">
        <Ionicons name="search" size={18} color={Colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={`Search ${TABS.find((t) => t.key === tab)?.label.toLowerCase()}`}
          placeholderTextColor={Colors.textMuted}
          autoCorrect={false}
          className="flex-1 px-2 py-2.5 text-base text-textPrimary"
        />
        {query ? (
          <Pressable onPress={() => setQuery("")} hitSlop={10} accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={Colors.brand} />
        </View>
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(u) => u.id}
          contentContainerClassName="p-4 gap-2"
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View className="items-center px-8 py-12">
              <Ionicons name="people-outline" size={30} color={Colors.textMuted} />
              <Text className="mt-2 text-center text-sm text-textSecondary">
                {query.trim() ? "No matches." : `No ${TABS.find((t) => t.key === tab)?.label.toLowerCase()} yet.`}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const initials =
              `${item.first_name?.[0] ?? ""}${item.last_name?.[0] ?? ""}`.toUpperCase() || "?";
            const isStaff = item.role === "staff";
            return (
              <Pressable
                onPress={() => pickRole(item)}
                accessibilityRole="button"
                accessibilityLabel={`${fullNameOf(item)}, ${roleLabel(item.role)}. Change role.`}
                className="flex-row items-center rounded-2xl border border-line bg-surface p-3"
              >
                <Avatar uri={item.avatar_url} initials={initials} size={44} />
                <View className="ml-3 flex-1">
                  <Text className="text-sm font-bold text-textPrimary">
                    {fullNameOf(item)}
                    {item.id === myId ? (
                      <Text className="text-xs font-normal text-textMuted"> · You</Text>
                    ) : null}
                  </Text>
                  <Text className="text-xs text-textMuted" numberOfLines={1}>
                    {item.email}
                  </Text>
                  {isStaff ? (
                    (() => {
                      const allAccess = !!item.all_branches_access;
                      const label = allAccess
                        ? "All branches"
                        : item.branch_name ?? "Assign a branch";
                      const assigned = allAccess || !!item.branch_name;
                      return (
                        <Pressable
                          onPress={() => setAssignFor(item.id)}
                          hitSlop={6}
                          accessibilityLabel={
                            assigned ? `Branch access: ${label}. Change.` : "Assign a branch"
                          }
                          className="mt-1 flex-row items-center gap-1 self-start"
                        >
                          <Ionicons
                            name={allAccess ? "git-branch-outline" : "location-outline"}
                            size={12}
                            color={assigned ? Colors.brand : Colors.warning}
                          />
                          <Text
                            className={`text-xs font-medium ${assigned ? "text-brandPrimary" : "text-warning"}`}
                          >
                            {label}
                          </Text>
                        </Pressable>
                      );
                    })()
                  ) : null}
                </View>
                {busyId === item.id ? (
                  <ActivityIndicator color={Colors.brand} size="small" />
                ) : (
                  <Badge label={roleLabel(item.role)} tone={ROLE_TONE[item.role]} />
                )}
              </Pressable>
            );
          }}
        />
      )}

      <BranchPickerSheet
        visible={assignFor !== null}
        branches={branches}
        allowAll
        selectedId={
          users.find((u) => u.id === assignFor)?.all_branches_access
            ? null
            : users.find((u) => u.id === assignFor)?.branch_id ?? null
        }
        onSelect={(id) => {
          // id === null → "All branches" grant (confirmed inside assignBranch).
          if (assignFor) void assignBranch(assignFor, id);
        }}
        onClose={() => setAssignFor(null)}
        title="Branch access"
      />
    </Screen>
  );
}
