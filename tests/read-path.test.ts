/**
 * The calibration loop only closes if what the app writes comes back out in
 * front of the model. These tests pin that round trip: a slider the user moves
 * and a durable reaction the assistant records both have to survive into the
 * rendered profile, and the axis vocabulary `update_profile` validates against
 * has to be discoverable rather than guessed.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import { renderProfile, run } from "../skills/taste/tools/read_profile";
import {
  setBaseline,
  setOverride,
  updateLearned,
} from "../skills/taste/tools/update_profile";

const TEST_ROOT = join(import.meta.dir, `.taste-read-path-test-${process.pid}`);
const ORIGINAL_WORKSPACE = process.env.VELLUM_WORKSPACE_DIR;

const SKILL_DIR = join(import.meta.dir, "..", "skills", "taste");
const SKILL = readFileSync(join(SKILL_DIR, "SKILL.md"), "utf-8");
const MANIFEST = JSON.parse(readFileSync(join(SKILL_DIR, "TOOLS.json"), "utf-8"));

/**
 * The onboarding answers the app posts. `ornament` deliberately answers to the
 * right so the override test can drag it to the opposite end. An override
 * that agrees with the baseline would pass whether or not it was honored.
 */
function writingAnswers() {
  return [
    ["hedging", "Certainty", "Certain", "Tentative", "left"],
    ["order", "Structure", "Conclusion first", "Reasoning first", "left"],
    ["ornament", "Figurative language", "Literal", "Figurative", "right"],
    ["length", "Sentence length", "Compressed", "Expansive", "left"],
    ["jargon", "Technical language", "Insider", "Glossed", "left"],
  ].map(([axisId, label, leftLabel, rightLabel, side]) => ({
    axisId,
    label,
    leftLabel,
    rightLabel,
    side: side as "left" | "right",
  }));
}

beforeAll(async () => {
  await rm(TEST_ROOT, { recursive: true, force: true });
  process.env.VELLUM_WORKSPACE_DIR = TEST_ROOT;
});

afterAll(async () => {
  await rm(TEST_ROOT, { recursive: true, force: true });
  if (ORIGINAL_WORKSPACE === undefined) delete process.env.VELLUM_WORKSPACE_DIR;
  else process.env.VELLUM_WORKSPACE_DIR = ORIGINAL_WORKSPACE;
});

describe("calibration reaches the model", () => {
  test("an uncalibrated axis states that it carries no instruction", async () => {
    const rendered = await renderProfile({ dimensions: ["writing"] });
    expect(rendered).toContain("hedging");
    expect(rendered).toContain("no recorded preference");
  });

  test("onboarding, a durable reaction, and a slider all survive the round trip", async () => {
    await setBaseline("writing", writingAnswers());
    await updateLearned({
      dimension_id: "writing",
      axis_id: "length",
      direction: "left",
      strength: "clear",
      reason: "prefers short declarative sentences",
    });
    // The case that was previously invisible: the learned position says
    // "Figurative", the user dragged the slider to the opposite end.
    await setOverride("writing", "ornament", 5);

    const rendered = await renderProfile({ dimensions: ["writing"] });

    // Onboarding baseline.
    expect(rendered).toMatch(/hedging[^\n]*Certain/);
    // Durable reaction, with its generalized reason.
    expect(rendered).toMatch(/length[^\n]*strongly toward "Compressed"/);
    expect(rendered).toContain("prefers short declarative sentences");
    // Manual override wins, and the learned position stays visible beneath it.
    expect(rendered).toMatch(/ornament[^\n]*strongly toward "Literal"/);
    expect(rendered).toContain("set by hand");
    expect(rendered).toMatch(/learned position 6\d/);
  });

  test("clearing an override restores the learned position", async () => {
    await setOverride("writing", "ornament", null);
    const rendered = await renderProfile({ dimensions: ["writing"] });
    expect(rendered).toMatch(/ornament[^\n]*"Figurative"/);
    // Scoped to the axis line: the header legend also explains "set by hand".
    expect(rendered).not.toMatch(/ornament[^\n]*set by hand/);
  });

  test("the internal onboarding marker is never reported as a preference", async () => {
    const rendered = await renderProfile({ dimensions: ["writing"] });
    expect(rendered).not.toContain("Onboarding baseline");
  });

  test("reads the smallest requested set, and all four by default", async () => {
    const one = await renderProfile({ dimensions: ["writing"] });
    expect(one).toContain("[[taste-writing]]");
    expect(one).not.toContain("[[taste-music]]");

    const all = await renderProfile();
    for (const page of ["taste-writing", "taste-music", "taste-web-design", "taste-interior-design"]) {
      expect(all).toContain(`[[${page}]]`);
    }
  });

  test("an unknown dimension is a named error, not a silent empty read", async () => {
    const result = await run({ dimensions: ["cooking"] });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("cooking");
    expect(result.content).toContain("interior-design");
  });

  test("the private evidence ledger never reaches the model", async () => {
    const rendered = await renderProfile();
    expect(rendered).not.toContain("_evidence");
    expect(rendered).not.toContain("observedLeft");
  });
});

describe("the profile is discoverable, not guessed", () => {
  test("the manifest ships a read tool alongside the write tool", () => {
    const names = MANIFEST.tools.map((tool: { name: string }) => tool.name);
    expect(names).toContain("read_profile");
    expect(names).toContain("update_profile");
  });

  test("both tools run in the sandbox", () => {
    for (const tool of MANIFEST.tools) {
      expect(tool.execution_target).toBe("sandbox");
    }
  });

  test("update_profile enumerates every axis id it will accept", () => {
    const update = MANIFEST.tools.find((tool: { name: string }) => tool.name === "update_profile");
    const axes: string[] = update.input_schema.properties.axis_id.enum;
    for (const axisId of [
      "hedging", "order", "ornament", "length", "jargon",
      "texture", "palette", "motion", "demand",
      "web-density", "web-finish",
      "interior-plan", "interior-contrast",
    ]) {
      expect(axes).toContain(axisId);
    }
  });

  test("every enumerated axis id exists in the profile", async () => {
    const update = MANIFEST.tools.find((tool: { name: string }) => tool.name === "update_profile");
    const rendered = await renderProfile();
    for (const axisId of update.input_schema.properties.axis_id.enum as string[]) {
      expect(rendered).toContain(`  ${axisId} (`);
    }
  });

  test("the skill requires the read before drafting", () => {
    expect(SKILL).toContain("read_profile");
    expect(SKILL).toMatch(/read_profile[^\n]*\n?[^\n]*before drafting|before drafting/);
  });

  test("the skill states that a hand-set position wins", () => {
    expect(SKILL).toContain("set by hand");
    expect(SKILL).toContain("wins over the learned position");
  });
});
