/**
 * Payload limits: exact boundaries, boundary+1, multi-byte Unicode, single
 * oversized fields, aggregate overflow — and the guarantee that nothing is
 * silently truncated or dropped.
 */

import { describe, expect, test } from "bun:test";

import {
  byteLength,
  LIMITS,
  validateEvidence,
  validatePayloadSize,
} from "../apps/taste/src/limits";

describe("byteLength", () => {
  test("multi-byte characters count at their UTF-8 size", () => {
    expect(byteLength("a")).toBe(1);
    expect(byteLength("é")).toBe(2);
    expect(byteLength("語")).toBe(3);
    expect(byteLength("🎚️")).toBeGreaterThanOrEqual(4);
  });
});

describe("validateEvidence", () => {
  const empty = { sourceText: "", items: [], urls: [] };

  test("empty evidence passes", () => {
    expect(validateEvidence(empty)).toEqual([]);
  });

  test("source text at the exact boundary passes; one byte over fails", () => {
    const atLimit = "a".repeat(LIMITS.sourceTextBytes);
    expect(validateEvidence({ ...empty, sourceText: atLimit })).toEqual([]);
    const over = atLimit + "b";
    const errors = validateEvidence({ ...empty, sourceText: over });
    expect(errors.some((e) => e.limit === "sourceTextBytes")).toBe(true);
  });

  test("a multi-byte character can be the byte that crosses the limit", () => {
    // 語 is 3 bytes: limit-2 ASCII chars + 語 = limit+1 bytes.
    const text = "a".repeat(LIMITS.sourceTextBytes - 2) + "語";
    expect(byteLength(text)).toBe(LIMITS.sourceTextBytes + 1);
    const errors = validateEvidence({ ...empty, sourceText: text });
    expect(errors.some((e) => e.limit === "sourceTextBytes")).toBe(true);
  });

  test("item count boundary and boundary+1", () => {
    const atLimit = Array.from({ length: LIMITS.itemCount }, (_, i) => `artist ${i}`);
    expect(validateEvidence({ ...empty, items: atLimit })).toEqual([]);
    const over = [...atLimit, "one more"];
    const errors = validateEvidence({ ...empty, items: over });
    expect(errors.some((e) => e.limit === "itemCount")).toBe(true);
    // Not silently dropped: validation fails instead of trimming the list.
    expect(over).toHaveLength(LIMITS.itemCount + 1);
  });

  test("an oversized single item is named in the error", () => {
    const big = "x".repeat(LIMITS.itemBytes + 1);
    const errors = validateEvidence({ ...empty, items: [big] });
    expect(errors.some((e) => e.limit === "itemBytes")).toBe(true);
    expect(errors[0].message).toContain("xxxx");
  });

  test("URL count over the limit fails visibly, never silently drops", () => {
    const urls = Array.from(
      { length: LIMITS.urlCount + 1 },
      (_, i) => `https://example.com/${i}`,
    );
    const errors = validateEvidence({ ...empty, urls });
    expect(errors.some((e) => e.limit === "urlCount")).toBe(true);
  });

  test("an oversized single URL fails", () => {
    const url = `https://example.com/${"p".repeat(LIMITS.urlBytes)}`;
    const errors = validateEvidence({ ...empty, urls: [url] });
    expect(errors.some((e) => e.limit === "urlBytes")).toBe(true);
  });

  test("aggregate overflow is caught even when every field is individually legal", () => {
    const errors = validateEvidence({
      sourceText: "a".repeat(LIMITS.sourceTextBytes),
      items: Array.from({ length: LIMITS.itemCount }, () => "y".repeat(LIMITS.itemBytes)),
      urls: Array.from({ length: LIMITS.urlCount }, (_, i) => `https://example.com/${"q".repeat(400)}${i}`),
    });
    expect(errors.some((e) => e.limit === "totalEvidenceBytes")).toBe(true);
  });

  test("all overflows are reported at once", () => {
    const errors = validateEvidence({
      sourceText: "a".repeat(LIMITS.sourceTextBytes + 1),
      items: Array.from({ length: LIMITS.itemCount + 1 }, () => "z"),
      urls: [],
    });
    const kinds = new Set(errors.map((e) => e.limit));
    expect(kinds.has("sourceTextBytes")).toBe(true);
    expect(kinds.has("itemCount")).toBe(true);
  });
});

describe("validatePayloadSize", () => {
  test("under the cap passes, over the cap reports actual and allowed", () => {
    expect(validatePayloadSize("{}")).toBeNull();
    const over = validatePayloadSize("x".repeat(LIMITS.payloadBytes + 1));
    expect(over?.limit).toBe("payloadBytes");
    expect(over?.actual).toBe(LIMITS.payloadBytes + 1);
    expect(over?.allowed).toBe(LIMITS.payloadBytes);
  });
});
