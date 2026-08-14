/**
 * Post-turn verification: the acknowledgment gate.
 *
 * The route acks "persisted" only when the canonical page on disk actually
 * contains every derived statement, and no other taste page changed during
 * the turn. Reading the page is observation of durable state, not mutation —
 * the write itself is performed by the assistant turn through the host's
 * production page-maintenance path (its file tools, the same mechanism the
 * memory consolidator uses on concept pages).
 */

import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { PAGE_BY_DIMENSION } from "../apps/taste/src/payload";

export const ALL_TASTE_PAGES: readonly string[] = Object.values(PAGE_BY_DIMENSION);

export function conceptPagePath(workspaceDir: string, page: string): string {
  return join(workspaceDir, "memory", "concepts", `${page}.md`);
}

/** Collapse whitespace and case so formatting differences don't fail honest writes. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export interface PageVerification {
  persisted: boolean;
  /** Statements the page does not contain, when not persisted. */
  missing: string[];
  /** True when the page file itself is absent. */
  pageMissing: boolean;
}

/** Check the canonical page durably contains every derived statement. */
export async function verifyPageContains(
  workspaceDir: string,
  page: string,
  statements: string[],
): Promise<PageVerification> {
  let content: string;
  try {
    content = await readFile(conceptPagePath(workspaceDir, page), "utf8");
  } catch {
    return { persisted: false, missing: [...statements], pageMissing: true };
  }
  const haystack = normalize(content);
  const missing = statements.filter(
    (statement) => !haystack.includes(normalize(statement)),
  );
  return { persisted: missing.length === 0, missing, pageMissing: false };
}

export type PageSnapshot = Record<string, string | null>;

/** Content hash per taste page (null = absent), for cross-dimension checks. */
export async function snapshotTastePages(
  workspaceDir: string,
  except: string,
): Promise<PageSnapshot> {
  const snapshot: PageSnapshot = {};
  for (const page of ALL_TASTE_PAGES) {
    if (page === except) continue;
    try {
      const content = await readFile(conceptPagePath(workspaceDir, page), "utf8");
      snapshot[page] = createHash("sha256").update(content).digest("hex");
    } catch {
      snapshot[page] = null;
    }
  }
  return snapshot;
}

/** Pages (other than the target) whose content changed since the snapshot. */
export async function changedTastePages(
  workspaceDir: string,
  before: PageSnapshot,
): Promise<string[]> {
  const changed: string[] = [];
  for (const [page, hash] of Object.entries(before)) {
    let current: string | null = null;
    try {
      const content = await readFile(conceptPagePath(workspaceDir, page), "utf8");
      current = createHash("sha256").update(content).digest("hex");
    } catch {
      current = null;
    }
    if (current !== hash) changed.push(page);
  }
  return changed;
}

/** Best-effort existence check used by the GET status path. */
export async function pageExists(workspaceDir: string, page: string): Promise<boolean> {
  try {
    await stat(conceptPagePath(workspaceDir, page));
    return true;
  } catch {
    return false;
  }
}
