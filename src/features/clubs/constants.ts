/**
 * Club-specific review vocabulary. Everything generic lives in
 * @/features/reviews/constants, shared with coach reviews.
 */
export {
  CLUB_SCALES as RATING_CATEGORIES,
  MIN_REVIEWS_FOR_SCORE,
  REPORT_REASONS,
  REVIEWER_ROLES,
  averageRatings,
  isRated,
  overallOf,
  parseRating,
  parseReviewerRole,
  type Ratings,
  type ReviewerRole,
} from "@/features/reviews/constants";

export type ClubResult = {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
};
