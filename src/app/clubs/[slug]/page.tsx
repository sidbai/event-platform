import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { TeamCrest } from "@/components/team-crest";
import { getCurrentUser, publicName } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";
import { canEditClub } from "@/features/clubs/access";
import { teamsForClub } from "@/features/clubs/link-queries";
import { coachRoleLabel } from "@/features/coaches/constants";
import { coachesAtClub } from "@/features/coaches/queries";
import {
  reportReview,
  revertClub,
  setReviewHidden,
  toggleHelpful,
} from "@/features/clubs/actions";
import { MIN_REVIEWS_FOR_SCORE, overallOf } from "@/features/clubs/constants";
import {
  clubHistory,
  clubSummary,
  getClub,
  listReviews,
} from "@/features/clubs/queries";
import { HelpfulButton, ReportControl } from "@/features/clubs/review-card";
import { RatingBreakdown, Stars } from "@/features/clubs/stars";
import { CreateLink } from "@/components/create-link";
import { paginate, parsePage } from "@/features/pagination/paginate";
import { Pager } from "@/features/pagination/pager";

export const dynamic = "force-dynamic";

/**
 * Coaches per page on the roster.
 *
 * Enough to be worth a page, few enough that the roster stays a section of
 * this page rather than becoming it — Seattle United lists 82.
 */
const COACHES_PER_PAGE = 10;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const club = await getClub(slug);
  if (!club) return { title: "Not found" };
  return {
    title: `${club.name} reviews`,
    description: `What families say about ${club.name}.`,
  };
}

function fmt(d: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
  }).format(d);
}

