// Quick-feedback tag catalog. Stored as keys on feedback.tags (text[]); labels
// are resolved here so the DB stays compact and the wording stays editable.

export interface FeedbackTag {
  key: string;
  label: string;
}

export const POSITIVE_TAGS: FeedbackTag[] = [
  { key: "great_taste", label: "Great taste" },
  { key: "fast", label: "Prepared quickly" },
  { key: "accurate", label: "Accurate order" },
  { key: "friendly", label: "Friendly service" },
];

export const ISSUE_TAGS: FeedbackTag[] = [
  { key: "wrong_customization", label: "Incorrect customization" },
  { key: "too_slow", label: "Took too long" },
  { key: "packaging", label: "Packaging issue" },
  { key: "item_quality", label: "Item quality issue" },
];

const ALL: FeedbackTag[] = [...POSITIVE_TAGS, ...ISSUE_TAGS];
const LABELS = new Map(ALL.map((t) => [t.key, t.label]));

export function tagLabel(key: string): string {
  return LABELS.get(key) ?? key;
}

/** Tags offered for a given rating: positive for 4–5, issue-focused for 1–3. */
export function tagsForRating(rating: number): FeedbackTag[] {
  if (rating >= 4) return POSITIVE_TAGS;
  if (rating >= 1) return ISSUE_TAGS;
  return [];
}
