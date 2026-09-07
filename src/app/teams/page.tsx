import Link from "next/link";
import type { Metadata } from "next";

import { CreateLink } from "@/components/create-link";
import { NavSelect } from "@/components/nav-select";
import { TeamCrest } from "@/components/team-crest";
import { SearchBar } from "@/components/search-bar";
import { getCurrentUser } from "@/features/auth";
import { formatBirthYears } from "@/features/teams/age";
import { Pager } from "@/features/pagination/pager";
import { paginate, parsePage, PER_PAGE } from "@/features/pagination/paginate";
import {
  listTeams,
  myTeams,
  pinnedClubs,
  teamAgeGroups,
  teamCounts,
} from "@/features/teams/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Teams",
  description:
    "Youth soccer teams around Seattle — club teams and teams put together for a tournament, with the games they have played.",
};

type Card = {
  id: string;
  slug: string;
  name: string;
  crestUrl: string | null;
  ageGroup: string | null;
  birthYears?: number[];
  tier?: string | null;
  program?: string | null;
  city: string | null;
  club?: { name: string; crestUrl: string | null } | null;
};

function TeamCard({ team, note }: { team: Card; note?: string }) {
  // Birth years where we have them, the printed age group where we do not.
  const meta = [
    [team.club?.name, team.program].filter(Boolean).join(" ") || null,
    formatBirthYears(team.birthYears) ?? team.ageGroup,
    team.tier,
    team.city,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li>
      <Link
        href={`/teams/${team.slug}`}
        className="flex items-center gap-3 rounded-lg border border-line p-3 transition-colors hover:bg-elevated"
      >
        {/*
         * A team's own crest, else its club's.
         *
         * 22 of 966 teams have a crest and every club has one, so falling
         * back is the difference between a directory of grey squares and a
         * directory that looks like the clubs it lists. Read at render rather
         * than copied into the row: a club changing its crest changes these
         * with it, and re-filing a team under the right club fixes its badge
         * with no backfill to remember.
         */}
        <TeamCrest src={team.crestUrl ?? team.club?.crestUrl} size={36} />
        <div className="min-w-0">
          <div className="truncate font-medium">{team.name}</div>
          <div className="truncate text-xs text-muted">
            {[meta, note].filter(Boolean).join(" · ")}
          </div>
        </div>
      </Link>
    </li>
  );
}

const CATEGORIES = [
  { key: "", label: "All" },
  { key: "club", label: "Club teams" },
  { key: "independent", label: "Community teams" },
] as const;

