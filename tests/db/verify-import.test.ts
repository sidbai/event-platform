/**
 * The checks that say whether an import landed, against a real Postgres.
 *
 * All of this is SQL — array containment, a regex against a slug, a join back
 * to the division a team was entered in — and none of it can be seen from a
 * unit test. The version these replace was a throwaway script that pulled the
 * whole teams table and compared it in memory; doing that a dozen times in an
 * evening exhausted the database's transfer allowance and took the site down.
 *
 * Each case here is a fault that actually happened, reduced to the smallest
 * rows that produce it.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { requireTestDatabase, truncateAll } from "./helpers";

requireTestDatabase();

const { db } = await import("@/db");
const { eventDivisions, eventTeams, events, matches, teams } = await import(
  "@/db/schema"
);
const { verifyEvent } = await import("@/features/sync/verify");
const { eq } = await import("drizzle-orm");

let eventId: string;
let divisionId: string;

async function makeEvent() {
  const [event] = await db
    .insert(events)
    .values({
      slug: "league",
      title: "A League",
      kind: "league",
      status: "published",
      visibility: "public",
    })
    .returning({ id: events.id });
  const [division] = await db
    .insert(eventDivisions)
    .values({ eventId: event.id, name: "U13", birthYears: [] })
    .returning({ id: eventDivisions.id });
  return { eventId: event.id, divisionId: division.id };
}

async function makeTeam(name: string, slug: string, birthYears: number[], clubId?: string) {
  const [team] = await db
    .insert(teams)
    .values({ name, slug, birthYears, visibility: "public", ...(clubId ? { clubId } : {}) })
    .returning({ id: teams.id });
  await db.insert(eventTeams).values({ eventId, teamId: team.id, divisionId });
  return team.id;
}

const findingFor = async (key: string) => {
  const report = await verifyEvent("league");
  return report!.findings.find((f) => f.key === key)!;
};

beforeEach(async () => {
  await truncateAll(db);
  ({ eventId, divisionId } = await makeEvent());
});

describe("verifyEvent", () => {
  it("finds no fault when there is none", async () => {
    const home = await makeTeam("Harbor B13/14", "harbor-b13-14", [2013, 2014]);
    const away = await makeTeam("Celtic B13/14", "celtic-b13-14", [2013, 2014]);
    await db.insert(matches).values({
      eventId,
      divisionId,
      homeTeamId: home,
      awayTeamId: away,
      kickoffAt: new Date("2026-09-12T16:00:00Z"),
    });

    const report = await verifyEvent("league");
    expect(report!.fixtures).toBe(1);
    // Faults only. These teams have no club, which this reports and does not
    // call wrong — a directory does not hold every club in the country.
    expect(
      report!.findings.filter((f) => f.count > 0 && f.severity === "wrong"),
    ).toEqual([]);
  });

  it("counts a single year inside a band as the same age group", async () => {
    /*
     * A club that names a single-year side — "Seattle Celtic B14" — against a
     * two-year band containing it is naming a team within that age group.
     * Reading those as different is what made this check unreadable.
     */
    const home = await makeTeam("Harbor B13/14", "harbor-b13-14", [2013, 2014]);
    const away = await makeTeam("Celtic B13", "celtic-b13", [2013]);
    await db.insert(matches).values({ eventId, divisionId, homeTeamId: home, awayTeamId: away });

    expect((await findingFor("cohorts")).count).toBe(0);
  });

  it("reads a fixture between two different bands, without calling it a fault", async () => {
    // Crossfire enter a U7 side in the Sports Affinity U8 flight every season.
    const home = await makeTeam("XF B19/20", "xf-b19-20", [2019, 2020]);
    const away = await makeTeam("PacNW B18/19", "pacnw-b18-19", [2018, 2019]);
    await db.insert(matches).values({ eventId, divisionId, homeTeamId: home, awayTeamId: away });

    const finding = await findingFor("cohorts");
    expect(finding.count).toBe(1);
    expect(finding.severity).toBe("look");
  });

  it("catches a fixture filed under a division its team is not in", async () => {
    /*
     * The Elite Academy fault: a club's U13 side bound to its U14 side, so the
     * second entry was dropped and its fixtures kept pointing at the other age
     * group's row. 344 of 928 fixtures.
     */
    const home = await makeTeam("Harbor B13/14", "harbor-b13-14", [2013, 2014]);
    const away = await makeTeam("Celtic B13/14", "celtic-b13-14", [2013, 2014]);
    const [other] = await db
      .insert(eventDivisions)
      .values({ eventId, name: "U14", birthYears: [] })
      .returning({ id: eventDivisions.id });
    await db.insert(matches).values({
      eventId,
      divisionId: other.id,
      homeTeamId: home,
      awayTeamId: away,
    });

    const finding = await findingFor("divisions");
    expect(finding.count).toBe(1);
    expect(finding.severity).toBe("wrong");
  });

  it("does not read a knockout slot as a missing team", async () => {
    // "Winner of A1" is a fixture that knows what it is waiting for.
    const home = await makeTeam("Harbor B13/14", "harbor-b13-14", [2013, 2014]);
    await db.insert(matches).values({
      eventId,
      divisionId,
      homeTeamId: home,
      awayPlaceholder: "Winner of A1",
    });

    expect((await findingFor("incomplete")).count).toBe(0);
  });

  it("catches a side that is neither a team nor waiting for one", async () => {
    const home = await makeTeam("Harbor B13/14", "harbor-b13-14", [2013, 2014]);
    await db.insert(matches).values({ eventId, divisionId, homeTeamId: home });

    expect((await findingFor("incomplete")).count).toBe(1);
  });

  it("catches two teams under one name", async () => {
    // Seven ages of Harbor SC, all called "Harbor SC".
    await makeTeam("Harbor SC", "harbor-sc", [2013, 2014]);
    await makeTeam("Harbor SC", "harbor-sc-2", [2012, 2013]);

    const finding = await findingFor("sharing");
    expect(finding.count).toBe(1);
    expect(finding.examples[0]).toContain("Harbor SC");
  });

  it("catches a bracket slot read as a team", async () => {
    // Sports Affinity writes "A11" in the team column until a club is assigned.
    await makeTeam("A11", "a11", [2015, 2016]);

    expect((await findingFor("slots")).count).toBe(1);
  });

  it("catches an address that no longer comes from the name", async () => {
    // /teams/harbor-sc-7 for "Harbor Soccer Club B13/14" — named before the
    // gender was known, renamed afterwards, address left behind.
    await makeTeam("Harbor Soccer Club B13/14", "harbor-sc-7", [2013, 2014]);

    const finding = await findingFor("addresses");
    expect(finding.count).toBe(1);
    expect(finding.severity).toBe("look");
  });

  it("leaves an address alone when the name explains it", async () => {
    // A cohort ending in digits is not a numbered fallback.
    await makeTeam("ALBION SC Hawaii B07/08", "albion-sc-hawaii-b07-08", [2007, 2008]);

    expect((await findingFor("addresses")).count).toBe(0);
  });
});

