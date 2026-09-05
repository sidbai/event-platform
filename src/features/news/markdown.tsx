import Image from "next/image";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

import { canRenderImage, linkKind } from "./links";

/**
 * A news article's body, written in Markdown.
 *
 * Raw HTML is deliberately NOT enabled (no rehype-raw). Anyone signed in can
 * write news here, so a body is untrusted input; without that plugin any HTML
 * in it is printed as text rather than parsed, which removes the whole class
 * of injection this would otherwise invite. react-markdown also drops
 * javascript: and data: URLs from links and images by default, and both of
 * those defaults are load-bearing — do not turn either off to make some
 * formatting work.
 *
 * remark-breaks is on because these posts are written in a plain textarea, by
 * people who are not thinking in Markdown. A single Enter means a line break
 * to them, and the posts written before this existed were plain text where
 * every newline was real. Without it those all reflow into one paragraph.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="text-[15px] leading-relaxed text-ink">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          p: ({ children }) => <p className="my-4 first:mt-0">{children}</p>,
          h1: ({ children }) => (
            <h2 className="mt-8 text-xl font-semibold tracking-tight">{children}</h2>
          ),
          h2: ({ children }) => (
            <h2 className="mt-8 text-lg font-semibold tracking-tight">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-6 font-semibold">{children}</h3>
          ),
          ul: ({ children }) => (
            <ul className="my-4 list-disc space-y-1 pl-5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-4 list-decimal space-y-1 pl-5">{children}</ol>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-4 border-l-2 border-line pl-4 text-muted">
              {children}
            </blockquote>
          ),
          code: ({ children }) => (
            <code className="rounded bg-elevated px-1 py-0.5 text-[13px]">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="my-4 overflow-x-auto rounded-lg bg-elevated p-3 text-[13px]">
              {children}
            </pre>
          ),
          hr: () => <hr className="my-8 border-line" />,
          table: ({ children }) => (
            // Wide tables scroll in their own box rather than widening the page.
            <div className="my-4 overflow-x-auto">
              <table className="w-full text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b border-line px-2 py-1.5 text-left font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-line px-2 py-1.5 align-top">{children}</td>
          ),
          a: ({ href, children }) => <Anchor href={href}>{children}</Anchor>,
          img: ({ src, alt }) => <BodyImage src={src} alt={alt} />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Internal links route client-side; external ones open in a new tab and carry
 * rel="nofollow", because a link in user-written copy is not an endorsement
 * this site wants to pass PageRank on. Anything unsafe loses its href and
 * stays as plain text — the words are still readable, they just do nothing.
 *
 * Which is which is decided in ./links, with tests.
 */
function Anchor({ href, children }: { href?: string; children: React.ReactNode }) {
  const link = "text-brand-text underline underline-offset-2 hover:no-underline";
  const kind = linkKind(href);

  if (kind === "unsafe" || !href) return <span>{children}</span>;
  if (kind === "internal") {
    return (
      <Link href={href} className={link}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} className={link} target="_blank" rel="noopener noreferrer nofollow">
      {children}
    </a>
  );
}

/**
 * Images in the body.
 *
 * Only our own Blob store goes through next/image — it is the one host
 * configured for optimisation, and an arbitrary remote URL would fail the
 * loader at request time rather than at write time. Anything else is refused
 * outright rather than hotlinked: it would leak every reader's IP to a host
 * the author picked, and break the day that host goes away.
 */
function BodyImage({ src, alt }: { src?: string | Blob; alt?: string }) {
  if (!canRenderImage(src)) {
    return (
      <span className="my-4 block rounded-lg border border-line bg-elevated p-3 text-sm text-muted">
        {alt ? `Image: ${alt}` : "Image"} — upload it here rather than linking
        to another site.
      </span>
    );
  }
  return (
    <span className="my-4 block overflow-hidden rounded-xl border border-line">
      <Image
        src={src}
        alt={alt ?? ""}
        width={1600}
        height={900}
        sizes="(max-width: 768px) 100vw, 768px"
        // Height follows the file's own shape; the numbers above only reserve
        // space, so this never squashes a portrait photo into a landscape box.
        className="h-auto max-h-[80vh] w-full object-contain"
        style={{ height: "auto" }}
      />
    </span>
  );
}
