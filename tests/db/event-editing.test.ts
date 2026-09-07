/**
 * Making an event and changing it afterwards, through the real actions.
 *
 * Both paths now share one parser, which is the reason this file exists: the
 * listing path and the running-it path were folded together once already
 * because they were 69% the same code, and an edit form reading the same
 * fields would have been the third copy. Nothing covered submitEvent before,
 * so the extraction was being done to the most important action on the site
 * with no net under it.
 *
 * What is worth pinning is not that the fields round-trip — it is the four
 * things an edit must never touch.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { requireTestDatabase, truncateAll } from "./helpers";

requireTestDatabase();

let signedInUserId: string | null = null;
let adminEmails = "";

vi.mock("@/auth", () => ({
  auth: async () => (signedInUserId ? { user: { id: signedInUserId } } : null),
}));
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  unstable_cache: (fn: unknown) => fn,
}));
// redirect() throws by design; the actions end with one, so the tests catch it.
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));

const { db } = await import("@/db");
const { eventKinds, events, users, venues } = await import("@/db/schema");
const { submitEvent, updateEvent } = await import("@/features/events/actions");
const { eq } = await import("drizzle-orm");

const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.set(k, v);
  return fd;
};

/** The actions redirect on success; this reports where they went. */
async function run(fn: () => Promise<unknown>): Promise<string | { error?: string }> {
  try {
    const out = await fn();
    return (out ?? {}) as { error?: string };
  } catch (e) {
    const m = String(e instanceof Error ? e.message : e).match(/^REDIRECT:(.*)$/);
    if (m) return m[1];
    throw e;
  }
}

async function makeUser(email: string) {
  const [u] = await db.insert(users).values({ email, name: email }).returning({
    id: users.id,
  });
  return u.id;
}

const BASE = {
  runBy: "me",
  kind: "tournament",
  title: "Rain City Cup",
  date: "2026-11-14",
  endDate: "2026-11-15",
  time: "09:00",
  locationType: "in_person",
  venueName: "Marymoor Park",
  venueCity: "Redmond",
  summary: "A weekend of 7v7.",
  ageGroup: "U10–U12",
  visibility: "public",
};

beforeAll(async () => {
  adminEmails = process.env.ADMIN_EMAILS ?? "";
  await truncateAll(db);
  await db
    .insert(eventKinds)
    .values([
      { slug: "tournament", label: "Tournament", sort: 1, defaultModules: ["roster"] },
      { slug: "league", label: "League", sort: 2, defaultModules: [] },
    ])
    .onConflictDoNothing();
});

beforeEach(async () => {
  await truncateAll(db);
  await db
    .insert(eventKinds)
    .values([
      { slug: "tournament", label: "Tournament", sort: 1, defaultModules: ["roster"] },
      { slug: "league", label: "League", sort: 2, defaultModules: [] },
    ])
    .onConflictDoNothing();
  process.env.ADMIN_EMAILS = adminEmails;
});

describe("making an event", () => {
  it("stores what was typed, in the event's own timezone", async () => {
    signedInUserId = await makeUser("organizer@test");
    const where = await run(() => submitEvent({}, form(BASE)));
    expect(where).toBe("/events/rain-city-cup");

    const [row] = await db.select().from(events);
    expect(row.title).toBe("Rain City Cup");
    expect(row.summary).toBe("A weekend of 7v7.");
    // 09:00 Pacific in November is 17:00 UTC. Stored as 09:00Z it would show
    // back to the organizer as 1am.
    expect(row.startsAt?.toISOString()).toBe("2026-11-14T17:00:00.000Z");
    // The end of the last day, so a range covers the day it names.
    expect(row.endsAt?.toISOString()).toBe("2026-11-16T07:59:00.000Z");
    expect(row.organizerId).toBe(signedInUserId);
  });

  it("sends a public tournament from a non-admin to review", async () => {
    signedInUserId = await makeUser("organizer@test");
    await run(() => submitEvent({}, form(BASE)));
    const [row] = await db.select().from(events);
    expect(row.status).toBe("pending");
  });

  it("refuses a listing with no link to go to", async () => {
    signedInUserId = await makeUser("organizer@test");
    const out = await run(() =>
      submitEvent({}, form({ ...BASE, runBy: "someone-else", sourceName: "Starfire" })),
    );
    expect(out).toMatchObject({ fieldErrors: { sourceUrl: expect.any(String) } });
  });
});

