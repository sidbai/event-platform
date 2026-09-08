"use client";

import { useEffect } from "react";

/**
 * Counts one view of the page it is dropped on.
 *
 * In the browser rather than during the render, deliberately. A server-side
 * increment counts every crawler, every prefetch and every internal request,
 * and it makes a page that could be cached uncacheable — the number would be
 * bought with a database write on every single render.
 *
 * Once per subject per tab session. A reader refreshing for scores all
 * afternoon is one person reading, and counting each refresh would turn the
 * number into a measure of how anxious somebody is about a result.
 *
 * Renders nothing, and nothing on the page waits for it.
 */
export function CountView({
  subject,
  id,
}: {
  subject: "event" | "news_post" | "forum_post";
  id: string;
}) {
  useEffect(() => {
    const key = `viewed:${subject}:${id}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // Private mode, or storage turned off. Counting the view is better than
      // dropping it, so fall through rather than return.
    }

    // Failure is silence on purpose: a counter that shows the reader an error
    // has cost more than it was worth.
    void fetch("/api/views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, id }),
      keepalive: true,
    }).catch(() => {});
  }, [subject, id]);

  return null;
}
