import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";
import { registeredUsers } from "@/features/admin/users";
import { parsePage } from "@/features/pagination/paginate";
import { Pager } from "@/features/pagination/pager";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Registered users" };

const PER_PAGE = 50;

function when(d: Date | null): string {
  return d
    ? d.toLocaleDateString("en-US", {
        timeZone: "America/Los_Angeles",
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) notFound();

  const sp = await searchParams;
  const q = (sp.q ?? "").trim() || null;
  const { rows, pagination } = await registeredUsers(parsePage(sp.page), PER_PAGE, q);

  return (
    <div className="mx-auto max-w-5xl px-5 py-10">
      <Link href="/admin" className="text-sm text-brand-text hover:underline">
        ← Admin
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Registered users</h1>
      <p className="mt-2 text-sm text-muted">
        Everyone with an account, newest first. Email addresses are shown here
        and nowhere else on the site; this page exists so you can see who has
        signed up and what they went on to do, not to contact them from.
      </p>

      <form method="get" className="mt-6 flex flex-wrap items-center gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Name, email, or username"
          className="w-72 rounded-md border border-line bg-surface px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-surface-2"
        >
          Search
        </button>
        {q && (
          <Link href="/admin/users" className="text-sm text-brand-text hover:underline">
            Clear
          </Link>
        )}
      </form>

      <p className="mt-4 text-sm text-muted">
        {pagination.total} user{pagination.total === 1 ? "" : "s"}
        {q ? ` matching “${q}”` : ""}
      </p>

      {rows.length === 0 ? (
        <p className="mt-6 text-muted">Nobody yet.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-3 font-medium">Who</th>
                <th className="py-2 pr-3 font-medium">Email</th>
                <th className="py-2 pr-3 font-medium">Joined</th>
                <th className="py-2 pr-3 font-medium">Sign-in</th>
                <th className="py-2 pr-3 text-right font-medium">Teams</th>
                <th className="py-2 pr-3 text-right font-medium">Events</th>
                <th className="py-2 pr-3 text-right font-medium">Owns</th>
                <th className="py-2 font-medium">Now</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((u) => (
                <tr key={u.id} className="align-top">
                  <td className="py-2 pr-3">
                    <div className="font-medium">
                      {u.displayName || u.name || "—"}
                      {u.admin && (
                        <span className="ml-2 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand-soft-text">
                          admin
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted">
                      {u.username ? `@${u.username}` : "no username"}
                      {u.city ? ` · ${u.city}` : ""}
                    </div>
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {u.email}
                    {!u.emailVerified && (
                      <span className="ml-1 text-xs text-muted">(unverified)</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">{when(u.createdAt)}</td>
                  <td className="py-2 pr-3 whitespace-nowrap text-muted">
                    {u.providers ?? "email link"}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{u.teamsFollowed}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{u.eventsFollowed}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{u.teamsOwned}</td>
                  <td className="py-2 whitespace-nowrap text-xs text-muted">
                    {u.signedIn ? "signed in" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pager basePath="/admin/users" params={sp} pagination={pagination} noun="users" />
    </div>
  );
}
