import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getCurrentUser } from "@/features/auth";
import { canManageEvent } from "@/features/events/can-manage";
import { getEventBySlug } from "@/features/events/queries";
import { registerNewTeam, registerTeam } from "@/features/registration/actions";
import { describeOpenness, formatFee } from "@/features/registration/openness";
import {
  divisionsForRegistration,
  myManagedTeams,
  myRegistrations,
} from "@/features/registration/queries";
import { RegisterForm } from "@/features/registration/register-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Enter a team" };

function fmtDate(d: Date | null, tz: string | null) {
  if (!d) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: tz ?? undefined,
  }).format(d);
}

const STATUS_LABEL: Record<string, string> = {
  requested: "Entry requested",
  accepted: "Entered",
  waitlisted: "On the waitlist",
  declined: "Not accepted",
  withdrawn: "Withdrawn",
};

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [event, user] = await Promise.all([getEventBySlug(slug), getCurrentUser()]);
  if (!event) notFound();

  // Entries are for the things that take them. A pickup game does not have
  // divisions, and offering a registration page for one would be noise.
  if (event.kind !== "tournament" && event.kind !== "league") notFound();

  const now = new Date();
  const [divisions, teams, mayManage] = await Promise.all([
    divisionsForRegistration(event.id, now),
    user ? myManagedTeams(user.id) : Promise.resolve([]),
    canManageEvent({ slug }),
  ]);
  const mine = user
    ? await myRegistrations(
        event.id,
        teams.map((t) => t.id),
      )
    : new Map<string, string>();

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link href={`/events/${slug}`} className="text-sm text-brand-text hover:underline">
        ← {event.title}
      </Link>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Enter a team</h1>
        {mayManage && (
          <Link
            href={`/events/${slug}/registrations`}
            className="text-sm text-brand-text hover:underline"
          >
            Manage entries
          </Link>
        )}
      </div>

      {divisions.length === 0 ? (
        <p className="mt-6 text-muted">
          No divisions yet. The organizer adds these before entries open.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {divisions.map((d) => {
            const closes = fmtDate(d.registrationClosesAt, event.timezone);
            const opens = fmtDate(d.registrationOpensAt, event.timezone);
            return (
              <li
                key={d.id}
                className="rounded-xl border border-line bg-card p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <span className="font-medium">{d.name}</span>
                    {d.label && (
                      <span className="ml-2 text-sm text-muted">{d.label}</span>
                    )}
                    {d.format && (
                      <span className="ml-2 text-sm text-muted">· {d.format}</span>
                    )}
                  </div>
                  <span className="text-sm font-medium">
                    {formatFee(d.feeCents)}
                  </span>
                </div>

                <div className="mt-1 text-xs text-muted">
                  {describeOpenness(d.openness, d.acceptedCount, { opens, closes })}
                </div>

                {/* The fee is shown so a team knows the commitment; the
                    organizer collects it themselves. Saying so here stops
                    anyone waiting for a payment screen that does not exist. */}
                {d.feeCents !== null && d.openness.open && (
                  <p className="mt-1 text-xs text-muted">
                    Paid to the organizer, not through this site.
                  </p>
                )}

                <RegisterForm
                  action={registerTeam.bind(null, slug)}
                  newTeamAction={registerNewTeam.bind(null, slug)}
                  divisionId={d.id}
                  teams={teams}
                  existing={Object.fromEntries(
                    teams
                      .map((t) => [t.id, mine.get(`${d.id}:${t.id}`)] as const)
                      .filter(([, v]) => v)
                      .map(([k, v]) => [k, STATUS_LABEL[v!] ?? v!]),
                  )}
                  open={d.openness.open}
                  signedIn={Boolean(user)}
                  signInHref={`/signin?next=${encodeURIComponent(`/events/${slug}/register`)}`}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
