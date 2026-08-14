import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";

export type Direction = "left" | "right";
export type Confidence = "low" | "growing" | "established";

export interface Axis {
  id: string;
  label: string;
  leftLabel: string;
  rightLabel: string;
  leftWeight: number;
  rightWeight: number;
  learnedPosition: number;
  overridePosition: number | null;
  overrideUpdatedAt: string | null;
  confidence: Confidence;
  evidenceCount: number;
  updatedAt: string;
  lastReason: string | null;
}

export interface Dimension {
  id: string;
  label: string;
  page: string;
  baselineComplete: boolean;
  lastCalibratedAt: string | null;
  axes: Axis[];
}

export interface TasteProfile {
  schemaVersion: number;
  revision: number;
  updatedAt: string;
  dimensions: Dimension[];
  /** Private ledger needed to replace onboarding votes without losing later evidence. */
  _evidence: Record<string, Evidence>;
}

interface Evidence {
  baselineSide: Direction | null;
  observedLeft: number;
  observedRight: number;
  observedCount: number;
}

interface SeedAxis {
  id: string;
  label: string;
  leftLabel: string;
  rightLabel: string;
}

interface SeedDimension {
  id: string;
  label: string;
  page: string;
  axes: SeedAxis[];
}

const SCHEMA_VERSION = 1;
const PROFILE_TAG = "taste:profile";
const MAX_DIMENSIONS = 50;
const MAX_AXES = 100;
const MAX_TEXT = 240;
const MAX_REASON = 500;
const PRIOR = 1;
const NUDGE = 1;
const CLEAR = 2;

const SEEDS: SeedDimension[] = [
  {
    id: "writing", label: "Writing", page: "taste-writing", axes: [
      ["hedging", "Hedging", "States findings flatly", "Leaves room for doubt"],
      ["order", "Order", "Conclusion first", "Reasoning first"],
      ["ornament", "Ornament", "Plain and literal", "Uses an image when it lands harder"],
      ["length", "Length", "Short declaratives", "Longer clause-carrying sentences"],
      ["jargon", "Jargon", "Trusts domain readers", "Glosses technical terms"],
    ].map(axis),
  },
  {
    id: "music", label: "Music", page: "taste-music", axes: [
      ["texture", "Texture", "Sparse and close-miked", "Wide and reverberant"],
      ["palette", "Palette", "Acoustic instrumentation", "Electronic and synthetic textures"],
      ["motion", "Motion", "Still and melancholy", "Propulsive and rhythmic"],
      ["demand", "Demand", "Warm on first listen", "Difficult at first, rewarding later"],
    ].map(axis),
  },
  {
    id: "web-design", label: "Web Design", page: "taste-web-design", axes: [
      ["web-density", "Density", "Edited and spacious", "Layered and information-rich"],
      ["web-hierarchy", "Hierarchy", "Explicit reading path", "Reveals importance through pacing"],
      ["web-type", "Typography", "Neutral and restrained", "Expressive and distinctive"],
      ["web-navigation", "Navigation", "Persistent and predictable", "Minimal and unobtrusive"],
      ["web-colour", "Colour", "Near-neutrals with one accent", "Assertive colour and contrast"],
      ["web-motion", "Motion", "Purposeful state explanation", "Atmosphere and personality"],
      ["web-imagery", "Imagery", "Selective and art-directed", "Abundant and immediate"],
      ["web-surface", "Surface", "Flat and architectural", "Tactile and layered"],
      ["web-finish", "Finish", "Invisible polish and restraint", "Intentional imperfection"],
    ].map(axis),
  },
  {
    id: "interior-design", label: "Interior Design", page: "taste-interior-design", axes: [
      ["interior-plan", "Plan", "Open and legible", "Composed in intimate zones"],
      ["interior-light", "Light", "Crisp directional daylight", "Warm pools and shadow"],
      ["interior-palette", "Palette", "Neutral mineral tones", "Confident colour"],
      ["interior-material", "Material", "Smooth and precise", "Tactile and visibly varied"],
      ["interior-furniture", "Furniture", "Quiet disciplined silhouettes", "Sculptural statement pieces"],
      ["interior-object", "Objects", "Sparse and deliberate", "Collected and layered"],
      ["interior-age", "Age", "Contemporary and current", "Mixed eras and visible history"],
      ["interior-comfort", "Comfort", "Order and low visual noise", "Softness and signs of use"],
      ["interior-contrast", "Contrast", "Close tones and measured shifts", "Deliberate light-dark tension"],
    ].map(axis),
  },
];

function axis([id, label, leftLabel, rightLabel]: string[]): SeedAxis {
  return { id, label, leftLabel, rightLabel };
}

