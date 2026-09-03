import { getCurrentUser } from "@/features/auth";
import type { discussionSubject } from "@/db/schema";

import { hideComment, postComment } from "./actions";
import { CommentForm } from "./comment-form";
import { getThread, type ThreadComment } from "./queries";

type SubjectType = (typeof discussionSubject.enumValues)[number];

function timeAgo(date: Date) {
  const s = Math.round((Date.now() - date.getTime()) / 1000);
  const units: [number, Intl.RelativeTimeFormatUnit][] = [
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
  for (const [size, u] of units) {
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

export async function DiscussionThread({
  subjectType,
  subjectId,
  revalidate,
}: {
  subjectType: SubjectType;
  subjectId: string;
  revalidate: string;
}) {
  const [{ comments, count, discussion }, user] = await Promise.all([
    getThread(subjectType, subjectId),
    getCurrentUser(),
  ]);

  const ctx = { subjectType, subjectId, revalidate };
  const locked = discussion?.locked ?? false;

  return (
    <section className="mt-10 border-t border-neutral-200 pt-6 dark:border-neutral-800">
      <h2 className="text-lg font-semibold">
        Discussion {count > 0 && <span className="text-neutral-400">({count})</span>}
      </h2>

      {locked && (
        <p className="mt-2 text-sm text-neutral-500">This thread is locked.</p>
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
  ctx,
  isReply = false,
}: {
  comment: ThreadComment;
  currentUserId: string | null;
  canReply: boolean;
  ctx: { subjectType: SubjectType; subjectId: string; revalidate: string };
  isReply?: boolean;
}) {
  const hidden = Boolean(comment.hiddenAt);
  const mine = comment.authorId === currentUserId;

  return (
    <div className={isReply ? "border-l border-neutral-200 pl-4 dark:border-neutral-800" : ""}>
      <div className="text-sm">
        <span className="font-medium">{comment.authorName ?? "Someone"}</span>
        <span className="ml-2 text-xs text-neutral-400">{timeAgo(comment.createdAt)}</span>
      </div>
      {hidden ? (
        <p className="mt-1 text-sm italic text-neutral-400">Comment removed.</p>
      ) : (
        <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-700 dark:text-neutral-200">
          {comment.body}
        </p>
      )}

      <div className="mt-1 flex gap-3 text-xs text-neutral-400">
        {mine && !hidden && (
          <form action={hideComment.bind(null, ctx.revalidate, comment.id)}>
            <button type="submit" className="hover:text-red-600 dark:hover:text-red-400">
              Remove
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

      {comment.replies.length > 0 && (
        <div className="mt-4 space-y-4">
          {comment.replies.map((r) => (
            <CommentItem
              key={r.id}
              comment={r}
              currentUserId={currentUserId}
              canReply={canReply}
              ctx={ctx}
              isReply
            />
          ))}
        </div>
      )}
    </div>
  );
}
