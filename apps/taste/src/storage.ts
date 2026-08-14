/**
 * Attune-namespaced local completion metadata.
 *
 * This stores ONLY completion metadata — which dimensions were run, how many
 * questions were answered, and when a submission was verified persisted.
 * Never samples, list items, URLs, derived profile text, or prompts.
 *
 * Inside Vellum the sandboxed iframe substitutes an in-memory localStorage
 * shim, so this cache lasts one mount there; the durable record is the
 * plugin journal read over the route. In a plain browser (dev preview) real
 * localStorage applies, including cross-tab `storage` events.
 *
 * Versioning policy: v2 is the first Attune-namespaced schema. The
 * predecessor key `vellum.taste.completed.v1` (a bare Record<string,number>)
 * is migrated once — valid counts for known dimensions carry over, then the
 * legacy key is deleted. Any unreadable, wrong-shaped, or future-versioned
 * value resets to empty rather than guessing: malformed storage must never
 * crash startup or falsely mark a dimension complete.
 */

import { DIMENSIONS, type DimensionId } from "./data";

export const STORAGE_KEY = "attune.completed.v2";
export const LEGACY_KEY = "vellum.taste.completed.v1";
const SCHEMA_VERSION = 2;

export interface DimensionCompletion {
  /** Questions answered in the last run (bounded by the pair count). */
  answered: number;
  /** Set only after a verified persisted acknowledgment. */
  persistedAt?: string;
}

export type CompletionState = Partial<Record<DimensionId, DimensionCompletion>>;

interface StoredShape {
  version: number;
  dimensions: CompletionState;
}

const PAIR_COUNT: Record<string, number> = Object.fromEntries(
  DIMENSIONS.map((dimension) => [dimension.id, dimension.pairs.length]),
);

function isDimensionId(value: string): value is DimensionId {
  return value in PAIR_COUNT;
}

function validCount(value: unknown, dimensionId: string): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < 0 || value > PAIR_COUNT[dimensionId]) return null;
  return value;
}

function sanitize(value: unknown): CompletionState | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.version !== SCHEMA_VERSION) return null;
  if (typeof raw.dimensions !== "object" || raw.dimensions === null || Array.isArray(raw.dimensions)) {
    return null;
  }
  const state: CompletionState = {};
  for (const [key, entry] of Object.entries(raw.dimensions as Record<string, unknown>)) {
    if (!isDimensionId(key)) continue; // unknown dimensions are dropped, not kept
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const answered = validCount(record.answered, key);
    if (answered === null) continue;
    state[key] = {
      answered,
      ...(typeof record.persistedAt === "string" ? { persistedAt: record.persistedAt } : {}),
    };
  }
  return state;
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function migrateLegacy(store: Storage): CompletionState {
  let migrated: CompletionState = {};
  try {
    const raw = store.getItem(LEGACY_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
          if (!isDimensionId(key)) continue;
          const answered = validCount(value, key);
          if (answered !== null && answered > 0) {
            migrated[key] = { answered };
          }
        }
      }
    }
  } catch {
    migrated = {};
  }
  try {
    store.removeItem(LEGACY_KEY);
  } catch {
    // Removal is best-effort; a surviving legacy key is ignored next read.
  }
  return migrated;
}

export function readCompletion(): CompletionState {
  const store = storage();
  if (!store) return {};
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (raw !== null) {
      const state = sanitize(JSON.parse(raw));
      if (state !== null) return state;
      // Wrong shape or version: reset rather than trust it.
      store.removeItem(STORAGE_KEY);
      return {};
    }
  } catch {
    try {
      store.removeItem(STORAGE_KEY);
    } catch {
      // Unreadable and unremovable — treat as empty.
    }
    return {};
  }
  // First read of the new key: migrate the predecessor once.
  const migrated = migrateLegacy(store);
  writeCompletion(migrated);
  return migrated;
}

export function writeCompletion(state: CompletionState): void {
  const store = storage();
  if (!store) return;
  try {
    const shape: StoredShape = { version: SCHEMA_VERSION, dimensions: state };
    store.setItem(STORAGE_KEY, JSON.stringify(shape));
  } catch {
    // Losing the courtesy cache is survivable.
  }
  notifySameTab();
}

export function markAnswered(dimensionId: DimensionId, answered: number): void {
  const state = readCompletion();
  const bounded = Math.max(0, Math.min(answered, PAIR_COUNT[dimensionId]));
  state[dimensionId] = { ...state[dimensionId], answered: bounded };
  writeCompletion(state);
}

/** Record verified persistence — call only on a persisted acknowledgment. */
export function markPersisted(dimensionId: DimensionId, verifiedAt: string): void {
  const state = readCompletion();
  state[dimensionId] = {
    answered: state[dimensionId]?.answered ?? 0,
    persistedAt: verifiedAt,
  };
  writeCompletion(state);
}

// ── Change notification ────────────────────────────────────────────────────
// Same-tab writes dispatch a custom event (the `storage` event only fires in
// OTHER tabs); cross-tab updates arrive via the native `storage` event where
// real localStorage exists (plain-browser preview).

const CHANGE_EVENT = "attune:completion-changed";

function notifySameTab(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    // Event delivery is a refresh nicety, never load-bearing.
  }
}

/** Listen for completion changes from this tab and (where possible) others. */
export function onCompletionChange(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === STORAGE_KEY || event.key === LEGACY_KEY) {
      listener();
    }
  };
  const onLocal = () => listener();
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onLocal);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onLocal);
  };
}
