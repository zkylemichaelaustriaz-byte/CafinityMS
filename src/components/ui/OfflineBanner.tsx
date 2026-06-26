import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNetwork } from "@/store/network";

/**
 * Floating connectivity banner shown across the whole app. Fixed dark/green
 * colors (not theme tokens) so it stays legible in light AND dark mode. Shows
 * "No internet connection" while offline and a brief "Back online" on recovery.
 */
export function OfflineBanner() {
  const online = useNetwork((s) => s.online);
  const reconnectedAt = useNetwork((s) => s.reconnectedAt);
  const insets = useSafeAreaInsets();
  const [showReconnected, setShowReconnected] = useState(false);

  useEffect(() => {
    if (!reconnectedAt) return;
    setShowReconnected(true);
    const t = setTimeout(() => setShowReconnected(false), 2200);
    return () => clearTimeout(t);
  }, [reconnectedAt]);

  if (online && !showReconnected) return null;

  return (
    <View
      pointerEvents="none"
      style={{ position: "absolute", top: insets.top + 2, left: 0, right: 0, zIndex: 100 }}
      className="px-3"
    >
      <View
        style={{ backgroundColor: online ? "#2E7D52" : "#3A332E" }}
        className="flex-row items-center justify-center gap-2 rounded-xl px-3 py-2"
      >
        <Ionicons
          name={online ? "checkmark-circle" : "cloud-offline-outline"}
          size={15}
          color="#fff"
        />
        <Text className="text-xs font-semibold text-white">
          {online ? "Back online" : "No internet connection"}
        </Text>
      </View>
    </View>
  );
}
