"use client";

import Image from "next/image";
import { useEffect, useState, type ReactNode } from "react";

/**
 * The drawer behind the hamburger on phones.
 *
 * It slides in from the left, the way a forum's does, and holds what the
 * desktop layout keeps in a column beside the feed: where to go, and what
 * you follow. Signed out it is just the sections and a way to sign in. What
 * it holds is rendered on the server and handed in as children; this only
 * opens and closes it — on the button, on the backdrop, on Escape, and on
 * any link inside it being pressed.
 */
export function NavMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    // The page behind must not scroll with the drawer.
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label="Menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-white/80 hover:bg-white/10 hover:text-white"
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          aria-hidden
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Menu">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <aside className="absolute inset-y-0 left-0 flex w-80 max-w-[88vw] flex-col overflow-y-auto bg-page px-4 pb-6 pt-3 text-ink shadow-xl">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2.5">
                <Image src="/logo-mark.png" alt="" width={36} height={36} className="h-9 w-9" />
                <span className="text-base font-semibold tracking-tight">King Juan Soccer</span>
              </span>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-elevated hover:text-ink"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            {/* A press on any link in here is the reader leaving; close as
                they go rather than after the page has changed under them. */}
            <div
              className="mt-4"
              onClickCapture={(e) => {
                if ((e.target as HTMLElement).closest("a")) setOpen(false);
              }}
            >
              {children}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
