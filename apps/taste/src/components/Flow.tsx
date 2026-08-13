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
            It's writing your {dimension.label.toLowerCase()} taste to memory
            now — you'll see it work in the chat. Come back any time to answer
            more; later answers refine the same page rather than replacing it.
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

/**
 * Compose the message the assistant receives.
 *
 * Self-contained by necessity — the assistant cannot see this app — and phrased
 * as preferences rather than as quiz answers, because what gets written to
 * memory should read like a description of the user, not a transcript of a
 * form they filled in.
 */
export function buildPrompt(
  dimension: Dimension,
  answers: Record<string, Option>,
  sourceText: string,
  items: string[],
): string {
  const lines: string[] = [];

  lines.push(
    `I just went through the ${dimension.label.toLowerCase()} onboarding in the Taste app. Build (or refine) my ${dimension.label.toLowerCase()} taste from what follows, and save it to memory on the [[${dimension.page}]] page.`,
  );

  const preferences = Object.values(answers).map((o) => o.means);
  if (preferences.length > 0) {
    lines.push("", "From the this-or-that questions, I prefer:");
    preferences.forEach((p) => lines.push(`- ${p}`));
  }

  const trimmedText = sourceText.trim();
  if (trimmedText) {
    lines.push(
      "",
      "Source material I'd point at as mine (URLs are worth reading; pasted text speaks for itself):",
      trimmedText,
    );
  }

  if (items.length > 0) {
    lines.push("", `Artists I return to: ${items.join(", ")}.`);
  }

  lines.push(
    "",
    "Write it as a description of what I prefer, not as a record of this form — it should still make sense to you in a month with no memory of these questions. Keep it tight, and if the page already exists, sharpen it rather than appending a second copy.",
  );

  return lines.join("\n");
}
