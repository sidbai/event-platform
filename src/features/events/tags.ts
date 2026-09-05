export type EventTag = {
  label: string;
  /** Prefixed to the label so a tag reads at a glance in a dense list. */
  emoji: string;
  /** brand = what kind of thing it is, warn = needs attention, muted = detail */
  tone: "brand" | "warn" | "muted";
};

type TaggableEvent = {
  kind: string;
  ageGroup?: string | null;
  gender?: string | null;
  format?: string | null;
  level?: string | null;
  needsOpponent?: boolean | null;
  status?: string | null;
  visibility?: string | null;
  hostTeam?: { name: string } | null;
};

const GENDER_LABEL: Record<string, string> = {
  boys: "Boys",
  girls: "Girls",
  coed: "Coed",
};

const GENDER_EMOJI: Record<string, string> = {
  boys: "\u{1F466}",
  girls: "\u{1F467}",
  coed: "\u{1F9D1}",
};

/** One per event kind; anything unknown falls back to the generic marker. */
const KIND_EMOJI: Record<string, string> = {
  game: "\u26BD",
  scrimmage: "\u{1F91D}",
  pickup: "\u{1F945}",
  tournament: "\u{1F3C6}",
  league: "\u{1F4C5}",
  jamboree: "\u{1F3AA}",
  showcase: "\u{1F31F}",
  camp: "\u{1F3D5}\uFE0F",
  tryout: "\u{1F4CB}",
  "watch-party": "\u{1F4FA}",
  meetup: "\u2615",
  custom: "\u2728",
};

/** The chip emoji for an event kind, so a filter chip matches the card's tag. */
export function kindEmoji(kind: string): string {
  return KIND_EMOJI[kind] ?? "\u{1F4CD}";
}

function titleCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * The chips shown for an event, most identifying first.
 *
 * Deliberately skips anything that carries no information: a blank field, or a
 * gender of "coed" when that is already the default assumption for a listing.
 */
export function eventTags(event: TaggableEvent): EventTag[] {
  const tags: EventTag[] = [
    {
      label: titleCase(event.kind.replace(/-/g, " ")),
      emoji: kindEmoji(event.kind),
      tone: "brand",
    },
  ];

  if (event.hostTeam?.name)
    tags.push({ label: event.hostTeam.name, emoji: "\u{1F6E1}\uFE0F", tone: "muted" });
  if (event.ageGroup)
    tags.push({ label: event.ageGroup, emoji: "\u{1F382}", tone: "muted" });

  const gender = event.gender?.toLowerCase();
  if (gender && gender !== "coed")
    tags.push({
      label: GENDER_LABEL[gender] ?? titleCase(gender),
      emoji: GENDER_EMOJI[gender] ?? "\u{1F9D1}",
      tone: "muted",
    });

  if (event.format)
    tags.push({ label: event.format, emoji: "\u{1F465}", tone: "muted" });
  if (event.level)
    tags.push({ label: titleCase(event.level), emoji: "\u{1F3AF}", tone: "muted" });

  if (event.needsOpponent)
    tags.push({ label: "Looking for opponent", emoji: "\u{1F50D}", tone: "warn" });

  // Only ever set on events the viewer is already allowed to see, so this is a
  // reminder to the organizer rather than a leak.
  if (event.visibility && event.visibility !== "public")
    tags.push({
      label: titleCase(event.visibility),
      emoji: event.visibility === "private" ? "\u{1F512}" : "\u{1F517}",
      tone: "muted",
    });

  if (event.status === "completed")
    tags.push({ label: "Final results", emoji: "\u{1F3C1}", tone: "muted" });
  if (event.status === "cancelled")
    tags.push({ label: "Cancelled", emoji: "\u26D4", tone: "warn" });

  return tags;
}
