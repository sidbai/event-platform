/** The six scales every club review is scored on, in display order. */
export const RATING_CATEGORIES = [
  { key: "playerDevelopment", label: "Player Development" },
  { key: "coaching", label: "Coaching" },
  { key: "communication", label: "Communication" },
  { key: "clubCulture", label: "Club Culture" },
  { key: "playingTime", label: "Playing Time" },
  { key: "value", label: "Value" },
] as const;

export type RatingKey = (typeof RATING_CATEGORIES)[number]["key"];

export type Ratings = Record<RatingKey, number>;

/** Self-declared, and labelled as such — we can't verify it. */
export const REVIEWER_ROLES = [
  { key: "parent", label: "Parent" },
  { key: "player", label: "Player" },
  { key: "coach", label: "Coach" },
] as const;

export type ReviewerRole = (typeof REVIEWER_ROLES)[number]["key"];

export function parseReviewerRole(raw: FormDataEntryValue | null): ReviewerRole | null {
  const v = String(raw ?? "");
  return REVIEWER_ROLES.some((r) => r.key === v) ? (v as ReviewerRole) : null;
}

export const REPORT_REASONS = [
  "Abusive or offensive",
  "Not true",
  "Not about this club",
  "Spam",
] as const;

export type ClubResult = {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
};

/**
 * Mean of the six scales. Reviews are only ever stored with all six present,
 * so an empty list is the only case with no answer.
 */
export function overallOf(r: Ratings): number {
  const vals = RATING_CATEGORIES.map((c) => r[c.key]);
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Per-category averages across many reviews, plus the overall mean. */
export function averageRatings(reviews: Ratings[]): {
  byCategory: Ratings;
  overall: number;
  count: number;
} | null {
  if (reviews.length === 0) return null;

  const byCategory = {} as Ratings;
  for (const { key } of RATING_CATEGORIES) {
    byCategory[key] =
      reviews.reduce((sum, r) => sum + r[key], 0) / reviews.length;
  }
  return {
    byCategory,
    overall: overallOf(byCategory),
    count: reviews.length,
  };
}

/** Clamp anything arriving from a form to a whole 1-5, or null if unusable. */
export function parseRating(raw: FormDataEntryValue | null): number | null {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 5) return null;
  return n;
}
