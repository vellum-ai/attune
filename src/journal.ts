/**
 * Durable, idempotent journal for onboarding submissions.
 *
 * Lives in the plugin's own storage (`<workspace>/plugins-data/attune/`),
 * which is runtime-owned state the host preserves across upgrades. The
 * journal is what makes the acknowledgment machine honest:
 *
 * - a submission is journaled `accepted` BEFORE the persistence turn runs,
 * - it becomes `persisted` only after the route verifies the canonical page
 *   on disk actually contains the derived statements,
 * - retries with the same request id are answered from the journal instead
 *   of re-running side effects (same payload hash) or rejected (different
 *   payload under a reused id).
 *
 * The journal stores completion metadata and derived statements only — never
 * samples, list items, URLs, or prompts.
 */

import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";

export type SubmissionStatus = "accepted" | "persisted" | "failed";

export interface JournalEntry {
  requestId: string;
  dimension: string;
  page: string;
  /** Derived preference statements this submission asked to persist. */
  statements: string[];
  /** Hash of the validated payload, for idempotency conflict detection. */
  payloadHash: string;
  status: SubmissionStatus;
  error?: string;
  conversationId?: string;
  receivedAt: string;
  updatedAt: string;
  verifiedAt?: string;
}

export interface Journal {
  schemaVersion: 1;
  entries: Record<string, JournalEntry>;
}

const MAX_ENTRIES = 200;
const LOCK_TIMEOUT_MS = 5_000;

function journalDir(workspaceDir: string): string {
  return join(workspaceDir, "plugins-data", "attune");
}
function journalFile(workspaceDir: string): string {
  return join(journalDir(workspaceDir), "journal.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeEntry(value: unknown): JournalEntry | null {
  if (!isRecord(value)) return null;
  const status = value.status;
  if (status !== "accepted" && status !== "persisted" && status !== "failed") return null;
  if (typeof value.requestId !== "string" || typeof value.dimension !== "string") return null;
  if (typeof value.page !== "string" || typeof value.payloadHash !== "string") return null;
  if (!Array.isArray(value.statements) || !value.statements.every((s) => typeof s === "string")) return null;
  return {
    requestId: value.requestId,
    dimension: value.dimension,
    page: value.page,
    statements: value.statements as string[],
    payloadHash: value.payloadHash,
    status,
    ...(typeof value.error === "string" ? { error: value.error } : {}),
    ...(typeof value.conversationId === "string" ? { conversationId: value.conversationId } : {}),
    receivedAt: typeof value.receivedAt === "string" ? value.receivedAt : new Date(0).toISOString(),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date(0).toISOString(),
    ...(typeof value.verifiedAt === "string" ? { verifiedAt: value.verifiedAt } : {}),
  };
}

function normalizeJournal(value: unknown): Journal {
  const journal: Journal = { schemaVersion: 1, entries: {} };
  if (!isRecord(value) || !isRecord(value.entries)) return journal;
  for (const [key, raw] of Object.entries(value.entries)) {
    const entry = normalizeEntry(raw);
    if (entry && entry.requestId === key) journal.entries[key] = entry;
  }
  return journal;
}

async function acquireLock(workspaceDir: string): Promise<() => Promise<void>> {
  await mkdir(journalDir(workspaceDir), { recursive: true });
  const path = `${journalFile(workspaceDir)}.lock`;
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const handle = await open(path, "wx");
      await handle.writeFile(String(process.pid));
      await handle.close();
      return async () => {
        await unlink(path).catch(() => undefined);
      };
    } catch (error) {
      if (!isRecord(error) || error.code !== "EEXIST") throw error;
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  }
  throw new Error("attune journal: lock timeout");
}

async function readUnlocked(workspaceDir: string): Promise<Journal> {
  try {
    return normalizeJournal(JSON.parse(await readFile(journalFile(workspaceDir), "utf8")));
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") {
      return { schemaVersion: 1, entries: {} };
    }
    // Corrupt journal: fail closed into an empty journal rather than
    // crashing the route. Idempotency degrades (a retried request re-runs),
    // which is safe because the persistence turn itself merges rather than
    // appends blindly.
    return { schemaVersion: 1, entries: {} };
  }
}

async function writeUnlocked(workspaceDir: string, journal: Journal): Promise<void> {
  // Prune oldest entries beyond the cap so the journal cannot grow unbounded.
  const entries = Object.values(journal.entries)
    .sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1))
    .slice(0, MAX_ENTRIES);
  const pruned: Journal = {
    schemaVersion: 1,
    entries: Object.fromEntries(entries.map((entry) => [entry.requestId, entry])),
  };
  const file = journalFile(workspaceDir);
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  const handle = await open(temporary, "w");
  try {
    await handle.writeFile(`${JSON.stringify(pruned, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, file);
}

export async function readJournal(workspaceDir: string): Promise<Journal> {
  const release = await acquireLock(workspaceDir);
  try {
    return await readUnlocked(workspaceDir);
  } finally {
    await release();
  }
}

/** Read-modify-write one entry under the journal lock. */
export async function upsertEntry(
  workspaceDir: string,
  requestId: string,
  mutate: (existing: JournalEntry | undefined) => JournalEntry,
): Promise<JournalEntry> {
  const release = await acquireLock(workspaceDir);
  try {
    const journal = await readUnlocked(workspaceDir);
    const next = mutate(journal.entries[requestId]);
    next.updatedAt = new Date().toISOString();
    journal.entries[requestId] = next;
    await writeUnlocked(workspaceDir, journal);
    return next;
  } finally {
    await release();
  }
}

/** Per-dimension completion metadata derived from persisted entries. */
export function completionSummary(journal: Journal): Record<
  string,
  { persistedAt: string; statements: number }
> {
  const summary: Record<string, { persistedAt: string; statements: number }> = {};
  for (const entry of Object.values(journal.entries)) {
    if (entry.status !== "persisted") continue;
    const existing = summary[entry.dimension];
    if (!existing || existing.persistedAt < entry.updatedAt) {
      summary[entry.dimension] = {
        persistedAt: entry.updatedAt,
        statements: entry.statements.length,
      };
    }
  }
  return summary;
}
