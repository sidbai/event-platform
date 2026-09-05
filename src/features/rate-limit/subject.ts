import { createHash } from "node:crypto";

/**
 * Who an allowance applies to, when there is no account to key it on.
 *
 * Anonymous reviews mean the rate limiter can no longer say "this user" — the
 * only thing left is the connection. That is a much weaker signal and this
 * module tries to be honest about how weak: a phone on cellular and a laptop
 * on wifi are two different subjects, a VPN is a third, and thousands of
 * mobile users behind one carrier NAT are all the SAME subject. It stops
 * scripts and accidents, not a determined person.
 */

/** IPv6 is allocated to homes in /64 blocks, so the block is the subject. */
const IPV6_PREFIX_GROUPS = 4;

/**
 * The client address, as reported by the platform.
 *
 * x-real-ip is preferred because Vercel sets it to a single value it
 * determined itself. x-forwarded-for is a list a client can prepend to, and is
 * only trustworthy here because Vercel rewrites it at the edge — on a host
 * that simply passes it through, everything in this module would be
 * attacker-controlled and worthless.
 */
export function clientIp(headers: {
  get(name: string): string | null;
}): string | null {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;

  const forwarded = headers.get("x-forwarded-for");
  if (!forwarded) return null;
  const first = forwarded.split(",")[0]?.trim();
  return first ? first : null;
}

/**
 * Collapse an address to the unit worth limiting.
 *
 * A single home connection can rotate freely through billions of IPv6
 * addresses, so limiting the full address would be limiting nothing.
 */
export function normalizeIp(ip: string): string | null {
  const trimmed = ip.trim().toLowerCase();
  if (!trimmed) return null;

  /*
   * "[2001:db8::1]:443" and "1.2.3.4:56789" — ports carry no identity.
   *
   * A port is only stripped from a bracketed address or an IPv4 one. A bare
   * IPv6 address is all colons and hex, so stripping a trailing ":digits"
   * from it eats the last group instead: 2001:db8::1 became 2001:db8:: and
   * every address ending in a numeric group silently failed to parse, which
   * would have exempted those clients from the limit entirely.
   */
  const bracketed = trimmed.match(/^\[([0-9a-f:]+)\](?::\d+)?$/);
  const looksIpv6 = (trimmed.match(/:/g)?.length ?? 0) > 1;
  const bare = bracketed
    ? bracketed[1]
    : looksIpv6
      ? trimmed
      : trimmed.replace(/:\d+$/, "");

  if (!bare.includes(":")) {
    return /^\d{1,3}(\.\d{1,3}){3}$/.test(bare) ? bare : null;
  }

  const expanded = expandIpv6(bare);
  if (!expanded) return null;
  return `${expanded.slice(0, IPV6_PREFIX_GROUPS).join(":")}::/64`;
}

function expandIpv6(ip: string): string[] | null {
  const halves = ip.split("::");
  if (halves.length > 2) return null;

  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  if (halves.length === 1) {
    return head.length === 8 && head.every(isGroup) ? head.map(pad) : null;
  }

  const missing = 8 - head.length - tail.length;
  if (missing < 0) return null;
  const groups = [...head, ...Array(missing).fill("0"), ...tail];
  return groups.every(isGroup) ? groups.map(pad) : null;
}

const isGroup = (g: string) => /^[0-9a-f]{1,4}$/.test(g);
const pad = (g: string) => g.padStart(4, "0");

/**
 * The value stored against the allowance.
 *
 * Hashed with a server-side secret, never the address itself. An IP is
 * personal data, this table is not what it should live in, and a bare hash
 * would be trivially reversible — the whole space is small enough to
 * enumerate. The secret is what makes it one-way in practice.
 */
export function ipSubject(ip: string | null, secret: string): string | null {
  if (!ip || !secret) return null;
  const normalized = normalizeIp(ip);
  if (!normalized) return null;
  const digest = createHash("sha256")
    .update(`${secret}:${normalized}`)
    .digest("hex");
  // Prefixed so it can never collide with a user id in the same column.
  return `ip:${digest.slice(0, 32)}`;
}
