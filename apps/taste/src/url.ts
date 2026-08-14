/**
 * Client-side URL prefilter.
 *
 * This classifier labels URL evidence before it leaves the app: only https
 * URLs to public-looking hosts are marked usable; everything else is carried
 * as data but flagged so nothing downstream fetches it. It is a syntactic
 * prefilter, NOT an SSRF defense: the app makes no network requests, and
 * authoritative protection belongs to the host's fetch tooling, which must
 * revalidate the resolved address after DNS resolution and after every
 * redirect, and enforce response-size, redirect-count, and timeout limits.
 * Nothing here can see DNS, so a public-looking hostname that resolves to a
 * private address (rebinding) can only be caught by the host.
 */

export type UrlVerdict = { usable: true } | { usable: false; reason: string };

/** Lowercase and strip trailing dots — `LOCALHOST.` must classify as localhost. */
export function normalizeHostname(host: string): string {
  return host.toLowerCase().replace(/\.+$/, "");
}

export function classifyUrl(raw: string): UrlVerdict {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { usable: false, reason: "not a parseable URL" };
  }
  if (url.protocol !== "https:") {
    return {
      usable: false,
      reason: `unsupported scheme "${url.protocol}" — only https: is accepted`,
    };
  }
  if (url.username || url.password) {
    return { usable: false, reason: "credential-bearing URL" };
  }
  const host = normalizeHostname(url.hostname);
  if (host.length === 0) {
    return { usable: false, reason: "empty hostname" };
  }
  if (isInternalName(host)) {
    return { usable: false, reason: "localhost or internal-looking hostname" };
  }
  const v4 = parseIpv4(host);
  if (v4 !== null && !isPublicIpv4(v4)) {
    return { usable: false, reason: "non-public IPv4 address" };
  }
  if (host.startsWith("[") || host.includes(":")) {
    const verdict = classifyIpv6(host.replace(/^\[|\]$/g, ""));
    if (verdict) return verdict;
  }
  return { usable: true };
}

// ── Hostnames ──────────────────────────────────────────────────────────────

function isInternalName(host: string): boolean {
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host.endsWith(".home.arpa") || host.endsWith(".in-addr.arpa") || host.endsWith(".ip6.arpa")) return true;
  // A single-label hostname ("intranet", "router") can only resolve via a
  // local search domain — internal by construction.
  if (!host.includes(".") && !host.includes(":") && parseIpv4(host) === null) {
    return true;
  }
  return false;
}

// ── IPv4, including obfuscated forms ───────────────────────────────────────

/**
 * Parse a host as an IPv4 address the way resolvers actually do: up to four
 * dot-separated parts, each decimal, octal (leading 0), or hex (0x), with the
 * last part filling the remaining bytes. This catches `2130706433`,
 * `0x7f.1`, `0177.0.0.1`, and `127.1` — all of which reach loopback.
 * Returns the 32-bit value, or null when the host is not numeric.
 */
export function parseIpv4(host: string): number | null {
  if (host.length === 0 || !/^[0-9a-fA-FxX.]+$/.test(host)) return null;
  const parts = host.split(".");
  if (parts.length > 4 || parts.some((p) => p.length === 0)) return null;

  const values: number[] = [];
  for (const part of parts) {
    let value: number;
    if (/^0[xX][0-9a-fA-F]+$/.test(part)) {
      value = parseInt(part.slice(2), 16);
    } else if (/^0[0-7]*$/.test(part)) {
      value = part === "0" ? 0 : parseInt(part, 8);
    } else if (/^[1-9][0-9]*$/.test(part)) {
      value = parseInt(part, 10);
    } else {
      return null;
    }
    if (!Number.isFinite(value) || value < 0) return null;
    values.push(value);
  }

  // The last part fills the remaining bytes; earlier parts must be one byte.
  const tailBytes = 4 - (values.length - 1);
  const tailMax = 2 ** (8 * tailBytes);
  for (let i = 0; i < values.length - 1; i++) {
    if (values[i] > 255) return null;
  }
  const tail = values[values.length - 1];
  if (tail >= tailMax) return null;

  let result = 0;
  for (let i = 0; i < values.length - 1; i++) {
    result = result * 256 + values[i];
  }
  result = result * 256 ** tailBytes + tail;
  return result >>> 0;
}

