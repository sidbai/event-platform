import Image from "next/image";

import { kindEmoji } from "@/features/events/tags";

/**
 * An event's square mark, or the emoji for what kind of thing it is.
 *
 * Most events have no logo and never will — a listing is somebody else's
 * event, and their mark is theirs to hand over. So the fallback has to be
 * something rather than a grey square: the same emoji the event's own tag
 * shows, which makes a list of mostly-logoless events read as deliberate
 * instead of broken.
 */
export function EventLogo({
  src,
  kind,
  size = 44,
  className = "",
}: {
  src?: string | null;
  kind: string;
  size?: number;
  className?: string;
}) {
  if (!src) {
    return (
      <span
        aria-hidden
        style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }}
        className={`inline-flex shrink-0 items-center justify-center rounded-lg bg-elevated ${className}`}
      >
        {kindEmoji(kind)}
      </span>
    );
  }
  return (
    <Image
      src={src}
      alt=""
      width={size}
      height={size}
      className={`shrink-0 rounded-lg bg-card object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
