import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { AppLoading } from "@/components/ui/AppLoading";

/**
 * Demonstrates the exact in-app loading screen without touching authentication.
 * Replay remounts AppLoading via a changing key so all animation state resets
 * cleanly (no replay loop, never a blank screen).
 */
export default function PreviewLoadingScreen() {
  const router = useRouter();
  const [runId, setRunId] = useState(0);

  return (
    <View className="flex-1 bg-background">
      <AppLoading key={runId} message="Preview only — does not affect sign-in" />

      <View pointerEvents="box-none" className="absolute inset-x-0 bottom-12 items-center gap-3">
        <Pressable
          onPress={() => setRunId((n) => n + 1)}
          accessibilityRole="button"
          accessibilityLabel="Replay loading animation"
          className="flex-row items-center gap-2 rounded-full bg-brandPrimary px-6 py-3"
        >
          <Ionicons name="refresh" size={16} color="#fff" />
          <Text className="text-sm font-bold text-white">Replay</Text>
        </Pressable>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Close preview"
          className="rounded-full border border-line bg-surface px-6 py-2.5"
        >
          <Text className="text-sm font-semibold text-textPrimary">Close</Text>
        </Pressable>
      </View>
    </View>
  );
}
