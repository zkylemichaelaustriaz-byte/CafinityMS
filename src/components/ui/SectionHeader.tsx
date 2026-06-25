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
      <View className="flex-row items-center gap-2">
        {/* Campaign-themed accent bar. */}
        <View className="h-4 w-1 rounded-full bg-accent" />
        <Text className="font-heading text-lg text-textPrimary">{title}</Text>
      </View>
      {action}
    </View>
  );
}
