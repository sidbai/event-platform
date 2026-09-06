import Link from "next/link";
import { asc } from "drizzle-orm";
import type { Metadata } from "next";

import { db } from "@/db";
import { eventKinds } from "@/db/schema";
import { requireUser } from "@/features/auth";
import { listExternalEvent } from "@/features/events/actions";
import { ListingForm } from "@/features/events/listing-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "List someone else's event" };

/**
 * Adding an event that happens elsewhere.
 *
 * Separate from creating one, because they are different acts with different
 * obligations. Creating means this platform runs it — entries, rosters and
 * the table live here. Listing means pointing at somebody else's, and the
 * thing that must not be lost in between is whose it is.
 */
export default async function ListEventPage() {
  await requireUser("/events/list");

  const kinds = await db.query.eventKinds.findMany({
    orderBy: [asc(eventKinds.sort)],
    columns: { slug: true, label: true },
  });

  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <Link href="/events" className="text-sm text-brand-text hover:underline">
        ← Events
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">
        List someone else&rsquo;s event
      </h1>
      <p className="mt-2 text-sm text-muted">
        For a tournament, camp or league run by another organizer, so families
        searching here can find it. It stays theirs: the listing carries their
        name and links to their page for entries.
      </p>
      <p className="mt-2 text-sm text-muted">
        Running it yourself?{" "}
        <Link href="/events/new" className="text-brand-text hover:underline">
          Create an event
        </Link>{" "}
        instead — that one takes entries, rosters and results here.
      </p>

      <ListingForm action={listExternalEvent} kinds={kinds} />
    </div>
  );
}
