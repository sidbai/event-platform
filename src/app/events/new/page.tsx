import { asc } from "drizzle-orm";

import { db } from "@/db";
import { eventKinds } from "@/db/schema";
import { requireUser } from "@/features/auth";
import { EventForm } from "@/features/events/event-form";

export const dynamic = "force-dynamic";

export default async function NewEventPage() {
  await requireUser("/events/new");
  const kinds = await db.query.eventKinds.findMany({
    orderBy: [asc(eventKinds.sort)],
    columns: { slug: true, label: true },
  });

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Submit an event</h1>
      <p className="mt-1 text-sm text-neutral-500">
        A game, scrimmage, pickup run, tournament, watch party — anything. Fill in
        what you know.
      </p>
      <EventForm kinds={kinds} />
    </div>
  );
}
