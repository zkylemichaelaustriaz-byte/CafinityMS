import { Text, View } from "react-native";

const sizes = {
  sm: "text-2xl",
  md: "text-4xl",
  lg: "text-5xl",
} as const;

interface WordmarkProps {
  size?: keyof typeof sizes;
  onDark?: boolean;
  className?: string;
}

/** Cafinity wordmark in the editorial display face, with an amber accent dot. */
export function Wordmark({ size = "md", onDark = false, className }: WordmarkProps) {
  return (
    <View className={`flex-row items-end ${className ?? ""}`}>
      <Text
        className={`font-black ${sizes[size]} ${onDark ? "text-white" : "text-textPrimary"}`}
        accessibilityRole="header"
      >
        Cafinity
      </Text>
      <View className="mb-1.5 ml-0.5 h-2 w-2 rounded-full bg-accent" />
    </View>
  );
}
