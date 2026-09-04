export const NEWS_CATEGORIES = [
  { key: "news", label: "News", emoji: "📰" },
  { key: "recap", label: "Recaps", emoji: "🏆" },
  { key: "guide", label: "Guides", emoji: "🧭" },
  { key: "announcement", label: "Announcements", emoji: "📣" },
] as const;

export type NewsCategory = (typeof NEWS_CATEGORIES)[number]["key"];

export function categoryLabel(key: string): string {
  return NEWS_CATEGORIES.find((c) => c.key === key)?.label ?? "News";
}

export function categoryEmoji(key: string): string {
  return NEWS_CATEGORIES.find((c) => c.key === key)?.emoji ?? "📰";
}

export function parseCategory(raw: unknown): NewsCategory | null {
  const v = String(raw ?? "");
  return NEWS_CATEGORIES.some((c) => c.key === v) ? (v as NewsCategory) : null;
}

export type NewsResult = {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
};

/**
 * Rough read time, shown on the index.
 *
 * 200 wpm is the usual desk-reading figure. Always at least a minute — "0 min
 * read" is worse than a small overestimate.
 */
export function readingMinutes(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