function workspace(): string {
  const value = process.env.VELLUM_WORKSPACE_DIR?.trim();
  if (!value) throw new Error("taste profile: VELLUM_WORKSPACE_DIR is not set");
  return value;
}

function dir(): string { return join(workspace(), "plugins-data", "taste"); }
function file(): string { return join(dir(), "profile.json"); }
function lockFile(): string { return `${file()}.lock`; }
function timestamp(): string { return new Date().toISOString(); }
function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }
function position(value: number): number { return Math.round(clamp(value, 0, 100)); }
function weight(value: number): number { return Math.round(value * 1000) / 1000; }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function stringValue(value: unknown, field: string, max = MAX_TEXT): string {
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const result = value.trim();
  if (!result) throw new Error(`${field} must not be empty`);
  if (result.length > max) throw new Error(`${field} is too long`);
  return result;
}
function identifier(value: unknown, field: string): string {
  const result = stringValue(value, field, 80);
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(result)) throw new Error(`${field} contains invalid characters`);
  return result;
}
function numericPosition(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`${field} must be a finite number between 0 and 100`);
  }
  return value;
}
function key(dimensionId: string, axisId: string): string { return `${dimensionId}.${axisId}`; }
function blankEvidence(): Evidence { return { baselineSide: null, observedLeft: 0, observedRight: 0, observedCount: 0 }; }

function confidence(evidence: Evidence): Confidence {
  const count = (evidence.baselineSide ? 1 : 0) + evidence.observedCount;
  if (count < 2) return "low";
  const left = (evidence.baselineSide === "left" ? 1 : 0) + evidence.observedLeft;
  const right = (evidence.baselineSide === "right" ? 1 : 0) + evidence.observedRight;
  const agreement = Math.max(left, right) / Math.max(1, left + right);
  if (count >= 4 && agreement >= 0.75) return "established";
  if (agreement >= 0.6) return "growing";
  return "low";
}

function recompute(axisValue: Axis, evidence: Evidence, at: string, reason?: string): void {
  const left = PRIOR + (evidence.baselineSide === "left" ? 1 : 0) + evidence.observedLeft;
  const right = PRIOR + (evidence.baselineSide === "right" ? 1 : 0) + evidence.observedRight;
  const total = left + right;
  axisValue.leftWeight = weight(left / total);
  axisValue.rightWeight = weight(right / total);
  axisValue.learnedPosition = position((right / total) * 100);
  axisValue.confidence = confidence(evidence);
  axisValue.evidenceCount = (evidence.baselineSide ? 1 : 0) + evidence.observedCount;
  axisValue.updatedAt = at;
  if (reason !== undefined) axisValue.lastReason = reason;
}

function makeAxis(seed: SeedAxis, at: string): Axis {
  return { ...seed, leftWeight: 0.5, rightWeight: 0.5, learnedPosition: 50, overridePosition: null, overrideUpdatedAt: null, confidence: "low", evidenceCount: 0, updatedAt: at, lastReason: null };
}

function seeded(at = timestamp()): TasteProfile {
  const profile: TasteProfile = {
    schemaVersion: SCHEMA_VERSION,
    revision: 0,
    updatedAt: at,
    dimensions: SEEDS.map((seed) => ({ id: seed.id, label: seed.label, page: seed.page, baselineComplete: false, lastCalibratedAt: null, axes: seed.axes.map((item) => makeAxis(item, at)) })),
    _evidence: {},
  };
  for (const dimension of profile.dimensions) for (const item of dimension.axes) profile._evidence[key(dimension.id, item.id)] = blankEvidence();
  return profile;
}

function normalEvidence(value: unknown): Evidence {
  if (!record(value)) return blankEvidence();
  return {
    baselineSide: value.baselineSide === "left" || value.baselineSide === "right" ? value.baselineSide : null,
    observedLeft: typeof value.observedLeft === "number" && Number.isFinite(value.observedLeft) ? clamp(value.observedLeft, 0, 1000) : 0,
    observedRight: typeof value.observedRight === "number" && Number.isFinite(value.observedRight) ? clamp(value.observedRight, 0, 1000) : 0,
    observedCount: typeof value.observedCount === "number" && Number.isInteger(value.observedCount) ? clamp(value.observedCount, 0, 10000) : 0,
  };
}

