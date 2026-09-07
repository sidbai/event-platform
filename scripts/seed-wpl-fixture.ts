/**
 * A real league to walk the organizer and team flow through.
 *
 *   pnpm db:seed:wpl
 *
 * Seeds only the PRECONDITIONS — six real Washington Premier League member
 * clubs' U13 boys teams, and a manager account for each. Everything the flow
 * is meant to prove (creating the league, its dates, its divisions, entering
 * teams, approving them, drawing fixtures, entering results) is deliberately
 * left to be done through the UI, because a script that did those would be
 * testing itself rather than the product.
 *
 * WPL structure is real, checked against wpl-soccer.com: four competitive
 * tiers (National 1, Classic, Copa, Development), a fall season that starts
 * after Labor Day weekend and ends before Thanksgiving. For 2026-27 WPL moves
 * to the school-year birth cycle (Aug 1 – Jul 31), which is why a U13 division
 * covers two calendar birth years — the case event_divisions.birthYears is an
 * array for.
 *
 * Idempotent: re-running upserts the teams, users and memberships and leaves
 * any league you have built around them alone.
 *
 * LOCAL ONLY. It creates sign-in-able accounts with predictable addresses, and
 * dev login accepts any email, so this has no business near production.
 */
import { config } from "dotenv";

import { slugify } from "../src/lib/slug";

// Must run before the db module loads — it reads DATABASE_URL at import time
// and static imports hoist above this call. Same shape as the other seeders.
config({ path: ".env.local" });

/** Real WPL member clubs, with a U13 boys team apiece. */
const CLUBS = [
  { club: "Eagleclaw FC", city: "Tukwila", manager: "eagleclaw" },
  { club: "Emerald City FC", city: "Seattle", manager: "emeraldcity" },
  { club: "Everett Youth Soccer Club", city: "Everett", manager: "everett" },
  { club: "Lake Washington Premier FC", city: "Kirkland", manager: "lwpfc" },
  { club: "Northlake Soccer Club", city: "Kenmore", manager: "northlake" },
  { club: "Seattle Celtic", city: "Seattle", manager: "celtic" },
];

/** Short name for the team itself, not the club. */
const teamName = (club: string) => `${club} B2014`;

async function main() {
  if (!process.env.DATABASE_URL?.includes("127.0.0.1")) {
    throw new Error(
      "Refusing to run: this fixture creates sign-in-able accounts and is for a local database only.",
    );
  }

  const { db } = await import("../src/db");
  const { teamMembers, teams, users } = await import("../src/db/schema");

  for (const row of CLUBS) {
    const email = `${row.manager}@wpl.test`;
    const name = teamName(row.club);
    const slug = slugify(name);

    const [user] = await db
      .insert(users)
      .values({
        email,
        name: `${row.club} manager`,
        username: row.manager,
        displayName: `${row.club} manager`,
      })
      .onConflictDoUpdate({ target: users.email, set: { name: `${row.club} manager` } })
      .returning({ id: users.id });

    const [team] = await db
      .insert(teams)
      .values({
        slug,
        name,
        city: row.city,
        ageGroup: "U13",
        gender: "boys",
        visibility: "public",
      })
      .onConflictDoUpdate({
        target: teams.slug,
        set: { name, city: row.city, ageGroup: "U13" },
      })
      .returning({ id: teams.id });

    // team_members is keyed on (team, user) with no id of its own, so the
    // conflict target is that pair rather than a primary key column.
    await db
      .insert(teamMembers)
      .values({ teamId: team.id, userId: user.id, role: "manager" })
      .onConflictDoUpdate({
        target: [teamMembers.teamId, teamMembers.userId],
        set: { role: "manager" },
      });

    console.log(`${name.padEnd(42)} manager: ${email}`);
  }

  console.log(
    `\n${CLUBS.length} teams ready. Sign in as any address above with dev login.`,
  );
  console.log("Now build the league through the UI — that is the part under test.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
