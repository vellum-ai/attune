/**
 * The app's two screens: the dimension home and one dimension's flow.
 *
 * Completion truth is layered honestly: inside Vellum the durable record is
 * the plugin journal (read over the route, refreshed on the plugin's sync
 * tag); the local store is a courtesy cache that keeps the plain-browser
 * preview useful. The card copy says which one it is showing.
 */

import { useEffect, useState } from "preact/hooks";

import { DIMENSIONS, dimensionById, type DimensionId } from "../data";
import { PAGE_BY_DIMENSION } from "../payload";
import { onCompletionChange, readCompletion, type CompletionState } from "../storage";
import {
  fetchCompletion,
  hostAvailable,
  relayPrompt,
  routeAvailable,
  showSplit,
  subscribeTasteChanges,
} from "../vellum";
import { Flow } from "./Flow";

type ServerCompletion = Record<string, { persistedAt: string; statements: number }>;

export function App() {
  const [open, setOpen] = useState<DimensionId | null>(null);
  const [local, setLocal] = useState<CompletionState>(readCompletion);
  const [server, setServer] = useState<ServerCompletion | null>(null);

  const refresh = async () => {
    setLocal(readCompletion());
    if (routeAvailable()) {
      setServer(await fetchCompletion());
    }
  };

  useEffect(() => {
    void refresh();
    const offStorage = onCompletionChange(() => setLocal(readCompletion()));
    const offSync = subscribeTasteChanges(() => void refresh());
    return () => {
      offStorage();
      offSync();
    };
  }, []);

  if (open) {
    return (
      <Flow
        dimension={dimensionById(open)}
        onSaved={() => void refresh()}
        onExit={() => {
          setOpen(null);
          void refresh();
        }}
      />
    );
  }

  const anyBuilt =
    Object.keys(local).length > 0 || (server !== null && Object.keys(server).length > 0);

  return (
    <main class="home">
      <header class="home-head">
        <span class="product-mark"><span class="signal-tab" aria-hidden="true" />Attune</span>
        <h1>Teach your assistant what good feels like.</h1>
        <p class="lede">
          Four dimensions, each a few clear calls plus whatever references you already have. What
          comes out is a set of taste pages your assistant reads before its next draft.
        </p>
      </header>

      <section class="dimension-section" aria-labelledby="dimension-heading">
        <div class="section-heading">
          <div>
            <p class="section-label">Build a baseline</p>
            <h2 id="dimension-heading">Where do you want to start?</h2>
          </div>
          <span class="section-count">{DIMENSIONS.length} profiles</span>
        </div>

        <div class="cards">
          {DIMENSIONS.map((dimension) => {
            const persisted = server?.[dimension.id];
            const localEntry = local[dimension.id];
            const minutes = Math.max(1, Math.ceil(dimension.pairs.length / 4));
            const status = persisted
              ? "Saved · verified"
              : localEntry?.persistedAt
                ? "Saved · verified"
                : localEntry && localEntry.answered > 0
                  ? "Previous pass"
                  : "Not started";
            const isComplete = status === "Saved · verified";

            return (
              <button
                key={dimension.id}
                class={`dimension-card v-card${isComplete ? " is-complete" : ""}`}
                type="button"
                data-dimension={dimension.id}
                onClick={() => setOpen(dimension.id)}
              >
                <span class="dimension-card-top">
                  <span class="dimension-icon" aria-hidden="true"><span /></span>
                  <span class={`status-pill${isComplete ? " complete" : ""}`}>{status}</span>
                </span>
                <span class="dimension-name">{dimension.label}</span>
                <span class="dimension-blurb">{dimension.blurb}</span>
                <span class="dimension-card-bottom">
                  <span class="dimension-meta">{dimension.pairs.length} questions · about {minutes} min</span>
                  <span class="dimension-cta">{isComplete || (localEntry?.answered ?? 0) > 0 ? "Refine" : "Start"} <span aria-hidden="true">→</span></span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {anyBuilt && (
        <aside class="memory-check" aria-label="Saved taste profiles">
          <div>
            <p class="section-label">{server ? "Saved in memory" : "Saved locally"}</p>
            <p>
              {server
                ? "Your taste lives on memory pages your assistant reads directly — ask it what it has."
                : "This preview keeps completion state in this tab only. Inside Vellum, the durable record takes over."}
            </p>
          </div>
          <button
            class="v-button secondary"
            type="button"
            onClick={() => {
              relayPrompt(
                `What do you have recorded about my taste so far? Read the ${Object.values(PAGE_BY_DIMENSION)
                  .map((page) => `[[${page}]]`)
                  .join(", ")} memory pages and tell me what each one says — plainly, and say which ones are still thin.`,
              );
              if (hostAvailable()) showSplit();
            }}
          >
            Check memory <span aria-hidden="true">→</span>
          </button>
        </aside>
      )}
    </main>
  );
}
