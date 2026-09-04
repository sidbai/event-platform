export const COACH_ROLES = [
  { key: "head", label: "Head coach" },
  { key: "assistant", label: "Assistant coach" },
  { key: "director", label: "Director of coaching" },
] as const;

export type CoachRole = (typeof COACH_ROLES)[number]["key"];

export function coachRoleLabel(key: string): string {
  return COACH_ROLES.find((r) => r.key === key)?.label ?? "Coach";
}

export function parseCoachRole(raw: FormDataEntryValue | null): CoachRole | null {
  const v = String(raw ?? "");
  return COACH_ROLES.some((r) => r.key === v) ? (v as CoachRole) : null;
}

/**
 * The rule that keeps this a review of someone's coaching rather than of a
 * person. Shown on the form, and mirrored by a report reason.
 */
export const COACH_REVIEW_RULE =
  "Write about your own experience of this coach's coaching — sessions, communication, how your season went. Not their appearance, their family, or anything you did not see first-hand.";

/** Seasons offered on the review form, newest first. */
export function recentSeasons(now = new Date(), count = 5): string[] {
  // A soccer season spans two calendar years and turns over in the summer.
  const startYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return Array.from({ length: count }, (_, i) => {
    const y = startYear - i;
    return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
  });
}