export default async function TeamsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    type?: string;
    club?: string;
    age?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const type = sp.type === "club" || sp.type === "independent" ? sp.type : "";
  const club = (sp.club ?? "").trim();
  const age = (sp.age ?? "").trim().toUpperCase();

  const user = await getCurrentUser();
  const [counts, allAges, pinned, ageGroups, mine] = await Promise.all([
    teamCounts({ q, club, age }),
    // Without the age filter, for the option that clears it: "All ages (29)"
    // while showing 29 of 939 describes the page you are on, not the one the
    // option leads to.
    teamCounts({ q, club }),
    pinnedClubs(),
    teamAgeGroups({ q, club }),
    user ? myTeams(user.id) : Promise.resolve([]),
  ]);

  const first = await listTeams({
    q,
    affiliation: type,
    club,
    age,
    window: { limit: PER_PAGE, offset: 0 },
  });
  const pagination = paginate(first.total, parsePage(sp.page));
  const { rows: teams } =
    pagination.offset === 0
      ? first
      : await listTeams({
          q,
          affiliation: type,
          club,
          age,
          window: { limit: PER_PAGE, offset: pagination.offset },
        });

  const mineIds = new Set(mine.map((t) => t.id));
  const others = teams.filter((t) => !mineIds.has(t.id));

  /** Keeps every other filter when one of them is changed. */
  const href = (next: { type?: string; club?: string; age?: string }) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    const t = next.type ?? type;
    if (t) params.set("type", t);
    const c = next.club ?? club;
    if (c) params.set("club", c);
    const a = next.age ?? age;
    if (a) params.set("age", a);
    const s = params.toString();
    return s ? `/teams?${s}` : "/teams";
  };

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Teams</h1>
        <CreateLink href="/teams/new">Create a team</CreateLink>
      </div>
      <p className="mt-1 text-sm text-muted">
        Every team we have seen play — the ones entered here and the ones read
        off the schedules of tournaments around Seattle.
      </p>

      <SearchBar
        className="mt-4"
        defaultValue={q}
        label="Search teams"
        placeholder="Search teams by name or club"
      />

      {/*
       * The clubs an admin thought worth pinning, as one-click filters.
       *
       * Typing "Crossfire" is what somebody would do, and until the search
       * learned to look at club names it found nothing — no Crossfire team is
       * called that. These make the common case a click, and the pinned list
       * is already the answer to "which clubs do people actually look for".
       */}
      {pinned.length > 0 && (
        <nav aria-label="Clubs" className="mt-3 flex flex-wrap gap-1.5">
          {pinned.map((c) => {
            const on = c.slug === club;
            return (
              <Link
                key={c.slug}
                href={href({ club: on ? "" : c.slug })}
                className={
                  on
                    ? "rounded-full bg-brand px-2.5 py-1 text-xs font-medium text-on-brand"
                    : "rounded-full border border-line px-2.5 py-1 text-xs text-muted hover:bg-elevated"
                }
              >
                {c.name}
              </Link>
            );
          })}
        </nav>
      )}

      {/*
       * Age groups, named for this season and computed from birth years.
       *
       * "BU12" is what a parent looks for and 2014/2015 is what we store, so
       * the option is the label and the filter is the fact — and next August
       * the same option means 2015/2016 without a row changing. Only groups
       * that have teams are offered, so nothing here leads to an empty page.
       *
       * A dropdown, not chips: twenty-five of them wrapped to three lines and
       * pushed the teams below the fold, which is a lot of furniture in front
       * of the thing somebody came to read.
       */}
      {ageGroups.length > 0 && (
        <NavSelect
          label="Age group"
          className="mt-3"
          value={age || "all"}
          options={[
            { id: "all", label: `All ages (${allAges.all})`, href: href({ age: "" }) },
            ...ageGroups.map((g) => ({
              id: g.value,
              label: `${g.label} (${g.count})`,
              href: href({ age: g.value }),
            })),
          ]}
        />
      )}

      {/*
       * A team is filed under a club by hand, so most are in neither category
       * until somebody has looked. "All" leads and is the default for exactly
       * that reason — a page opening on an empty category would read as a
       * broken directory rather than an unfinished one.
       */}
      <nav aria-label="Team categories" className="mt-4 flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => {
          const on = c.key === type;
          const n =
            c.key === "" ? counts.all : c.key === "club" ? counts.club : counts.independent;
          return (
            <Link
              key={c.key || "all"}
              href={href({ type: c.key })}
              className={
                on
                  ? "rounded-full bg-ink px-2.5 py-1 text-xs text-page"
                  : "rounded-full bg-elevated px-2.5 py-1 text-xs text-muted hover:bg-line"
              }
            >
              {c.label} {n}
            </Link>
          );
        })}
      </nav>

      {mine.length > 0 && !q && !type && !club && !age && pagination.page === 1 && (
        <section className="mt-6">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
            Your teams
          </h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {mine.map((team) => (
              <TeamCard
                key={team.id}
                team={team}
                // A private team is listed nowhere else, so say so here rather
                // than leaving the owner wondering why nobody can find it.
                note={
                  team.visibility === "private" ? `${team.role} · private` : team.role
                }
              />
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <p className="text-sm text-muted">
          {first.total === 0
            ? q || club || age
              ? "No teams match that."
              : "No teams yet."
            : `${first.total} team${first.total === 1 ? "" : "s"}`}
        </p>

        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {others.map((team) => (
            <TeamCard
              key={team.id}
              team={team}
              note={
                team.events > 0
                  ? `${team.events} event${team.events > 1 ? "s" : ""}`
                  : undefined
              }
            />
          ))}
        </ul>

        <Pager
          basePath="/teams"
          params={{ q, type: type || undefined, club: club || undefined, age: age || undefined }}
          pagination={pagination}
          noun="teams"
        />
      </section>
    </div>
  );
}
