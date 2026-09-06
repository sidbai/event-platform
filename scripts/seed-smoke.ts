/**
 * The least data that makes the interesting pages render.
 *
 *   pnpm db:seed:smoke
 *
 * The list pages survive an empty database; an event page does not exercise
 * anything worth checking without a division, teams, a fixture and a result.
 * This seeds exactly that and nothing else, so the smoke test covers the
 * heaviest render in the app — standings and schedule — rather than six
 * variations on an empty list.
 *
 * Local and CI only. It refuses anything that looks hosted.
 */
import { config } from "dotenv";

config({ path: ".env.local" });

export const SMOKE_SLUG = "smoke-league";

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (/neon\.tech|amazonaws|supabase|render\.com/i.test(url)) {
    throw new Error("Refusing to seed a hosted database.");
  }

  const { db } = await import("../src/db");
  const s = await import("../src/db/schema");
  const { eq } = await import("drizzle-orm");

  await db
    .insert(s.eventKinds)
    .values({ slug: "league", label: "League", sort: 1 })
    .onConflictDoNothing();

  await db.delete(s.events).where(eq(s.events.slug, SMOKE_SLUG));

  const [event] = await db
    .insert(s.events)
    .values({
      slug: SMOKE_SLUG,
      title: "Smoke League",
      kind: "league",
      modules: [],
      status: "published",
      visibility: "public",
      locationType: "in_person",
      timezone: "America/Los_Angeles",
      startsAt: new Date(Date.now() + 7 * 86_400_000),
      endsAt: new Date(Date.now() + 70 * 86_400_000),
      metadata: {
        rules: {
          gameFormat: "11v11",
          tiebreakers: ["head_to_head", "goal_difference"],
          periods: 2,
          periodMinutes: 35,
        },
      },
    })
    .returning({ id: s.events.id });

  const [division] = await db
    .insert(s.eventDivisions)
    .values({
      eventId: event.id,
      name: "Smoke U13",
      label: "Smoke — U13",
      birthYears: [2013, 2014],
      format: "11v11",
      feeCents: 50000,
      capacity: 8,
    })
    .returning({ id: s.eventDivisions.id });

  const teamIds: string[] = [];
  for (const name of ["Smoke Rovers", "Smoke Wanderers"]) {
    const slug = name.toLowerCase().replace(/\W+/g, "-");
    const [team] = await db
      .insert(s.teams)
      .values({ slug, name, visibility: "public" })
      .onConflictDoUpdate({ target: s.teams.slug, set: { name } })
      .returning({ id: s.teams.id });
    teamIds.push(team.id);
    await db
      .insert(s.eventTeams)
      .values({ eventId: event.id, teamId: team.id, divisionId: division.id })
      .onConflictDoNothing();
  }

  // A played match, so the standings table has something to rank rather than
  // rendering its empty state — which is the branch least likely to break.
  await db.insert(s.matches).values({
    eventId: event.id,
    divisionId: division.id,
    stage: "group",
    round: "round-1",
    kickoffAt: new Date(Date.now() + 7 * 86_400_000),
    homeTeamId: teamIds[0],
    awayTeamId: teamIds[1],
    homeScore: 2,
    awayScore: 1,
    status: "final",
  });

  console.log(`seeded /events/${SMOKE_SLUG}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
