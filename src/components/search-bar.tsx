"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import type { Suggestion } from "@/features/search/kinds";

/**
 * A search box that submits on Enter, and offers what it can while you type.
 *
 * No submit button: every browser submits a single-input GET form on Enter,
 * and the magnifier already says what the field is for. method="get" keeps the
 * query in the URL, so results stay shareable and back/forward work.
 *
 * The suggestions are added on top of that form and never in place of it.
 * Enter with nothing highlighted still submits, so the results page, the
 * shareable URL and the browser's own history all keep working exactly as
 * they did — and a reader who never touches the arrow keys never learns there
 * is a list. Pass `suggest` to turn it on; without it this is the same form it
 * always was.
 */

const KIND_LABEL: Record<string, string> = {
  event: "Event",
  team: "Team",
  club: "Club",
};

export function SearchBar({
  defaultValue,
  placeholder = "Search",
  label,
  className = "",
  action,
  compact = false,
  suggest,
  minQuery = 2,
}: {
  defaultValue?: string;
  placeholder?: string;
  /** Accessible name, since there is no visible label or button. */
  label: string;
  className?: string;
  /** Where to submit. Omitted means the current page, which is what the
   *  per-section bars want; the header one targets /search. */
  action?: string;
  /** Header sizing: shorter, and readable on a dark bar. */
  compact?: boolean;
  /**
   * What to offer while they type. Omitted means no list at all, which is the
   * behaviour every one of these had before.
   */
  suggest?: (q: string) => Promise<Suggestion[]>;
  /** Below this a term matches too much to be worth showing. */
  minQuery?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const listId = useId();
  const [text, setText] = useState(defaultValue ?? "");
  const [hits, setHits] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(-1);
  const [dismissed, setDismissed] = useState(false);
  const [landedOn, setLandedOn] = useState(pathname);
  const box = useRef<HTMLFormElement>(null);

  /*
   * A new page empties the box.
   *
   * The header lives in the layout, so a client-side move — following a
   * suggestion, or pressing Back — never remounts it, and what was typed to
   * get somewhere sits there afterwards as though it were still a question.
   * Reset to whatever this page wants in it: the term for /search and
   * /teams, which put it there deliberately, and nothing for the header.
   *
   * Adjusted during the render that noticed, rather than in an effect. React
   * asks for it this way round and it saves a second render with the stale
   * value on screen.
   */
  if (landedOn !== pathname) {
    setLandedOn(pathname);
    setText(defaultValue ?? "");
    setHits([]);
    setActive(-1);
    setDismissed(false);
  }

  const looking = !!suggest && !dismissed && text.trim().length >= minQuery;

  useEffect(() => {
    if (!looking || !suggest) return;
    let live = true;
    const timer = setTimeout(() => {
      suggest(text).then((found) => {
        if (live) setHits(found);
      });
    }, 180);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [text, looking, suggest]);

  // Whether the list belongs on screen is a fact about what is typed right
  // now, not a thing to remember — so it is worked out here rather than being
  // cleared from inside the effect.
  const showing = looking ? hits : [];

  /*
   * A click outside closes it. Without this the list hangs over the page
   * after the reader has visibly moved on, and on a phone there is no other
   * way to dismiss it — there is no Escape key to press.
   */
  useEffect(() => {
    if (showing.length === 0) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setDismissed(true);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [showing.length]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (showing.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % showing.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? showing.length - 1 : i - 1));
    } else if (e.key === "Escape") {
      setDismissed(true);
      setActive(-1);
    } else if (e.key === "Enter" && active >= 0) {
      // Only when something is highlighted. Enter on its own is still the
      // form's, and still goes to the results page.
      e.preventDefault();
      router.push(showing[active].href);
      setDismissed(true);
    }
  }

  return (
    <form
      ref={box}
      method="get"
      action={action}
      role="search"
      className={`relative ${className}`}
    >
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 flex items-center ${
          compact ? "left-2.5 text-white/60" : "left-3 text-muted"
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          width={compact ? 14 : 16}
          height={compact ? 14 : 16}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </span>
      <input
        type="search"
        name="q"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setActive(-1);
          setDismissed(false);
        }}
        onKeyDown={onKeyDown}
        aria-label={label}
        placeholder={placeholder}
        autoComplete="off"
        role={suggest ? "combobox" : undefined}
        aria-expanded={suggest ? showing.length > 0 : undefined}
        aria-controls={suggest ? listId : undefined}
        aria-activedescendant={
          active >= 0 ? `${listId}-${active}` : undefined
        }
        className={
          compact
            ? "w-full rounded-full border border-white/15 bg-white/10 py-1.5 pl-8 pr-3 text-sm text-white placeholder:text-white/50 focus:border-white/30 focus:outline-none"
            : "w-full rounded-md border border-line bg-card py-2 pl-9 pr-3 text-sm"
        }
      />

      {showing.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-md border border-line bg-card text-ink shadow-lg"
        >
          {showing.map((hit, i) => (
            <li key={hit.href} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => {
                  router.push(hit.href);
                  setDismissed(true);
                }}
                className={`flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-sm ${
                  i === active ? "bg-elevated" : ""
                }`}
              >
                <span className="w-10 shrink-0 text-[10px] uppercase tracking-wide text-muted">
                  {KIND_LABEL[hit.kind] ?? hit.kind}
                </span>
                <span className="min-w-0 flex-1 truncate">{hit.label}</span>
                {hit.detail && (
                  <span className="shrink-0 text-xs text-muted">{hit.detail}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
