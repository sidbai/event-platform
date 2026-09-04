import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { eventKinds, teams } from "@/db/schema";
import { requireUser } from "@/features/auth";
import { EventForm } from "@/features/events/event-form";
import { canScheduleForTeam } from "@/features/teams/access";

export const dynamic = "force-dynamic";

export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string }>;
}) {
  await requireUser("/events/new");
  const { team: teamSlug } = await searchParams;

  const [kinds, hostTeam] = await Promise.all([
    db.query.eventKinds.findMany({
      orderBy: [asc(eventKinds.sort)],
      columns: { slug: true, label: true },
    }),
    teamSlug
      ? db.query.teams.findFirst({
          where: eq(teams.slug, teamSlug),
          columns: { id: true, slug: true, name: true },
        })
      : null,
  ]);

  // Don't render a team-branded form to someone who couldn't submit it anyway.
  // submitEvent re-checks regardless — this is presentation, not the guard.
  const host =
    hostTeam && (await canScheduleForTeam(hostTeam.id)) ? hostTeam : null;

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">
        {host ? `New event for ${host.name}` : "Submit an event"}
      </h1>
      <p className="mt-1 text-sm text-muted">
        {host
          ? "Everyone on the team will see it, even if you keep it private."
          : "A game, scrimmage, pickup run, tournament, watch party — anything. Fill in what you know."}
      </p>
      <EventForm kinds={kinds} hostTeam={host} />
    </div>
  );
}
