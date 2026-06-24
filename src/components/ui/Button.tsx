import type { ReactNode } from "react";
import { ActivityIndicator, Text } from "react-native";
import { AnimatedPressable } from "@/components/ui/AnimatedPressable";
import { haptics, type HapticKind } from "@/lib/haptics";
import { theme } from "@/constants/theme";

type Variant = "primary" | "outline" | "ghost" | "danger";

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
  leftIcon?: ReactNode;
  /** Optional haptic fired on press. */
  haptic?: HapticKind;
}

const container: Record<Variant, string> = {
  primary: "bg-brandPrimary",
  outline: "bg-surface border border-brand-300",
  ghost: "bg-transparent",
  danger: "bg-surface border border-red-300",
};

const text: Record<Variant, string> = {
  primary: "text-white",
  outline: "text-brandPrimary",
  ghost: "text-brandPrimary",
  danger: "text-danger",
};

export function Button({
  label,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  className,
  leftIcon,
  haptic,
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <AnimatedPressable
      onPress={() => {
        if (haptic) haptics[haptic]();
        onPress?.();
      }}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      className={`h-14 flex-row items-center justify-center gap-2 rounded-2xl px-5 ${container[variant]} ${isDisabled ? "opacity-50" : ""} ${className ?? ""}`}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? "#ffffff" : theme.brandPrimary} />
      ) : (
        <>
          {leftIcon}
          <Text className={`text-base font-semibold ${text[variant]}`}>{label}</Text>
        </>
      )}
    </AnimatedPressable>
  );
}
