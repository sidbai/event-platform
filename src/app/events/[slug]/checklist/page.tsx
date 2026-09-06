import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { canManageEvent } from "@/features/events/can-manage";
import { getEventBySlug } from "@/features/events/queries";
import { AddTaskForm } from "@/features/tournaments/add-task-form";
import { SeedChecklistButton } from "@/features/tournaments/seed-checklist-button";
import {
  overdue,
  progressOf,
  TASK_CATEGORIES,
  type TaskStatus,
} from "@/features/tournaments/checklist";
import {
  addTask,
  deleteTask,
  seedChecklist,
  setTaskStatus,
  tasksForEvent,
} from "@/features/tournaments/checklist-actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Checklist" };

const NEXT_STATUS: Record<TaskStatus, TaskStatus> = {
  todo: "doing",
  doing: "done",
  done: "todo",
};

const STATUS_STYLE: Record<TaskStatus, string> = {
  todo: "border-line text-muted",
  doing: "border-amber-300 bg-amber-50 text-amber-800",
  done: "border-brand/40 bg-brand-soft text-brand-soft-text",
};

function fmtDue(at: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone,
  }).format(at);
}

/**
 * The work that decides whether an event runs at all.
 *
 * Its own page rather than a section of setup: setup is done once and this is
 * returned to weekly, and burying a live checklist under a settings form is
 * how it stops being looked at.
 */
export default async function ChecklistPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event) notFound();
  if (!(await canManageEvent({ slug }))) notFound();

  const tasks = await tasksForEvent(event.id);
  const timeZone = event.timezone ?? "America/Los_Angeles";
  const now = new Date();
  const progress = progressOf(tasks);
  const late = new Set(overdue(tasks, now).map((t) => t.id));

  const byCategory = TASK_CATEGORIES.map((c) => ({
    ...c,
    tasks: tasks.filter((t) => t.category === c.id),
  })).filter((c) => c.tasks.length > 0);

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link href={`/events/${slug}`} className="text-sm text-brand-text hover:underline">
        ← {event.title}
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Checklist</h1>
      <p className="mt-1 text-sm text-muted">
        Fields, referees, equipment and safety — the part that decides whether
        the event happens.
      </p>

      {tasks.length > 0 && (
        <div className="mt-5">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium">
              {progress.done} of {progress.total} done
            </span>
            {late.size > 0 && (
              <span className="text-xs font-medium text-red-600">
                {late.size} overdue
              </span>
            )}
          </div>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-elevated"
            role="progressbar"
            aria-valuenow={progress.pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Checklist progress"
          >
            <div className="h-full bg-brand" style={{ width: `${progress.pct}%` }} />
          </div>
        </div>
      )}

      {tasks.length === 0 ? (
        <div className="mt-8 rounded-lg border border-line p-4">
          <p className="text-sm font-medium">Nothing on the list yet.</p>
          <p className="mt-1 text-sm text-muted">
            Start from the usual list for a {event.kind}, then cut what does not
            apply and add what does.
          </p>
          <SeedChecklistButton action={seedChecklist.bind(null, slug)} />
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          {byCategory.map((group) => (
            <section key={group.id}>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
                {group.label}
              </h2>
              <ul className="mt-2 divide-y divide-line">
                {group.tasks.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-start gap-3 py-3">
                    <form action={setTaskStatus.bind(null, slug, t.id, NEXT_STATUS[t.status])}>
                      <button
                        className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[t.status]}`}
                        title={`Mark as ${NEXT_STATUS[t.status]}`}
                      >
                        {t.status}
                      </button>
                    </form>

                    <div className="min-w-0 flex-1">
                      <div
                        className={
                          t.status === "done" ? "text-muted line-through" : "font-medium"
                        }
                      >
                        {t.title}
                      </div>
                      {t.detail && (
                        <p className="mt-0.5 text-xs text-muted">{t.detail}</p>
                      )}
                      <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-muted">
                        {t.owner && <span>{t.owner}</span>}
                        {t.dueAt && (
                          <span className={late.has(t.id) ? "font-medium text-red-600" : ""}>
                            due {fmtDue(t.dueAt, timeZone)}
                          </span>
                        )}
                      </div>
                    </div>

                    <form action={deleteTask.bind(null, slug, t.id)}>
                      <button className="text-xs text-muted hover:text-red-600">
                        Remove
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <AddTaskForm action={addTask.bind(null, slug)} />
    </div>
  );
}
