import { describe, expect, it } from "vitest";

import {
  defaultChecklist,
  endOfDay,
  scheduleChecklist,
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

describe("scheduleChecklist", () => {
  const league = defaultChecklist("league");
  const days = (n: number) => new Date(now.getTime() + n * 86_400_000);

  it("has no dates when the event has no date", () => {
    // A deadline derived from nothing is one nobody agreed to.
    expect(scheduleChecklist(league, null, now, SEATTLE)).toEqual(
      league.map(() => null),
    );
  });

  it("uses the templates' own lead times when there is room", () => {
    // Six months out, "45 days before" means 45 days before.
    const start = days(180);
    const out = scheduleChecklist(league, start, now, SEATTLE);
    const fields = league.findIndex((t) => t.daysBefore === 45);
    const expected = endOfDay(new Date(start.getTime() - 45 * 86_400_000), SEATTLE);
    expect(out[fields]?.toISOString()).toBe(expected.toISOString());
  });

  it("does not stretch a long runway", () => {
    // A year of lead time should not push the last task months out; the
    // templates are a minimum notice, not a schedule to fill.
    const start = days(400);
    const out = scheduleChecklist(league, start, now, SEATTLE);
    for (const [i, due] of out.entries()) {
      const natural = start.getTime() - league[i].daysBefore * 86_400_000;
      expect(due!.getTime()).toBeLessThanOrEqual(endOfDay(new Date(natural), SEATTLE).getTime());
    }
  });

  it("compresses a short runway instead of collapsing it", () => {
    // The bug this replaces: a season a week away put every task on today,
    // and the ordering the templates encode was lost.
    const start = days(7);
    const out = scheduleChecklist(league, start, now, SEATTLE);
    expect(new Set(out.map((d) => d!.toISOString())).size).toBeGreaterThan(1);
  });

  it("keeps the order the lead times describe", () => {
    const start = days(7);
    const out = scheduleChecklist(league, start, now, SEATTLE);
    const pairs = league
      .map((t, i) => ({ lead: t.daysBefore, due: out[i]!.getTime() }))
      .sort((a, b) => b.lead - a.lead);
    for (let i = 1; i < pairs.length; i++) {
      // Longer lead time means due no later than the task after it.
      expect(pairs[i - 1].due).toBeLessThanOrEqual(pairs[i].due);
    }
  });

  it("keeps every date between today and the event", () => {
    const start = days(7);
    const out = scheduleChecklist(league, start, now, SEATTLE);
    for (const due of out) {
      expect(due!.getTime()).toBeGreaterThanOrEqual(endOfDay(now, SEATTLE).getTime());
      expect(due!.getTime()).toBeLessThanOrEqual(endOfDay(start, SEATTLE).getTime());
    }
  });

  it("makes nothing overdue on arrival", () => {
    // Clamping to `now` used to leave every date a millisecond in the past by
    // the time the page rendered.
    for (const offset of [1, 7, 60, 400]) {
      const out = scheduleChecklist(league, days(offset), now, SEATTLE);
      const tasks = out.map((dueAt) => ({ status: "todo" as const, dueAt }));
      expect(overdue(tasks, new Date(now.getTime() + 5_000))).toEqual([]);
    }
  });

  it("puts everything on today once the event has started", () => {
    // Deadlines after the first whistle would be a schedule for nobody.
    const out = scheduleChecklist(league, days(-1), now, SEATTLE);
    for (const due of out) {
      expect(due?.toISOString()).toBe(endOfDay(now, SEATTLE).toISOString());
    }
  });

  it("has nothing to schedule for an empty list", () => {
    expect(scheduleChecklist([], days(7), now, SEATTLE)).toEqual([]);
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
