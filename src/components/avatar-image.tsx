"use client";

import Image from "next/image";
import { useState } from "react";

export function AvatarPlaceholder({
  size,
  className = "",
}: {
  size: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-line text-muted ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        style={{ width: size * 0.62, height: size * 0.62 }}
      >
        <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.418 0-8 2.239-8 5v1h16v-1c0-2.761-3.582-5-8-5Z" />
      </svg>
    </span>
  );
}

/**
 * The photo itself, client-side only so it can notice the image failing.
 *
 * A stored URL can outlive the file it points at — a blob deleted by hand, or
 * a save that did not land. Falling back keeps that a missing photo rather
 * than a broken image, and the person can simply upload again.
 */
export function AvatarImage({
  src,
  size,
  className = "",
}: {
  src: string;
  size: number;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  if (broken) return <AvatarPlaceholder size={size} className={className} />;

  return (
    <Image
      src={src}
      alt=""
      width={size}
      height={size}
      onError={() => setBroken(true)}
      className={`shrink-0 rounded-full object-cover ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
