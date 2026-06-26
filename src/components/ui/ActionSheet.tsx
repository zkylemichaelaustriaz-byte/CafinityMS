import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors, shadow } from "@/constants/theme";

export interface SheetAction {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
  onPress: () => void;
}

/** Bottom action sheet for secondary/overflow actions. */
export function ActionSheet({
  visible,
  title,
  actions,
  onClose,
}: {
  visible: boolean;
  title?: string;
  actions: SheetAction[];
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <Pressable
          style={StyleSheet.absoluteFill}
          className="bg-black/50"
          accessibilityLabel="Close menu"
          onPress={onClose}
        />
        <View
          style={[shadow.floating, { paddingBottom: insets.bottom + 10 }]}
          className="rounded-t-[28px] bg-background pt-3"
        >
          <View className="mb-1 h-1 w-10 self-center rounded-full bg-line" />
          {title ? (
            <Text className="px-5 py-2 text-center text-sm font-semibold text-textMuted">
              {title}
            </Text>
          ) : null}
          {actions.map((a, i) => (
            <Pressable
              key={a.label}
              onPress={() => {
                onClose();
                a.onPress();
              }}
              accessibilityRole="button"
              className={`mx-3 flex-row items-center gap-3 rounded-2xl px-4 py-3.5 ${i > 0 ? "mt-1" : ""}`}
            >
              {a.icon ? (
                <Ionicons
                  name={a.icon}
                  size={20}
                  color={a.destructive ? Colors.danger : Colors.brand}
                />
              ) : null}
              <Text
                className={`text-base font-semibold ${a.destructive ? "text-danger" : "text-textPrimary"}`}
              >
                {a.label}
              </Text>
            </Pressable>
          ))}
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            className="mx-3 mt-2 items-center rounded-2xl border border-line py-3.5"
          >
            <Text className="text-base font-semibold text-textSecondary">Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
