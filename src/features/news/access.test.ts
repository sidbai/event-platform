import { describe, expect, it } from "vitest";

import {
  canEditNewsPost,
  canViewNewsPost,
  nextStatus,
  type NewsSubject,
  type NewsViewer,
} from "./access";

const author: NewsViewer = { id: "u1", admin: false };
const other: NewsViewer = { id: "u2", admin: false };
const admin: NewsViewer = { id: "u3", admin: true };

const post = (status: NewsSubject["status"], authorId: string | null = "u1") =>
  ({ status, authorId }) satisfies NewsSubject;

describe("canViewNewsPost", () => {
  it("shows published posts to everyone, signed out included", () => {
    expect(canViewNewsPost(post("published"), null)).toBe(true);
    expect(canViewNewsPost(post("published"), other)).toBe(true);
  });

  it("hides drafts and submissions from the public", () => {
    expect(canViewNewsPost(post("draft"), null)).toBe(false);
    expect(canViewNewsPost(post("pending"), null)).toBe(false);
    expect(canViewNewsPost(post("draft"), other)).toBe(false);
    expect(canViewNewsPost(post("pending"), other)).toBe(false);
  });

  it("lets an author see their own submission while it waits", () => {
    expect(canViewNewsPost(post("pending"), author)).toBe(true);
    expect(canViewNewsPost(post("draft"), author)).toBe(true);
  });

  it("lets admins see everything", () => {
    expect(canViewNewsPost(post("draft"), admin)).toBe(true);
    expect(canViewNewsPost(post("pending"), admin)).toBe(true);
  });

  it("does not treat an orphaned post as everyone's", () => {
    expect(canViewNewsPost(post("draft", null), other)).toBe(false);
  });
});

describe("canEditNewsPost", () => {
  it("lets an author edit until it is live", () => {
    expect(canEditNewsPost(post("draft"), author)).toBe(true);
    expect(canEditNewsPost(post("pending"), author)).toBe(true);
  });

  it("locks the author out once it is published", () => {
    // Otherwise approval means nothing: submit something innocuous, get it
    // approved, then rewrite it in place.
    expect(canEditNewsPost(post("published"), author)).toBe(false);
  });

  it("never lets a stranger edit", () => {
    expect(canEditNewsPost(post("draft"), other)).toBe(false);
    expect(canEditNewsPost(post("published"), other)).toBe(false);
    expect(canEditNewsPost(post("draft"), null)).toBe(false);
  });

  it("lets admins edit at any stage", () => {
    expect(canEditNewsPost(post("published"), admin)).toBe(true);
    expect(canEditNewsPost(post("pending"), admin)).toBe(true);
  });
});

describe("nextStatus", () => {
  it("publishes an admin's post directly", () => {
    expect(nextStatus("submit", admin)).toBe("published");
    expect(nextStatus("save", admin)).toBe("draft");
  });

  it("queues everyone else's for review", () => {
    expect(nextStatus("submit", author)).toBe("pending");
  });

  it("keeps an unsent save private", () => {
    expect(nextStatus("save", author)).toBe("draft");
  });

  it("does not unpublish a live post on a plain save", () => {
    expect(nextStatus("save", admin, "published")).toBe("draft");
    expect(nextStatus("save", author, "published")).toBe("published");
  });
});
