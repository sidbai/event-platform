import Link from "next/link";
import type { Metadata } from "next";

import { getCurrentUser } from "@/features/auth";
import { coachRoleLabel } from "@/features/coaches/constants";
import { listCoaches } from "@/features/coaches/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Coach reviews",
  description:
    "Parent and player experiences with Seattle-area youth soccer coaches.",
};

export default async function CoachesPage() {
  const [coaches, user] = await Promise.all([listCoaches(), getCurrentUser()]);

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">Reviews</h1>
          <p className="mt-1 text-sm text-muted">
            What parents and players say about clubs and coaches around Seattle.
          </p>
        </div>
        {user && (
          <Link
            href="/coaches/new"
            className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-on-brand hover:bg-brand-strong"
          >
            Add a coach
          </Link>
        )}
      </div>

      <nav className="mt-5 flex gap-1.5 text-sm">
        <Link
          href="/clubs"
          className="rounded-full bg-elevated px-3 py-1 text-muted hover:bg-line"
        >
          Clubs
        </Link>
        <Link href="/coaches" className="rounded-full bg-ink px-3 py-1 text-page">
          Coaches
        </Link>
      </nav>

      {coaches.length === 0 ? (
        <p className="mt-10 text-muted">
          No coaches listed yet.
          {user && (
            <>
              {" "}
              <Link href="/coaches/new" className="text-brand-text hover:underline">
                Add the first
              </Link>
              .
            </>
          )}
        </p>
      ) : (
        /* Alphabetical, with a review count and no score. Ranking named people
           side by side is the thing this feature must not become. */
        <ul className="mt-6 divide-y divide-line">
          {coaches.map((c) => (
            <li key={c.id}>
              <Link
                href={`/coaches/${c.slug}`}
                className="block py-3 transition-colors hover:bg-elevated"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-xs text-muted">
                    {c.reviewCount === 0
                      ? "No reviews yet"
                      : `${c.reviewCount} review${c.reviewCount === 1 ? "" : "s"}`}
                  </span>
                </div>
                <div className="mt-0.5 text-sm text-muted">
                  {coachRoleLabel(c.role)}
                  {c.club && ` · ${c.club.name}`}
                  {c.ageGroups.length > 0 && ` · ${c.ageGroups.join(", ")}`}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
