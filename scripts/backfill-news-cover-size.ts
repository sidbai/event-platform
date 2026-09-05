import { config } from "dotenv";
import { imageSize } from "image-size";
import { and, eq, isNotNull, isNull } from "drizzle-orm";

// Must run before the db module is loaded — it reads DATABASE_URL at import
// time, and static imports hoist above this call. Hence the dynamic import
// inside main(), same as the seeders.
config({ path: ".env.local" });

/**
 * Fills in cover_width / cover_height for news posts written before the
 * browser started measuring uploads.
 *
 * Without it those posts keep rendering in a fixed box, which is what cropped
 * a 960x1200 portrait photo down to a 16:8 letterbox and cut most of it off.
 * Reading the real size lets the article show the whole picture.
 *
 * Safe to re-run: it only touches rows where both columns are still null, and
 * a cover it cannot read is left alone rather than written as a guess.
 */

/** Enough for the header of any format we accept; nobody needs the pixels. */
const HEAD_BYTES = 256 * 1024;

async function readSize(url: string) {
  const res = await fetch(url, { headers: { Range: `bytes=0-${HEAD_BYTES - 1}` } });
  if (!res.ok && res.status !== 206) {
    throw new Error(`HTTP ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const { width, height } = imageSize(buf);
  if (!width || !height) throw new Error("no dimensions in header");
  return { width, height };
}

async function main() {
  const { db } = await import("../src/db");
  const { newsPosts } = await import("../src/db/schema");

  const rows = await db.query.newsPosts.findMany({
    where: and(isNotNull(newsPosts.coverUrl), isNull(newsPosts.coverWidth)),
    columns: { id: true, slug: true, coverUrl: true },
  });

  if (rows.length === 0) {
    console.log("Nothing to backfill: every cover already has its size.");
    process.exit(0);
  }

  let filled = 0;
  const failed: string[] = [];

  for (const post of rows) {
    try {
      const { width, height } = await readSize(post.coverUrl!);
      await db
        .update(newsPosts)
        .set({ coverWidth: width, coverHeight: height })
        .where(eq(newsPosts.id, post.id));
      console.log(`${post.slug}: ${width}x${height}`);
      filled++;
    } catch (e) {
      // One unreadable cover must not stop the rest: the row keeps its null
      // and goes on rendering in the fixed box, exactly as it does today.
      failed.push(`${post.slug} (${(e as Error).message})`);
    }
  }

  console.log(`Covers: ${filled} measured, ${failed.length} skipped.`);
  if (failed.length > 0) console.log(`Could not read: ${failed.join(", ")}`);
  process.exit(0);
}

void main();
