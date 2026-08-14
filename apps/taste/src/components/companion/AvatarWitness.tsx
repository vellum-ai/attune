import { useEffect, useState } from "preact/hooks";

import { fetchTasteAvatar, type AvatarTraits, type TasteAvatar } from "../../vellum";

interface AvatarWitnessProps {
  mood?: "idle" | "left" | "right" | "saved";
  size?: "compact" | "hero";
}

interface MotionState {
  blinking: boolean;
  look: -1 | 0 | 1;
}

const FALLBACK_TRAITS: AvatarTraits = { bodyShape: "urchin", eyeStyle: "goofy", color: "teal" };

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function isNativeCharacter(traits: AvatarTraits | null | undefined): boolean {
  return traits?.bodyShape === "urchin" && traits.eyeStyle === "goofy" && traits.color === "teal";
}

/**
 * Decorative assistant witness (pointer-events: none). The native character is always available as a
 * neutral fallback; a custom image is used only when the host has image-only
 * avatar state. The witness never owns or announces a choice.
 */
export function AvatarWitness({ mood = "idle", size = "compact" }: AvatarWitnessProps) {
  const [avatar, setAvatar] = useState<TasteAvatar | null>(null);
  const [reduce, setReduce] = useState(prefersReducedMotion);
  const [motion, setMotion] = useState<MotionState>({ blinking: false, look: 0 });

  useEffect(() => {
    let active = true;
    void fetchTasteAvatar().then((next) => {
      if (active) setAvatar(next);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const media = typeof window !== "undefined" ? window.matchMedia?.("(prefers-reduced-motion: reduce)") : undefined;
    if (!media) return;
    const update = () => setReduce(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    if (reduce) {
      setMotion({ blinking: false, look: 0 });
      return;
    }

    let cancelled = false;
    let blinkTimer: number | undefined;
    let blinkEndTimer: number | undefined;
    let lookTimer: number | undefined;
    let lookEndTimer: number | undefined;

    const scheduleBlink = () => {
      blinkTimer = window.setTimeout(() => {
        if (cancelled) return;
        setMotion((current) => ({ ...current, blinking: true }));
        blinkEndTimer = window.setTimeout(() => {
          if (cancelled) return;
          setMotion((current) => ({ ...current, blinking: false }));
          scheduleBlink();
        }, 135);
      }, randomBetween(3200, 6800));
    };

    const scheduleLook = () => {
      lookTimer = window.setTimeout(() => {
        if (cancelled) return;
        const next = (Math.random() < 0.5 ? -1 : 1) as -1 | 1;
        setMotion((current) => ({ ...current, look: next }));
        lookEndTimer = window.setTimeout(() => {
          if (cancelled) return;
          setMotion((current) => ({ ...current, look: 0 }));
          scheduleLook();
        }, randomBetween(520, 900));
      }, randomBetween(4200, 8200));
    };

    scheduleBlink();
    scheduleLook();
    return () => {
      cancelled = true;
      for (const timer of [blinkTimer, blinkEndTimer, lookTimer, lookEndTimer]) {
        if (timer !== undefined) window.clearTimeout(timer);
      }
    };
  }, [reduce]);

  const routeTraits = avatar?.kind === "character" && isNativeCharacter(avatar.traits) ? avatar.traits : null;
  const native = routeTraits !== null || avatar?.kind !== "image";
  const traits = routeTraits ?? FALLBACK_TRAITS;
  const activeMood = reduce ? "idle" : mood;
  const look = reduce ? 0 : mood === "left" ? -1 : mood === "right" ? 1 : motion.look;

  return (
    <div
      class={`avatar-witness avatar-witness-${size} avatar-mood-${activeMood}`}
      aria-hidden="true"
      data-slot="avatar-witness"
      style={{ pointerEvents: "none" }}
      data-native-avatar={native ? "true" : "false"}
      data-motion={reduce ? "reduced" : "full"}
      data-blinking={motion.blinking ? "true" : "false"}
      data-look={look}
    >
      {native ? <NativeUrchin blinking={motion.blinking} look={look} traits={traits} /> : avatar?.image ? <img src={avatar.image} alt="" /> : <NativeUrchin blinking={false} look={0} traits={FALLBACK_TRAITS} />}
    </div>
  );
}

function NativeUrchin({ blinking, look, traits }: { blinking: boolean; look: -1 | 0 | 1; traits: AvatarTraits }) {
  const pupilShift = look * 2.1;
  return (
    <svg viewBox="0 0 120 120" role="presentation" data-body-shape={traits.bodyShape} data-eye-style={traits.eyeStyle} data-color={traits.color}>
      <g class="avatar-character">
        <path class="avatar-spikes" d="M19 45 6 34l17 1-8-17 17 10 1-20 11 16L54 5l6 19L76 9l-2 20 21-11-10 20 20-3-17 14 19 8-21 6 13 15-21-4 3 20-19-13-7 20-8-20-16 15 1-20-19 8 10-18-21 1 17-14Z" />
        <path class="avatar-body" d="M24 48c2-18 18-31 38-32 22-1 39 13 40 34 2 22-12 42-34 48-20 5-42-4-48-23-3-9 2-18 4-27Z" />
        <g class="avatar-eyes" style={{ transform: blinking ? "scaleY(.08)" : "scaleY(1)", transformOrigin: "60px 52px" }}>
          <circle class="avatar-eye" cx="45" cy="52" r="10" />
          <circle class="avatar-eye" cx="76" cy="52" r="10" />
          <circle class="avatar-pupil" cx="45" cy="53" r="4.2" style={{ transform: `translateX(${pupilShift}px)` }} />
          <circle class="avatar-pupil" cx="76" cy="53" r="4.2" style={{ transform: `translateX(${pupilShift}px)` }} />
          <circle class="avatar-glint" cx="43.5" cy="51.5" r="1.3" />
          <circle class="avatar-glint" cx="74.5" cy="51.5" r="1.3" />
        </g>
        <path class="avatar-mouth" d="M48 72c5 6 13 8 20 6 4-1 7-3 10-7" />
        <path class="avatar-mark" d="M29 35c3-4 7-6 11-6" />
      </g>
    </svg>
  );
}

export function CompanionField({ phase = "idle" }: { phase?: "idle" | "takeover" | "return" }) {
  return (
    <div class={`companion-field companion-phase-${phase}`} aria-hidden="true" data-slot="companion-field">
      <AvatarWitness size="hero" mood={phase === "return" ? "saved" : "idle"} />
    </div>
  );
}
