/**
 * The host bridge, wrapped. Every call no-ops when the app is opened outside
 * Vellum (a plain browser tab during development) and nothing throws.
 */

export type Confidence = "low" | "growing" | "established";

export interface ProfileAxis {
  id: string;
  label: string;
  leftLabel: string;
  rightLabel: string;
  leftWeight?: number;
  rightWeight?: number;
  learnedPosition?: number | null;
  overridePosition?: number | null;
  overrideUpdatedAt?: string | null;
  confidence?: Confidence;
  evidenceCount?: number;
  updatedAt?: string;
  lastReason?: string;
}

export interface ProfileDimension {
  id: string;
  label?: string;
  baselineComplete: boolean;
  axes: ProfileAxis[];
}

export interface TasteProfile {
  schemaVersion: number;
  revision: number;
  dimensions: ProfileDimension[];
}

interface VellumResponseLike {
  ok?: boolean;
  status?: number;
  json?: () => Promise<unknown>;
}

interface SubscribeOptions {
  tags: string[];
}

interface VellumBridge {
  sendAction?(actionId: string, data: Record<string, unknown>): void;
  fetch?(path: string, init?: { method?: string; headers?: Record<string, string>; body?: string }): Promise<unknown>;
  subscribe?(options: SubscribeOptions, callback: (payload: unknown) => void): (() => void) | void;
}

const bridge = (): VellumBridge | undefined =>
  typeof window === "undefined" ? undefined : (window.vellum as unknown as VellumBridge | undefined);

export function hostAvailable(): boolean {
  return typeof bridge()?.sendAction === "function";
}

export function relayPrompt(prompt: string): void {
  bridge()?.sendAction?.("relay_prompt", { prompt });
}

export function showSplit(): void {
  bridge()?.sendAction?.("set_view", { view: "split" });
}

const KEY = "vellum.taste.completed.v1";

export function readCompleted(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export function markCompleted(dimensionId: string, answered: number): void {
  try {
    const completed = readCompleted();
    const next = { ...completed, [dimensionId]: Math.max(completed[dimensionId] ?? 0, answered) };
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Local progress is helpful, but never worth failing the hand-off.
  }
}

function normalizePayload(payload: unknown): unknown {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as { data?: unknown }).data ?? payload;
  }
  return payload;
}

async function responsePayload(response: unknown): Promise<unknown> {
  if (response && typeof response === "object" && typeof (response as VellumResponseLike).json === "function") {
    return (response as VellumResponseLike).json!();
  }
  return response;
}

function normalizeDimensions(value: unknown): ProfileDimension[] {
  if (Array.isArray(value)) return value as ProfileDimension[];
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, Omit<ProfileDimension, "id"> & { id?: string }>).map(([id, dimension]) => ({
      ...dimension,
      id: dimension.id ?? id,
    }));
  }
  return [];
}

function normalizeProfile(payload: unknown): TasteProfile | null {
  const value = normalizePayload(payload) as Partial<TasteProfile> | null | undefined;
  if (!value || typeof value !== "object") return null;
  return {
    schemaVersion: Number(value.schemaVersion ?? 1),
    revision: Number(value.revision ?? 0),
    dimensions: normalizeDimensions(value.dimensions),
  };
}

export async function fetchTasteProfile(): Promise<TasteProfile | null> {
  const hostFetch = bridge()?.fetch;
  // Plugin apps do not reach around the host bridge. Outside Vellum, the empty
  // profile is the useful dev fallback and keeps the app renderable.
  if (!hostFetch) return null;

  try {
    const response = await hostFetch("/x/plugins/taste/profile");
    if (response && typeof response === "object" && "ok" in response && !(response as VellumResponseLike).ok) {
      if ((response as VellumResponseLike).status === 404) return null;
      throw new Error(`Profile request failed (${(response as VellumResponseLike).status ?? "unknown"})`);
    }
    return normalizeProfile(await responsePayload(response));
  } catch (error) {
    throw error instanceof Error ? error : new Error("Could not load taste profile");
  }
}

export function subscribeTasteProfile(onProfile: (profile: TasteProfile | null) => void): () => void {
  const subscription = bridge()?.subscribe;
  if (!subscription) return () => undefined;

  const unsubscribe = subscription({ tags: ["taste:profile"] }, () => {
    // The event is an invalidation tag, not the profile payload. Re-read the
    // canonical state so revisions and object-shaped dimensions stay correct.
    void fetchTasteProfile().then(onProfile).catch(() => undefined);
  });
  return typeof unsubscribe === "function" ? unsubscribe : () => undefined;
}

export interface ProfileActionResult {
  ok: boolean;
  fallback?: boolean;
  error?: string;
}

export async function postTasteProfileAction(body: Record<string, unknown>): Promise<ProfileActionResult> {
  const hostFetch = bridge()?.fetch;
  if (!hostFetch) return { ok: true, fallback: true };

  try {
    const response = await hostFetch("/x/plugins/taste/profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response && typeof response === "object" && "ok" in response && !(response as VellumResponseLike).ok) {
      const status = (response as VellumResponseLike).status ?? "unknown";
      return { ok: false, error: `Profile update failed (${status})` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Profile update failed" };
  }
}

export function setBaseline(dimensionId: string, answers: Array<{ axisId: string; label: string; leftLabel: string; rightLabel: string; side: "left" | "right" }>): Promise<ProfileActionResult> {
  return postTasteProfileAction({ action: "set_baseline", dimensionId, answers });
}

export function setOverride(dimensionId: string, axisId: string, position: number | null): Promise<ProfileActionResult> {
  return postTasteProfileAction({ action: "set_override", dimensionId, axisId, position });
}
