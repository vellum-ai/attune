/**
 * URL prefilter edge cases, including the previously missed forms:
 * trailing-dot hosts, obfuscated IPv4, and IPv4-mapped IPv6.
 *
 * The classifier is a syntactic prefilter; authoritative SSRF enforcement
 * (post-DNS, post-redirect) is the host's. These tests pin what the
 * prefilter CAN see.
 */

import { describe, expect, test } from "bun:test";

import { classifyUrl, isPublicIpv4, normalizeHostname, parseIpv4 } from "../apps/taste/src/url";

function usable(url: string): boolean {
  return classifyUrl(url).usable;
}

describe("schemes and credentials", () => {
  test("https to a public host is usable", () => {
    expect(usable("https://example.com/essay")).toBe(true);
    expect(usable("https://sub.domain.example.org/path?q=1")).toBe(true);
  });

  test("non-https schemes are unusable", () => {
    for (const url of [
      "http://example.com/",
      "file:///etc/passwd",
      "javascript:alert(1)",
      "ftp://example.com/x",
      "data:text/html,hello",
      "gopher://example.com/",
    ]) {
      expect(usable(url)).toBe(false);
    }
  });

  test("credential-bearing URLs are unusable", () => {
    expect(usable("https://user:pass@example.com/")).toBe(false);
    expect(usable("https://token@example.com/")).toBe(false);
  });

  test("unparseable input is unusable, not a crash", () => {
    expect(usable("not a url")).toBe(false);
    expect(usable("https://")).toBe(false);
  });
});

describe("hostname normalization", () => {
  test("lowercases and strips trailing dots", () => {
    expect(normalizeHostname("LOCALHOST.")).toBe("localhost");
    expect(normalizeHostname("Example.COM..")).toBe("example.com");
  });

  test("trailing-dot localhost and internal suffixes are unusable", () => {
    expect(usable("https://localhost./x")).toBe(false);
    expect(usable("https://LOCALHOST/x")).toBe(false);
    expect(usable("https://foo.localhost/x")).toBe(false);
    expect(usable("https://printer.local/x")).toBe(false);
    expect(usable("https://db.internal./x")).toBe(false);
    expect(usable("https://svc.home.arpa/x")).toBe(false);
  });

  test("single-label hostnames look internal and are unusable", () => {
    expect(usable("https://intranet/x")).toBe(false);
    expect(usable("https://router/")).toBe(false);
  });
});

describe("IPv4, including obfuscated forms", () => {
  test("parses dotted, partial, decimal, hex, and octal forms", () => {
    expect(parseIpv4("127.0.0.1")).toBe(0x7f000001);
    expect(parseIpv4("127.1")).toBe(0x7f000001);
    expect(parseIpv4("2130706433")).toBe(0x7f000001);
    expect(parseIpv4("0x7f.0.0.1")).toBe(0x7f000001);
    expect(parseIpv4("0177.0.0.1")).toBe(0x7f000001);
    expect(parseIpv4("example.com")).toBeNull();
    expect(parseIpv4("300.1.1.1")).toBeNull();
  });

  test("loopback in every obfuscated form is unusable", () => {
    for (const host of ["127.0.0.1", "127.1", "127.255.255.254", "2130706433", "0x7f000001", "0177.0.0.1", "0x7f.1"]) {
      expect(usable(`https://${host}/`)).toBe(false);
    }
  });

  test("private, link-local, CGNAT, unspecified, multicast, and reserved ranges are unusable", () => {
    for (const host of [
      "10.0.0.2",
      "192.168.1.10",
      "172.16.0.1",
      "172.31.255.255",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.251",
      "240.0.0.1",
      "255.255.255.255",
      "192.0.2.5",
      "198.51.100.7",
      "203.0.113.9",
      "198.18.0.1",
    ]) {
      expect(usable(`https://${host}/`)).toBe(false);
    }
  });

  test("public IPv4 stays usable", () => {
    expect(usable("https://93.184.216.34/")).toBe(true);
    expect(isPublicIpv4(parseIpv4("8.8.8.8")!)).toBe(true);
    // 172.32.x is public (only 172.16/12 is private).
    expect(usable("https://172.32.0.1/")).toBe(true);
  });
});

describe("IPv6", () => {
  test("loopback, unspecified, link-local, unique-local, multicast are unusable", () => {
    for (const host of ["[::1]", "[::]", "[fe80::1]", "[fc00::1]", "[fd12:3456::1]", "[ff02::1]"]) {
      expect(usable(`https://${host}/`)).toBe(false);
    }
  });

  test("IPv4-mapped IPv6 forms of private addresses are unusable", () => {
    for (const host of [
      "[::ffff:127.0.0.1]",
      "[::ffff:10.0.0.1]",
      "[::ffff:192.168.1.1]",
      "[::ffff:7f00:1]",
      "[::127.0.0.1]",
    ]) {
      expect(usable(`https://${host}/`)).toBe(false);
    }
  });

  test("IPv4-mapped IPv6 of a public address is usable", () => {
    expect(usable("https://[::ffff:93.184.216.34]/")).toBe(true);
  });

  test("ordinary global IPv6 is usable", () => {
    expect(usable("https://[2606:2800:220:1:248:1893:25c8:1946]/")).toBe(true);
  });
});
