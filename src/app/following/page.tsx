import { permanentRedirect } from "next/navigation";

/**
 * The teams you follow moved onto the page that holds everything of yours.
 *
 * Kept as a redirect rather than deleted: the account menu points here, and
 * so does anything already bookmarked from the week this had a page of its
 * own. Permanent, because it is not coming back.
 */
export default function FollowingPage() {
  permanentRedirect("/");
}
