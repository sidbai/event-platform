import { describe, expect, it } from "vitest";

import {
  clearDraft,
  draftFrom,
  draftKey,
  isEmpty,
  readDraft,
  writeDraft,
  type DraftStore,
} from "./draft";

/** localStorage's contract, minus the parts this code never touches. */
function fakeStore(initial: Record<string, string> = {}): DraftStore {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const throwingStore: DraftStore = {
  getItem: () => {
    throw new Error("storage disabled");
  },
  setItem: () => {
    throw new Error("storage disabled");
  },
  removeItem: () => {
    throw new Error("storage disabled");
  },
};

describe("draftKey", () => {
  it("separates subjects, so one coach's draft cannot surface under another", () => {
    expect(draftKey("coach", "a")).not.toBe(draftKey("coach", "b"));
    expect(draftKey("club", "a")).not.toBe(draftKey("coach", "a"));
  });
});

describe("draftFrom", () => {
  it("keeps the answers", () => {
    const fd = new FormData();
    fd.set("title", "Great coaching");
    fd.set("coaching", "4");
    expect(draftFrom(fd)).toEqual({ title: "Great coaching", coaching: "4" });
  });

  it("drops blanks, so opening the page does not leave a draft behind", () => {
    const fd = new FormData();
    fd.set("title", "");
    fd.set("body", "   ");
    expect(isEmpty(draftFrom(fd))).toBe(true);
  });

  it("drops React's own action fields", () => {
    // A form carrying a server action contains $ACTION_KEY and friends. They
    // identify one build, so a draft saved before a deploy would restore a
    // stale action id into a live form and break the post button.
    const fd = new FormData();
    fd.set("$ACTION_KEY", "k4f0bda2");
    fd.set("$ACTION_1:0", '{"id":"707ea454"}');
    fd.set("title", "Kept");
    expect(draftFrom(fd)).toEqual({ title: "Kept" });
  });

  it("ignores files, which a review has none of and JSON cannot hold", () => {
    const fd = new FormData();
    fd.set("title", "Kept");
    fd.set("upload", new File(["x"], "x.txt"));
    expect(draftFrom(fd)).toEqual({ title: "Kept" });
  });
});

describe("readDraft", () => {
  it("round-trips what was written", () => {
    const store = fakeStore();
    writeDraft(store, "k", { title: "Held" });
    expect(readDraft(store, "k")).toEqual({ title: "Held" });
  });

  it("returns null for nothing stored", () => {
    expect(readDraft(fakeStore(), "k")).toBeNull();
  });

  it("survives a corrupted value instead of throwing on render", () => {
    // Anything can end up under a key: another tab, an extension, a half
    // written value. The form must still open.
    expect(readDraft(fakeStore({ k: "{not json" }), "k")).toBeNull();
    expect(readDraft(fakeStore({ k: '["an","array"]' }), "k")).toBeNull();
    expect(readDraft(fakeStore({ k: "null" }), "k")).toBeNull();
  });

  it("drops non-string fields rather than restoring them", () => {
    expect(readDraft(fakeStore({ k: '{"title":"ok","n":3}' }), "k")).toEqual({
      title: "ok",
    });
  });

  it("treats a draft with nothing usable as no draft", () => {
    expect(readDraft(fakeStore({ k: "{}" }), "k")).toBeNull();
  });
});

describe("when storage itself throws", () => {
  it("reads as no draft rather than breaking the page", () => {
    // A private window or blocked site data throws on access, not on write.
    expect(readDraft(throwingStore, "k")).toBeNull();
  });

  it("writes and clears without propagating", () => {
    expect(() => writeDraft(throwingStore, "k", { a: "b" })).not.toThrow();
    expect(() => clearDraft(throwingStore, "k")).not.toThrow();
  });
});

describe("writeDraft", () => {
  it("clears the key when the form has been emptied", () => {
    const store = fakeStore();
    writeDraft(store, "k", { title: "Something" });
    writeDraft(store, "k", {});
    expect(readDraft(store, "k")).toBeNull();
  });
});
