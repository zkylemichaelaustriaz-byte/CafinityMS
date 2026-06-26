import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";

interface QuantityStepperProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  size?: "sm" | "md";
}

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 20,
  size = "md",
}: QuantityStepperProps) {
  const dim = size === "sm" ? "h-8 w-9" : "h-12 w-12";
  const num = size === "sm" ? "w-6 text-sm" : "w-9 text-base";
  return (
    <View className="flex-row items-center rounded-2xl border border-line bg-surface">
      <Pressable
        onPress={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        accessibilityLabel="Decrease quantity"
        className={`${dim} items-center justify-center ${value <= min ? "opacity-40" : ""}`}
      >
        <Ionicons name="remove" size={18} color={Colors.brand} />
      </Pressable>
      <Text
        accessibilityLabel={`Quantity, ${value}`}
        className={`text-center font-bold text-textPrimary ${num}`}
      >
        {value}
      </Text>
      <Pressable
        onPress={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        accessibilityLabel="Increase quantity"
        className={`${dim} items-center justify-center ${value >= max ? "opacity-40" : ""}`}
      >
        <Ionicons name="add" size={18} color={Colors.brand} />
      </Pressable>
    </View>
  );
}
