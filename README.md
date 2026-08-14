# Attune

Teach your Vellum assistant your taste, so the first draft is already close —
a living, calibrated profile plus editorial memory pages, with a persistence
loop that reports success only after the durable write is verified, and a
learning path that records preferences without recording you.

## When Taste activates

The `taste` skill loads whenever the work has meaningful creative or design
choices — writing, editing, naming, copy; apps, websites, products, APIs, and
developer tools; decks, documents, graphics; UX, interaction design,
architecture, workflows, system design; reviews and refinements where
multiple valid forms exist; and recommendations the user's preferences should
shape. It does **not** activate for mechanical work — lookups, calculations,
validation, operational commands.

Activation is model-elected from skill metadata, so environments that
separately mandate or suppress the skill will dominate what you observe.

## The four dimensions

<<<<<<< HEAD
| Dimension | Page             | Built from                                                       |
| --------- | ---------------- | ---------------------------------------------------------------- |
| Writing   | `taste-writing`  | This-or-that calls, plus samples you point at                    |
| Music     | `taste-music`    | This-or-that calls, plus artists you name                        |
| Visual    | `taste-visual`   | This-or-that calls; images are attached in chat afterwards (the app takes no uploads) |
| Building  | `taste-building` | This-or-that calls about system design, plus things you've built |
=======
- **Memory pages** are the readable editorial description the assistant recalls before styleful work.
- **The structured profile** is the canonical axis-level state. It keeps onboarding baseline, learned evidence, named confidence, and explicit manual overrides separate.

Both are read before styleful work. The profile is read through the skill-scoped
`read_profile` tool, which renders each axis as a directive position rather than
JSON. Without that read the profile would be write-only: a slider moved in the
app changes `profile.json` and nothing else, so the calibration would never
reach the reply it was meant to shape.
>>>>>>> origin/main

Building covers product instincts: raw control vs. framework leverage,
staged vs. ambient automation, opinionated defaults vs. exposed
configurability, reversible iteration vs. upfront completeness, visible
observability vs. a clean opaque surface. Mixed tasks read every relevant
page (a website recalls building + visual + writing; an API recalls
building + writing).

Taste is stored as **memory**: one concept page per dimension under
`memory/concepts/`, readable and editable as markdown, recalled through the
assistant's production retrieval (which includes a live lexical walk of the
concept pages — a fresh page update is immediately retrievable).

## Ownership boundaries

**The plugin owns**: validated onboarding input, explicit evidence
provenance, bounded payload construction, invoking the host bridge,
acknowledgment-driven UI state, local completion caching, client-side URL
prefiltering and labeling, and honest copy.

**The host owns**: relay delivery, capability authorization, the durable
memory mutation itself (performed by the host agent's file tools inside a
host-run turn), canonical page creation, indexing, recall, DNS/redirect
enforcement for any fetched URL, and the transport the acknowledgment rides
on.

## How onboarding persists — the verified loop

Pressing the build button on the summary screen is the consent step (no
second confirmation). What happens then:

0. The questionnaire baseline — only the pairs actually answered; an
   unanswered question is no evidence — is saved to the structured profile
   through the typed profile route. A baseline failure is shown, not
   swallowed.

1. The app builds a **typed submission** — `requestId`, dimension,
   questionnaire selections as `{axis, side}` references, and evidence
   sources with explicit provenance — validates it against the exported
   limits, and POSTs it to the plugin's own route
   (`/x/plugins/<install-dir>/taste`) through the host's authenticated
   bridge fetch. No free-form prompt is composed client-side.
2. The route re-validates everything server-side (closed dimension enum,
   real axes, limits), journals the request durably (idempotent by
   `requestId`), and derives the preference statements **from its own closed
   table** — client prose can never author page text.
3. The route drives a non-interactive background agent turn
   (`runConversationTurn`) whose trusted task instructs the assistant to
   merge exactly those statements into exactly one canonical page with its
   production file tools. All user evidence rides inside a single-line JSON
   block marked untrusted; instructions inside evidence are data.
