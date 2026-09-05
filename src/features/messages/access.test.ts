import { describe, expect, it } from "vitest";

import {
  canPostMessage,
  canReadConversation,
  canStartConversation,
  isUnread,
  type StartCheck,
  type Viewer,
} from "./access";

const me: Viewer = { id: "u-me", admin: false };
const admin: Viewer = { id: "u-admin", admin: true };

const check = (over: Partial<StartCheck> = {}): StartCheck => ({
  recipientIds: ["u-organizer"],
  blockedByIds: [],
  canSeeSubject: true,
  ...over,
});

describe("canStartConversation", () => {
  it("allows a viewer who shares the subject", () => {
    const v = canStartConversation(me, check());
    expect(v).toEqual({ ok: true, recipientIds: ["u-organizer"] });
  });

  it("refuses when signed out", () => {
    expect(canStartConversation(null, check())).toMatchObject({ reason: "signed-out" });
  });

  it("refuses when the viewer cannot see the subject", () => {
    // No messaging your way into a private event you were never invited to.
    expect(
      canStartConversation(me, check({ canSeeSubject: false })),
    ).toMatchObject({ reason: "no-subject" });
  });

  it("refuses when nobody is answerable for the subject", () => {
    expect(
      canStartConversation(me, check({ recipientIds: [] })),
    ).toMatchObject({ reason: "no-recipients" });
  });

  it("refuses messaging something you run yourself", () => {
    expect(
      canStartConversation(me, check({ recipientIds: ["u-me"] })),
    ).toMatchObject({ reason: "self" });
  });

  it("drops recipients who blocked the viewer", () => {
    const v = canStartConversation(
      me,
      check({ recipientIds: ["u-a", "u-b"], blockedByIds: ["u-a"] }),
    );
    expect(v).toEqual({ ok: true, recipientIds: ["u-b"] });
  });

  it("refuses when every recipient has blocked the viewer", () => {
    expect(
      canStartConversation(
        me,
        check({ recipientIds: ["u-a"], blockedByIds: ["u-a"] }),
      ),
    ).toMatchObject({ reason: "blocked" });
  });

  it("does not count the viewer's own block against them", () => {
    // blockedByIds only ever lists people who blocked the viewer, but a self
    // entry must not strand someone in their own thread.
    const v = canStartConversation(
      me,
      check({ recipientIds: ["u-me", "u-b"], blockedByIds: ["u-me"] }),
    );
    expect(v).toEqual({ ok: true, recipientIds: ["u-b"] });
  });
});

describe("canReadConversation", () => {
  const participants = ["u-me", "u-organizer"];

  it("is membership, nothing else", () => {
    expect(canReadConversation(participants, me)).toBe(true);
    expect(canReadConversation(participants, { id: "u-other", admin: false })).toBe(false);
    expect(canReadConversation(participants, null)).toBe(false);
  });

  it("does not let an admin browse private threads", () => {
    // An admin reaches a message through a report — a deliberate act with a
    // record — never by wandering into someone's inbox.
    expect(canReadConversation(participants, admin)).toBe(false);
  });
});

describe("canPostMessage", () => {
  const participants = ["u-me", "u-them"];

  it("allows a member nobody has blocked", () => {
    expect(canPostMessage(participants, me, [])).toBe(true);
  });

  it("stops someone the other party blocked", () => {
    expect(canPostMessage(participants, me, ["u-them"])).toBe(false);
  });

  it("refuses a non-member outright", () => {
    expect(canPostMessage(participants, { id: "u-x", admin: false }, [])).toBe(false);
  });
});

describe("isUnread", () => {
  const t = (iso: string) => new Date(iso);

  it("is unread when they wrote after you last looked", () => {
    expect(
      isUnread(t("2026-09-04T12:00:00Z"), t("2026-09-04T11:00:00Z"), "u-them", "u-me"),
    ).toBe(true);
  });

  it("is read once you have looked since", () => {
    expect(
      isUnread(t("2026-09-04T12:00:00Z"), t("2026-09-04T12:30:00Z"), "u-them", "u-me"),
    ).toBe(false);
  });

  it("never marks your own message unread to you", () => {
    expect(isUnread(t("2026-09-04T12:00:00Z"), null, "u-me", "u-me")).toBe(false);
  });

  it("is unread when you have never opened it", () => {
    expect(isUnread(t("2026-09-04T12:00:00Z"), null, "u-them", "u-me")).toBe(true);
  });
});
