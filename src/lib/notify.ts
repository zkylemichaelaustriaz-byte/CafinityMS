import * as Notifications from "expo-notifications";

// Show notifications while the app is foregrounded (banner + list).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

let requested = false;

export async function ensureNotificationPermission(): Promise<void> {
  if (requested) return;
  requested = true;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") {
      await Notifications.requestPermissionsAsync();
    }
  } catch {
    // notifications are best-effort in Expo Go
  }
}

/** Fire a local notification immediately (used for order status updates). */
export async function notifyLocal(title: string, body: string): Promise<void> {
  try {
    await ensureNotificationPermission();
    await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: null,
    });
  } catch {
    // ignore — local notifications may be unavailable in some environments
  }
}
