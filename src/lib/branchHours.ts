// Shared branch open/closed helpers (used by the branch selector + picker).

export function isBranchOpen(opening: string, closing: string): boolean {
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const [oh, om] = opening.split(":").map(Number);
  const [ch, cm] = closing.split(":").map(Number);
  return cur >= oh * 60 + om && cur <= ch * 60 + cm;
}

export function formatHour(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, "0")} ${ap}`;
}

/** Short status sentence, e.g. "Open now" / "Closed · opens 8:00 AM". */
export function branchStatusLabel(b: { opening_time: string; closing_time: string }): string {
  return isBranchOpen(b.opening_time, b.closing_time)
    ? "Open now"
    : `Closed · opens ${formatHour(b.opening_time)}`;
}
