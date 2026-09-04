import Link from "next/link";
import type { Metadata } from "next";

import { requireUser } from "@/features/auth";
import { createTeam } from "@/features/teams/create-actions";
import { CreateTeamForm } from "@/features/teams/create-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Create a team" };

export default async function NewTeamPage() {
  await requireUser("/teams/new");

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link href="/teams" className="text-sm text-brand-text hover:underline">
        ← Teams
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Create a team</h1>
      <p className="mt-1 text-sm text-muted">
        You&rsquo;ll be the owner. Once it exists you can invite managers,
        coaches and players, and put events on its calendar.
      </p>
      <CreateTeamForm action={createTeam} />
    </div>
  );
}