describe("editing one", () => {
  async function makeEvent(over: Record<string, string> = {}) {
    signedInUserId = await makeUser(`organizer-${Math.random()}@test`);
    await run(() => submitEvent({}, form({ ...BASE, ...over })));
    const [row] = await db.select().from(events);
    return row;
  }

  it("changes the title and the summary", async () => {
    const before = await makeEvent();
    await run(() =>
      updateEvent(before.slug, {}, form({ ...BASE, title: "Rain City Cup 2026", summary: "Now 9v9." })),
    );

    const [after] = await db.select().from(events);
    expect(after.title).toBe("Rain City Cup 2026");
    expect(after.summary).toBe("Now 9v9.");
  });

  it("keeps the URL when the title changes", async () => {
    // People have the link. A title fixed from "Labour" to "Labor" is not a
    // reason to break every link to it.
    const before = await makeEvent();
    await run(() => updateEvent(before.slug, {}, form({ ...BASE, title: "Something Else" })));

    const [after] = await db.select().from(events);
    expect(after.slug).toBe(before.slug);
  });

  it("does not send a live event back to the review queue", async () => {
    // Pulling a running tournament off the list because its organizer fixed a
    // typo is a worse failure than the spam it would prevent.
    const before = await makeEvent();
    await db.update(events).set({ status: "published" }).where(eq(events.id, before.id));

    await run(() => updateEvent(before.slug, {}, form({ ...BASE, title: "Fixed Typo" })));

    const [after] = await db.select().from(events);
    expect(after.status).toBe("published");
  });

  it("leaves visibility to the control that has the rule for it", async () => {
    const before = await makeEvent({ visibility: "private" });
    await run(() =>
      updateEvent(before.slug, {}, form({ ...BASE, visibility: "public", title: "Edited" })),
    );

    const [after] = await db.select().from(events);
    expect(after.visibility).toBe("private");
    expect(after.title).toBe("Edited");
  });

  it("does not let a listing be turned into an event we run", async () => {
    // Claiming is its own thing, with its own consequences for who owns the
    // page and what it offers. It is not a radio button on an edit form.
    signedInUserId = await makeUser("lister@test");
    await run(() =>
      submitEvent(
        {},
        form({
          ...BASE,
          runBy: "someone-else",
          sourceName: "Starfire Sports",
          sourceUrl: "https://www.starfiresports.com/ldc/",
        }),
      ),
    );
    const [listing] = await db.select().from(events);
    expect(listing.sourceName).toBe("Starfire Sports");

    await run(() => updateEvent(listing.slug, {}, form({ ...BASE, runBy: "me" })));

    const [after] = await db.select().from(events);
    expect(after.sourceName).toBe("Starfire Sports");
    expect(after.organizerId).toBeNull();
  });

  it("refuses somebody who does not manage it", async () => {
    const before = await makeEvent();
    signedInUserId = await makeUser("stranger@test");

    const out = await run(() =>
      updateEvent(before.slug, {}, form({ ...BASE, title: "Hijacked" })),
    );

    expect(out).toMatchObject({ error: expect.stringContaining("can't edit") });
    const [after] = await db.select().from(events);
    expect(after.title).toBe(before.title);
  });

  it("refuses a signed-out visitor", async () => {
    const before = await makeEvent();
    signedInUserId = null;

    await run(() => updateEvent(before.slug, {}, form({ ...BASE, title: "Hijacked" })));

    const [after] = await db.select().from(events);
    expect(after.title).toBe(before.title);
  });

  it("moves the venue when the organizer got it wrong", async () => {
    const before = await makeEvent();
    await run(() =>
      updateEvent(before.slug, {}, form({ ...BASE, venueName: "60 Acres", venueCity: "Redmond" })),
    );

    const [after] = await db.select().from(events);
    const named = await db.select().from(venues).where(eq(venues.id, after.venueId!));
    expect(named[0].name).toBe("60 Acres");
  });
});
