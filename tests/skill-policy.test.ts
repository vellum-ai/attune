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
  test("covers all four dimensions and their pages", () => {
    for (const page of [
      "taste-writing",
      "taste-music",
      "taste-web-design",
      "taste-interior-design",
    ]) {
      expect(SKILL).toContain(page);
    }
  });

  test("reads the calibrated profile and the memory pages, both before drafting", () => {
    expect(SKILL).toContain("read_profile");
    expect(SKILL).toMatch(/Two reads, both before drafting/);
    expect(SKILL).toMatch(/smallest relevant\s+set/);
  });

  test("manual overrides win over learned positions and confidence gates the lean", () => {
    expect(SKILL).toContain("wins over the learned position");
    expect(SKILL).toContain("`established` is a firm default");
    expect(SKILL).toContain("no recorded preference carries no instruction");
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
    expect(SKILL).toMatch(/apply it silently, without narrating/);
  });
});

describe("learning path", () => {
  test("distinguishes the verified onboarding write path from conversational remember", () => {
    expect(SKILL).toContain("Do not substitute `remember` there");
    expect(SKILL).toMatch(/consolidation, not instantly/);
  });

  test("durable conversational reactions write both records", () => {
    expect(SKILL).toContain("update_profile");
    expect(SKILL).toMatch(/two\s+writes/);
    expect(SKILL).toMatch(/Never invent\s+numeric precision/);
  });

  test("one-off constraints are non-durable and not recorded", () => {
    expect(SKILL).toMatch(/One-off\s+project constraints are non-durable/);
  });

  test("contentless praise is not evidence", () => {
    expect(SKILL).toContain("Silence, acceptance, or contentless praise");
    expect(SKILL).toMatch(/contentless\s+praise teaches nothing/);
  });

  test("identity rules cannot be overwritten by taste", () => {
    expect(SKILL).toContain("never be rewritten as mutable");
    expect(SKILL).toMatch(/remain\s+authoritative/);
  });

  test("provenance distinguishes claimed authorship from unknown origin", () => {
    expect(SKILL).toMatch(/claims as their own/);
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
