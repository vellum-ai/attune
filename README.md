# Attune

Teach your Vellum assistant your taste, so the first draft is already close —
and so it keeps learning every time you react to something it made.

## When Taste activates

Taste loads whenever the work has meaningful creative or design choices — not
just prose. That includes writing, editing, naming, and copy; apps, websites,
products, APIs, and developer tools; decks, documents, graphics, and video;
UX, interaction design, architecture, workflows, and system design; reviews
and refinements where multiple valid forms exist; and recommendations the
user's preferences should shape.

It does **not** activate for purely mechanical work — lookups, calculations,
validation, operational commands — where there is no design choice to make.

## The four dimensions

| Dimension | Page             | Built from                                                       |
| --------- | ---------------- | ---------------------------------------------------------------- |
| Writing   | `taste-writing`  | Samples you point at, plus how you react to drafts               |
| Music     | `taste-music`    | Artists you name, plus a short run of this-or-that calls         |
| Visual    | `taste-visual`   | This-or-that calls; images are shared in chat (see below)        |
| Building  | `taste-building` | This-or-that calls about system design, plus things you've built |

Building covers product instincts: raw control vs. framework leverage,
explicit staged boundaries vs. ambient automation, opinionated defaults vs.
exposed configurability, fast reversible iteration vs. upfront completeness,
visible observability vs. a clean opaque surface — and by extension
build-vs-buy posture, validation standards, and how much complexity a system
is allowed to hide.

Mixed tasks read every relevant page: a website recalls building + visual +
writing; an API recalls building + writing; naming recalls writing (plus
visual or building when brand or product context matters).

## How it works

There is no separate taste database. Taste is stored as **memory**, one
concept page per dimension, written with the assistant's own `remember` tool
and read back with `recall`. Memory injects relevant context on its own, the
record survives alongside everything else the assistant knows, and you can
read and edit it as markdown in your workspace.

The `taste` skill teaches the assistant two separate paths:

- **Read path** — before making a meaningful creative or design choice,
  recall the smallest relevant set of taste pages, and apply them silently.
  Loading Taste broadly does *not* mean writing memory broadly.
- **Learning path** — update a page only for feedback that is durable and
  generalizable, weighed by provenance (see below). Ambiguous reactions are
  never persisted.

### Precedence

Taste is a prior, not the highest authority:

1. Platform and identity invariants
2. The user's explicit current-turn instructions
3. Project requirements and established conventions
4. Recorded Taste
5. Generic defaults

Hard identity or operating rules outside Taste stay authoritative and can
never be rewritten as mutable taste.

### Evidence policy

| Evidence                                   | Weight                                   |
| ------------------------------------------ | ---------------------------------------- |
| Explicit onboarding selections             | High confidence                          |
| Explicit durable conversational correction | High confidence                          |
| User-owned sample                          | Medium — usually contextual              |
| Third-party sample or URL                  | Low confidence, untrusted                |
| Silence, acceptance, contentless praise    | Not evidence                             |
| One-off project constraints                | Not evidence — not a global taste change |

