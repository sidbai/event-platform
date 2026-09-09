import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import NextAuth, { type NextAuthConfig } from "next-auth";
import type { Adapter, AdapterUser } from "next-auth/adapters";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";

import { db } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";
import { signInEmail } from "@/features/email/messages";
import { emailConfigured, sendEmail } from "@/features/email/send";
import { generateAnonymousUsername } from "@/features/profile/username";

/**
 * How long a sign-in link lasts.
 *
 * Auth.js defaults to a day, which is a day in which anyone holding a
 * forwarded email can sign in as that person. Half an hour is long enough for
 * somebody to find the mail on their phone and short enough that a link left
 * in an inbox is not a standing key.
 */
const SIGN_IN_LINK_MINUTES = 30;

const providers: NextAuthConfig["providers"] = [];

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  );
}

/*
 * A link to an inbox, rather than a password.
 *
 * The gap it closes is not comfort, it is access: today a coach with no
 * Google account cannot sign in at all, which after the claim flow ships
 * means they cannot claim their own team. A password would need a reset
 * flow, which needs email anyway — so email is the thing to have, and once
 * it is here the link is the whole login.
 */
if (emailConfigured()) {
  providers.push(
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.EMAIL_FROM,
      maxAge: SIGN_IN_LINK_MINUTES * 60,
      /*
       * Ours rather than Auth.js's default, which signs the mail as authjs.dev
       * and reads, to somebody who was not expecting it, exactly like a
       * phishing attempt.
       */
      async sendVerificationRequest({ identifier, url }) {
        const out = await sendEmail(identifier, signInEmail(url, SIGN_IN_LINK_MINUTES));
        // Thrown on purpose: Auth.js turns this into an error page, and a
        // person waiting for a link that was never sent has no other way to
        // find out.
        if (!out.sent) throw new Error(out.reason);
      },
    }),
  );
}

if (process.env.AUTH_DEV_LOGIN === "true" && process.env.NODE_ENV !== "production") {
  providers.push(
    Credentials({
      id: "dev",
      name: "Dev login",
      credentials: { email: { label: "Email", type: "email" } },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "")
          .trim()
          .toLowerCase();
        if (!email || !email.includes("@")) return null;

        const existing = await db.query.users.findFirst({
          where: eq(users.email, email),
        });
        if (existing) return existing;

        const username = await generateAnonymousUsername();
        const [created] = await db
          .insert(users)
          .values({
            email,
            name: email.split("@")[0],
            username,
            displayName: username,
          })
          .returning();
        return created;
      },
    }),
  );
}

const baseAdapter = DrizzleAdapter(db, {
  usersTable: users,
  accountsTable: accounts,
  sessionsTable: sessions,
  verificationTokensTable: verificationTokens,
});

const adapter: Adapter = {
  ...baseAdapter,
  /*
   * Anonymous by default.
   *
   * An account exists from the first sign-in, before its owner has decided
   * anything, so the defaults must not publish them. The username used to be
   * the local part of their email address and the display name whatever
   * Google holds — so somebody who signed in to RSVP once had their real name
   * and half their address on the site without ever filling in a field.
   *
   * Both now start as the same generated handle. The provider's name is still
   * kept on the row: it is the account's own record, it is what an admin
   * judges a team claim against, and it is the person's to publish if they
   * want to — settings is one page away.
   */
  async createUser(data) {
    const rest = { ...(data as AdapterUser) };
    delete (rest as { id?: string }).id;
    const username = await generateAnonymousUsername();
    const [user] = await db
      .insert(users)
      .values({ ...rest, username, displayName: username })
      .returning();
    return user as AdapterUser;
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter,
  session: { strategy: "jwt" },
  providers,
  pages: { signIn: "/signin" },
  callbacks: {
    session({ session, token }) {
      if (token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
});

export const googleEnabled = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
);
export const emailSignInEnabled = emailConfigured();
export const devLoginEnabled =
  process.env.AUTH_DEV_LOGIN === "true" && process.env.NODE_ENV !== "production";
