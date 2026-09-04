import { redirect } from "next/navigation";

import { devLoginEnabled, googleEnabled, signIn } from "@/auth";
import { getCurrentUser } from "@/features/auth";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const redirectTo = next && next.startsWith("/") ? next : "/";

  const user = await getCurrentUser();
  if (user) redirect(redirectTo);

  return (
    <div className="mx-auto max-w-sm px-5 py-16">
      <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-1 text-sm text-muted">
        You only need an account to post, RSVP, or manage a team. Browsing is open.
      </p>

      <div className="mt-6 space-y-4">
        {googleEnabled && (
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo });
            }}
          >
            <button
              type="submit"
              className="w-full rounded-md border border-line px-4 py-2 text-sm font-medium hover:bg-elevated"
            >
              Continue with Google
            </button>
          </form>
        )}

        {devLoginEnabled && (
          <form
            action={async (formData: FormData) => {
              "use server";
              await signIn("dev", {
                email: String(formData.get("email") ?? ""),
                redirectTo,
              });
            }}
            className="space-y-2"
          >
            {googleEnabled && (
              <div className="text-center text-xs uppercase tracking-wide text-muted">
                or dev login
              </div>
            )}
            <input
              type="email"
              name="email"
              required
              placeholder="you@example.com"
              className="w-full rounded-md border border-line px-3 py-2 text-sm bg-card"
            />
            <button
              type="submit"
              className="w-full rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-strong"
            >
              Sign in
            </button>
            <p className="text-xs text-muted">
              Dev only — any email signs you in without a password.
            </p>
          </form>
        )}

        {!googleEnabled && !devLoginEnabled && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            No sign-in method is configured. Set <code>AUTH_GOOGLE_ID</code> /{" "}
            <code>AUTH_GOOGLE_SECRET</code>, or <code>AUTH_DEV_LOGIN=true</code> for local dev.
          </p>
        )}
      </div>
    </div>
  );
}
