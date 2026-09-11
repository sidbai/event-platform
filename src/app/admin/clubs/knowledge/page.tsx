import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isNotNull } from "drizzle-orm";

import { db } from "@/db";
import { clubs } from "@/db/schema";
import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";
import { allProfiles } from "@/features/clubs/knowledge/store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "What the club websites say" };

/**
 * The knowledge base, readable.
 *
 * It is a JSON file reviewed in a pull request, which is the right place to
 * decide whether an entry is true. This page answers a different question,
 * and one a diff cannot: what does it currently *cover*? A profile that is
 * simply missing never shows up in a diff, and a club we have never read is
 * exactly where the merge queue will keep going wrong.
 *
 * So the clubs with nothing are listed first.
 */
export default async function ClubKnowledgePage() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) notFound();

  const profiles = allProfiles();
  const known = new Map(profiles.map((p) => [p.slug, p]));

  const withSites = await db
    .select({ slug: clubs.slug, name: clubs.name, website: clubs.website })
    .from(clubs)
    .where(isNotNull(clubs.website))
    .orderBy(clubs.name);

  const unread = withSites.filter((c) => !known.has(c.slug));

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link href="/admin" className="text-sm text-brand-text hover:underline">
        &larr; Admin
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        What the club websites say
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        Read from each club&rsquo;s own site and kept in{" "}
        <code className="text-xs">profiles.json</code>. It is used in one place: the
        prompt that recommends merges. Nothing renames, binds or merges from it.
      </p>
      <p className="mt-2 text-sm text-muted">
        {profiles.length} of {withSites.length} club{withSites.length === 1 ? "" : "s"} with a
        website. Refresh with <code className="text-xs">pnpm clubs:crawl</code> then{" "}
        <code className="text-xs">pnpm clubs:profile</code>.
      </p>

      {unread.length > 0 && (
        <section className="mt-8 rounded-xl border border-line bg-elevated p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Nothing read yet
          </h2>
          <p className="mt-2 text-sm text-muted">
            Either the site has not been crawled, or it said nothing legible &mdash; a
            few of these are a single JavaScript shell with no sitemap.
          </p>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink">
            {unread.map((c) => (
              <li key={c.slug}>{c.name}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-8 space-y-5">
        {profiles
          .slice()
          .sort((a, b) => a.slug.localeCompare(b.slug))
          .map((p) => {
            const club = withSites.find((c) => c.slug === p.slug);
            return (
              <section key={p.slug} className="rounded-xl border border-line p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-semibold text-ink">{club?.name ?? p.slug}</h2>
                  <span className="text-xs text-muted">
                    {p.sources.length} page{p.sources.length === 1 ? "" : "s"},{" "}
                    {p.readAt.slice(0, 10)}
                  </span>
                </div>

                {p.summary && (
                  <p className="mt-2 text-sm leading-relaxed text-ink">{p.summary}</p>
                )}

                <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[10rem_1fr]">
                  <Fact label="Tiers" value={p.tiers.join(" › ")} />
                  <Fact label="Separate programmes" value={p.branches.join(", ")} />
                  <Fact label="Squad markers" value={p.squadMarkers.join(", ")} />
                  <Fact
                    label="A colour means"
                    value={p.colours === "unknown" ? "" : p.colours}
                  />
                  <Fact
                    label="Age groups"
                    value={p.ageBands === "unknown" ? "" : p.ageBands}
                  />
                  <Fact
                    label="Coaches named"
                    value={p.coaches.length ? String(p.coaches.length) : ""}
                  />
                </dl>
              </section>
            );
          })}
      </div>
    </div>
  );
}

/** Nothing read is shown as nothing, not as an empty row that looks like a finding. */
function Fact({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </>
  );
}
