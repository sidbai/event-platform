import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { CreateLink } from "@/components/create-link";
import { getClub } from "@/features/clubs/queries";
import { coachRoleLabel } from "@/features/coaches/constants";
import { coachesAtClub } from "@/features/coaches/queries";
import { paginate, parsePage } from "@/features/pagination/paginate";
import { Pager } from "@/features/pagination/pager";

export const dynamic = "force-dynamic";

/** Enough to be worth a page, few enough to scan — Seattle United lists 82. */
const COACHES_PER_PAGE = 25;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const club = await getClub(slug);
  return { title: club ? `${club.name} coaches` : "Not found" };
}

/**
 * Coaches show a review COUNT, never a score. A column of numbers against
 * named people is a leaderboard; the score belongs on the coach's own page,
 * beside the context that makes it readable.
 */
export default async function ClubCoachesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { slug } = await params;
  const club = await getClub(slug);
  if (!club) notFound();
  const coaches = await coachesAtClub(club.id);
  const pagination = paginate(coaches.length, parsePage((await searchParams).page), COACHES_PER_PAGE);
  const paged = coaches.slice(pagination.offset, pagination.offset + pagination.perPage);

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          {coaches.length === 0
            ? "None listed yet — add one so people can share what working with them was like."
            : `${coaches.length} coach${coaches.length === 1 ? "" : "es"} listed at this club.`}
        </p>
        <CreateLink href="/coaches/new">Add a coach</CreateLink>
      </div>
      {coaches.length > 0 && (
        <ul className="mt-2 divide-y divide-line">
          {paged.map((c) => (
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
                  {c.reviewCount === 0 ? "No reviews yet" : `${c.reviewCount} review${c.reviewCount === 1 ? "" : "s"}`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pager basePath={`/clubs/${slug}/coaches`} params={{}} pagination={pagination} noun="coaches" />
    </div>
  );
}