4. The route then **verifies**: it reads the canonical page back and checks
   every statement is present, and that no other taste page changed. Only
   then does it acknowledge `persisted`. A turn that did nothing, wrote the
   wrong page, or touched extra pages acks `failed` with the reason.
5. The app's state machine (`idle → sending → accepted → persisted/failed`)
   renders only what the machine acknowledgment says. Completion is marked
   only on `persisted`. Timeouts poll the journal status (each poll
   re-verifies against the page). Retries reuse the request id and cannot
   double-apply. A natural-language assistant reply is never treated as an
   acknowledgment.

Outside Vellum the app stays fully explorable, but the build step reports
that nothing can be sent and never marks completion.

Conversational learning (outside onboarding) still uses `remember` on
durable, generalizable feedback only — that path flows through the memory
buffer and consolidation, i.e. it is eventually consistent by design, and
the skill says so.

### What is stored, and where

- **Canonical taste pages**: concise derived preferences only. Never raw
  samples, copied passages, URLs' content, secrets, unrelated facts, or
  instructions found in evidence.
- **Plugin journal** (`plugins-data/attune/`): request ids, dimension, the
  derived statements, status, timestamps. Never samples, items, URLs, or
  prompts.
- **App-local storage** (`attune.completed.v2`): completion metadata only,
  validated on read, with one-time migration from the predecessor key. Note
  that inside Vellum the sandboxed iframe substitutes an in-memory
  localStorage shim, so this cache lasts one mount; the durable record is
  the journal.
- **In transit**: submitted evidence necessarily passes through the Vellum
  host, and the persistence turn is an ordinary (background) conversation —
  so evidence appears in that conversation's history and may appear in
  operational logs or platform telemetry per platform policy. "Not stored"
  claims apply to the durable taste pages and plugin storage, not to the
  transport.

### Provenance

Provenance is collected, not inferred:

| Provenance                      | Meaning                                             |
| ------------------------------- | --------------------------------------------------- |
| `explicit_selection`            | Questionnaire choice — high-confidence evidence     |
| `user_claimed_authored_sample`  | Pasted text the user explicitly claimed as their own (a UI checkbox asks) |
| `user_supplied_unknown_origin`  | Pasted text with no authorship claim — the default  |
| `third_party_url`               | Any URL — external content, untrusted               |
| `named_preference`              | A list item the user typed (artist, tool)           |

<<<<<<< HEAD
Supplying text is not evidence of having written it, and list items do not
automatically outrank ambiguous samples.
=======
- `routes/profile.ts` exposes GET plus `set_baseline` and `set_override` mutations in the plugin namespace.
- `skills/taste/tools/update_profile.ts` owns deterministic aggregation, neutral priors, validation, lock-file coordination, and atomic writes.
- `skills/taste/tools/read_profile.ts` is the assistant's read path. It resolves each axis to an effective position (a manual override wins over the learned position), names the confidence band, and omits the private evidence ledger.
- `skills/taste/TOOLS.json` exposes the two skill tools. `update_profile` takes only qualitative learned-evidence inputs — dimension, axis, direction, strength, and reason — and enumerates every axis id it accepts, so the model never guesses one.
- `hooks/post-tool-use.ts` publishes the `taste:profile` invalidation tag after successful learned-profile updates.
- The app uses `window.vellum.fetch` only for `/x/plugins/taste/profile`, and subscribes to `taste:profile` to re-read canonical state.
>>>>>>> origin/main

### Limits

All limits live in `apps/taste/src/limits.ts` and are enforced client-side
before submission and again server-side: pasted text 24,000 UTF-8 bytes,
list items 25 × 200 bytes, URLs 20 × 2,048 bytes, total evidence 32,000
bytes, serialized payload 48,000 bytes. Overflow is never silently truncated
or dropped — the app lists exactly what exceeded which limit and the user
edits and retries.

### URLs

