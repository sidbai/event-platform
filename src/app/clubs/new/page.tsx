import Link from "next/link";
import type { Metadata } from "next";

import { requireUser } from "@/features/auth";
import { createClub } from "@/features/clubs/actions";
import { ClubForm } from "@/features/clubs/club-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Add a club" };

export default async function NewClubPage() {
  await requireUser("/clubs/new");

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link href="/clubs" className="text-sm text-brand-text hover:underline">
        ← Reviews
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Add a club</h1>
      <p className="mt-1 text-sm text-muted">
        Add the club itself here — this is the page its reviews live on, not a
        review. You can write one straight after.
      </p>
      <ClubForm action={createClub} />
    </div>
  );
}
