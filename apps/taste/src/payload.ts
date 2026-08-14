/**
 * The typed submission that crosses the bridge, with explicit provenance.
 *
 * Provenance is collected, not inferred: pasted prose is unknown-origin
 * unless the user explicitly claims authorship in the UI, list items are
 * named preferences (not automatically stronger than ambiguous samples), and
 * URLs are always third-party. Questionnaire selections travel as
 * {axis, side} references into the app's closed data table — the client
 * never sends free-text that becomes profile prose, so pasted content cannot
 * author page text even if every other defense failed.
 */

import type { Dimension, DimensionId, Option } from "./data";
import { validateEvidence, validatePayloadSize, type OverflowError } from "./limits";
import { classifyUrl } from "./url";

// ── Closed destination map ─────────────────────────────────────────────────

/**
 * The only four destinations a submission can write to. The same map is
 * mirrored in the route handler; both sides derive the page from the
 * dimension id and from nothing else.
 */
export const PAGE_BY_DIMENSION: Record<DimensionId, string> = {
  writing: "taste-writing",
  music: "taste-music",
  "web-design": "taste-web-design",
  "interior-design": "taste-interior-design",
};

// ── Provenance ─────────────────────────────────────────────────────────────

export type Provenance =
  | "explicit_selection"
  | "user_claimed_authored_sample"
  | "user_supplied_unknown_origin"
  | "third_party_url"
  | "named_preference";

export type EvidenceSource =
  | {
      kind: "text";
      content: string;
      provenance: "user_claimed_authored_sample" | "user_supplied_unknown_origin";
    }
  | {
      kind: "url";
      url: string;
      provenance: "third_party_url";
      usable: boolean;
      reason?: string;
    }
  | { kind: "item"; value: string; provenance: "named_preference" };

export interface Selection {
  /** Pair id from the app's data table. */
  axis: string;
  /** Which side the user chose. */
  side: "a" | "b";
}

export interface TasteSubmission {
  /** Stable per-attempt id; retries reuse it so the route can be idempotent. */
  requestId: string;
  dimension: DimensionId;
  selections: Selection[];
  sources: EvidenceSource[];
}

// ── Assembly ───────────────────────────────────────────────────────────────

/** A line is URL-shaped when it is one token carrying a scheme or a bare www. */
function looksLikeUrl(line: string): boolean {
  return /^\S+$/.test(line) && (/^[a-z][a-z0-9+.-]*:\/\//i.test(line) || /^www\./i.test(line));
}

/** Split the free-text box into prose and URL lines (order preserved). */
export function splitEvidenceText(sourceText: string): { prose: string; urls: string[] } {
  const urls: string[] = [];
  const proseLines: string[] = [];
  for (const rawLine of sourceText.split("\n")) {
    const line = rawLine.trim();
    if (line && looksLikeUrl(line)) {
      urls.push(line);
    } else {
      proseLines.push(rawLine);
    }
  }
  return { prose: proseLines.join("\n").trim(), urls };
}

export interface BuildSubmissionResult {
  submission: TasteSubmission | null;
  /** Every limit overflow, empty when the submission is valid. */
  overflows: OverflowError[];
}

/**
 * Build and validate the submission. `authorshipClaimed` reflects the UI's
 * explicit question — supplying text is not evidence of having written it.
 * Overflows are returned instead of truncating: the user edits and retries.
 */
export function buildSubmission(
  requestId: string,
  dimension: Dimension,
  answers: Record<string, Option>,
  sourceText: string,
  items: string[],
  authorshipClaimed: boolean,
): BuildSubmissionResult {
  const { prose, urls } = splitEvidenceText(sourceText);

  const overflows = validateEvidence({
    sourceText: prose,
    items,
    urls,
  });
  if (overflows.length > 0) {
    return { submission: null, overflows };
  }

  const selections: Selection[] = dimension.pairs
    .filter((pair) => answers[pair.id] !== undefined)
    .map((pair) => ({
      axis: pair.id,
      side: answers[pair.id] === pair.a ? ("a" as const) : ("b" as const),
    }));

  const sources: EvidenceSource[] = [];
  if (prose) {
    sources.push({
      kind: "text",
      content: prose,
      provenance: authorshipClaimed
        ? "user_claimed_authored_sample"
        : "user_supplied_unknown_origin",
    });
  }
  for (const url of urls) {
    const verdict = /^www\./i.test(url)
      ? ({ usable: false, reason: "missing scheme — write it as https://…" } as const)
      : classifyUrl(url);
    sources.push({ kind: "url", url, provenance: "third_party_url", ...verdict });
  }
  for (const item of items) {
    const value = item.trim();
    if (value) sources.push({ kind: "item", value, provenance: "named_preference" });
  }

  const submission: TasteSubmission = {
    requestId,
    dimension: dimension.id,
    selections,
    sources,
  };

  const sizeError = validatePayloadSize(JSON.stringify(submission));
  if (sizeError) {
    return { submission: null, overflows: [sizeError] };
  }
  return { submission, overflows: [] };
}

// ── Derived statements ─────────────────────────────────────────────────────

/**
 * Map validated selections to concise derived preference statements using
 * the closed data table. Selection references that don't resolve are
 * dropped — client input can select among fixed statements, never author
 * them. Used by the route (authoritative) and by the app's summary screen.
 */
export function deriveStatements(
  dimension: Dimension,
  selections: Selection[],
): string[] {
  const statements: string[] = [];
  for (const selection of selections) {
    const pair = dimension.pairs.find((p) => p.id === selection.axis);
    if (!pair) continue;
    const option = selection.side === "a" ? pair.a : pair.b;
    statements.push(
      `For ${dimension.label.toLowerCase()} work, prefers ${option.means}.`,
    );
  }
  return statements;
}
