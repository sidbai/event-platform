import { describe, expect, it } from "vitest";

import {
  defaultChecklist,
  dueDateFor,
  isTaskCategory,
  overdue,
  progressOf,
  TASK_CATEGORIES,
  type TaskStatus,
} from "./checklist";

const now = new Date("2026-09-05T12:00:00Z");
const SEATTLE = "America/Los_Angeles";

describe("defaultChecklist", () => {
  it("gives a tournament the weekend list and a league the season list", () => {
    const t = defaultChecklist("tournament");
    const l = defaultChecklist("league");
    expect(t.some((x) => x.title.includes("Book the fields"))).toBe(true);
    expect(l.some((x) => x.title.includes("every matchday"))).toBe(true);
    expect(t).not.toEqual(l);
  });

  it("never hands back an empty list, whatever the kind", () => {
    // An empty checklist teaches an organizer the feature is not for them.
    for (const kind of ["pickup", "scrimmage", "camp", "", "nonsense"]) {
      expect(defaultChecklist(kind).length).toBeGreaterThan(0);
    }
  });

  it("only uses categories the UI can group by", () => {
    for (const kind of ["tournament", "league", "pickup"]) {
      for (const task of defaultChecklist(kind)) {
        expect(isTaskCategory(task.category)).toBe(true);
      }
    }
  });

  it("covers fields, referees, equipment and safety for both competitions", () => {
    // The four the organizer named. A list that skips one of them is not the
    // thing that was asked for.
    for (const kind of ["tournament", "league"]) {
      const cats = new Set(defaultChecklist(kind).map((t) => t.category));
      for (const needed of ["field", "officials", "equipment", "safety"]) {
        expect(cats.has(needed as never)).toBe(true);
      }
    }
  });

  it("asks for the slow things earlier than the fast ones", () => {
    const t = defaultChecklist("tournament");
    const fields = t.find((x) => x.title === "Book the fields")!;
    const printing = t.find((x) => x.title.includes("Print schedules"))!;
    expect(fields.daysBefore).toBeGreaterThan(printing.daysBefore);
  });

  it("has no duplicate titles within a list", () => {
    for (const kind of ["tournament", "league"]) {
      const titles = defaultChecklist(kind).map((t) => t.title);
      expect(new Set(titles).size).toBe(titles.length);
    }
  });
});

describe("dueDateFor", () => {
  it("counts back from the first day", () => {
    const start = new Date("2026-11-01T16:00:00Z");
    expect(dueDateFor(30, start, now, SEATTLE)?.toISOString()).toBe(
      "2026-10-02T16:00:00.000Z",
    );
  });

  it("has no due date when the event has no date", () => {
    // A deadline derived from nothing is one nobody agreed to.
    expect(dueDateFor(30, null, now, SEATTLE)).toBeNull();
  });

  it("pulls a date that has already passed forward to the end of today", () => {
    // Importing the list a week before a tournament should not produce a dozen
    // tasks that were already overdue.
    const start = new Date("2026-09-12T16:00:00Z");
    const due = dueDateFor(60, start, now, SEATTLE);
    // 23:59 on Sep 5 in Seattle is 06:59 on Sep 6 UTC.
    expect(due?.toISOString()).toBe("2026-09-06T06:59:00.000Z");
  });

  it("does not make a freshly seeded task overdue on arrival", () => {
    // The bug this replaced: clamping to `now` left every due date a
    // millisecond in the past by the time the page rendered, so a brand new
    // checklist came up entirely overdue.
    const start = new Date("2026-09-12T16:00:00Z");
    const tasks = defaultChecklist("league").map((t) => ({
      status: "todo" as const,
      dueAt: dueDateFor(t.daysBefore, start, now, SEATTLE),
    }));
    expect(overdue(tasks, new Date(now.getTime() + 5_000))).toEqual([]);
  });
});

describe("progressOf", () => {
  const tasks = (...statuses: TaskStatus[]) => statuses.map((status) => ({ status }));

  it("counts only what is done", () => {
    expect(progressOf(tasks("done", "todo", "doing", "done"))).toEqual({
      done: 2,
      total: 4,
      pct: 50,
    });
  });

  it("treats an empty list as nothing to do, not as nothing done", () => {
    expect(progressOf([])).toEqual({ done: 0, total: 0, pct: 100 });
  });

  it("reaches exactly 100 when everything is done", () => {
    expect(progressOf(tasks("done", "done", "done")).pct).toBe(100);
  });
});

describe("overdue", () => {
  const task = (status: TaskStatus, dueAt: string | null) => ({
    status,
    dueAt: dueAt ? new Date(dueAt) : null,
  });

  it("lists what is late, soonest first", () => {
    const out = overdue(
      [
        task("todo", "2026-09-01T00:00:00Z"),
        task("doing", "2026-08-01T00:00:00Z"),
        task("todo", "2026-10-01T00:00:00Z"),
      ],
      now,
    );
    expect(out).toHaveLength(2);
    expect(out[0].dueAt?.toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });

  it("never scolds about work already finished", () => {
    expect(overdue([task("done", "2026-01-01T00:00:00Z")], now)).toEqual([]);
  });

  it("ignores tasks with no due date", () => {
    expect(overdue([task("todo", null)], now)).toEqual([]);
  });
});

describe("TASK_CATEGORIES", () => {
  it("has unique ids", () => {
    const ids = TASK_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("rejects a category it does not define", () => {
    expect(isTaskCategory("catering")).toBe(false);
  });
});
