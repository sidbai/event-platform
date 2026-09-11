/**
 * A team wearing its club's crest, against a real Postgres.
 *
 * The copy is the owner's decision; the arguments against it were the two
 * ways a copy goes stale, and these are the tests that they do not. A crest
 * somebody uploaded for a team is the thing none of it may touch.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { requireTestDatabase, truncateAll } from "./helpers";

requireTestDatabase();

const { db } = await import("@/db");
const { clubs, teams } = await import("@/db/schema");
const { eq } = await import("drizzle-orm");
const { backfillCrests, rewear, wearClubCrest, isClubCrest } = await import(
  "@/features/teams/borrowed-crest"
);

const CLUB_CREST = "https://blob.example/main/clubs/eastside.png";
const OTHER_CLUB = "https://blob.example/main/clubs/crossfire.png";
const OWN_CREST = "https://blob.example/main/teams/our-own.png";

let clubId: string;

const crestOfTeam = async (slug: string) =>
  (await db.query.teams.findFirst({ where: eq(teams.slug, slug), columns: { crestUrl: true } }))!
    .crestUrl;

async function team(slug: string, crestUrl: string | null, club: string | null = clubId) {
  const [row] = await db
    .insert(teams)
    .values({ name: slug, slug, visibility: "public", crestUrl, clubId: club, ...(club ? { affiliation: "club" as const } : {}) })
    .returning({ id: teams.id });
  return row.id;
}

beforeEach(async () => {
  await truncateAll(db);
  const [club] = await db
    .insert(clubs)
    .values({ name: "Eastside FC", slug: "eastside-fc", crestUrl: CLUB_CREST })
    .returning({ id: clubs.id });
  clubId = club.id;
});

describe("isClubCrest", () => {
  it("tells a borrowed crest from an uploaded one by where the file lives", () => {
    // The same test unfile.ts already uses to decide what it may clear.
    expect(isClubCrest(CLUB_CREST)).toBe(true);
    expect(isClubCrest(OWN_CREST)).toBe(false);
    expect(isClubCrest(null)).toBe(false);
  });
});

describe("backfillCrests", () => {
  it("gives a crestless team its club's", async () => {
    await team("bare", null);
    expect(await backfillCrests()).toBe(1);
    expect(await crestOfTeam("bare")).toBe(CLUB_CREST);
  });

  it("leaves a team's own crest alone", async () => {
    await team("ours", OWN_CREST);
    expect(await backfillCrests()).toBe(0);
    expect(await crestOfTeam("ours")).toBe(OWN_CREST);
  });

  it("has nothing to give when the club has none", async () => {
    await db.update(clubs).set({ crestUrl: null }).where(eq(clubs.id, clubId));
    await team("bare", null);
    expect(await backfillCrests()).toBe(0);
    expect(await crestOfTeam("bare")).toBeNull();
  });
});

describe("rewear", () => {
  it("carries a club's new logo to the teams wearing the old one", async () => {
    /*
     * The whole of the argument against copying: a copy that never changes.
     * A club uploading a new logo has to reach the teams that borrowed it.
     */
    await team("borrowed", CLUB_CREST);
    await team("bare", null);
    await team("ours", OWN_CREST);

    const next = "https://blob.example/main/clubs/eastside-2027.png";
    expect(await rewear(clubId, next)).toBe(2);
    expect(await crestOfTeam("borrowed")).toBe(next);
    expect(await crestOfTeam("bare")).toBe(next);
    expect(await crestOfTeam("ours")).toBe(OWN_CREST);
  });

  it("clears them when the club removes its logo", async () => {
    await team("borrowed", CLUB_CREST);
    await rewear(clubId, null);
    expect(await crestOfTeam("borrowed")).toBeNull();
  });
});

describe("wearClubCrest", () => {
  it("replaces another club's crest when a team is re-filed", async () => {
    /*
     * The other way a copy goes stale: nine ALBION teams filed under a club
     * in Portland kept wearing Portland's badge after they were moved.
     */
    const id = await team("moved", OTHER_CLUB);
    expect(await wearClubCrest(id)).toBe(true);
    expect(await crestOfTeam("moved")).toBe(CLUB_CREST);
  });

  it("will not overwrite a crest somebody uploaded for the team", async () => {
    const id = await team("ours", OWN_CREST);
    expect(await wearClubCrest(id)).toBe(false);
    expect(await crestOfTeam("ours")).toBe(OWN_CREST);
  });
});
