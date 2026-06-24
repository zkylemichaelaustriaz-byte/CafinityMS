import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/store/auth";
import { useNotifications } from "@/store/notifications";

/**
 * Owns the SINGLE notifications Realtime channel for the signed-in user.
 * Mounted once in the authenticated layout — components read the shared store
 * (useNotifications) rather than each opening their own subscription, which is
 * what caused "cannot add postgres_changes callbacks after subscribe()".
 *
 * All `.on(...)` handlers are attached before `.subscribe()`, the topic is
 * unique per mount, and the channel is removed on unmount / user change.
 * Realtime is treated as an enhancement: if it fails, the store still loads
 * via refresh() and screens fall back to pull-to-refresh.
 */
export function NotificationProvider() {
  const userId = useAuth((s) => s.session?.user.id);
  const refresh = useNotifications((s) => s.refresh);
  const setRealtimeOk = useNotifications((s) => s.setRealtimeOk);
  const reset = useNotifications((s) => s.reset);

  useEffect(() => {
    if (!userId) {
      reset();
      return;
    }
    void refresh();

    const topic = `notifications:${userId}:${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(topic)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => void refresh(),
      )
      .subscribe((status) => {
        setRealtimeOk(status === "SUBSCRIBED");
      });

    return () => {
      setRealtimeOk(false);
      void supabase.removeChannel(channel);
    };
  }, [userId, refresh, setRealtimeOk, reset]);

  return null;
}
