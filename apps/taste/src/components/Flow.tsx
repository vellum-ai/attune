/**
 * One dimension's onboarding: one choice at a time, optional references,
 * a compact local read, then a hand-off to the assistant.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";

import type { Dimension, Option, Pair } from "../data";
import { buildPrompt } from "../prompt";
import { markCompleted, relayPrompt, showSplit, hostAvailable, setBaseline } from "../vellum";

interface Props {
  dimension: Dimension;
  onExit: () => void;
  onSaved?: () => void;
}

type Answers = Record<string, Option>;
type Stage = "questions" | "sources" | "review" | "sent";

export function Flow({ dimension, onExit, onSaved }: Props) {
  const [answers, setAnswers] = useState<Answers>({});
  const [step, setStep] = useState(0);
  const [stage, setStage] = useState<Stage>("questions");
  const [sourceText, setSourceText] = useState("");
  const [items, setItems] = useState<string[]>([]);
  const [draftItem, setDraftItem] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const transitionTimerRef = useRef<number | null>(null);
  const transitionLockRef = useRef(false);

  const answered = Object.keys(answers).length;
  const total = dimension.pairs.length;
  const currentPair = dimension.pairs[step];
  const isQuestionStage = stage === "questions";
  const hasSourceStep = dimension.sources.kind !== "none";
  const stageTotal = total + (hasSourceStep ? 2 : 1);
  const stagePosition = isQuestionStage ? step + 1 : stage === "sources" ? total + 1 : stageTotal;
  const stageLabel = isQuestionStage ? `Question ${step + 1} of ${total}` : stage === "sources" ? "References" : "Summary";

  useLayoutEffect(() => {
    stageRef.current?.focus({ preventScroll: true });
  }, [step, stage]);

  useEffect(() => () => {
    if (transitionTimerRef.current !== null) window.clearTimeout(transitionTimerRef.current);
  }, []);

  const commitQuestionTransition = () => {
    transitionTimerRef.current = null;
    transitionLockRef.current = false;
    setTransitioning(false);
    if (step < total - 1) {
      setStep((value) => value + 1);
    } else {
      setStage(hasSourceStep ? "sources" : "review");
    }
  };

  const choose = (pairId: string, option: Option) => {
    if (transitionLockRef.current) return;
    transitionLockRef.current = true;
    setAnswers((prev) => ({ ...prev, [pairId]: option }));

    if (prefersReducedMotion()) {
      commitQuestionTransition();
      return;
    }

    setTransitioning(true);
    transitionTimerRef.current = window.setTimeout(commitQuestionTransition, 180);
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

  const previous = () => {
    if (transitionTimerRef.current !== null) {
      window.clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
    transitionLockRef.current = false;
    setTransitioning(false);

    if (stage === "questions" && step > 0) {
      setStep((value) => value - 1);
    } else if (stage === "sources") {
      setStage("questions");
      setStep(total - 1);
    } else if (stage === "review") {
      if (hasSourceStep) {
        setStage("sources");
      } else {
        setStage("questions");
        setStep(total - 1);
      }
    }
  };

  const build = async () => {
    if (saveState === "saving") return;
    setSaveState("saving");
    setSaveError(null);
    const baseline = dimension.pairs.map((pair) => {
      const selected = answers[pair.id];
      return {
        axisId: pair.axis.id,
        label: pair.axis.label,
        leftLabel: pair.axis.leftLabel,
        rightLabel: pair.axis.rightLabel,
        side: selected === pair.a ? "left" as const : "right" as const,
      };
    });
    const result = await setBaseline(dimension.id, baseline);
    if (!result.ok) {
      setSaveState("error");
      setSaveError(result.error ?? "Could not save the baseline. Try again.");
      return;
    }
    onSaved?.();
    relayPrompt(buildPrompt(dimension, answers, sourceText, items));
    markCompleted(dimension.id, answered);
    if (hostAvailable()) showSplit();
    setSaveState("idle");
    setStage("sent");
  };

  if (stage === "sent") {
    return (
      <section class="flow" data-dimension={dimension.id}>
        <Header dimension={dimension} onExit={onExit} />
        <div class="stage-card done-card v-card" ref={stageRef} tabIndex={-1}>
          <span class="done-mark" aria-hidden="true">✓</span>
          <div class="done-copy">
            <p class="section-label">Profile saved</p>
            <h2>{hostAvailable() ? "Your assistant has it." : "Your profile is ready."}</h2>
            <p>
              {hostAvailable()
                ? `Your ${dimension.label.toLowerCase()} preferences are being refined in memory. Revisit this profile whenever your taste shifts.`
                : "This preview is outside Vellum, so the assistant hand-off was skipped. Your local flow is complete."}
            </p>
          </div>
          {dimension.sources.kind === "none" && <p class="reference-note">{dimension.sources.hint}</p>}
          <button class="v-button primary" type="button" onClick={onExit}>Back to profiles</button>
        </div>
      </section>
    );
  }

  return (
    <section class="flow" data-dimension={dimension.id}>
      <Header dimension={dimension} onExit={onExit} />

      <div class="stage-card v-card" ref={stageRef} tabIndex={-1} aria-busy={transitioning}>
        <div class="flow-progress">
          <div class="progress-copy" aria-live="polite">
            <span>{stageLabel}</span>
          </div>
          <div
            class="progress-track"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={stageTotal}
            aria-valuenow={stagePosition}
            aria-valuetext={stageLabel}
          >
            <span style={{ width: `${(stagePosition / stageTotal) * 100}%` }} />
          </div>
        </div>

        <div class="stage-content">
          {stage === "questions" && (
            <QuestionStep
              pair={currentPair}
              answer={answers[currentPair.id]}
              onChoose={(option) => choose(currentPair.id, option)}
              transitioning={transitioning}
            />
          )}

          {stage === "sources" && (
            <SourceStep
              dimension={dimension}
              sourceText={sourceText}
              setSourceText={setSourceText}
              items={items}
              draftItem={draftItem}
              setDraftItem={setDraftItem}
              addItem={addItem}
              removeItem={(item) => setItems((prev) => prev.filter((value) => value !== item))}
            />
          )}

          {stage === "review" && <TasteSummary dimension={dimension} answers={answers} />}
        </div>

        {(stage !== "questions" || step > 0) && <div class="flow-actions">
          <button class="v-button ghost" type="button" onClick={previous}>Back</button>
          {stage === "sources" && (
            <button class="v-button primary" type="button" onClick={() => setStage("review")}>
              View summary <span aria-hidden="true">→</span>
            </button>
          )}
          {stage === "review" && (
            <button class="v-button primary" type="button" disabled={saveState === "saving"} onClick={build}>
              {saveState === "saving" ? "Saving baseline…" : "Save profile"} <span aria-hidden="true">→</span>
            </button>
          )}
        </div>}
        {stage === "review" && saveError && <p class="save-error" role="alert">{saveError}</p>}
      </div>

      {stage === "review" && !hostAvailable() && (
        <p class="handoff-note">Preview mode: saving will finish the local flow without sending anything.</p>
      )}
    </section>
  );
}

function Header({ dimension, onExit }: { dimension: Dimension; onExit: () => void }) {
  return (
    <header class="flow-head">
      <button class="back-link" type="button" onClick={onExit}>← All profiles</button>
      <div class="flow-head-meta">
        <span class="registration-note" aria-hidden="true">profile / calibration</span>
        <span class="dimension-pill"><span aria-hidden="true" />{dimension.label}</span>
      </div>
    </header>
  );
}

function QuestionStep({ pair, answer, onChoose, transitioning }: { pair: Pair; answer?: Option; onChoose: (option: Option) => void; transitioning: boolean }) {
  const questionId = `question-${pair.id}`;

  return (
    <fieldset class="question-step">
      <legend id={questionId}>{pair.question}</legend>
      <p class="question-prompt">Pick the one you would rather live with.</p>
      <div class="choice-pair" role="radiogroup" aria-labelledby={questionId}>
        {(["a", "b"] as const).map((side) => {
          const option = pair[side];
          const picked = answer === option;
          return (
            <button
              key={side}
              class="choice"
              type="button"
              role="radio"
              aria-checked={picked}
              aria-disabled={transitioning}
              disabled={transitioning}
              onClick={() => onChoose(option)}
            >
              <span class="choice-mark" aria-hidden="true">{picked ? "✓" : side.toUpperCase()}</span>
              <span class="choice-body">{option.body}</span>
              <span class="choice-register" aria-hidden="true">{side === "a" ? "01" : "02"}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function SourceStep({
  dimension,
  sourceText,
  setSourceText,
  items,
  draftItem,
  setDraftItem,
  addItem,
  removeItem,
}: {
  dimension: Dimension;
  sourceText: string;
  setSourceText: (value: string) => void;
  items: string[];
  draftItem: string;
  setDraftItem: (value: string) => void;
  addItem: () => void;
  removeItem: (item: string) => void;
}) {
  const inputId = `sources-${dimension.id}`;

  return (
    <div class="source-step">
      <div class="stage-heading">
        <span class="optional-pill">Optional</span>
        <h2>{dimension.sources.label}</h2>
        <p>References make the profile more specific. You can also skip this and keep moving.</p>
      </div>

      {dimension.sources.kind === "text" && (
        <div class="field-group">
          <label for={inputId}>Samples or links</label>
          <textarea id={inputId} class="field" rows={7} placeholder={dimension.sources.placeholder} value={sourceText} onInput={(e) => setSourceText((e.target as HTMLTextAreaElement).value)} />
        </div>
      )}

      {dimension.sources.kind === "list" && (
        <div class="field-group list-input">
          <label for={inputId}>Add an artist</label>
          <div class="chips">
            {items.map((item) => (
              <button key={item} class="chip" type="button" onClick={() => removeItem(item)} aria-label={`Remove ${item}`}>
                {item} <span aria-hidden="true">×</span>
              </button>
            ))}
          </div>
          <div class="input-row">
            <input id={inputId} class="field" type="text" placeholder={dimension.sources.placeholder} value={draftItem} onInput={(e) => setDraftItem((e.target as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }} />
            <button class="v-button secondary add-button" type="button" onClick={addItem} disabled={!draftItem.trim()}>Add</button>
          </div>
        </div>
      )}

      {dimension.sources.kind === "none" && (
        <div class="reference-card">
          <span class="reference-icon" aria-hidden="true">＋</span>
          <div>
            <strong>Add visual references in chat</strong>
            <p>Save this baseline first, then attach a few sites, screenshots, rooms, or objects for a sharper read.</p>
          </div>
        </div>
      )}

      <p class="field-hint">{dimension.sources.hint}</p>
    </div>
  );
}

function TasteSummary({ dimension, answers }: { dimension: Dimension; answers: Answers }) {
  const selected = dimension.pairs.map((pair, index) => ({
    pair,
    option: answers[pair.id],
    index,
  }));
  const featuredIndexes = dimension.pairs.length >= 8 ? [0, 2, 4, dimension.pairs.length - 1] : selected.map((_, index) => index);
  const featured = featuredIndexes.map((index) => selected[index]).filter(Boolean);

  return (
    <div class="summary-wrap" aria-live="polite">
      <div class="stage-heading summary-heading">
        <span class="optional-pill">Your read</span>
        <h2>Your {dimension.label.toLowerCase()} profile has a clear shape.</h2>
        <p>These are the strongest signals from this pass. Save them now, then refine with references over time.</p>
      </div>

      <div class="summary-traits" aria-label="Key taste signals">
        {featured.map(({ option, pair }) => (
          <div class="trait-card" key={pair.id}>
            <span class="trait-dot" aria-hidden="true" />
            <span>{sentenceCase(option.means)}</span>
          </div>
        ))}
      </div>

      <details class="answer-details">
        <summary>See all {selected.length} answers <span class="details-icon" aria-hidden="true" /></summary>
        <div class="answer-list">
          {selected.map(({ pair, option, index }) => (
            <div class="answer-row" key={pair.id}>
              <span>{formatSignal(pair.id, index)}</span>
              <p>{option.means}</p>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

function formatSignal(id: string, index: number): string {
  const label = id.replace(/^(web|interior)-/, "").replace(/-/g, " ");
  return `${String(index + 1).padStart(2, "0")} · ${label}`;
}

function sentenceCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}
