import { Text } from "react-native";
import { peso } from "@/lib/format";

const sizes = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-xl",
  xl: "text-3xl",
} as const;

interface PriceTextProps {
  amount: number;
  size?: keyof typeof sizes;
  className?: string;
  muted?: boolean;
}

/** Peso amount with the editorial display face for strong numeric hierarchy. */
export function PriceText({ amount, size = "md", className, muted = false }: PriceTextProps) {
  return (
    <Text
      className={`font-display ${muted ? "text-textSecondary" : "text-brandPrimary"} ${sizes[size]} ${className ?? ""}`}
    >
      {peso(amount)}
    </Text>
  );
}
