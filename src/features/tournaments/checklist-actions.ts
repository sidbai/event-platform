"use server";

import { and, asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { eventTasks, events } from "@/db/schema";
import { canManageEvent } from "@/features/events/can-manage";

import {
  defaultChecklist,
  dueDateFor,
  isTaskCategory,
  type TaskStatus,
} from "./checklist";
import { parseLocalDateTime } from "./division-input";

export type ChecklistResult = { error?: string; ok?: boolean };

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

async function eventFor(slug: string) {
  return db.query.events.findFirst({
    where: eq(events.slug, slug),
    columns: { id: true, kind: true, startsAt: true, timezone: true },
  });
}

/** Everything on this event's list, in the order the organizer arranged it. */
export async function tasksForEvent(eventId: string) {
  return db.query.eventTasks.findMany({
    where: eq(eventTasks.eventId, eventId),
    orderBy: [asc(eventTasks.position), asc(eventTasks.createdAt)],
  });
}

/**
 * Fill an empty checklist with the starter list for this kind of event.
 *
 * Only ever into an empty list. Running it twice on a list an organizer has
 * worked through would re-add the items they deleted on purpose, which is a
 * worse failure than doing nothing.
 */
export async function seedChecklist(slug: string): Promise<ChecklistResult> {
  if (!(await canManageEvent({ slug }))) return { error: "Not allowed." };

  const event = await eventFor(slug);
  if (!event) return { error: "Event not found." };

  const existing = await db.query.eventTasks.findFirst({
    where: eq(eventTasks.eventId, event.id),
    columns: { id: true },
  });
  if (existing) return { error: "This checklist already has items on it." };

  const now = new Date();
  const tz = event.timezone ?? "America/Los_Angeles";
  const rows = defaultChecklist(event.kind).map((t, i) => ({
    eventId: event.id,
    title: t.title,
    detail: t.detail ?? null,
    category: t.category,
    dueAt: dueDateFor(t.daysBefore, event.startsAt, now, tz),
    position: i,
  }));

  await db.insert(eventTasks).values(rows);
  revalidatePath(`/events/${slug}/checklist`);
  revalidatePath(`/events/${slug}/setup`);
  return { ok: true };
}

export async function addTask(
  slug: string,
  _prev: ChecklistResult,
  formData: FormData,
): Promise<ChecklistResult> {
  if (!(await canManageEvent({ slug }))) return { error: "Not allowed." };

  const event = await eventFor(slug);
  if (!event) return { error: "Event not found." };

  const title = str(formData, "title");
  if (!title) return { error: "What needs doing?" };
  if (title.length > 200) return { error: "That title is too long." };

  const category = str(formData, "category");
  const due = parseLocalDateTime(
    str(formData, "dueAt"),
    event.timezone ?? "America/Los_Angeles",
  );
  if (!due.ok) return { error: due.error };

  // Appended rather than inserted at the top: a list you are working down
  // should not reorder itself under you every time you add something.
  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${eventTasks.position}), -1) + 1` })
    .from(eventTasks)
    .where(eq(eventTasks.eventId, event.id));

  await db.insert(eventTasks).values({
    eventId: event.id,
    title,
    detail: str(formData, "detail") || null,
    category: isTaskCategory(category) ? category : "other",
    owner: str(formData, "owner") || null,
    dueAt: due.value,
    position: next,
  });

  revalidatePath(`/events/${slug}/checklist`);
  revalidatePath(`/events/${slug}/setup`);
  return { ok: true };
}

/** Move a task along: todo → doing → done, or straight to any of them. */
export async function setTaskStatus(
  slug: string,
  taskId: string,
  status: TaskStatus,
): Promise<void> {
  if (!(await canManageEvent({ slug }))) return;

  const event = await eventFor(slug);
  if (!event) return;

  await db
    .update(eventTasks)
    .set({ status, updatedAt: new Date() })
    // Scoped to the event as well as the id, so a task id from one event
    // cannot be driven from another event's page.
    .where(and(eq(eventTasks.id, taskId), eq(eventTasks.eventId, event.id)));

  revalidatePath(`/events/${slug}/checklist`);
  revalidatePath(`/events/${slug}/setup`);
}

export async function deleteTask(slug: string, taskId: string): Promise<void> {
  if (!(await canManageEvent({ slug }))) return;

  const event = await eventFor(slug);
  if (!event) return;

  await db
    .delete(eventTasks)
    .where(and(eq(eventTasks.id, taskId), eq(eventTasks.eventId, event.id)));

  revalidatePath(`/events/${slug}/checklist`);
  revalidatePath(`/events/${slug}/setup`);
}
