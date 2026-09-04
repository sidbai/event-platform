/**
 * The review vocabulary, shared by every subject.
 *
 * Scales differ per subject — a club is judged on six things, a coach on a
 * different five — so everything here takes the subject rather than assuming
 * a club's shape.
 */

export const REVIEW_SUBJECTS = ["club", "coach"] as const;
export type ReviewSubject = (typeof REVIEW_SUBJECTS)[number];

export type Scale = { key: string; label: string; hint?: string };

/** The six scales every club review is scored on, in display order. */
export const CLUB_SCALES = [
  { key: "playerDevelopment", label: "Player Development" },
  { key: "coaching", label: "Coaching" },
  { key: "communication", label: "Communication" },
  { key: "clubCulture", label: "Club Culture" },
  { key: "playingTime", label: "Playing Time" },
  { key: "value", label: "Value" },
] as const satisfies readonly Scale[];

/**
 * Coach scales, deliberately not the club's.
 *
 * "Value" is gone — you don't pay the coach — and so is "Club Culture", which
 * belongs to the club. Every scale here is something a parent on the touchline
 * can actually observe, which is also what keeps a review an account of an
 * experience rather than a verdict on a person.
 */
export const COACH_SCALES = [
  { key: "playerDevelopment", label: "Player Development" },
  { key: "communication", label: "Communication" },
  { key: "organization", label: "Organization", hint: "Sessions, logistics, being on time" },
  { key: "professionalism", label: "Professionalism", hint: "Conduct with players, parents and officials" },
  { key: "playingTime", label: "Playing Time & Selection" },
] as const satisfies readonly Scale[];

export function scalesFor(subject: ReviewSubject): readonly Scale[] {
  return subject === "coach" ? COACH_SCALES : CLUB_SCALES;
}

/** Scale key -> 1-5. Keys depend on the subject, so this stays open. */
export type Ratings = Record<string, number>;

/**
 * How many reviews a subject needs before we publish a score.
 *
 * Below this the reviews still show — one person's account is worth reading —
 * but the number does not, because at n=1 a single unhappy reviewer *is* the
 * subject's public rating. It matters most for a named coach, where that
 * number is a person's reputation, not an organisation's.
 */
export const MIN_REVIEWS_FOR_SCORE = 3;

export function isRated(count: number): boolean {
  return count >= MIN_REVIEWS_FOR_SCORE;
}

/** Mean across the subject's scales. Missing scales count as absent, not 0. */
export function overallOf(subject: ReviewSubject, r: Ratings): number {
  const vals = scalesFor(subject)
    .map((s) => r[s.key])
    .filter((v): v is number => typeof v === "number");
  if (vals.length === 0) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Per-scale averages across many reviews, plus the overall mean. */
export function averageRatings(
  subject: ReviewSubject,
  reviews: Ratings[],
): {
  byScale: Ratings;
  overall: number;
  count: number;
  rated: boolean;
} | null {
  if (reviews.length === 0) return null;

  const byScale: Ratings = {};
  for (const { key } of scalesFor(subject)) {
    byScale[key] =
      reviews.reduce((sum, r) => sum + (r[key] ?? 0), 0) / reviews.length;
  }
  return {
    byScale,
    overall: overallOf(subject, byScale),
    count: reviews.length,
    rated: isRated(reviews.length),
  };
}

/** Clamp anything arriving from a form to a whole 1-5, or null if unusable. */
export function parseRating(raw: FormDataEntryValue | null): number | null {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 5) return null;
  return n;
}

/** Reads every scale a subject needs off a form; null if any is missing. */
export function readRatings(
  subject: ReviewSubject,
  formData: FormData,
): Ratings | null {
  const out: Ratings = {};
  for (const { key } of scalesFor(subject)) {
    const v = parseRating(formData.get(key));
    if (v === null) return null;
    out[key] = v;
  }
  return out;
}

/** Self-declared, and labelled as such — we can't verify it. */
export const REVIEWER_ROLES = [
  { key: "parent", label: "Parent" },
  { key: "player", label: "Player" },
  { key: "coach", label: "Coach" },
] as const;

export type ReviewerRole = (typeof REVIEWER_ROLES)[number]["key"];

export function parseReviewerRole(
  raw: FormDataEntryValue | null,
): ReviewerRole | null {
  const v = String(raw ?? "");
  return REVIEWER_ROLES.some((r) => r.key === v) ? (v as ReviewerRole) : null;
}

export const REPORT_REASONS = [
  "Abusive or offensive",
  "Not true",
  "Not about this club",
  "Spam",
] as const;

/**
 * Coaches are named individuals, so their reports carry a reason clubs don't:
 * the line between reviewing someone's coaching and attacking the person is
 * the whole basis on which this feature is defensible.
 */
export const COACH_REPORT_REASONS = [
  "About the person, not their coaching",
  "Abusive or offensive",
  "Not true",
  "Didn't work with this coach",
  "Spam",
] as const;

export function reportReasonsFor(subject: ReviewSubject): readonly string[] {
  return subject === "coach" ? COACH_REPORT_REASONS : REPORT_REASONS;
}

/**
 * Reports that auto-hide a coach review pending an admin decision.
 *
 * Club reviews are never auto-hidden. For a named person we take it down first
 * and adjudicate second — but it is a hold, not a deletion: the admin queue
 * still shows it, and the same threshold applies whether the review is
 * flattering or damning, so this cannot become a way to bury criticism.
 */
export const COACH_REPORTS_TO_AUTOHIDE = 2;

export type ReviewResult = {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
};
