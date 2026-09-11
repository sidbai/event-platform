"use server";

import { randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/features/auth";

/**
 * The secret in a personal calendar's address.
 *
 * A calendar reader fetches on its own schedule with nothing to sign in with,
 * so the URL is the whole of the authentication. 32 bytes from the system's
 * random source: this has to be unguessable in the way a password is, because
 * it is one.
 */
function mint(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Made when somebody asks for their link, and not before.
 *
 * Most people will never subscribe, and a secret that exists for everybody is
 * a secret nobody chose to have. Asking is a button rather than a page load,
 * so nothing is written by looking.
 */
export async function myFeedToken(): Promise<string | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const row = await db.query.users.findFirst({
    where: eq(users.id, user.id),
    columns: { feedToken: true },
  });
  if (row?.feedToken) return row.feedToken;

  const token = mint();
  await db.update(users).set({ feedToken: token }).where(eq(users.id, user.id));
  revalidatePath("/me");
  return token;
}

/**
 * A new address, and the old one stops working immediately.
 *
 * For a link shared by accident — in a group chat, in a screenshot. There is
 * no way to un-send it, so the only remedy is to make it worthless, and it
 * has to be one press away from the place the link is shown.
 */
export async function rotateFeedToken(): Promise<string | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const token = mint();
  await db.update(users).set({ feedToken: token }).where(eq(users.id, user.id));
  revalidatePath("/me");
  return token;
}
