import { permanentRedirect } from "next/navigation";

import type { ScheduleParams } from "@/features/tournaments/schedule-section";

/**
 * The schedule used to live here. It lives on the event page now.
 *
 * Kept as a redirect rather than deleted: this URL is in links we have
 * already published, in whatever a parent bookmarked on a Saturday, and in
 * search results. Carrying the query through means a link to one division's
 * fixtures still opens that division's fixtures.
 */
export default async function LeagueTablePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<ScheduleParams>;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);

  const q = new URLSearchParams();
  for (const key of ["view", "division", "team", "day"] as const) {
    const value = sp[key];
    if (value) q.set(key, value);
  }

  const s = q.toString();
  permanentRedirect(s ? `/events/${slug}?${s}#schedule` : `/events/${slug}#schedule`);
}
