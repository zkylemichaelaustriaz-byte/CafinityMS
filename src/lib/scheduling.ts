import { formatHour } from "@/lib/branchHours";
import type { Branch } from "@/types/models";

// Centralized scheduling limits — the single place these are defined.
export const SCHEDULE = {
  minLeadMinutes: 30, // earliest a scheduled pickup may be from now
  slotIntervalMinutes: 15, // granularity of selectable times
  maxAdvanceDays: 7, // how far ahead a pickup may be booked
} as const;

export interface PickupSlot {
  iso: string; // exact pickup datetime (ISO)
  label: string; // e.g. "8:15 AM"
}
export interface PickupDay {
  key: string; // yyyy-mm-dd
  date: Date; // start of that day
  label: string; // "Today" / "Tomorrow" / "Mon, Jun 30"
  slots: PickupSlot[];
}

function dayLabel(d: Date, today: Date): string {
  const diff = Math.round((startOfDay(d).getTime() - startOfDay(today).getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return d.toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" });
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseHM(t: string): [number, number] {
  const [h, m] = t.split(":").map(Number);
  return [h || 0, m || 0];
}

/**
 * Valid pickup days/slots for a branch: within opening hours, at the configured
 * interval, no sooner than the minimum lead time, no later than the max horizon.
 * Inactive branches yield no slots. Overnight hours (closing <= opening) are
 * treated as same-day close (kept simple — schema has no per-day closures).
 */
export function generatePickupDays(branch: Branch | null, now: Date = new Date()): PickupDay[] {
  if (!branch || !branch.is_active || !branch.opening_time || !branch.closing_time) return [];

  const [oh, om] = parseHM(branch.opening_time);
  const [ch, cm] = parseHM(branch.closing_time);
  const earliest = now.getTime() + SCHEDULE.minLeadMinutes * 60_000;
  const horizon = now.getTime() + SCHEDULE.maxAdvanceDays * 86_400_000;
  const stepMs = SCHEDULE.slotIntervalMinutes * 60_000;

  const days: PickupDay[] = [];
  for (let d = 0; d <= SCHEDULE.maxAdvanceDays; d++) {
    const base = startOfDay(new Date(now.getTime() + d * 86_400_000));
    const open = new Date(base.getFullYear(), base.getMonth(), base.getDate(), oh, om).getTime();
    let close = new Date(base.getFullYear(), base.getMonth(), base.getDate(), ch, cm).getTime();
    if (close <= open) close += 86_400_000; // overnight: extend to next day

    // First slot boundary at/after the open time and the earliest allowed time.
    const from = Math.max(open, earliest);
    let t = Math.ceil(from / stepMs) * stepMs;
    const slots: PickupSlot[] = [];
    for (; t < close && t <= horizon; t += stepMs) {
      if (t < open) continue;
      slots.push({ iso: new Date(t).toISOString(), label: formatHour(formatClock(new Date(t))) });
    }
    if (slots.length) days.push({ key: ymd(base), date: base, label: dayLabel(base, now), slots });
  }
  return days;
}

function formatClock(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Friendly "Mon, Jun 30 · 8:15 AM" for a scheduled ISO. */
export function formatScheduled(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" });
  return `${date} · ${formatHour(formatClock(d))}`;
}

/** Just the time portion ("8:15 AM") of a scheduled ISO. */
export function formatScheduledTime(iso: string): string {
  return formatHour(formatClock(new Date(iso)));
}

export type SlotPeriod = "morning" | "afternoon" | "evening";
export const PERIOD_ORDER: SlotPeriod[] = ["morning", "afternoon", "evening"];
export const PERIOD_LABEL: Record<SlotPeriod, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
};

/** Bucket a slot into a daypart so the picker can filter by Morning/Afternoon/Evening. */
export function slotPeriod(iso: string): SlotPeriod {
  const h = new Date(iso).getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}
