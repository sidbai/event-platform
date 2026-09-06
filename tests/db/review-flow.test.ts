/**
 * Club reviews, driven through the real action and the real query.
 *
 * The anonymity contract has pure tests over publicReview, but nothing until
 * now put a review through the action and read it back the way a page does.
 * That is where a leak would actually happen: not in the shaping function,
 * which is careful, but in a query growing a column, or a new field being
 * spread past it.
 *
 * A leak here cannot be undone. Someone criticises the club their child plays
 * for, believing they are anonymous, and one careless `with: { author: true }`
 * tells the club who they are.
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
const { clubs, reviews, users } = await import("@/db/schema");
const { saveReview } = await import("@/features/clubs/actions");
const { listReviews } = await import("@/features/clubs/queries");
const { eq } = await import("drizzle-orm");

/** Distinctive enough that a leak cannot hide in a common word. */
const AUTHOR_EMAIL = "zebediah.quartzwell@example.test";
const AUTHOR_NAME = "Zebediah Quartzwell";

const review = (over: Record<string, string> = {}) => {
  const fd = new FormData();
  for (const k of [
    "playerDevelopment",
    "coaching",
    "communication",
    "clubCulture",
    "playingTime",
    "value",
  ]) {
    fd.set(k, "4");
  }
  fd.set("reviewerRole", "parent");
  fd.set("title", "Strong coaching, long commute");
  fd.set(
    "body",
    "Two seasons here. The coaching has been good and my daughter improved, but the travel three times a week is a real commitment.",
  );
  for (const [k, v] of Object.entries(over)) fd.set(k, v);
  return fd;
};

/**
 * Submit a review the way the form does.
 *
 * A successful save ends in redirect(), which Next signals by throwing — so a
 * bare call looks like a failure and a returned object means something was
 * rejected. Encoded here once rather than misread in every test.
 */
async function submit(fd: FormData) {
  try {
    const result = await saveReview("crossfire-premier", {}, fd);
    return { saved: false, result };
  } catch (e) {
    const digest = (e as { digest?: unknown })?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      return { saved: true, result: {} as Awaited<ReturnType<typeof saveReview>> };
    }
    throw e;
  }
}

async function makeClub() {
  const [club] = await db
    .insert(clubs)
    .values({ slug: "crossfire-premier", name: "Crossfire Premier" })
    .returning({ id: clubs.id });
  return club.id;
}

async function makeUser(email: string, name: string) {
  const [u] = await db.insert(users).values({ email, name }).returning({ id: users.id });
  return u.id;
}

beforeAll(async () => {
  await truncateAll(db);
  await db.delete(clubs);
});

beforeEach(async () => {
  await db.delete(reviews);
  await db.delete(clubs);
  await db.delete(users);
  signedInUserId = null;
});

describe("writing a review", () => {
  it("records it against the signed-in author", async () => {
    await makeClub();
    signedInUserId = await makeUser(AUTHOR_EMAIL, AUTHOR_NAME);

    const res = await submit(review());
    expect(res.saved).toBe(true);

    const rows = await db.select().from(reviews);
    expect(rows).toHaveLength(1);
    expect(rows[0].authorId).toBe(signedInUserId);
  });

  it("edits rather than duplicates when the same person writes again", async () => {
    const clubId = await makeClub();
    signedInUserId = await makeUser(AUTHOR_EMAIL, AUTHOR_NAME);

    await submit(review());
    await submit(review({ title: "Changed my mind" }));

    const rows = await db.select().from(reviews);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Changed my mind");
    expect(clubId).toBeTruthy();
  });

  it("insists on a rating for every category", async () => {
    await makeClub();
    signedInUserId = await makeUser(AUTHOR_EMAIL, AUTHOR_NAME);

    const fd = review();
    fd.delete("coaching");
    const res = await submit(fd);
    expect(res.saved).toBe(false);
    expect(res.result.fieldErrors?.coaching).toBeTruthy();
    expect(await db.select().from(reviews)).toHaveLength(0);
  });

  it("wants more than a sentence fragment", async () => {
    await makeClub();
    signedInUserId = await makeUser(AUTHOR_EMAIL, AUTHOR_NAME);

    const res = await submit(review({ body: "Fine." }));
    expect(res.saved).toBe(false);
    expect(res.result.fieldErrors?.body).toBeTruthy();
    expect(await db.select().from(reviews)).toHaveLength(0);
  });

  it("refuses an anonymous review while anonymous reviews are switched off", async () => {
    // The gate fails closed: with no RATE_LIMIT_SECRET there is nothing to key
    // a limit on, so the honest answer is no rather than an unlimited yes.
    vi.stubEnv("RATE_LIMIT_SECRET", "");
    await makeClub();
    signedInUserId = null;

    const res = await submit(review());
    expect(res.saved).toBe(false);
    expect(res.result.error).toBeTruthy();
    expect(await db.select().from(reviews)).toHaveLength(0);
    vi.unstubAllEnvs();
  });
});

