import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { requireTestDatabase, truncateAll } from "./helpers";

requireTestDatabase();

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  unstable_cache: (fn: unknown) => fn,
}));

const { db } = await import("@/db");
const { eventDivisions, eventKinds, eventTeams, events, matches, teams } = await import("@/db/schema");
const { eq } = await import("drizzle-orm");
const { inferGroupsForEvent } = await import("@/features/sync/groups-infer-apply");

let eventId = "";
let divisionId = "";
const teamIds: string[] = [];

const at = (day: number, hour: number) => new Date(Date.UTC(2026, 5, 26 + day, hour));

beforeAll(async () => {
  await truncateAll(db);
  await db
    .insert(eventKinds)
    .values([{ slug: "tournament", label: "Tournament", sort: 1 }])
    .onConflictDoNothing();
});

beforeEach(async () => {
  await db.delete(matches);
  await db.delete(eventTeams);
  await db.delete(eventDivisions);
  await db.delete(events);
  await db.delete(teams);
  teamIds.length = 0;
  const [e] = await db
    .insert(events)
    .values({
      slug: "rainier",
      title: "Rainier Challenge",
      kind: "tournament",
      modules: [],
      status: "published",
      visibility: "public",
      locationType: "in_person",
      timezone: "America/Los_Angeles",
      startsAt: at(0, 15),
      endsAt: at(3, 23),
    })
    .returning({ id: events.id });
  eventId = e.id;
  const [d] = await db
    .insert(eventDivisions)
    .values({ eventId, name: "BU12 - B- Silver" })
    .returning({ id: eventDivisions.id });
  divisionId = d.id;
  for (let i = 0; i < 8; i++) {
    const [t] = await db
      .insert(teams)
      .values({ slug: `t${i}`, name: `Team ${i}`, visibility: "public" })
      .returning({ id: teams.id });
    teamIds.push(t.id);
    await db.insert(eventTeams).values({ eventId, teamId: t.id, divisionId });
  }
});

async function game(h: number, a: number, when: Date) {
  await db.insert(matches).values({
    eventId,
    divisionId,
    stage: "group",
    homeTeamId: teamIds[h],
    awayTeamId: teamIds[a],
    kickoffAt: when,
    status: "scheduled",
  });
}

describe("groups read off a pasted schedule", () => {
  it("labels two groups of four, their entries, and the final", async () => {
    // Group A is teams 0–3, group B is 4–7; three placement games on day four.
    const rr = [
      [0, 1, 0, 10],
      [2, 3, 0, 12],
      [0, 2, 1, 10],
      [1, 3, 1, 12],
      [0, 3, 2, 10],
      [1, 2, 2, 12],
    ];
    for (const [h, a, d, hr] of rr) {
      await game(h, a, at(d, hr));
      await game(h + 4, a + 4, at(d, hr + 1));
    }
    await game(2, 6, at(3, 9));
    await game(1, 5, at(3, 9));
    await game(0, 4, at(3, 14));

    const dry = await inferGroupsForEvent(eventId);
    expect(dry.divisions[0].outcome).toBe("grouped");
    expect(dry.gamesLabelled).toBe(0);

    const out = await inferGroupsForEvent(eventId, { apply: true });
    expect(out.gamesLabelled).toBe(15);
    expect(out.entriesLabelled).toBe(8);

    const labelled = await db.query.matches.findMany({ columns: { groupLabel: true } });
    const counts = new Map<string | null, number>();
    for (const m of labelled) counts.set(m.groupLabel, (counts.get(m.groupLabel) ?? 0) + 1);
    expect(counts.get("A")).toBe(6);
    expect(counts.get("B")).toBe(6);
    expect(counts.get("Placement")).toBe(2);
    expect(counts.get("Final")).toBe(1);

    const entries = await db.query.eventTeams.findMany({ columns: { teamId: true, groupLabel: true } });
    const groupOf = new Map(entries.map((e) => [e.teamId, e.groupLabel]));
    expect(groupOf.get(teamIds[0])).toBe("A");
    expect(groupOf.get(teamIds[7])).toBe("B");

    // Running it again changes nothing: the division is already grouped.
    const again = await inferGroupsForEvent(eventId, { apply: true });
    expect(again.divisions[0].outcome).toBe("already");
    expect(again.gamesLabelled).toBe(0);
  });

  it("names a division it cannot read instead of guessing", async () => {
    // Six teams, three games each, no complete round robin anywhere.
    const pool = [
      [0, 1, 0],
      [2, 3, 0],
      [4, 5, 0],
      [3, 4, 1],
      [0, 2, 1],
      [5, 1, 1],
      [1, 3, 2],
      [2, 5, 2],
      [4, 0, 2],
    ];
    for (const [h, a, d] of pool) await game(h, a, at(d, 10));
    const out = await inferGroupsForEvent(eventId, { apply: true });
    expect(out.divisions[0].outcome).toBe("unclear");
    expect(out.gamesLabelled).toBe(0);
    const still = await db.query.matches.findMany({ where: eq(matches.divisionId, divisionId), columns: { groupLabel: true } });
    expect(still.every((m) => m.groupLabel === null)).toBe(true);
  });
});
