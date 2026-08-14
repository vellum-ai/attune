/**
 * Submission assembly: provenance is collected rather than inferred, URLs
 * split from prose, and derived statements come only from the closed table.
 */

import { describe, expect, test } from "bun:test";

import { DIMENSIONS, dimensionById } from "../apps/taste/src/data";
import {
  buildSubmission,
  deriveStatements,
  PAGE_BY_DIMENSION,
  splitEvidenceText,
} from "../apps/taste/src/payload";

const REQUEST_ID = "11111111-2222-4333-8444-555555555555";

describe("data model", () => {
  test("all four canonical dimensions exist and map to distinct pages", () => {
    expect(DIMENSIONS.map((d) => d.id).sort()).toEqual(["building", "music", "visual", "writing"]);
    expect(Object.values(PAGE_BY_DIMENSION).sort()).toEqual([
      "taste-building",
      "taste-music",
      "taste-visual",
      "taste-writing",
    ]);
    for (const dimension of DIMENSIONS) {
      expect(PAGE_BY_DIMENSION[dimension.id]).toBe(`taste-${dimension.id}`);
      expect(dimension.pairs.length).toBeGreaterThan(0);
      const ids = dimension.pairs.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe("provenance", () => {
  test("pasted prose defaults to unknown origin", () => {
    const writing = dimensionById("writing");
    const built = buildSubmission(
      REQUEST_ID,
      writing,
      { hedging: writing.pairs[0].a },
      "Some paragraphs I supplied.",
      [],
      false,
    );
    const text = built.submission?.sources.find((s) => s.kind === "text");
    expect(text && text.kind === "text" && text.provenance).toBe("user_supplied_unknown_origin");
  });

  test("prose is user-claimed only when the UI checkbox says so", () => {
    const writing = dimensionById("writing");
    const built = buildSubmission(
      REQUEST_ID,
      writing,
      { hedging: writing.pairs[0].a },
      "Some paragraphs I wrote.",
      [],
      true,
    );
    const text = built.submission?.sources.find((s) => s.kind === "text");
    expect(text && text.kind === "text" && text.provenance).toBe("user_claimed_authored_sample");
  });

  test("URLs are always third-party; list items are named preferences", () => {
    const music = dimensionById("music");
    const built = buildSubmission(
      REQUEST_ID,
      music,
      { texture: music.pairs[0].a },
      "https://example.com/list",
      ["Nick Drake"],
      true, // the authorship claim must not leak onto URLs or items
    );
    const url = built.submission?.sources.find((s) => s.kind === "url");
    const item = built.submission?.sources.find((s) => s.kind === "item");
    expect(url && url.kind === "url" && url.provenance).toBe("third_party_url");
    expect(item && item.kind === "item" && item.provenance).toBe("named_preference");
  });

  test("unusable URLs are carried flagged, never silently dropped", () => {
    const writing = dimensionById("writing");
    const built = buildSubmission(
      REQUEST_ID,
      writing,
      { hedging: writing.pairs[0].a },
      "file:///etc/passwd\nwww.example.com",
      [],
      false,
    );
    const urls = built.submission?.sources.filter((s) => s.kind === "url") ?? [];
    expect(urls).toHaveLength(2);
    for (const url of urls) {
      expect(url.kind === "url" && url.usable).toBe(false);
      expect(url.kind === "url" && typeof url.reason).toBe("string");
    }
  });
});

describe("splitting and derivation", () => {
  test("mixed paste splits URLs from prose", () => {
    const { prose, urls } = splitEvidenceText(
      "A paragraph about queues.\nhttps://example.com/blog\nAnother paragraph.",
    );
    expect(prose).toContain("Another paragraph.");
    expect(prose).not.toContain("example.com");
    expect(urls).toEqual(["https://example.com/blog"]);
  });

  test("statements derive from the closed table keyed by axis+side", () => {
    const building = dimensionById("building");
    const statements = deriveStatements(building, [
      { axis: "control", side: "a" },
      { axis: "evidence", side: "b" },
    ]);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain("raw control");
    expect(statements[1]).toContain("quiet surface");
    for (const statement of statements) {
      expect(statement.startsWith("For building work, prefers ")).toBe(true);
    }
  });

  test("unknown axes derive nothing — evidence cannot author statements", () => {
    const writing = dimensionById("writing");
    expect(deriveStatements(writing, [{ axis: "<script>alert(1)</script>", side: "a" }])).toEqual([]);
  });

  test("overflowing evidence yields no submission and actionable overflows", () => {
    const writing = dimensionById("writing");
    const built = buildSubmission(
      REQUEST_ID,
      writing,
      { hedging: writing.pairs[0].a },
      "x".repeat(30_000),
      [],
      false,
    );
    expect(built.submission).toBeNull();
    expect(built.overflows.length).toBeGreaterThan(0);
    expect(built.overflows[0].message).toContain("limit");
  });
});
