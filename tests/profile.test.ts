import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import {
  readProfile,
  setBaseline,
  setOverride,
  updateLearned,
} from "../skills/taste/tools/update_profile";

const TEST_ROOT = join(import.meta.dir, `.taste-profile-test-${process.pid}`);
const ORIGINAL_WORKSPACE = process.env.VELLUM_WORKSPACE_DIR;

function writingAnswers(side: "left" | "right") {
  return [
    ["hedging", "Certainty", "Certain", "Tentative"],
    ["order", "Structure", "Conclusion first", "Reasoning first"],
    ["ornament", "Figurative language", "Literal", "Figurative"],
    ["length", "Sentence length", "Compressed", "Expansive"],
    ["jargon", "Technical language", "Insider", "Glossed"],
  ].map(([axisId, label, leftLabel, rightLabel]) => ({
    axisId,
    label,
    leftLabel,
    rightLabel,
    side,
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

describe("structured profile invariants", () => {
  test("baseline, learned evidence, and manual overrides remain separate", async () => {
    const neutral = await readProfile();
    const neutralAxis = neutral.dimensions.find((item) => item.id === "writing")!.axes[0];
    expect(neutralAxis.learnedPosition).toBe(50);
    expect(neutralAxis.overridePosition).toBeNull();
    expect(neutralAxis.evidenceCount).toBe(0);

    const leftBaseline = await setBaseline("writing", writingAnswers("left"));
    const leftDimension = leftBaseline.dimensions.find((item) => item.id === "writing")!;
    const leftAxis = leftDimension.axes.find((item) => item.id === "hedging")!;
    expect(leftDimension.baselineComplete).toBe(true);
    expect(leftAxis.learnedPosition).toBeLessThan(50);
    expect(leftAxis.evidenceCount).toBe(1);
    expect(leftAxis.confidence).toBe("low");

    const learned = await updateLearned({
      dimension_id: "writing",
      axis_id: "hedging",
      direction: "left",
      strength: "clear",
      reason: "Prefers direct findings across technical work",
    });
    const learnedAxis = learned.dimensions.find((item) => item.id === "writing")!.axes.find((item) => item.id === "hedging")!;
    expect(learnedAxis.evidenceCount).toBe(2);
    expect(learnedAxis.learnedPosition).toBeLessThan(leftAxis.learnedPosition);
    expect(learnedAxis.lastReason).toContain("direct findings");

    const overridden = await setOverride("writing", "hedging", 82);
    const overriddenAxis = overridden.dimensions.find((item) => item.id === "writing")!.axes.find((item) => item.id === "hedging")!;
    expect(overriddenAxis.overridePosition).toBe(82);
    expect(overriddenAxis.learnedPosition).toBe(learnedAxis.learnedPosition);
    expect(overriddenAxis.evidenceCount).toBe(learnedAxis.evidenceCount);

    const replaced = await setBaseline("writing", writingAnswers("right"));
    const replacedAxis = replaced.dimensions.find((item) => item.id === "writing")!.axes.find((item) => item.id === "hedging")!;
    expect(replacedAxis.evidenceCount).toBe(2);
    expect(replacedAxis.overridePosition).toBe(82);
    expect(replacedAxis.learnedPosition).toBeLessThan(50);

    const cleared = await setOverride("writing", "hedging", null);
    const clearedAxis = cleared.dimensions.find((item) => item.id === "writing")!.axes.find((item) => item.id === "hedging")!;
    expect(clearedAxis.overridePosition).toBeNull();
    expect(clearedAxis.learnedPosition).toBe(replacedAxis.learnedPosition);
    expect(clearedAxis.evidenceCount).toBe(replacedAxis.evidenceCount);
  });
});
