import { Text, View } from "react-native";

type Tone = "brand" | "green" | "red" | "amber" | "gray" | "blue";

// Theme-aware soft surfaces so chips stay readable in light AND dark mode
// (verified status/soft pairs meet 4.5:1).
const bg: Record<Tone, string> = {
  brand: "bg-surfaceMuted",
  green: "bg-successSoft",
  red: "bg-dangerSoft",
  amber: "bg-warningSoft",
  gray: "bg-surfaceMuted",
  blue: "bg-infoSoft",
};

const fg: Record<Tone, string> = {
  brand: "text-textSecondary",
  green: "text-success",
  red: "text-danger",
  amber: "text-warning",
  gray: "text-textSecondary",
  blue: "text-info",
};

export function Badge({ label, tone = "brand" }: { label: string; tone?: Tone }) {
  return (
    <View className={`self-start rounded-full px-2.5 py-1 ${bg[tone]}`}>
      <Text className={`text-xs font-semibold ${fg[tone]}`}>{label}</Text>
    </View>
  );
}
