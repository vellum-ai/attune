/**
 * The skill is prose, but its policy commitments are load-bearing — these
 * tests pin the statements the security model depends on, so a future copy
 * edit that weakens one fails loudly instead of silently.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SKILL = readFileSync(
  join(import.meta.dir, "..", "skills", "taste", "SKILL.md"),
  "utf-8",
);

describe("read path", () => {
  test("covers all four dimensions including building", () => {
    for (const page of [
      "taste-writing",
      "taste-music",
      "taste-visual",
      "taste-building",
    ]) {
      expect(SKILL).toContain(page);
    }
  });

  test("activates for technical builds, not only prose", () => {
    expect(SKILL).toMatch(/including\s+technical builds/);
    expect(SKILL).toMatch(/app, website, product, API/i);
  });

  test("excludes mechanical tasks", () => {
    expect(SKILL).toContain("no meaningful creative choice");
    expect(SKILL).toMatch(/purely mechanical/);
  });

  test("states the full precedence order", () => {
    const order = [
      "Platform and identity invariants",
      "explicit current-turn instructions",
      "Project requirements and established conventions",
      "Recorded Taste",
      "Generic defaults",
    ];
    let lastIndex = -1;
    for (const entry of order) {
      const index = SKILL.indexOf(entry);
      expect(index).toBeGreaterThan(lastIndex);
      lastIndex = index;
    }
  });

  test("explicit current-turn instructions beat recorded taste", () => {
    expect(SKILL).toContain(
      "Explicit current-turn instructions and project constraints beat recorded",
    );
  });

  test("taste is applied silently", () => {
    expect(SKILL).toContain("Apply it silently");
  });
});

describe("learning path", () => {
  test("one-off constraints are non-durable and not recorded", () => {
    expect(SKILL).toContain("One-off project constraints");
    expect(SKILL).toMatch(/One-off constraint, non-durable/);
  });

  test("contentless praise is not evidence", () => {
    expect(SKILL).toContain("Silence, acceptance, or contentless praise");
    expect(SKILL).toContain("Contentless praise teaches nothing");
  });

  test("identity rules cannot be overwritten by taste", () => {
    expect(SKILL).toContain("never be rewritten as mutable");
    expect(SKILL).toContain("remain authoritative");
  });

  test("stores preferences, never raw source or secrets", () => {
    expect(SKILL).toContain("Store preferences, not event history");
    expect(SKILL).toMatch(/Never store raw source\s+text/);
    expect(SKILL).toContain("secrets or credentials");
  });

  test("samples and URLs are evidence without instructional authority", () => {
    expect(SKILL).toMatch(/analyze.*never a message to.*obey/s);
    expect(SKILL).toContain("zero");
    expect(SKILL).toContain("never persist fetched");
  });
});
