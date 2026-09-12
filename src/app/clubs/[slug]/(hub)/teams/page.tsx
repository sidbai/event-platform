import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { clubTeamsDetailed } from "@/features/clubs/hub";
import { getClub } from "@/features/clubs/queries";
import { formatBirthYears } from "@/features/teams/age";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const club = await getClub(slug);
  return { title: club ? `${club.name} teams` : "Not found" };
}

/**
 * The club's teams as the schedules name them, grouped the way a club lists
 * its own: boys then girls, youngest cohort first, and within a cohort the
 * tier word beside each side so two same-age teams read as two.
 */
export default async function ClubTeamsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const club = await getClub(slug);
  if (!club) notFound();
  const teams = await clubTeamsDetailed(club.id);

  const groups = new Map<string, typeof teams>();
  for (const t of teams) {
    const key = `${t.gender ?? "other"}|${t.birthYears.join("/")}`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const genderLabel = (g: string) => (g === "boys" ? "Boys" : g === "girls" ? "Girls" : "Other");

  return (
    <div className="mt-6">
      {teams.length === 0 ? (
        <p className="text-sm text-muted">No teams from this club have appeared in an event here yet.</p>
      ) : (
        <>
          <p className="text-sm text-muted">
            {teams.length} team{teams.length === 1 ? "" : "s"} seen in events on this site, named as
            the schedules name them. A head coach is the one the league last listed.
          </p>
          <div className="mt-4 space-y-5">
            {[...groups.entries()].map(([key, list]) => {
              const [gender, years] = key.split("|");
              const label = years ? (formatBirthYears(list[0].birthYears) ?? years) : "Age unknown";
              return (
                <section key={key}>
                  <h2 className="text-sm font-semibold">
                    {genderLabel(gender)} {label}
                  </h2>
                  <ul className="mt-1 divide-y divide-line">
                    {list.map((t) => (
                      <li key={t.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2 text-sm">
                        <span className="flex flex-wrap items-baseline gap-x-2">
                          <Link href={`/teams/${t.slug}`} className="font-medium hover:underline">
                            {t.name}
                          </Link>
                          {t.tier && (
                            <span className="rounded-full bg-elevated px-2 py-0.5 text-xs text-muted">{t.tier}</span>
                          )}
                          {t.program && <span className="text-xs text-muted">{t.program}</span>}
                        </span>
                        <span className="text-xs text-muted">
                          {t.coach ? `Head coach ${t.coach}` : ""}
                          {t.coach && t.events > 0 ? " · " : ""}
                          {t.events > 0 ? `${t.events} event${t.events === 1 ? "" : "s"}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
