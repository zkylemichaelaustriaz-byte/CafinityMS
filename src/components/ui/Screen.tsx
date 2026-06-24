import type { ReactNode } from "react";
import { View } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { Colors } from "@/constants/theme";

interface ScreenProps {
  children: ReactNode;
  className?: string;
  edges?: Edge[];
}

/** Page wrapper that respects the safe-area and paints the cream background. */
export function Screen({ children, className, edges = ["top"] }: ScreenProps) {
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: Colors.cream }}>
      <View className={`flex-1 ${className ?? ""}`}>{children}</View>
    </SafeAreaView>
  );
}
