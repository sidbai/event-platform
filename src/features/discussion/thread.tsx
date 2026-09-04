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
    <section className="mt-10 border-t border-line pt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Discussion {count > 0 && <span className="text-muted">({count})</span>}
        </h2>
        {canModerate && (
          <form action={setThreadLocked.bind(null, ctx, !locked)}>
            <button
              type="submit"
              className="text-xs text-muted hover:text-ink"
            >
              {locked ? "Unlock thread" : "Lock thread"}
            </button>
          </form>
        )}
      </div>

      {locked && <p className="mt-2 text-sm text-muted">This thread is locked.</p>}

      {pinned && !pinned.hiddenAt && (
        <div className="mt-4 rounded-md border border-brand/40 bg-brand-soft p-3 text-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-brand-text">
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
          <p className="mt-3 text-sm text-muted">
            <a href="/signin" className="text-brand-text hover:underline">
              Sign in
            </a>{" "}
            to join the discussion.
          </p>
        ))}

      <div className="mt-6 space-y-5">
        {comments.length === 0 ? (
          <p className="text-sm text-muted">No comments yet.</p>
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
    <div className={isReply ? "border-l border-line pl-4" : ""}>
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
        <span className="text-xs text-muted">{timeAgo(comment.createdAt)}</span>
      </div>
      {hidden ? (
        <p className="mt-1 text-sm italic text-muted">Comment removed.</p>
      ) : (
        <p className="mt-1 whitespace-pre-wrap text-sm text-ink">
          {comment.body}
        </p>
      )}

      {!hidden && (
        <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted">
          {(mine || canModerate) && (
            <form action={hideComment.bind(null, ctx.revalidate, comment.id)}>
              <button type="submit" className="hover:text-red-600">
                Remove
              </button>
            </form>
          )}
          {currentUserId && !mine && (
            <form action={reportComment.bind(null, ctx.revalidate, comment.id)}>
              <button type="submit" className="hover:text-ink">
                Report
              </button>
            </form>
          )}
          {canModerate && !isReply && (
            <form
              action={setPinnedComment.bind(null, ctx, isPinned ? null : comment.id)}
            >
              <button type="submit" className="hover:text-brand-text">
                {isPinned ? "Unpin" : "Pin"}
              </button>
            </form>
          )}
          {canReply && !isReply && (
            <details className="[&_summary]:cursor-pointer">
              <summary className="hover:text-ink">Reply</summary>
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
