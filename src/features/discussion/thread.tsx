import Link from "next/link";

import { Avatar } from "@/components/avatar";
import type { discussionSubject } from "@/db/schema";
import { getCurrentUser } from "@/features/auth";

import {
  hideComment,
  postComment,
  reportComment,
  setPinnedComment,
  setThreadLocked,
} from "./actions";
import { CommentForm } from "./comment-form";
import { getThread, type ThreadComment } from "./queries";

type SubjectType = (typeof discussionSubject.enumValues)[number];
type Ctx = { subjectType: SubjectType; subjectId: string; revalidate: string };

function timeAgo(date: Date) {
  const s = Math.round((Date.now() - date.getTime()) / 1000);
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.34, "week"],
    [12, "month"],
    [Number.POSITIVE_INFINITY, "year"],
  ];
  let value = s;
  let unit: Intl.RelativeTimeFormatUnit = "second";
  for (const [size, u] of steps) {
    if (Math.abs(value) < size) {
      unit = u;
      break;
    }
    value /= size;
  }
  return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(
    -Math.round(value),
    unit,
  );
}

function findComment(nodes: ThreadComment[], id: string): ThreadComment | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const inReplies = findComment(n.replies, id);
    if (inReplies) return inReplies;
  }
  return null;
}

export async function DiscussionThread({
  subjectType,
  subjectId,
  revalidate,
  canModerate = false,
}: {
  subjectType: SubjectType;
  subjectId: string;
  revalidate: string;
  canModerate?: boolean;
}) {
  const [{ comments, count, discussion, pinnedId }, user] = await Promise.all([
    getThread(subjectType, subjectId),
    getCurrentUser(),
  ]);

  const ctx: Ctx = { subjectType, subjectId, revalidate };
  const locked = discussion?.locked ?? false;
  const pinned = pinnedId ? findComment(comments, pinnedId) : null;

  return (
    <section className="mt-10 border-t border-neutral-200 pt-6 dark:border-neutral-800">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Discussion {count > 0 && <span className="text-neutral-400">({count})</span>}
        </h2>
        {canModerate && (
          <form action={setThreadLocked.bind(null, ctx, !locked)}>
            <button
              type="submit"
              className="text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
            >
              {locked ? "Unlock thread" : "Lock thread"}
            </button>
          </form>
        )}
      </div>

      {locked && <p className="mt-2 text-sm text-neutral-500">This thread is locked.</p>}

      {pinned && !pinned.hiddenAt && (
        <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/40">
          <div className="text-xs font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            📌 Pinned · {pinned.authorName ?? "Someone"}
          </div>
          <p className="mt-1 whitespace-pre-wrap">{pinned.body}</p>
        </div>
      )}

      {!locked &&
        (user ? (
          <div className="mt-4">
            <CommentForm action={postComment.bind(null, ctx)} />
          </div>
        ) : (
          <p className="mt-3 text-sm text-neutral-500">
            <a href="/signin" className="text-emerald-700 hover:underline dark:text-emerald-400">
              Sign in
            </a>{" "}
            to join the discussion.
          </p>
        ))}

      <div className="mt-6 space-y-5">
        {comments.length === 0 ? (
          <p className="text-sm text-neutral-500">No comments yet.</p>
        ) : (
          comments.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              currentUserId={user?.id ?? null}
              canReply={!locked && Boolean(user)}
              canModerate={canModerate}
              isPinned={c.id === pinnedId}
              ctx={ctx}
            />
          ))
        )}
      </div>
    </section>
  );
}

function CommentItem({
  comment,
  currentUserId,
  canReply,
  canModerate,
  isPinned,
  ctx,
  isReply = false,
}: {
  comment: ThreadComment;
  currentUserId: string | null;
  canReply: boolean;
  canModerate: boolean;
  isPinned?: boolean;
  ctx: Ctx;
  isReply?: boolean;
}) {
  const hidden = Boolean(comment.hiddenAt);
  const mine = comment.authorId === currentUserId;

  return (
    <div className={isReply ? "border-l border-neutral-200 pl-4 dark:border-neutral-800" : ""}>
      <div className="flex items-center gap-2 text-sm">
        <Avatar src={comment.authorImage} name={comment.authorName} size={20} />
        {comment.authorUsername ? (
          <Link
            href={`/people/${comment.authorUsername}`}
            className="font-medium hover:underline"
          >
            {comment.authorName}
          </Link>
        ) : (
          <span className="font-medium">{comment.authorName}</span>
        )}
        <span className="text-xs text-neutral-400">{timeAgo(comment.createdAt)}</span>
      </div>
      {hidden ? (
        <p className="mt-1 text-sm italic text-neutral-400">Comment removed.</p>
      ) : (
        <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-700 dark:text-neutral-200">
          {comment.body}
        </p>
      )}

      {!hidden && (
        <div className="mt-1 flex flex-wrap gap-3 text-xs text-neutral-400">
          {(mine || canModerate) && (
            <form action={hideComment.bind(null, ctx.revalidate, comment.id)}>
              <button type="submit" className="hover:text-red-600 dark:hover:text-red-400">
                Remove
              </button>
            </form>
          )}
          {currentUserId && !mine && (
            <form action={reportComment.bind(null, ctx.revalidate, comment.id)}>
              <button type="submit" className="hover:text-neutral-600 dark:hover:text-neutral-300">
                Report
              </button>
            </form>
          )}
          {canModerate && !isReply && (
            <form
              action={setPinnedComment.bind(null, ctx, isPinned ? null : comment.id)}
            >
              <button type="submit" className="hover:text-emerald-700 dark:hover:text-emerald-400">
                {isPinned ? "Unpin" : "Pin"}
              </button>
            </form>
          )}
          {canReply && !isReply && (
            <details className="[&_summary]:cursor-pointer">
              <summary className="hover:text-neutral-600 dark:hover:text-neutral-300">Reply</summary>
              <div className="mt-2">
                <CommentForm
                  action={postComment.bind(null, ctx)}
                  parentId={comment.id}
                  compact
                  placeholder="Write a reply…"
                />
              </div>
            </details>
          )}
        </div>
      )}

      {comment.replies.length > 0 && (
        <div className="mt-4 space-y-4">
          {comment.replies.map((r) => (
            <CommentItem
              key={r.id}
              comment={r}
              currentUserId={currentUserId}
              canReply={canReply}
              canModerate={canModerate}
              ctx={ctx}
              isReply
            />
          ))}
        </div>
      )}
    </div>
  );
}
