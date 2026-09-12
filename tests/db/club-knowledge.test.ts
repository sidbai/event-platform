import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { requireTestDatabase, truncateAll } from "./helpers";

requireTestDatabase();

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  unstable_cache: (fn: unknown) => fn,
}));

let viewer: { id: string; email: string } | null = null;
vi.mock("@/features/auth", () => ({
  getCurrentUser: async () => viewer,
  publicName: () => "Someone",
}));
vi.mock("@/features/auth/admin", () => ({ isAdmin: () => false }));
vi.mock("@/features/rate-limit", () => ({ checkRateLimit: async () => ({ ok: true }) }));

const { db } = await import("@/db");
const { clubEdits, clubs, users } = await import("@/db/schema");
const { eq } = await import("drizzle-orm");
const { revertClub, updateClub } = await import("@/features/clubs/actions");
const { clubKnowledge } = await import("@/features/clubs/knowledge/db");

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeAll(async () => {
  await truncateAll(db);
});

beforeEach(async () => {
  await db.delete(clubEdits);
  await db.delete(clubs);
  await db.delete(users);
  const [u] = await db.insert(users).values({ email: "parent@example.com", username: "parent" }).returning({ id: users.id });
  viewer = { id: u.id, email: "parent@example.com" };
  await db.insert(clubs).values({ slug: "eastside-fc", name: "Eastside FC", city: "Issaquah" });
});

describe("the wiki part of a club", () => {
  it("is saved from the form, structured and free, and recorded", async () => {
    const result = await updateClub(
      "eastside-fc",
      {},
      form({
        name: "Eastside FC",
        city: "Issaquah",
        tiers: "ECNL\nECNL RL\nRed\n\nWhite",
        squadMarkers: "Red, White, Blue",
        colours: "tier",
        ageBands: "single-year",
        branches: "Preston, Bellevue",
        about: "- ECNL is the top team at U13–U19\n- Red is the first team at U8–U12",
        sources: "https://www.eastsidefc.org/teams\nnot a link",
      }),
    );
    expect(result).toEqual({ ok: true });

    const club = await db.query.clubs.findFirst({ where: eq(clubs.slug, "eastside-fc") });
    expect(club?.tiers).toEqual(["ECNL", "ECNL RL", "Red", "White"]);
    expect(club?.squadMarkers).toEqual(["Red", "White", "Blue"]);
    expect(club?.colours).toBe("tier");
    expect(club?.branches).toEqual(["Preston", "Bellevue"]);
    expect(club?.about).toContain("Red is the first team");
    // A line that is not a link is not a source.
    expect(club?.sources).toEqual(["https://www.eastsidefc.org/teams"]);

    const history = await db.query.clubEdits.findMany({ where: eq(clubEdits.clubId, club!.id) });
    expect(history).toHaveLength(1);
    expect(history[0].summary).toBe("Edited how the club organises its teams");
    expect(history[0].tiers).toEqual(["ECNL", "ECNL RL", "Red", "White"]);
  });

  it("refuses a colour reading it does not know", async () => {
    await updateClub("eastside-fc", {}, form({ name: "Eastside FC", colours: "purple" }));
    const club = await db.query.clubs.findFirst({ where: eq(clubs.slug, "eastside-fc") });
    expect(club?.colours).toBeNull();
  });

  it("is restored whole by a revert, not just the name", async () => {
    await updateClub("eastside-fc", {}, form({ name: "Eastside FC", tiers: "ECNL\nRed", about: "first" }));
    const [first] = await db.query.clubEdits.findMany({ where: eq(clubEdits.name, "Eastside FC") });
    await updateClub("eastside-fc", {}, form({ name: "Eastside FC", tiers: "Wrong", about: "vandalised" }));
    await revertClub("eastside-fc", first.id);
    const club = await db.query.clubs.findFirst({ where: eq(clubs.slug, "eastside-fc") });
    expect(club?.tiers).toEqual(["ECNL", "Red"]);
    expect(club?.about).toBe("first");
    const history = await db.query.clubEdits.findMany({ where: eq(clubEdits.clubId, club!.id) });
    expect(history).toHaveLength(3);
    expect(history.some((h) => h.summary?.startsWith("Restored the version from"))).toBe(true);
  });

  it("ends the machine's authorship the moment a person edits", async () => {
    await db.update(clubs).set({ knowledgeReadAt: new Date("2026-09-12T00:00:00Z"), tiers: ["ECNL"] }).where(eq(clubs.slug, "eastside-fc"));
    await updateClub("eastside-fc", {}, form({ name: "Eastside FC", tiers: "ECNL\nRed" }));
    const club = await db.query.clubs.findFirst({ where: eq(clubs.slug, "eastside-fc") });
    expect(club?.knowledgeReadAt).toBeNull();
  });

  it("is what the merge prompts read, ahead of the file", async () => {
    await updateClub("eastside-fc", {}, form({ name: "Eastside FC", tiers: "Community Tier", colours: "squad" }));
    const known = await clubKnowledge("eastside-fc");
    expect(known?.tiers).toEqual(["Community Tier"]);
    expect(known?.colours).toBe("squad");
    expect(known?.model).toBe("community");
  });
});