export default async function ClubPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ coaches?: string }>;
}) {
  const { slug } = await params;
  const coachPage = parsePage((await searchParams).coaches);
  const [club, user] = await Promise.all([getClub(slug), getCurrentUser()]);
  if (!club) notFound();
  const admin = isAdmin(user);

  const [summary, reviews, mayEdit, history, coaches, clubTeams] = await Promise.all([
    clubSummary(club.id),
    // Admins see hidden reviews too, badged, so a takedown can be undone from
            // the page it happened on rather than only from the queue.
            listReviews(club.id, user?.id ?? null, admin),
    canEditClub(),
    clubHistory(club.id),
    coachesAtClub(club.id),
    teamsForClub(club.id),
  ]);
  const mine = reviews.find((r) => r.mine);
  const coachPagination = paginate(coaches.length, coachPage, COACHES_PER_PAGE);
  const pagedCoaches = coaches.slice(
    coachPagination.offset,
    coachPagination.offset + coachPagination.perPage,
  );

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link href="/clubs" className="text-sm text-brand-text hover:underline">
        ← Reviews
      </Link>

      <header className="mt-4 flex items-start gap-4">
        <TeamCrest src={club.crestUrl} size={64} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{club.name}</h1>
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
            {club.city && <span>{club.city}</span>}
            {club.city && club.website && <span aria-hidden>·</span>}
            {club.website && (
              <a
                href={club.website}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="text-brand-text hover:underline"
              >
                Website
              </a>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {/* The plus is for making one. Once you have written a review the
              same control edits it, and a plus there would describe the wrong
              action — so only the new case gets the pill. */}
          {mine ? (
            <Link
              href={`/clubs/${slug}/review`}
              className="rounded-full border border-line px-3 py-1 text-sm font-medium text-brand-text hover:bg-elevated"
            >
              Edit your review
            </Link>
          ) : (
            <CreateLink href={`/clubs/${slug}/review`}>Write a review</CreateLink>
          )}
          {mayEdit && (
            <Link
              href={`/clubs/${slug}/edit`}
              className="text-xs text-muted hover:text-ink"
            >
              Edit club details
            </Link>
          )}
        </div>
      </header>

      <section className="mt-6 rounded-xl border border-line bg-card p-5">
        {summary?.rated ? (
          <>
            <div className="flex items-center gap-3">
              <span className="text-3xl font-semibold tabular-nums">
                {summary.overall.toFixed(1)}
              </span>
              <span className="text-amber-500">
                <Stars value={summary.overall} size={18} />
              </span>
              <span className="text-sm text-muted">
                {summary.count} review{summary.count === 1 ? "" : "s"}
              </span>
            </div>
            <div className="mt-4 border-t border-line pt-4">
              <RatingBreakdown ratings={summary.byScale} />
            </div>
          </>
        ) : summary ? (
          // The reviews themselves still render below; only the average is
          // withheld, because a mean of one or two is not a rating.
          <div className="text-sm text-muted">
            <span className="font-medium text-ink">Not rated yet</span> —{" "}
            {summary.count} review{summary.count === 1 ? "" : "s"} so far. We
            show a score once there are {MIN_REVIEWS_FOR_SCORE}.
          </div>
        ) : (
          <p className="text-sm text-muted">
            No reviews yet.{" "}
            <Link
              href={`/clubs/${slug}/review`}
              className="text-brand-text hover:underline"
            >
              Be the first
            </Link>
            .
          </p>
        )}
      </section>

      <details className="mt-3 text-xs text-muted">
        <summary className="cursor-pointer hover:text-ink">
          Club details are maintained by the community
          {club.updatedByUser &&
            ` — last edited by ${publicName(club.updatedByUser)}`}
        </summary>
        <p className="mt-2">
          Anyone signed in can correct a club&rsquo;s details, and every change
          is kept. If something looks wrong, put it back.
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
                  <button className="text-brand-text hover:underline">
                    restore this
                  </button>
                </form>
              )}
              {h.isCurrent && <span className="text-muted">(current)</span>}
            </li>
          ))}
        </ul>
      </details>

      {/* Coaches show a review COUNT, never a score. A column of numbers
          against named people is a leaderboard; the score belongs on the
          coach's own page, beside the context that makes it readable. */}
      {reviews.length > 0 && (
        <ul className="mt-8 space-y-3">
          {reviews.map((r) => (
            <li
              key={r.id}
              className={
                r.hidden
                  ? "rounded-xl border border-amber-300 bg-amber-50/40 p-4"
                  : "rounded-xl border border-line bg-card p-4"
              }
            >
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                {r.hidden && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
                    Hidden — only admins see this
                  </span>
                )}
                <span className="flex items-center gap-1.5 text-amber-500">
                  <Stars value={overallOf("club", r.ratings)} />
                  <span className="tabular-nums text-ink">
                    {overallOf("club", r.ratings).toFixed(1)}
                  </span>
                </span>
                <span>·</span>
                <span
                  className="rounded-full bg-elevated px-2 py-0.5 capitalize"
                  title="Self-reported — we can't verify this"
                >
                  {r.reviewerRole}
                </span>
                <span>·</span>
                <span className="font-mono">{r.anonHandle}</span>
                <span>·</span>
                <span>{fmt(r.createdAt)}</span>
                {r.mine && (
                  <span className="rounded-full bg-elevated px-2 py-0.5">yours</span>
                )}
              </div>

              <h2 className="mt-2 font-medium leading-snug">{r.title}</h2>
              <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{r.body}</p>

              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-muted hover:text-ink">
                  Category ratings
                </summary>
                <div className="mt-2">
                  <RatingBreakdown ratings={r.ratings} showValues={false} />
                </div>
              </details>

              {user && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <HelpfulButton
                    count={r.helpful}
                    voted={r.votedByMe}
                    action={toggleHelpful.bind(null, slug, r.id)}
                  />
                  {!r.mine && (
                    <ReportControl
                      reported={false}
                      action={reportReview.bind(null, slug, r.id)}
                    />
                  )}
                  {admin && (
                    <form
                      action={setReviewHidden.bind(
                        null,
                        r.id,
                        !r.hidden,
                        `/clubs/${slug}`,
                      )}
                    >
                      <button
                        className={
                          r.hidden
                            ? "text-xs text-muted hover:text-ink"
                            : "text-xs text-muted hover:text-red-600"
                        }
                      >
                        {r.hidden ? "Put it back up" : "Hide this review"}
                      </button>
                    </form>
                  )}
                </div>
              )}
              {!user && r.helpful > 0 && (
                <p className="mt-3 text-xs text-muted">
                  {r.helpful} found this helpful
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {clubTeams.length > 0 && (
        <section id="teams" className="mt-8 scroll-mt-6">
          <h2 className="font-semibold">Teams</h2>
          {/* Filed here by an admin from what the schedules carry, so this is
              the club's teams as tournaments name them rather than as the
              club would list them itself. */}
          <p className="mt-1 text-sm text-muted">
            {clubTeams.length} team{clubTeams.length === 1 ? "" : "s"} seen in
            events on this site.
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {clubTeams.map((t) => (
              <li key={t.id} className="text-sm">
                <Link href={`/teams/${t.slug}`} className="hover:underline">
                  {t.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section id="coaches" className="mt-8 scroll-mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Coaches at this club</h2>
          <CreateLink href="/coaches/new">Add a coach</CreateLink>
        </div>
        {coaches.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            None listed yet — add one so people can share what working with them
            was like.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {pagedCoaches.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/coaches/${c.slug}`}
                  className="flex flex-wrap items-baseline justify-between gap-2 py-2.5 transition-colors hover:bg-elevated"
                >
                  <span>
                    <span className="font-medium">{c.name}</span>{" "}
                    <span className="text-sm text-muted">
                      {coachRoleLabel(c.role)}
                      {c.ageGroups.length > 0 && ` · ${c.ageGroups.join(", ")}`}
                    </span>
                  </span>
                  <span className="text-xs text-muted">
                    {c.reviewCount === 0
                      ? "No reviews yet"
                      : `${c.reviewCount} review${c.reviewCount === 1 ? "" : "s"}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Pager
          basePath={`/clubs/${slug}`}
          params={{}}
          pagination={coachPagination}
          noun="coaches"
          pageKey="coaches"
          anchor="coaches"
        />
      </section>
    </div>
  );
}
