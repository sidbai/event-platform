/**
 * Moving a team to the address its name asks for, against a real Postgres.
 *
 * The whole of this is constraints and a redirect: teams.slug is unique, the
 * address it leaves has to keep answering, and a claimed team's address is
 * not ours to change. None of that is visible from a unit test.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { requireTestDatabase, truncateAll } from "./helpers";

requireTestDatabase();

const { db } = await import("@/db");
const { eventTeams, events, teams, users } = await import("@/db/schema");
const { planReaddress, readdress } = await import("@/features/teams/readdress");
const { teamBySoleOldSlug } = await import("@/features/teams/merge");

let eventId: string;

async function team(name: string, slug: string, ownerId?: string) {
  const [row] = await db
    .insert(teams)
    .values({ name, slug, visibility: "public", ...(ownerId ? { ownerId } : {}) })
    .returning({ id: teams.id });
  await db.insert(eventTeams).values({ eventId, teamId: row.id });
  return row.id;
}

const plan = () => planReaddress("league");

beforeEach(async () => {
  await truncateAll(db);
  const [event] = await db
    .insert(events)
    .values({ slug: "league", title: "A League", kind: "league", status: "published" })
    .returning({ id: events.id });
  eventId = event.id;
});

describe("planReaddress", () => {
  it("moves a team whose address stopped matching its name", async () => {
    // Named "Harbor SC" before the gender arrived, renamed afterwards.
    await team("Harbor Soccer Club B13/14", "harbor-sc-7");

    const p = await plan();
    expect(p!.moving).toMatchObject([
      { from: "harbor-sc-7", to: "harbor-soccer-club-b13-14" },
    ]);
  });

  it("leaves a numbered address alone when the name still explains it", async () => {
    /*
     * Two teams can genuinely want one address and the second gets a number.
     * Only an address whose stem is no longer the name's is stale.
     */
    await team("Harbor Soccer Club B13/14", "harbor-soccer-club-b13-14-2");
    expect((await plan())!.moving).toEqual([]);
  });

  it("leaves an address that ends in digits of its own alone", async () => {
    await team("ALBION SC Hawaii B07/08", "albion-sc-hawaii-b07-08");
    expect((await plan())!.moving).toEqual([]);
  });

  it("will not move a team somebody has claimed", async () => {
    const [owner] = await db
      .insert(users)
      .values({ email: "owner@example.test" })
      .returning({ id: users.id });
    await team("Harbor Soccer Club B13/14", "harbor-sc-7", owner.id);

    const p = await plan();
    expect(p!.moving).toEqual([]);
    expect(p!.keeping[0].because).toContain("claimed");
  });
});

describe("readdress", () => {
  it("moves it, and the address it left keeps answering", async () => {
    await team("Harbor Soccer Club B13/14", "harbor-sc-7");
    const moved = await readdress((await plan())!);

    expect(moved).toBe(1);
    const row = await db.query.teams.findFirst({ columns: { slug: true } });
    expect(row!.slug).toBe("harbor-soccer-club-b13-14");
    // What /teams/[slug] asks before it gives up and 404s.
    expect(await teamBySoleOldSlug("harbor-sc-7")).toBe("harbor-soccer-club-b13-14");
  });

  it("takes a free address when the one it wants is held", async () => {
    // Another team already sits at the address this name would make.
    await team("Harbor Soccer Club B13/14", "harbor-soccer-club-b13-14");
    await team("Harbor Soccer Club B13/14", "harbor-sc-7");

    await readdress((await plan())!);
    const slugs = (await db.query.teams.findMany({ columns: { slug: true } })).map(
      (t) => t.slug,
    );
    expect(new Set(slugs).size).toBe(2);
    expect(slugs).toContain("harbor-soccer-club-b13-14");
  });

  it("does nothing twice", async () => {
    await team("Harbor Soccer Club B13/14", "harbor-sc-7");
    await readdress((await plan())!);
    expect((await plan())!.moving).toEqual([]);
  });
});
