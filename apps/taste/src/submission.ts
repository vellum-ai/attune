/**
 * The submission lifecycle, as a pure state machine the UI renders.
 *
 *   idle → sending → persisted            (verified durable success)
 *                 ↘ accepted → persisted  (turn finished after a timeout)
 *                 ↘ failed               (every other outcome, with reasons)
 *   unavailable                           (no bridge — nothing was sent)
 *
 * The distinction the machine preserves: `accepted` means the host has the
 * request (journaled durably server-side) but durable page persistence is
 * not yet verified; only `persisted` — a verified machine acknowledgment —
 * counts as success or marks completion. A natural-language assistant reply
 * is never consulted. On timeouts and transport errors the machine polls
 * the journal status (bounded attempts, verification-backed — the route
 * re-reads the canonical page on every poll) instead of guessing.
 *
 * Pure by construction: the bridge, clock, and delays are injected, so every
 * failure mode is testable without a DOM or a host.
 */

import type { TasteSubmission } from "./payload";
import type { SubmitOutcome, TasteAck } from "./vellum";

export type SubmissionPhase =
  | { phase: "idle" }
  | { phase: "sending"; requestId: string }
  | { phase: "accepted"; requestId: string }
  | { phase: "persisted"; requestId: string; ack: TasteAck }
  | { phase: "failed"; requestId: string; errors: string[]; canRetry: boolean }
  | { phase: "unavailable" };

export interface SubmissionDeps {
  submit(submission: TasteSubmission): Promise<SubmitOutcome>;
  fetchStatus(requestId: string): Promise<SubmitOutcome>;
  /** Injected so tests control time. Defaults to real timers. */
  delay?(ms: number): Promise<void>;
  /** Watchdog on the POST round-trip (the route itself caps at 120s). */
  timeoutMs?: number;
  pollAttempts?: number;
  pollIntervalMs?: number;
}

const DEFAULT_TIMEOUT_MS = 130_000;
const DEFAULT_POLL_ATTEMPTS = 3;
const DEFAULT_POLL_INTERVAL_MS = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fromAck(requestId: string, ack: TasteAck): SubmissionPhase {
  if (ack.stage === "persisted") return { phase: "persisted", requestId, ack };
  if (ack.stage === "failed") {
    return {
      phase: "failed",
      requestId,
      errors: [ack.error ?? "the host reported failure"],
      canRetry: true,
    };
  }
  return { phase: "accepted", requestId };
}

/**
 * Run one submission attempt to a terminal phase, reporting intermediate
 * phases through `onPhase`. Retrying re-invokes this with the SAME request
 * id; the route's journal makes that idempotent.
 */
export async function runSubmission(
  submission: TasteSubmission,
  deps: SubmissionDeps,
  onPhase: (phase: SubmissionPhase) => void,
): Promise<SubmissionPhase> {
  const requestId = submission.requestId;
  const delay = deps.delay ?? sleep;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollAttempts = deps.pollAttempts ?? DEFAULT_POLL_ATTEMPTS;
  const pollIntervalMs = deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  const finish = (phase: SubmissionPhase): SubmissionPhase => {
    onPhase(phase);
    return phase;
  };

  onPhase({ phase: "sending", requestId });

  const outcome = await Promise.race([
    deps.submit(submission),
    delay(timeoutMs).then((): SubmitOutcome => ({
      kind: "transport-error",
      message: "the host did not respond in time",
    })),
  ]);

  if (outcome.kind === "unavailable") {
    return finish({ phase: "unavailable" });
  }
  if (outcome.kind === "rejected") {
    // Validation (400) needs an edit; a reused id (409) needs a new attempt.
    return finish({ phase: "failed", requestId, errors: outcome.errors, canRetry: false });
  }
  if (outcome.kind === "ack") {
    const phase = fromAck(requestId, outcome.ack);
    if (phase.phase !== "accepted") return finish(phase);
    onPhase(phase);
    // fall through to polling
  } else {
    // Transport error or timeout: the journal may or may not have the
    // request; the status poll disambiguates.
    onPhase({ phase: "accepted", requestId });
  }

  for (let attempt = 0; attempt < pollAttempts; attempt++) {
    await delay(pollIntervalMs);
    const status = await deps.fetchStatus(requestId);
    if (status.kind === "ack") {
      const phase = fromAck(requestId, status.ack);
      if (phase.phase !== "accepted") return finish(phase);
    } else if (status.kind === "rejected" && status.status === 404) {
      return finish({
        phase: "failed",
        requestId,
        errors: ["the submission never reached the host — check the connection and retry"],
        canRetry: true,
      });
    } else if (status.kind === "unavailable") {
      return finish({ phase: "unavailable" });
    }
    // transport errors during polling: keep trying until attempts run out
  }

  return finish({
    phase: "failed",
    requestId,
    errors: [
      "the host accepted the request but durable persistence is not confirmed yet — retry to check again",
    ],
    canRetry: true,
  });
}
