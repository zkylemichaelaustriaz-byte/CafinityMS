import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors, shadow } from "@/constants/theme";
import { branchStatusLabel, isBranchOpen } from "@/lib/branchHours";
import type { Branch } from "@/types/models";

/**
 * Location-style branch trigger row (NOT a filter pill). A location icon +
 * descriptive secondary text + chevron make it read as a place selector, so it
 * never looks like the status/category/sort chips elsewhere.
 */
export function BranchSelectorField({
  branch,
  onPress,
  label = "Pickup branch",
  placeholder = "Choose a branch",
  allLabel = "All branches",
  showAll = false,
  compact = false,
  extra,
}: {
  branch: Branch | null;
  onPress: () => void;
  label?: string;
  placeholder?: string;
  allLabel?: string;
  /** When true and branch is null, render the "all branches" name instead of placeholder. */
  showAll?: boolean;
  compact?: boolean;
  extra?: ReactNode;
}) {
  const name = branch ? branch.name : showAll ? allLabel : placeholder;
  const sub = branch
    ? branchStatusLabel(branch)
    : showAll
      ? "Showing every location"
      : "Tap to select a branch";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${name}. Change branch`}
      className={`flex-row items-center rounded-2xl border border-line bg-surface ${
        compact ? "px-3 py-2" : "px-4 py-3"
      }`}
    >
      <View
        className={`items-center justify-center rounded-full bg-surfaceMuted ${
          compact ? "h-8 w-8" : "h-9 w-9"
        }`}
      >
        <Ionicons name="location" size={compact ? 16 : 18} color={Colors.brand} />
      </View>
      <View className="ml-3 flex-1">
        <Text className="text-[11px] font-medium uppercase tracking-wide text-textMuted">
          {label}
        </Text>
        <Text className="text-sm font-bold text-textPrimary" numberOfLines={1}>
          {name}
        </Text>
        {!compact ? (
          <Text className="text-xs text-textSecondary" numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
        {extra ? <View className="mt-0.5">{extra}</View> : null}
      </View>
      <View className="flex-row items-center gap-1">
        {!compact ? <Text className="text-xs font-semibold text-brandPrimary">Change</Text> : null}
        <Ionicons name="chevron-down" size={compact ? 16 : 18} color={Colors.brand} />
      </View>
    </Pressable>
  );
}

function BranchRow({
  title,
  subtitle,
  statusNode,
  selected,
  onPress,
}: {
  title: string;
  subtitle?: string;
  statusNode?: ReactNode;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`flex-row items-center rounded-2xl border px-4 py-3 ${
        selected ? "border-brandPrimary bg-surfaceSelected" : "border-line bg-surface"
      }`}
    >
      <View className="flex-1 pr-3">
        <Text className="text-base font-bold text-textPrimary" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text className="mt-0.5 text-xs text-textSecondary" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        {statusNode ? <View className="mt-1">{statusNode}</View> : null}
      </View>
      {selected ? (
        <Ionicons name="checkmark-circle" size={24} color={Colors.brand} />
      ) : (
        <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
      )}
    </Pressable>
  );
}

/** Open/closed status with an icon + label (never color alone). */
function BranchStatus({ branch }: { branch: Branch }) {
  const open = isBranchOpen(branch.opening_time, branch.closing_time);
  return (
    <View className="flex-row items-center gap-1.5">
      <Ionicons
        name={open ? "ellipse" : "moon-outline"}
        size={open ? 9 : 12}
        color={open ? Colors.success : Colors.textMuted}
      />
      <Text className={`text-xs font-medium ${open ? "text-success" : "text-textMuted"}`}>
        {branchStatusLabel(branch)}
      </Text>
    </View>
  );
}

/**
 * Modal bottom sheet with a searchable vertical branch list. `allowAll` adds an
 * "All branches" row for barista/admin scopes (customers must pick one).
 */
export function BranchPickerSheet({
  visible,
  branches,
  selectedId,
  onSelect,
  onClose,
  allowAll = false,
  title = "Choose a branch",
}: {
  visible: boolean;
  branches: Branch[];
  selectedId: string | null;
  onSelect: (branchId: string | null) => void;
  onClose: () => void;
  allowAll?: boolean;
  title?: string;
}) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return branches;
    return branches.filter(
      (b) =>
        b.name.toLowerCase().includes(q) || (b.address ?? "").toLowerCase().includes(q),
    );
  }, [branches, query]);

  function choose(id: string | null) {
    onSelect(id);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <Pressable
          style={StyleSheet.absoluteFill}
          className="bg-black/50"
          accessibilityLabel="Close branch picker"
          onPress={onClose}
        />
        <View
          style={[shadow.floating, { paddingBottom: insets.bottom + 12, maxHeight: "82%" }]}
          className="rounded-t-[28px] bg-background pt-3"
        >
          <View className="mb-2 h-1 w-10 self-center rounded-full bg-line" />
          <View className="flex-row items-center justify-between px-5 pb-2">
            <Text className="font-display text-xl text-textPrimary">{title}</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={Colors.text} />
            </Pressable>
          </View>

          <View className="mx-5 mb-2 flex-row items-center rounded-2xl border border-line bg-surface px-3">
            <Ionicons name="search" size={18} color={Colors.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search branches"
              placeholderTextColor={Colors.textMuted}
              autoCorrect={false}
              className="flex-1 px-2 py-3 text-base text-textPrimary"
            />
            {query ? (
              <Pressable onPress={() => setQuery("")} hitSlop={10} accessibilityLabel="Clear">
                <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
              </Pressable>
            ) : null}
          </View>

          <ScrollView contentContainerClassName="px-5 pb-4 pt-1 gap-2.5" keyboardShouldPersistTaps="handled">
            {allowAll ? (
              <BranchRow
                title="All branches"
                subtitle="Every location"
                selected={selectedId === null}
                onPress={() => choose(null)}
              />
            ) : null}
            {filtered.map((b) => (
              <BranchRow
                key={b.id}
                title={b.name}
                subtitle={b.address}
                statusNode={<BranchStatus branch={b} />}
                selected={selectedId === b.id}
                onPress={() => choose(b.id)}
              />
            ))}
            {filtered.length === 0 ? (
              <Text className="py-6 text-center text-sm text-textSecondary">
                No branches match “{query.trim()}”.
              </Text>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
