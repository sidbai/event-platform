"use client";

import { useState } from "react";

/**
 * The copier, offered as something to drag to a bookmarks bar.
 *
 * Rendered as text to copy rather than a link to drag: React refuses to put a
 * javascript: URL in an href, for good reasons that do not stop being good
 * here. Making the bookmark by hand is two more steps, once.
 */
export function CopierPanel({ source }: { source: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <details className="mt-4 rounded-lg border border-line bg-elevated p-3">
      <summary className="cursor-pointer text-sm font-medium">
        Schedule copier — for platforms we cannot read
      </summary>

      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted">
        <li>Copy the code below.</li>
        <li>
          Make a new bookmark in your browser. Any name; paste the code as the
          address.
        </li>
        <li>
          Open the tournament&rsquo;s own schedule page and click the bookmark. It
          reads the table already on your screen &mdash; it sends nothing anywhere.
        </li>
        <li>Copy what it shows you, and paste it into the box on that event below.</li>
      </ol>

      <button
        onClick={() => {
          navigator.clipboard.writeText(source).then(
            () => setCopied(true),
            () => setCopied(false),
          );
        }}
        className="mt-3 rounded-md border border-line bg-card px-2.5 py-1 text-xs hover:bg-elevated"
      >
        {copied ? "Copied" : "Copy the code"}
      </button>

      <textarea
        readOnly
        rows={3}
        value={source}
        onFocus={(e) => e.currentTarget.select()}
        className="mt-2 w-full rounded-md border border-line bg-card px-2 py-1.5 font-mono text-[10px] leading-tight"
      />
    </details>
  );
}
