import { useEffect } from "react";
import NetInfo from "@react-native-community/netinfo";
import { useNetwork } from "@/store/network";

/**
 * Subscribes to connectivity once and feeds the network store. Mounted a single
 * time at the app root so every role shares one connection source of truth.
 */
export function NetworkProvider() {
  const setOnline = useNetwork((s) => s.setOnline);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      // isInternetReachable can be null (unknown) — only treat an explicit false
      // as offline so we don't show a false banner before the first probe.
      const online = state.isConnected === true && state.isInternetReachable !== false;
      setOnline(online);
    });
    return () => unsub();
  }, [setOnline]);

  return null;
}
