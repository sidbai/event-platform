/**
 * Load events run by other organizers from a file.
 *
 *   pnpm db:seed:listings                      # every file in data/listings
 *   pnpm db:seed:listings seattle-2026-fall    # just one
 *
 * The alternative was typing each one into a form, which is fine for two and
 * hopeless for fifty, and the alternative to *that* was turning on dev login
 * in production — which is not a shortcut, it is handing anyone who visits an
 * admin account.
 *
 * So this follows the shape that already works for migrations: the data is
 * prepared and reviewed in the repo, and running it against production is the
 * owner's to do. Adding an event later means editing JSON, not code.
 *
 * Idempotent by slug, so re-running is safe and corrects a listing in place.
 * It will not touch an event this platform runs — see the guard below.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { config } from "dotenv";

config({ path: ".env.local" });

const DIR = join(process.cwd(), "data", "listings");

type Listing = {
  slug: string;
  title: string;
  kind: string;
  /** YYYY-MM-DD in the event's own timezone. */
  startDate: string;
  endDate?: string;
  /** Local time the first day starts, if the organizer publishes one. */
  startTime?: string;
  venueName?: string;
  venueCity?: string;
  ageGroup?: string;
  gender?: string;
  format?: string;
  summary?: string;
  /** Whose event it is. Shown on the listing; required. */
  sourceName: string;
  /** Their page, which is where entries actually happen. Required. */
  sourceUrl: string;
  /** Straight to the fixtures, when the organizer publishes them separately. */
  scheduleUrl?: string;
};

const TIMEZONE = "America/Los_Angeles";

function load(only?: string): Listing[] {
  const files = readdirSync(DIR)
    .filter((f) => f.endsWith(".json"))
    .filter((f) => !only || f === `${only}.json` || f === only);
  if (files.length === 0) throw new Error(`No listing files matched in ${DIR}`);
  return files.flatMap((f) => JSON.parse(readFileSync(join(DIR, f), "utf8")) as Listing[]);
}

async function main() {
  const [, , only] = process.argv;
  const rows = load(only);

  const { db } = await import("../src/db");
  const s = await import("../src/db/schema");
  const { eq } = await import("drizzle-orm");
  const { zonedDate } = await import("../src/lib/dates");
  const { safeSourceUrl } = await import("../src/features/events/listing");

  // Attributed to an admin when there is one, so a wrong listing has someone
  // to ask. Null is fine — the column allows it and the data is in the repo.
  const adminEmail = (process.env.ADMIN_EMAILS ?? "").split(",")[0]?.trim();
  const admin = adminEmail
    ? await db.query.users.findFirst({
        where: eq(s.users.email, adminEmail),
        columns: { id: true },
      })
    : null;

  let added = 0;
  let updated = 0;

  for (const row of rows) {
    if (!row.sourceName || !safeSourceUrl(row.sourceUrl)) {
      throw new Error(
        `${row.slug}: a listing needs a sourceName and an absolute http(s) sourceUrl`,
      );
    }

    if (row.scheduleUrl && !safeSourceUrl(row.scheduleUrl)) {
      throw new Error(`${row.slug}: scheduleUrl must be an absolute http(s) URL`);
    }

    const kind = await db.query.eventKinds.findFirst({
      where: eq(s.eventKinds.slug, row.kind),
      columns: { slug: true },
    });
    if (!kind) throw new Error(`${row.slug}: unknown kind "${row.kind}"`);

    const existing = await db.query.events.findFirst({
      where: eq(s.events.slug, row.slug),
      columns: { id: true, sourceName: true, title: true },
    });
    // The important guard. A slug collision with an event this platform
    // actually runs would otherwise overwrite a real tournament — its
    // divisions and results would survive while its identity was replaced by
    // somebody else's listing.
    if (existing && !existing.sourceName) {
      throw new Error(
        `${row.slug}: "${existing.title}" is run on this platform, not a listing. Refusing to overwrite it.`,
      );
    }

    let venueId: string | null = null;
    if (row.venueName) {
      const venue = await db.query.venues.findFirst({
        where: eq(s.venues.name, row.venueName),
        columns: { id: true },
      });
      venueId =
        venue?.id ??
        (
          await db
            .insert(s.venues)
            .values({ name: row.venueName, city: row.venueCity ?? null })
            .returning({ id: s.venues.id })
        )[0].id;
    }

    const values = {
      slug: row.slug,
      kind: row.kind,
      modules: [],
      title: row.title,
      summary: row.summary ?? null,
      status: "published" as const,
      visibility: "public" as const,
      locationType: "in_person" as const,
      venueId,
      startsAt: zonedDate(row.startDate, row.startTime ?? "00:00", TIMEZONE),
      // The end of the last day, so a range covers the day it names.
      endsAt: row.endDate ? zonedDate(row.endDate, "23:59", TIMEZONE) : null,
      timezone: TIMEZONE,
      ageGroup: row.ageGroup ?? null,
      gender: row.gender ?? null,
      format: row.format ?? null,
      host: row.sourceName,
      sourceName: row.sourceName,
      sourceUrl: safeSourceUrl(row.sourceUrl),
      scheduleUrl: safeSourceUrl(row.scheduleUrl ?? null),
      listedBy: admin?.id ?? null,
      // Deliberately no organizerId: nobody here runs these. Claiming one is
      // what sets it.
    };

    if (existing) {
      await db.update(s.events).set(values).where(eq(s.events.id, existing.id));
      updated++;
      console.log(`updated  ${row.slug}`);
    } else {
      await db.insert(s.events).values(values);
      added++;
      console.log(`added    ${row.slug}`);
    }
  }

  console.log(`\n${added} added, ${updated} updated.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
