/**
 * The content of the onboarding: what each dimension asks, and how its answers
 * are phrased when they reach the assistant.
 *
 * Kept apart from the components because this is the part that gets edited most
 * — a pair that turns out not to discriminate is a copy change, not a UI change.
 */

export type DimensionId = "writing" | "music" | "visual";

/** One this-or-that call. */
export interface Pair {
  /** Stable id, used as the answer key and never shown. */
  id: string;
  /** What the two options are a choice about, in the user's words. */
  question: string;
  a: Option;
  b: Option;
}

export interface Option {
  /** What the user reads. Concrete — a sample or a description, not an axis. */
  body: string;
  /**
   * How this choice is described to the assistant. A phrase that completes
   * "prefers …", so the relayed prompt reads as preferences rather than as
   * answers to a quiz the assistant never saw.
   */
  means: string;
}

export interface Dimension {
  id: DimensionId;
  label: string;
  /** The concept page this dimension's memory is filed to. */
  page: string;
  /** One line under the title on the home card. */
  blurb: string;
  pairs: Pair[];
  sources: SourceSpec;
}

/** What source material this dimension takes, and how the input behaves. */
export interface SourceSpec {
  kind: "text" | "list" | "none";
  label: string;
  placeholder?: string;
  /** Shown under the field. Say what good input looks like. */
  hint: string;
}

/**
 * Samples are deliberately about the same subject within a pair, so the choice
 * is about how it is said rather than about which topic is more interesting.
 */
export const DIMENSIONS: Dimension[] = [
  {
    id: "writing",
    label: "Writing",
    page: "taste-writing",
    blurb: "How your drafts should sound before you touch them",
    sources: {
      kind: "text",
      label: "Writing you'd point at as yours",
      placeholder:
        "Paste a few paragraphs you wrote, or drop in URLs — one per line.",
      hint: "Two or three samples beats a dozen. Things you'd be happy to have written.",
    },
    pairs: [
      {
        id: "hedging",
        question: "Which reads more like you?",
        a: {
          body: "The deploy failed because the migration ran twice. I'd roll back and re-run it with the lock held.",
          means: "states findings flatly, without hedging",
        },
        b: {
          body: "It looks like the deploy may have run into trouble — possibly the migration. It might be worth considering a rollback.",
          means: "leaves room for doubt in the phrasing rather than asserting",
        },
      },
      {
        id: "order",
        question: "Where does the point go?",
        a: {
          body: "We should drop the feature. It costs two weeks, and nobody in the last four interviews asked for it.",
          means: "puts the conclusion first, then the reasoning",
        },
        b: {
          body: "Nobody in the last four interviews asked for it, and it costs two weeks — so I think we should drop the feature.",
          means: "builds the reasoning first and lands on the conclusion",
        },
      },
      {
        id: "ornament",
        question: "Which sentence would you keep?",
        a: {
          body: "The API is slow under load.",
          means: "plain and literal, no figurative language",
        },
        b: {
          body: "The API buckles the moment you lean on it.",
          means: "reaches for an image when it makes the point land harder",
        },
      },
      {
        id: "length",
        question: "Pick a rhythm.",
        a: {
          body: "It broke. We know why. The fix is small.",
          means: "short declaratives, one idea per sentence",
        },
        b: {
          body: "It broke for a reason we now understand, and the fix turns out to be small enough that it can go out with the next release.",
          means: "longer sentences that carry several clauses",
        },
      },
      {
        id: "jargon",
        question: "Writing for people who know the domain:",
        a: {
          body: "The migration ran twice because the advisory lock wasn't held.",
          means: "uses technical terms unglossed and trusts the reader",
        },
        b: {
          body: "The migration ran twice because a lock — a way of making sure only one process does the work — wasn't held.",
          means: "glosses technical terms as it goes",
        },
      },
    ],
  },
  {
    id: "music",
    label: "Music",
    page: "taste-music",
    blurb: "What you reach for, and what you reach for it instead of",
    sources: {
      kind: "list",
      label: "Artists you'd put on without thinking",
      placeholder: "Add an artist and press Enter",
      hint: "Five or six is plenty. Ones you actually return to, not ones you admire.",
    },
    pairs: [
      {
        id: "texture",
        question: "Which room do you want to be in?",
        a: {
          body: "Close and dry. You can hear fingers on strings, breath before a line.",
          means: "sparse, close-miked recordings with audible detail",
        },
        b: {
          body: "Wide and washed. Everything sits inside a big reverb.",
          means: "dense, reverberant productions with a large sense of space",
        },
      },
      {
        id: "palette",
        question: "Where should the sounds come from?",
        a: {
          body: "Played on things — piano, brushed drums, upright bass.",
          means: "acoustic instrumentation",
        },
        b: {
          body: "Built — synths, drum machines, processed to taste.",
          means: "electronic and synthetic textures",
        },
      },
      {
        id: "motion",
        question: "What should it do to the room?",
        a: {
          body: "Slow it down. Something to think over.",
          means: "quieter, more melancholy records that create stillness",
        },
        b: {
          body: "Move it. Something with a floor to it.",
          means: "propulsive, rhythm-forward records with momentum",
        },
      },
      {
        id: "demand",
        question: "How hard should it work you?",
        a: {
          body: "Familiar on the first listen and better on the tenth.",
          means: "immediately warm records that reward repetition",
        },
        b: {
          body: "Difficult at first. Worth it later.",
          means: "demanding, unfamiliar records that take effort to enter",
        },
      },
    ],
  },
  {
    id: "visual",
    label: "Visual",
    page: "taste-visual",
    blurb: "How much the work is allowed to shout",
    sources: {
      kind: "none",
      label: "Images",
      hint: "Attach a few images in the chat after this — screenshots, covers, pages you like. The questionnaire gets a starting read; images make it specific.",
    },
    pairs: [
      {
        id: "density",
        question: "How full should a page be?",
        a: {
          body: "One idea, a lot of air around it.",
          means: "spare layouts with generous whitespace",
        },
        b: {
          body: "Packed, layered, rewarding a second look.",
          means: "dense, maximal layouts with a lot to read",
        },
      },
      {
        id: "contrast",
        question: "Pick a register.",
        a: {
          body: "Hard contrast. Black, white, one colour that means something.",
          means: "high-contrast palettes with a single deliberate accent",
        },
        b: {
          body: "Low contrast. Close tones, nothing shouting.",
          means: "muted, close-toned palettes",
        },
      },
      {
        id: "form",
        question: "What are the shapes like?",
        a: {
          body: "Ruled. Grids, right angles, things that line up.",
          means: "geometric, grid-led composition",
        },
        b: {
          body: "Drawn. Hand-made edges, things slightly off.",
          means: "organic, hand-made forms",
        },
      },
      {
        id: "lead",
        question: "What carries it?",
        a: {
          body: "The type. Set well enough that it doesn't need a picture.",
          means: "typography-led design",
        },
        b: {
          body: "The image. Type stays out of the way.",
          means: "image-led design with restrained type",
        },
      },
    ],
  },
];

export function dimensionById(id: DimensionId): Dimension {
  const found = DIMENSIONS.find((d) => d.id === id);
  if (!found) {
    throw new Error(`unknown dimension: ${id}`);
  }
  return found;
}
