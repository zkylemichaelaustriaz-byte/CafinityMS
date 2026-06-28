import { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, Linking, Pressable, RefreshControl, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { EmptyState } from "@/components/ui/EmptyState";
import { Header } from "@/components/ui/Header";
import { Screen } from "@/components/ui/Screen";
import { Colors } from "@/constants/theme";
import { getNotificationPreferences, updateNotificationPreferences } from "@/lib/api";
import { getEmptyStateImage } from "@/lib/emptyStateImages";
import { formatDateTime } from "@/lib/format";
import {
  getNotificationPermission,
  requestNotificationPermission,
  type NotifPermission,
} from "@/lib/notify";
import { useNotifications } from "@/store/notifications";
import type { AppNotification, NotificationPreferences } from "@/types/models";

const ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  order_placed: "receipt-outline",
  order_preparing: "cafe-outline",
  order_ready: "checkmark-circle-outline",
  order_completed: "bag-check-outline",
  order_cancelled: "close-circle-outline",
  payment_confirmed: "card-outline",
  refund_refunded: "cash-outline",
  refund_refund_pending: "cash-outline",
  discount_verified: "shield-checkmark-outline",
  discount_rejected: "alert-circle-outline",
};

const PREF_LABELS: { key: keyof NotificationPreferences; label: string }[] = [
  { key: "order_updates", label: "Order updates" },
  { key: "promotions", label: "Promotions" },
  { key: "rewards", label: "Rewards" },
  { key: "voucher_expiry", label: "Voucher expiry reminders" },
];

