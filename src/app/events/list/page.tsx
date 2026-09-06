import { redirect } from "next/navigation";

/**
 * Listing an event used to have its own page and its own action.
 *
 * It turned out to be the same act as creating one — 69% of the code was
 * identical — so both now live on /events/new, where the first question is
 * who runs it. This redirect stays because the link was published.
 */
export default function ListEventPage() {
  redirect("/events/new?listing=1");
}
