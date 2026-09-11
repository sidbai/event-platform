/**
 * The weekly bookmark, printed — so the skill and the browser read the same
 * code and nobody keeps two copies true by hand.
 *
 *   pnpm leagues:snippet              # the code, to paste into a console
 *   pnpm leagues:snippet --bookmark   # as a javascript: URL, for a bookmark
 *
 * Nothing here touches the database or the network.
 */
import { leagueFetchBookmarklet, leagueFetchSource } from "../src/features/sync/league-bookmark";

const asBookmark = process.argv.includes("--bookmark");
process.stdout.write((asBookmark ? leagueFetchBookmarklet() : leagueFetchSource()) + "\n");
