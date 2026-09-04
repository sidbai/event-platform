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
  const initial = (name ?? "?").trim().charAt(0).toUpperCase() || "?";

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

  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-emerald-100 font-medium text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 ${className}`}
    >
      {initial}
    </span>
  );
}

/** Resolve the best avatar URL for a user-like object. */
export function avatarOf(u: { avatarUrl?: string | null; image?: string | null }) {
  return u.avatarUrl || u.image || null;
}
