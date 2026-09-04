import type { Ratings, ReviewerRole } from "@/features/reviews/constants";

export const COACH_TITLE_MAX = 120;
export const COACH_BODY_MAX = 4000;
export const COACH_BODY_MIN = 40;

export type CoachReviewInput = {
  ratings: Ratings | null;
  reviewerRole: ReviewerRole | null;
  season: string;
  recommends: boolean | null;
  title: string;
  body: string;
  /**
   * Present so the rules can say explicitly that they do not gate on these.
   * A squad is around fifteen families, so a team plus a tenure narrows the
   * author far enough that a coach could guess who wrote the review — and a
   * reviewer who suspects that writes nothing at all. An unattributable honest
   * review is worth more than a precise one nobody dares post.
   */
  teamLabel: string;
  yearsWith: number | null;
};

/** Field errors for a coach review, or an empty object if it's good to post. */
export function validateCoachReview(
  input: CoachReviewInput,
): Record<string, string> {
  const e: Record<string, string> = {};

  if (!input.ratings) e.ratings = "Rate every category.";
  if (!input.reviewerRole) e.reviewerRole = "How did you know this coach?";
  // Season and relationship date and frame the review without pointing at a
  // family, so they stay required where team and tenure do not.
  if (!input.season) e.season = "Which season?";
  if (input.recommends === null) e.recommends = "Would you recommend them?";

  if (input.title.length < 4) e.title = "Give it a headline.";
  else if (input.title.length > COACH_TITLE_MAX)
    e.title = "That headline is too long.";

  if (input.body.length < COACH_BODY_MIN)
    e.body = "Say a bit more — what actually happened over the season?";
  else if (input.body.length > COACH_BODY_MAX) e.body = "That's too long.";

  return e;
}
