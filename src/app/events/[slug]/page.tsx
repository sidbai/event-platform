import Link from "next/link";
import { notFound } from "next/navigation";

import { isImported } from "@/features/discovery/sitemap-entries";

import { TeamCrest } from "@/components/team-crest";
import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";
import {
  setEventCompleted,
  setEventHidden,
  setEventVisibility,
} from "@/features/events/actions";
import { canMarkCompleted, canReopen, completionSuggestion } from "@/features/events/completion";
import { CompletionControl } from "@/features/events/completion-control";
import { startConversation } from "@/features/messages/actions";
import { ContactButton } from "@/features/messages/message-form";
import { AttendanceSection } from "@/features/attendance/section";
import { canViewEvent } from "@/features/events/can-view";
import { EventLogo } from "@/components/event-logo";
import { EventTags } from "@/features/events/event-tags";
import { DiscussionThread } from "@/features/discussion/thread";
import { OpponentSection } from "@/features/events/opponent-section";
import { getEventBySlug } from "@/features/events/queries";
import { managedEntries } from "@/features/tournaments/roster-queries";
import { describePeriods, type Rules } from "@/features/tournaments/rules-input";
import { formatEventWhen } from "@/features/events/when";
import {
  attributionOf,
  isRunHere,
  scheduleActionOf,
} from "@/features/events/listing";
import {
  describeOpenness,
  formatFee,
} from "@/features/registration/openness";
import { divisionsForRegistration } from "@/features/registration/queries";
import { CountView } from "@/features/views/count-view";
import { viewsOf } from "@/features/views/queries";
import { ViewsCount } from "@/features/views/views-count";
import { importPastedSchedule } from "@/features/sync/actions";
import { PasteForm } from "@/features/sync/connect-form";
import { crestOf } from "@/features/teams/crest";
import {
  ScheduleSection,
  type ScheduleParams,
} from "@/features/tournaments/schedule-section";

export const dynamic = "force-dynamic";

/** The main action, whether it points at our schedule or the organizer's. */
const scheduleButton =
  "inline-block rounded-md bg-brand px-4 py-2 text-sm font-semibold text-on-brand hover:bg-brand-strong";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event) return { title: "Event not found" };
  const desc =
    event.summary ??
    [event.kind, event.ageGroup, event.venue?.name].filter(Boolean).join(" · ");
  return {
    title: event.title,
    description: desc,
    openGraph: { title: event.title, description: desc },
    /*
     * An event whose schedule was read off another platform is not ours to
     * offer a search engine. It stays readable to anyone with the address —
     * that is the whole reason to hold it — and follow stays on so a crawler
     * still reaches the clubs and the pages that are ours.
     *
     * Here rather than in robots.txt because which events these are is a fact
     * in the database, and a static file cannot name them.
     */
    ...(isImported(event) ? { robots: { index: false, follow: true } } : {}),
  };
}

