/**
 * Filing teams under clubs, against a real Postgres.
 *
 * The whole design rests on a CHECK constraint — a team is affiliated to a
 * club exactly when it has one — and a constraint is not a thing a pure test
 * can see. These prove the database refuses the halfway states, so the queue
 * can trust that "unknown" means nobody has looked rather than somebody
 * having written half an answer.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { requireTestDatabase, truncateAll } from "./helpers";

requireTestDatabase();

const { db } = await import("@/db");
const { clubAliases, clubEdits, clubs, eventTeams, events, teams, users } =
  await import("@/db/schema");
const { linkTeamsToClub, setIndependent } = await import("@/features/clubs/link");
const { planUnfile, unfileTeams } = await import("@/features/clubs/unfile");
const { createClubRow } = await import("@/features/clubs/create");
const { eq } = await import("drizzle-orm");

async function makeClub(slug: string, name: string) {
  const [c] = await db
    .insert(clubs)
    .values({ slug, name })
    .returning({ id: clubs.id });
  return c.id;
}

async function makeTeam(slug: string, name: string) {
  const [t] = await db
    .insert(teams)
    .values({ slug, name, visibility: "private" })
    .returning({ id: teams.id });
  return t.id;
}

const teamRow = async (id: string) =>
  db.query.teams.findFirst({
    where: eq(teams.id, id),
    columns: { affiliation: true, clubId: true },
  });

beforeAll(async () => {
  await truncateAll(db);
});

beforeEach(async () => {
  await db.delete(clubEdits);
  await db.delete(clubAliases);
  await db.delete(users);
  await db.delete(eventTeams);
  await db.delete(events);
  await db.delete(teams);
  await db.delete(clubs);
});

describe("the affiliation constraint", () => {
  it("starts every imported team as nobody's", async () => {
    // What a connector creates. The queue depends on this default.
    const id = await makeTeam("xf-bu14", "XF BU14");
    expect(await teamRow(id)).toEqual({ affiliation: "unknown", clubId: null });
  });

  it("refuses a club id without the affiliation to match", async () => {
    const club = await makeClub("crossfire-premier", "Crossfire Premier");
    const id = await makeTeam("xf-bu14", "XF BU14");
    await expect(
      db.update(teams).set({ clubId: club }).where(eq(teams.id, id)),
    ).rejects.toThrow();
  });

  it("refuses an affiliation with no club behind it", async () => {
    const id = await makeTeam("xf-bu14", "XF BU14");
    await expect(
      db.update(teams).set({ affiliation: "club" }).where(eq(teams.id, id)),
    ).rejects.toThrow();
  });

  it("refuses a club id on a team said to have no club", async () => {
    const club = await makeClub("crossfire-premier", "Crossfire Premier");
    const id = await makeTeam("kjc-side", "King Juan Cup side");
    await expect(
      db
        .update(teams)
        .set({ affiliation: "independent", clubId: club })
        .where(eq(teams.id, id)),
    ).rejects.toThrow();
  });
});

describe("linkTeamsToClub", () => {
  it("files the teams and remembers the name that matched", async () => {
    const club = await makeClub("crossfire-premier", "Crossfire Premier");
    const a = await makeTeam("xf-bu14", "XF, U14, B12 - 13, RCL 1, Plackov");
    const b = await makeTeam("xf-gu12", "XF GU12 ECNL");

    const out = await linkTeamsToClub(club, "XF", [a, b], null);
    expect(out).toEqual({ linked: 2, alias: "xf" });
    expect(await teamRow(a)).toEqual({ affiliation: "club", clubId: club });

    // The alias is the point: without it the next sync asks again.
    const saved = await db.query.clubAliases.findFirst({
      where: eq(clubAliases.alias, "xf"),
    });
    expect(saved?.clubId).toBe(club);
  });

  it("moves an alias when an admin corrects it", async () => {
    const wrong = await makeClub("seattle-celtic", "Seattle Celtic");
    const right = await makeClub("seattle-united", "Seattle United");
    const t = await makeTeam("su-b16", "SU B16 South White");

    await linkTeamsToClub(wrong, "su", [t], null);
    await linkTeamsToClub(right, "su", [t], null);

    const saved = await db.query.clubAliases.findFirst({
      where: eq(clubAliases.alias, "su"),
    });
    expect(saved?.clubId).toBe(right);
    expect((await teamRow(t))?.clubId).toBe(right);
  });

  it("files teams even when the key normalises to nothing", async () => {
    // A key of punctuation is no alias, but the teams were still confirmed.
    const club = await makeClub("valor-soccer", "Valor Soccer");
    const t = await makeTeam("valor-b14", "Valor B14");
    const out = await linkTeamsToClub(club, "—", [t], null);
    expect(out.alias).toBeNull();
    expect((await teamRow(t))?.clubId).toBe(club);
  });

  it("does nothing at all for an empty list", async () => {
    const club = await makeClub("valor-soccer", "Valor Soccer");
    expect(await linkTeamsToClub(club, "valor", [], null)).toEqual({
      linked: 0,
      alias: null,
    });
    expect(await db.query.clubAliases.findFirst()).toBeUndefined();
  });
});

describe("setIndependent", () => {
  it("marks a team formed outside any club", async () => {
    // The King Juan Cup case, and the reason affiliation exists at all.
    const t = await makeTeam("kjc-side", "King Juan Cup side");
    expect(await setIndependent([t])).toBe(1);
    expect(await teamRow(t)).toEqual({ affiliation: "independent", clubId: null });
  });

  it("takes a team back out of a club it was wrongly filed under", async () => {
    const club = await makeClub("crossfire-premier", "Crossfire Premier");
    const t = await makeTeam("kjc-side", "King Juan Cup side");
    await linkTeamsToClub(club, "crossfire", [t], null);

    await setIndependent([t]);
    // Both columns move together or the constraint rejects the write.
    expect(await teamRow(t)).toEqual({ affiliation: "independent", clubId: null });
  });
});

describe("unfiling a team from the wrong club", () => {
  /*
   * "lake" reached only Lake Washington Premier FC, so Lake Chelan FC's teams
   * were filed under it — and the canonical rename then wrote that club's
   * name over their own. Both halves have to come back.
   */
  async function importedAs(teamId: string, sourceName: string | null) {
    const [e] = await db
      .insert(events)
      .values({
        slug: `e-${teamId.slice(0, 8)}`,
        kind: "tournament",
        title: "A cup",
        startsAt: new Date(),
      })
      .returning({ id: events.id });
    await db.insert(eventTeams).values({ eventId: e.id, teamId, sourceName });
  }

  it("puts back the name the team was imported under", async () => {
    const club = await makeClub("lake-washington-premier-fc", "Lake Washington Premier FC");
    const t = await makeTeam("lwpfc-b08-09-lake-chelan", "Lake Chelan FC BU18/19");
    await importedAs(t, "Lake Chelan FC BU18/19");
    await linkTeamsToClub(club, "lake", [t], null);
    await db
      .update(teams)
      .set({ name: "Lake Washington Premier FC B08/09 Lake Chelan" })
      .where(eq(teams.id, t));

    const plan = await planUnfile("lake-washington-premier-fc", "%Lake Chelan%");
    expect(plan?.teams).toHaveLength(1);
    expect(plan?.teams[0].restored).toBe("Lake Chelan FC BU18/19");

    expect(await unfileTeams(plan!)).toBe(1);
    const row = await db.query.teams.findFirst({ where: eq(teams.id, t) });
    expect(row?.name).toBe("Lake Chelan FC BU18/19");
    // Both columns move together or the constraint rejects the write.
    expect(row?.affiliation).toBe("unknown");
    expect(row?.clubId).toBeNull();
  });

  it("keeps the name when nothing recorded what it was imported as", async () => {
    // Guessing it back would be the rename run in reverse, and the rename
    // removed those words rather than keeping them.
    const club = await makeClub("lake-washington-premier-fc", "Lake Washington Premier FC");
    const t = await makeTeam("lwpfc-lake-hills-orcas", "Lake Hills Orcas, GU11, Kerr");
    await importedAs(t, null);
    await linkTeamsToClub(club, "lake", [t], null);
    await db
      .update(teams)
      .set({ name: "Lake Washington Premier FC G15/16 Lake Hills Orcas Kerr" })
      .where(eq(teams.id, t));

    const plan = await planUnfile("lake-washington-premier-fc", "%Lake Hills%");
    expect(plan?.teams[0].restored).toBeNull();

    await unfileTeams(plan!);
    const row = await db.query.teams.findFirst({ where: eq(teams.id, t) });
    expect(row?.name).toBe("Lake Washington Premier FC G15/16 Lake Hills Orcas Kerr");
    expect(row?.affiliation).toBe("unknown");
  });

  it("leaves the club's own teams where they are", async () => {
    const club = await makeClub("lake-washington-premier-fc", "Lake Washington Premier FC");
    const theirs = await makeTeam("lwpfc-b13-piranhas", "Lake Washington Premier FC B13 Piranhas");
    await linkTeamsToClub(club, "lakewashington", [theirs], null);

    const plan = await planUnfile("lake-washington-premier-fc", "%Lake Chelan%");
    expect(plan?.teams).toHaveLength(0);
    expect(await unfileTeams(plan!)).toBe(0);
    expect((await teamRow(theirs))?.clubId).toBe(club);
  });

  it("says so rather than throwing when the club is not there", async () => {
    expect(await planUnfile("no-such-club", "%anything%")).toBeNull();
  });
});

