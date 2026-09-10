"use client";

import { useState } from "react";

/**
 * The copier, offered as something to drag to a bookmarks bar.
 *
 * Rendered as text to copy rather than a link to drag: React refuses to put a
 * javascript: URL in an href, for good reasons that do not stop being good
 * here. Making the bookmark by hand is two more steps, once.
 *
 * The second route is here because the first one has a failure it cannot fix
 * from inside: a page whose content policy refuses outside scripts blocks the
 * <script src> the bookmark injects, and the bookmark can only say so. Its own
 * code ran — the message it prints is proof of that — so the same file pasted
 * straight into the console runs too. Same code, same page, one step fewer.
 */
export function CopierPanel({ source, codeUrl }: { source: string; codeUrl: string }) {
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

      <div className="mt-4 border-t border-line pt-3">
        <p className="text-sm font-medium">If the bookmark says it could not load</p>
        <p className="mt-1 text-sm text-muted">
          Some schedule pages refuse to run scripts from anywhere but
          themselves, and the bookmark works by adding one. Nothing is wrong
          with it or with us &mdash; the same code pasted straight in runs
          fine, because that step is the only one being refused.
        </p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>
            Open{" "}
            <a href={codeUrl} className="font-mono text-brand-text hover:underline">
              {codeUrl}
            </a>{" "}
            in a tab and select all of it.
          </li>
          <li>
            Back on the schedule page, open the browser&rsquo;s developer
            console and paste it there.
          </li>
        </ol>
        <p className="mt-2 text-sm text-muted">
          It reads the same table and sends nothing anywhere, exactly as the
          bookmark does.
        </p>
      </div>
    </details>
  );
}
