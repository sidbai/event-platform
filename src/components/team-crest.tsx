import Image from "next/image";

export function TeamCrest({
  src,
  size = 20,
  className = "",
}: {
  src?: string | null;
  size?: number;
  className?: string;
}) {
  if (!src) {
    return (
      <span
        aria-hidden
        style={{ width: size, height: size }}
        className={`inline-block shrink-0 rounded bg-neutral-200 dark:bg-neutral-700 ${className}`}
      />
    );
  }
  return (
    <Image
      src={src}
      alt=""
      width={size}
      height={size}
      className={`shrink-0 rounded object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