function normalise(value: unknown): TasteProfile {
  const at = timestamp();
  const profile = seeded(at);
  if (!record(value)) return profile;
  const rawDimensions = Array.isArray(value.dimensions) ? value.dimensions.slice(0, MAX_DIMENSIONS) : [];
  const rawEvidence = record(value._evidence) ? value._evidence : {};
  for (const rawDimension of rawDimensions) {
    if (!record(rawDimension) || typeof rawDimension.id !== "string") continue;
    const dimension = profile.dimensions.find((item) => item.id === rawDimension.id);
    const seedDimension = SEEDS.find((item) => item.id === rawDimension.id);
    if (!dimension || !seedDimension) continue;
    dimension.baselineComplete = rawDimension.baselineComplete === true;
    dimension.lastCalibratedAt = typeof rawDimension.lastCalibratedAt === "string" ? rawDimension.lastCalibratedAt : null;
    const rawAxes = Array.isArray(rawDimension.axes) ? rawDimension.axes : [];
    for (const seedAxis of seedDimension.axes) {
      const axisValue = dimension.axes.find((item) => item.id === seedAxis.id)!;
      const rawAxis = rawAxes.find((item) => record(item) && item.id === seedAxis.id);
      if (record(rawAxis)) {
        if (typeof rawAxis.label === "string" && rawAxis.label.trim()) axisValue.label = rawAxis.label.trim().slice(0, MAX_TEXT);
        if (typeof rawAxis.leftLabel === "string" && rawAxis.leftLabel.trim()) axisValue.leftLabel = rawAxis.leftLabel.trim().slice(0, MAX_TEXT);
        if (typeof rawAxis.rightLabel === "string" && rawAxis.rightLabel.trim()) axisValue.rightLabel = rawAxis.rightLabel.trim().slice(0, MAX_TEXT);
        if (rawAxis.overridePosition === null) axisValue.overridePosition = null;
        else if (typeof rawAxis.overridePosition === "number" && Number.isFinite(rawAxis.overridePosition)) axisValue.overridePosition = numericPosition(rawAxis.overridePosition, "overridePosition");
        axisValue.overrideUpdatedAt = typeof rawAxis.overrideUpdatedAt === "string" ? rawAxis.overrideUpdatedAt : null;
        if (typeof rawAxis.lastReason === "string") axisValue.lastReason = rawAxis.lastReason.slice(0, MAX_REASON);
      }
      const evidence = normalEvidence(rawEvidence[key(dimension.id, seedAxis.id)]);
      profile._evidence[key(dimension.id, seedAxis.id)] = evidence;
      recompute(axisValue, evidence, typeof rawAxis?.updatedAt === "string" ? rawAxis.updatedAt : at, axisValue.lastReason ?? undefined);
    }
  }
  profile.revision = typeof value.revision === "number" && Number.isInteger(value.revision) ? Math.max(0, value.revision) : 0;
  profile.updatedAt = typeof value.updatedAt === "string" ? value.updatedAt : at;
  return profile;
}

async function acquireLock(): Promise<() => Promise<void>> {
  await mkdir(dir(), { recursive: true });
  const path = lockFile();
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      const handle = await open(path, "wx");
      await handle.writeFile(String(process.pid));
      await handle.close();
      return async () => { await unlink(path).catch(() => undefined); };
    } catch (error) {
      if (!record(error) || error.code !== "EEXIST") throw error;
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  }
  throw new Error("taste profile: lock timeout");
}