type Champion = { division: string; champion: string; finalist: string; finalScore: string };
type Sponsor = { name: string; url: string | null; tier: string };

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<ScheduleParams>;
}) {
  const { slug } = await params;
  const [event, user, sp] = await Promise.all([
    getEventBySlug(slug),
    getCurrentUser(),
    searchParams,
  ]);
  if (!event) notFound();

  const canManage =
    !!user && (event.organizerId === user.id || isAdmin(user));
  /*
   * Wider than canManage, and only for the import box: the person who listed
   * somebody else's tournament holds its fixtures, and a listing has no
   * organizer for them to be.
   */
  const mayImport = canManage || (!!user && event.listedBy === user.id);
  if (!(await canViewEvent(event, user))) notFound();
  const notPublic = event.status === "pending" || event.status === "cancelled";

  const champions = (event.result as { champions?: Champion[] } | null)?.champions ?? [];
  const crestByName = new Map(
    event.eventTeams.map((et) => [et.team.name, crestOf(et.team)]),
  );
  const meta = event.metadata as { sponsors?: Sponsor[]; rules?: Rules } | null;
  const sponsors = meta?.sponsors ?? [];
  const rules = meta?.rules;
  const hasRoster = event.modules.includes("roster");
  const hasAttendance = event.modules.includes("attendance");
  const myEntries =
    user && hasRoster ? await managedEntries(event.id, user.id) : [];

  // Whether a team can get in, on the page they land on. Previously the fee,
  // the places left and the closing date all lived a click deeper, so the
  // event page offered "Enter a team →" to people whose division shut in
  // August and said nothing to anyone deciding whether it was worth a look.
  // A listing points at somebody else's event. It must not offer entries,
  // rosters or a table, because none of those are ours to keep — sending a
  // parent to register here would send them somewhere nothing is listening.
  const runHere = isRunHere(event);
  const completed = event.status === "completed";
  const completion = completionSuggestion(
    { ...event, fixtures: event.matches },
    new Date(),
  );
  const attribution = attributionOf(event);
  const offsiteSchedule = scheduleActionOf(event);
  const isCompetition =
    runHere && (event.kind === "tournament" || event.kind === "league");
  /*
   * Entries stop when the organizer marks the event finished. The action
   * already refuses them; without this the page went on advertising divisions
   * as "Open for entries" two lines under a Completed tag, which is the sort
   * of contradiction a reader believes the wrong half of.
   */
  const takesEntries = isCompetition && event.status === "published";
  const entryDivisions = takesEntries
    ? await divisionsForRegistration(event.id, new Date())
    : [];
  const views = await viewsOf("event", event.id);

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      {/* Counted in the browser, so a crawler reading the schedule is not
          mistaken for a parent looking up a kickoff time. */}
      <CountView subject="event" id={event.id} />
      <Link href="/events" className="text-sm text-brand-text hover:underline">
        ← All events
      </Link>

      {event.hiddenAt && (
        <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {isAdmin(user)
            ? "You've hidden this event — nobody else can see it."
            : "An admin has taken this event down. Only you and the admins can see it."}
        </p>
      )}

      {notPublic && canManage && (
        <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {event.status === "pending"
            ? "This event is awaiting review — only you can see it."
            : "This event was declined."}
        </p>
      )}

      {canManage && event.visibility !== "public" && (
        <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-elevated px-3 py-2 text-sm text-muted">
          <span>
            {event.visibility === "private"
              ? "Private — only you and the people you invite can see this."
              : "Unlisted — not in the events list, but anyone with the link can open it."}
          </span>
          <Link
            href={`/events/${event.slug}/invite`}
            className="font-medium text-brand-text hover:underline"
          >
            Invite people →
          </Link>
        </p>
      )}

      <header className="mt-4">
        <EventTags event={event} />
        <div className="mt-2 flex items-start gap-4">
          {/* Only when there is one: the emoji square earns its place in a
              list of many events and would just be decoration here. */}
          {event.logoUrl && (
            <EventLogo src={event.logoUrl} kind={event.kind} size={72} />
          )}
          <h1 className="text-3xl font-semibold tracking-tight">{event.title}</h1>
        </div>
        {event.titleZh && (
          <p className="mt-1 text-lg text-muted">{event.titleZh}</p>
        )}
        {event.summary && <p className="mt-3 text-muted">{event.summary}</p>}
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted">Date</dt>
          <dd>{formatEventWhen(event.startsAt, event.endsAt, event.timezone, "long", event.kind)}</dd>
          {event.venue && (
            <>
              <dt className="text-muted">Venue</dt>
              <dd>
                {event.venue.mapUrl ? (
                  <a href={event.venue.mapUrl} className="text-brand-text hover:underline">
                    {event.venue.name}
                  </a>
                ) : (
                  event.venue.name
                )}
                {event.venue.address && (
                  <span className="text-muted">
                    {" — "}
                    {event.venue.address}, {event.venue.city}
                  </span>
                )}
              </dd>
            </>
          )}
          {event.host && (
            <>
              <dt className="text-muted">Host</dt>
              <dd>{event.host}</dd>
            </>
          )}
          {event.format && (
            <>
              <dt className="text-muted">Format</dt>
              <dd>{event.format}</dd>
            </>
          )}
        </dl>
        <ViewsCount views={views} className="mt-3 block text-sm text-muted" />
        {event.venue?.notes && (
          <p className="mt-3 rounded-md bg-elevated px-3 py-2 text-sm text-muted">
            {event.venue.notes}
          </p>
        )}
      </header>

      <OpponentSection event={event} />

      {hasAttendance && (
        <AttendanceSection
          eventId={event.id}
          slug={event.slug}
          capacity={event.capacity}
        />
      )}

      {champions.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Champions</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {champions.map((c) => (
              <div key={c.division} className="rounded-lg border border-line p-3">
                <div className="text-xs uppercase tracking-wide text-muted">{c.division}</div>
                <div className="mt-1 flex items-center gap-2 font-semibold">
                  <TeamCrest src={crestByName.get(c.champion)} size={24} />
                  🏆 {c.champion}
                </div>
                <div className="text-sm text-muted">
                  def. {c.finalist} ({c.finalScore})
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Entries and a table are only a thing for the kinds that have
          divisions. A pickup game has none, and a link offering either would
          go nowhere useful. */}
      {attribution && (
        <p className="mt-6 rounded-lg border border-dashed border-line px-3 py-2 text-sm text-muted">
          {attribution.href ? (
            <>
              {attribution.text.replace(/^Listed from /, "Listed from ")}{" "}
              — entries and details are on{" "}
              <a
                href={attribution.href}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="text-brand-text hover:underline"
              >
                their page
              </a>
              .
            </>
          ) : (
            attribution.text
          )}
        </p>
      )}

      {offsiteSchedule && (
        /* On every listing, including the ones we sync. What we hold is a copy
           that was right when we last read it; the organizer's page is the one
           that changes when a game moves. */
        <p className="mt-4">
          <a
            href={offsiteSchedule.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className={scheduleButton}
          >
            {offsiteSchedule.label} →
          </a>
        </p>
      )}

      {entryDivisions.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Entries
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {entryDivisions.map((d) => (
              <li key={d.id} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{d.label ?? d.name}</span>
                {d.format && <span className="text-muted">{d.format}</span>}
                <span className="text-muted">· {formatFee(d.feeCents)}</span>
                <span
                  className={d.openness.open ? "text-brand-text" : "text-muted"}
                >
                  ·{" "}
                  {describeOpenness(d.openness, d.acceptedCount, {
                    opens: fmtDay(d.registrationOpensAt, event.timezone),
                    closes: fmtDay(d.registrationClosesAt, event.timezone),
                  })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* The organizer's own tools outlive the event: entries close, but
          rosters, the checklist and the setup are still worth reaching on the
          Monday after. */}
      {isCompetition && (
        <p className="mt-8 flex flex-wrap gap-4 text-sm">
          {takesEntries && (
            <Link
              href={`/events/${event.slug}/register`}
              className="font-medium text-brand-text hover:underline"
            >
              Enter a team →
            </Link>
          )}
          {canManage && (
            <>
              <Link
                href={`/events/${event.slug}/registrations`}
                className="text-muted hover:text-ink"
              >
                Manage entries
              </Link>
              <Link
                href={`/events/${event.slug}/setup`}
                className="text-muted hover:text-ink"
              >
                Set up divisions and rules
              </Link>
              <Link
                href={`/events/${event.slug}/checklist`}
                className="text-muted hover:text-ink"
              >
                Checklist
              </Link>
            </>
          )}
        </p>
      )}

      {/*
        A listing has no entries, no rosters and no table of ours — but its
        table is worked out here from the organizer's fixtures, and that
        arithmetic depends on their scoring rules. So the one setup field a
        listing does need stays reachable for whoever manages it.
      */}
      {!isCompetition && canManage && event.matches.length > 0 && (
        <p className="mt-8 text-sm">
          <Link
            href={`/events/${event.slug}/setup`}
            className="text-muted hover:text-ink"
          >
            Set up rules and scoring
          </Link>
        </p>
      )}

      {runHere && myEntries.length > 0 && (
        <p className="mt-8 flex flex-wrap gap-4 text-sm">
          {/* One link per team. A club with two age groups in the same Cup
              used to reach only the first, and the other roster had no route
              to it at all. */}
          {myEntries.map((entry) => (
            <Link
              key={entry.eventTeamId}
              href={`/events/${event.slug}/roster?team=${entry.eventTeamId}`}
              className="font-medium text-brand-text hover:underline"
            >
              Submit {entry.teamName}&rsquo;s roster →
            </Link>
          ))}
        </p>
      )}

      {/* Visibility used to be fixed at submission with no way back. */}
      {canManage && (
        <div className="mt-8 rounded-lg border border-line bg-card p-4">
          {/* Reachable for anything the viewer manages — a listing an admin is
              fixing, a pickup game, a scrimmage — not just the kinds that take
              entries. A typo in a title is not a tournament-only problem. */}
          <p className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm font-medium">Who can see this event</span>
            <Link
              href={`/events/${event.slug}/edit`}
              className="text-sm font-medium text-brand-text hover:underline"
            >
              Edit details →
            </Link>
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(
              [
                ["public", "Public", "Listed for everyone"],
                ["unlisted", "Unlisted", "Anyone with the link"],
                ["private", "Private", "Only people you invite"],
              ] as const
            ).map(([value, label, hint]) => {
              const on = event.visibility === value;
              return (
                <form
                  key={value}
                  action={setEventVisibility.bind(null, event.slug, value)}
                >
                  <button
                    title={hint}
                    aria-pressed={on}
                    disabled={on}
                    className={
                      on
                        ? "cursor-default rounded-md border border-brand bg-brand px-3 py-1.5 text-sm font-semibold text-on-brand"
                        : "rounded-md border border-line px-3 py-1.5 text-sm hover:bg-elevated"
                    }
                  >
                    {label}
                  </button>
                </form>
              );
            })}
          </div>
          {isAdmin(user) && (
            <form
              action={setEventHidden.bind(null, event.slug, !event.hiddenAt)}
              className="mt-3 border-t border-line pt-3"
            >
              <button className="text-xs text-muted hover:text-red-600">
                {event.hiddenAt
                  ? "Unhide this event"
                  : "Hide this event (admin only)"}
              </button>
            </form>
          )}
          {(canMarkCompleted(event.status) || canReopen(event.status)) && (
            <CompletionControl
              action={setEventCompleted.bind(null, event.slug, !completed)}
              completed={completed}
              suggestion={completion}
            />
          )}

          <p className="mt-2 text-xs text-muted">
            {event.visibility === "public"
              ? "Listed on the events page and visible to everyone."
              : event.visibility === "unlisted"
                ? "Not listed, but anyone with the link can open it."
                : "Only you and the people you invite can see it."}
            {!isAdmin(user) &&
              event.visibility !== "public" &&
              " Making it public sends it for review first."}
          </p>
        </div>
      )}

      {/* Scoped contact: reaches the organizer of this event only, and only
          for someone who can already see it. */}
      {user && event.organizerId && event.organizerId !== user.id && (
        <div className="mt-8">
          <ContactButton
            action={startConversation.bind(null, "event", event.slug)}
            label="Message the organizer"
            placeholder="Ask about the event — spaces, format, directions…"
          />
        </div>
      )}

      {runHere && event.divisions.length > 0 && (
        <p className="mt-8 text-sm text-muted">
          Organizer tools:{" "}
          <Link
            href={`/events/${event.slug}/print/check-in`}
            className="text-brand-text hover:underline"
          >
            check-in sheet
          </Link>{" "}
          ·{" "}
          <Link
            href={`/events/${event.slug}/print/score-cards`}
            className="text-brand-text hover:underline"
          >
            referee score cards
          </Link>
          {canManage && (
            <>
              {" · "}
              <Link
                href={`/events/${event.slug}/scores`}
                className="font-medium text-brand-text hover:underline"
              >
                enter scores
              </Link>
            </>
          )}
        </p>
      )}

      {/*
        The import, where somebody lands after creating the event.

        It used to live only on /admin/sync, which meant building a listing
        and then hunting for it among a dozen others to bring its fixtures in.
        Same action, same guards — the only thing that moved is where the box
        is, and it is only here for whoever manages the event.
      */}
      {/* What the create form's import did, said where they land. */}
      {mayImport && (sp.imported || sp.import) && (
        <p
          className={`mt-4 rounded-md px-3 py-2 text-sm ${
            sp.import ? "bg-amber-50 text-amber-800" : "bg-elevated text-muted"
          }`}
        >
          {sp.import
            ? `The schedule was not imported: ${sp.import} You can load the files again below.`
            : `Schedule imported — ${sp.imported}`}
        </p>
      )}

      {mayImport && (
        <section className="mt-8 rounded-lg border border-line p-3">
          <h2 className="text-sm font-semibold">Bring in the schedule</h2>
          <p className="mt-1 text-xs text-muted">
            Paste the organizer&rsquo;s table, or load a file saved with the
            copier from <a href="/admin/sync" className="text-brand-text hover:underline">
              the sync page
            </a>. Fixtures and standings both land here.
          </p>
          <PasteForm action={importPastedSchedule} eventId={event.id} />
        </section>
      )}

      <ScheduleSection
        event={event}
        sp={sp}
        config={{
          system: rules?.pointsSystem,
          goalCap: rules?.goalCapPerGame,
          tiebreakers: rules?.tiebreakers,
        }}
      />

      {rules && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Rules</h2>
          {/* Each row earns its place. These were seeded complete when only a
              script could write them; now that an organizer fills them in, a
              blank one would render a label with nothing under it. */}
          <dl className="mt-3 space-y-2 text-sm">
            {rules.gameFormat && (
              <div>
                <dt className="text-muted">Format</dt>
                <dd>{rules.gameFormat}</dd>
              </div>
            )}
            {describePeriods(rules) && (
              <div>
                <dt className="text-muted">Game length</dt>
                <dd>{describePeriods(rules)}</dd>
              </div>
            )}
            {rules.advancement && (
              <div>
                <dt className="text-muted">Advancement</dt>
                <dd>{rules.advancement}</dd>
              </div>
            )}
            {rules.roster && (
              <div>
                <dt className="text-muted">Roster</dt>
                <dd>{rules.roster}</dd>
              </div>
            )}
            {rules.tiebreakers.length > 0 && (
            <div>
              <dt className="text-muted">Tiebreakers</dt>
              <dd>{rules.tiebreakers.join(" → ").replace(/_/g, " ")}</dd>
            </div>
            )}
          </dl>
        </section>
      )}

      {sponsors.length > 0 && (
        <section className="mt-10 border-t border-line pt-6">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted">Sponsors</h2>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {sponsors.map((s) => (
              <li key={s.name}>
                {s.url ? (
                  <a href={s.url} className="text-brand-text hover:underline">
                    {s.name}
                  </a>
                ) : (
                  s.name
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <DiscussionThread
        subjectType="event"
        subjectId={event.id}
        revalidate={`/events/${event.slug}`}
        canModerate={canManage}
      />
    </div>
  );
}

/** A date as the entries list says it, in the event's own timezone. */
function fmtDay(at: Date | null, timeZone: string | null) {
  if (!at) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: timeZone ?? undefined,
  }).format(at);
}
