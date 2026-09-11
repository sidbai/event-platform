import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";

import { EventLogo } from "@/components/event-logo";
import { ImageUpload } from "@/features/uploads/image-upload";
import { clearEventLogo, setEventLogo } from "@/features/uploads/actions";
import type { Metadata } from "next";

import { db } from "@/db";
import { eventKinds, events } from "@/db/schema";
import { canManageEvent } from "@/features/events/can-manage";
import { EventForm, type EventDefaults } from "@/features/events/event-form";
import { toLocalInput } from "@/features/tournaments/division-input";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Edit event" };

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // notFound rather than a refusal: somebody who cannot manage this event has
  // no business knowing an edit page for it exists.
  if (!(await canManageEvent({ slug }))) notFound();

  const [event, kinds] = await Promise.all([
    db.query.events.findFirst({
      where: eq(events.slug, slug),
      with: { venue: { columns: { name: true, address: true, city: true } } },
    }),
    db.query.eventKinds.findMany({
      orderBy: [asc(eventKinds.sort)],
      columns: { slug: true, label: true },
    }),
  ]);
  if (!event) notFound();

  const timezone = event.timezone ?? "America/Los_Angeles";
  /*
   * Split in the event's own zone before the browser sees them. A 9am kickoff
   * in Seattle formatted by a reader's browser in Taipei is the next day, and
   * an organizer opening this page to fix a typo would save the wrong date
   * without touching the field.
   */
  const [date, time] = toLocalInput(event.startsAt, timezone).split("T");
  const endClock = event.endsAt ? toLocalInput(event.endsAt, timezone).split("T")[1] : "";
  const [endDate] = toLocalInput(event.endsAt, timezone).split("T");

  const initial: EventDefaults = {
    slug: event.slug,
    kind: event.kind,
    title: event.title,
    summary: event.summary ?? "",
    date: date ?? "",
    // Midnight is what the form stores when no start time was given, so it
    // reads back as no start time rather than as "starts at 00:00".
    time: time === "00:00" ? "" : (time ?? ""),
    // 23:59 is what "the end of the last day" is stored as, so it reads back
    // as no end time rather than as one somebody chose.
    endTime: endClock && endClock !== "23:59" ? endClock : "",
    capacity: event.capacity == null ? "" : String(event.capacity),
    endDate: endDate ?? "",
    locationType: event.locationType ?? "in_person",
    onlineUrl: event.onlineUrl ?? "",
    venueName: event.venue?.name ?? "",
    venueAddress: event.venue?.address ?? "",
    venueCity: event.venue?.city ?? "",
    ageGroup: event.ageGroup ?? "",
    gender: event.gender ?? "",
    level: event.level ?? "",
    format: event.format ?? "",
    needsOpponent: event.needsOpponent ?? false,
    listed: event.sourceName !== null,
    sourceName: event.sourceName ?? "",
    sourceUrl: event.sourceUrl ?? "",
    scheduleUrl: event.scheduleUrl ?? "",
    timezone,
  };

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link href={`/events/${slug}`} className="text-sm text-brand-text hover:underline">
        ← {event.title}
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Edit event</h1>

      <div className="mt-5 flex items-start gap-4">
        <EventLogo src={event.logoUrl} kind={event.kind} size={64} />
        <ImageUpload
          target={{ kind: "event", eventSlug: slug }}
          hasImage={Boolean(event.logoUrl)}
          onUploaded={setEventLogo.bind(null, slug)}
          onCleared={clearEventLogo.bind(null, slug)}
          label="Upload a logo"
        />
      </div>
      <p className="mt-2 text-sm text-muted">
        Who runs it and who can see it are not here: the first is what claiming
        an event means, and the second has its own control on the event page.
      </p>
      <EventForm kinds={kinds} initial={initial} />
    </div>
  );
}