describe("what a reader is allowed to see", () => {
  async function oneReviewBy(email: string, name: string) {
    const clubId = await makeClub();
    const authorId = await makeUser(email, name);
    signedInUserId = authorId;
    await submit(review());
    return { clubId, authorId };
  }

  it("tells a stranger nothing about who wrote it", async () => {
    const { clubId, authorId } = await oneReviewBy(AUTHOR_EMAIL, AUTHOR_NAME);

    const rows = await listReviews(clubId, null);
    expect(rows).toHaveLength(1);

    // By key, and by serialised value: a field added later that carries the
    // author through would fail this even if nobody thought to check its name.
    expect(Object.keys(rows[0])).not.toContain("author");
    expect(Object.keys(rows[0])).not.toContain("authorId");
    const json = JSON.stringify(rows[0]);
    expect(json).not.toContain(authorId);
    expect(json).not.toContain("zebediah");
    expect(json).not.toContain("Quartzwell");
    expect(json).not.toContain("example.test");
  });

  it("gives the reader a pseudonym instead", async () => {
    const { clubId } = await oneReviewBy(AUTHOR_EMAIL, AUTHOR_NAME);
    const [row] = await listReviews(clubId, null);
    expect(row.anonHandle).toMatch(/^anon/);
  });

  it("marks a review as yours only to you", async () => {
    const { clubId, authorId } = await oneReviewBy(AUTHOR_EMAIL, AUTHOR_NAME);
    const other = await makeUser("someone.else@example.test", "Someone Else");

    expect((await listReviews(clubId, authorId))[0].mine).toBe(true);
    expect((await listReviews(clubId, other))[0].mine).toBe(false);
    expect((await listReviews(clubId, null))[0].mine).toBe(false);
  });

  it("keeps a hidden review out of the public list", async () => {
    const { clubId } = await oneReviewBy(AUTHOR_EMAIL, AUTHOR_NAME);
    await db.update(reviews).set({ hiddenAt: new Date() });

    expect(await listReviews(clubId, null)).toHaveLength(0);
    // An admin asks for it explicitly, and is told it is hidden.
    const forAdmin = await listReviews(clubId, null, true);
    expect(forAdmin).toHaveLength(1);
    expect(forAdmin[0].hidden).toBe(true);
  });

  it("still says nothing about the author in the admin view", async () => {
    // The moderation path is the one most likely to grow an author, because
    // knowing who wrote it feels useful when you are deciding whether to hide
    // it. It is exactly as forbidden there.
    const { clubId, authorId } = await oneReviewBy(AUTHOR_EMAIL, AUTHOR_NAME);
    await db.update(reviews).set({ hiddenAt: new Date() });

    const json = JSON.stringify(await listReviews(clubId, null, true));
    expect(json).not.toContain(authorId);
    expect(json).not.toContain("zebediah");
  });

  it("has nothing to leak when a club has no reviews", async () => {
    const clubId = await makeClub();
    expect(await listReviews(clubId, null)).toEqual([]);
    expect(await db.select().from(reviews).where(eq(reviews.subjectId, clubId))).toEqual(
      [],
    );
  });
});
