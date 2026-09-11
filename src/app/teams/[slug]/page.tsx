import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";

import { TeamCrest } from "@/components/team-crest";
import { SubscribeLink } from "@/features/calendar/subscribe-link";
import { getCurrentUser } from "@/features/auth";
import { toggleFollow } from "@/features/teams/follow-actions";
import { FollowButton } from "@/features/teams/follow-button";
import { isFollowing } from "@/features/teams/follow-queries";
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
import { addTeamResult, searchOpponents } from "@/features/teams/add-result-actions";
import { AddResultForm } from "@/features/teams/add-result-form";
import { NextUpPanel } from "@/features/teams/next-up";
import { playedAndNext } from "@/features/teams/preview";
import { hostedEvents, nextUpFor } from "@/features/teams/queries";
import { pendingEntriesForTeam } from "@/features/registration/queries";
import { getTeamBySlug, type TeamDetail } from "@/features/teams/queries";
import { startConversation } from "@/features/messages/actions";
import { ContactButton } from "@/features/messages/message-form";
import { CreateLink } from "@/components/create-link";
import { formatEventWhen } from "@/features/events/when";
import { formatBirthYears } from "@/features/teams/age";
import { PerformancePanel } from "@/features/teams/performance-panel";
import { formatRecord, recordFrom } from "@/features/teams/record";
import { teamBySoleOldSlug } from "@/features/teams/merge";
import { requestTeamClaim } from "@/features/teams/claim-actions";
import { ClaimTeamForm } from "@/features/teams/claim-form";
import { myTeamClaim } from "@/features/teams/claim-queries";
import { canRequestClaim } from "@/features/teams/claim";
import { shootout } from "@/features/events/score-label";
import { honoursByEvent, PLACE_LABEL } from "@/features/teams/honours";
import { crestOf } from "@/features/teams/crest";

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

  /*
   * A slug this team used to answer to. Merging duplicate rows retires the
   * losers' addresses, and every fixture on the site links to a team by slug —
   * so an old link redirects rather than 404s, and whatever search has indexed
   * keeps working.
   */
  if (!team) {
    const current = await teamBySoleOldSlug(slug);
    if (current) permanentRedirect(`/teams/${current}`);
  }

  const pending = team ? await pendingEntriesForTeam(team.id) : [];
  if (!team) notFound();

  // Only ever "do I follow this" — see follow-queries.
  const following = user ? await isFollowing(user.id, team.id) : false;
  // A team someone created as private is members-only; teams auto-created for
  // an event stay open, since public standings link to them.
  if (!(await canViewTeam(team, user?.id ?? null))) notFound();

  const mine = user && team.ownerId === user.id;
  const admin = isAdmin(user);
  // Owner/manager only. Being on the roster is not permission to edit.
  const canEdit = await canManageTeam(team.id);
  const canSchedule = await canScheduleForTeam(team.id);
  const member = user ? await isTeamMember(team.id, user.id) : false;
  const pendingInvite = await myPendingTeamInvite(team.id, user);

  /*
   * The way in for whoever runs this team — coach, manager, club
   * administrator, or the parent who does the fixtures.
   *
   * Nearly every team here was made by an import, with nobody behind it, so
   * for most readers of most team pages this is the only thing on the page
   * they could act on — and until now there was nothing.
   */
  const existingClaim = user ? await myTeamClaim(team.id, user.id) : null;
  const mayClaim =
    !canEdit &&
    canRequestClaim(
      team,
      user ? { id: user.id, admin } : null,
      existingClaim?.status ?? null,
    );
  /*
   * A signed-out visitor who runs the team is who this exists for, and the rule
   * refuses them for the right reason — a claim needs a claimant. Refusing
   * them silently would mean they never learn the door is there, so the door
   * is shown and it goes through sign-in.
   */
  const couldClaimIfSignedIn =
    !user && canRequestClaim(team, { id: "anyone", admin: false }, null);
  const events = await hostedEvents(team.id, member || admin);
  // Two queries, and only when there is a game to preview.
  const nextUp = await nextUpFor(team.id, team.matches);

  /*
   * Always the directory.
   *
   * This used to send an event-created team back to the tournament that made
   * it, on the reasoning that no other page listed it so that is where the
   * reader must have come from. That stopped being true when /teams began
   * listing every team: a reader arriving from the directory, a search or a
   * club page was offered "back" to a tournament they had never seen.
   *
   * Where the team came from is still worth saying, and the note below says
   * it — with the event linked, so nothing that was reachable is lost.
   */
  const back = { href: "/teams", label: "← All teams" };

  /*
   * What they won, worked out from the finals already loaded with the rest
   * of the team's games — and, for a tournament with no final, from the
   * whole division's table. No stored placing to fall out of step with a
   * score corrected the day after.
   */
  const honours = honoursByEvent(team.matches, team.id, team.divisionMatches);

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


      <header className="mt-4 flex items-center gap-4">
        {/* A team's own crest, else its club's — read at render, so a club
            changing its logo changes every team under it and a team filed
            under the right club gets the right badge with nothing to
            backfill. 22 of 966 teams have a crest; every club does. */}
        <TeamCrest src={crestOf(team)} size={64} />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{team.name}</h1>
          <p className="text-sm text-muted">
            {/* Birth years lead, and the age group follows only when there
                are none: "2013/2014" still means the same children next
                September and "U13" does not. */}
            {[
              // The club's stream sits with the club, because "Crossfire
              // Select" and "Seattle United Shoreline" are how people say it.
              [team.club?.name, team.program].filter(Boolean).join(" ") || null,
              formatBirthYears(team.birthYears) ?? team.ageGroup,
              team.gender === "boys" ? "Boys" : team.gender === "girls" ? "Girls" : null,
              // The tier is what tells this team from its club's other sides
              // in the same age group — 48 groups here need it to differ.
              team.tier,
              team.city,
            ]
              .filter(Boolean)
              .join(" · ") || "Youth soccer team"}
          </p>
        </div>

        {/*
         * Follow sits with the name rather than at the foot of the page,
         * because it is the one thing on here a passing parent can do — and
         * signing in is asked for at the moment somebody wants it, not before.
         */}
        <div className="ml-auto self-start">
          {user ? (
            <FollowButton
              following={following}
              toggle={toggleFollow.bind(null, team.slug)}
            />
          ) : (
            <Link
              href={`/signin?next=${encodeURIComponent(`/teams/${team.slug}`)}`}
              className="rounded-md border border-line px-3 py-1.5 text-sm font-medium hover:bg-elevated"
            >
              Follow
            </Link>
          )}
        </div>
      </header>

      {/*
       * Said once, quietly, and only where it is true.
       *
       * This was a boxed notice naming the event that created the row, which
       * went wrong twice over: it appeared on 963 of 966 team pages, where a
       * notice that universal is chrome rather than information; and it named
       * one event for teams that have played four, while the Events section
       * below already lists every one of them correctly.
       *
       * What is worth keeping is that nobody from the team wrote this page,
       * so a reader does not take a thin one for the club's own.
       */}
      {!team.ownerId && (
        <p className="mt-2 text-xs text-muted">
          Compiled from tournament schedules — not maintained by the team.
        </p>
      )}

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
            {"Run by its team"}
          </span>
        ) : (
          <span className="text-muted">No owner yet</span>
        )}
      </div>

      {mayClaim && (
        <ClaimTeamForm action={requestTeamClaim.bind(null, team.slug)} />
      )}
      {couldClaimIfSignedIn && (
        <p className="mt-4 text-sm text-muted">
          Is this your team?{" "}
          <Link
            href={`/signin?next=${encodeURIComponent(`/teams/${team.slug}`)}`}
            className="text-brand-text hover:underline"
          >
            Sign in to ask to manage it
          </Link>
          .
        </p>
      )}
      {existingClaim?.status === "pending" && (
        <p className="mt-4 rounded-md border border-line bg-elevated px-3 py-2 text-sm text-muted">
          Your request to manage this team is waiting for an admin.
        </p>
      )}

      {nextUp && (
        <NextUpPanel
          nextUp={nextUp}
          teamName={team.name}
          timezone={
            team.matches.find((m) => m.id === nextUp.fixture.id)?.event?.timezone ?? null
          }
        />
      )}

      {(events.length > 0 || canSchedule) && (
        <section className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Team calendar</h2>
            {canSchedule && (
              <CreateLink href={`/events/new?team=${team.slug}`}>
                Start an event
              </CreateLink>
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
        <h2 className="text-lg font-semibold">Events</h2>

        {/* Entries the organizer has not decided on yet. Without these the
            page reads "No events yet" straight after a team has entered one,
            which is the moment they are most likely to be looking. */}
        {pending.length > 0 && (
          <ul className="mt-3 space-y-2">
            {pending.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-lg border border-dashed border-line p-3"
              >
                <div>
                  <Link
                    href={`/events/${r.event?.slug}`}
                    className="font-medium text-brand-text hover:underline"
                  >
                    {r.event?.title}
                  </Link>
                  <span className="text-sm text-muted">
                    {" — "}
                    {r.division?.label ?? r.division?.name}
                  </span>
                </div>
                <span className="text-xs text-muted">
                  {r.status === "waitlisted" ? "Waitlisted" : "Awaiting a decision"}
                </span>
              </li>
            ))}
          </ul>
        )}

        {team.eventTeams.length === 0 ? (
          pending.length === 0 && (
            <p className="mt-2 text-sm text-muted">No events yet.</p>
          )
        ) : (
          <ul className="mt-3 space-y-2">
            {team.eventTeams.map((et) => (
              <li
                key={et.id}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-lg border border-line p-3"
              >
                <div>
                  {/* Not linked when it is a placeholder standing in for a
                      competition nobody here carries: a draft's page is
                      refused to everyone but whoever made it, so the link
                      would be a wall. Same rule as the match rows below. */}
                  {et.event.status === "draft" ? (
                    <span className="font-medium">{et.event.title}</span>
                  ) : (
                    <Link
                      href={`/events/${et.event.slug}`}
                      className="font-medium text-brand-text hover:underline"
                    >
                      {et.event.title}
                    </Link>
                  )}
                  {/* What that tournament called this side. Shown only when
                      it differs, since a team is named four ways across four
                      schedules and this is the page that reconciles them. */}
                  {et.sourceName && et.sourceName !== team.name && (
                    <span className="block text-xs text-muted">
                      entered as {et.sourceName}
                    </span>
                  )}
                  <span className="text-sm text-muted">
                    {" — "}
                    {et.division?.label ?? et.division?.name}
                  </span>
                  {/* The organizer's own seeding is kept as a second source:
                      an event can name a champion without a final row here,
                      which is how King Juan Cup 2026's were recorded. */}
                  {(honours.get(et.eventId) ?? (et.seed === 1 ? "champion" : null)) && (
                    <span className="ml-2 whitespace-nowrap rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand-soft-text">
                      {PLACE_LABEL[honours.get(et.eventId) ?? "champion"]}
                    </span>
                  )}
                </div>
                <div className="text-sm tabular-nums text-muted">
                  {fmtDate(et.event.startsAt)} ·{" "}
                  {(() => {
                    /*
                     * The organizer's own figures when we hold them — an
                     * imported standings table, or an event run here — and
                     * otherwise counted from the games themselves. This line
                     * used to read the stored columns unconditionally, which
                     * a connector never fills, so every synced team showed
                     * "0W 0D 0L · 0–0" directly above a list of its results.
                     */
                    if (et.played > 0) {
                      return `${formatRecord(et)} · ${et.points} pts`;
                    }
                    const inThisEvent = team.matches.filter(
                      (m) => m.eventId === et.eventId,
                    );
                    const record = recordFrom(inThisEvent, team.id);
                    // No points: they are our arithmetic, not this
                    // tournament's, and the page has no business claiming them.
                    return record.played > 0 ? formatRecord(record) : "not played yet";
                  })()}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Also when there are none: a team with nothing here is the one that
          most needs somewhere to put its results. */}
      {(team.matches.length > 0 || canSchedule) && (
        <section className="mt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <h2 className="text-lg font-semibold">Matches</h2>
            {/* The whole record in one line, because "how has this team been
                doing" is the question the page is here to answer and it was
                only answerable by counting the list below by eye. */}
            {(() => {
              const all = recordFrom(team.matches, team.id);
              return all.played > 0 ? (
                <p className="text-sm tabular-nums text-muted">
                  {all.played} played · {formatRecord(all)}
                </p>
              ) : null;
            })()}
          </div>
          <PerformancePanel
            matches={team.matches}
            teamId={team.id}
            addedByTeam={
              team.matches.filter(
                (m) =>
                  m.event?.status === "draft" &&
                  (m.homeScore !== null || m.awayScore !== null),
              ).length
            }
          />
          {canSchedule && (
            <AddResultForm
              action={addTeamResult.bind(null, team.slug)}
              search={searchOpponents.bind(null, team.id)}
            />
          )}
          {/*
            What has happened, and the one game that has not yet.
            
            A season's fixtures are published all at once: this team's page
            carried twenty-four ECNL dates running to May above every result
            it had, so the record was three screens down. The rest of the
            fixture list is the event's to show, where it can be read a round
            at a time.
            
            The next one stays because the list should stand on its own — the
            panel above says more about it, but only renders when the opponent
            resolves to a team here.
          */}
          <ul className="mt-3 space-y-1 text-sm">
            {playedAndNext(team.matches).map((m) => (
              <MatchRow key={m.id} match={m} teamId={team.id} />
            ))}
          </ul>
          {/*
            Under the list rather than at the top: somebody reads the fixtures
            first and wants them somewhere else second.
          */}
          <SubscribeLink path={`/teams/${team.slug}/fixtures.ics`} what="these fixtures" />
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

  /*
   * Which competition, and when.
   *
   * A list of scores against names is unreadable for a team that has played
   * four tournaments: "3–1 vs Seattle Celtic B12" says nothing about whether
   * that was last weekend or last spring, or which cup it counted in. The
   * date is the organizer's, not the reader's — see the query.
   */
  const round = match.stage === "ko" ? match.round : match.division?.name;
  const when = match.kickoffAt
    ? formatEventWhen(match.kickoffAt, null, match.event?.timezone ?? null, "short")
    : null;

  return (
    <li className="py-1.5">
      <div className="flex items-center gap-2">
        <span className={`w-4 font-semibold ${resultColor}`}>{result}</span>
        <span className="tabular-nums">
          {us}–{them}
          {/* A level knockout was decided somewhere; say where. */}
          {shootout(match) && (
            <span className="text-muted">
              {" "}
              ({isHome ? shootout(match)!.home : shootout(match)!.away}–
              {isHome ? shootout(match)!.away : shootout(match)!.home} pens)
            </span>
          )}
        </span>
        <span className="text-muted">vs</span>
        <span className="flex min-w-0 items-center gap-1.5">
          <TeamCrest
            src={crestOf(opponent)}
            size={16}
          />
          {opponent?.slug ? (
            <Link href={`/teams/${opponent.slug}`} className="truncate hover:underline">
              {opponentName}
            </Link>
          ) : (
            <span className="truncate">{opponentName}</span>
          )}
        </span>
      </div>
      {/* Indented under the result, so a column of scores stays scannable and
          the context is there for the one row being read. */}
      <div className="ml-6 text-xs text-muted">
        {/*
          A placeholder standing in for a competition nobody here carries is a
          draft, and a draft's page is refused to everyone but whoever made it.
          So the name is written, and not linked: a reader following it would
          land on a wall, and the name is the whole of what the row needs.
        */}
        {match.event?.slug && match.event.status !== "draft" ? (
          <Link href={`/events/${match.event.slug}`} className="hover:underline">
            {match.event.title}
          </Link>
        ) : (
          <>
            <span>{match.event?.title}</span>
            {/* Said on the row, not only in the total: a reader comparing two
                teams should be able to see which results came from an
                organizer and which from the side's own people. */}
            <span className="ml-1.5 rounded bg-elevated px-1 py-0.5 text-[10px] uppercase tracking-wide">
              added by the team
            </span>
          </>
        )}
        {[round, when].filter(Boolean).map((bit) => (
          <span key={bit}> · {bit}</span>
        ))}
      </div>
    </li>
  );
}
