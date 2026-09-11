"use client";

import { useState, useTransition } from "react";

/**
 * The address of somebody's own calendar, shown only once they ask.
 *
 * Asked for rather than printed, because the token behind it is a password:
 * making one for every account would hand a secret to people who never wanted
 * one, and printing it on a page they might screen-share is worse than a
 * click.
 *
 * Rotating is next to it for the same reason. There is no un-sending a link
 * pasted into a group chat; the only remedy is to make it worthless, and that
 * has to be one press from where the link is read.
 */
export function CalendarLink({
  origin,
  reveal,
  rotate,
}: {
  origin: string;
  reveal: () => Promise<string | null>;
  rotate: () => Promise<string | null>;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const url = token ? `${origin}/calendar/${token}/fixtures.ics` : null;

  if (!url) {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => setToken(await reveal()))}
        className="mt-2 rounded-md border border-line px-3 py-1.5 text-sm hover:bg-elevated disabled:opacity-60"
      >
        {pending ? "Making one…" : "Get my calendar link"}
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <p className="text-sm">
        <a
          href={url.replace(/^https?:/, "webcal:")}
          className="font-medium text-brand-text hover:underline"
        >
          Add this to your calendar
        </a>
      </p>
      <p className="break-all rounded-md border border-line bg-elevated px-3 py-2 font-mono text-xs text-muted">
        {url}
      </p>
      <p className="text-xs text-muted">
        Anyone with this address can read your fixtures, so treat it like a
        password.{" "}
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => setToken(await rotate()))}
          className="underline hover:text-ink disabled:opacity-60"
        >
          Replace it
        </button>{" "}
        if you have shared it by accident — the old one stops working at once.
      </p>
    </div>
  );
}
