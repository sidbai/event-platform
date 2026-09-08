/**
 * Counting page views, against a real Postgres.
 *
 * The part a unit test cannot reach: the upsert. Two readers opening a page
 * in the same second must both be counted, and a read-then-write would lose
 * one of them — which is exactly the kind of bug that only appears once a
 * page is popular enough for the number to matter.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { requireTestDatabase, truncateAll } from "./helpers";

requireTestDatabase();

const { db } = await import("@/db");
const { eventKinds, events, pageViews } = await import("@/db/schema");
const { recordView, viewsFor, viewsOf } = await import("@/features/views/queries");
const { sql } = await import("drizzle-orm");

async function makeEvent(slug: string) {
  const [event] = await db
    .insert(events)
    .values({
      slug,
      title: slug,
      kind: "tournament",
      modules: [],
      status: "published",
      visibility: "public",
      locationType: "in_person",
      timezone: "America/Los_Angeles",
    })
    .returning({ id: events.id });
  return event.id;
}

beforeAll(async () => {
  await truncateAll(db);
});

beforeEach(async () => {
  await db.execute(sql`truncate table page_views`);
  await truncateAll(db);
  await db
    .insert(eventKinds)
    .values([{ slug: "tournament", label: "Tournament", sort: 1 }])
    .onConflictDoNothing();
});

describe("recordView", () => {
  it("starts at one and counts up", async () => {
    const id = await makeEvent("labor-day-cup");

    expect(await viewsOf("event", id)).toBe(0);
    await recordView("event", id);
    expect(await viewsOf("event", id)).toBe(1);
    await recordView("event", id);
    await recordView("event", id);
    expect(await viewsOf("event", id)).toBe(3);
  });

  it("loses nothing when views arrive together", async () => {
    // The reason this is an upsert. Ten readers reading the same value and
    // writing value + 1 would leave the page on 1.
    const id = await makeEvent("spring-classic");
    await Promise.all(Array.from({ length: 10 }, () => recordView("event", id)));
    expect(await viewsOf("event", id)).toBe(10);
  });

  it("counts each page separately", async () => {
    const a = await makeEvent("a");
    const b = await makeEvent("b");
    await recordView("event", a);
    await recordView("event", a);
    await recordView("event", b);

    expect(await viewsOf("event", a)).toBe(2);
    expect(await viewsOf("event", b)).toBe(1);
  });

  it("keeps the kinds of page apart", async () => {
    // subject_id is a bare uuid with no foreign key, so an id that existed in
    // two tables would otherwise share one counter.
    const id = await makeEvent("shared-id");
    await recordView("event", id);
    await recordView("news_post", id);
    expect(await viewsOf("event", id)).toBe(1);
    expect(await viewsOf("news_post", id)).toBe(1);
  });

  it("stores nothing about who was reading", async () => {
    const id = await makeEvent("private-by-design");
    await recordView("event", id);
    const [row] = await db.select().from(pageViews);
    expect(Object.keys(row).sort()).toEqual([
      "subjectId",
      "subjectType",
      "updatedAt",
      "views",
    ]);
  });
});

describe("viewsFor", () => {
  it("answers for a list in one query, and says nothing about the unread", async () => {
    const a = await makeEvent("read-twice");
    const b = await makeEvent("never-read");
    await recordView("event", a);
    await recordView("event", a);

    const counts = await viewsFor("event", [a, b]);
    expect(counts.get(a)).toBe(2);
    expect(counts.has(b)).toBe(false);
  });

  it("asks nothing when there is nothing to ask about", async () => {
    expect(await viewsFor("event", [])).toEqual(new Map());
  });
});