async function atomicWrite(profile: TasteProfile): Promise<void> {
  await mkdir(dir(), { recursive: true });
  const temporary = `${file()}.${process.pid}.${Date.now()}.tmp`;
  const handle = await open(temporary, "w");
  try {
    await handle.writeFile(`${JSON.stringify(profile, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, file());
}

async function readUnlocked(): Promise<TasteProfile> {
  try {
    return normalise(JSON.parse(await readFile(file(), "utf8")));
  } catch (error) {
    if (record(error) && error.code === "ENOENT") {
      const profile = seeded();
      await atomicWrite(profile);
      return profile;
    }
    if (error instanceof SyntaxError) throw new Error("taste profile: invalid JSON");
    throw error;
  }
}

export async function readProfile(): Promise<TasteProfile> {
  const release = await acquireLock();
  try { return await readUnlocked(); } finally { await release(); }
}

async function mutate(mutator: (profile: TasteProfile, at: string) => void): Promise<TasteProfile> {
  const release = await acquireLock();
  try {
    const profile = await readUnlocked();
    const at = timestamp();
    mutator(profile, at);
    profile.revision += 1;
    profile.updatedAt = at;
    await atomicWrite(profile);
    return profile;
  } finally { await release(); }
}

function dimensionOf(profile: TasteProfile, idValue: string): Dimension {
  const found = profile.dimensions.find((item) => item.id === idValue);
  if (!found) throw new Error(`unknown dimension: ${idValue}`);
  return found;
}
function axisOf(profile: TasteProfile, dimensionId: string, axisId: string): Axis {
  const found = dimensionOf(profile, dimensionId).axes.find((item) => item.id === axisId);
  if (!found) throw new Error(`unknown axis ${axisId} for dimension ${dimensionId}`);
  return found;
}
function evidenceOf(profile: TasteProfile, dimensionId: string, axisId: string): Evidence {
  const evidenceKey = key(dimensionId, axisId);
  profile._evidence[evidenceKey] ??= blankEvidence();
  return profile._evidence[evidenceKey];
}
function refreshBaseline(profile: TasteProfile, dimension: Dimension): void {
  dimension.baselineComplete = dimension.axes.every((item) => evidenceOf(profile, dimension.id, item.id).baselineSide !== null);
}

export async function setBaseline(dimensionInput: unknown, answersInput: unknown): Promise<TasteProfile> {
  const dimensionId = identifier(dimensionInput, "dimension_id");
  if (!Array.isArray(answersInput) || answersInput.length < 1 || answersInput.length > MAX_AXES) throw new Error("answers must contain 1 to 100 items");
  const answers = answersInput.map((value, index) => {
    if (!record(value)) throw new Error(`answers[${index}] must be an object`);
    if (value.side !== "left" && value.side !== "right") throw new Error(`answers[${index}].side must be left or right`);
    return {
      axisId: identifier(value.axisId ?? value.axis_id, `answers[${index}].axisId`),
      label: stringValue(value.label, `answers[${index}].label`),
      leftLabel: stringValue(value.leftLabel ?? value.left_label, `answers[${index}].leftLabel`),
      rightLabel: stringValue(value.rightLabel ?? value.right_label, `answers[${index}].rightLabel`),
      side: value.side as Direction,
    };
  });
  if (new Set(answers.map((item) => item.axisId)).size !== answers.length) throw new Error("answers contains duplicate axis ids");
  return mutate((profile, at) => {
    const dimension = dimensionOf(profile, dimensionId);
    for (const answer of answers) {
      const axisValue = axisOf(profile, dimensionId, answer.axisId);
      axisValue.label = answer.label;
      axisValue.leftLabel = answer.leftLabel;
      axisValue.rightLabel = answer.rightLabel;
      const evidence = evidenceOf(profile, dimensionId, answer.axisId);
      evidence.baselineSide = answer.side;
      recompute(axisValue, evidence, at, `Onboarding baseline: ${answer.side}`);
    }
    refreshBaseline(profile, dimension);
    if (dimension.baselineComplete) dimension.lastCalibratedAt = at;
  });
}

export async function setOverride(dimensionInput: unknown, axisInput: unknown, positionInput: unknown): Promise<TasteProfile> {
  const dimensionId = identifier(dimensionInput, "dimension_id");
  const axisId = identifier(axisInput, "axis_id");
  const exact = positionInput === null ? null : numericPosition(positionInput, "position");
  return mutate((profile, at) => {
    const axisValue = axisOf(profile, dimensionId, axisId);
    axisValue.overridePosition = exact;
    axisValue.overrideUpdatedAt = at;
  });
}

export async function updateLearned(input: Record<string, unknown>): Promise<TasteProfile> {
  const dimensionId = identifier(input.dimension_id, "dimension_id");
  const axisId = identifier(input.axis_id, "axis_id");
  if (input.direction !== "left" && input.direction !== "right") throw new Error("direction must be left or right");
  if (input.strength !== "nudge" && input.strength !== "clear") throw new Error("strength must be nudge or clear");
  const reason = stringValue(input.reason, "reason", MAX_REASON);
  return mutate((profile, at) => {
    const axisValue = axisOf(profile, dimensionId, axisId);
    const evidence = evidenceOf(profile, dimensionId, axisId);
    const amount = input.strength === "clear" ? CLEAR : NUDGE;
    if (input.direction === "left") evidence.observedLeft = clamp(evidence.observedLeft + amount, 0, 1000);
    else evidence.observedRight = clamp(evidence.observedRight + amount, 0, 1000);
    evidence.observedCount = clamp(evidence.observedCount + 1, 0, 10000);
    recompute(axisValue, evidence, at, reason);
  });
}

export const PROFILE_SYNC_TAG = PROFILE_TAG;

export async function run(input: Record<string, unknown>): Promise<{ content: string; isError: boolean }> {
  try {
    const profile = await updateLearned(input);
    const dimensionId = String(input.dimension_id);
    const axisId = String(input.axis_id);
    const axisValue = axisOf(profile, dimensionId, axisId);
    return {
      content: JSON.stringify({
        ok: true,
        revision: profile.revision,
        dimensionId,
        axis: {
          id: axisValue.id,
          learnedPosition: axisValue.learnedPosition,
          confidence: axisValue.confidence,
          evidenceCount: axisValue.evidenceCount,
          lastReason: axisValue.lastReason,
        },
      }),
      isError: false,
    };
  } catch (error) {
    return { content: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), isError: true };
  }
}