function inRange(value: number, cidrBase: number, prefixBits: number): boolean {
  const mask = prefixBits === 0 ? 0 : (~0 << (32 - prefixBits)) >>> 0;
  return ((value & mask) >>> 0) === ((cidrBase & mask) >>> 0);
}

function ip(a: number, b: number, c: number, d: number): number {
  return ((a * 256 + b) * 256 + c) * 256 + d;
}

/** Public = not loopback, private, link-local, unspecified, CGNAT, multicast, reserved, or broadcast. */
export function isPublicIpv4(value: number): boolean {
  const blocked: Array<[number, number]> = [
    [ip(0, 0, 0, 0), 8], // unspecified / "this network"
    [ip(10, 0, 0, 0), 8], // private
    [ip(100, 64, 0, 0), 10], // CGNAT
    [ip(127, 0, 0, 0), 8], // loopback
    [ip(169, 254, 0, 0), 16], // link-local
    [ip(172, 16, 0, 0), 12], // private
    [ip(192, 0, 0, 0), 24], // IETF protocol assignments
    [ip(192, 0, 2, 0), 24], // TEST-NET-1
    [ip(192, 168, 0, 0), 16], // private
    [ip(198, 18, 0, 0), 15], // benchmarking
    [ip(198, 51, 100, 0), 24], // TEST-NET-2
    [ip(203, 0, 113, 0), 24], // TEST-NET-3
    [ip(224, 0, 0, 0), 4], // multicast
    [ip(240, 0, 0, 0), 4], // reserved + broadcast
  ];
  return !blocked.some(([base, bits]) => inRange(value, base, bits));
}

// ── IPv6 ───────────────────────────────────────────────────────────────────

function classifyIpv6(bare: string): UrlVerdict | null {
  const host = bare.toLowerCase();
  if (!host.includes(":")) return null;

  if (host === "::" ) return { usable: false, reason: "unspecified IPv6 address" };
  if (host === "::1") return { usable: false, reason: "IPv6 loopback" };
  if (host.startsWith("fe8") || host.startsWith("fe9") || host.startsWith("fea") || host.startsWith("feb")) {
    return { usable: false, reason: "IPv6 link-local address" };
  }
  if (host.startsWith("fc") || host.startsWith("fd")) {
    return { usable: false, reason: "IPv6 unique-local address" };
  }
  if (host.startsWith("ff")) {
    return { usable: false, reason: "IPv6 multicast address" };
  }

  // IPv4-mapped / IPv4-compatible forms: `::ffff:10.0.0.1`, `::ffff:a00:1`.
  const mapped = host.match(/^::(?:ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) {
    const v4 = parseIpv4(mapped[1]);
    if (v4 === null || !isPublicIpv4(v4)) {
      return { usable: false, reason: "IPv4-mapped IPv6 form of a non-public address" };
    }
    return null;
  }
  // Hex-group IPv4-mapped (`::ffff:7f00:1`) and deprecated IPv4-compatible
  // (`::7f00:1`) forms — the URL parser normalizes dotted tails into these,
  // so this is the shape actually reaching us. Parse the last 32 bits.
  const hexTail = host.match(/^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexTail) {
    const v4 = (parseInt(hexTail[1], 16) * 65536 + parseInt(hexTail[2], 16)) >>> 0;
    if (!isPublicIpv4(v4)) {
      return { usable: false, reason: "IPv4-mapped IPv6 form of a non-public address" };
    }
  }
  return null;
}
