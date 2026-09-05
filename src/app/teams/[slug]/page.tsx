import Link from "next/link";
import { notFound } from "next/navigation";

import { TeamCrest } from "@/components/team-crest";
import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";
import {
  canManageTeam,
  canScheduleForTeam,
  canViewTeam,
  isTeamMember,
} from "@/features/teams/access";
import {
  acceptTeamInvite,
  declineTeamInvite,
} from "@/features/teams/invite-actions";
import { myPendingTeamInvite } from "@/features/teams/invite-queries";
import { hostedEvents } from "@/features/teams/queries";
import { getTeamBySlug, type TeamDetail } from "@/features/teams/queries";
import { startConversation } from "@/features/messages/actions";
import { ContactButton } from "@/features/messages/message-form";

export const dynamic = "force-dynamic";

function fmtDate(d: Date | null) {
  if (!d) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

export default async function TeamPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [team, user] = await Promise.all([getTeamBySlug(slug), getCurrentUser()]);
  if (!team) notFound();
  // A team someone created as private is members-only; teams auto-created for
  // an event stay open, since public standings link to them.
  if (!(await canViewTeam(team, user?.id ?? null))) notFound();

  const mine = user && team.ownerId === user.id;
  const isPrivate = team.visibility === "private";
  const admin = isAdmin(user);
  // Owner/manager only. Being on the roster is not permission to edit.
  const canEdit = await canManageTeam(team.id);
  const canSchedule = await canScheduleForTeam(team.id);
  const member = user ? await isTeamMember(team.id, user.id) : false;
  const pendingInvite = await myPendingTeamInvite(team.id, user);
  const events = await hostedEvents(team.id, member || admin);

  const back = isPrivate && team.originEvent
    ? { href: `/events/${team.originEvent.slug}`, label: `← ${team.originEvent.title}` }
    : { href: "/teams", label: "← All teams" };

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link href={back.href} className="text-sm text-brand-text hover:underline">
        {back.label}
      </Link>

      {pendingInvite && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-brand/40 bg-brand-soft px-3 py-2 text-sm">
          <span>
            You&rsquo;ve been invited to join as{" "}
            <span className="font-medium">{pendingInvite.role}</span>.
          </span>
          <form action={acceptTeamInvite.bind(null, slug)}>
            <button className="rounded-md bg-brand px-3 py-1 text-xs font-semibold text-on-brand hover:bg-brand-strong">
              Join the team
            </button>
          </form>
          <form action={declineTeamInvite.bind(null, slug)}>
            <button className="text-xs text-muted hover:text-red-600">
              No thanks
            </button>
          </form>
        </div>
      )}

      {isPrivate && (
        <div className="mt-4 rounded-md bg-elevated px-3 py-2 text-sm text-muted">
          Event team{team.originEvent ? ` — created for ${team.originEvent.title}` : ""}. Not
          listed in the public directory.
        </div>
      )}

      <header className="mt-4 flex items-center gap-4">
        <TeamCrest src={team.crestUrl} size={64} />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{team.name}</h1>
          <p className="text-sm text-muted">
            {[team.club, team.ageGroup, team.city].filter(Boolean).join(" · ") || "Youth soccer team"}
          </p>
        </div>
      </header>

      {team.bio && <p className="mt-4 text-muted">{team.bio}</p>}

      {user && !mine && (
        <div className="mt-4">
          <ContactButton
            action={startConversation.bind(null, "team", team.slug)}
            label="Message the team"
            placeholder="Ask about joining, fixtures, or a scrimmage…"
          />
        </div>
      )}



      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        {mine ? (
          <>
            <span className="rounded bg-brand-soft px-1.5 py-0.5 text-brand-soft-text">
              {"You own this team"}
            </span>
            <Link
              href={`/teams/${team.slug}/settings`}
              className="text-brand-text hover:underline"
            >
              Team settings
            </Link>
          </>
        ) : canEdit ? (
          <>
            <span className="text-muted">You manage this team</span>
            <Link
              href={`/teams/${team.slug}/settings`}
              className="text-brand-text hover:underline"
            >
              Team settings
            </Link>
          </>
        ) : team.ownerId ? (
          <span className="text-muted">
            {"Run by a coach"}
          </span>
        ) : (
          <span className="text-muted">No owner yet</span>
        )}
      </div>

      {(events.length > 0 || canSchedule) && (
        <section className="mt-8">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold">Team calendar</h2>
            {canSchedule && (
              <Link
                href={`/events/new?team=${team.slug}`}
                className="text-sm font-medium text-brand-text hover:underline"
              >
                New event →
              </Link>
            )}
          </div>
          {events.length === 0 ? (
            <p className="mt-2 text-sm text-muted">
              Nothing scheduled. Training, scrimmages and socials you add here
              are visible to the whole team.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {events.map((e) => (
                <li key={e.id}>
                  <Link
                    href={`/events/${e.slug}`}
                    className="flex items-baseline justify-between gap-3 py-2.5"
                  >
                    <span className="min-w-0">
                      <span className="font-medium">{e.title}</span>
                      {e.visibility !== "public" && (
                        <span className="ml-2 rounded-full bg-elevated px-2 py-0.5 text-xs text-muted">
                          {e.visibility}
                        </span>
                      )}
                      <span className="block text-xs capitalize text-muted">
                        {e.kind}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm text-muted">
                      {fmtDate(e.startsAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Tournaments</h2>
        {team.eventTeams.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No events yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {team.eventTeams.map((et) => (
              <li
                key={et.id}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-lg border border-line p-3"
              >
                <div>
                  <Link
                    href={`/events/${et.event.slug}`}
                    className="font-medium text-brand-text hover:underline"
                  >
                    {et.event.title}
                  </Link>
                  <span className="text-sm text-muted">
                    {" — "}
                    {et.division?.label ?? et.division?.name}
                    {et.seed === 1 && " · 🏆 champion"}
                  </span>
                </div>
                <div className="text-sm tabular-nums text-muted">
                  {fmtDate(et.event.startsAt)} · {et.won}W {et.drawn}D {et.lost}L ·{" "}
                  {et.gf}–{et.ga} · {et.points} pts
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {team.matches.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Matches</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {team.matches.map((m) => (
              <MatchRow key={m.id} match={m} teamId={team.id} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function MatchRow({
  match,
  teamId,
}: {
  match: TeamDetail["matches"][number];
  teamId: string;
}) {
  const isHome = match.homeTeamId === teamId;
  const us = isHome ? match.homeScore : match.awayScore;
  const them = isHome ? match.awayScore : match.homeScore;
  const opponent = isHome ? match.awayTeam : match.homeTeam;
  const opponentName = opponent?.name ?? (isHome ? match.awayPlaceholder : match.homePlaceholder);

  const result =
    us == null || them == null ? "" : us > them ? "W" : us < them ? "L" : "D";
  const resultColor =
    result === "W"
      ? "text-brand-text"
      : result === "L"
        ? "text-red-600"
        : "text-muted";

  return (
    <li className="flex items-center gap-2">
      <span className={`w-4 font-semibold ${resultColor}`}>{result}</span>
      <span className="w-16 text-xs uppercase tracking-wide text-muted">
        {match.stage === "ko" ? match.round : match.division?.name}
      </span>
      <span className="tabular-nums">
        {us}–{them}
      </span>
      <span className="text-muted">vs</span>
      <span className="flex items-center gap-1.5">
        <TeamCrest src={opponent?.crestUrl} size={16} />
        {opponent?.slug ? (
          <Link href={`/teams/${opponent.slug}`} className="hover:underline">
            {opponentName}
          </Link>
        ) : (
          opponentName
        )}
      </span>
    </li>
  );
}
