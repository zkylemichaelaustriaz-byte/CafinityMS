import type { ReactNode } from "react";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";
import { haptics } from "@/lib/haptics";

// Remembers expanded state for the current app session (not persisted to disk).
const sessionState: Record<string, boolean> = {};

/**
 * Progressive-disclosure section: a tappable header (title + optional count) with
 * a chevron that reveals/hides its content. Sections toggle independently (no
 * auto-rotation). Pass `persistKey` to remember the open/closed state across
 * remounts during the session.
 */
export function CollapsibleSection({
  title,
  count,
  defaultOpen = false,
  persistKey,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  persistKey?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(() =>
    persistKey && persistKey in sessionState ? sessionState[persistKey] : defaultOpen,
  );

  function toggle() {
    const next = !open;
    setOpen(next);
    if (persistKey) sessionState[persistKey] = next;
    haptics.selection();
  }

  return (
    <View className="mt-3 px-5">
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}${count != null ? `, ${count}` : ""}, ${open ? "expanded" : "collapsed"}`}
        className="flex-row items-center justify-between py-2.5"
      >
        <View className="flex-row items-center gap-2">
          <Text className="font-heading text-lg text-textPrimary">{title}</Text>
          {count != null && count > 0 ? (
            <View className="min-w-[22px] items-center rounded-full bg-surfaceMuted px-2 py-0.5">
              <Text className="text-xs font-bold text-textSecondary">{count}</Text>
            </View>
          ) : null}
        </View>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={20} color={Colors.textMuted} />
      </Pressable>
      {open ? <View className="pb-1">{children}</View> : null}
    </View>
  );
}
