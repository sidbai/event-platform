import { asc, desc, sql } from "drizzle-orm";

import { clubs } from "@/db/schema";

/**
 * The order the club directory is shown in, in one place so /clubs and the
 * admin pin list cannot drift apart — the admin screen is where someone
 * decides what to pin, so it has to show what pinning will actually do.
 *
 * Pinned clubs lead. Within them RCL ranks before WPL before anything neither
 * directory lists; below them it is plain alphabetical. Ranking the whole
 * directory by league would turn a list people scan into one they have to
 * search, which is a worse trade than the tidier grouping is worth.
 */
export const clubDirectoryOrder = [
  desc(clubs.pinned),
  sql`case
    when not ${clubs.pinned} then 0
    when ${clubs.league} = 'rcl' then 1
    when ${clubs.league} = 'wpl' then 2
    else 3
  end`,
  asc(clubs.name),
];
