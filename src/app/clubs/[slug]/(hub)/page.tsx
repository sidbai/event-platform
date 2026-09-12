import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getCurrentUser, publicName } from "@/features/auth";
import { canEditClub } from "@/features/clubs/access";
import { revertClub } from "@/features/clubs/actions";
import { clubTeamsDetailed, leaguesByClub } from "@/features/clubs/hub";
import { Markdown } from "@/features/news/markdown";
import { clubHistory, clubSummary, getClub, listReviews } from "@/features/clubs/queries";
import { overallOf } from "@/features/clubs/constants";
import { Stars } from "@/features/clubs/stars";
import { coachesAtClub } from "@/features/coaches/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const club = await getClub(slug);
  if (!club) return { title: "Not found" };
  return {
    title: club.name,
    description: `${club.name}: leagues, tiers, teams, coaches, and what families say.`,
  };
}

function fmt(d: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(d);
}

/**
 * Overview: what the club is, in the site's own facts and the club's own
 * words, then a taste of the other tabs.
 */
export default async function ClubOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [club, user] = await Promise.all([getClub(slug), getCurrentUser()]);
  if (!club) notFound();

  const [leagues, clubTeams, coaches, summary, reviews, history, mayEdit] = await Promise.all([
    leaguesByClub([club.id]),
    clubTeamsDetailed(club.id),
    coachesAtClub(club.id),
    clubSummary(club.id),
    listReviews(club.id, user?.id ?? null, false),
    clubHistory(club.id),
    user ? canEditClub() : Promise.resolve(false),
  ]);
  const inLeagues = leagues.get(club.id) ?? [];
  const knowledge = {
    tiers: club.tiers,
    squadMarkers: club.squadMarkers,
    colours: club.colours,
    ageBands: club.ageBands,
    branches: club.branches,
    about: club.about,
    sources: club.sources,
    readAt: club.knowledgeReadAt,
  };
  const hasKnowledge = knowledge.tiers.length > 0 || Boolean(knowledge.about) || knowledge.branches.length > 0;
  const boys = clubTeams.filter((t) => t.gender === "boys").length;
  const girls = clubTeams.filter((t) => t.gender === "girls").length;
  const withCoach = clubTeams.filter((t) => t.coach).length;
  const latest = reviews.slice(0, 2);

  return (
    <div className="mt-6 space-y-8">
      {/* From the schedules: leagues and the size of the programme. */}
      <section>
        <h2 className="font-semibold">On this site</h2>
        <dl className="mt-2 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Teams</dt>
            <dd>
              {clubTeams.length === 0
                ? "None seen in an event here yet"
                : [
                    `${clubTeams.length}`,
                    boys || girls ? `(${[boys && `${boys} boys`, girls && `${girls} girls`].filter(Boolean).join(", ")})` : null,
                  ]
                    .filter(Boolean)
                    .join(" ")}
              {withCoach > 0 && (
                <span className="text-muted"> · {withCoach} with a listed head coach</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Leagues</dt>
            <dd>
              {inLeagues.length === 0
                ? "No league entries here yet"
                : inLeagues.map((l, i) => (
                    <span key={l.slug}>
                      {i > 0 && ", "}
                      <Link href={`/events/${l.slug}`} className="hover:underline">
                        {l.label}
                      </Link>
                      <span className="text-muted"> ({l.teams})</span>
                    </span>
                  ))}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Coaches</dt>
            <dd>
              {coaches.length === 0 ? (
                <>
                  None listed yet ·{" "}
                  <Link href="/coaches/new" className="text-brand-text hover:underline">
                    add one
                  </Link>
                </>
              ) : (
                <Link href={`/clubs/${slug}/coaches`} className="hover:underline">
                  {coaches.length} on the coaches tab
                </Link>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Reviews</dt>
            <dd>
              {summary ? (
                <Link href={`/clubs/${slug}/reviews`} className="hover:underline">
                  {summary.count} review{summary.count === 1 ? "" : "s"}
                  {summary.rated ? ` · ${summary.overall.toFixed(1)} of 5` : " · not rated yet"}
                </Link>
              ) : (
                <>
                  None yet ·{" "}
                  <Link href={`/clubs/${slug}/review`} className="text-brand-text hover:underline">
                    write the first
                  </Link>
                </>
              )}
            </dd>
          </div>
        </dl>
      </section>

      {/* The wiki part. It began as our reading of the club's website and
          is the community's from then on: anyone signed in can edit it,
          every version is kept, and the sources are listed so a claim can
          be checked. Facts as a list, the prose as Markdown. */}
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">How the club organises its teams</h2>
          {user ? (
            <Link href={`/clubs/${slug}/edit`} className="text-sm text-brand-text hover:underline">
              {hasKnowledge ? "Edit" : "Add what you know"}
            </Link>
          ) : (
            <Link href={`/signin?next=/clubs/${slug}/edit`} className="text-sm text-muted hover:text-ink">
              Sign in to edit
            </Link>
          )}
        </div>
        {!hasKnowledge ? (
          <p className="mt-2 text-sm text-muted">
            Nothing written yet. If you know how this club names and ranks its teams — which
            colour is the first team, where the ECNL side sits, how tryouts work — add it.
          </p>
        ) : (
          <>
            {knowledge.tiers.length > 0 && (
              <div className="mt-2">
                <p className="text-xs uppercase tracking-wide text-muted">Tiers and squads, strongest first</p>
                <ol className="mt-1 flex flex-wrap items-center gap-1.5 text-sm">
                  {knowledge.tiers.map((t, i) => (
                    <li key={t} className="flex items-center gap-1.5">
                      {i > 0 && <span className="text-muted/60" aria-hidden>›</span>}
                      <span className="rounded-md border border-line bg-card px-2 py-0.5">{t}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {facts(knowledge).length > 0 && (
              <ul className="mt-3 space-y-1.5 text-sm">
                {facts(knowledge).map((f) => (
                  <li key={f.label} className="flex gap-2">
                    <span className="w-32 shrink-0 text-muted">{f.label}</span>
                    <span className="min-w-0">{f.value}</span>
                  </li>
                ))}
              </ul>
            )}

            {knowledge.about && (
              <div className="mt-3 [&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 text-sm">
                <Markdown>{knowledge.about}</Markdown>
              </div>
            )}

            <p className="mt-3 text-xs text-muted">
              {knowledge.readAt
                ? `Read from the club's website on ${knowledge.readAt.toISOString().slice(0, 10)} and not yet checked by a person`
                : club.updatedByUser
                  ? `Maintained by the community — last edited by ${publicName(club.updatedByUser)}`
                  : "Maintained by the community"}
              {knowledge.sources.length > 0 && (
                <>
                  {" · sources: "}
                  {knowledge.sources.slice(0, 4).map((s, i) => (
                    <span key={s}>
                      {i > 0 && ", "}
                      <a href={s} target="_blank" rel="noopener noreferrer nofollow" className="hover:underline">
                        {s.replace(/^https?:\/\/(www\.)?/, "").split("/").slice(1).join("/") || "home"}
                      </a>
                    </span>
                  ))}
                </>
              )}
            </p>
          </>
        )}
      </section>

      {latest.length > 0 && (
        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">What families say</h2>
            <Link href={`/clubs/${slug}/reviews`} className="text-sm text-brand-text hover:underline">
              All reviews →
            </Link>
          </div>
          <ul className="mt-2 space-y-3">
            {latest.map((r) => (
              <li key={r.id} className="rounded-xl border border-line bg-card p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span className="flex items-center gap-1.5 text-amber-500">
                    <Stars value={overallOf("club", r.ratings)} />
                  </span>
                  <span className="capitalize">{r.reviewerRole}</span>
                  <span>·</span>
                  <span>{fmt(r.createdAt)}</span>
                </div>
                <h3 className="mt-1 font-medium leading-snug">{r.title}</h3>
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm">{r.body}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <details className="text-xs text-muted">
        <summary className="cursor-pointer hover:text-ink">
          Club details are maintained by the community
          {club.updatedByUser && ` — last edited by ${publicName(club.updatedByUser)}`}
        </summary>
        <p className="mt-2">
          Anyone signed in can correct a club&rsquo;s details, and every change is kept. If
          something looks wrong, put it back.
        </p>
        <ul className="mt-2 space-y-1">
          {history.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center gap-2">
              <span>{fmt(h.createdAt)}</span>
              <span>·</span>
              <span>{h.summary}</span>
              <span>·</span>
              <span>{h.editor}</span>
              {mayEdit && !h.isCurrent && (
                <form action={revertClub.bind(null, slug, h.id)}>
                  <button className="text-brand-text hover:underline">restore this</button>
                </form>
              )}
              {h.isCurrent && <span className="text-muted">(current)</span>}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

type Knowledge = {
  colours: string | null;
  ageBands: string | null;
  squadMarkers: string[];
  branches: string[];
};

/**
 * The structured fields, said plainly, one line each. Only the ones with
 * something to say: a club whose page names no colour gets no colour line.
 */
function facts(k: Knowledge): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  const colours: Record<string, string> = {
    tier: "rank the teams — Red is a level above White, not a different squad",
    squad: "name a squad, not a level — two colours are two equal sides",
    mixed: "sometimes rank the teams and sometimes only name them",
  };
  if (k.colours && colours[k.colours]) out.push({ label: "Colours", value: colours[k.colours] });
  const ages: Record<string, string> = {
    "single-year": "one birth year per team (B2014, U11)",
    "two-year": "two-year bands (B13/14)",
    both: "one year on their site, two-year bands in league listings — the same team",
  };
  if (k.ageBands && ages[k.ageBands]) out.push({ label: "Age groups", value: ages[k.ageBands] });
  if (k.squadMarkers.length > 0) out.push({ label: "Squad words", value: k.squadMarkers.join(", ") });
  if (k.branches.length > 1) out.push({ label: "Programmes & hubs", value: k.branches.join(" · ") });
  return out;
}
