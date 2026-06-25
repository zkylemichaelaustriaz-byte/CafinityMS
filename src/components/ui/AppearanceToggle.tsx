import { Pressable, Text, View } from "react-native";
import { useResolvedTheme } from "@/theme/AppThemeProvider";
import { haptics } from "@/lib/haptics";
import type { AppearancePref } from "@/store/appearance";

const OPTIONS: AppearancePref[] = ["system", "light", "dark"];

/**
 * Shared appearance control (Use device / Light / Dark). Reads + writes the one
 * persisted preference via the resolved-theme context, so Customer, Staff, and
 * Admin all change the same setting and reflect it instantly everywhere.
 */
export function AppearanceToggle() {
  const { preference, setPreference } = useResolvedTheme();
  return (
    <View className="flex-row rounded-2xl bg-surfaceMuted p-1">
      {OPTIONS.map((opt) => {
        const active = preference === opt;
        return (
          <Pressable
            key={opt}
            onPress={() => {
              if (opt !== preference) haptics.selection();
              setPreference(opt);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={opt === "system" ? "Use device theme" : `${opt} theme`}
            className={`flex-1 items-center rounded-xl py-2.5 ${active ? "bg-surface" : ""}`}
          >
            <Text className={`text-sm font-semibold ${active ? "text-brandPrimary" : "text-textMuted"}`}>
              {opt === "system" ? "Use device" : opt === "light" ? "Light" : "Dark"}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
