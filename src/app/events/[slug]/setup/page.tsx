import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { canManageEvent } from "@/features/events/can-manage";
import { getEventBySlug } from "@/features/events/queries";
import { divisionsForRegistration } from "@/features/registration/queries";
import { toLocalInput } from "@/features/tournaments/division-input";
import { DatesForm } from "@/features/tournaments/dates-form";
import { DivisionEditor } from "@/features/tournaments/division-editor";
import { RulesForm } from "@/features/tournaments/rules-form";
import type { Rules } from "@/features/tournaments/rules-input";
import {
  deleteDivision,
  saveDates,
  saveDivision,
  saveRules,
} from "@/features/tournaments/setup-actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Set up" };

/**
 * Where an organizer builds the competition itself.
 *
 * Deliberately not part of creating an event: an event is created in one short
 * form and exists from that moment, and the divisions, fees and rules are the
 * work of the following week. Making them a wizard would block creating
 * anything until every answer was known, and leave the events that already
 * exist with no way to be brought up to standard.
 */
export default async function SetupPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event) notFound();
  // Same reasoning as the entry list: someone who cannot manage this event has
  // no business knowing its setup page exists.
  if (!(await canManageEvent({ slug }))) notFound();

  const divisions = await divisionsForRegistration(event.id, new Date());
  const meta = event.metadata as { rules?: Rules } | null;
  const timeZone = event.timezone ?? "America/Los_Angeles";
  // Split once here rather than in the client component, so the date and time
  // inputs are filled from the event's own zone rather than the viewer's.
  const startLocal = toLocalInput(event.startsAt, timeZone);

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link href={`/events/${slug}`} className="text-sm text-brand-text hover:underline">
        ← {event.title}
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Set up</h1>
      <p className="mt-1 text-sm text-muted">
        Times are in {timeZone.split("/").pop()?.replace(/_/g, " ")}.
      </p>

      <section className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight">Dates</h2>
        <p className="mt-1 text-sm text-muted">
          A tournament runs for days and a league for a season. Without a last
          day both read as a single afternoon.
        </p>
        <DatesForm
          kind={event.kind}
          date={startLocal.slice(0, 10)}
          time={startLocal.slice(11)}
          endDate={toLocalInput(event.endsAt, timeZone).slice(0, 10)}
          action={saveDates.bind(null, slug)}
        />
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight">Divisions</h2>
        <p className="mt-1 text-sm text-muted">
          A team enters a division, not the event. Each one carries its own age
          group, format, fee and entry window.
        </p>
        <div className="mt-4">
          <DivisionEditor
            divisions={divisions.map((d) => ({
              id: d.id,
              name: d.name,
              label: d.label,
              birthYears: d.birthYears ?? [],
              format: d.format,
              rosterMin: d.rosterMin,
              rosterMax: d.rosterMax,
              feeCents: d.feeCents,
              capacity: d.capacity,
              registrationOpensAt: d.registrationOpensAt,
              registrationClosesAt: d.registrationClosesAt,
              acceptedCount: d.acceptedCount,
            }))}
            timeZone={timeZone}
            save={saveDivision.bind(null, slug)}
            remove={deleteDivision.bind(null, slug)}
          />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight">Rules</h2>
        <p className="mt-1 text-sm text-muted">
          Shown on the event page, and the tiebreakers are what order the
          standings table.
        </p>
        <RulesForm rules={meta?.rules ?? null} action={saveRules.bind(null, slug)} />
      </section>
    </div>
  );
}
