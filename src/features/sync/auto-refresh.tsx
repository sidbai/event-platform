"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Re-render the page every few seconds while a read is under way.
 *
 * The admin screen is a server component; the count of pages read lives in
 * the database and changes while the person watches. This asks the server
 * for the page again on a timer and stops when there is nothing to watch.
 */
export function AutoRefresh({ every = 5000 }: { every?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), every);
    return () => clearInterval(id);
  }, [router, every]);
  return null;
}
