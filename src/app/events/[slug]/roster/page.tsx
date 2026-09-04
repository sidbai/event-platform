import Link from "next/link";
import { notFound } from "next/navigation";

import { db } from "@/db";
import { eventDivisions, events } from "@/db/schema";
import { requireUser } from "@/features/auth";
import { RosterForm } from "@/features/tournaments/roster-form";
import { saveRoster } from "@/features/tournaments/roster-actions";
import { managedEntry, rosterFor } from "@/features/tournaments/roster-queries";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function RosterPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await requireUser(`/events/${slug}/roster`);

  const event = await db.query.events.findFirst({
    where: eq(events.slug, slug),
    columns: { id: true, title: true },
  });
  if (!event) notFound();

  const entry = await managedEntry(event.id, user.id);
  if (!entry) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-10">
        <Link href={`/events/${slug}`} className="text-sm text-brand-text hover:underline">
          ← {event.title}
        </Link>
        <p className="mt-6 text-muted">
          You don&rsquo;t manage a team registered for this event. Claim your team on its{" "}
          <Link href="/teams" className="text-brand-text hover:underline">
            team page
          </Link>{" "}
          first.
        </p>
      </div>
    );
  }

  const division = entry.divisionId
    ? await db.query.eventDivisions.findFirst({ where: eq(eventDivisions.id, entry.divisionId) })
    : null;
  const existing = await rosterFor(entry.eventTeamId);

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link href={`/events/${slug}`} className="text-sm text-brand-text hover:underline">
        ← {event.title}
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">
        {entry.teamName} — roster
      </h1>
      <p className="mt-1 text-sm text-muted">
        {division ? `${division.label ?? division.name} division` : "This event"}. Visible to
        you and the organizer only.
      </p>

      <RosterForm
        action={saveRoster.bind(null, { eventSlug: slug, eventTeamId: entry.eventTeamId })}
        initial={existing.map((p) => ({
          name: p.playerName,
          birthYear: p.birthYear?.toString() ?? "",
          gender: p.gender ?? "",
        }))}
        min={division?.rosterMin ?? 0}
        max={division?.rosterMax ?? 30}
      />
    </div>
  );
}
