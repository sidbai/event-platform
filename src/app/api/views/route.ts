import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { events, forumPosts, newsPosts } from "@/db/schema";
import { checkAnonymousRateLimit } from "@/features/rate-limit";
import { clientIp, ipSubject } from "@/features/rate-limit/subject";
import { recordView, type ViewSubject } from "@/features/views/queries";

export const dynamic = "force-dynamic";

const SUBJECTS = ["event", "news_post", "forum_post"] as const;

/** Does the thing being counted exist? Keeps the table free of typed-in ids. */
async function exists(subject: ViewSubject, id: string): Promise<boolean> {
  if (subject === "event") {
    return Boolean(
      await db.query.events.findFirst({ where: eq(events.id, id), columns: { id: true } }),
    );
  }
  if (subject === "news_post") {
    return Boolean(
      await db.query.newsPosts.findFirst({
        where: eq(newsPosts.id, id),
        columns: { id: true },
      }),
    );
  }
  return Boolean(
    await db.query.forumPosts.findFirst({
      where: eq(forumPosts.id, id),
      columns: { id: true },
    }),
  );
}

/**
 * Count one view of one page.
 *
 * Called from the browser after the page renders, rather than counted during
 * the render, and the difference is the whole design: a crawler that never
 * runs scripts is not a reader, and a page that writes to the database on
 * every render cannot be cached.
 *
 * Nothing about who is reading is stored — see the page_views table. The
 * address is used for the rate limit and hashed by it, never written here.
 *
 * Honest about what it is: a counter anybody can POST to. The limit keeps a
 * script from typing a number into it; it does not make the number an
 * audited fact, and nothing on this site depends on it being one.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const { subject, id } = (body ?? {}) as { subject?: unknown; id?: unknown };
  if (typeof subject !== "string" || typeof id !== "string") {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!(SUBJECTS as readonly string[]).includes(subject)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  // A UUID, because subject_id is one and a malformed value would throw
  // rather than be refused.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  /*
   * Limited when there is something to limit on, and counted anyway when
   * there is not.
   *
   * The anonymous limiter fails CLOSED for reviews, and rightly: there it is
   * the only control standing between a script and the database. Here the
   * worst case is a wrong number in small grey text, and failing closed would
   * mean a deployment without RATE_LIMIT_SECRET set silently counting nothing
   * and looking, from the outside, exactly like a site nobody reads.
   */
  const subjectKey = ipSubject(clientIp(await headers()), process.env.RATE_LIMIT_SECRET ?? "");
  if (subjectKey) {
    const gate = await checkAnonymousRateLimit("view:count", subjectKey);
    // Quietly: somebody past the limit still gets their page, and an error
    // here would only surface as a console message on it.
    if (!gate.ok) return NextResponse.json({ ok: true, counted: false });
  }

  const typed = subject as ViewSubject;
  if (!(await exists(typed, id))) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  await recordView(typed, id);
  return NextResponse.json({ ok: true, counted: true });
}
