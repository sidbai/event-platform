import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { Avatar, avatarOf } from "@/components/avatar";
import { TeamCrest } from "@/components/team-crest";
import { publicName } from "@/features/auth";
import { TAG_LABELS } from "@/features/profile/constants";
import { getProfileByUsername } from "@/features/profile/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const p = await getProfileByUsername(username);
  if (!p) return { title: "Profile not found" };
  return { title: publicName(p), description: p.bio ?? undefined };
}

function fmtDate(d: Date | null) {
  if (!d) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const p = await getProfileByUsername(username);
  if (!p) notFound();

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <header className="flex items-center gap-4">
        <Avatar src={avatarOf(p)} name={publicName(p)} size={72} />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{publicName(p)}</h1>
          <p className="text-sm text-muted">@{p.username}</p>
        </div>
      </header>

      {p.tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {p.tags.map((t) => (
            <span
              key={t}
              className="rounded-full bg-elevated px-2 py-0.5 text-xs text-muted"
            >
              {TAG_LABELS[t] ?? t}
            </span>
          ))}
        </div>
      )}

      {(p.club || p.city) && (
        <p className="mt-3 text-sm text-muted">
          {[p.club, p.city].filter(Boolean).join(" · ")}
        </p>
      )}

      {p.bio && (
        <p className="mt-4 whitespace-pre-wrap text-ink">
          {p.bio}
        </p>
      )}

      {p.ownedTeams.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
            Teams
          </h2>
          <ul className="mt-2 space-y-1">
            {p.ownedTeams.map((t) => (
              <li key={t.slug} className="flex items-center gap-2 text-sm">
                <TeamCrest src={t.crestUrl} size={18} />
                <Link href={`/teams/${t.slug}`} className="text-brand-text hover:underline">
                  {t.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {p.organizedEvents.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
            Organizing
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {p.organizedEvents.map((e) => (
              <li key={e.slug}>
                <Link href={`/events/${e.slug}`} className="text-brand-text hover:underline">
                  {e.title}
                </Link>{" "}
                <span className="text-muted">{fmtDate(e.startsAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
