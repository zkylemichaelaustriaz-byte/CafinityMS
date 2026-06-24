import * as Haptics from "expo-haptics";

// Selective, best-effort haptics. Never used for plain scrolling/navigation.
export const haptics = {
  light: () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
  medium: () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  },
  success: () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
  warning: () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  },
  selection: () => {
    void Haptics.selectionAsync().catch(() => {});
  },
};

export type HapticKind = keyof typeof haptics;
