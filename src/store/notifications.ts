import { create } from "zustand";
import {
  getNotifications,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/api";
import type { AppNotification } from "@/types/models";

interface NotificationsState {
  items: AppNotification[];
  unread: number;
  loaded: boolean;
  /** Whether the Realtime channel is currently subscribed. */
  realtimeOk: boolean;
  setRealtimeOk: (v: boolean) => void;
  /** Pull the list + unread count from the server. */
  refresh: () => Promise<void>;
  markRead: (id: string) => void;
  markAll: () => void;
  /** Clear on logout / account switch. */
  reset: () => void;
}

export const useNotifications = create<NotificationsState>((set, get) => ({
  items: [],
  unread: 0,
  loaded: false,
  realtimeOk: false,

  setRealtimeOk: (v) => set({ realtimeOk: v }),

  refresh: async () => {
    try {
      const [items, unread] = await Promise.all([
        getNotifications(),
        getUnreadNotificationCount(),
      ]);
      set({ items, unread, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  markRead: (id) => {
    const wasUnread = get().items.some((n) => n.id === id && !n.read_at);
    set({
      items: get().items.map((n) =>
        n.id === id ? { ...n, read_at: n.read_at ?? new Date().toISOString() } : n,
      ),
      unread: wasUnread ? Math.max(0, get().unread - 1) : get().unread,
    });
    markNotificationRead(id).catch(() => {});
  },

  markAll: () => {
    set({
      items: get().items.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })),
      unread: 0,
    });
    markAllNotificationsRead().catch(() => {});
  },

  reset: () => set({ items: [], unread: 0, loaded: false, realtimeOk: false }),
}));
