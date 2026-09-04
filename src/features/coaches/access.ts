import "server-only";

import { getCurrentUser } from "@/features/auth";

/**
 * Coach entries are community maintained, exactly like clubs: anyone signed in
 * can add or correct one, and coach_edits keeps every version so a bad edit is
 * reversible and attributable. Takes no coach — editing is not per-coach.
 */
export async function canEditCoach(): Promise<boolean> {
  return Boolean(await getCurrentUser());
}
