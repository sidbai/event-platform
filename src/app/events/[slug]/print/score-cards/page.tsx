import { notFound } from "next/navigation";

import { getCurrentUser } from "@/features/auth";
import { canViewEvent } from "@/features/events/can-view";
import { getEventBySlug } from "@/features/events/queries";
import { PrintButton } from "@/features/tournaments/print-button";

export const dynamic = "force-dynamic";

type Rules = {
  gameFormat?: string;
  tiebreakers?: string[];
  conduct?: string;
  advancement?: string;
};

export default async function ScoreCards({
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

  const rules = (event.metadata as { rules?: Rules } | null)?.rules;

  const fmtTime = (d: Date | null) =>
    d
      ? new Intl.DateTimeFormat("en-US", {
          hour: "numeric",
          minute: "2-digit",
          timeZone: event.timezone ?? undefined,
        }).format(d)
      : "";

  const games = [...event.matches].sort((a, b) => {
    const at = a.kickoffAt?.getTime() ?? 0;
    const bt = b.kickoffAt?.getTime() ?? 0;
    return at - bt || (a.field ?? "").localeCompare(b.field ?? "");
  });

  return (
    <main className="mx-auto max-w-[8in] px-6 py-8 text-black">
      <PrintButton />

      <header className="border-b-2 border-black pb-3">
        <h1 className="text-2xl font-bold uppercase tracking-tight">
          {event.title} — Referee Score Card
        </h1>
        <p className="mt-1 text-sm">Record the score for every game. Hand cards back to the check-in tent.</p>
      </header>

      <table className="mt-5 w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border border-neutral-400 px-2 py-1">Time</th>
            <th className="border border-neutral-400 px-2 py-1">Field</th>
            <th className="border border-neutral-400 px-2 py-1">Div / Round</th>
            <th className="border border-neutral-400 px-2 py-1 text-left">Home</th>
            <th className="w-14 border border-neutral-400 px-2 py-1">Home</th>
            <th className="w-14 border border-neutral-400 px-2 py-1">Away</th>
            <th className="border border-neutral-400 px-2 py-1 text-left">Away</th>
          </tr>
        </thead>
        <tbody>
          {games.map((m) => (
            <tr key={m.id} className="break-inside-avoid">
              <td className="border border-neutral-400 px-2 py-2 text-center tabular-nums">
                {fmtTime(m.kickoffAt)}
              </td>
              <td className="border border-neutral-400 px-2 py-2 text-center">{m.field}</td>
              <td className="border border-neutral-400 px-2 py-2 text-center text-xs uppercase">
                {m.division?.name}
                {m.stage === "ko" ? ` · ${m.round}` : m.groupLabel ? ` · G${m.groupLabel}` : ""}
              </td>
              <td className="border border-neutral-400 px-2 py-2">
                {m.homeTeam?.name ?? m.homePlaceholder}
              </td>
              <td className="border border-neutral-400 px-2 py-2 text-center text-lg tabular-nums">
                {m.homeScore ?? ""}
              </td>
              <td className="border border-neutral-400 px-2 py-2 text-center text-lg tabular-nums">
                {m.awayScore ?? ""}
              </td>
              <td className="border border-neutral-400 px-2 py-2">
                {m.awayTeam?.name ?? m.awayPlaceholder}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {rules && (
        <section className="mt-6 break-inside-avoid border border-neutral-400 p-3 text-xs">
          <h2 className="text-sm font-bold uppercase tracking-wide">Quick rules</h2>
          <dl className="mt-2 space-y-1">
            {rules.gameFormat && (
              <div>
                <dt className="inline font-semibold">Format: </dt>
                <dd className="inline">{rules.gameFormat}</dd>
              </div>
            )}
            {rules.advancement && (
              <div>
                <dt className="inline font-semibold">Advancement: </dt>
                <dd className="inline">{rules.advancement}</dd>
              </div>
            )}
            {rules.tiebreakers && rules.tiebreakers.length > 0 && (
              <div>
                <dt className="inline font-semibold">Tiebreakers: </dt>
                <dd className="inline">
                  {rules.tiebreakers.join(" → ").replace(/_/g, " ")}
                </dd>
              </div>
            )}
            {rules.conduct && (
              <div>
                <dt className="inline font-semibold">Conduct: </dt>
                <dd className="inline">{rules.conduct}</dd>
              </div>
            )}
          </dl>
        </section>
      )}
    </main>
  );
}
