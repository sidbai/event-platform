import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { canManageEvent } from "@/features/events/can-manage";
import { getEventBySlug } from "@/features/events/queries";
import {
  setRegistrationStatus,
  withdrawRegistration,
} from "@/features/registration/actions";
import { formatFee } from "@/features/registration/openness";
import {
  divisionsForRegistration,
  registrationsForEvent,
} from "@/features/registration/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Entries" };

const STATUS_STYLE: Record<string, string> = {
  requested: "bg-elevated text-muted",
  accepted: "bg-brand-soft text-brand-soft-text",
  waitlisted: "bg-amber-100 text-amber-800",
  declined: "bg-elevated text-muted",
  withdrawn: "bg-elevated text-muted",
};

export default async function RegistrationsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event) notFound();
  // Not an authorisation error page: someone who cannot manage this event has
  // no business knowing the entry list exists.
  if (!(await canManageEvent({ slug }))) notFound();

  const [registrations, divisions] = await Promise.all([
    registrationsForEvent(event.id),
    divisionsForRegistration(event.id, new Date()),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link href={`/events/${slug}`} className="text-sm text-brand-text hover:underline">
        ← {event.title}
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Entries</h1>
      <p className="mt-1 text-sm text-muted">
        Accepting a team takes a place in the division and puts it in the
        standings. Everything else leaves the place open.
      </p>

      <ul className="mt-6 space-y-1 text-sm">
        {divisions.map((d) => (
          <li key={d.id} className="flex flex-wrap items-baseline gap-2">
            <span className="font-medium">{d.name}</span>
            <span className="text-muted">
              {d.acceptedCount}
              {d.capacity !== null && ` of ${d.capacity}`} accepted ·{" "}
              {formatFee(d.feeCents)}
            </span>
          </li>
        ))}
      </ul>

      {registrations.length === 0 ? (
        <p className="mt-8 text-muted">No entries yet.</p>
      ) : (
        <ul className="mt-8 divide-y divide-line">
          {registrations.map((r) => (
            <li key={r.id} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    href={`/teams/${r.team?.slug}`}
                    className="font-medium text-brand-text hover:underline"
                  >
                    {r.team?.name ?? "Team"}
                  </Link>
                  <span className="ml-2 text-sm text-muted">
                    {r.division?.name}
                    {r.team?.ageGroup && ` · ${r.team.ageGroup}`}
                  </span>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    STATUS_STYLE[r.status] ?? "bg-elevated text-muted"
                  }`}
                >
                  {r.status}
                </span>
              </div>

              {/*
                Normally the status says it all. This line only earns its space
                when the two disagree — a team left in the competition after
                being declined, because it already had fixtures and pulling it
                out would leave matches naming a team with no standings row.
              */}
              {r.inCompetition && r.status !== "accepted" && (
                <p className="mt-1 text-xs text-amber-700">
                  Still in the schedule — it already has fixtures. Delete those
                  first if it really is out.
                </p>
              )}

              {r.note && (
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted">
                  {r.note}
                </p>
              )}

              <div className="mt-2 flex flex-wrap gap-3 text-xs">
                {r.status !== "accepted" && (
                  <form
                    action={setRegistrationStatus.bind(null, slug, r.id, "accepted")}
                  >
                    <button className="font-medium text-brand-text hover:underline">
                      Accept
                    </button>
                  </form>
                )}
                {r.status !== "waitlisted" && (
                  <form
                    action={setRegistrationStatus.bind(null, slug, r.id, "waitlisted")}
                  >
                    <button className="text-muted hover:text-ink">Waitlist</button>
                  </form>
                )}
                {r.status !== "declined" && (
                  <form
                    action={setRegistrationStatus.bind(null, slug, r.id, "declined")}
                  >
                    <button className="text-muted hover:text-red-600">Decline</button>
                  </form>
                )}
                {r.status !== "withdrawn" && (
                  <form action={withdrawRegistration.bind(null, slug, r.id)}>
                    <button className="text-muted hover:text-ink">
                      Mark withdrawn
                    </button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