/**
 * Adding a club from the queue.
 *
 * The action that wraps this is admin-gated and takes a FormData, so what is
 * worth proving here is the row it leaves behind: a unique slug, and a first
 * history entry, because a club with neither is unreachable or unrevertable.
 */
describe("createClubRow", () => {
  async function anyUser() {
    const [u] = await db
      .insert(users)
      .values({ email: `a${Date.now()}@example.com`, displayName: "k" })
      .returning({ id: users.id });
    return u.id;
  }

  it("slugs the name and writes the first history row", async () => {
    const by = await anyUser();
    const club = await createClubRow({ name: "Sparta Tacoma" }, by);
    expect(club.slug).toBe("sparta-tacoma");

    const row = await db.query.clubs.findFirst({ where: eq(clubs.id, club.id) });
    expect(row?.name).toBe("Sparta Tacoma");
    expect(row?.createdBy).toBe(by);

    // Without this there is nothing to revert a later edit to.
    const history = await db.query.clubEdits.findMany({
      where: eq(clubEdits.clubId, club.id),
    });
    expect(history).toHaveLength(1);
    expect(history[0].summary).toBe("Added the club");
  });

  it("does not hand two clubs the same slug", async () => {
    const by = await anyUser();
    const a = await createClubRow({ name: "Three Rivers SC" }, by);
    const b = await createClubRow({ name: "Three Rivers SC" }, by);
    expect(a.slug).toBe("three-rivers-sc");
    expect(b.slug).toBe("three-rivers-sc-2");
  });

  it("still gives a name of pure punctuation something to live at", async () => {
    const by = await anyUser();
    const club = await createClubRow({ name: "— —" }, by);
    expect(club.slug.length).toBeGreaterThan(0);
  });

  it("files teams under a club it has just added", async () => {
    // The whole flow the queue button performs, minus the FormData.
    const by = await anyUser();
    const a = await makeTeam("sparta-b14", "Sparta Tacoma - B14/15 Red EA");
    const b = await makeTeam("sparta-g12", "Sparta Tacoma - GU12 Red");

    const club = await createClubRow({ name: "Sparta Tacoma" }, by);
    const out = await linkTeamsToClub(club.id, "spartatacoma", [a, b], by);

    expect(out).toEqual({ linked: 2, alias: "spartatacoma" });
    expect(await teamRow(a)).toEqual({ affiliation: "club", clubId: club.id });
    const saved = await db.query.clubAliases.findFirst({
      where: eq(clubAliases.alias, "spartatacoma"),
    });
    expect(saved?.clubId).toBe(club.id);
  });
});
