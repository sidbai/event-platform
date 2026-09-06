import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";
import { connectSchedule, importPastedSchedule, refreshNow } from "@/features/sync/actions";
import { ConnectForm, PasteForm, RefreshButton } from "@/features/sync/connect-form";
import { CopierPanel } from "@/features/sync/copier-panel";
import { copierBookmarklet } from "@/features/sync/copier";
import { formatAgo } from "@/features/sync/freshness";
import { listedEvents } from "@/features/sync/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Connected schedules" };

export default async function AdminSyncPage() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) notFound();

  const rows = await listedEvents();
  const now = new Date();
  const connected = rows.filter((r) => r.sourcePlatform);
  const rest = rows.filter((r) => !r.sourcePlatform);

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link href="/admin" className="text-sm text-brand-text hover:underline">
        ← Admin
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Connected schedules</h1>
      <p className="mt-2 text-sm text-muted">
        Events other people run. Paste the page where an event&rsquo;s schedule
        is published: if it is a platform we can read, the fixtures are pulled
        in and kept current by themselves. If it is not &mdash; EventConnect
        refuses crawlers outright &mdash; the link is saved and the event page
        offers it as a button, which still beats sending a parent to an
        organizer&rsquo;s front page to hunt.
      </p>

      <CopierPanel source={copierBookmarklet()} />

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-muted">
        Connected ({connected.length})
      </h2>
      {connected.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Nothing is connected yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {connected.map((row) => (
            <li key={row.id} className="py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link
                  href={`/events/${row.slug}#schedule`}
                  className="font-medium hover:underline"
                >
                  {row.title}
                </Link>
                <span className="text-xs text-muted">
                  {row.sourcePlatform} · {row.sourceEventId}
                </span>
              </div>

              <p className="mt-1 text-xs text-muted">
                {row.lastSyncedAt
                  ? `Read ${formatAgo(row.lastSyncedAt, now)}`
                  : "Never read"}
                {row.nextSyncAt
                  ? ` · next ${row.nextSyncAt.toLocaleString("en-US", {
                      timeZone: "America/Los_Angeles",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}`
                  : " · not scheduled"}
              </p>

              {/* The whole reason this page exists: a connector that has
                  stopped working is invisible everywhere else, because a
                  failed sync deliberately leaves the schedule it already has
                  on screen. */}
              {row.lastSyncError && (
                <p className="mt-1 text-xs text-red-600">{row.lastSyncError}</p>
              )}

              <RefreshButton action={refreshNow} eventId={row.id} />
              <PasteForm action={importPastedSchedule} eventId={row.id} />
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-muted">
        Not connected ({rest.length})
      </h2>
      <ul className="mt-2 divide-y divide-line">
        {rest.map((row) => (
          <li key={row.id} className="py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Link href={`/events/${row.slug}`} className="font-medium hover:underline">
                {row.title}
              </Link>
              <span className="text-xs text-muted">{row.sourceName}</span>
            </div>
            <ConnectForm
              action={connectSchedule}
              eventId={row.id}
              current={row.scheduleUrl}
            />
            <PasteForm action={importPastedSchedule} eventId={row.id} />
          </li>
        ))}
      </ul>
    </div>
  );
}
