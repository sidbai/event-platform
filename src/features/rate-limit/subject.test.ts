import { describe, expect, it } from "vitest";

import { clientIp, ipSubject, normalizeIp } from "./subject";

const headers = (h: Record<string, string>) => ({
  get: (name: string) => h[name.toLowerCase()] ?? null,
});

const SECRET = "test-pepper";

describe("clientIp", () => {
  it("prefers x-real-ip, the value the platform set itself", () => {
    expect(
      clientIp(headers({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "9.9.9.9" })),
    ).toBe("203.0.113.7");
  });

  it("falls back to the first x-forwarded-for entry", () => {
    expect(clientIp(headers({ "x-forwarded-for": "203.0.113.7, 70.41.3.18" }))).toBe(
      "203.0.113.7",
    );
  });

  it("has no address when the platform reported none", () => {
    expect(clientIp(headers({}))).toBeNull();
    expect(clientIp(headers({ "x-forwarded-for": "" }))).toBeNull();
  });
});

describe("normalizeIp", () => {
  it("keeps an IPv4 address whole", () => {
    expect(normalizeIp("203.0.113.7")).toBe("203.0.113.7");
  });

  it("collapses IPv6 to the /64 the connection was allocated", () => {
    // The point: one home can rotate through every address in its /64, so
    // limiting the full address would limit nothing at all.
    const a = normalizeIp("2001:db8:1234:5678:aaaa:bbbb:cccc:dddd");
    const b = normalizeIp("2001:db8:1234:5678:1111:2222:3333:4444");
    expect(a).toBe("2001:0db8:1234:5678::/64");
    expect(a).toBe(b);
  });

  it("treats a different /64 as a different subject", () => {
    expect(normalizeIp("2001:db8:1234:5678::1")).not.toBe(
      normalizeIp("2001:db8:1234:9999::1"),
    );
  });

  it("expands the compressed form the same way however it is written", () => {
    expect(normalizeIp("2001:db8::1")).toBe(normalizeIp("2001:0db8:0:0:0:0:0:1"));
  });

  it("ignores the port, which carries no identity", () => {
    expect(normalizeIp("203.0.113.7:56789")).toBe("203.0.113.7");
    expect(normalizeIp("[2001:db8::1]:443")).toBe("2001:0db8:0000:0000::/64");
  });

  it("refuses anything it cannot parse rather than inventing a subject", () => {
    expect(normalizeIp("not-an-ip")).toBeNull();
    expect(normalizeIp("")).toBeNull();
    expect(normalizeIp("2001:db8::1::2")).toBeNull();
  });
});

describe("ipSubject", () => {
  it("never contains the address it was made from", () => {
    const subject = ipSubject("203.0.113.7", SECRET)!;
    expect(subject).not.toContain("203.0.113.7");
    expect(subject.startsWith("ip:")).toBe(true);
  });

  it("is stable for the same address", () => {
    expect(ipSubject("203.0.113.7", SECRET)).toBe(ipSubject("203.0.113.7", SECRET));
  });

  it("differs between addresses", () => {
    expect(ipSubject("203.0.113.7", SECRET)).not.toBe(
      ipSubject("203.0.113.8", SECRET),
    );
  });

  it("depends on the secret, so the hash is not enumerable", () => {
    // Without a secret the whole IPv4 space could be hashed in minutes and the
    // table would be a list of addresses in all but name.
    expect(ipSubject("203.0.113.7", SECRET)).not.toBe(
      ipSubject("203.0.113.7", "another-pepper"),
    );
  });

  it("is prefixed so it cannot collide with a user id", () => {
    expect(ipSubject("203.0.113.7", SECRET)!.startsWith("ip:")).toBe(true);
  });

  it("has no subject without an address or without a secret", () => {
    expect(ipSubject(null, SECRET)).toBeNull();
    expect(ipSubject("203.0.113.7", "")).toBeNull();
    expect(ipSubject("garbage", SECRET)).toBeNull();
  });
});