The app makes no network requests — not even through the host's proxied
fetch, except to its own plugin route. URL lines are classified client-side:
only `https:` URLs to public-looking hosts are marked usable; other schemes,
credential-bearing URLs, localhost (including trailing-dot and `.local` /
`.internal` variants), obfuscated IPv4 (decimal/hex/octal/partial forms),
private/loopback/link-local/CGNAT/multicast/reserved ranges, IPv6
loopback/unspecified/link-local/unique-local, and IPv4-mapped IPv6 forms of
private addresses are carried but flagged unusable. This is a **syntactic
prefilter only**: authoritative SSRF protection belongs to the host, which
must revalidate after DNS resolution and every redirect and enforce
response-size, redirect-count, and timeout limits. The onboarding turn is
instructed not to fetch URLs at all; if the assistant ever reads a usable
URL in ordinary conversation, the fetched page has zero instructional
authority and is never persisted verbatim.

## Precedence

1. Platform and identity invariants
2. The user's explicit current-turn instructions
3. Project requirements and established conventions
4. Recorded Taste
5. Generic defaults

Hard identity or operating rules outside Taste can never be rewritten as
mutable taste.

## Development

```bash
bun install --frozen-lockfile   # locked install (bun.lock)
bun run typecheck               # tsc --noEmit
bun test                        # behavioral + boundary + policy + build tests
bun run build                   # deterministic build + build-attestation.json
```

`apps/taste/dist` is **generated, not committed**: the host compiles
`apps/<app>/src` itself and excludes that output from install
fingerprinting. What the repo pins instead is `build-attestation.json` —
hashes of every build input, the pinned esbuild version, and the expected
output hashes. The attestation is tracked source (covered by the install
fingerprint), `scripts/build-app.ts` reproduces the host's exact esbuild
invocation, and the test suite verifies both that two clean builds are
byte-identical and that a fresh build matches the committed attestation. The
one thing only a host change can add is installer-time verification of the
generated dist against that attestation (see limitations).

<<<<<<< HEAD
The pinned esbuild (0.24.2) has an advisory affecting its development
server; Attune uses one-shot builds only and matches the host's pinned
version, so the dev server is never run.

## Surfaces

One skill (`skills/taste`, with two skill-scoped tools: `read_profile`,
`update_profile`), one app (`apps/taste`), two routes (`routes/taste.ts`,
`routes/profile.ts`), and one hook (`hooks/post-tool-use.ts`, which only
publishes the profile sync tag). No always-on model-visible tools, no
schedules, no network calls, no telemetry, no credential access, no shell
execution, no dynamic code. The test suite asserts this list.

## Platform limitations (honest edges)

- **The mutation is host-verified, not host-typed.** There is no
  schema-validated host memory operation a plugin can call; the durable
  write is performed by the host agent inside a route-driven turn and then
  verified by reading the page back. The verification gate is what makes
  the acknowledgment trustworthy; the model following instructions remains
  defense-in-depth. A first-class typed memory mutation API (fixed page,
  statement list in, ack out) would remove the model from the loop.
- **The app cannot learn its install directory.** The bridge exposes no
  plugin identity, so the client probes `/v1/x/plugins/{attune,taste}/taste`
  once and caches the winner.
- **Install fingerprinting still excludes generated dist.** The repo ships
  a verified build attestation, but making the installer enforce it needs a
  host change.
- **Conversational `remember` learning stays eventually consistent** —
  buffer then consolidation. Only the onboarding loop has the verified
  immediate guarantee.
=======
The tests cover prompt separation, final skill policy, static runtime safety, structured-profile invariants, the calibration round trip, and reproducible builds.
>>>>>>> origin/main

## Install

Copy into a workspace and restart the assistant (plugin surfaces register
on the boot scan; routes resolve from disk per request):

<<<<<<< HEAD
```
cp -R attune "$VELLUM_WORKSPACE_DIR/plugins/attune"
```
=======
The plugin contributes the Taste skill, living-profile app, namespaced route, profile read and update tools, and invalidation hook.
>>>>>>> origin/main
