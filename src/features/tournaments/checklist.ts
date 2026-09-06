/**
 * What still has to be arranged before anyone kicks a ball.
 *
 * A schedule and a standings table describe an event that is already running.
 * The work that decides whether it runs at all — fields booked, referees
 * assigned, goals and nets on site, someone bringing a first-aid kit — lives
 * in a spreadsheet or a group chat, and is where a first-time organizer
 * quietly comes unstuck. This is the part GotSport does not do.
 *
 * The starter lists are here, and pure, because they are the actual product
 * opinion: what a tournament needs that a league does not, and how far ahead
 * each thing wants doing.
 */

import { parseLocalDateTime, toLocalInput } from "./division-input";

export const TASK_CATEGORIES = [
  { id: "field", label: "Fields" },
  { id: "officials", label: "Referees" },
  { id: "equipment", label: "Equipment" },
  { id: "safety", label: "Safety" },
  { id: "admin", label: "Admin" },
  { id: "other", label: "Other" },
] as const;

export type TaskCategory = (typeof TASK_CATEGORIES)[number]["id"];
export type TaskStatus = "todo" | "doing" | "done";

export type TaskTemplate = {
  category: TaskCategory;
  title: string;
  detail?: string;
  /** How many days before the first day this wants to be settled. */
  daysBefore: number;
};

export const isTaskCategory = (v: string): v is TaskCategory =>
  TASK_CATEGORIES.some((c) => c.id === v);

/**
 * A weekend tournament: everything happens at once, so almost everything has
 * to be in place beforehand.
 */
const TOURNAMENT: TaskTemplate[] = [
  {
    category: "field",
    title: "Book the fields",
    detail: "Confirm the permit covers every hour you have scheduled, not just the day.",
    daysBefore: 60,
  },
  {
    category: "field",
    title: "Confirm field markings and sizes",
    detail: "Small-sided formats need the pitch dividing; ask who is lining it.",
    daysBefore: 21,
  },
  {
    category: "officials",
    title: "Book referees",
    detail: "One per field per slot, plus a spare. Confirm the assignor has your schedule.",
    daysBefore: 30,
  },
  {
    category: "officials",
    title: "Agree referee pay and who pays it",
    daysBefore: 21,
  },
  {
    category: "equipment",
    title: "Goals and nets on site",
    detail: "Count them against the number of pitches, and check anchors or sandbags.",
    daysBefore: 14,
  },
  { category: "equipment", title: "Corner flags, balls and ball pumps", daysBefore: 14 },
  {
    category: "safety",
    title: "First aid on site",
    detail: "Kit per field, and someone named who is responsible for it.",
    daysBefore: 14,
  },
  {
    category: "safety",
    title: "Severe weather and heat plan",
    detail: "Write down who calls a delay, and how teams are told.",
    daysBefore: 14,
  },
  { category: "safety", title: "Confirm insurance covers the event", daysBefore: 30 },
  {
    category: "admin",
    title: "Check-in table and roster verification",
    daysBefore: 7,
  },
  { category: "admin", title: "Print schedules and score cards", daysBefore: 3 },
  {
    category: "admin",
    title: "Parking, toilets and rubbish",
    detail: "The three things every complaint is actually about.",
    daysBefore: 7,
  },
  { category: "admin", title: "Trophies or medals ordered", daysBefore: 21 },
];

/**
 * A league: the same questions, but asked once for a season rather than once
 * for a weekend, and with a standing arrangement instead of a booking.
 */
const LEAGUE: TaskTemplate[] = [
  {
    category: "field",
    title: "Secure fields for every matchday",
    detail: "A season permit, or a confirmed slot per week. Note the ones you do not have.",
    daysBefore: 45,
  },
  {
    category: "field",
    title: "Agree a rain-off and rescheduling policy",
    detail: "Half a season gets postponed at some point; decide now who picks the new date.",
    daysBefore: 30,
  },
  {
    category: "officials",
    title: "Arrange a referee assignor for the season",
    daysBefore: 45,
  },
  { category: "officials", title: "Agree referee pay and who pays it", daysBefore: 30 },
  {
    category: "equipment",
    title: "Confirm goals, nets and flags at each venue",
    daysBefore: 21,
  },
  {
    category: "safety",
    title: "First aid at every venue",
    detail: "Home team's responsibility in most leagues — say so in writing.",
    daysBefore: 21,
  },
  { category: "safety", title: "Confirm insurance covers the season", daysBefore: 45 },
  {
    category: "admin",
    title: "Publish the rules and tiebreakers",
    detail: "Before the first match, not after the first dispute.",
    daysBefore: 14,
  },
  {
    category: "admin",
    title: "Decide who enters results, and by when",
    detail: "A league lives or dies on the table being current.",
    daysBefore: 14,
  },
  {
    category: "admin",
    title: "Agree a discipline process",
    detail: "Cards, suspensions, and who hears an appeal.",
    daysBefore: 14,
  },
];

