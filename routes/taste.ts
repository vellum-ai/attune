/**
 * The typed taste-intake endpoint: `/x/plugins/<install-dir>/taste`.
 *
 * This is the plugin/host seam the app talks to instead of composing a
 * natural-language relay. The contract, stage by stage:
 *
 * - **accepted** — the submission validated and was durably journaled.
 * - **persisted** — the persistence turn ran AND the route read the derived
 *   statements back from the canonical `memory/concepts/<page>.md`. Only
 *   this stage means durable success; the UI keys completion off it.
 * - **failed** — validation, the turn, or verification failed; the reason is
 *   in the response and the journal, and retrying the same requestId is safe.
 *
 * The durable mutation itself is host-performed: the route drives a
 * non-interactive background conversation turn (`runConversationTurn`, the
 * plugin API's sanctioned way to run the agent loop), in which the assistant
 * merges the derived statements into the canonical page with its production
 * file tools — the same page-maintenance mechanism memory consolidation
 * uses. The route never writes memory files; it only reads them to verify.
 *
 * Idempotency: retries carry the same requestId. A repeat of a persisted
 * request answers from the journal without re-running the turn; a repeat of
 * a failed/accepted request re-verifies and only re-runs the turn when the
 * page still lacks the statements; a reused requestId with a different
 * payload is rejected.
 */

import {
  getWorkspaceDir,
  publishEvent,
  runConversationTurn,
} from "@vellumai/plugin-api";
import { createHash } from "node:crypto";

import { deriveStatements } from "../apps/taste/src/payload";
import { buildTurnPrompt } from "../apps/taste/src/prompt";
import { completionSummary, readJournal, upsertEntry, type JournalEntry } from "../src/journal";
import { validateSubmission } from "../src/validate";
import {
  changedTastePages,
  snapshotTastePages,
  verifyPageContains,
} from "../src/verify";

export const description =
  "Typed Attune taste intake: validate onboarding evidence, drive the persistence turn, verify the canonical page, acknowledge.";

const SYNC_TAG = "attune:taste";

interface AckBody {
  requestId: string;
  stage: "accepted" | "persisted" | "failed";
  dimension: string;
  page: string;
  statements: string[];
  conversationId?: string;
  error?: string;
  verifiedAt?: string;
}

function ack(entry: JournalEntry, status = 200): Response {
  const body: AckBody = {
    requestId: entry.requestId,
    stage: entry.status,
    dimension: entry.dimension,
    page: entry.page,
    statements: entry.statements,
    ...(entry.conversationId ? { conversationId: entry.conversationId } : {}),
    ...(entry.error ? { error: entry.error } : {}),
    ...(entry.verifiedAt ? { verifiedAt: entry.verifiedAt } : {}),
  };
  return Response.json(body, { status });
}

function payloadHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function publishChanged(): Promise<void> {
  await publishEvent({
    id: crypto.randomUUID(),
    emittedAt: new Date().toISOString(),
    message: { type: "sync_changed", tags: [SYNC_TAG] },
  }).catch(() => undefined);
}

/**
 * Re-check an entry against the canonical page and upgrade it to persisted
 * when the statements are now present (covers turns that completed after a
 * client-side timeout).
 */
async function reverify(workspaceDir: string, entry: JournalEntry): Promise<JournalEntry> {
  if (entry.status === "persisted") return entry;
  const verification = await verifyPageContains(workspaceDir, entry.page, entry.statements);
  if (!verification.persisted) return entry;
  const upgraded = await upsertEntry(workspaceDir, entry.requestId, (existing) => ({
    ...(existing ?? entry),
    status: "persisted",
    verifiedAt: new Date().toISOString(),
  }));
  await publishChanged();
  return upgraded;
}