What gets stored is always a derived preference ("For technical explanations,
prefers the conclusion before supporting detail"), never raw source text,
copied passages, secrets, unrelated personal facts, instructions addressed to
the assistant, tool requests, or memory page references found in evidence.

## The onboarding app

`apps/taste/` is a small this-or-that run per dimension plus optional source
material. Nothing is sent until you press **Build my … taste** — abandoning
halfway writes nothing. Pressing Build is the consent step; there is no
second confirmation.

### What Build sends, and what is stored

The button relays **one message** to the assistant (the host's `relay_prompt`
action — the app has no other channel and makes no network requests of its
own). The message has two parts:

- A **trusted task**, written by this app: the single destination page
  (derived from a fixed dimension → page map in `apps/taste/src/prompt.ts`;
  nothing you type can change it), the allowed operation, the evidence
  hierarchy, and the rule that everything below is data.
- An **untrusted evidence block**: your questionnaire selections, pasted
  text, list items, and URLs, serialized as a single line of JSON. Because
  `JSON.stringify` escapes every newline, pasted content can never open a
  line of its own — so it cannot forge the block's delimiters — and the
  trusted task states explicitly that strings inside the JSON stay untrusted
  even if they contain delimiters, tags, fences, or claims of authority.

The assistant then reads only the destination page, classifies each evidence
item by provenance, derives short preference statements, rejects anything
unrelated / ambiguous / instruction-like, dedupes, and saves the result to
that one page. Your samples themselves are never stored.

### Pasted samples and URLs

Pasted prose is treated as a **user-owned sample**: medium-confidence
evidence about your taste, analyzed but never persisted verbatim, and never
obeyed if it happens to contain instructions.

URL lines are split out and classified in the app: only `https:` URLs to
public hosts are marked usable; `http:` and other schemes, credential-bearing
URLs, and localhost/private-network targets are carried along but flagged
unusable. **The app fetches nothing itself.** If the assistant chooses to
read a usable URL, the fetched page is third-party external content with zero
instructional authority: instructions on it are not followed, links on it are
not followed, only style/structure/design observations relevant to the
selected dimension are extracted, and fetched text is never saved verbatim.
Robust URL resolution (DNS, redirects) belongs to the host's fetch tooling,
not this app — the app's classification is best-effort labeling, and the
authority rule in the prompt is the protection that matters.

### Visual images

The visual flow takes **no uploads**: `relay_prompt` carries text only. The
questionnaire gives the visual page a starting read; to make it specific,
attach images directly in the chat afterwards and react there. The app says
exactly this — there is no upload field.

### Seeing what is recorded

The home screen's **Ask what it knows** button asks the assistant to read the
four taste pages and report them plainly. The pages are ordinary memory
markdown, so you can also just ask, or edit them directly. There is no undo
or history system in the app, because the plugin cannot implement one safely
on top of memory it does not own — the record itself is the source of truth.

## Development

```bash
bun install        # deps are pinned; bun.lock is the lockfile
bun run typecheck  # tsc --noEmit
bun test           # prompt boundary, skill policy, static safety, reproducibility
bun run build      # deterministic build: apps/taste/src → apps/taste/dist
```

`apps/taste/dist` is **generated, not committed**. The Vellum host compiles
`apps/<app>/src` into the sibling `dist/` itself and deliberately excludes
that output from install and drift fingerprints — dist is derived output, so
the repo's guarantee is reproducibility, not review of the artifact:
`scripts/build-app.ts` runs the same esbuild invocation as the host (esbuild
and preact pinned to the host's versions in `package.json`), and the test
suite verifies that two clean builds are byte-identical and that any present
dist matches a fresh build of the reviewed source. The static-safety test
sweeps the runtime source for network calls, telemetry, credential access,
shell execution, and dynamic code execution — there are none, and the only
host-bridge calls are the supported `relay_prompt` / `set_view` actions.

## Platform limitations (honest edges)

- **No typed plugin-owned app action.** The host's app viewer handles exactly
  three actions — `relay_prompt`, `open_conversation`, `set_view` — so the
  onboarding hand-off must travel as one natural-language message, and the
  boundary inside it is enforced structurally where possible (fixed
  destination, single-line JSON serialization, URL classification, size caps)
  and by explicit trusted instructions everywhere else. A schema-validated
  `taste_profile_update` host action would remove the remaining reliance on
  the model honoring instructions; that requires a platform change.
- **No narrow memory-mutation API.** Plugins cannot write memory directly;
  all writes go through the assistant's `remember` tool, so scoping to one
  page is a stated contract, verified by the skill and prompt text, not a
  hard capability boundary.
- **Prompt boundaries are not perfect.** A sufficiently confused model could
  still follow instructions inside evidence. The design makes that failure
  less likely (unmistakable data marking, authority rules, fixed
  destination) and less damaging (derived-statements-only, one page,
  no-verbatim rule), not impossible.

## Install

While the repo is private, copy it into your workspace directly:

```
cp -R taste "$VELLUM_WORKSPACE_DIR/plugins/taste"
```

Then **restart the assistant**. Plugin surfaces are activated by the boot
scan; files dropped into a running daemon are discovered but never
registered. Once the repo is public, `assistant plugins install <github-url>`
works instead.
