/**
 * Seeds King Juan Cup 2026 from the fixture in data/king-juan-cup-2026/.
 *
 *   pnpm db:seed
 *
 * Idempotent: re-running replaces the event's divisions, teams-in-event and
 * matches, and upserts the venue, global teams and event row. Requires
 * DATABASE_URL in .env.local and the schema migrated (pnpm db:migrate).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { config } from "dotenv";
import { and, eq, inArray, sql } from "drizzle-orm";

import { slugify as baseSlugify } from "../src/lib/slug";
import {
  computeStandings,
  type MatchResult,
} from "../src/features/tournaments/standings";

config({ path: ".env.local" });

const DIR = join(process.cwd(), "data", "king-juan-cup-2026");
const read = <T>(f: string): T => JSON.parse(readFileSync(join(DIR, f), "utf8")) as T;

type TeamRow = { name: string; division: string; group: string; logo: string };
type Game = {
  division: string;
  group: string;
  time: string;
  field: string;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
};
type Meta = {
  event: Record<string, unknown> & {
    slug: string;
    title: string;
    titleZh: string;
    kind: string;
    format: string;
    startsAt: string;
    endsAt: string;
    timezone: string;
    status: string;
    host: string;
    summary: string;
  };
  venue: {
    name: string;
    address: string;
    city: string;
    region: string;
    postalCode: string;
    lat: number;
    lng: number;
    notes: string;
    mapUrl: string;
  };
  divisions: {
    name: string;
    label: string;
    birthYears: number[];
    rosterMin: number;
    rosterMax: number;
  }[];
  sponsors: unknown;
  rules: unknown;
  champions: unknown;
};

// Chinese team names don't slugify; map them explicitly (matches logo basenames).
const SLUG_OVERRIDES: Record<string, string> = {
  "吃饼FC": "chibing-fc",
  "喂饼FC": "weibing-fc",
  "烙饼FC": "laobing-fc",
};

const slugify = (name: string) => SLUG_OVERRIDES[name] ?? baseSlugify(name);

const EVENT_KINDS = [
  { slug: "game", label: "Game", defaultModules: ["fixture", "result"], sort: 10 },
  { slug: "scrimmage", label: "Scrimmage", defaultModules: ["fixture", "needs-opponent", "result"], sort: 20 },
  { slug: "pickup", label: "Pickup", defaultModules: ["attendance"], sort: 30 },
  { slug: "tournament", label: "Tournament", defaultModules: ["competition", "registration", "roster"], sort: 40 },
  { slug: "league", label: "League", defaultModules: ["competition", "registration", "roster"], sort: 50 },
  { slug: "jamboree", label: "Jamboree", defaultModules: ["competition"], sort: 60 },
  { slug: "showcase", label: "Showcase", defaultModules: ["competition", "registration"], sort: 70 },
  { slug: "camp", label: "Camp / Clinic", defaultModules: ["registration", "sessions"], sort: 80 },
  { slug: "tryout", label: "Tryout", defaultModules: ["registration"], sort: 90 },
  { slug: "watch-party", label: "Watch Party", defaultModules: ["attendance", "broadcast"], sort: 100 },
  { slug: "meetup", label: "Meetup", defaultModules: ["attendance"], sort: 110 },
  { slug: "custom", label: "Custom", defaultModules: ["attendance"], sort: 120 },
];

function kickoffAt(datePart: string, time: string): Date {
  const [rawH, rawM] = time.split(":");
  const hh = rawH.trim().padStart(2, "0");
  const mm = (rawM ?? "00").trim().padStart(2, "0");
  // King Juan Cup runs on a single August day — PDT, UTC-07:00.
  return new Date(`${datePart}T${hh}:${mm}:00-07:00`);
}

async function main() {
  const { db } = await import("../src/db");
  const s = await import("../src/db/schema");

  const meta = read<Meta>("meta.json");
  const teamRows = read<TeamRow[]>("teams.json");
  const schedule = read<{ games: Game[] }>("schedule.json");
  const datePart = meta.event.startsAt.slice(0, 10);

  await db
    .insert(s.eventKinds)
    .values(EVENT_KINDS)
    .onConflictDoUpdate({
      target: s.eventKinds.slug,
      set: {
        label: sql`excluded.label`,
        defaultModules: sql`excluded.default_modules`,
        sort: sql`excluded.sort`,
      },
    });

  // venue (lookup by name — venues have no natural key)
  const existingVenue = await db.query.venues.findFirst({
    where: eq(s.venues.name, meta.venue.name),
  });
  const venueId =
    existingVenue?.id ??
    (
      await db
        .insert(s.venues)
        .values({
          name: meta.venue.name,
          address: meta.venue.address,
          city: meta.venue.city,
          region: meta.venue.region,
          postalCode: meta.venue.postalCode,
          lat: meta.venue.lat,
          lng: meta.venue.lng,
          notes: meta.venue.notes,
          mapUrl: meta.venue.mapUrl,
        })
        .returning({ id: s.venues.id })
    )[0].id;

  // event (upsert by slug)
  const [event] = await db
    .insert(s.events)
    .values({
      slug: meta.event.slug,
      kind: meta.event.kind,
      modules: ["competition", "registration", "roster"],
      title: meta.event.title,
      titleZh: meta.event.titleZh,
      summary: meta.event.summary,
      status: (meta.event.status as (typeof s.eventStatus.enumValues)[number]),
      visibility: "public",
      locationType: "in_person",
      venueId,
      startsAt: new Date(meta.event.startsAt),
      endsAt: new Date(meta.event.endsAt),
      timezone: meta.event.timezone,
      ageGroup: "U9–U13",
      gender: "coed",
      format: meta.event.format,
      host: meta.event.host,
      result: { champions: meta.champions },
      metadata: { rules: meta.rules, sponsors: meta.sponsors },
    })
    .onConflictDoUpdate({
      target: s.events.slug,
      set: {
        title: meta.event.title,
        titleZh: meta.event.titleZh,
        summary: meta.event.summary,
        status: (meta.event.status as (typeof s.eventStatus.enumValues)[number]),
        venueId,
        startsAt: new Date(meta.event.startsAt),
        endsAt: new Date(meta.event.endsAt),
        result: { champions: meta.champions },
        metadata: { rules: meta.rules, sponsors: meta.sponsors },
        updatedAt: new Date(),
      },
    })
    .returning();

  // wipe this event's children, then rebuild
  await db.delete(s.matches).where(eq(s.matches.eventId, event.id));
  await db.delete(s.eventTeams).where(eq(s.eventTeams.eventId, event.id));
  await db.delete(s.eventDivisions).where(eq(s.eventDivisions.eventId, event.id));

  // divisions
  const divisionIdByName = new Map<string, string>();
  for (const d of meta.divisions) {
    const [row] = await db
      .insert(s.eventDivisions)
      .values({
        eventId: event.id,
        name: d.name,
        label: d.label,
        birthYears: d.birthYears,
        format: meta.event.format,
        rosterMin: d.rosterMin,
        rosterMax: d.rosterMax,
      })
      .returning({ id: s.eventDivisions.id });
    divisionIdByName.set(d.name, row.id);
  }

  // teams (global, upsert by slug) + event_teams
  const teamIdByName = new Map<string, string>();
  for (const t of teamRows) {
    const slug = slugify(t.name);
    const [row] = await db
      .insert(s.teams)
      .values({
        slug,
        name: t.name,
        club: null,
        ageGroup: t.division,
        gender: "coed",
        city: "Bellevue",
        crestUrl: t.logo
          ? `https://raw.githubusercontent.com/sidbai/kingjuan-assets/main/logos/${t.logo}`
          : null,
      })
      .onConflictDoUpdate({
        target: s.teams.slug,
        set: { name: t.name, crestUrl: sql`excluded.crest_url` },
      })
      .returning({ id: s.teams.id });
    teamIdByName.set(t.name, row.id);

    await db.insert(s.eventTeams).values({
      eventId: event.id,
      teamId: row.id,
      divisionId: divisionIdByName.get(t.division) ?? null,
      groupLabel: t.group,
    });
  }

  // matches
  const groupMatchesByName: MatchResult[] = [];
  let matchCount = 0;
  for (const g of schedule.games) {
    const isKo = g.group === "Semi" || g.group === "Final";
    const homeId = teamIdByName.get(g.home_team) ?? null;
    const awayId = teamIdByName.get(g.away_team) ?? null;

    await db.insert(s.matches).values({
      eventId: event.id,
      divisionId: divisionIdByName.get(g.division) ?? null,
      stage: isKo ? "ko" : "group",
      round: isKo ? g.group.toLowerCase() : "group",
      groupLabel: isKo ? null : g.group,
      field: g.field,
      kickoffAt: kickoffAt(datePart, g.time),
      homeTeamId: homeId,
      awayTeamId: awayId,
      homePlaceholder: homeId ? null : g.home_team,
      awayPlaceholder: awayId ? null : g.away_team,
      homeScore: g.home_score,
      awayScore: g.away_score,
      status: g.status === "final" ? "final" : "scheduled",
    });
    matchCount += 1;

    if (!isKo) {
      groupMatchesByName.push({
        homeTeamId: g.home_team,
        awayTeamId: g.away_team,
        homeScore: g.home_score,
        awayScore: g.away_score,
      });
    }
  }

  // group-stage standings (shared logic) written back onto event_teams
  const cap = (meta.rules as { goalCapPerGame?: number }).goalCapPerGame ?? 6;
  const standings = computeStandings(groupMatchesByName, undefined, { goalCap: cap });
  for (const [name, row] of standings) {
    const teamId = teamIdByName.get(name);
    if (!teamId) continue;
    await db
      .update(s.eventTeams)
      .set({
        played: row.played,
        won: row.won,
        drawn: row.drawn,
        lost: row.lost,
        gf: row.gf,
        ga: row.ga,
        points: row.points,
      })
      .where(and(eq(s.eventTeams.eventId, event.id), eq(s.eventTeams.teamId, teamId)));
  }

  // mark champions with seed = 1 in their division
  const champions = meta.champions as { division: string; champion: string }[];
  const champIds = champions
    .map((c) => teamIdByName.get(c.champion))
    .filter((x): x is string => Boolean(x));
  if (champIds.length) {
    await db
      .update(s.eventTeams)
      .set({ seed: 1 })
      .where(and(eq(s.eventTeams.eventId, event.id), inArray(s.eventTeams.teamId, champIds)));
  }

  console.log(
    `Seeded ${meta.event.title}: ${meta.divisions.length} divisions, ` +
      `${teamRows.length} teams, ${matchCount} matches. ` +
      `Rosters: none in source data (add later). Event slug: ${event.slug}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