export async function GET(request: Request): Promise<Response> {
  const workspaceDir = getWorkspaceDir();
  const url = new URL(request.url);
  const requestId = url.searchParams.get("requestId");

  const journal = await readJournal(workspaceDir);

  if (requestId) {
    const entry = journal.entries[requestId];
    if (!entry) {
      return Response.json({ error: `unknown requestId ${requestId}` }, { status: 404 });
    }
    return ack(await reverify(workspaceDir, entry));
  }

  return Response.json({
    plugin: "attune",
    completion: completionSummary(journal),
  });
}

export async function POST(request: Request): Promise<Response> {
  const workspaceDir = getWorkspaceDir();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "request body must be JSON" }, { status: 400 });
  }

  const validated = validateSubmission(body);
  if (!validated.ok) {
    return Response.json(
      { error: "invalid submission", details: validated.errors, overflows: validated.overflows ?? [] },
      { status: 400 },
    );
  }

  const { submission, dimension, page } = validated;
  const hash = payloadHash(submission);
  const statements = deriveStatements(dimension, submission.selections);
  if (statements.length === 0) {
    return Response.json(
      { error: "no selections resolved to preference statements" },
      { status: 400 },
    );
  }

  // Idempotency gate.
  const journal = await readJournal(workspaceDir);
  const existing = journal.entries[submission.requestId];
  if (existing) {
    if (existing.payloadHash !== hash) {
      return Response.json(
        { error: `requestId ${submission.requestId} was already used with a different payload` },
        { status: 409 },
      );
    }
    const current = await reverify(workspaceDir, existing);
    if (current.status === "persisted") {
      return ack(current);
    }
    // accepted/failed with the page still lacking statements: fall through
    // and run the turn again — merge semantics keep the retry idempotent.
  }

  const accepted = await upsertEntry(workspaceDir, submission.requestId, (prior) => ({
    requestId: submission.requestId,
    dimension: dimension.id,
    page,
    statements,
    payloadHash: hash,
    status: "accepted",
    receivedAt: prior?.receivedAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));

  // Snapshot the other taste pages so cross-dimension mutation is detected.
  const before = await snapshotTastePages(workspaceDir, page);

  const prompt = buildTurnPrompt({
    page,
    label: dimension.label.toLowerCase(),
    statements,
    submission,
  });

  let conversationId: string | undefined;
  try {
    const turn = await runConversationTurn({
      content: [{ type: "text", text: prompt }],
      conversationType: "background",
    });
    conversationId = turn.conversationId;
    if (turn.queued) {
      // The turn will run when the conversation frees up; the client polls
      // GET ?requestId= and the journal upgrades on verification.
      return ack(accepted, 202);
    }
  } catch (error) {
    const failed = await upsertEntry(workspaceDir, submission.requestId, (prior) => ({
      ...(prior ?? accepted),
      status: "failed",
      error: `persistence turn failed: ${error instanceof Error ? error.message : String(error)}`,
    }));
    return ack(failed, 502);
  }

  const verification = await verifyPageContains(workspaceDir, page, statements);
  const crossDimension = await changedTastePages(workspaceDir, before);

  if (crossDimension.length > 0) {
    const failed = await upsertEntry(workspaceDir, submission.requestId, (prior) => ({
      ...(prior ?? accepted),
      status: "failed",
      conversationId,
      error: `cross-dimension mutation detected: ${crossDimension.join(", ")} changed during the persistence turn`,
    }));
    return ack(failed, 502);
  }

  if (!verification.persisted) {
    const failed = await upsertEntry(workspaceDir, submission.requestId, (prior) => ({
      ...(prior ?? accepted),
      status: "failed",
      conversationId,
      error: verification.pageMissing
        ? `the persistence turn did not create memory/concepts/${page}.md`
        : `the canonical page is missing ${verification.missing.length} of ${statements.length} derived statements`,
    }));
    return ack(failed, 502);
  }

  const persisted = await upsertEntry(workspaceDir, submission.requestId, (prior) => ({
    ...(prior ?? accepted),
    status: "persisted",
    conversationId,
    verifiedAt: new Date().toISOString(),
  }));
  await publishChanged();
  return ack(persisted);
}
