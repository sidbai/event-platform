/**
 * Turning a form's answer about a club into the two columns that record it.
 *
 * `teams.affiliation` and `teams.club_id` are one fact in two columns, held
 * together by a CHECK constraint, so nothing may set one without the other.
 * Working that out in each action would mean three chances to get it wrong;
 * doing it here means the database constraint is never the thing that finds
 * the mistake.
 */

/** The form value meaning "this team is not part of any club". */
export const INDEPENDENT = "independent";

export type Affiliation = {
  affiliation: "unknown" | "club" | "independent";
  clubId: string | null;
};

/** Nobody has said. What an imported team is until someone looks at it. */
export const UNKNOWN: Affiliation = { affiliation: "unknown", clubId: null };

/**
 * Read a club choice, given the clubs that actually exist.
 *
 * An id that is not among them is read as "not said" rather than rejected: the
 * value comes from a form, the column is a foreign key, and a stale option in
 * somebody's open tab should not cost them the rest of what they typed.
 */
export function parseAffiliation(
  value: string | null | undefined,
  clubIds: Iterable<string>,
): Affiliation {
  const v = (value ?? "").trim();
  if (v === "") return UNKNOWN;
  if (v === INDEPENDENT) return { affiliation: "independent", clubId: null };
  const known = clubIds instanceof Set ? clubIds : new Set(clubIds);
  if (known.has(v)) return { affiliation: "club", clubId: v };
  return UNKNOWN;
}

/** The form value that shows a team's current answer. */
export function affiliationValue(team: {
  affiliation: string;
  clubId: string | null;
}): string {
  if (team.affiliation === "independent") return INDEPENDENT;
  return team.clubId ?? "";
}
