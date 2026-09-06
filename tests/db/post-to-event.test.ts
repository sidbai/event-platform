/**
 * Turning a community post into an event.
 *
 * Written because I changed this action's timezone handling without ever
 * running it. It read the kickoff with `new Date("2027-06-05T09:00")`, which
 * means whatever zone the process happens to be in — Seattle on a laptop, UTC
 * on Vercel — so a 9am game typed by a parent was stored as 9am UTC and shown
 * back to them as 2am. The fix was one line and entirely unverified.
 *
 * The timezone assertion below is the reason this file exists. It is worth
 * knowing that it cannot fail on a machine set to Seattle: the wrong code and
 * the right code agree there. It fails in CI, which runs UTC, which is also
 * where production runs.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { requireTestDatabase, truncateAll } from "./helpers";

requireTestDatabase();

let signedInUserId: string | null = null;

vi.mock("@/auth", () => ({
  auth: async () => (signedInUserId ? { user: { id: signedInUserId } } : null),
}));
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  unstable_cache: (fn: unknown) => fn,
}));

const { db } = await import("@/db");
const { discussions, eventKinds, events, forumPosts, users, venues } = await import(
  "@/db/schema"
);
const { convertPostToEvent } = await import("@/features/forum/actions");
const { eq } = await import("drizzle-orm");

const SEATTLE = "America/Los_Angeles";

const conversion = (over: Record<string, string> = {}) => {
  const fd = new FormData();
  fd.set("kind", "pickup");
  fd.set("title", "Saturday 5v5 at Marymoor");
  fd.set("locationType", "in_person");
  fd.set("date", "2027-06-05");
  fd.set("time", "09:00");
  fd.set("venueName", "Marymoor Park");
  for (const [k, v] of Object.entries(over)) fd.set(k, v);
  return fd;
};

/**
 * Convert the way the form does.
 *
 * A successful conversion ends in redirect(), which Next signals by throwing,
 * so a returned object means something was rejected.
 */
async function convert(slug: string, fd: FormData) {
  try {
    const result = await convertPostToEvent(slug, {}, fd);
    return { converted: false, result };
  } catch (e) {
    const digest = (e as { digest?: unknown })?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      return { converted: true, result: {} as Awaited<ReturnType<typeof convertPostToEvent>> };
    }
    throw e;
  }
}

async function makeUser(email: string) {
  const [u] = await db.insert(users).values({ email, name: email }).returning({ id: users.id });
  return u.id;
}

async function makePost(authorId: string, withThread = true) {
  const [post] = await db
    .insert(forumPosts)
    .values({
      slug: "anyone-for-5v5-saturday",
      title: "Anyone for 5v5 Saturday?",
      body: "Looking for a few more for a friendly at Marymoor.",
      category: "looking-for-players",
      authorId,
    })
    .returning({ id: forumPosts.id });
  if (withThread) {
    await db
      .insert(discussions)
      .values({ subjectType: "forum_post", subjectId: post.id });
  }
  return post.id;
}

beforeAll(async () => {
  await truncateAll(db);
  await db.delete(forumPosts);
  await db
    .insert(eventKinds)
    .values([{ slug: "pickup", label: "Pickup", defaultModules: [], sort: 1 }])
    .onConflictDoNothing();
});

beforeEach(async () => {
  await db.delete(discussions);
  await db.delete(forumPosts);
  await truncateAll(db);
  signedInUserId = null;
});

describe("who may convert a post", () => {
  it("refuses when nobody is signed in", async () => {
    const author = await makeUser("author@test");
    await makePost(author);

    const res = await convert("anyone-for-5v5-saturday", conversion());
    expect(res.result.error).toMatch(/sign in/i);
    expect(await db.select().from(events)).toHaveLength(0);
  });

  it("refuses someone who did not write it", async () => {
    const author = await makeUser("author@test");
    await makePost(author);
    signedInUserId = await makeUser("stranger@test");

    const res = await convert("anyone-for-5v5-saturday", conversion());
    expect(res.result.error).toMatch(/only the author/i);
    expect(await db.select().from(events)).toHaveLength(0);
  });

  it("lets the author do it", async () => {
    const author = await makeUser("author@test");
    await makePost(author);
    signedInUserId = author;

    expect((await convert("anyone-for-5v5-saturday", conversion())).converted).toBe(true);
    expect(await db.select().from(events)).toHaveLength(1);
  });

  it("refuses a post that is already an event", async () => {
    const author = await makeUser("author@test");
    await makePost(author);
    signedInUserId = author;

    await convert("anyone-for-5v5-saturday", conversion());
    const again = await convert("anyone-for-5v5-saturday", conversion());
    expect(again.result.error).toMatch(/already an event/i);
    expect(await db.select().from(events)).toHaveLength(1);
  });
});

