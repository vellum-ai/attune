/**
 * The host bridge, wrapped.
 *
 * Every call no-ops or reports unavailability when the app is opened outside
 * Vellum (a plain browser tab during development); nothing throws at import
 * time. Outside the host the app stays explorable, but nothing can be
 * submitted and nothing reports success — the bridge being missing is a
 * visible state, never a silent pass.
 *
 * Note on persistence of app-local state: inside Vellum the sandboxed iframe
 * gets an in-memory `localStorage` shim, so anything "stored" there lasts
 * only for the mount. Durable completion state lives server-side in the
 * plugin journal and is read back over the route; local storage is only a
 * courtesy cache for the plain-browser preview.
 */

import type { TasteSubmission } from "./payload";

interface VellumResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

interface VellumBridge {
  sendAction?(actionId: string, data: Record<string, unknown>): void;
  fetch?(
    path: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string },
  ): Promise<VellumResponseLike>;
  subscribe?(
    options: { tags: string[] },
    callback: (payload: unknown) => void,
  ): (() => void) | void;
}

const bridge = (): VellumBridge | undefined =>
  typeof window === "undefined"
    ? undefined
    : ((window as unknown as { vellum?: VellumBridge }).vellum);

/** Whether the Vellum host bridge is reachable at all. */
export function hostAvailable(): boolean {
  return typeof bridge()?.sendAction === "function";
}

/** Whether the typed route path (bridge fetch) is available. */
export function routeAvailable(): boolean {
  return typeof bridge()?.fetch === "function";
}

/** Send a message into the conversation as though the user typed it. */
export function relayPrompt(prompt: string): void {
  bridge()?.sendAction?.("relay_prompt", { prompt });
}

/** Put the app and the chat side by side. */
export function showSplit(): void {
  bridge()?.sendAction?.("set_view", { view: "split" });
}

// ── Typed route access ─────────────────────────────────────────────────────
//
// Plugin routes are served under `/v1/x/plugins/<install-dir>/…`, and the
// install directory name is not exposed to the sandboxed app, so the client
// probes the known install names once and caches the winner. The predecessor
// install ("taste") is disabled in production and its routes 404, so the
// probe settles on "attune" there; the fallback keeps dev installs working.

const CANDIDATE_PLUGIN_DIRS = ["attune", "taste"] as const;

let resolvedBase: string | null = null;

async function routeBase(): Promise<string | null> {
  const hostFetch = bridge()?.fetch;
  if (!hostFetch) return null;
  if (resolvedBase) return resolvedBase;
  for (const dir of CANDIDATE_PLUGIN_DIRS) {
    const base = `/v1/x/plugins/${dir}/taste`;
    try {
      const response = await hostFetch(base);
      if (response.ok) {
        resolvedBase = base;
        return base;
      }
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

/** The typed acknowledgment the route returns. */
export interface TasteAck {
  requestId: string;
  stage: "accepted" | "persisted" | "failed";
  dimension: string;
  page: string;
  statements: string[];
  conversationId?: string;
  error?: string;
  verifiedAt?: string;
}

export type SubmitOutcome =
  | { kind: "ack"; ack: TasteAck }
  | { kind: "rejected"; status: number; errors: string[] }
  | { kind: "unavailable" }
  | { kind: "transport-error"; message: string };

function isAck(value: unknown): value is TasteAck {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.requestId === "string" &&
    (record.stage === "accepted" || record.stage === "persisted" || record.stage === "failed") &&
    typeof record.page === "string" &&
    Array.isArray(record.statements)
  );
}

async function parseErrors(response: VellumResponseLike): Promise<string[]> {
  try {
    const body = (await response.json()) as { error?: unknown; details?: unknown };
    const errors: string[] = [];
    if (typeof body.error === "string") errors.push(body.error);
    if (Array.isArray(body.details)) {
      errors.push(...body.details.filter((d): d is string => typeof d === "string"));
    }
    return errors.length > 0 ? errors : [`request failed (${response.status})`];
  } catch {
    return [`request failed (${response.status})`];
  }
}

/** POST the submission and return the machine acknowledgment. */
export async function submitTaste(submission: TasteSubmission): Promise<SubmitOutcome> {
  const hostFetch = bridge()?.fetch;
  const base = await routeBase();
  if (!hostFetch || !base) return { kind: "unavailable" };

  try {
    const response = await hostFetch(base, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(submission),
    });
    if (response.status === 400 || response.status === 409) {
      return { kind: "rejected", status: response.status, errors: await parseErrors(response) };
    }
    const payload = await response.json().catch(() => null);
    if (isAck(payload)) return { kind: "ack", ack: payload };
    return {
      kind: "transport-error",
      message: `malformed acknowledgment (status ${response.status})`,
    };
  } catch (error) {
    return {
      kind: "transport-error",
      message: error instanceof Error ? error.message : "request failed",
    };
  }
}

/** Poll one request's journal status (used after a client-side timeout). */
export async function fetchTasteStatus(requestId: string): Promise<SubmitOutcome> {
  const hostFetch = bridge()?.fetch;
  const base = await routeBase();
  if (!hostFetch || !base) return { kind: "unavailable" };
  try {
    const response = await hostFetch(`${base}?requestId=${encodeURIComponent(requestId)}`);
    if (!response.ok) {
      return { kind: "rejected", status: response.status, errors: await parseErrors(response) };
    }
    const payload = await response.json().catch(() => null);
    if (isAck(payload)) return { kind: "ack", ack: payload };
    return { kind: "transport-error", message: "malformed status response" };
  } catch (error) {
    return {
      kind: "transport-error",
      message: error instanceof Error ? error.message : "request failed",
    };
  }
}

/** Server-side completion metadata per dimension (the durable record). */
export async function fetchCompletion(): Promise<Record<
  string,
  { persistedAt: string; statements: number }
> | null> {
  const hostFetch = bridge()?.fetch;
  const base = await routeBase();
  if (!hostFetch || !base) return null;
  try {
    const response = await hostFetch(base);
    if (!response.ok) return null;
    const payload = (await response.json()) as { completion?: unknown };
    if (typeof payload === "object" && payload !== null && typeof payload.completion === "object" && payload.completion !== null) {
      return payload.completion as Record<string, { persistedAt: string; statements: number }>;
    }
    return null;
  } catch {
    return null;
  }
}

/** Re-fetch on the plugin's own sync tag. Returns an unsubscribe. */
export function subscribeTasteChanges(onChange: () => void): () => void {
  const subscription = bridge()?.subscribe;
  if (!subscription) return () => undefined;
  const unsubscribe = subscription({ tags: ["attune:taste"] }, () => onChange());
  return typeof unsubscribe === "function" ? unsubscribe : () => undefined;
}
