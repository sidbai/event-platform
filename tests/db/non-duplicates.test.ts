/**
 * Saying two teams are different, and having it stick.
 *
 * Merging was irreversible and dismissing did not exist, so a pair somebody
 * had already judged came back after every import — the queue could only
 * ever shrink by merging, never by reading. These are the cases that make a
 * "no" worth the click.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { requireTestDatabase, truncateAll } from "./helpers";

requireTestDatabase();

const { db } = await import("@/db");
const { clubs, teamNonDuplicates, teams } = await import("@/db/schema");
const { pairKey, recordNonDuplicate, dismissedPairs } = await import(
  "@/features/teams/non-duplicates"
);
const { proposedTeamMatches } = await import("@/features/teams/merge-queries");

async function makeClub() {
  const [c] = await db
    .insert(clubs)
    .values({ slug: "crossfire-premier", name: "Crossfire Premier" })
    .returning({ id: clubs.id });
  return c.id;
}

async function makeTeam(slug: string, name: string, clubId: string) {
  const [t] = await db
    .insert(teams)
    .values({
      slug,
      name,
      visibility: "private",
      clubId,
      affiliation: "club",
      gender: "boys",
      birthYears: [2013, 2014],
    })
    .returning({ id: teams.id });
  return t.id;
}

beforeAll(async () => {
  await truncateAll(db);
});
beforeEach(async () => {
  await db.delete(teamNonDuplicates);
  await db.delete(teams);
  await db.delete(clubs);
});

describe("pairKey", () => {
  it("names a pair the same way whichever order it arrives in", () => {
    // The rules might offer A beside B today and B beside A once one of them
    // gains a match and the ordering changes.
    expect(pairKey("b", "a")).toEqual(["a", "b"]);
    expect(pairKey("a", "b")).toEqual(["a", "b"]);
  });
});

describe("recordNonDuplicate", () => {
  it("remembers a pair once, however often it is dismissed", async () => {
    const club = await makeClub();
    const a = await makeTeam("xf-white-sharks", "XF White Sharks 2013", club);
    const b = await makeTeam("xf-sharks-white", "XF Sharks White 2013", club);

    await recordNonDuplicate(a, b, null);
    await recordNonDuplicate(b, a, null);

    expect(await db.select().from(teamNonDuplicates)).toHaveLength(1);
    const [x, y] = pairKey(a, b);
    expect(await dismissedPairs()).toEqual(new Set([`${x}:${y}`]));
  });
});

describe("the proposals queue", () => {
  it("stops offering a pair somebody has ruled out", async () => {
    const club = await makeClub();
    const a = await makeTeam("xf-white-sharks", "XF White Sharks 2013", club);
    const b = await makeTeam("xf-sharks-white", "XF Sharks White 2013", club);

    // Reordered words, same club, same cohort: exactly what the matcher is
    // for, and exactly what a person may know is two different sides.
    expect(await proposedTeamMatches()).toHaveLength(1);

    await recordNonDuplicate(a, b, null);
    expect(await proposedTeamMatches()).toEqual([]);
  });

  it("still offers a different pair from the same club", async () => {
    const club = await makeClub();
    const a = await makeTeam("xf-white-sharks", "XF White Sharks 2013", club);
    const b = await makeTeam("xf-sharks-white", "XF Sharks White 2013", club);
    const c = await makeTeam("xf-blue-jays", "XF Blue Jays 2013", club);
    const d = await makeTeam("xf-jays-blue", "XF Jays Blue 2013", club);

    await recordNonDuplicate(a, b, null);
    const left = await proposedTeamMatches();
    const ids = left.flatMap((p) => [p.a.id, p.b.id]);
    expect(ids).toContain(c);
    expect(ids).toContain(d);
    expect(ids).not.toContain(a);
  });
});
