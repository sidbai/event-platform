import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { requireUser } from "@/features/auth";
import { updateCoach } from "@/features/coaches/actions";
import { CoachForm } from "@/features/coaches/coach-form";
import { getCoach } from "@/features/coaches/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Edit coach" };

export default async function EditCoachPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireUser(`/coaches/${slug}/edit`);

  const coach = await getCoach(slug);
  if (!coach) notFound();

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link
        href={`/coaches/${slug}`}
        className="text-sm text-brand-text hover:underline"
      >
        ← {coach.name}
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Edit coach</h1>
      <CoachForm
        action={updateCoach.bind(null, slug)}
        existing={{
          name: coach.name,
          role: coach.role,
          ageGroups: coach.ageGroups ?? [],
        }}
        submitLabel="Save changes"
      />
    </div>
  );
}
