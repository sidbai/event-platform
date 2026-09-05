import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

import { getCurrentUser } from "@/features/auth";
import {
  categoryEmoji,
  categoryLabel,
  NEWS_CATEGORIES,
  parseCategory,
  readingMinutes,
} from "@/features/news/constants";
import { listNews, myNewsSubmissions } from "@/features/news/queries";
import { Pager } from "@/features/pagination/pager";
import { paginate, parsePage, PER_PAGE } from "@/features/pagination/paginate";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "News",
  description:
    "Recaps, guides and announcements from Seattle-area youth soccer.",
};

function fmt(d: Date | null) {
  if (!d) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

function Meta({
  post,
}: {
  post: { authorName: string; publishedAt: Date | null; body: string; comments: number };
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
      <span>{post.authorName}</span>
      <span aria-hidden>·</span>
      <span>{fmt(post.publishedAt)}</span>
      <span aria-hidden>·</span>
      <span>{readingMinutes(post.body)} min read</span>
      {post.comments > 0 && (
        <>
          <span aria-hidden>·</span>
          <span>
            {post.comments} comment{post.comments === 1 ? "" : "s"}
          </span>
        </>
      )}
    </div>
  );
}

export default async function NewsPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const active = parseCategory(sp.c);
  const [first, user] = await Promise.all([
    listNews(active ?? undefined, { limit: PER_PAGE, offset: 0 }),
    getCurrentUser(),
  ]);
  const pagination = paginate(first.total, parsePage(sp.page));
  const { rows: posts } =
    pagination.offset === 0
      ? first
      : await listNews(active ?? undefined, {
          limit: PER_PAGE,
          offset: pagination.offset,
        });
  const mine = user ? await myNewsSubmissions(user.id) : [];

  // The newest post leads; the rest run underneath as rows.
  const [lead, ...rest] = posts;

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">News</h1>
          <p className="mt-1 text-sm text-muted">
            Recaps, guides and announcements from around Seattle youth soccer.
          </p>
        </div>
        {user && (
          <Link
            href="/news/new"
            className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-on-brand hover:bg-brand-strong"
          >
            Write a post
          </Link>
        )}
      </div>

      {mine.length > 0 && (
        <section className="mt-5 rounded-lg border border-line bg-elevated px-4 py-3">
          <h2 className="text-sm font-semibold">Your posts</h2>
          <ul className="mt-2 space-y-1.5 text-sm">
            {mine.map((p) => (
              <li key={p.slug} className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/news/${p.slug}`}
                  className="min-w-0 truncate hover:underline"
                >
                  {p.title}
                </Link>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                    p.status === "pending"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-line text-muted"
                  }`}
                >
                  {p.status === "pending" ? "In review" : "Draft"}
                </span>
                {p.reviewNote && (
                  <span className="min-w-0 truncate text-xs text-muted">
                    Sent back: {p.reviewNote}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <nav className="mt-5 flex flex-wrap gap-1.5 text-sm">
        <Link
          href="/news"
          className={`rounded-full px-2.5 py-1 ${
            !active ? "bg-ink text-page" : "bg-elevated text-muted hover:bg-line"
          }`}
        >
          All
        </Link>
        {NEWS_CATEGORIES.map((cat) => (
          <Link
            key={cat.key}
            href={`/news?c=${cat.key}`}
            className={`rounded-full px-2.5 py-1 ${
              active === cat.key
                ? "bg-ink text-page"
                : "bg-elevated text-muted hover:bg-line"
            }`}
          >
            <span aria-hidden>{cat.emoji}</span> {cat.label}
          </Link>
        ))}
      </nav>

      {posts.length === 0 ? (
        <p className="mt-10 text-muted">
          Nothing here yet.
          {user && (
            <>
              {" "}
              <Link href="/news/new" className="text-brand-text hover:underline">
                Write the first post
              </Link>
              .
            </>
          )}
        </p>
      ) : (
        <>
          <Link
            href={`/news/${lead.slug}`}
            className="mt-6 block overflow-hidden rounded-xl border border-line bg-card transition-shadow hover:shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
          >
            {lead.coverUrl && (
              <div className="relative aspect-[16/8] w-full bg-elevated">
                <Image
                  src={lead.coverUrl}
                  alt=""
                  fill
                  sizes="(max-width: 768px) 100vw, 768px"
                  className="object-cover"
                  priority
                />
              </div>
            )}
            <div className="p-5">
              <span className="text-xs font-medium text-brand-text">
                <span aria-hidden>{categoryEmoji(lead.category)}</span>{" "}
                {categoryLabel(lead.category)}
              </span>
              <h2 className="mt-1 text-xl font-semibold leading-snug">
                {lead.title}
              </h2>
              <p className="mt-1.5 text-sm text-muted">{lead.summary}</p>
              <div className="mt-3">
                <Meta post={lead} />
              </div>
            </div>
          </Link>

          {rest.length > 0 && (
            <ul className="mt-6 divide-y divide-line">
              {rest.map((post) => (
                <li key={post.id}>
                  <Link
                    href={`/news/${post.slug}`}
                    className="flex gap-4 py-4 transition-colors hover:bg-elevated"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-medium text-brand-text">
                        <span aria-hidden>{categoryEmoji(post.category)}</span>{" "}
                        {categoryLabel(post.category)}
                      </span>
                      <h3 className="mt-0.5 font-medium leading-snug">
                        {post.title}
                      </h3>
                      <p className="mt-1 line-clamp-2 text-sm text-muted">
                        {post.summary}
                      </p>
                      <div className="mt-2">
                        <Meta post={post} />
                      </div>
                    </div>
                    {post.coverUrl && (
                      <div className="relative hidden h-24 w-32 shrink-0 overflow-hidden rounded-lg bg-elevated sm:block">
                        <Image
                          src={post.coverUrl}
                          alt=""
                          fill
                          sizes="128px"
                          className="object-cover"
                        />
                      </div>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <Pager
        basePath="/news"
        params={{ c: active ?? undefined }}
        pagination={pagination}
        noun="posts"
      />
    </div>
  );
}
