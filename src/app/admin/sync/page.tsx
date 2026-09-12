import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";
import { connectSchedule, importPastedSchedule, refreshNow } from "@/features/sync/actions";
import { ConnectForm, PasteForm, RefreshButton } from "@/features/sync/connect-form";
import { CopierPanel } from "@/features/sync/copier-panel";
import { copierBookmarklet, copierPath } from "@/features/sync/copier";
import { siteUrl } from "@/lib/site-url";
import { formatAgo } from "@/features/sync/freshness";
import { PROVIDER_POLICIES, mayPoll } from "@/features/sync/policy";
import { listedEvents } from "@/features/sync/queries";
import { liveJobsByEvent } from "@/features/sync/jobs";
import { AutoRefresh } from "@/features/sync/auto-refresh";

export const dynamic = "force-dynamic";
// Refresh reads pages after its response, for as long as this allows.
export const maxDuration = 300;
export const metadata: Metadata = { title: "Connected schedules" };

export default async function AdminSyncPage() {
  const copierToken = process.env.COPIER_TOKEN;
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) notFound();

  const [rows, jobs] = await Promise.all([listedEvents(), liveJobsByEvent()]);
  const now = new Date();
  const connected = rows.filter((r) => r.sourcePlatform);
  const rest = rows.filter((r) => !r.sourcePlatform);

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      {jobs.size > 0 && <AutoRefresh />}
      <Link href="/admin" className="text-sm text-brand-text hover:underline">
        ← Admin
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Connected schedules</h1>
      <p className="mt-2 text-sm text-muted">
        Events other people run. Paste the page where an event&rsquo;s schedule
        is published, and its robots.txt decides what happens: a site that lets
        crawlers in gets read on a schedule and kept current by itself; one
        that refuses &mdash; EventConnect answers with a blanket Disallow
        &mdash; has its link saved instead, and the event page sends people
        straight there. Either way beats sending a parent to an
        organizer&rsquo;s front page to hunt.
      </p>

      {/*
        No token, no copier. The address is the only thing keeping this off a
        public path, so a deployment without one is told rather than quietly
        handed a bookmark that 404s.
      */}
      {copierToken ? (
        <CopierPanel
          source={copierBookmarklet(siteUrl(), copierToken)}
          codeUrl={`${siteUrl().replace(/\/$/, "")}${copierPath(copierToken)}`}
        />
      ) : (
        <p className="mt-4 rounded-lg border border-line bg-elevated p-3 text-sm text-muted">
          The schedule copier is served under a secret address and this
          deployment has none. Set <span className="font-mono">COPIER_TOKEN</span>{" "}
          to a long random string and it appears here.
        </p>
      )}

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

              {/* What we are allowed to do with this platform, next to what
                  we are doing. The two drifting apart is the failure. */}
              {(() => {
                const decision = mayPoll(row.sourcePlatform!);
                const policy = PROVIDER_POLICIES[row.sourcePlatform as never] as
                  | (typeof PROVIDER_POLICIES)["athletes2events"]
                  | undefined;
                if (decision.may && !decision.overridden) return null;
                return (
                  <p
                    className={`mt-1 text-xs ${decision.may ? "text-amber-700" : "text-muted"}`}
                  >
                    {decision.may
                      ? `Polling anyway — SYNC_OVERRIDE_PLATFORMS covers ${row.sourcePlatform}.`
                      : `Not polling — ${decision.reason}.`}{" "}
                    {policy?.note}{" "}
                    {policy?.termsUrl && (
                      <a
                        href={policy.termsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-text hover:underline"
                      >
                        terms
                      </a>
                    )}
                  </p>
                );
              })()}

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

              {/* A read too long for one invocation, in progress: the count
                  is what the job runner has filed so far, and the page asks
                  for itself again every few seconds while it climbs. */}
              {(() => {
                const job = jobs.get(row.id);
                if (!job) return null;
                const held = job.leasedUntil && job.leasedUntil > now;
                return (
                  <p className="mt-1 text-xs text-brand-text">
                    Reading in the background
                    {job.stepsTotal ? ` — ${job.stepsDone} of ${job.stepsTotal} pages` : ""}
                    {job.stepLabel ? ` (${job.stepLabel})` : ""}
                    {held ? "" : " · waiting for the next tick"}
                  </p>
                );
              })()}

              <RefreshButton action={refreshNow} eventId={row.id} busy={jobs.has(row.id)} />
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
