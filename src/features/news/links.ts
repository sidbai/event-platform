import { isOurBlobUrl } from "@/features/uploads/blob";

/**
 * How a link written in a news body should be rendered.
 *
 * Anyone signed in can write news, so every href here came from someone whose
 * intentions are unknown. The decision is pulled out of the renderer because
 * "is this link internal" is exactly the sort of check that looks obviously
 * right and is quietly wrong — see the protocol-relative case below.
 */
export type LinkKind = "internal" | "external" | "unsafe";

export function linkKind(href: string | undefined): LinkKind {
  if (!href) return "unsafe";

  /*
   * "//evil.example.com" starts with a slash but is NOT a same-site path: the
   * browser reads it as the current scheme plus that host and leaves the site.
   * Treating it as internal would route it through next/link and drop the
   * noopener/nofollow that every other external link gets, which is a way to
   * dress up an off-site link as a local one.
   */
  if (href.startsWith("//")) return "external";
  if (href.startsWith("/")) return "internal";

  // Relative and fragment links stay on the page they were written on.
  if (href.startsWith("#")) return "internal";

  let url: URL;
  try {
    url = new URL(href);
  } catch {
    // Not a URL we can reason about — a bare "example.com", say. Refusing is
    // safer than guessing a scheme on the author's behalf.
    return "unsafe";
  }

  // An allowlist, not a blocklist: javascript: and data: are the ones people
  // think of, but so are vbscript:, blob: and whatever ships next.
  return url.protocol === "https:" ||
    url.protocol === "http:" ||
    url.protocol === "mailto:"
    ? "external"
    : "unsafe";
}

/**
 * Whether an image in a body may be rendered at all.
 *
 * Only our own Blob store. Anything else would be hotlinked: it leaks every
 * reader's IP to a host the author chose, breaks the day that host goes away,
 * and next/image cannot optimise a domain that is not configured anyway.
 */
export function canRenderImage(src: unknown): src is string {
  return typeof src === "string" && isOurBlobUrl(src);
}
