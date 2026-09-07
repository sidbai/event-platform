/**
 * The queue a model writes into, against a real Postgres.
 *
 * The parsing of its answer is tested separately and purely; what needs a
 * database is what happens to a suggestion afterwards — when the team it
 * names has since been merged away, when the same pair is suggested twice,
 * and when somebody has already said no.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { requireTestDatabase, truncateAll } from "./helpers";

requireTestDatabase();

const { db } = await import("@/db");
const { teamMatchSuggestions, teams } = await import("@/db/schema");
const { openSuggestions } = await import("@/features/teams/suggest/run");
const { mergeTeams } = await import("@/features/teams/merge");
const { eq } = await import("drizzle-orm");

async function makeTeam(slug: string, name: string) {
  const [t] = await db
    .insert(teams)
    .values({ slug, name, visibility: "private" })
    .returning({ id: teams.id });
  return t.id;
}

const suggest = (newTeamId: string, existingTeamId: string, over = {}) =>
  db
    .insert(teamMatchSuggestions)
    .values({
      newTeamId,
      existingTeamId,
      confidence: "high",
      why: "Junior programme of the same club.",
      model: "openai/gpt-4o-mini",
      ...over,
    })
    .onConflictDoNothing();

beforeAll(async () => {
  await truncateAll(db);
});
beforeEach(async () => {
  await db.delete(teamMatchSuggestions);
  await db.delete(teams);
});

describe("openSuggestions", () => {
  it("carries the names, since ids are not a question anyone can answer", async () => {
    const a = await makeTeam("little-warriors-b15-b", "Little Warriors B15 B");
    const b = await makeTeam("warriors-b14-15-ea", "Warriors B14/15 EA");
    await suggest(a, b);

    const [row] = await openSuggestions();
    expect(row).toMatchObject({
      newTeamName: "Little Warriors B15 B",
      existingTeamName: "Warriors B14/15 EA",
      confidence: "high",
      model: "openai/gpt-4o-mini",
    });
  });

  it("drops a suggestion whose team has since been merged away", async () => {
    /*
     * Two admins, or one admin and a script: the pair gets merged by hand
     * before anybody reads the suggestion, and the row it names is gone.
     * Showing it would offer a merge of a team that no longer exists.
     */
    const a = await makeTeam("dupe", "Dupe FC");
    const b = await makeTeam("keeper", "Keeper FC");
    await suggest(a, b);
    await mergeTeams(b, [a]);

    expect(await openSuggestions()).toEqual([]);
  });

  it("shows nothing that has been answered", async () => {
    const a = await makeTeam("a", "A FC");
    const b = await makeTeam("b", "B FC");
    await suggest(a, b, { dismissedAt: new Date() });
    expect(await openSuggestions()).toEqual([]);

    await db.delete(teamMatchSuggestions);
    await suggest(a, b, { acceptedAt: new Date() });
    expect(await openSuggestions()).toEqual([]);
  });

  it("keeps one standing suggestion per pair, however often it is asked", async () => {
    // A second run must update the queue, not pile onto it.
    const a = await makeTeam("a", "A FC");
    const b = await makeTeam("b", "B FC");
    await suggest(a, b);
    await suggest(a, b, { why: "again" });

    const rows = await db
      .select({ id: teamMatchSuggestions.id })
      .from(teamMatchSuggestions)
      .where(eq(teamMatchSuggestions.newTeamId, a));
    expect(rows).toHaveLength(1);
  });
});
