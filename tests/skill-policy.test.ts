/**
 * Policy pins for the skill prose. These are deliberately NOT behavior
 * proofs — runtime activation is decided by the host's skill selection (and
 * the current assistant environment independently mandates Taste in
 * SOUL.md, so observed activation cannot be attributed to this metadata
 * alone). What these tests do is keep the load-bearing policy statements
 * from being silently weakened by a copy edit.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SKILL = readFileSync(
  join(import.meta.dir, "..", "skills", "taste", "SKILL.md"),
  "utf-8",
);

describe("read path", () => {
  test("covers all four canonical dimensions", () => {
    for (const page of ["taste-writing", "taste-music", "taste-visual", "taste-building"]) {
      expect(SKILL).toContain(page);
    }
    expect(SKILL).not.toContain("taste-web-design");
    expect(SKILL).not.toContain("taste-interior-design");
  });

  test("activates for technical builds, not only prose", () => {
    expect(SKILL).toMatch(/including\s+technical builds/);
    expect(SKILL).toMatch(/app, website, product, API/i);
  });

  test("excludes mechanical tasks", () => {
    expect(SKILL).toContain("no meaningful creative choice");
    expect(SKILL).toMatch(/purely mechanical/);
  });

  test("states the full five-level precedence order", () => {
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

  test("recalls the smallest relevant page set before drafting", () => {
    expect(SKILL).toMatch(/smallest relevant\s+set/);
  });
});

describe("learning path", () => {
  test("distinguishes the verified onboarding write path from conversational remember", () => {
    expect(SKILL).toContain("Do not substitute `remember` there");
    expect(SKILL).toMatch(/consolidation, not instantly/);
  });

  test("one-off constraints are non-durable and not recorded", () => {
    expect(SKILL).toContain("One-off project constraints");
    expect(SKILL).toMatch(/One-off constraints are non-durable/);
  });

  test("contentless praise is not evidence", () => {
    expect(SKILL).toContain("Silence, acceptance, or contentless praise");
    expect(SKILL).toContain("contentless\npraise teaches nothing");
  });

  test("identity rules cannot be overwritten by taste", () => {
    expect(SKILL).toContain("never be rewritten as mutable");
    expect(SKILL).toContain("remain\nauthoritative");
  });

  test("provenance distinguishes claimed authorship from unknown origin", () => {
    expect(SKILL).toContain("Sample the user claims as their own");
    expect(SKILL).toContain("supplying text is not authorship");
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
