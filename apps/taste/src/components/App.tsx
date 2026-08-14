/**
 * The app's screens: the calibration home, one dimension's flow, and — once
 * any dimension has a saved baseline — the living-profile dashboard.
 *
 * Completion truth is layered honestly: inside Vellum the durable records are
 * the structured profile (read over the profile route) and the plugin journal
 * (read over the taste route, refreshed on the plugin's sync tags); the local
 * store is a courtesy cache that keeps the plain-browser preview useful. The
 * card copy says which one it is showing.
 */

import { useEffect, useState } from "preact/hooks";

import { DIMENSIONS, dimensionById, type DimensionId } from "../data";
import { PAGE_BY_DIMENSION } from "../payload";
import { onCompletionChange, readCompletion, type CompletionState } from "../storage";
import {
  fetchCompletion,
  fetchTasteProfile,
  hostAvailable,
  relayPrompt,
  routeAvailable,
  setOverride,
  showSplit,
  subscribeTasteChanges,
  type ProfileAxis,
  type TasteProfile,
} from "../vellum";
import { Flow } from "./Flow";

type ServerCompletion = Record<string, { persistedAt: string; statements: number }>;

export function App() {
  const [open, setOpen] = useState<DimensionId | null>(null);
  const [local, setLocal] = useState<CompletionState>(readCompletion);
  const [server, setServer] = useState<ServerCompletion | null>(null);
  const [profile, setProfile] = useState<TasteProfile | null>(null);

  const refresh = async () => {
    setLocal(readCompletion());
    if (routeAvailable()) {
      const [completion, nextProfile] = await Promise.all([
        fetchCompletion(),
        fetchTasteProfile(),
      ]);
      setServer(completion);
      setProfile(nextProfile);
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

  const profileFirst = (profile?.dimensions ?? []).some((dimension) => dimension.baselineComplete);
  if (profileFirst && profile) {
    return (
      <ProfileDashboard
        profile={profile}
        onRefresh={() => void refresh()}
        onCalibrate={(id) => setOpen(id)}
      />
    );
  }

  return (
    <CalibrationHome
      local={local}
      server={server}
      onOpen={setOpen}
    />
  );
}

function CalibrationHome({
  local,
  server,
  onOpen,
}: {
  local: CompletionState;
  server: ServerCompletion | null;
  onOpen: (id: DimensionId) => void;
}) {
  const anyBuilt =
    Object.keys(local).length > 0 || (server !== null && Object.keys(server).length > 0);

  return (
    <main class="home">
      <header class="home-head">
        <span class="product-mark"><span class="signal-tab" aria-hidden="true" />Attune</span>
        <h1>Teach your assistant what good feels like.</h1>
        <p class="lede">
          Four dimensions, each a few clear calls plus whatever references you already have. What
          comes out is a calibrated profile and a set of taste pages your assistant reads before
          its next draft.
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
            const status = persisted || localEntry?.persistedAt
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
                onClick={() => onOpen(dimension.id)}
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
                ? "Your taste lives in the calibrated profile and on memory pages your assistant reads — ask it what it has."
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
                  .join(", ")} memory pages and the calibrated profile, and tell me what each says — plainly, and say which ones are still thin.`,
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

function ProfileDashboard({
  profile,
  onRefresh,
  onCalibrate,
}: {
  profile: TasteProfile;
  onRefresh: () => void;
  onCalibrate: (id: DimensionId) => void;
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
    learnedPosition: undefined,
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
      setActionMessage({ tone: "success", text: position === null ? "Current preference cleared." : "Current preference saved." });
      onRefresh();
    } else if (result.unavailable) {
      setActionMessage({ tone: "error", text: "This preview is outside Vellum — calibration is not saved here." });
    } else {
      setActionMessage({ tone: "error", text: result.error ?? "Could not save this preference." });
    }
  };

  return (
    <main class="home profile-home">
      <header class="home-head profile-head">
        <span class="product-mark"><span class="signal-tab" aria-hidden="true" />Attune / living profile</span>
        <h1>What good feels like, lately.</h1>
        <p class="lede">Your learned profile is a working sketch, not a verdict. Adjust the current preference when your taste moves. The evidence stays visible underneath.</p>
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
        <span class="revision-note">Revision {profile.revision}</span>
      </div>

      {savingAxis && <StatusNotice tone="success" message="Saving current preference…" />}
      {actionMessage && <StatusNotice tone={actionMessage.tone} message={actionMessage.text} />}

      {!selected.baselineComplete ? (
        <section class="profile-board empty-profile" aria-labelledby="profile-heading">
          <div class="profile-board-head">
            <div>
              <p class="section-label">{metadata.label} / no baseline yet</p>
              <h2 id="profile-heading">Give this dimension a first shape.</h2>
            </div>
            <button class="v-button primary" type="button" onClick={() => onCalibrate(selected.id as DimensionId)}>Calibrate <span aria-hidden="true">↗</span></button>
          </div>
          <p class="empty-profile-copy">Answer the short calibration set first. Once there is a baseline, this dashboard will show the learned read, confidence, and current preference separately.</p>
        </section>
      ) : (
        <>
          <section class="profile-board" aria-labelledby="profile-heading">
            <div class="profile-board-head">
              <div>
                <p class="section-label">{metadata.label} / taste print</p>
                <h2 id="profile-heading">A shape, not a score.</h2>
              </div>
              <button class="v-button secondary" type="button" onClick={() => onCalibrate(selected.id as DimensionId)}>Calibrate <span aria-hidden="true">↗</span></button>
            </div>
            <TastePrint axes={axes} />
          </section>

          <section class="axis-section" aria-labelledby="axis-heading">
            <div class="section-heading axis-heading">
              <div>
                <p class="section-label">Editable axes</p>
                <h2 id="axis-heading">Where should this move?</h2>
              </div>
              <span class="section-count">{axes.length} signals</span>
            </div>
            <p class="axis-explainer">The pink witness is what the profile learned. The cobalt fixture is your current preference. Moving the slider adds an override, it does not erase the evidence.</p>
            <div class="axis-list">
              {axes.map((axis) => (
                <AxisRow key={axis.id} axis={axis} saving={savingAxis === axis.id} onChange={(position) => void updateAxis(axis, position)} />
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function TastePrint({ axes }: { axes: ProfileAxis[] }) {
  return (
    <div class="taste-print" aria-label="Taste print. Each strip is an independent preference axis.">
      <div class="print-legend" aria-hidden="true">
        <span><i class="learned-dot" />Learned witness</span>
        <span><i class="current-dot" />Current preference</span>
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
          <p>{axis.evidenceCount ?? 0} evidence signal{axis.evidenceCount === 1 ? "" : "s"}{axis.lastReason ? ` · ${axis.lastReason}` : " · baseline only"}</p>
        </div>
        <span class={`axis-status${hasOverride ? " adjusted" : ""}`}>{isDirty ? "Adjustment ready" : hasOverride ? "Current set" : "Following evidence"}</span>
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
          aria-valuetext={`${positionLabel(draft)}. ${isDirty ? "Adjustment ready to save on release" : hasOverride ? "Current preference" : "Following learned evidence"}.`}
          disabled={saving}
          onInput={(event) => setDraft(Number((event.target as HTMLInputElement).value))}
          onChange={(event) => onChange(Number((event.target as HTMLInputElement).value))}
        />
        <span class={`current-marker${isDirty ? " draft" : ""}`} style={{ left: `${draft}%` }} aria-hidden="true" />
      </div>
      <div class="axis-row-foot">
        <span class="axis-reading">My current preference: {positionLabel(draft)} · learned: {positionLabel(learned)} · confidence: {confidenceLabel(axis.confidence)}</span>
        {hasOverride && <button class="clear-override" type="button" disabled={saving} onClick={() => onChange(null)}>Clear current preference</button>}
      </div>
    </article>
  );
}

function StatusNotice({ tone, message }: { tone: "success" | "error"; message: string }) {
  return <div class={`status-notice ${tone}`} role={tone === "error" ? "alert" : "status"}><span>{message}</span></div>;
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
