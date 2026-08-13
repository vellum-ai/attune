/**
 * The content of the onboarding: what each dimension asks, and how its answers
 * are phrased when they reach the assistant.
 *
 * Kept apart from the components because this is the part that gets edited most
 * — a pair that turns out not to discriminate is a copy change, not a UI change.
 */

export type DimensionId = "writing" | "music" | "web-design" | "interior-design";

/** One this-or-that call. */
export interface AxisMeta {
  id: string;
  label: string;
  leftLabel: string;
  rightLabel: string;
}

export interface Pair {
  /** Stable id, used as the answer key and never shown. */
  id: string;
  /** What the two options are a choice about, in the user's words. */
  question: string;
  axis: AxisMeta;
  a: Option;
  b: Option;
}

export interface Option {
  /** What the user reads. Concrete — a sample or a description, not an axis. */
  body: string;
  /** How this choice is described to the assistant. */
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
      placeholder: "Paste a few paragraphs you wrote, or drop in URLs — one per line.",
      hint: "Two or three samples beats a dozen. Things you'd be happy to have written.",
    },
    pairs: [
      { id: "hedging", axis: { id: "hedging", label: "Certainty", leftLabel: "Certain", rightLabel: "Tentative" }, question: "Which reads more like you?", a: { body: "The deploy failed because the migration ran twice. I'd roll back and re-run it with the lock held.", means: "states findings flatly, without hedging" }, b: { body: "It looks like the deploy may have run into trouble — possibly the migration. It might be worth considering a rollback.", means: "leaves room for doubt in the phrasing rather than asserting" } },
      { id: "order", axis: { id: "order", label: "Structure", leftLabel: "Conclusion first", rightLabel: "Reasoning first" }, question: "Where does the point go?", a: { body: "We should drop the feature. It costs two weeks, and nobody in the last four interviews asked for it.", means: "puts the conclusion first, then the reasoning" }, b: { body: "Nobody in the last four interviews asked for it, and it costs two weeks — so I think we should drop the feature.", means: "builds the reasoning first and lands on the conclusion" } },
      { id: "ornament", axis: { id: "ornament", label: "Figurative language", leftLabel: "Literal", rightLabel: "Figurative" }, question: "Which sentence would you keep?", a: { body: "The API is slow under load.", means: "plain and literal, no figurative language" }, b: { body: "The API buckles the moment you lean on it.", means: "reaches for an image when it makes the point land harder" } },
      { id: "length", axis: { id: "length", label: "Sentence length", leftLabel: "Compressed", rightLabel: "Expansive" }, question: "Pick a rhythm.", a: { body: "It broke. We know why. The fix is small.", means: "short declaratives, one idea per sentence" }, b: { body: "It broke for a reason we now understand, and the fix turns out to be small enough that it can go out with the next release.", means: "longer sentences that carry several clauses" } },
      { id: "jargon", axis: { id: "jargon", label: "Technical language", leftLabel: "Insider", rightLabel: "Glossed" }, question: "Writing for people who know the domain:", a: { body: "The migration ran twice because the advisory lock wasn't held.", means: "uses technical terms unglossed and trusts the reader" }, b: { body: "The migration ran twice because a lock — a way of making sure only one process does the work — wasn't held.", means: "glosses technical terms as it goes" } },
    ],
  },
  {
    id: "music",
    label: "Music",
    page: "taste-music",
    blurb: "What you reach for, and what you reach for it instead of",
    sources: { kind: "list", label: "Artists you'd put on without thinking", placeholder: "Add an artist and press Enter", hint: "Five or six is plenty. Ones you actually return to, not ones you admire." },
    pairs: [
      { id: "texture", axis: { id: "texture", label: "Recording texture", leftLabel: "Close and dry", rightLabel: "Wide and washed" }, question: "Which room do you want to be in?", a: { body: "Close and dry. You can hear fingers on strings, breath before a line.", means: "sparse, close-miked recordings with audible detail" }, b: { body: "Wide and washed. Everything sits inside a big reverb.", means: "dense, reverberant productions with a large sense of space" } },
      { id: "palette", axis: { id: "palette", label: "Sound palette", leftLabel: "Acoustic", rightLabel: "Electronic" }, question: "Where should the sounds come from?", a: { body: "Played on things — piano, brushed drums, upright bass.", means: "acoustic instrumentation" }, b: { body: "Built — synths, drum machines, processed to taste.", means: "electronic and synthetic textures" } },
      { id: "motion", axis: { id: "motion", label: "Energy", leftLabel: "Still", rightLabel: "Propulsive" }, question: "What should it do to the room?", a: { body: "Slow it down. Something to think over.", means: "quieter, more melancholy records that create stillness" }, b: { body: "Move it. Something with a floor to it.", means: "propulsive, rhythm-forward records with momentum" } },
      { id: "demand", axis: { id: "demand", label: "Accessibility", leftLabel: "Immediate", rightLabel: "Demanding" }, question: "How hard should it work you?", a: { body: "Familiar on the first listen and better on the tenth.", means: "immediately warm records that reward repetition" }, b: { body: "Difficult at first. Worth it later.", means: "demanding, unfamiliar records that take effort to enter" } },
    ],
  },
  {
    id: "web-design",
    label: "Web Design",
    page: "taste-web-design",
    blurb: "How digital spaces should guide attention and hold a point of view",
    sources: { kind: "none", label: "Web references", hint: "Attach a few sites or screenshots in the chat after this. The questions establish your baseline; references make it specific." },
    pairs: [
      { id: "web-density", axis: { id: "web-density", label: "Information density", leftLabel: "Spacious", rightLabel: "Layered" }, question: "When you land on a homepage, what feels right?", a: { body: "One clear proposition, generous margins, and a next step that is impossible to miss.", means: "edited, spacious pages with one dominant idea" }, b: { body: "Several threads visible at once: navigation, stories, tools, and details worth wandering into.", means: "layered, information-rich pages that reward exploration" } },
      { id: "web-hierarchy", axis: { id: "web-hierarchy", label: "Hierarchy", leftLabel: "Explicit", rightLabel: "Discovered" }, question: "How should a page reveal itself?", a: { body: "The hierarchy is obvious in a glance: headline, proof, action. Everything else waits its turn.", means: "strong, explicit visual hierarchy with a clear reading path" }, b: { body: "The page unfolds gradually; scale, rhythm, and proximity let you discover what matters.", means: "quieter hierarchy that reveals importance through pacing and context" } },
      { id: "web-type", axis: { id: "web-type", label: "Typography", leftLabel: "Neutral", rightLabel: "Expressive" }, question: "What role should typography play?", a: { body: "A neutral grotesk, carefully set. It should make the system feel calm and inevitable.", means: "restrained, neutral typography used for clarity and composure" }, b: { body: "A distinctive face with character. The type should announce that this is not another template.", means: "expressive typography used as a visible part of the brand" } },
      { id: "web-navigation", axis: { id: "web-navigation", label: "Navigation", leftLabel: "Persistent", rightLabel: "Hidden until needed" }, question: "How should navigation behave?", a: { body: "Stable and legible. I always know where I am and what the important routes are.", means: "persistent, predictable navigation that prioritizes orientation" }, b: { body: "Lightly hidden until needed. The content gets the stage; the interface appears when invited.", means: "minimal, unobtrusive navigation that keeps the canvas quiet" } },
      { id: "web-colour", axis: { id: "web-colour", label: "Colour", leftLabel: "Quiet", rightLabel: "Assertive" }, question: "Pick the site's colour attitude.", a: { body: "Near-neutrals with one precise accent, used like a mark in the margin.", means: "quiet neutral palettes with a controlled accent colour" }, b: { body: "A confident field of colour, with contrast and shifts that make the interface feel alive.", means: "assertive, colour-led systems with energetic contrast" } },
      { id: "web-motion", axis: { id: "web-motion", label: "Motion", leftLabel: "Purposeful", rightLabel: "Atmospheric" }, question: "What should motion do?", a: { body: "Clarify a change: a panel settles, a state updates, a route has continuity.", means: "subtle, purposeful motion that explains interface state" }, b: { body: "Create atmosphere: scroll, hover, and transition become part of the composition.", means: "expressive motion that contributes mood and personality" } },
      { id: "web-imagery", axis: { id: "web-imagery", label: "Imagery", leftLabel: "Selective", rightLabel: "Abundant" }, question: "When imagery is present, what should it feel like?", a: { body: "Specific and editorial — one image with a reason to be there, framed with care.", means: "selective, art-directed imagery with editorial restraint" }, b: { body: "Abundant and immediate — a visual field that makes the product or world feel tangible.", means: "image-forward experiences with visual abundance and immediacy" } },
      { id: "web-surface", axis: { id: "web-surface", label: "Surface", leftLabel: "Flat", rightLabel: "Tactile" }, question: "How much interface should look like an object?", a: { body: "Mostly flat: type, spacing, and rules do the work; surfaces recede.", means: "flat, architectural interfaces with restrained surface treatment" }, b: { body: "Tactile layers: cards, panels, shadows, and texture make the system feel inhabitable.", means: "tactile interfaces with visible layers and material surfaces" } },
      { id: "web-finish", axis: { id: "web-finish", label: "Finish", leftLabel: "Polished", rightLabel: "Imperfect" }, question: "What makes a launch feel finished?", a: { body: "Every edge is quiet: spacing is exact, states are covered, and nothing asks for attention by accident.", means: "near-invisible polish, consistency, and disciplined restraint" }, b: { body: "There is a little friction and surprise — a rough edge that proves a person made it.", means: "intentional imperfection and unexpected details that show authorship" } },
    ],
  },
  {
    id: "interior-design",
    label: "Interior Design",
    page: "taste-interior-design",
    blurb: "The rooms, materials, and degree of calm you want to live inside",
    sources: { kind: "none", label: "Interior references", hint: "Attach rooms, objects, or spaces you respond to in the chat after this. A few specific references will sharpen the profile." },
    pairs: [
      { id: "interior-plan", axis: { id: "interior-plan", label: "Plan", leftLabel: "Open", rightLabel: "Zoned" }, question: "How should a room organize your attention?", a: { body: "Open and legible. You can read the whole room and move through it without obstacles.", means: "open plans with clear sightlines and unforced circulation" }, b: { body: "Composed in zones. Each corner has its own temperature and gives you somewhere to settle.", means: "layered rooms with distinct, intimate zones" } },
      { id: "interior-light", axis: { id: "interior-light", label: "Light", leftLabel: "Crisp", rightLabel: "Atmospheric" }, question: "What kind of light makes a room feel like yours?", a: { body: "Cool daylight, crisp edges, and an honest sense of the room's structure.", means: "bright, directional light that emphasizes clarity and architecture" }, b: { body: "Low pools of warm light, with shadows doing as much as the fixtures.", means: "warm, atmospheric lighting with depth and softness" } },
      { id: "interior-palette", axis: { id: "interior-palette", label: "Palette", leftLabel: "Neutral", rightLabel: "Colourful" }, question: "Choose a base palette.", a: { body: "Chalk, stone, timber, blackened metal — quiet materials close to their natural tones.", means: "neutral, mineral palettes with restrained tonal variation" }, b: { body: "A saturated wall, a coloured sofa, or a rug that changes the weather of the room.", means: "confident colour used to give rooms a strong emotional register" } },
      { id: "interior-material", axis: { id: "interior-material", label: "Material", leftLabel: "Precise", rightLabel: "Tactile" }, question: "Which material language feels more alive?", a: { body: "Smooth plaster, honed stone, brushed steel: surfaces with a precise, quiet finish.", means: "refined, smooth materials with controlled precision" }, b: { body: "Wool, raw wood, glazed ceramic, linen: surfaces that show touch and variation.", means: "tactile, natural materials with visible irregularity" } },
      { id: "interior-furniture", axis: { id: "interior-furniture", label: "Furniture", leftLabel: "Quiet", rightLabel: "Sculptural" }, question: "What should the big pieces do?", a: { body: "Hold their line. Low, simple silhouettes that leave the architecture in charge.", means: "quiet, low-slung furniture with disciplined silhouettes" }, b: { body: "Make a gesture. A generous chair, a sculptural table, something with a clear point of view.", means: "sculptural statement furniture that anchors the room" } },
      { id: "interior-object", axis: { id: "interior-object", label: "Objects", leftLabel: "Edited", rightLabel: "Collected" }, question: "How should objects enter the room?", a: { body: "Few and deliberate: one vessel, one artwork, one thing with enough space around it.", means: "sparse, edited objects with generous breathing room" }, b: { body: "Collected over time: books, ceramics, pictures, and useful things forming a personal layer.", means: "accumulated collections that make a room feel inhabited" } },
      { id: "interior-age", axis: { id: "interior-age", label: "Time", leftLabel: "Contemporary", rightLabel: "Eclectic" }, question: "Where should the room sit in time?", a: { body: "Current but not trendy. New work, clean details, and a sense of the present.", means: "contemporary rooms with crisp, forward-looking details" }, b: { body: "A conversation across decades: old timber, inherited forms, and modern pieces together.", means: "eclectic rooms that mix eras and visible history" } },
      { id: "interior-comfort", axis: { id: "interior-comfort", label: "Comfort", leftLabel: "Orderly", rightLabel: "Soft" }, question: "What kind of comfort matters most?", a: { body: "The comfort of order — nothing fights the eye, and the room resets easily.", means: "calm, orderly comfort with low visual noise" }, b: { body: "The comfort of softness — deep upholstery, blankets, books, and permission to stay awhile.", means: "sensory, enveloping comfort with visible signs of use" } },
      { id: "interior-contrast", axis: { id: "interior-contrast", label: "Contrast", leftLabel: "Measured", rightLabel: "High tension" }, question: "How much tension should a room have?", a: { body: "Close tones and measured contrasts. The room should reveal itself slowly.", means: "low-contrast rooms with a quiet, gradual atmosphere" }, b: { body: "A dark wall against pale stone, a hard edge beside something soft — enough tension to keep it awake.", means: "deliberate contrast between light, dark, hard, and soft elements" } },
    ],
  },
];

export function dimensionById(id: DimensionId): Dimension {
  const found = DIMENSIONS.find((d) => d.id === id);
  if (!found) throw new Error(`unknown dimension: ${id}`);
  return found;
}
