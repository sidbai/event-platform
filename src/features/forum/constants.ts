export const FORUM_CATEGORIES = [
  "general",
  "looking-for-players",
  "looking-for-teams",
  "coaching",
  "tournaments",
  "logistics",
  "feedback",
] as const;

export type ForumCategory = (typeof FORUM_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<string, string> = {
  general: "General",
  "looking-for-players": "Looking for players",
  "looking-for-teams": "Looking for teams",
  coaching: "Coaching",
  tournaments: "Tournaments",
  logistics: "Fields & logistics",
  feedback: "Site feedback",
};

export type ForumResult = {
  error?: string;
  fieldErrors?: Record<string, string>;
  slug?: string;
};
