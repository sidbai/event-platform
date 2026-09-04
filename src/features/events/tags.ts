export type EventTag = {
  label: string;
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
    { label: titleCase(event.kind.replace(/-/g, " ")), tone: "brand" },
  ];

  if (event.hostTeam?.name)
    tags.push({ label: event.hostTeam.name, tone: "muted" });
  if (event.ageGroup) tags.push({ label: event.ageGroup, tone: "muted" });

  const gender = event.gender?.toLowerCase();
  if (gender && gender !== "coed")
    tags.push({ label: GENDER_LABEL[gender] ?? titleCase(gender), tone: "muted" });

  if (event.format) tags.push({ label: event.format, tone: "muted" });
  if (event.level) tags.push({ label: titleCase(event.level), tone: "muted" });

  if (event.needsOpponent)
    tags.push({ label: "Looking for opponent", tone: "warn" });

  // Only ever set on events the viewer is already allowed to see, so this is a
  // reminder to the organizer rather than a leak.
  if (event.visibility && event.visibility !== "public")
    tags.push({ label: titleCase(event.visibility), tone: "muted" });

  if (event.status === "completed")
    tags.push({ label: "Final results", tone: "muted" });
  if (event.status === "cancelled")
    tags.push({ label: "Cancelled", tone: "warn" });

  return tags;
}
