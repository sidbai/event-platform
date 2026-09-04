"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type ProfileMenuItem = { href: string; label: string };

/**
 * The avatar in the header, with everything account-shaped folded behind it.
 *
 * Sign out stays a real form submit passed in as `children`, so it remains a
 * POST rather than becoming a link — a GET that signs you out would fire from
 * any prefetch or crawler.
 */
export function ProfileMenu({
  name,
  avatar,
  items,
  children,
}: {
  name: string;
  avatar: React.ReactNode;
  items: ProfileMenuItem[];
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-full transition-opacity hover:opacity-80"
      >
        {avatar}
        <span className="hidden text-white/75 sm:inline">{name}</span>
        <span aria-hidden className="text-[10px] text-white/60">
          ▾
        </span>
        <span className="sr-only">Account menu</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 min-w-44 overflow-hidden rounded-lg border border-line bg-card py-1 text-ink shadow-lg"
        >
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block px-3 py-2 text-sm hover:bg-elevated"
            >
              {item.label}
            </Link>
          ))}
          {children && (
            <div
              onClick={() => setOpen(false)}
              className="mt-1 border-t border-line pt-1"
            >
              {children}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
