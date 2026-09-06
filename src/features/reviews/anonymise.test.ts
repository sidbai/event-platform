import { describe, expect, it } from "vitest";

import { publicReview, type AuthoredRow } from "./anonymise";

/**
 * A row as the database actually hands it over: the author relation is loaded,
 * and in a future edit could easily be loaded with more columns than today.
 * Everything identifying here must be gone from the result.
 */
const row: AuthoredRow = {
  id: "r1",
  title: "Strong coaching",
  body: "Two good seasons.",
  reviewerRole: "parent",
  createdAt: new Date("2026-09-05T00:00:00Z"),
  author: { id: "user-123", anonHandle: "anon-14fcf239" },
  // Fields a careless `with: { author: true }` or a `...row` would drag along.
  authorId: "user-123",
  name: "Jane Smith",
  email: "jane@example.com",
  avatarUrl: "https://example.com/jane.jpg",
  username: "janesmith",
};

const ctx = { userId: null, helpful: 3, votedByMe: false };

describe("publicReview", () => {
  it("publishes the pseudonym and nothing else about the author", () => {
    expect(publicReview(row, ctx)).toEqual({
      id: "r1",
      title: "Strong coaching",
      body: "Two good seasons.",
      reviewerRole: "parent",
      createdAt: new Date("2026-09-05T00:00:00Z"),
      anonHandle: "anon-14fcf239",
      helpful: 3,
      votedByMe: false,
      mine: false,
      hidden: false,
    });
  });

  it("carries no identifying key, however the row grows", () => {
    // The real guard: this fails the day someone spreads the row instead of
    // listing the fields.
    const keys = Object.keys(publicReview(row, ctx));
    for (const leaked of [
      "authorId",
      "author",
      "name",
      "email",
      "avatarUrl",
      "username",
      "userId",
    ]) {
      expect(keys).not.toContain(leaked);
    }
  });

  it("carries no identifying value either", () => {
    const serialised = JSON.stringify(publicReview(row, ctx));
    expect(serialised).not.toContain("user-123");
    expect(serialised).not.toContain("Jane Smith");
    expect(serialised).not.toContain("jane@example.com");
    expect(serialised).not.toContain("janesmith");
  });

  it("reports an admin takedown without leaking anything else", () => {
    const down = { ...row, hiddenAt: new Date("2026-09-06T00:00:00Z") };
    const out = publicReview(down, ctx);
    expect(out.hidden).toBe(true);
    expect(JSON.stringify(out)).not.toContain("Jane Smith");
  });

  it("says a review is yours without saying whose it is", () => {
    const out = publicReview(row, { ...ctx, userId: "user-123" });
    expect(out.mine).toBe(true);
    expect(JSON.stringify(out)).not.toContain("user-123");
  });

  it("is not yours when someone else wrote it", () => {
    expect(publicReview(row, { ...ctx, userId: "user-999" }).mine).toBe(false);
  });

  it("falls back to a placeholder, never a name, when no handle exists", () => {
    const noHandle = { ...row, author: { id: "user-123", anonHandle: null } };
    expect(publicReview(noHandle, ctx).anonHandle).toBe("anon");
  });

  it("handles a deleted account without exposing anything", () => {
    expect(publicReview({ ...row, author: null }, ctx).anonHandle).toBe("anon");
    expect(publicReview({ ...row, author: null }, ctx).mine).toBe(false);
  });
});
