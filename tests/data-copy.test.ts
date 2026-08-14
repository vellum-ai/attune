import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DIMENSIONS } from "../apps/taste/src/data";

const SRC = join(import.meta.dir, "..", "apps", "taste", "src");

describe("Taste data and visible copy", () => {
  test("every option has a short summary while means remains available", () => {
    for (const dimension of DIMENSIONS) {
      expect(dimension.id).toBeDefined();
      for (const pair of dimension.pairs) {
        for (const option of [pair.a, pair.b]) {
          expect(option.summary.trim().length).toBeGreaterThan(0);
          expect(option.summary.length).toBeLessThanOrEqual(32);
          expect(option.means.trim().length).toBeGreaterThan(0);
        }
      }
    }
  });

  test("visible UI uses summaries rather than classifier explanations", () => {
    const flow = readFileSync(join(SRC, "components", "Flow.tsx"), "utf8");
    expect(flow).toContain("option.summary");
    expect(flow).not.toContain("<p>{option.means}</p>");
    expect(flow).not.toContain("sentenceCase(option.means)");
  });

  test("required simple copy is present and old chrome is absent", () => {
    const app = readFileSync(join(SRC, "components", "App.tsx"), "utf8");
    const flow = readFileSync(join(SRC, "components", "Flow.tsx"), "utf8");
    expect(app).toContain("Show Vellum what you like.");
    expect(app).toContain("Start with a category");
    expect(app).toContain("Ask Vellum what it remembers");
    expect(app).toContain("What Vellum knows about your taste.");
    expect(flow).toContain("Which feels more like you?");
    expect(flow).toContain("Back to Taste");
    expect(flow).toContain("Save to Vellum");
    expect(flow).toContain("Vellum will use these preferences going forward.");
    for (const obsolete of ["profile / calibration", "Preview only. Saved here, not sent.", "Build a baseline", "living profile"]) {
      expect(`${app}\n${flow}`).not.toContain(obsolete);
    }
  });
});
