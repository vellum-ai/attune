/**
 * The app's two modes: a taste dashboard and the calibration flow.
 * The dashboard appears after the backend has a baseline for any dimension,
 * while the local completion store keeps the preview useful outside Vellum.
 */

import { useEffect, useRef, useState } from "preact/hooks";

import { CompanionField } from "./companion/AvatarWitness";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";

import { DIMENSIONS, dimensionById, type DimensionId } from "../data";
import {
  fetchTasteProfile,
  hostAvailable,
  readCompleted,
  relayPrompt,
  setOverride,
  showSplit,
  subscribeTasteProfile,
  type ProfileAxis,
  type TasteProfile,
} from "../vellum";
import { Flow } from "./Flow";

export function App() {
  const [open, setOpen] = useState<DimensionId | null>(null);
  const [takeover, setTakeover] = useState<DimensionId | null>(null);
  const openingRef = useRef(false);
  const transitionTimerRef = useRef<number | null>(null);
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
  const [profile, setProfile] = useState<TasteProfile | null>(null);
  const [completed, setCompleted] = useState(readCompleted);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const openDimension = (id: DimensionId) => {
    if (openingRef.current || open !== null) return;
    openingRef.current = true;
    if (reducedMotion || prefersReducedMotion()) {
      openingRef.current = false;
      setOpen(id);
      return;
    }
    setTakeover(id);
    transitionTimerRef.current = window.setTimeout(() => {
      transitionTimerRef.current = null;
      openingRef.current = false;
      setTakeover(null);
      setOpen(id);
    }, 360);
  };

  const refresh = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setProfile(await fetchTasteProfile());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load Taste.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    const media = typeof window !== "undefined" ? window.matchMedia?.("(prefers-reduced-motion: reduce)") : undefined;
    const updateMotion = () => setReducedMotion(media?.matches === true);
    media?.addEventListener?.("change", updateMotion);
    return () => {
      media?.removeEventListener?.("change", updateMotion);
      if (transitionTimerRef.current !== null) window.clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
      openingRef.current = false;
    };
  }, []);

  useEffect(() => {
    return subscribeTasteProfile((next) => {
      setProfile(next);
      setLoading(false);
      setLoadError(null);
    });
  }, []);

  if (open) {
    return (
      <Flow
        dimension={dimensionById(open)}
        onSaved={() => void refresh()}
        onExit={() => {
          setCompleted(readCompleted());
          setOpen(null);
          void refresh();
        }}
      />
    );
  }

  const baselineDimensions = profile?.dimensions.filter((dimension) => dimension.baselineComplete) ?? [];
  const profileFirst = baselineDimensions.length > 0;

  if (loading && !profile) return <LoadingScreen />;
  if (profileFirst) {
    return (
      <ProfileDashboard
        profile={profile!}
        onRefresh={refresh}
        onCalibrate={openDimension}
        takeoverId={takeover}
      />
    );
  }

  return (
    <CalibrationHome
      completed={completed}
      loadError={loadError}
      onOpen={openDimension}
      onRefresh={refresh}
      takeoverId={takeover}
    />
  );
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function LoadingScreen() {
  return (
    <main class="home state-screen" aria-live="polite" aria-busy="true">
      <span class="product-mark"><span class="signal-tab" aria-hidden="true" />Taste</span>
      <div class="loading-block"><span class="loading-line" /><span class="loading-line short" /><span class="loading-line shorter" /></div>
      <p class="state-copy">Loading…</p>
    </main>
  );
}

