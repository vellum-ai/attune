# Attune

Teach your Vellum assistant what good feels like, then let that understanding improve without turning every one-off request into a permanent preference.

## Four dimensions

| Dimension | Memory page | What it captures |
| --- | --- | --- |
| Writing | `taste-writing` | Certainty, structure, figurative language, sentence length, technical language |
| Music | `taste-music` | Recording texture, sound palette, energy, accessibility |
| Web Design | `taste-web-design` | Density, hierarchy, typography, navigation, colour, motion, imagery, surface, finish |
| Interior Design | `taste-interior-design` | Plan, light, palette, material, furniture, objects, era, comfort, contrast |

## A living profile, not a questionnaire receipt

Attune keeps two complementary records:

- **Memory pages** are the readable editorial description the assistant recalls before styleful work.
- **The structured profile** is the canonical axis-level state. It keeps onboarding baseline, learned evidence, named confidence, and explicit manual overrides separate.

Both are read before styleful work. The profile is read through the skill-scoped
`read_profile` tool, which renders each axis as a directive position rather than
JSON. Without that read the profile would be write-only: a slider moved in the
app changes `profile.json` and nothing else, so the calibration would never
reach the reply it was meant to shape.

The lifecycle is deliberate:

1. Onboarding creates a low-confidence baseline.
2. Durable, generalizable reactions add qualitative evidence through the skill-scoped `update_profile` tool.
3. Repeated agreement can raise confidence.
4. Slider changes are exact, reversible overrides. They never rewrite the learned evidence underneath.

One-off project constraints, silence, acceptance, and contentless praise are not durable evidence.

## Onboarding app

The app presents one binary question per screen. Choosing an answer advances automatically; **Back** is always available to review or correct an earlier choice. Reduced-motion users advance without an artificial delay.

Writing accepts pasted samples or links. Music accepts a short artist list. Web Design and Interior Design establish their baseline directly and invite visual references in chat afterwards.

The final summary is the consent point. **Save profile** first persists the complete baseline to the structured profile. Only after that succeeds does the app relay the hardened memory hand-off prompt.

### Hardened prompt boundary

`apps/taste/src/prompt.ts` keeps trusted instructions separate from user-controlled evidence:

- The destination page comes from a closed dimension-to-page map.
- Samples, list items, and URLs are serialized as a single JSON line inside an explicitly untrusted evidence block.
- URL classification rejects non-HTTPS, credential-bearing, localhost, and private-network targets.
- Size caps prevent unbounded hand-offs.
- Raw samples, fetched text, instructions, secrets, and unrelated facts are never valid memory output.

The app itself never fetches external source URLs.

## Structured profile architecture

The canonical profile lives at:

```text
$VELLUM_WORKSPACE_DIR/plugins-data/taste/profile.json
```

Plugin surfaces:

- `routes/profile.ts` exposes GET plus `set_baseline` and `set_override` mutations in the plugin namespace.
- `skills/taste/tools/update_profile.ts` owns deterministic aggregation, neutral priors, validation, lock-file coordination, and atomic writes.
- `skills/taste/tools/read_profile.ts` is the assistant's read path. It resolves each axis to an effective position (a manual override wins over the learned position), names the confidence band, and omits the private evidence ledger.
- `skills/taste/TOOLS.json` exposes the two skill tools. `update_profile` takes only qualitative learned-evidence inputs — dimension, axis, direction, strength, and reason — and enumerates every axis id it accepts, so the model never guesses one.
- `hooks/post-tool-use.ts` publishes the `taste:profile` invalidation tag after successful learned-profile updates.
- The app uses `window.vellum.fetch` only for `/x/plugins/taste/profile`, and subscribes to `taste:profile` to re-read canonical state.

Public profile responses omit the private evidence ledger. Manual overrides remain separate from learned weights and confidence.

## Interface

Once any dimension has a baseline, the app opens profile-first. All four dimensions remain visible. Each axis uses an independent horizontal witness strip rather than a radar chart or synthetic score:

- pink witness: learned position
- cobalt fixture: current preference
- named confidence: Low, Growing, or Established
- evidence count and latest generalized reason
- coarse override slider and clear action

The visual system is a flat editorial catalogue: cobalt field, off-white paper surfaces, black rules, and restrained pink signals. No gradients, fake measurement dashboards, or generated `dist` edits.

## Development

```bash
bun install --frozen-lockfile
bun run typecheck
bun test
bun run build
```

`apps/taste/dist` is generated and ignored. The Vellum watcher owns the runtime build. Do not hand-edit or commit it.

The tests cover prompt separation, final skill policy, static runtime safety, structured-profile invariants, the calibration round trip, and reproducible builds.

## Install

```bash
assistant plugins install https://github.com/vellum-ai/attune
```

The plugin contributes the Taste skill, living-profile app, namespaced route, profile read and update tools, and invalidation hook.
