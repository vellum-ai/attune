/**
 * The host bridge, wrapped.
 *
 * Every call no-ops when the app is opened outside Vellum (a plain browser tab
 * during development) and nothing throws. The app has to stay usable there —
 * you can answer every question and read every screen; only the hand-off to the
 * assistant is inert.
 */

interface VellumBridge {
  sendAction?(actionId: string, data: Record<string, unknown>): void;
}

declare global {
  interface Window {
    vellum?: VellumBridge;
  }
}

const bridge = (): VellumBridge | undefined =>
  typeof window === "undefined" ? undefined : window.vellum;

/** Whether the assistant is actually reachable from here. */
export function hostAvailable(): boolean {
  return typeof bridge()?.sendAction === "function";
}

/**
 * Send a message to the assistant as though the user typed it.
 *
 * The prompt must be self-contained: the assistant cannot see this app's state,
 * so everything it needs to act travels in the text.
 */
export function relayPrompt(prompt: string): void {
  bridge()?.sendAction?.("relay_prompt", { prompt });
}

/** Put the app and the chat side by side, so the answer is visible as it lands. */
export function showSplit(): void {
  bridge()?.sendAction?.("set_view", { view: "split" });
}

// ── Local progress ─────────────────────────────────────────────────────────
// What the *app* knows: which dimensions have been run through it. The profile
// itself lives in the assistant's memory, not here — this is only enough to
// stop the home screen claiming everything is unbuilt every time it opens.

const KEY = "vellum.taste.completed.v1";

export function readCompleted(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    // Storage can be unavailable or full; an empty record is a safe read.
    return {};
  }
}

export function markCompleted(dimensionId: string, answered: number): void {
  try {
    const next = { ...readCompleted(), [dimensionId]: answered };
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Losing progress display is survivable; failing the hand-off is not.
  }
}
