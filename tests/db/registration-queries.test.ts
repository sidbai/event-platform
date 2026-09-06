/**
 * The registration query layer, against a real Postgres.
 *
 * Openness is where the league flow either works or quietly does the wrong
 * thing: a window that has closed, a division that is full, a count of
 * accepted entries that has to come back from a join. The arithmetic is unit
 * tested in openness.ts; what is tested here is that the rows feeding it are
 * the right rows.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { requireTestDatabase, truncateAll } from "./helpers";

requireTestDatabase();

const { db } = await import("@/db");
const { eventDivisions, eventKinds, eventRegistrations, events, teams } = await import(
  "@/db/schema"
);
const { divisionsForRegistration, pendingEntriesForTeam, registrationsForEvent } =
  await import("@/features/registration/queries");

const NOW = new Date("2026-09-05T12:00:00Z");
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

beforeAll(async () => {
  await truncateAll(db);
  await db
    .insert(eventKinds)
    .values([{ slug: "league", label: "League", sort: 1 }])
    .onConflictDoNothing();
});

beforeEach(async () => {
  await db.delete(events);
  await db.delete(teams);
});

async function makeLeague() {
  const [event] = await db
    .insert(events)
    .values({
      slug: "wpl-fall",
      title: "WPL Fall",
      kind: "league",
      modules: [],
      status: "published",
      visibility: "public",
      locationType: "in_person",
      timezone: "America/Los_Angeles",
      startsAt: days(7),
      endsAt: days(70),
    })
    .returning({ id: events.id });
  return event.id;
}

async function makeDivision(
  eventId: string,
  over: Partial<typeof eventDivisions.$inferInsert> & { name: string },
) {
  const [d] = await db
    .insert(eventDivisions)
    .values({ eventId, birthYears: [], ...over })
    .returning({ id: eventDivisions.id });
  return d.id;
}

async function enter(
  eventId: string,
  divisionId: string,
  name: string,
  status: "requested" | "accepted" = "accepted",
) {
  const [team] = await db
    .insert(teams)
    .values({ slug: name.toLowerCase().replace(/\W+/g, "-"), name, visibility: "public" })
    .returning({ id: teams.id });
  await db
    .insert(eventRegistrations)
    .values({ eventId, divisionId, teamId: team.id, status });
  return team.id;
}

describe("divisionsForRegistration", () => {
  it("reports a division with no bounds as open", async () => {
    const eventId = await makeLeague();
    await makeDivision(eventId, { name: "Copa U13" });

    const [d] = await divisionsForRegistration(eventId, NOW);
    expect(d.openness).toEqual({ open: true, spotsLeft: null });
  });

  it("counts only accepted entries against capacity", async () => {
    // A pending request has not been given a place. Counting it would make a
    // division full of maybes.
    const eventId = await makeLeague();
    const divisionId = await makeDivision(eventId, { name: "N1 U13", capacity: 2 });
    await enter(eventId, divisionId, "Eagleclaw", "accepted");
    await enter(eventId, divisionId, "Seattle Celtic", "requested");

    const [d] = await divisionsForRegistration(eventId, NOW);
    expect(d.acceptedCount).toBe(1);
    expect(d.openness).toEqual({ open: true, spotsLeft: 1 });
  });

  it("closes a division once its places are taken", async () => {
    const eventId = await makeLeague();
    const divisionId = await makeDivision(eventId, { name: "N1 U13", capacity: 2 });
    await enter(eventId, divisionId, "Eagleclaw");
    await enter(eventId, divisionId, "Northlake");

    const [d] = await divisionsForRegistration(eventId, NOW);
    expect(d.openness).toEqual({ open: false, reason: "full", spotsLeft: 0 });
  });

  it("honours a closing date that has passed", async () => {
    const eventId = await makeLeague();
    await makeDivision(eventId, {
      name: "N1 U13",
      registrationClosesAt: days(-8),
    });

    const [d] = await divisionsForRegistration(eventId, NOW);
    expect(d.openness).toEqual({ open: false, reason: "closed", spotsLeft: 0 });
  });

  it("does not let one division's entries count against another", async () => {
    // The join that would be easy to get wrong: entries are keyed by division,
    // and a capacity check that grouped by event would close every division as
    // soon as one filled.
    const eventId = await makeLeague();
    const n1 = await makeDivision(eventId, { name: "N1 U13", capacity: 1 });
    const copa = await makeDivision(eventId, { name: "Copa U13", capacity: 1 });
    await enter(eventId, n1, "Eagleclaw");

    const rows = await divisionsForRegistration(eventId, NOW);
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
    expect(byName["N1 U13"].openness.open).toBe(false);
    expect(byName["Copa U13"].openness.open).toBe(true);
    expect(byName["Copa U13"].acceptedCount).toBe(0);
    expect(copa).toBeTruthy();
  });

  it("carries the fields the setup page edits", async () => {
    const eventId = await makeLeague();
    await makeDivision(eventId, {
      name: "N1 U13",
      birthYears: [2013, 2014],
      format: "11v11",
      rosterMin: 11,
      rosterMax: 22,
      feeCents: 125000,
    });

    const [d] = await divisionsForRegistration(eventId, NOW);
    expect(d.birthYears).toEqual([2013, 2014]);
    expect(d.format).toBe("11v11");
    expect(d.rosterMin).toBe(11);
    expect(d.rosterMax).toBe(22);
    expect(d.feeCents).toBe(125000);
  });
});

describe("registrationsForEvent", () => {
  it("brings back the team and division a request names", async () => {
    const eventId = await makeLeague();
    const divisionId = await makeDivision(eventId, { name: "N1 U13" });
    await enter(eventId, divisionId, "Eagleclaw FC B2014", "requested");

    const [r] = await registrationsForEvent(eventId);
    expect(r.team?.name).toBe("Eagleclaw FC B2014");
    expect(r.division?.name).toBe("N1 U13");
    expect(r.status).toBe("requested");
  });
});

describe("pendingEntriesForTeam", () => {
  it("lists what a team has entered but not been decided on", async () => {
    // The team page builds its list from event_teams, which only exists once
    // an organizer accepts — so without this a team that just entered reads
    // "No events yet" at the moment it is most likely to look.
    const eventId = await makeLeague();
    const divisionId = await makeDivision(eventId, { name: "N1 U13" });
    const teamId = await enter(eventId, divisionId, "Eagleclaw", "requested");

    const rows = await pendingEntriesForTeam(teamId);
    expect(rows).toHaveLength(1);
    expect(rows[0].event?.title).toBe("WPL Fall");
    expect(rows[0].division?.name).toBe("N1 U13");
  });

  it("leaves out accepted entries, which already show as participation", async () => {
    const eventId = await makeLeague();
    const divisionId = await makeDivision(eventId, { name: "N1 U13" });
    const teamId = await enter(eventId, divisionId, "Eagleclaw", "accepted");

    expect(await pendingEntriesForTeam(teamId)).toEqual([]);
  });

  it("has nothing for a team that has entered nothing", async () => {
    const eventId = await makeLeague();
    const divisionId = await makeDivision(eventId, { name: "N1 U13" });
    await enter(eventId, divisionId, "Someone Else", "requested");

    const [other] = await db.select().from(teams);
    expect(await pendingEntriesForTeam(other.id)).toHaveLength(1);
  });
});
