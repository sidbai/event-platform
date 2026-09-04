import Link from "next/link";

import { Avatar } from "@/components/avatar";
import { getCurrentUser } from "@/features/auth";

import { setAttendance } from "./actions";
import { getAttendance, type Attendee } from "./queries";

function Names({ people }: { people: Attendee[] }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
      {people.map((p) => (
        <li key={p.userId} className="flex items-center gap-1.5 text-sm">
          <Avatar src={p.avatarUrl} name={p.name} size={20} />
          {p.username ? (
            <Link href={`/people/${p.username}`} className="hover:underline">
              {p.name}
            </Link>
          ) : (
            <span>{p.name}</span>
          )}
          {p.guests > 0 && (
            <span className="text-muted">+{p.guests}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

export async function AttendanceSection({
  eventId,
  slug,
  capacity,
}: {
  eventId: string;
  slug: string;
  capacity: number | null;
}) {
  const user = await getCurrentUser();
  const { going, maybe, headcount, mine } = await getAttendance(
    eventId,
    user?.id,
  );

  const full = capacity != null && headcount >= capacity;

  const button = (status: "going" | "maybe", label: string) => {
    const active = mine?.status === status;
    return (
      <form action={setAttendance.bind(null, slug, status)}>
        <button
          type="submit"
          className={
            active
              ? "rounded-md bg-brand px-4 py-2 text-sm font-semibold text-on-brand hover:bg-brand-strong"
              : "rounded-md border border-line px-4 py-2 text-sm font-medium hover:bg-elevated"
          }
        >
          {active ? `✓ ${label}` : label}
        </button>
      </form>
    );
  };

  return (
    <section className="mt-10 border-t border-line pt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">
          Who&rsquo;s in{" "}
          <span className="text-muted">
            ({headcount}
            {capacity != null && ` / ${capacity}`})
          </span>
        </h2>
        {full && !mine && (
          <span className="text-sm text-muted">Full — put yourself on maybe.</span>
        )}
      </div>

      {user ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {button("going", "I’m in")}
          {button("maybe", "Maybe")}
          {mine && (
            <span className="text-xs text-muted">
              Tap again to take your name off.
            </span>
          )}
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">
          <Link href={`/signin?next=/events/${slug}`} className="text-brand-text hover:underline">
            Sign in
          </Link>{" "}
          to say you&rsquo;re coming.
        </p>
      )}

      {going.length > 0 && (
        <div className="mt-5">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted">
            Going
          </h3>
          <Names people={going} />
        </div>
      )}

      {maybe.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted">
            Maybe
          </h3>
          <Names people={maybe} />
        </div>
      )}

      {going.length === 0 && maybe.length === 0 && (
        <p className="mt-4 text-sm text-muted">
          Nobody yet. Be the first to say you&rsquo;re in.
        </p>
      )}
    </section>
  );
}
