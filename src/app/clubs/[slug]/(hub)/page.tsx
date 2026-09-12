import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getCurrentUser, publicName } from "@/features/auth";
import { canEditClub } from "@/features/clubs/access";
import { revertClub } from "@/features/clubs/actions";
import { clubTeamsDetailed, leaguesByClub } from "@/features/clubs/hub";
import { profileFor } from "@/features/clubs/knowledge/store";
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
  const profile = profileFor(club.slug);
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

      {/* From the club's own website, read by us. Labelled as such because
          it is a reading, and the sources are listed so it can be checked. */}
      {profile && (profile.tiers.length > 0 || profile.summary) && (
        <section>
          <h2 className="font-semibold">How the club organises its teams</h2>
          {profile.tiers.length > 0 && (
            <div className="mt-2">
              <p className="text-xs uppercase tracking-wide text-muted">Tiers and squads, strongest first</p>
              <ol className="mt-1 flex flex-wrap items-center gap-1.5 text-sm">
                {profile.tiers.map((t, i) => (
                  <li key={t} className="flex items-center gap-1.5">
                    {i > 0 && <span className="text-muted/60" aria-hidden>›</span>}
                    <span className="rounded-md border border-line bg-card px-2 py-0.5">{t}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {profile.branches.length > 1 && (
            <p className="mt-2 text-sm text-muted">
              Programmes and places whose teams are separate sides:{" "}
              <span className="text-ink">{profile.branches.join(", ")}</span>
            </p>
          )}
          {profile.summary && <p className="mt-3 text-sm leading-relaxed">{profile.summary}</p>}
          <p className="mt-2 text-xs text-muted">
            Read from the club&rsquo;s website on {profile.readAt.slice(0, 10)}
            {profile.sources.length > 0 && (
              <>
                {" — "}
                {profile.sources.slice(0, 3).map((s, i) => (
                  <span key={s}>
                    {i > 0 && ", "}
                    <a href={s} target="_blank" rel="noopener noreferrer nofollow" className="hover:underline">
                      {s.replace(/^https?:\/\/(www\.)?/, "").split("/").slice(1).join("/") || "home"}
                    </a>
                  </span>
                ))}
              </>
            )}
            . If the club has changed how it names things, tell us.
          </p>
        </section>
      )}

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
