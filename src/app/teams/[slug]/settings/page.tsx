import Link from "next/link";
import { notFound } from "next/navigation";

import { getCurrentUser, publicName, requireUser } from "@/features/auth";
import { canManageTeam } from "@/features/teams/access";
import {
  addManager,
  removeManager,
  updateTeam,
} from "@/features/teams/actions";
import { getTeamBySlug } from "@/features/teams/queries";
import { AddManagerForm, TeamEditForm } from "@/features/teams/team-forms";

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

  const owner = team.members.find((m) => m.role === "owner");
  const managers = team.members.filter((m) => m.role === "manager");

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
        {!owner && (
          <p className="mt-2 text-sm text-muted">
            No owner yet. When a coach claims this team they become the owner and
            can add managers.
          </p>
        )}
        <ul className="mt-3 space-y-1 text-sm">
          {owner && (
            <li>
              {publicName(owner.user)}{" "}
              <span className="text-xs text-muted">owner</span>
            </li>
          )}
          {managers.map((m) => (
            <li key={m.userId} className="flex items-center justify-between">
              <span>
                {publicName(m.user)}{" "}
                <span className="text-xs text-muted">manager</span>
              </span>
              {isOwner && (
                <form action={removeManager.bind(null, slug, m.userId)}>
                  <button className="text-xs text-muted hover:text-red-600 dark:hover:text-red-400">
                    remove
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>

        {isOwner && <AddManagerForm action={addManager.bind(null, slug)} />}
        {!isOwner && owner && (
          <p className="mt-3 text-xs text-muted">
            Only the owner can add or remove managers.
          </p>
        )}
      </section>
    </div>
  );
}
