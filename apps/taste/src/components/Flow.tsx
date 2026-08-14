/**
 * One dimension's onboarding: one choice at a time, optional references with
 * explicit provenance, a compact local read, then the typed hand-off.
 *
 * The build step is acknowledgment-driven: nothing is marked complete and no
 * success copy renders until the route returns a verified `persisted`
 * acknowledgment. Outside Vellum the flow stays explorable end to end, but
 * the build step reports that nothing can be saved — it never pretends.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";

import type { Dimension, Option, Pair } from "../data";
import type { OverflowError } from "../limits";
import { buildSubmission, PAGE_BY_DIMENSION } from "../payload";
import { runSubmission, type SubmissionPhase } from "../submission";
import { markAnswered, markPersisted } from "../storage";
import { fetchTasteStatus, hostAvailable, routeAvailable, showSplit, submitTaste } from "../vellum";

interface Props {
  dimension: Dimension;
  onExit: () => void;
  onSaved?: () => void;
}

type Answers = Record<string, Option>;
type Stage = "questions" | "sources" | "review";

export function Flow({ dimension, onExit, onSaved }: Props) {
  const [answers, setAnswers] = useState<Answers>({});
  const [step, setStep] = useState(0);
  const [stage, setStage] = useState<Stage>("questions");
  const [sourceText, setSourceText] = useState("");
  const [items, setItems] = useState<string[]>([]);
  const [draftItem, setDraftItem] = useState("");
  const [authorshipClaimed, setAuthorshipClaimed] = useState(false);
  const [phase, setPhase] = useState<SubmissionPhase>({ phase: "idle" });
  const [overflows, setOverflows] = useState<OverflowError[]>([]);
  const [transitioning, setTransitioning] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const transitionTimerRef = useRef<number | null>(null);
  const transitionLockRef = useRef(false);
  // One request id per distinct payload: retries reuse it (the route is
  // idempotent by id), edits invalidate it so a changed payload never
  // collides with a spent id.
  const requestIdRef = useRef<string | null>(null);

  const answered = Object.keys(answers).length;
  const total = dimension.pairs.length;
  const currentPair = dimension.pairs[step];
  const isQuestionStage = stage === "questions";
  const hasSourceStep = dimension.sources.kind !== "none";
  const stageTotal = total + (hasSourceStep ? 2 : 1);
  const stagePosition = isQuestionStage ? step + 1 : stage === "sources" ? total + 1 : stageTotal;
  const stageLabel = isQuestionStage ? `Question ${step + 1} of ${total}` : stage === "sources" ? "References" : "Summary";
  const busy = phase.phase === "sending" || phase.phase === "accepted";
  const persisted = phase.phase === "persisted";

  useLayoutEffect(() => {
    stageRef.current?.focus({ preventScroll: true });
  }, [step, stage, persisted]);

  useEffect(() => () => {
    if (transitionTimerRef.current !== null) window.clearTimeout(transitionTimerRef.current);
  }, []);

  const invalidateAttempt = () => {
    requestIdRef.current = null;
    setOverflows([]);
    if (phase.phase !== "idle") setPhase({ phase: "idle" });
  };

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
    invalidateAttempt();

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
    invalidateAttempt();
  };

  const previous = () => {
    if (busy) return;
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
      if (phase.phase === "failed" || phase.phase === "unavailable") invalidateAttempt();
      if (hasSourceStep) {
        setStage("sources");
      } else {
        setStage("questions");
        setStep(total - 1);
      }
    }
  };

  const build = async () => {
    if (busy) return;
    requestIdRef.current ??= crypto.randomUUID();

    const built = buildSubmission(
      requestIdRef.current,
      dimension,
      answers,
      sourceText,
      items,
      authorshipClaimed,
    );
    if (!built.submission) {
      setOverflows(built.overflows);
      return;
    }
    setOverflows([]);

    const final = await runSubmission(
      built.submission,
      { submit: submitTaste, fetchStatus: fetchTasteStatus },
      setPhase,
    );
    if (final.phase === "persisted") {
      markAnswered(dimension.id, answered);
      markPersisted(dimension.id, final.ack.verifiedAt ?? new Date().toISOString());
      onSaved?.();
      if (hostAvailable()) showSplit();
    }
  };

  if (persisted && phase.phase === "persisted") {
    return (
      <section class="flow" data-dimension={dimension.id}>
        <Header dimension={dimension} onExit={onExit} />
        <div class="stage-card done-card v-card" ref={stageRef} tabIndex={-1}>
          <span class="done-mark" aria-hidden="true">✓</span>
          <div class="done-copy">
            <p class="section-label">Saved and verified</p>
            <h2>Your {dimension.label.toLowerCase()} taste page is updated.</h2>
            <p>
              {phase.ack.statements.length} preference {phase.ack.statements.length === 1 ? "statement" : "statements"} now
              live on <code>{phase.ack.page}</code> — confirmed by reading the page back, not by trusting the send.
              Your assistant reads that page before its next {dimension.label.toLowerCase()} draft.
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

      <div class="stage-card v-card" ref={stageRef} tabIndex={-1} aria-busy={transitioning || busy}>
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
              setSourceText={(value) => {
                setSourceText(value);
                invalidateAttempt();
              }}
              items={items}
              draftItem={draftItem}
              setDraftItem={setDraftItem}
              addItem={addItem}
              removeItem={(item) => {
                setItems((prev) => prev.filter((value) => value !== item));
                invalidateAttempt();
              }}
              authorshipClaimed={authorshipClaimed}
              setAuthorshipClaimed={(value) => {
                setAuthorshipClaimed(value);
                invalidateAttempt();
              }}
            />
          )}

          {stage === "review" && <TasteSummary dimension={dimension} answers={answers} />}
        </div>

        {(stage !== "questions" || step > 0) && (
          <div class="flow-actions">
            <button class="v-button ghost" type="button" onClick={previous} disabled={busy}>Back</button>
            {stage === "sources" && (
              <button class="v-button primary" type="button" onClick={() => setStage("review")}>
                View summary <span aria-hidden="true">→</span>
              </button>
            )}
            {stage === "review" && (
              <button
                class="v-button primary"
                type="button"
                disabled={busy || answered === 0}
                onClick={build}
              >
                {phase.phase === "sending"
                  ? "Saving…"
                  : phase.phase === "accepted"
                    ? "Confirming durable save…"
                    : phase.phase === "failed"
                      ? "Retry save"
                      : `Build my ${dimension.label.toLowerCase()} taste`}
                <span aria-hidden="true"> →</span>
              </button>
            )}
          </div>
        )}

        {stage === "review" && overflows.length > 0 && (
          <div class="save-error" role="alert">
            <p>Too much evidence to submit — trim and try again:</p>
            <ul>
              {overflows.map((overflow) => (
                <li key={`${overflow.limit}-${overflow.message}`}>{overflow.message}</li>
              ))}
            </ul>
          </div>
        )}
        {stage === "review" && phase.phase === "failed" && (
          <div class="save-error" role="alert">
            <p>The save did not complete:</p>
            <ul>
              {phase.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
            <p>
              {phase.canRetry
                ? "Retry re-checks safely — the same request cannot be double-applied."
                : "Adjust the inputs above and build again."}
            </p>
          </div>
        )}
        {stage === "review" && phase.phase === "unavailable" && (
          <p class="save-error" role="alert">
            This preview is outside Vellum, so nothing was sent and nothing was saved. Open Attune inside
            Vellum to build the profile.
          </p>
        )}
      </div>

      {stage === "review" && (
        <p class="handoff-note">
          Building sends your answers{hasSourceStep ? " and references" : ""} to your assistant, which
          updates only the <code>{PAGE_BY_DIMENSION[dimension.id]}</code> memory page with short derived
          preferences — never your raw samples. Submitted evidence does pass through the host and the
          conversation layer like any message. Success shows only after the page is read back and verified.
        </p>
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
  authorshipClaimed,
  setAuthorshipClaimed,
}: {
  dimension: Dimension;
  sourceText: string;
  setSourceText: (value: string) => void;
  items: string[];
  draftItem: string;
  setDraftItem: (value: string) => void;
  addItem: () => void;
  removeItem: (item: string) => void;
  authorshipClaimed: boolean;
  setAuthorshipClaimed: (value: boolean) => void;
}) {
  const inputId = `sources-${dimension.id}`;
  const authorshipId = `authorship-${dimension.id}`;

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
          <label class="authorship-row" for={authorshipId}>
            <input
              id={authorshipId}
              type="checkbox"
              checked={authorshipClaimed}
              onChange={(e) => setAuthorshipClaimed((e.target as HTMLInputElement).checked)}
            />
            <span>
              I wrote the pasted text myself. Leave this off for collected or found material — the
              assistant weighs claimed writing differently from samples of unknown origin.
            </span>
          </label>
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
  const selected = dimension.pairs
    .map((pair, index) => ({ pair, option: answers[pair.id], index }))
    .filter((entry): entry is { pair: Pair; option: Option; index: number } => entry.option !== undefined);

  return (
    <div class="summary-wrap" aria-live="polite">
      <div class="stage-heading summary-heading">
        <span class="optional-pill">Your read</span>
        <h2>Your {dimension.label.toLowerCase()} profile has a clear shape.</h2>
        <p>
          {selected.length === 0
            ? "Answer at least one question to build — there is nothing to save yet."
            : "These are the signals from this pass. Building saves them as short preference statements."}
        </p>
      </div>

      <div class="summary-traits" aria-label="Key taste signals">
        {selected.map(({ option, pair }) => (
          <div class="trait-card" key={pair.id}>
            <span class="trait-dot" aria-hidden="true" />
            <span>{sentenceCase(option.means)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function sentenceCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}
