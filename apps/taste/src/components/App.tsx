/**
 * The app's two screens: the dimension list, and one dimension's flow.
 *
 * Deliberately not routed. There are two screens and a back button; a router
 * would be more machinery than the thing it steers, and the panel this renders
 * in has its own navigation the app should not compete with.
 */

import { useState } from "preact/hooks";

import { DIMENSIONS, dimensionById, type DimensionId } from "../data";
import { PAGE_BY_DIMENSION } from "../prompt";
import { readCompleted, relayPrompt, showSplit } from "../vellum";
import { Flow } from "./Flow";

export function App() {
  const [open, setOpen] = useState<DimensionId | null>(null);
  // Read once per mount. The only writer is the flow, which unmounts back to
  // this screen, so there is nothing to subscribe to.
  const [completed] = useState(readCompleted);

  if (open) {
    return <Flow dimension={dimensionById(open)} onExit={() => setOpen(null)} />;
  }

  const anyBuilt = Object.keys(completed).length > 0;

  return (
    <main class="home">
      <header class="home-head">
        <p class="eyebrow">Taste</p>
        <h1>Teach it what you like.</h1>
        <p class="lede">
          Four dimensions, each built the same way — a short run of
          this-or-that, plus whatever source material you already have. What
          comes out is a profile your assistant works from, and keeps revising
          every time you react to something it made.
        </p>
      </header>

      <div class="cards">
        {DIMENSIONS.map((dimension) => {
          const answered = completed[dimension.id] ?? 0;
          const pct = Math.round((answered / dimension.pairs.length) * 100);
          return (
            <button
              key={dimension.id}
              class="card"
              type="button"
              data-dimension={dimension.id}
              onClick={() => setOpen(dimension.id)}
            >
              <span class="card-name">{dimension.label}</span>
              <span class="card-blurb">{dimension.blurb}</span>
              <span class="bar" aria-hidden="true">
                <span style={{ width: `${pct}%` }} />
              </span>
              <span class="card-meta">
                {answered === 0
                  ? `${dimension.pairs.length} questions · not started`
                  : `${answered} of ${dimension.pairs.length} answered`}
              </span>
            </button>
          );
        })}
      </div>

      {anyBuilt && (
        <div class="review">
          <p class="hint">
            Your taste lives in your assistant's memory, not in this app — ask it
            directly to see where it stands.
          </p>
          <button
            class="btn"
            type="button"
            onClick={() => {
              relayPrompt(
                `What do you have recorded about my taste so far? Read the ${Object.values(
                  PAGE_BY_DIMENSION,
                )
                  .map((page) => `[[${page}]]`)
                  .join(", ")} memory pages and tell me what each one says — plainly, and say which ones are still thin.`,
              );
              showSplit();
            }}
          >
            Ask what it knows
          </button>
        </div>
      )}
    </main>
  );
}
