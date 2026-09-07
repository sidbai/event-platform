/**
 * What a team may be called.
 *
 * Imported names are whatever a tournament platform published — "XF, U14,
 * B12 - 13, RCL 1, Plackov" — and the coach who claims that team should be
 * able to write it the way people say it. The same rules as creating a team,
 * kept here so both paths cannot drift apart.
 */

export type NameCheck = { ok: true; name: string } | { ok: false; error: string };

export const MIN_NAME = 2;
export const MAX_NAME = 80;

export function checkTeamName(raw: string | null | undefined): NameCheck {
  const name = (raw ?? "").trim().replace(/\s+/g, " ");
  if (name.length < MIN_NAME) return { ok: false, error: "Give the team a name." };
  if (name.length > MAX_NAME) return { ok: false, error: "That name is too long." };
  return { ok: true, name };
}
