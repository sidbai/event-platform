import Link from "next/link";
import type { Metadata } from "next";

import { TeamCrest } from "@/components/team-crest";
import { listClubs } from "@/features/clubs/queries";
import { Stars } from "@/features/clubs/stars";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Club Experience",
  description: "Anonymous reviews of Seattle-area youth soccer clubs.",
};

export default async function ClubsPage() {
  const clubs = await listClubs();

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Club Experience</h1>
        <Link
          href="/clubs/new"
          className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-on-brand hover:bg-brand-strong"
        >
          Add a club
        </Link>
      </div>
      <p className="mt-1 text-sm text-muted">
        What it&rsquo;s actually like at a club, from the families there.
        Reviews are anonymous.
      </p>

      {clubs.length === 0 ? (
        <p className="mt-10 text-muted">
          No clubs yet.{" "}
          <Link href="/clubs/new" className="text-brand-text hover:underline">
            Add the first one
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-6 space-y-2">
          {clubs.map((club) => (
            <li key={club.id}>
              <Link
                href={`/clubs/${club.slug}`}
                className="flex items-center gap-3 rounded-xl border border-line bg-card p-4 transition-shadow hover:shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
              >
                <TeamCrest src={club.crestUrl} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{club.name}</div>
                  {club.city && (
                    <div className="text-xs text-muted">{club.city}</div>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  {club.summary ? (
                    <>
                      <div className="flex items-center justify-end gap-2 text-amber-500">
                        <Stars value={club.summary.overall} />
                        <span className="text-sm font-medium tabular-nums text-ink">
                          {club.summary.overall.toFixed(1)}
                        </span>
                      </div>
                      <div className="text-xs text-muted">
                        {club.summary.count} review
                        {club.summary.count === 1 ? "" : "s"}
                      </div>
                    </>
                  ) : (
                    <span className="text-xs text-muted">No reviews yet</span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
