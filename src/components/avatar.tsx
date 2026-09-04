import Image from "next/image";

export function Avatar({
  src,
  name,
  size = 32,
  className = "",
}: {
  src?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
}) {
  void name;

  if (src) {
    return (
      <Image
        src={src}
        alt=""
        width={size}
        height={size}
        className={`shrink-0 rounded-full object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  // Neutral placeholder — no photo by default.
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-neutral-200 text-neutral-400 dark:bg-neutral-700 dark:text-neutral-500 ${className}`}
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

/** The avatar URL to display — a custom upload only, never the Google photo. */
export function avatarOf(u: { avatarUrl?: string | null }) {
  return u.avatarUrl || null;
}
