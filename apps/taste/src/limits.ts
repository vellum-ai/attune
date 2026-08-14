/**
 * Centralized payload limits, enforced twice: in the app before submission
 * (so the user gets an actionable message and can edit), and again in the
 * route handler (so the server never trusts the client's arithmetic).
 *
 * Limits are measured in UTF-8 bytes where the resource being protected is
 * bytes (storage, transport), and in items where it is count. Nothing is
 * silently truncated or dropped: input over a limit fails validation with a
 * message naming exactly what overflowed and by how much.
 */

export const LIMITS = {
  /** Pasted free-text evidence, per submission (UTF-8 bytes). */
  sourceTextBytes: 24_000,
  /** One list item (artist, tool name…), in UTF-8 bytes. */
  itemBytes: 200,
  /** List items per submission. */
  itemCount: 25,
  /** One URL, in UTF-8 bytes. */
  urlBytes: 2_048,
  /** URL lines per submission. */
  urlCount: 20,
  /** All evidence combined (text + items + URLs), in UTF-8 bytes. */
  totalEvidenceBytes: 32_000,
  /** Hard cap on the serialized bridge payload, in UTF-8 bytes. */
  payloadBytes: 48_000,
} as const;

const encoder = new TextEncoder();

/** UTF-8 byte length — multi-byte characters count at their real size. */
export function byteLength(value: string): number {
  return encoder.encode(value).length;
}

export interface OverflowError {
  /** Which limit was exceeded, keyed into {@link LIMITS}. */
  limit: keyof typeof LIMITS;
  /** Human-actionable description naming the offending input. */
  message: string;
  /** Measured size. */
  actual: number;
  /** Allowed maximum. */
  allowed: number;
}

export interface EvidenceInput {
  sourceText: string;
  items: string[];
  urls: string[];
}

/**
 * Validate evidence against every limit. Returns all overflows at once so
 * the user can fix everything in one edit, not one error per retry.
 */
export function validateEvidence(input: EvidenceInput): OverflowError[] {
  const errors: OverflowError[] = [];

  const textBytes = byteLength(input.sourceText);
  if (textBytes > LIMITS.sourceTextBytes) {
    errors.push({
      limit: "sourceTextBytes",
      message: `Pasted text is ${textBytes.toLocaleString()} bytes; the limit is ${LIMITS.sourceTextBytes.toLocaleString()}. Trim it to the samples that matter most.`,
      actual: textBytes,
      allowed: LIMITS.sourceTextBytes,
    });
  }

  if (input.items.length > LIMITS.itemCount) {
    errors.push({
      limit: "itemCount",
      message: `${input.items.length} list items; the limit is ${LIMITS.itemCount}. Remove ${input.items.length - LIMITS.itemCount}.`,
      actual: input.items.length,
      allowed: LIMITS.itemCount,
    });
  }
  for (const item of input.items) {
    const bytes = byteLength(item);
    if (bytes > LIMITS.itemBytes) {
      errors.push({
        limit: "itemBytes",
        message: `List item "${item.slice(0, 40)}…" is ${bytes} bytes; the limit is ${LIMITS.itemBytes}.`,
        actual: bytes,
        allowed: LIMITS.itemBytes,
      });
    }
  }

  if (input.urls.length > LIMITS.urlCount) {
    errors.push({
      limit: "urlCount",
      message: `${input.urls.length} URLs; the limit is ${LIMITS.urlCount}. Remove ${input.urls.length - LIMITS.urlCount}.`,
      actual: input.urls.length,
      allowed: LIMITS.urlCount,
    });
  }
  for (const url of input.urls) {
    const bytes = byteLength(url);
    if (bytes > LIMITS.urlBytes) {
      errors.push({
        limit: "urlBytes",
        message: `URL "${url.slice(0, 60)}…" is ${bytes} bytes; the limit is ${LIMITS.urlBytes}.`,
        actual: bytes,
        allowed: LIMITS.urlBytes,
      });
    }
  }

  const total =
    textBytes +
    input.items.reduce((sum, item) => sum + byteLength(item), 0) +
    input.urls.reduce((sum, url) => sum + byteLength(url), 0);
  if (total > LIMITS.totalEvidenceBytes) {
    errors.push({
      limit: "totalEvidenceBytes",
      message: `All evidence together is ${total.toLocaleString()} bytes; the limit is ${LIMITS.totalEvidenceBytes.toLocaleString()}. Trim the largest inputs.`,
      actual: total,
      allowed: LIMITS.totalEvidenceBytes,
    });
  }

  return errors;
}

/** Validate the final serialized payload size before it crosses the bridge. */
export function validatePayloadSize(serialized: string): OverflowError | null {
  const bytes = byteLength(serialized);
  if (bytes <= LIMITS.payloadBytes) return null;
  return {
    limit: "payloadBytes",
    message: `The full submission is ${bytes.toLocaleString()} bytes; the limit is ${LIMITS.payloadBytes.toLocaleString()}. Trim the evidence.`,
    actual: bytes,
    allowed: LIMITS.payloadBytes,
  };
}
