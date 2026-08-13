# Attune

Teach your Vellum assistant your taste, so the first draft is already close —
and so it keeps learning every time you react to something it made.

Taste is recorded across three dimensions:

| Dimension | Built from                                              |
| --------- | -------------------------------------------------------- |
| Writing   | Samples you point at, plus how you react to drafts        |
| Music     | Artists you name, plus a short run of this-or-that calls  |
| Visual    | Images you upload, plus the same this-or-that calls       |

## How it works

There is no separate taste database. Taste is stored as **memory**, on one
concept page per dimension — `taste-writing`, `taste-music`, `taste-visual` —
written with the assistant's own `remember` tool and read back with `recall`.

That is the whole architectural bet, and it buys three things:

- **The memory system already surfaces it.** Memory injects relevant context
  every turn on its own, so taste reaches the model without this package wiring
  anything into the turn.
- **It survives.** Taste lives in the assistant's workspace alongside
  everything else it knows, not in storage owned by one plugin.
- **You can read and edit it.** It is markdown in the workspace, not rows in a
  database.

The `taste` skill is what teaches the assistant to use it: recall the right
page before producing anything with a style, and file durable reactions back to
that page. Activation is model-elected from the skill's description and
activation hints — the same way every other skill loads.

## Install

While the repo is private, copy it into your workspace directly:

```
cp -R taste "$VELLUM_WORKSPACE_DIR/plugins/taste"
```

Then **restart the assistant**. Plugin surfaces are activated by the boot scan;
files dropped into a running daemon are discovered but never registered, and
`assistant plugins list` will report `ok` the whole time.

Once the repo is public, `assistant plugins install <github-url>` works instead.

## Status

- **Skill** — written. Recall before producing, record durable reactions, keep
  entries non-duplicative, never narrate the profile.
- **Onboarding app** — built (`apps/taste/`). A this-or-that run per dimension
  plus source material, relaying one self-contained prompt to the assistant.
  Nothing is sent until the build button, so abandoning halfway writes nothing.
  Visual takes no uploads yet: `relay_prompt` carries text only, so images are
  attached in the chat instead of through the app.
- **Open question** — whether writing taste should reach every turn or only
  turns that look like writing. Currently the skill decides, which means it
  will sometimes miss.
