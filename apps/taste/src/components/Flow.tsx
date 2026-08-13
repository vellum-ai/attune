/**
 * One dimension's onboarding: the this-or-that run, then its source material,
 * then the hand-off to the assistant.
 *
 * The whole flow is local until the last step. Nothing is sent until the user
 * presses the build button, so backing out costs them nothing and abandoning
 * halfway leaves no half-written taste in memory.
 */

import { useState } from "preact/hooks";

import type { Dimension, Option } from "../data";
import { buildPrompt } from "../prompt";
import { markCompleted, relayPrompt, showSplit, hostAvailable } from "../vellum";

interface Props {
  dimension: Dimension;
  onExit: () => void;
}

type Answers = Record<string, Option>;

export function Flow({ dimension, onExit }: Props) {
  const [answers, setAnswers] = useState<Answers>({});
  const [sourceText, setSourceText] = useState("");
  const [items, setItems] = useState<string[]>([]);
  const [draftItem, setDraftItem] = useState("");
  const [sent, setSent] = useState(false);

  const answered = Object.keys(answers).length;
  const total = dimension.pairs.length;

  const choose = (pairId: string, option: Option) => {
    setAnswers((prev) => {
      // Pressing the chosen option again clears it. A question you are not
      // sure about should be answerable with "neither", and the alternative is
      // a stuck choice the user cannot take back.
      if (prev[pairId] === option) {
        const { [pairId]: _dropped, ...rest } = prev;
        return rest;
      }
      return { ...prev, [pairId]: option };
    });
  };

  const addItem = () => {
    const value = draftItem.trim();
    if (!value || items.includes(value)) {
      setDraftItem("");
      return;
    }
    setItems((prev) => [...prev, value]);
    setDraftItem("");
  };

  const build = () => {
    relayPrompt(buildPrompt(dimension, answers, sourceText, items));
    showSplit();
    markCompleted(dimension.id, answered);
    setSent(true);
  };

  if (sent) {
    return (
      <section class="flow">
        <Header dimension={dimension} onExit={onExit} />
        <div class="done">
          <h2>Sent to your assistant</h2>
          <p>
            Your answers and source material went over as evidence; the
            assistant distills them into short preference statements on your{" "}
            {dimension.label.toLowerCase()} taste page — it never stores your
            samples themselves. Come back any time to answer more; later
            answers refine the same page rather than replacing it.
          </p>
          {dimension.sources.kind === "none" && (
            <p class="hint">{dimension.sources.hint}</p>
          )}
          <button class="btn" type="button" onClick={onExit}>
            Back to dimensions
          </button>
        </div>
      </section>
    );
  }

  return (
    <section class="flow">
      <Header dimension={dimension} onExit={onExit} />

      <div class="progress" aria-label={`${answered} of ${total} answered`}>
        <span style={{ width: `${(answered / total) * 100}%` }} />
      </div>

      <div class="pairs">
        {dimension.pairs.map((pair) => (
          <fieldset class="pair-block" key={pair.id}>
            <legend>{pair.question}</legend>
            <div class="pair">
              {(["a", "b"] as const).map((side) => {
                const option = pair[side];
                const picked = answers[pair.id] === option;
                return (
                  <button
                    key={side}
                    class="opt"
                    type="button"
                    aria-pressed={picked}
                    onClick={() => choose(pair.id, option)}
                  >
                    <span class="opt-tag">{side.toUpperCase()}</span>
                    <span class="opt-body">{option.body}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      <div class="sources">
        <h3>{dimension.sources.label}</h3>

        {dimension.sources.kind === "text" && (
          <textarea
            class="field"
            rows={7}
            placeholder={dimension.sources.placeholder}
            value={sourceText}
            onInput={(e) => setSourceText((e.target as HTMLTextAreaElement).value)}
          />
        )}

        {dimension.sources.kind === "list" && (
          <div class="list-input">
            <div class="chips">
              {items.map((item) => (
                <button
                  key={item}
                  class="chip"
                  type="button"
                  onClick={() => setItems((prev) => prev.filter((i) => i !== item))}
                  aria-label={`Remove ${item}`}
                >
                  {item} <span aria-hidden="true">×</span>
                </button>
              ))}
            </div>
            <input
              class="field"
              type="text"
              placeholder={dimension.sources.placeholder}
              value={draftItem}
              onInput={(e) => setDraftItem((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addItem();
                }
              }}
            />
          </div>
        )}

        <p class="hint">{dimension.sources.hint}</p>
      </div>

      <div class="actions">
        <button
          class="btn primary"
          type="button"
          disabled={answered === 0}
          onClick={build}
        >
          {answered === 0
            ? "Answer at least one to build"
            : `Build my ${dimension.label.toLowerCase()} taste`}
        </button>
        <p class="hint">
          Building sends your answers and anything above to your assistant as
          evidence. It saves only short derived preferences to your{" "}
          {dimension.label.toLowerCase()} taste page — never the samples
          themselves. Nothing is sent until you press it.
        </p>
        {!hostAvailable() && (
          <p class="hint">
            Open this inside Vellum to hand off to your assistant. Everything
            here still works; only the last step is inert.
          </p>
        )}
      </div>
    </section>
  );
}

function Header({ dimension, onExit }: { dimension: Dimension; onExit: () => void }) {
  return (
    <header class="flow-head" data-dimension={dimension.id}>
      <button class="back" type="button" onClick={onExit}>
        ← Dimensions
      </button>
      <h1>{dimension.label}</h1>
      <p class="blurb">{dimension.blurb}</p>
    </header>
  );
}

