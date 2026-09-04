import Link from "next/link";

import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";

import { getEventOffers, teamsManagedBy, type EventDetail } from "./queries";
import { respondToOffer, sendOffer } from "./offer-actions";
import { OfferForm } from "./offer-form";

export async function OpponentSection({ event }: { event: EventDetail }) {
  const user = await getCurrentUser();
  const [offers, myTeams] = await Promise.all([
    getEventOffers(event.id),
    user ? teamsManagedBy(user.id) : Promise.resolve([]),
  ]);

  const canManage = !!user && (event.organizerId === user.id || isAdmin(user));
  const alreadyOffered = new Set(offers.map((o) => o.fromTeamId));
  const offerableTeams = myTeams.filter((t) => !alreadyOffered.has(t.id));

  if (!event.needsOpponent && offers.length === 0 && !event.awayTeamId) return null;

  return (
    <section className="mt-10 rounded-lg border border-amber-200 bg-amber-50/60 p-4">
      <h2 className="text-lg font-semibold">
        {event.needsOpponent ? "Looking for an opponent" : "Opponent"}
      </h2>

      {event.needsOpponent ? (
        user ? (
          offerableTeams.length > 0 ? (
            <OfferForm action={sendOffer.bind(null, event.slug)} teams={offerableTeams} />
          ) : myTeams.length > 0 ? (
            <p className="mt-2 text-sm text-muted">
              You&rsquo;ve already offered every team you manage.
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted">
              <Link href="/teams" className="text-brand-text hover:underline">
                Claim a team
              </Link>{" "}
              to send an offer.
            </p>
          )
        ) : (
          <p className="mt-2 text-sm text-muted">
            <Link href="/signin" className="text-brand-text hover:underline">
              Sign in
            </Link>{" "}
            to offer a team.
          </p>
        )
      ) : (
        <p className="mt-2 text-sm text-muted">
          Opponent confirmed.
        </p>
      )}

      {canManage && offers.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-medium text-muted">Offers</h3>
          <ul className="mt-2 space-y-2">
            {offers.map((offer) => (
              <li
                key={offer.id}
                className="rounded-md border border-line bg-card p-3 text-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <Link
                    href={`/teams/${offer.fromTeam.slug}`}
                    className="font-medium text-brand-text hover:underline"
                  >
                    {offer.fromTeam.name}
                  </Link>
                  <span className="text-xs uppercase tracking-wide text-muted">
                    {offer.status}
                  </span>
                </div>
                {offer.message && (
                  <p className="mt-1 whitespace-pre-wrap text-muted">
                    {offer.message}
                  </p>
                )}
                {offer.status === "pending" && (
                  <div className="mt-2 flex gap-2">
                    <form action={respondToOffer.bind(null, event.slug, offer.id, true)}>
                      <button className="rounded-md bg-brand px-3 py-1 font-medium text-white hover:bg-brand-strong">
                        Accept
                      </button>
                    </form>
                    <form action={respondToOffer.bind(null, event.slug, offer.id, false)}>
                      <button className="rounded-md border border-line px-3 py-1 hover:bg-elevated">
                        Decline
                      </button>
                    </form>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
