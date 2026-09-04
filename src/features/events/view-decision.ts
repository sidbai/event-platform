export type ViewableEvent = {
  id: string;
  status: string;
  visibility: string;
  organizerId: string | null;
  hostTeamId?: string | null;
};

/**
 * "allow" / "deny" outright, or "check-access" when the answer depends on the
 * guest list or the host team's roster. Kept free of I/O so the access rules
 * can be tested directly.
 *
 * `status` gates work-in-progress — a pending submission belongs to its
 * organizer alone. `visibility` gates audience. Both must pass. Note that
 * `unlisted` deliberately allows anyone holding the link: it means "not
 * advertised", not "secret". Only `private` needs a lookup.
 */
export function viewDecision(
  event: ViewableEvent,
  userId: string | null,
  admin: boolean,
): "allow" | "deny" | "check-access" {
  const mine = !!userId && event.organizerId === userId;
  if (mine || admin) return "allow";

  if (
    event.status === "pending" ||
    event.status === "cancelled" ||
    event.status === "draft"
  ) {
    return "deny";
  }

  if (event.visibility === "public" || event.visibility === "unlisted")
    return "allow";

  return userId ? "check-access" : "deny";
}
