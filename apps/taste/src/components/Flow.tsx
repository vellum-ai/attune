/**
 * One dimension's onboarding: one choice at a time, optional references,
 * a compact local read, then a hand-off to the assistant.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";

import type { Dimension, Option, Pair } from "../data";
import { buildPrompt } from "../prompt";
import { markCompleted, relayPrompt, showSplit, hostAvailable, setBaseline } from "../vellum";
import { AvatarWitness, CompanionField } from "./companion/AvatarWitness";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { ChoiceGroup } from "./ui/ChoiceGroup";
import { ProgressBar } from "./ui/ProgressBar";

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
  const [keyboardReady, setKeyboardReady] = useState(false);
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
  const stageLabel = isQuestionStage ? `Pick ${step + 1} of ${total}` : stage === "sources" ? "Examples" : "Your picks";

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
    setKeyboardReady(false);
    if (step < total - 1) {
      setStep((value) => value + 1);
    } else {
      setStage(hasSourceStep ? "sources" : "review");
    }
  };

  const choose = (pairId: string, option: Option, advance: boolean) => {
    if (transitionLockRef.current) return;
    setAnswers((prev) => ({ ...prev, [pairId]: option }));

    if (!advance) {
      setKeyboardReady(true);
      return;
    }

    transitionLockRef.current = true;
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
    setKeyboardReady(false);
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
        <Card class="stage-card done-card" ref={stageRef} tabIndex={-1}>
          <span class="done-mark" aria-hidden="true">✓</span>
          <div class="done-copy">
            <p class="section-label">Saved</p>
            <h2>Vellum has it.</h2>
            <p>Vellum will use these preferences going forward.</p>
          </div>
          {dimension.sources.kind === "none" && <p class="reference-note">Add examples in chat later.</p>}
          <Button variant="primary" onClick={onExit}>Back to Taste</Button>
        </Card>
        <CompanionField phase="return" />
      </section>
    );
  }

  return (
    <section class="flow" data-dimension={dimension.id}>
      <Header dimension={dimension} onExit={onExit} />

      <Card class={`stage-card${transitioning ? " is-transitioning" : ""}`} ref={stageRef} tabIndex={-1} aria-busy={transitioning}>
        <div class="flow-progress">
          <div class="progress-copy" aria-live="polite">
            <span>{stageLabel}</span>
          </div>
          <ProgressBar
            value={(stagePosition / stageTotal) * 100}
            label={stageLabel}
          />
        </div>

        <div class="stage-content">
          {stage === "questions" && (
            <QuestionStep
              pair={currentPair}
              answer={answers[currentPair.id]}
              onChoose={(option, advance) => choose(currentPair.id, option, advance)}
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

        {(stage !== "questions" || step > 0 || keyboardReady) && <div class="flow-actions">
          <Button variant="ghost" onClick={previous}>Back</Button>
          {stage === "questions" && keyboardReady && (
            <Button variant="primary" onClick={() => { transitionLockRef.current = true; commitQuestionTransition(); }}>Next</Button>
          )}
          {stage === "sources" && (
            <Button variant="primary" onClick={() => setStage("review")}>
              See your picks <span aria-hidden="true">→</span>
            </Button>
          )}
          {stage === "review" && (
            <Button variant="primary" disabled={saveState === "saving"} onClick={build}>
              {saveState === "saving" ? "Saving…" : "Save to Vellum"} <span aria-hidden="true">→</span>
            </Button>
          )}
        </div>}
        {stage === "review" && saveError && <p class="save-error" role="alert">{saveError}</p>}
      </Card>

    </section>
  );
}

function Header({ dimension, onExit }: { dimension: Dimension; onExit: () => void }) {
  return (
    <header class="flow-head">
      <Button variant="ghost" class="back-link" onClick={onExit}>← Back to Taste</Button>
      <div class="flow-head-meta">
        <span class="dimension-pill"><span aria-hidden="true" />{dimension.label}</span>
      </div>
    </header>
  );
}

function QuestionStep({ pair, answer, onChoose, transitioning }: { pair: Pair; answer?: Option; onChoose: (option: Option, advance: boolean) => void; transitioning: boolean }) {
  const questionId = `question-${pair.id}`;

  const selectedSide = answer === pair.a ? "left" : answer === pair.b ? "right" : "idle";

  return (
    <fieldset class="question-step" data-selected-side={selectedSide}>
      <div class="question-head">
        <div class="question-copy">
          <legend id={questionId}>{pair.question}</legend>
          <p class="question-prompt">Which feels more like you?</p>
        </div>
        <div class="question-witness-bay">
          <AvatarWitness mood={selectedSide === "left" ? "left" : selectedSide === "right" ? "right" : "idle"} />
        </div>
      </div>
      <ChoiceGroup labelledBy={questionId}>
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
              onClick={(event) => onChoose(option, event.detail > 0)}
            >
              <span class="choice-mark" aria-hidden="true">{picked ? "✓" : side.toUpperCase()}</span>
              <span class="choice-body">{option.body}</span>
            </button>
          );
        })}
      </ChoiceGroup>
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
        <h2>{dimension.sources.kind === "list" ? "Artists" : "Examples or links"}</h2>
        <p>Have examples? Add them here, or skip.</p>
      </div>

      {dimension.sources.kind === "text" && (
        <div class="field-group">
          <label for={inputId}>Examples or links</label>
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
            <Button variant="outlined" class="add-button" onClick={addItem} disabled={!draftItem.trim()}>Add</Button>
          </div>
        </div>
      )}

      {dimension.sources.kind === "none" && (
        <div class="reference-card">
          <span class="reference-icon" aria-hidden="true">＋</span>
          <div>
            <strong>Add examples in chat later</strong>
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
        <h2>Here’s what stood out.</h2>
        <p>A few things stood out. You can change them anytime.</p>
      </div>

      <div class="summary-traits" aria-label="Key preferences">
        {featured.map(({ option, pair }) => (
          <div class="trait-card" key={pair.id}>
            <span class="trait-dot" aria-hidden="true" />
            <span>{option.summary}</span>
          </div>
        ))}
      </div>

      <details class="answer-details">
        <summary>See all {selected.length} picks <span class="details-icon" aria-hidden="true" /></summary>
        <div class="answer-list">
          {selected.map(({ pair, option, index }) => (
            <div class="answer-row" key={pair.id}>
              <span>{pair.axis.label}</span>
              <p>{option.summary}</p>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}


function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}
