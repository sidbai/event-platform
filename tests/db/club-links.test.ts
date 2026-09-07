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
const { clubAliases, clubs, teams } = await import("@/db/schema");
const { linkTeamsToClub, setIndependent } = await import("@/features/clubs/link");
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
  await db.delete(clubAliases);
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
