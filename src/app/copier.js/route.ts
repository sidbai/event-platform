import { copierSource } from "@/features/sync/copier";

/**
 * The copier's code, for the bookmark that loads it.
 *
 * Public and unauthenticated on purpose: it is a script that reads the page
 * whoever clicked it already has open, and it carries nothing about this site
 * — no data, no session, nothing worth guarding. Requiring a login to fetch
 * it would only mean it failed silently on the one page it exists to read.
 */
export const dynamic = "force-static";

export function GET(): Response {
  return new Response(copierSource(), {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      // Short, because the bookmark cache-busts anyway and a stale copy is
      // the self-updating property quietly not working.
      "Cache-Control": "public, max-age=60",
    },
  });
}
