import "server-only";

import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { events } from "@/db/schema";
import { capitalize, hhmm, logoBasename } from "@/lib/feed-format";

/** Public read feed for an event, shaped to match the JSON kingjuancup.org
 *  currently fetches from the kingjuan-assets repo (drop-in replacement). */

export type FeedTeam = {
  name: string;
  division: string | null;
  group: string;
  logo: string | null;
};

export type FeedGame = {
  division: string | null;
  group: string;
  time: string;
  field: string;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
};

export type FeedSchedule = {
  updated_at: string;
  enabled: boolean;
  games: FeedGame[];
};

async function loadEvent(slug: string) {
  return db.query.events.findFirst({
    where: eq(events.slug, slug),
    with: {
      eventTeams: {
        with: {
          team: { columns: { name: true, crestUrl: true } },
          division: { columns: { name: true } },
        },
      },
      matches: {
        orderBy: (m) => [asc(m.kickoffAt), asc(m.field)],
        with: {
          homeTeam: { columns: { name: true } },
          awayTeam: { columns: { name: true } },
          division: { columns: { name: true } },
        },
      },
    },
  });
}

export async function teamsFeed(slug: string): Promise<FeedTeam[] | null> {
  const event = await loadEvent(slug);
  if (!event) return null;
  return event.eventTeams
    .map((et) => ({
      name: et.team.name,
      division: et.division?.name ?? null,
      group: et.groupLabel ?? "",
      logo: logoBasename(et.team.crestUrl),
    }))
    .sort(
      (a, b) =>
        (a.division ?? "").localeCompare(b.division ?? "") ||
        a.name.localeCompare(b.name),
    );
}

export async function scheduleFeed(slug: string): Promise<FeedSchedule | null> {
  const event = await loadEvent(slug);
  if (!event) return null;

  const games: FeedGame[] = event.matches.map((m) => ({
    division: m.division?.name ?? null,
    group: m.stage === "ko" ? capitalize(m.round ?? "") : (m.groupLabel ?? ""),
    time: m.kickoffAt ? hhmm(m.kickoffAt, event.timezone) : "",
    field: m.field ?? "",
    home_team: m.homeTeam?.name ?? m.homePlaceholder ?? "",
    away_team: m.awayTeam?.name ?? m.awayPlaceholder ?? "",
    home_score: m.homeScore,
    away_score: m.awayScore,
    status: m.status,
  }));

  return {
    updated_at: (event.updatedAt ?? new Date()).toISOString(),
    enabled: event.status === "published" || event.status === "completed",
    games,
  };
}
