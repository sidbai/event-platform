import { cache } from "react";

import { followedEvents } from "@/features/events/follow-queries";
import { followedTeams, lastResults } from "@/features/teams/follow-queries";

/**
 * What one person follows, read once per request.
 *
 * The header's drawer shows it on every page and the front page shows it
 * beside the feed; on the front page that would be the same three queries
 * twice, so both go through this and React's request cache hands the second
 * caller the first one's answer.
 */
export const followsOf = cache(async (userId: string) => {
  const teams = await followedTeams(userId);
  const [rows, events] = await Promise.all([
    lastResults(teams.map((t) => t.id)),
    followedEvents(userId),
  ]);
  return { teams, last: new Map(rows.map((r) => [r.teamId, r])), events };
});