function CalibrationHome({
  completed,
  loadError,
  onOpen,
  onRefresh,
  takeoverId,
}: {
  completed: Record<string, number>;
  loadError: string | null;
  onOpen: (id: DimensionId) => void;
  onRefresh: () => void;
  takeoverId: DimensionId | null;
}) {
  const anyBuilt = Object.keys(completed).length > 0;

  return (
    <main class={`home${takeoverId ? " has-takeover" : ""}`}>
      <CompanionField phase="idle" />
      <header class="home-head">
        <span class="product-mark"><span class="signal-tab" aria-hidden="true" />Taste</span>
        <h1>Show Vellum what you like.</h1>
        <p class="lede">Pick a category. Make a few choices. Vellum remembers.</p>
      </header>

      {loadError && <StatusNotice tone="error" message={loadError} actionLabel="Try again" onAction={onRefresh} />}

      <section class="dimension-section" aria-labelledby="dimension-heading">
        <div class="section-heading">
          <div>
            <h2 id="dimension-heading">Start with a category</h2>
          </div>

        </div>

        <div class="cards">
          {DIMENSIONS.map((dimension) => {
            const answered = completed[dimension.id] ?? 0;
            const isComplete = answered >= dimension.pairs.length;
            const hasPreviousProfile = answered > 0;
            const minutes = Math.max(1, Math.ceil(dimension.pairs.length / 4));

            return (
              <button
                key={dimension.id}
                class={`dimension-card ui-button ui-button-outlined${isComplete ? " is-complete" : ""}${takeoverId === dimension.id ? " is-takeover-target" : ""}`}
                data-slot="card"
                type="button"
                data-dimension={dimension.id}
                onClick={() => onOpen(dimension.id)}
              >
                <span class="dimension-card-top">
                  <span class="dimension-icon" aria-hidden="true"><span class="dimension-icon-core" /></span>
                  <span class={`status-pill${isComplete ? " complete" : ""}`}>
                    {isComplete ? "Saved" : hasPreviousProfile ? "In progress" : "New"}
                  </span>
                </span>
                <span class="dimension-card-body">
                  <span class="dimension-name">{dimension.label}</span>
                  <span class="dimension-blurb">{dimension.blurb}</span>
                </span>
                <span class="dimension-card-bottom">
                  <span class="dimension-meta">{dimension.pairs.length} picks · about {minutes} min</span>
                  <span class="dimension-cta">{hasPreviousProfile ? "Continue" : "Start"} <span aria-hidden="true">→</span></span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {anyBuilt && (
      <aside class="memory-check" aria-label="Taste memory">
        <Button variant="outlined" onClick={() => {
          relayPrompt("What do you have recorded about my taste so far? Read the [[taste-writing]], [[taste-music]], [[taste-web-design]] and [[taste-interior-design]] memory pages and tell me what each one says plainly.");
          if (hostAvailable()) showSplit();
        }}>Ask Vellum what it remembers</Button>
      </aside>
      )}
      {takeoverId && <TransitionOverlay />}
    </main>
  );
}

function TransitionOverlay() {
  return (
    <div class="transition-screen transition-overlay" aria-live="polite">
      <CompanionField phase="takeover" />

    </div>
  );
}

function ProfileDashboard({
  profile,
  onRefresh,
  onCalibrate,
  takeoverId,
}: {
  profile: TasteProfile;
  onRefresh: () => void;
  onCalibrate: (id: DimensionId) => void;
  takeoverId: DimensionId | null;
}) {
  const profileDimensions = DIMENSIONS.map((metadata) => profile.dimensions.find((dimension) => dimension.id === metadata.id) ?? {
    id: metadata.id,
    label: metadata.label,
    baselineComplete: false,
    axes: [],
  });
  const available = profileDimensions.filter((dimension) => dimension.baselineComplete);
  const [selectedId, setSelectedId] = useState<DimensionId>((available[0]?.id ?? DIMENSIONS[0].id) as DimensionId);
  const selected = profileDimensions.find((dimension) => dimension.id === selectedId) ?? profileDimensions[0];
  const [savingAxis, setSavingAxis] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!profileDimensions.some((dimension) => dimension.id === selectedId)) {
      setSelectedId((available[0]?.id ?? DIMENSIONS[0].id) as DimensionId);
    }
  }, [profile.revision, available.length, selectedId]);

  if (!selected) return null;
  const metadata = dimensionById(selected.id as DimensionId);
  const axes = selected.axes.length > 0 ? selected.axes : metadata.pairs.map((pair) => ({
    id: pair.axis.id,
    label: pair.axis.label,
    leftLabel: pair.axis.leftLabel,
    rightLabel: pair.axis.rightLabel,
    learnedPosition: null,
    overridePosition: null,
    confidence: "low" as const,
    evidenceCount: 0,
  }));

  const updateAxis = async (axis: ProfileAxis, position: number | null) => {
    setSavingAxis(axis.id);
    setActionMessage(null);
    const result = await setOverride(selected.id, axis.id, position);
    setSavingAxis(null);
    if (result.ok) {
      setActionMessage({ tone: "success", text: position === null ? "Using learned setting." : "Saved." });
      onRefresh();
    } else {
      setActionMessage({ tone: "error", text: result.error ?? "Could not save this preference." });
    }
  };

  return (
    <main class={`home profile-home${takeoverId ? " has-takeover" : ""}`}>
      <CompanionField phase="idle" />
      <header class="home-head profile-head">
        <span class="product-mark"><span class="signal-tab" aria-hidden="true" />Taste</span>
        <h1>What Vellum knows about your taste.</h1>
        <p class="lede">This is a starting point. Change anything that no longer feels right.</p>
      </header>

      <div class="profile-toolbar">
        <div class="dimension-switcher" role="tablist" aria-label="Taste dimensions">
          {profileDimensions.map((dimension) => (
            <button
              key={dimension.id}
              class={`dimension-tab${dimension.id === selected.id ? " selected" : ""}`}
              type="button"
              role="tab"
              aria-selected={dimension.id === selected.id}
              onClick={() => { setSelectedId(dimension.id as DimensionId); setActionMessage(null); }}
            >
              {dimension.label ?? dimensionById(dimension.id as DimensionId).label}
              {!dimension.baselineComplete && <span class="tab-state">+</span>}
            </button>
          ))}
        </div>

      </div>

      {savingAxis && <StatusNotice tone="success" message="Saving…" />}
      {actionMessage && <StatusNotice tone={actionMessage.tone} message={actionMessage.text} />}

      {!selected.baselineComplete ? (
        <Card class="profile-board empty-profile" aria-labelledby="profile-heading">
          <div class="profile-board-head">
            <div>
              <h2 id="profile-heading">Start this category.</h2>
            </div>
            <Button variant="primary" onClick={() => onCalibrate(selected.id as DimensionId)}>Set up {metadata.label}</Button>
          </div>
          <p class="empty-profile-copy">Make a few choices to give it a shape.</p>
        </Card>
      ) : (
        <>
          <Card class="profile-board" aria-labelledby="profile-heading">
            <div class="profile-board-head">
              <div>
                <p class="section-label">{metadata.label}</p>
                <h2 id="profile-heading">Your taste so far</h2>
              </div>
              <Button variant="outlined" onClick={() => onCalibrate(selected.id as DimensionId)}>Fine-tune</Button>
            </div>
            <TastePrint axes={axes} />
          </Card>

          <section class="axis-section" aria-labelledby="axis-heading">
            <div class="section-heading axis-heading">
              <div>
                <p class="section-label">Fine-tune</p>
                <h2 id="axis-heading">Anything to change?</h2>
              </div>
              <span class="section-count">{axes.length} preferences</span>
            </div>
            <p class="axis-explainer">Pink shows what Vellum learned. Blue shows your current setting.</p>
            <div class="axis-list">
              {axes.map((axis) => (
                <AxisRow key={axis.id} axis={axis} saving={savingAxis === axis.id} onChange={(position) => void updateAxis(axis, position)} />
              ))}
            </div>
          </section>
        </>
      )}
      {takeoverId && <TransitionOverlay />}
    </main>
  );
}

function TastePrint({ axes }: { axes: ProfileAxis[] }) {
  return (
    <div class="taste-print" aria-label="A quick read of your preferences.">
      <div class="print-legend" aria-hidden="true">
        <span><i class="learned-dot" />Pink learned</span>
        <span><i class="current-dot" />Blue current</span>
      </div>
      <div class="print-strips">
        {axes.map((axis, index) => {
          const learned = clampPosition(axis.learnedPosition ?? 50);
          const current = effectivePosition(axis);
          const start = Math.min(learned, current);
          const distance = Math.abs(current - learned);
          return (
            <div class={`print-strip confidence-${axis.confidence ?? "low"}`} key={axis.id}>
              <div class="print-strip-meta">
                <span>{String(index + 1).padStart(2, "0")} · {axis.label}</span>
                <span>{confidenceLabel(axis.confidence)}</span>
              </div>
              <div class="print-rail">
                {distance > 0 && <span class="print-delta" style={{ left: `${start}%`, width: `${distance}%` }} />}
                <span class="print-learned" style={{ left: `${learned}%` }} />
                <span class="print-current" style={{ left: `${current}%` }} />
              </div>
              <div class="print-endpoints"><span>{axis.leftLabel}</span><span>{axis.rightLabel}</span></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AxisRow({ axis, saving, onChange }: { axis: ProfileAxis; saving: boolean; onChange: (position: number | null) => void }) {
  const learned = clampPosition(axis.learnedPosition ?? 50);
  const savedCurrent = axis.overridePosition == null ? learned : clampPosition(axis.overridePosition);
  const [draft, setDraft] = useState(savedCurrent);
  const hasOverride = axis.overridePosition != null;
  const isDirty = Math.round(draft) !== Math.round(savedCurrent);
  const sliderId = `axis-${axis.id}`;

  useEffect(() => setDraft(savedCurrent), [axis.updatedAt, axis.overridePosition, axis.learnedPosition]);

  return (
    <article class={`axis-row confidence-${axis.confidence ?? "low"}`}>
      <div class="axis-row-head">
        <div>
          <h3>{axis.label}</h3>
          <p>{axis.evidenceCount ? "Learned" : "Not enough input yet"}</p>
        </div>
        <span class={`axis-status${hasOverride ? " adjusted" : ""}`}>{isDirty ? "Unsaved" : hasOverride ? "Adjusted" : "Using learned setting"}</span>
      </div>
      <div class="axis-range-labels"><span>{axis.leftLabel}</span><span>{axis.rightLabel}</span></div>
      <div class="axis-range-wrap">
        <span class="learned-marker" style={{ left: `${learned}%` }} aria-hidden="true" />
        <input
          id={sliderId}
          class="axis-range"
          type="range"
          min="0"
          max="100"
          step="1"
          value={draft}
          aria-label={`${axis.label}. Set my current preference from ${axis.leftLabel} to ${axis.rightLabel}`}
          aria-valuetext={`${positionLabel(draft)}. ${isDirty ? "Unsaved" : hasOverride ? "Adjusted" : "Using learned setting"}.`}
          disabled={saving}
          onInput={(event) => setDraft(Number((event.target as HTMLInputElement).value))}
          onChange={(event) => onChange(Number((event.target as HTMLInputElement).value))}
        />
        <span class={`current-marker${isDirty ? " draft" : ""}`} style={{ left: `${draft}%` }} aria-hidden="true" />
      </div>
      <div class="axis-row-foot">
        <span class="axis-reading">{isDirty ? "Unsaved" : hasOverride ? "Adjusted" : "Using learned setting"}</span>
        {hasOverride && <button class="clear-override" type="button" disabled={saving} onClick={() => onChange(null)}>Use learned setting</button>}
      </div>
    </article>
  );
}

function StatusNotice({ tone, message, actionLabel, onAction }: { tone: "success" | "error"; message: string; actionLabel?: string; onAction?: () => void }) {
  return <div class={`status-notice ${tone}`} role={tone === "error" ? "alert" : "status"}><span>{message}</span>{actionLabel && onAction && <button type="button" class="notice-action" onClick={onAction}>{actionLabel}</button>}</div>;
}

function clampPosition(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function effectivePosition(axis: ProfileAxis): number {
  return clampPosition(axis.overridePosition ?? axis.learnedPosition ?? 50);
}

function confidenceLabel(confidence: ProfileAxis["confidence"]): string {
  if (confidence === "established") return "Established";
  if (confidence === "growing") return "Growing";
  return "Low";
}

function positionLabel(position: number): string {
  const value = clampPosition(position);
  if (value <= 20) return "strongly toward the left";
  if (value <= 42) return "leaning left";
  if (value < 58) return "near the middle";
  if (value < 80) return "leaning right";
  return "strongly toward the right";
}
