import { Text, View } from "react-native";

type Tone = "brand" | "green" | "red" | "amber" | "gray" | "blue";

const bg: Record<Tone, string> = {
  brand: "bg-brand-100",
  green: "bg-green-100",
  red: "bg-red-100",
  amber: "bg-amber-100",
  gray: "bg-stone-200",
  blue: "bg-blue-100",
};

const fg: Record<Tone, string> = {
  brand: "text-brand-700",
  green: "text-green-700",
  red: "text-red-700",
  amber: "text-amber-800",
  gray: "text-stone-700",
  blue: "text-blue-700",
};

export function Badge({ label, tone = "brand" }: { label: string; tone?: Tone }) {
  return (
    <View className={`self-start rounded-full px-2.5 py-1 ${bg[tone]}`}>
      <Text className={`text-xs font-semibold ${fg[tone]}`}>{label}</Text>
    </View>
  );
}
