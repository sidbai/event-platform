import { redirect } from "next/navigation";

/**
 * Your page moved to the front door.
 *
 * Signed in, the front page is yours — what you follow beside the feed —
 * and there is no second place to keep it. The old address keeps working
 * for the calendar link and anything else that learned it, week and all.
 */
export default async function MePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  redirect(week ? `/?week=${encodeURIComponent(week)}#week` : "/");
}
