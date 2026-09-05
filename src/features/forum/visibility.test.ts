import { describe, expect, it } from "vitest";

import {
  canSetHidden,
  canViewPost,
  includeHiddenInFeed,
  isHidden,
  type PostSubject,
  type Viewer,
} from "./visibility";

const author: Viewer = { id: "u-author", admin: false };
const other: Viewer = { id: "u-other", admin: false };
const admin: Viewer = { id: "u-admin", admin: true };

const visible: PostSubject = { hiddenAt: null, authorId: "u-author" };
const hidden: PostSubject = { hiddenAt: new Date(), authorId: "u-author" };

describe("canViewPost", () => {
  it("shows a normal post to everyone, signed out included", () => {
    expect(canViewPost(visible, null)).toBe(true);
    expect(canViewPost(visible, other)).toBe(true);
  });

  it("hides a hidden post from the public", () => {
    expect(canViewPost(hidden, null)).toBe(false);
    expect(canViewPost(hidden, other)).toBe(false);
  });

  it("keeps it visible to its author", () => {
    // Someone whose post vanished without trace cannot tell moderation from a
    // bug, and has nothing to ask about.
    expect(canViewPost(hidden, author)).toBe(true);
  });

  it("keeps it visible to admins", () => {
    expect(canViewPost(hidden, admin)).toBe(true);
  });

  it("does not treat an orphaned post as everyone's", () => {
    expect(canViewPost({ hiddenAt: new Date(), authorId: null }, other)).toBe(false);
  });
});

describe("canSetHidden", () => {
  it("is an admin power only", () => {
    expect(canSetHidden(admin)).toBe(true);
    expect(canSetHidden(author)).toBe(false);
    expect(canSetHidden(null)).toBe(false);
  });
});

describe("includeHiddenInFeed", () => {
  it("keeps hidden posts findable for admins", () => {
    expect(includeHiddenInFeed(admin)).toBe(true);
  });

  it("leaves them out for everyone else, author included", () => {
    // The author reaches theirs by URL; the feed stays clean.
    expect(includeHiddenInFeed(author)).toBe(false);
    expect(includeHiddenInFeed(null)).toBe(false);
  });
});

describe("isHidden", () => {
  it("is just the timestamp", () => {
    expect(isHidden(visible)).toBe(false);
    expect(isHidden(hidden)).toBe(true);
  });
});
