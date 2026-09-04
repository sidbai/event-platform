import Link from "next/link";
import { notFound } from "next/navigation";

import { getCurrentUser, publicName, requireUser } from "@/features/auth";
import { canManageTeam } from "@/features/teams/access";
import { removeMember, updateTeam } from "@/features/teams/actions";
import { TeamInviteForm } from "@/features/teams/create-form";
import {
  inviteToTeam,
  revokeTeamInvite,
} from "@/features/teams/invite-actions";
import { listTeamInvites } from "@/features/teams/invite-queries";
import { getTeamBySlug } from "@/features/teams/queries";
import { TeamEditForm } from "@/features/teams/team-forms";
import { siteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export default async function TeamSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireUser(`/teams/${slug}/settings`);

  const team = await getTeamBySlug(slug);
  if (!team) notFound();
  if (!(await canManageTeam(team.id))) notFound();

  const user = await getCurrentUser();
  const isOwner = team.claimedBy === user?.id;

  const invites = await listTeamInvites(team.id);
  const base = siteUrl();

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link
        href={`/teams/${slug}`}
        className="text-sm text-brand-text hover:underline"
      >
        ← {team.name}
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Team settings</h1>

      <TeamEditForm
        action={updateTeam.bind(null, slug)}
        team={{
          club: team.club,
          city: team.city,
          ageGroup: team.ageGroup,
          gender: team.gender,
          bio: team.bio,
        }}
      />

      <section className="mt-10">
        <h2 className="text-lg font-semibold">People</h2>
        <ul className="mt-3 divide-y divide-line text-sm">
          {team.members.map((m) => (
            <li
              key={m.userId}
              className="flex items-center justify-between gap-3 py-2"
            >
              <span>
                {publicName(m.user)}{" "}
                <span className="text-xs text-muted">{m.role}</span>
              </span>
              {isOwner && m.role !== "owner" && (
                <form action={removeMember.bind(null, slug, m.userId)}>
                  <button className="text-xs text-muted hover:text-red-600">
                    remove
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>

        <h3 className="mt-6 text-sm font-medium">Invite someone</h3>
        <TeamInviteForm action={inviteToTeam.bind(null, slug)} />
        <p className="mt-2 text-xs text-muted">
          Managers can edit the team and invite people. Coaches can also put
          events on the team calendar. Players just see the team&rsquo;s private
          events and can RSVP. We don&rsquo;t send the email yet — copy the link
          and pass it on.
        </p>

        {invites.length > 0 && (
          <>
            <h3 className="mt-6 text-sm font-medium">
              Pending invites{" "}
              <span className="text-muted">({invites.length})</span>
            </h3>
            <ul className="mt-2 divide-y divide-line text-sm">
              {invites.map((inv) => (
                <li
                  key={inv.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-2"
                >
                  <span className="min-w-0 truncate">
                    {inv.label}{" "}
                    <span className="text-xs text-muted">
                      {inv.role}
                      {inv.isEmail && " · by email"}
                      {inv.status !== "pending" && ` · ${inv.status}`}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <a
                      href={`${base}/teams/${slug}?i=${inv.token}`}
                      className="text-xs text-brand-text hover:underline"
                    >
                      link
                    </a>
                    <form action={revokeTeamInvite.bind(null, slug, inv.id)}>
                      <button className="text-xs text-muted hover:text-red-600">
                        remove
                      </button>
                    </form>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