/**
 * The starter list for an event of this kind.
 *
 * Anything that is not a tournament or a league gets the short list — the
 * things true of any organised game — rather than nothing, because an empty
 * checklist teaches an organizer that the feature is not for them.
 */
export function defaultChecklist(kind: string): TaskTemplate[] {
  if (kind === "tournament") return TOURNAMENT;
  if (kind === "league") return LEAGUE;
  return [
    { category: "field", title: "Book the field", daysBefore: 14 },
    { category: "officials", title: "Arrange a referee", daysBefore: 7 },
    { category: "equipment", title: "Goals, nets and balls", daysBefore: 3 },
    { category: "safety", title: "First aid kit", daysBefore: 3 },
  ];
}

/** The last minute of the day `at` falls on, in the given zone. */
export function endOfDay(at: Date, timeZone: string): Date {
  const parsed = parseLocalDateTime(`${toLocalInput(at, timeZone).slice(0, 10)}T23:59`, timeZone);
  return parsed.ok && parsed.value ? parsed.value : at;
}

const DAY = 86_400_000;

/**
 * When each task on a starter list wants doing.
 *
 * The templates carry lead times — book fields 45 days out, publish the rules
 * 14 days out, print score cards 3 days out — and those numbers are the useful
 * part: they say what to do first. Subtracting them from the first day works
 * only when there is a season's worth of runway left.
 *
 * There usually is not. An organizer who imports the list a week before
 * kick-off has every one of those dates in the past, and clamping each to
 * today collapses the whole list to one deadline — which is not wrong,
 * exactly, but throws away the ordering at the moment it matters most.
 *
 * So a short runway compresses rather than collapses. Forty-five days of
 * preparation squeezed into seven keeps its shape: fields still come first,
 * score cards still come last, and everything lands between today and the
 * event. The dates stop being real deadlines and become an order of work,
 * which is what a late list is for.
 *
 * Taken as a whole list rather than one task at a time, because the scale
 * factor depends on the longest lead time in it.
 */
export function scheduleChecklist(
  templates: TaskTemplate[],
  startsAt: Date | null,
  now: Date,
  timeZone: string,
): (Date | null)[] {
  // A due date derived from nothing is a deadline nobody agreed to.
  if (!startsAt) return templates.map(() => null);

  const floor = endOfDay(now, timeZone);
  const ceiling = endOfDay(startsAt, timeZone);
  const clamp = (at: Date) =>
    new Date(Math.min(Math.max(at.getTime(), floor.getTime()), ceiling.getTime()));

  // The event has started. Whatever is left is due now, and pretending
  // otherwise would put deadlines after the first whistle.
  const runway = startsAt.getTime() - now.getTime();
  if (runway <= 0) return templates.map(() => floor);

  const maxLead = Math.max(1, ...templates.map((t) => t.daysBefore));
  // Never stretch: a year of runway should not push "print the score cards"
  // six months out. Only the squeeze is interesting.
  const scale = Math.min(1, runway / (maxLead * DAY));

  return templates.map((t) =>
    clamp(endOfDay(new Date(startsAt.getTime() - t.daysBefore * DAY * scale), timeZone)),
  );
}

export type ProgressItem = { status: TaskStatus };

/** How far along the list is. */
export function progressOf(tasks: ProgressItem[]): {
  done: number;
  total: number;
  pct: number;
} {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "done").length;
  // An empty list is not 0% done — it is nothing to do. Reporting 0 would
  // paint a red bar on an event with no checklist yet.
  return { done, total, pct: total === 0 ? 100 : Math.round((done / total) * 100) };
}

/**
 * The tasks that are late, soonest first.
 *
 * "Done" is never late, whenever it was finished — a checklist that keeps
 * scolding about work already completed stops being read.
 */
export function overdue<T extends { status: TaskStatus; dueAt: Date | null }>(
  tasks: T[],
  now: Date,
): T[] {
  return tasks
    .filter((t) => t.status !== "done" && t.dueAt !== null && t.dueAt < now)
    .sort((a, b) => a.dueAt!.getTime() - b.dueAt!.getTime());
}
