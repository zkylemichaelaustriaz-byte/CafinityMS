import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/ui/Button";
import { Colors } from "@/constants/theme";
import { haptics } from "@/lib/haptics";
import {
  PERIOD_LABEL,
  PERIOD_ORDER,
  slotPeriod,
  type PickupDay,
  type SlotPeriod,
} from "@/lib/scheduling";

const COLLAPSED_SLOT_COUNT = 8;

/**
 * Compact two-step (date → time) pickup picker. Replaces the long inline slot
 * list with a focused bottom sheet: pick a day, narrow by daypart, then choose a
 * time. Only valid in-hours slots are passed in (built by generatePickupDays),
 * so an invalid time can never be selected here.
 */
export function SchedulePickupSheet({
  visible,
  days,
  branchName,
  initialIso,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  days: PickupDay[];
  branchName: string;
  initialIso: string | null;
  onClose: () => void;
  onConfirm: (iso: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [dayKey, setDayKey] = useState<string | null>(null);
  const [period, setPeriod] = useState<SlotPeriod | null>(null);
  const [iso, setIso] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const day = useMemo(
    () => days.find((d) => d.key === dayKey) ?? days[0] ?? null,
    [days, dayKey],
  );

  // The dayparts that actually have slots on the selected day (only show these).
  const periods = useMemo<SlotPeriod[]>(() => {
    if (!day) return [];
    const present = new Set(day.slots.map((s) => slotPeriod(s.iso)));
    return PERIOD_ORDER.filter((p) => present.has(p));
  }, [day]);

  const filtered = useMemo(
    () => (day && period ? day.slots.filter((s) => slotPeriod(s.iso) === period) : day?.slots ?? []),
    [day, period],
  );

  // Smart defaults whenever the sheet opens: jump to the previously chosen slot,
  // else the soonest available day + its first daypart.
  useEffect(() => {
    if (!visible) return;
    const startDay = (initialIso && days.find((d) => d.slots.some((s) => s.iso === initialIso)))
      || days[0]
      || null;
    setDayKey(startDay?.key ?? null);
    const startIso = initialIso && startDay?.slots.some((s) => s.iso === initialIso) ? initialIso : null;
    setIso(startIso);
    setPeriod(startIso ? slotPeriod(startIso) : null);
    setShowAll(false);
  }, [visible, initialIso, days]);

  // Re-validate the chosen time when the day changes: drop a now-invalid slot.
  function selectDay(key: string) {
    setDayKey(key);
    setPeriod(null);
    setShowAll(false);
    setIso((cur) => {
      const d = days.find((x) => x.key === key);
      return cur && d?.slots.some((s) => s.iso === cur) ? cur : null;
    });
    haptics.selection();
  }

  function selectPeriod(p: SlotPeriod) {
    setPeriod((cur) => (cur === p ? null : p));
    setShowAll(false);
    haptics.selection();
  }

  const visibleSlots = showAll ? filtered : filtered.slice(0, COLLAPSED_SLOT_COUNT);
  const hiddenCount = filtered.length - visibleSlots.length;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/40" onPress={onClose} accessibilityLabel="Close">
        <Pressable
          // Stop backdrop taps from closing when interacting with the sheet body.
          onPress={() => {}}
          style={{ paddingBottom: insets.bottom + 16 }}
          className="rounded-t-3xl bg-surface px-5 pt-3"
        >
          <View className="mb-3 items-center">
            <View className="h-1.5 w-10 rounded-full bg-line" />
          </View>

          <View className="mb-1 flex-row items-center justify-between">
            <Text className="font-heading text-lg text-textPrimary">Schedule pickup</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={Colors.textMuted} />
            </Pressable>
          </View>
          <Text className="mb-3 text-xs text-textSecondary">
            Choose a date and time at {branchName}.
          </Text>

          {/* Step 1 — date strip */}
          <Text className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-textMuted">
            Date
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2 pb-1"
          >
            {days.map((d) => {
              const on = day?.key === d.key;
              return (
                <Pressable
                  key={d.key}
                  onPress={() => selectDay(d.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  className={`h-10 justify-center rounded-full px-4 ${
                    on ? "bg-brandPrimary" : "border border-line bg-surface"
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${on ? "text-white" : "text-textSecondary"}`}
                  >
                    {d.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Step 2 — daypart filter (only those with slots) */}
          {periods.length > 1 ? (
            <View className="mt-4 flex-row gap-2">
              {periods.map((p) => {
                const on = period === p;
                return (
                  <Pressable
                    key={p}
                    onPress={() => selectPeriod(p)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    className={`flex-1 items-center rounded-xl border py-2 ${
                      on ? "border-brandPrimary bg-accent-100" : "border-line bg-surface"
                    }`}
                  >
                    <Text
                      className={`text-xs font-bold ${on ? "text-brandPrimary" : "text-textSecondary"}`}
                    >
                      {PERIOD_LABEL[p]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {/* Step 2 — time slots */}
          <Text className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-wide text-textMuted">
            Time
          </Text>
          <ScrollView style={{ maxHeight: 200 }} showsVerticalScrollIndicator={false}>
            <View className="flex-row flex-wrap gap-2">
              {visibleSlots.map((s) => {
                const on = iso === s.iso;
                return (
                  <Pressable
                    key={s.iso}
                    onPress={() => {
                      setIso(s.iso);
                      haptics.selection();
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    className={`rounded-full px-4 py-2 ${
                      on ? "bg-brandPrimary" : "border border-line bg-surface"
                    }`}
                  >
                    <Text
                      className={`text-sm font-semibold ${on ? "text-white" : "text-textSecondary"}`}
                    >
                      {s.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {hiddenCount > 0 ? (
              <Pressable onPress={() => setShowAll(true)} className="mt-3 items-center py-1">
                <Text className="text-sm font-semibold text-brandPrimary">
                  View all times ({filtered.length})
                </Text>
              </Pressable>
            ) : null}
          </ScrollView>

          <View className="mt-4">
            <Button
              label={iso ? "Confirm pickup time" : "Select a time"}
              onPress={() => iso && onConfirm(iso)}
              disabled={!iso}
              haptic="light"
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
