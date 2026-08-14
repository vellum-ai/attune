/**
 * Server-side validation of a taste submission. The route never trusts the
 * client's arithmetic or enums: every shape, enum, and limit is re-checked
 * here against the same closed tables the app uses.
 */

import { DIMENSIONS, type Dimension } from "../apps/taste/src/data";
import { validateEvidence, validatePayloadSize, type OverflowError } from "../apps/taste/src/limits";
import {
  PAGE_BY_DIMENSION,
  type EvidenceSource,
  type Selection,
  type TasteSubmission,
} from "../apps/taste/src/payload";

export interface ValidationFailure {
  ok: false;
  /** Human-actionable problems, one per offending field. */
  errors: string[];
  /** Structured overflow detail when limits were the problem. */
  overflows?: OverflowError[];
}

export interface ValidationSuccess {
  ok: true;
  submission: TasteSubmission;
  dimension: Dimension;
  page: string;
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

const REQUEST_ID_RE = /^[A-Za-z0-9-]{8,64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateSubmission(body: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isRecord(body)) {
    return { ok: false, errors: ["request body must be a JSON object"] };
  }

  const requestId = body.requestId;
  if (typeof requestId !== "string" || !REQUEST_ID_RE.test(requestId)) {
    errors.push("requestId must be 8–64 characters of [A-Za-z0-9-]");
  }

  const dimension = DIMENSIONS.find((d) => d.id === body.dimension);
  if (!dimension) {
    errors.push(`dimension must be one of: ${DIMENSIONS.map((d) => d.id).join(", ")}`);
  }

  const selections: Selection[] = [];
  if (!Array.isArray(body.selections)) {
    errors.push("selections must be an array");
  } else if (dimension) {
    const seen = new Set<string>();
    for (const [index, raw] of body.selections.entries()) {
      if (!isRecord(raw) || typeof raw.axis !== "string" || (raw.side !== "a" && raw.side !== "b")) {
        errors.push(`selections[${index}] must be {axis: string, side: "a"|"b"}`);
        continue;
      }
      if (!dimension.pairs.some((pair) => pair.id === raw.axis)) {
        errors.push(`selections[${index}].axis "${raw.axis}" is not an axis of ${dimension.id}`);
        continue;
      }
      if (seen.has(raw.axis)) {
        errors.push(`selections[${index}] repeats axis "${raw.axis}"`);
        continue;
      }
      seen.add(raw.axis);
      selections.push({ axis: raw.axis, side: raw.side });
    }
    if (selections.length === 0 && errors.length === 0) {
      errors.push("at least one selection is required");
    }
  }

  const sources: EvidenceSource[] = [];
  let proseText = "";
  const items: string[] = [];
  const urls: string[] = [];
  if (body.sources !== undefined) {
    if (!Array.isArray(body.sources)) {
      errors.push("sources must be an array when present");
    } else {
      for (const [index, raw] of body.sources.entries()) {
        if (!isRecord(raw)) {
          errors.push(`sources[${index}] must be an object`);
          continue;
        }
        if (raw.kind === "text") {
          if (
            typeof raw.content !== "string" ||
            (raw.provenance !== "user_claimed_authored_sample" &&
              raw.provenance !== "user_supplied_unknown_origin")
          ) {
            errors.push(`sources[${index}] text source needs content and a text provenance`);
            continue;
          }
          proseText += (proseText ? "\n" : "") + raw.content;
          sources.push({ kind: "text", content: raw.content, provenance: raw.provenance });
        } else if (raw.kind === "url") {
          if (typeof raw.url !== "string" || raw.provenance !== "third_party_url" || typeof raw.usable !== "boolean") {
            errors.push(`sources[${index}] url source needs url, third_party_url provenance, and usable`);
            continue;
          }
          urls.push(raw.url);
          sources.push({
            kind: "url",
            url: raw.url,
            provenance: "third_party_url",
            usable: raw.usable,
            ...(typeof raw.reason === "string" ? { reason: raw.reason } : {}),
          });
        } else if (raw.kind === "item") {
          if (typeof raw.value !== "string" || raw.provenance !== "named_preference") {
            errors.push(`sources[${index}] item source needs value and named_preference provenance`);
            continue;
          }
          items.push(raw.value);
          sources.push({ kind: "item", value: raw.value, provenance: "named_preference" });
        } else {
          errors.push(`sources[${index}].kind must be text, url, or item`);
        }
      }
    }
  }

  const overflows = validateEvidence({ sourceText: proseText, items, urls });
  if (overflows.length > 0) {
    return { ok: false, errors: overflows.map((o) => o.message), overflows };
  }

  if (errors.length > 0 || !dimension) {
    return { ok: false, errors };
  }

  const submission: TasteSubmission = {
    requestId: requestId as string,
    dimension: dimension.id,
    selections,
    sources,
  };
  const sizeError = validatePayloadSize(JSON.stringify(submission));
  if (sizeError) {
    return { ok: false, errors: [sizeError.message], overflows: [sizeError] };
  }

  return { ok: true, submission, dimension, page: PAGE_BY_DIMENSION[dimension.id] };
}
