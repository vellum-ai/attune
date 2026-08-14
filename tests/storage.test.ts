/**
 * Local completion storage: namespaced key, runtime validation, legacy
 * migration, and recovery from every malformed shape — none of which may
 * crash startup or falsely mark a dimension complete.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

// Minimal window/localStorage shim so the module under test runs headlessly.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

type Listener = (event: unknown) => void;
const listeners = new Map<string, Set<Listener>>();

const windowShim = {
  localStorage: new MemoryStorage(),
  addEventListener(type: string, listener: Listener) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type)!.add(listener);
  },
  removeEventListener(type: string, listener: Listener) {
    listeners.get(type)?.delete(listener);
  },
  dispatchEvent(event: { type: string }) {
    for (const listener of listeners.get(event.type) ?? []) listener(event);
    return true;
  },
};

(globalThis as Record<string, unknown>).window = windowShim;
(globalThis as Record<string, unknown>).CustomEvent = class {
  type: string;
  constructor(type: string) {
    this.type = type;
  }
};

const {
  LEGACY_KEY,
  STORAGE_KEY,
  markAnswered,
  markPersisted,
  onCompletionChange,
  readCompletion,
} = await import("../apps/taste/src/storage");

beforeEach(() => {
  windowShim.localStorage.clear();
  listeners.clear();
});

afterEach(() => {
  windowShim.localStorage.clear();
});

describe("validation and recovery", () => {
  const malformed: Array<[string, string]> = [
    ["corrupt JSON", "{nope"],
    ["null", "null"],
    ["array", "[1,2,3]"],
    ["wrong value types", JSON.stringify({ version: 2, dimensions: { writing: "five" } })],
    ["stale version", JSON.stringify({ version: 1, dimensions: { writing: { answered: 3 } } })],
    ["future version", JSON.stringify({ version: 99, dimensions: { writing: { answered: 3 } } })],
  ];

  for (const [label, raw] of malformed) {
    test(`${label} never crashes and never marks anything complete`, () => {
      windowShim.localStorage.setItem(STORAGE_KEY, raw);
      const state = readCompletion();
      expect(state).toEqual({});
    });
  }

  test("unknown dimensions are dropped, negative and impossible counts rejected", () => {
    windowShim.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 2,
        dimensions: {
          writing: { answered: 3 },
          building: { answered: 4 }, // unknown dimension (retired)
          music: { answered: -1 }, // negative
          "web-design": { answered: 400 }, // impossible count
          "interior-design": { answered: 2.5 }, // non-integer
        },
      }),
    );
    const state = readCompletion();
    expect(state).toEqual({ writing: { answered: 3 } });
  });
});

describe("legacy migration", () => {
  test("valid predecessor counts migrate once and the legacy key is deleted", () => {
    windowShim.localStorage.setItem(
      LEGACY_KEY,
      JSON.stringify({ writing: 4, music: 2, building: 9, "interior-design": -2 }),
    );
    const state = readCompletion();
    expect(state.writing).toEqual({ answered: 4 });
    expect(state.music).toEqual({ answered: 2 });
    expect(state["interior-design"]).toBeUndefined();
    expect(windowShim.localStorage.getItem(LEGACY_KEY)).toBeNull();
    expect(windowShim.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  test("corrupt legacy data resets to empty", () => {
    windowShim.localStorage.setItem(LEGACY_KEY, "][");
    expect(readCompletion()).toEqual({});
    expect(windowShim.localStorage.getItem(LEGACY_KEY)).toBeNull();
  });
});

describe("writes and change notification", () => {
  test("markAnswered bounds counts and markPersisted records verification only", () => {
    markAnswered("writing", 999);
    let state = readCompletion();
    expect(state.writing?.answered).toBeLessThanOrEqual(5);
    expect(state.writing?.persistedAt).toBeUndefined();

    markPersisted("writing", "2026-08-13T00:00:00.000Z");
    state = readCompletion();
    expect(state.writing?.persistedAt).toBe("2026-08-13T00:00:00.000Z");
  });

  test("only completion metadata is stored — never evidence or prompts", () => {
    markAnswered("interior-design", 3);
    markPersisted("interior-design", "2026-08-13T00:00:00.000Z");
    const raw = windowShim.localStorage.getItem(STORAGE_KEY)!;
    const parsed = JSON.parse(raw) as { version: number; dimensions: Record<string, unknown> };
    expect(Object.keys(parsed).sort()).toEqual(["dimensions", "version"]);
    for (const entry of Object.values(parsed.dimensions)) {
      expect(Object.keys(entry as object).sort()).toEqual(["answered", "persistedAt"]);
    }
  });

  test("same-tab writes notify listeners", () => {
    let notified = 0;
    const off = onCompletionChange(() => {
      notified += 1;
    });
    markAnswered("music", 1);
    expect(notified).toBeGreaterThan(0);
    off();
  });

  test("cross-tab storage events notify listeners", () => {
    let notified = 0;
    const off = onCompletionChange(() => {
      notified += 1;
    });
    // Simulate another tab writing: browsers deliver a `storage` event.
    for (const listener of listeners.get("storage") ?? []) {
      listener({ type: "storage", key: STORAGE_KEY });
    }
    expect(notified).toBe(1);
    off();
  });
});
