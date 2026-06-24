import type { ReactNode } from "react";
import { Text, View } from "react-native";

interface SectionHeaderProps {
  title: string;
  action?: ReactNode;
  className?: string;
}

export function SectionHeader({ title, action, className }: SectionHeaderProps) {
  return (
    <View className={`mb-3 flex-row items-end justify-between ${className ?? "px-5"}`}>
      <Text className="font-heading text-lg text-textPrimary">{title}</Text>
      {action}
    </View>
  );
}
