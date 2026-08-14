/**
 * The read half of the profile contract.
 *
 * `update_profile` and the app's calibration route both write to
 * `profile.json`, but nothing ever put that state back in front of the
 * model: the skill's only read path was the `[[taste-*]]` memory pages,
 * which are written during onboarding hand-off and never again. Slider
 * overrides and learned evidence were therefore invisible to the assistant
 * that was supposed to act on them.
 *
 * This tool closes that loop. It renders the canonical profile as compact
 * directive text rather than JSON, because the consumer is a model deciding
 * how to write a paragraph, not a program. It also names every axis id,
 * which is the vocabulary `update_profile` requires and had no other way of
 * learning.
 *
 * The private evidence ledger never leaves this module, matching the
 * route's public projection.
 */

import { readProfile, type Axis, type Dimension } from "./update_profile";

/** The only dimensions a caller may name. Mirrors the seeds. */
const DIMENSION_IDS = ["writing", "music", "web-design", "interior-design"] as const;

/**
 * How an axis position reads as an instruction. The bands are symmetric
 * around the neutral prior (50) so an unset axis always lands in the middle
 * band and reads as "no preference" rather than a weak signal.
 */
function band(position: number, leftLabel: string, rightLabel: string): string {
  if (position <= 20) return `strongly toward "${leftLabel}"`;
  if (position <= 40) return `leans "${leftLabel}"`;
  if (position < 60) return `balanced between "${leftLabel}" and "${rightLabel}"`;
  if (position < 80) return `leans "${rightLabel}"`;
  return `strongly toward "${rightLabel}"`;
}

/**
 * The position to act on. A manual override is an exact statement of current
 * preference and wins outright; otherwise the learned position stands. The
 * learned value is never overwritten by an override, so clearing the slider
 * restores it.
 */
function effective(axis: Axis): { position: number; source: "manual" | "learned" } {
  return axis.overridePosition === null
    ? { position: axis.learnedPosition, source: "learned" }
    : { position: axis.overridePosition, source: "manual" };
}

/** Placeholder `lastReason` written by `setBaseline`, never user prose. */
const ONBOARDING_REASON = /^Onboarding baseline:/;

function renderAxis(axis: Axis): string[] {
  const { position, source } = effective(axis);
  const unset = axis.overridePosition === null && axis.evidenceCount === 0;
  const reading = unset
    ? `no recorded preference — axis runs "${axis.leftLabel}" (0) to "${axis.rightLabel}" (100)`
    : band(position, axis.leftLabel, axis.rightLabel);
  const signals = axis.evidenceCount === 1 ? "1 signal" : `${axis.evidenceCount} signals`;
  const detail = source === "manual"
    ? `${position}/100, set by hand; learned position ${axis.learnedPosition}; confidence ${axis.confidence}, ${signals}`
    : `${position}/100, learned; confidence ${axis.confidence}, ${signals}`;

  const lines = [`  ${axis.id} (${axis.label}): ${reading} — ${detail}`];
  // The onboarding reason is an internal marker ("Onboarding baseline: left"),
  // not something the user said. Reporting it as a preference would teach the
  // model a phrasing nobody chose.
  if (axis.lastReason && !ONBOARDING_REASON.test(axis.lastReason)) {
    lines.push(`    latest: ${axis.lastReason}`);
  }
  return lines;
}

function renderDimension(dimension: Dimension): string[] {
  const state = dimension.baselineComplete ? "baseline complete" : "baseline incomplete";
  const lines = [`${dimension.label.toUpperCase()} (${dimension.id}) · page [[${dimension.page}]] · ${state}`];
  for (const axis of dimension.axes) lines.push(...renderAxis(axis));
  return lines;
}

const HEADER = [
  "Apply these as a prior, silently. Do not narrate the axes or mention this tool.",
  "Explicit current-turn instructions and project constraints outrank everything here.",
  'A position "set by hand" is the user\'s exact current preference and outranks the learned position.',
  "Confidence gates how hard to lean: established is a firm default, growing is a tilt, low is a hint.",
  'An axis with "no recorded preference" carries no instruction — use your normal judgement there.',
  "Axis ids listed here are the ids update_profile accepts.",
];

/** Normalize the requested dimension list, or all four when unspecified. */
function requested(input: Record<string, unknown>): string[] {
  const raw = input.dimensions ?? input.dimension_id ?? input.dimensionId;
  if (raw === undefined || raw === null) return [...DIMENSION_IDS];
  const values = Array.isArray(raw) ? raw : [raw];
  if (values.length === 0) return [...DIMENSION_IDS];
  const ids: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") throw new Error("dimensions must be strings");
    const id = value.trim().toLowerCase();
    if (!(DIMENSION_IDS as readonly string[]).includes(id)) {
      throw new Error(`unknown dimension "${value}" — valid ids are ${DIMENSION_IDS.join(", ")}`);
    }
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

export async function renderProfile(input: Record<string, unknown> = {}): Promise<string> {
  const ids = requested(input);
  const profile = await readProfile();
  const dimensions = ids
    .map((id) => profile.dimensions.find((dimension) => dimension.id === id))
    .filter((dimension): dimension is Dimension => dimension !== undefined);

  return [
    `TASTE PROFILE (revision ${profile.revision})`,
    ...HEADER,
    "",
    ...dimensions.flatMap((dimension) => [...renderDimension(dimension), ""]),
  ].join("\n").trimEnd();
}

export async function run(input: Record<string, unknown>): Promise<{ content: string; isError: boolean }> {
  try {
    return { content: await renderProfile(input ?? {}), isError: false };
  } catch (error) {
    return { content: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), isError: true };
  }
}
