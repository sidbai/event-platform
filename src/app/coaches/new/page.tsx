import Link from "next/link";
import type { Metadata } from "next";

import { requireUser } from "@/features/auth";
import { createCoach } from "@/features/coaches/actions";
import { CoachForm } from "@/features/coaches/coach-form";
import { clubOptions } from "@/features/coaches/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Add a coach" };

export default async function NewCoachPage() {
  await requireUser("/coaches/new");
  const clubs = await clubOptions();

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link href="/coaches" className="text-sm text-brand-text hover:underline">
        ← Coaches
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Add a coach</h1>
      <p className="mt-1 text-sm text-muted">
        Coaches are listed so people can share what working with them was like.
        Add the role they hold at a club — not personal details.
      </p>
      <CoachForm action={createCoach} clubs={clubs} submitLabel="Add coach" />
    </div>
  );
}
