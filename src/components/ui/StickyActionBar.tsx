import type { ReactNode } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { shadow } from "@/constants/theme";

/** Bottom sticky action region with safe-area padding and a soft top edge. */
export function StickyActionBar({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[{ paddingBottom: insets.bottom + 12 }, shadow.floating]}
      className="absolute bottom-0 left-0 right-0 border-t border-line bg-surface px-5 pt-4"
    >
      {children}
    </View>
  );
}