describe("the kickoff time", () => {
  it("is read in the event's zone, not the process's", async () => {
    // 9am in Seattle on 5 June 2027 is 16:00 UTC. Read as a bare local string
    // on a UTC server this is stored as 09:00 UTC and shown back as 2am.
    const author = await makeUser("author@test");
    await makePost(author);
    signedInUserId = author;

    await convert("anyone-for-5v5-saturday", conversion());

    const [event] = await db.select().from(events);
    expect(event.startsAt?.toISOString()).toBe("2027-06-05T16:00:00.000Z");
    expect(
      new Intl.DateTimeFormat("en-US", {
        timeZone: SEATTLE,
        hour: "numeric",
        minute: "2-digit",
      }).format(event.startsAt!),
    ).toBe("9:00 AM");
    expect(event.timezone).toBe(SEATTLE);
  });

  it("takes midnight when no time was given", async () => {
    const author = await makeUser("author@test");
    await makePost(author);
    signedInUserId = author;

    const fd = conversion();
    fd.set("time", "");
    await convert("anyone-for-5v5-saturday", fd);

    const [event] = await db.select().from(events);
    // Midnight in Seattle is 07:00 UTC in June.
    expect(event.startsAt?.toISOString()).toBe("2027-06-05T07:00:00.000Z");
  });
});

describe("what the conversion leaves behind", () => {
  async function convertOne() {
    const author = await makeUser("author@test");
    const postId = await makePost(author);
    signedInUserId = author;
    await convert("anyone-for-5v5-saturday", conversion());
    const [event] = await db.select().from(events);
    return { postId, event };
  }

  it("moves the thread to the event rather than stranding it", async () => {
    // The replies are what made the post worth converting; leaving them on a
    // post nobody will look at again loses the conversation.
    const { event } = await convertOne();

    const rows = await db.select().from(discussions);
    expect(rows).toHaveLength(1);
    expect(rows[0].subjectType).toBe("event");
    expect(rows[0].subjectId).toBe(event.id);
  });

  it("points the post at the event it became", async () => {
    const { postId, event } = await convertOne();
    const [post] = await db.select().from(forumPosts).where(eq(forumPosts.id, postId));
    expect(post.convertedEventId).toBe(event.id);
  });

  it("carries the title, kind and venue over", async () => {
    const { event } = await convertOne();
    expect(event.title).toBe("Saturday 5v5 at Marymoor");
    expect(event.kind).toBe("pickup");
    expect(event.status).toBe("published");

    const [venue] = await db.select().from(venues);
    expect(venue.name).toBe("Marymoor Park");
    expect(event.venueId).toBe(venue.id);
  });

  it("falls back to the post's own title", async () => {
    const author = await makeUser("author@test");
    await makePost(author);
    signedInUserId = author;

    const fd = conversion();
    fd.set("title", "");
    await convert("anyone-for-5v5-saturday", fd);

    const [event] = await db.select().from(events);
    expect(event.title).toBe("Anyone for 5v5 Saturday?");
  });

  it("converts a post that never had a thread", async () => {
    // Nothing to move is not an error; a post with no replies is the common
    // case for one posted and converted the same afternoon.
    const author = await makeUser("author@test");
    await makePost(author, false);
    signedInUserId = author;

    expect((await convert("anyone-for-5v5-saturday", conversion())).converted).toBe(true);
    expect(await db.select().from(discussions)).toHaveLength(0);
  });
});

describe("what it insists on", () => {
  it("wants a date and somewhere to play", async () => {
    const author = await makeUser("author@test");
    await makePost(author);
    signedInUserId = author;

    const noDate = conversion();
    noDate.set("date", "");
    expect((await convert("anyone-for-5v5-saturday", noDate)).result.fieldErrors?.date).toBeTruthy();

    const noVenue = conversion();
    noVenue.set("venueName", "");
    expect(
      (await convert("anyone-for-5v5-saturday", noVenue)).result.fieldErrors?.venueName,
    ).toBeTruthy();

    expect(await db.select().from(events)).toHaveLength(0);
  });

  it("only takes a kind the platform knows", async () => {
    const author = await makeUser("author@test");
    await makePost(author);
    signedInUserId = author;

    const res = await convert("anyone-for-5v5-saturday", conversion({ kind: "quidditch" }));
    expect(res.result.fieldErrors?.kind).toBeTruthy();
    expect(await db.select().from(events)).toHaveLength(0);
  });
});
