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

export type NotifPermission = "granted" | "denied" | "blocked" | "undetermined";

function normalize(p: Notifications.NotificationPermissionsStatus): NotifPermission {
  if (p.status === "granted") return "granted";
  if (p.status === "denied") return p.canAskAgain ? "denied" : "blocked";
  return "undetermined";
}

/** Read the current OS notification permission WITHOUT prompting. */
export async function getNotificationPermission(): Promise<NotifPermission> {
  try {
    return normalize(await Notifications.getPermissionsAsync());
  } catch {
    return "undetermined";
  }
}

/** Explicit, user-initiated permission request (the only place we prompt). */
export async function requestNotificationPermission(): Promise<NotifPermission> {
  try {
    const cur = await Notifications.getPermissionsAsync();
    if (cur.status === "granted") return "granted";
    if (cur.status === "denied" && !cur.canAskAgain) return "blocked";
    return normalize(await Notifications.requestPermissionsAsync());
  } catch {
    return "undetermined";
  }
}

/**
 * Fire a local notification immediately (order status updates). Only fires when
 * permission is ALREADY granted — never prompts silently. The user opts in from
 * the notifications screen.
 */
export async function notifyLocal(title: string, body: string): Promise<void> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") return;
    await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: null,
    });
  } catch {
    // ignore — local notifications may be unavailable in some environments
  }
}
