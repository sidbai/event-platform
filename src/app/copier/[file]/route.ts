import { timingSafeEqual } from "node:crypto";

import { copierSource } from "@/features/sync/copier";

/**
 * The copier's code, for the bookmark that loads it.
 *
 * Unauthenticated, because it cannot be anything else: the bookmark loads
 * this from the schedule page it is reading, which makes it a cross-site
 * subresource request, and a Lax session cookie is not sent on one. A login
 * here would mean failing silently on the one page this exists to read.
 *
 * So the address carries the secret instead. That is obscurity rather than
 * authentication and is written down as such — what it buys is that a
 * scraping tool is not published at a guessable path for anybody who looks,
 * which is a different question from whether it guards anything. It guards
 * nothing: it reads the page whoever ran it already had open, and carries no
 * data and no session of ours.
 *
 * Without COPIER_TOKEN set there is no address at all. Failing closed is the
 * only honest default — the alternative is a deployment that quietly serves
 * it at a path somebody can guess.
 */
export const dynamic = "force-dynamic";

/** Constant-time, so the 404 says nothing about how close a guess was. */
function matches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
): Promise<Response> {
  const token = process.env.COPIER_TOKEN;
  const { file } = await params;

  if (!token || !matches(file, `${token}.js`)) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(copierSource(), {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      // Short, because the bookmark cache-busts anyway and a stale copy is
      // the self-updating property quietly not working.
      "Cache-Control": "private, max-age=60",
      // Not that it is linked from anywhere, but say so rather than rely on
      // nobody having found it.
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