export default function NotificationsScreen() {
  const router = useRouter();
  const items = useNotifications((s) => s.items);
  const realtimeOk = useNotifications((s) => s.realtimeOk);
  const refresh = useNotifications((s) => s.refresh);
  const markRead = useNotifications((s) => s.markRead);
  const markAll = useNotifications((s) => s.markAll);
  const remove = useNotifications((s) => s.remove);
  const clearRead = useNotifications((s) => s.clearRead);
  const clearAll = useNotifications((s) => s.clearAll);

  const [refreshing, setRefreshing] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [perm, setPerm] = useState<NotifPermission>("granted"); // optimistic; checked on mount

  useFocusEffect(
    useCallback(() => {
      void refresh();
      void getNotificationPermission().then(setPerm);
    }, [refresh]),
  );

  useEffect(() => {
    getNotificationPreferences().then(setPrefs).catch(() => {});
  }, []);

  async function enableNotifications() {
    setPerm(await requestNotificationPermission());
  }

  async function onRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  function open(n: AppNotification) {
    if (!n.read_at) markRead(n.id);
    const orderId = n.data?.order_id;
    if (typeof orderId === "string") {
      router.push(`/order/${orderId}`);
      return;
    }
    // Reward / voucher notifications deep-link to the Rewards area.
    if (n.type.includes("reward") || n.type.includes("voucher")) {
      router.push("/rewards");
    }
  }

  function togglePref(key: keyof NotificationPreferences, value: boolean) {
    if (!prefs) return;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    updateNotificationPreferences(next).catch(() => {});
  }

  const hasUnread = items.some((n) => !n.read_at);
  const hasRead = items.some((n) => !!n.read_at);

  function confirmClearAll() {
    Alert.alert(
      "Clear all notifications?",
      "This removes your entire notification history. It can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Clear all", style: "destructive", onPress: clearAll },
      ],
    );
  }

  function openManageMenu() {
    const options: Parameters<typeof Alert.alert>[2] = [
      { text: "Notification settings", onPress: () => setShowPrefs((s) => !s) },
    ];
    if (hasUnread) options.push({ text: "Mark all as read", onPress: markAll });
    if (hasRead) options.push({ text: "Clear read notifications", onPress: clearRead });
    if (items.length > 0) options.push({ text: "Clear all", style: "destructive", onPress: confirmClearAll });
    options.push({ text: "Cancel", style: "cancel" });
    Alert.alert("Notifications", undefined, options);
  }

  return (
    <Screen edges={["top"]}>
      <Header
        title="Notifications"
        right={
          <Pressable onPress={openManageMenu} hitSlop={8} accessibilityLabel="Manage notifications">
            <Ionicons name="ellipsis-horizontal" size={22} color={Colors.brand} />
          </Pressable>
        }
      />

      {!realtimeOk ? (
        <View className="flex-row items-center gap-1.5 bg-surfaceMuted px-5 py-2">
          <Ionicons name="cloud-offline-outline" size={14} color={Colors.textMuted} />
          <Text className="text-xs text-textMuted">Live updates unavailable · pull to refresh</Text>
        </View>
      ) : null}

      {/* Contextual opt-in — we only prompt the OS here, never silently */}
      {perm !== "granted" ? (
        <View className="mx-4 mt-3 rounded-2xl border border-line bg-surface p-3">
          <View className="flex-row items-center gap-2">
            <Ionicons name="notifications-outline" size={16} color={Colors.brand} />
            <Text className="font-heading text-sm text-textPrimary">Turn on notifications</Text>
          </View>
          <Text className="mt-1 text-xs text-textSecondary">
            Allow notifications to know when your order is being prepared and ready for pickup.
          </Text>
          <Pressable
            onPress={perm === "blocked" ? () => void Linking.openSettings() : enableNotifications}
            accessibilityRole="button"
            className="mt-2 self-start rounded-full bg-brandPrimary px-4 py-2"
          >
            <Text className="text-xs font-bold text-white">
              {perm === "blocked" ? "Open settings" : "Enable notifications"}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {showPrefs && prefs ? (
        <View className="border-b border-line bg-surface px-5 py-3">
          <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-textMuted">
            Notify me about
          </Text>
          {PREF_LABELS.map(({ key, label }) => (
            <View key={key} className="flex-row items-center justify-between py-1.5">
              <Text className="text-sm text-textPrimary">{label}</Text>
              <Switch
                value={prefs[key]}
                onValueChange={(v) => togglePref(key, v)}
                trackColor={{ true: Colors.brand }}
              />
            </View>
          ))}
          <Text className="mt-1 text-[11px] text-textMuted">
            Order updates also appear in-app. Remote push needs a development build.
          </Text>
        </View>
      ) : null}

      {hasUnread ? (
        <Pressable onPress={markAll} className="items-end px-5 pb-1 pt-2">
          <Text className="text-sm font-semibold text-brandPrimary">Mark all read</Text>
        </Pressable>
      ) : null}

      <FlatList
        data={items}
        keyExtractor={(n) => n.id}
        contentContainerClassName="p-4 gap-2"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brand} />
        }
        ListEmptyComponent={
          <EmptyState
            image={getEmptyStateImage("notifications")}
            icon="notifications-off-outline"
            title="No notifications yet"
            subtitle="Order updates will show up here."
          />
        }
        renderItem={({ item }) => {
          const unread = !item.read_at;
          return (
            <Pressable
              onPress={() => open(item)}
              className={`flex-row rounded-card border p-3 ${
                unread ? "border-accent-300 bg-accent-100" : "border-line bg-surface"
              }`}
            >
              <View className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-surface">
                <Ionicons
                  name={ICON[item.type] ?? "notifications-outline"}
                  size={20}
                  color={Colors.brand}
                />
              </View>
              <View className="flex-1">
                <View className="flex-row items-center justify-between">
                  <Text className="flex-1 pr-2 text-sm font-bold text-textPrimary">{item.title}</Text>
                  {unread ? <View className="h-2 w-2 rounded-full bg-danger" /> : null}
                </View>
                <Text className="text-xs text-textSecondary">{item.body}</Text>
                <Text className="mt-0.5 text-[10px] text-textMuted">
                  {formatDateTime(item.created_at)}
                </Text>
              </View>
              <Pressable
                onPress={() => remove(item.id)}
                hitSlop={10}
                accessibilityLabel={`Delete notification: ${item.title}`}
                className="ml-2 -mr-1 self-start p-1"
              >
                <Ionicons name="trash-outline" size={16} color={Colors.textMuted} />
              </Pressable>
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}
