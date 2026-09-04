import { notFound } from "next/navigation";

import { getCurrentUser } from "@/features/auth";
import { canViewEvent } from "@/features/events/can-view";
import { getEventBySlug } from "@/features/events/queries";
import { PrintButton } from "@/features/tournaments/print-button";

export const dynamic = "force-dynamic";

export default async function CheckInSheet({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [event, user] = await Promise.all([
    getEventBySlug(slug),
    getCurrentUser(),
  ]);
  if (!event) notFound();
  // These sheets carry the full team list and roster.
  if (!(await canViewEvent(event, user))) notFound();

  const date = event.startsAt
    ? new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: event.timezone ?? undefined,
      }).format(event.startsAt)
    : "";

  const sponsors =
    (event.metadata as { sponsors?: { name: string }[] } | null)?.sponsors ?? [];

  const divisions = event.divisions.map((division) => ({
    division,
    teams: event.eventTeams
      .filter((et) => et.divisionId === division.id)
      .sort((a, b) => a.team.name.localeCompare(b.team.name)),
  }));

  return (
    <main className="mx-auto max-w-[8in] px-6 py-8 text-black">
      <PrintButton />

      <header className="border-b-2 border-black pb-3">
        <h1 className="text-2xl font-bold uppercase tracking-tight">
          {event.title} — Team Check-In
        </h1>
        <p className="mt-1 text-sm">{date}</p>
        {sponsors.length > 0 && (
          <p className="mt-1 text-xs text-muted">
            Sponsors: {sponsors.map((s) => s.name).join("  ·  ")}
          </p>
        )}
      </header>

      {divisions.map(({ division, teams }) => (
        <section key={division.id} className="mt-6 break-inside-avoid">
          <h2 className="text-sm font-bold uppercase tracking-wide">
            {division.label ?? division.name} Division
          </h2>
          <table className="mt-2 w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border border-neutral-400 px-2 py-1 text-left">Team</th>
                <th className="w-24 border border-neutral-400 px-2 py-1">Arrived</th>
                <th className="w-40 border border-neutral-400 px-2 py-1">Notes</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((et) => (
                <tr key={et.id}>
                  <td className="border border-neutral-400 px-2 py-2">{et.team.name}</td>
                  <td className="border border-neutral-400 px-2 py-2 text-center text-lg">☐</td>
                  <td className="border border-neutral-400 px-2 py-2"></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </main>
  );
}
