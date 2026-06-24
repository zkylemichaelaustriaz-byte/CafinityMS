import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { EmptyState } from "@/components/ui/EmptyState";
import { Header } from "@/components/ui/Header";
import { Screen } from "@/components/ui/Screen";
import { Colors } from "@/constants/theme";
import { getNotificationPreferences, updateNotificationPreferences } from "@/lib/api";
import { getEmptyStateImage } from "@/lib/emptyStateImages";
import { formatDateTime } from "@/lib/format";
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

  const [refreshing, setRefreshing] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  useEffect(() => {
    getNotificationPreferences().then(setPrefs).catch(() => {});
  }, []);

  async function onRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  function open(n: AppNotification) {
    if (!n.read_at) markRead(n.id);
    const orderId = n.data?.order_id;
    if (typeof orderId === "string") router.push(`/order/${orderId}`);
  }

  function togglePref(key: keyof NotificationPreferences, value: boolean) {
    if (!prefs) return;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    updateNotificationPreferences(next).catch(() => {});
  }

  const hasUnread = items.some((n) => !n.read_at);

  return (
    <Screen edges={["top"]}>
      <Header
        title="Notifications"
        right={
          <Pressable onPress={() => setShowPrefs((s) => !s)} hitSlop={8} accessibilityLabel="Preferences">
            <Ionicons name="options-outline" size={22} color={Colors.brand} />
          </Pressable>
        }
      />

      {!realtimeOk ? (
        <View className="flex-row items-center gap-1.5 bg-surfaceMuted px-5 py-2">
          <Ionicons name="cloud-offline-outline" size={14} color={Colors.textMuted} />
          <Text className="text-xs text-textMuted">Live updates unavailable · pull to refresh</Text>
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
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}
