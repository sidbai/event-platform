/**
 * Who may bring a schedule into an event.
 *
 * The rule this pins down was inconsistent in a way nobody would have found
 * by reading it: the create form imported whatever files came with it, so the
 * person listing a tournament could import at that moment — and then, five
 * minutes later, the same person with the same files was refused, because a
 * listing has no organizer and the paste box asked for an admin.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { requireTestDatabase, truncateAll } from "./helpers";

requireTestDatabase();

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  unstable_cache: (fn: unknown) => fn,
}));

let viewer: { id: string; email: string } | null = null;
let admin = false;

vi.mock("@/features/auth", () => ({
  getCurrentUser: async () => viewer,
  publicName: () => "Someone",
}));
vi.mock("@/features/auth/admin", () => ({ isAdmin: () => admin }));

const { db } = await import("@/db");
const { eventKinds, events, users } = await import("@/db/schema");
const { canImportSchedule, canManageEvent } = await import(
  "@/features/events/can-manage"
);

async function makeUser(email: string) {
  const [row] = await db
    .insert(users)
    .values({ email, name: email.split("@")[0], username: email.split("@")[0] })
    .returning({ id: users.id });
  return row.id;
}

/** A listing: somebody else runs it, so there is no organizer. */
async function makeListing(listedBy: string | null) {
  const [event] = await db
    .insert(events)
    .values({
      slug: "someone-elses-cup",
      title: "Someone Else's Cup",
      kind: "tournament",
      modules: [],
      status: "published",
      visibility: "public",
      locationType: "in_person",
      timezone: "America/Los_Angeles",
      organizerId: null,
      listedBy,
    })
    .returning({ id: events.id });
  return event.id;
}

beforeAll(async () => {
  await truncateAll(db);
  await db
    .insert(eventKinds)
    .values([{ slug: "tournament", label: "Tournament", sort: 1 }])
    .onConflictDoNothing();
});

beforeEach(async () => {
  await truncateAll(db);
  await db
    .insert(eventKinds)
    .values([{ slug: "tournament", label: "Tournament", sort: 1 }])
    .onConflictDoNothing();
  viewer = null;
  admin = false;
});

describe("the person who listed the event", () => {
  it("may bring in its schedule", async () => {
    const lister = await makeUser("lister@example.com");
    const id = await makeListing(lister);
    viewer = { id: lister, email: "lister@example.com" };

    expect(await canImportSchedule({ id })).toBe(true);
  });

  it("still may not manage the event itself", async () => {
    /*
     * The narrowness is the point. Listing somebody else's tournament is
     * contributing information about it, not acquiring it: the dates, the
     * visibility and taking it down stay with an admin.
     */
    const lister = await makeUser("lister@example.com");
    const id = await makeListing(lister);
    viewer = { id: lister, email: "lister@example.com" };

    expect(await canManageEvent({ id })).toBe(false);
  });
});

describe("everybody else", () => {
  it("refuses a signed-in stranger", async () => {
    const lister = await makeUser("lister@example.com");
    const id = await makeListing(lister);
    viewer = { id: await makeUser("stranger@example.com"), email: "s@example.com" };

    expect(await canImportSchedule({ id })).toBe(false);
  });

  it("refuses somebody with no account", async () => {
    const id = await makeListing(await makeUser("lister@example.com"));
    viewer = null;

    expect(await canImportSchedule({ id })).toBe(false);
  });

  it("lets an admin in, as everywhere else", async () => {
    const id = await makeListing(await makeUser("lister@example.com"));
    viewer = { id: await makeUser("admin@example.com"), email: "a@example.com" };
    admin = true;

    expect(await canImportSchedule({ id })).toBe(true);
  });

  it("refuses a listing nobody claims, to a stranger", async () => {
    // listedBy is null on anything seeded or imported by a script, and a null
    // must never match a null.
    const id = await makeListing(null);
    viewer = { id: await makeUser("stranger@example.com"), email: "s@example.com" };

    expect(await canImportSchedule({ id })).toBe(false);
  });
});
