/**
 * The client acknowledgment state machine: every failure mode of the bridge
 * round-trip, exercised with injected deps — no DOM, no host.
 */

import { describe, expect, test } from "bun:test";

import { dimensionById } from "../apps/taste/src/data";
import { buildSubmission } from "../apps/taste/src/payload";
import { runSubmission, type SubmissionPhase } from "../apps/taste/src/submission";
import type { SubmitOutcome, TasteAck } from "../apps/taste/src/vellum";

function submission() {
  const writing = dimensionById("writing");
  const built = buildSubmission(
    "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    writing,
    { hedging: writing.pairs[0].a },
    "",
    [],
    false,
  );
  if (!built.submission) throw new Error("failed to build");
  return built.submission;
}

function ackOf(stage: TasteAck["stage"], error?: string): TasteAck {
  return {
    requestId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    stage,
    dimension: "writing",
    page: "taste-writing",
    statements: ["For writing work, prefers states findings flatly, without hedging."],
    ...(error ? { error } : {}),
  };
}

const instantDelay = () => Promise.resolve();

async function run(
  submit: () => Promise<SubmitOutcome>,
  fetchStatus: (id: string) => Promise<SubmitOutcome> = async () => ({
    kind: "transport-error",
    message: "no status",
  }),
): Promise<{ final: SubmissionPhase; phases: SubmissionPhase[] }> {
  const phases: SubmissionPhase[] = [];
  const final = await runSubmission(
    submission(),
    { submit, fetchStatus, delay: instantDelay, timeoutMs: 10, pollAttempts: 2, pollIntervalMs: 1 },
    (phase) => phases.push(phase),
  );
  return { final, phases };
}

describe("terminal outcomes", () => {
  test("bridge unavailable: no success state, terminal 'unavailable'", async () => {
    const { final, phases } = await run(async () => ({ kind: "unavailable" }));
    expect(final.phase).toBe("unavailable");
    expect(phases.some((p) => p.phase === "persisted")).toBe(false);
  });

  test("verified success acknowledgment ends persisted", async () => {
    const { final } = await run(async () => ({ kind: "ack", ack: ackOf("persisted") }));
    expect(final.phase).toBe("persisted");
  });

  test("host rejection (validation) fails without retry, with the reasons", async () => {
    const { final } = await run(async () => ({
      kind: "rejected",
      status: 400,
      errors: ["dimension must be one of: writing, music, visual, building"],
    }));
    expect(final.phase).toBe("failed");
    if (final.phase === "failed") {
      expect(final.canRetry).toBe(false);
      expect(final.errors[0]).toContain("dimension");
    }
  });

  test("a failed acknowledgment (memory mutation / verification failure) fails with retry", async () => {
    const { final } = await run(async () => ({
      kind: "ack",
      ack: ackOf("failed", "the canonical page is missing 1 of 1 derived statements"),
    }));
    expect(final.phase).toBe("failed");
    if (final.phase === "failed") {
      expect(final.canRetry).toBe(true);
      expect(final.errors[0]).toContain("missing");
    }
  });

  test("a natural-language reply is never an acknowledgment: malformed ack polls, then fails honestly", async () => {
    const { final } = await run(
      async () => ({ kind: "transport-error", message: "malformed acknowledgment (status 200)" }),
      async () => ({ kind: "transport-error", message: "still malformed" }),
    );
    expect(final.phase).toBe("failed");
    if (final.phase === "failed") {
      expect(final.canRetry).toBe(true);
      expect(final.errors[0]).toContain("not confirmed");
    }
  });
});

describe("timeout and polling", () => {
  test("timeout then a persisted status poll ends persisted", async () => {
    const never = () => new Promise<SubmitOutcome>(() => undefined);
    const { final, phases } = await run(never, async () => ({
      kind: "ack",
      ack: ackOf("persisted"),
    }));
    expect(phases.some((p) => p.phase === "accepted")).toBe(true);
    expect(final.phase).toBe("persisted");
  });

  test("timeout with an unknown requestId means the host never got it — retryable failure", async () => {
    const never = () => new Promise<SubmitOutcome>(() => undefined);
    const { final } = await run(never, async () => ({
      kind: "rejected",
      status: 404,
      errors: ["unknown requestId"],
    }));
    expect(final.phase).toBe("failed");
    if (final.phase === "failed") {
      expect(final.canRetry).toBe(true);
      expect(final.errors[0]).toContain("never reached");
    }
  });

  test("polls that keep reporting accepted exhaust into a retryable, honest failure", async () => {
    const { final } = await run(
      async () => ({ kind: "ack", ack: ackOf("accepted") }),
      async () => ({ kind: "ack", ack: ackOf("accepted") }),
    );
    expect(final.phase).toBe("failed");
    if (final.phase === "failed") {
      expect(final.errors[0]).toContain("not confirmed");
      expect(final.canRetry).toBe(true);
    }
  });

  test("retry reuses the same request id", async () => {
    const seen: string[] = [];
    const submit = async (): Promise<SubmitOutcome> => ({ kind: "ack", ack: ackOf("persisted") });
    const first = submission();
    const second = submission();
    expect(first.requestId).toBe(second.requestId);
    await runSubmission(first, { submit: async (s) => (seen.push(s.requestId), submit()), fetchStatus: async () => ({ kind: "unavailable" }) }, () => undefined);
    await runSubmission(second, { submit: async (s) => (seen.push(s.requestId), submit()), fetchStatus: async () => ({ kind: "unavailable" }) }, () => undefined);
    expect(new Set(seen).size).toBe(1);
  });
});
