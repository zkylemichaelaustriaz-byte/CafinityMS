import type { ReactNode } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { Colors } from "@/constants/theme";

interface HeaderProps {
  title: string;
  right?: ReactNode;
  onBack?: () => void;
}

export function Header({ title, right, onBack }: HeaderProps) {
  const router = useRouter();
  return (
    <View className="flex-row items-center justify-between border-b border-line bg-surface px-3 py-3">
      <Pressable
        onPress={onBack ?? (() => router.back())}
        hitSlop={12}
        className="h-9 w-9 items-center justify-center rounded-full"
      >
        <Ionicons name="chevron-back" size={24} color={Colors.espresso} />
      </Pressable>
      <Text className="flex-1 text-center font-heading text-base text-textPrimary" numberOfLines={1}>
        {title}
      </Text>
      <View className="h-9 w-9 items-center justify-center">{right}</View>
    </View>
  );
}
