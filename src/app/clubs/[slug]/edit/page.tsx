import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { requireUser } from "@/features/auth";
import { canEditClub } from "@/features/clubs/access";
import {
  clearClubLogo,
  setClubLogo,
  updateClub,
} from "@/features/clubs/actions";
import { ClubEditForm } from "@/features/clubs/club-form";
import { getClub } from "@/features/clubs/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Edit club" };

export default async function EditClubPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireUser(`/clubs/${slug}/edit`);
  const club = await getClub(slug);
  if (!club) notFound();
  if (!(await canEditClub(slug))) notFound();

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link href={`/clubs/${slug}`} className="text-sm text-brand-text hover:underline">
        ← {club.name}
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Edit club</h1>
      <p className="mt-1 text-sm text-muted">
        Club details are shared — reviews from other families live on this page.
      </p>

      <ClubEditForm
        action={updateClub.bind(null, slug)}
        club={{
          name: club.name,
          city: club.city,
          website: club.website,
          crestUrl: club.crestUrl,
        }}
        slug={slug}
        onLogoUploaded={setClubLogo.bind(null, slug)}
        onLogoCleared={clearClubLogo.bind(null, slug)}
      />
    </div>
  );
}