describe("fixtures outside the event's own dates", () => {
  it("notices a year somebody typed wrong", async () => {
    /*
     * The Regional Club League publishes one on "Friday, January 30, 2026",
     * in the middle of a season running September 2026 to May 2027. Read
     * faithfully, because a connector correcting somebody's data is a
     * connector inventing it — but a fixture in the past with no score reads
     * as a game that was played and never filled in, and nothing else here
     * would ever notice.
     */
    await db
      .update(events)
      .set({ startsAt: new Date("2026-09-12"), endsAt: new Date("2027-05-31") })
      .where(eq(events.slug, "league"));
    const home = await makeTeam("Harbor B13/14", "harbor-b13-14", [2013, 2014]);
    const away = await makeTeam("Celtic B13/14", "celtic-b13-14", [2013, 2014]);
    await db.insert(matches).values([
      {
        eventId,
        divisionId,
        homeTeamId: home,
        awayTeamId: away,
        kickoffAt: new Date("2026-10-03T16:00:00Z"),
      },
      {
        eventId,
        divisionId,
        homeTeamId: home,
        awayTeamId: away,
        kickoffAt: new Date("2026-01-30T08:00:00Z"),
      },
    ]);

    const finding = await findingFor("season");
    expect(finding.count).toBe(1);
    expect(finding.severity).toBe("look");
    expect(finding.examples[0]).toContain("2026-01-30");
  });

  it("allows a day either side, for a kick-off in another zone", async () => {
    await db
      .update(events)
      .set({ startsAt: new Date("2026-09-12"), endsAt: new Date("2027-05-31") })
      .where(eq(events.slug, "league"));
    const home = await makeTeam("Harbor B13/14", "harbor-b13-14", [2013, 2014]);
    await db.insert(matches).values({
      eventId,
      divisionId,
      homeTeamId: home,
      kickoffAt: new Date("2026-09-12T03:00:00Z"),
      awayPlaceholder: "Winner of A1",
    });
    expect((await findingFor("season")).count).toBe(0);
  });
});
