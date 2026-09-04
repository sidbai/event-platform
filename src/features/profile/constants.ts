export const PROFILE_TAGS = [
  "player",
  "coach",
  "team-manager",
  "organizer",
  "referee",
  "parent",
  "fan",
] as const;

export type ProfileTag = (typeof PROFILE_TAGS)[number];

export const TAG_LABELS: Record<string, string> = {
  player: "Player",
  coach: "Coach",
  "team-manager": "Team manager",
  organizer: "Event organizer",
  referee: "Referee",
  parent: "Parent",
  fan: "Fan",
};

export type ProfileResult = {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
};
