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
 * A link that is really a video, and how to play it.
 *
 * Two hosts we are willing to put in a frame — YouTube and Vimeo, by their
 * video id and nothing else from the URL — and our own Blob store for a
 * file uploaded here. Anything else stays a link: a frame is a page inside
 * the page, and the list of who gets one is short on purpose.
 */
export type Embed =
  | { kind: "youtube"; id: string }
  | { kind: "vimeo"; id: string }
  | { kind: "video"; src: string };

export function embedOf(href: string | undefined): Embed | null {
  if (!href) return null;
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.replace(/^www\.|^m\./, "");
  const yt = /^[A-Za-z0-9_-]{6,20}$/;

  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const id =
      url.pathname === "/watch"
        ? url.searchParams.get("v")
        : url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1];
    return id && yt.test(id) ? { kind: "youtube", id } : null;
  }
  if (host === "youtu.be") {
    const id = url.pathname.slice(1);
    return yt.test(id) ? { kind: "youtube", id } : null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = url.pathname.match(/(\d{6,12})/)?.[1];
    return id ? { kind: "vimeo", id } : null;
  }
  if (isOurBlobUrl(href) && /\.(mp4|webm|mov)$/i.test(url.pathname)) {
    return { kind: "video", src: href };
  }
  return null;
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
