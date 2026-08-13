---
name: taste
description: >-
  Work from the user's recorded taste instead of a generic default, and keep
  that record current. Load this before producing anything with a style to it —
  prose, copy, a name, a layout, a playlist — and whenever the user reacts to
  something you made ("too formal", "I like this one", "lose the hedging"), or
  asks what their taste is. Taste lives in memory on three pages:
  [[taste-writing]], [[taste-music]], [[taste-visual]].
metadata:
  emoji: "🎚️"
  vellum:
    display-name: "Taste"
    category: "productivity"
    activation-hints:
      - "User asks for writing of any kind — a draft, an edit, a rewrite, a name, copy"
      - "User reacts to something you produced: too formal, too long, too soft, I like this"
      - "User asks what their taste is, or what you know about their style"
      - "User asks for a recommendation where their preferences should shape it"
    avoid-when:
      - "The output has no style to it — a command, a lookup, a calculation"
      - "The user gave explicit style instructions in this turn; follow those instead"
      - "You are editing someone else's writing to their brief, not producing the user's own"
---

# Taste

The user has a recorded taste. Use it, and keep it current. Both halves matter
equally — a profile that is never read is decoration, and one that is never
updated goes stale the first time they change their mind.

## The three pages

Taste is stored as memory, on one concept page per dimension:

| Page             | Covers                                                       |
| ---------------- | ------------------------------------------------------------ |
| `taste-writing`  | Register, sentence shape, hedging, ornament, structure        |
| `taste-music`    | Artists, textures, what they reach for and when               |
| `taste-visual`   | Density, palette, type, how much the work is allowed to shout |

Read with `recall`. Write with `remember`, addressing the page by its
`[[slug]]` so entries file together instead of scattering through general
memory.

## Before you produce anything

`recall` the relevant page **first**, before drafting — not after, and not as a
revision pass. A draft written generically and then edited toward the profile
still reads as a generic draft that was edited. The point is that the first
thing they see is already close.

If the page is empty or thin, say so in one line and proceed on your best
read of their previous messages. Do not interrogate them about their taste
before answering a question they actually asked.

**Apply it, do not perform it.** The profile is an instruction to you, never
material for the reply. Do not narrate that you consulted it, do not name the
axes, and do not explain how the draft reflects them. If the writing is right,
they will recognize it.

**Their explicit instruction always wins.** A profile says "spare and
unhedged"; this turn says "make it warmer and longer" — then it is warmer and
longer, and that is not a contradiction to resolve or a correction to record.
One turn's brief is not a change of taste.

## Recording a change

Update a page when the user reacts to something you produced in a way that
generalizes. That is the whole test: **would this still be true next week, on a
different piece of work?**

| They said                                      | Record it? | Why                                        |
| ---------------------------------------------- | ---------- | ------------------------------------------ |
| "too soft — say what broke"                    | Yes        | A standing preference about hedging        |
| "lose the em dashes"                           | Yes        | A durable mechanical rule                  |
| "make this one shorter, it's going in a Slack" | No         | A constraint of this piece, not their taste |
| "I love this"                                  | Only if specific | Praise with no content teaches nothing |

When you do record, write **what they prefer, not what happened**. "Prefers the
conclusion first, before the reasoning" is usable a month from now.
"Said the release note was too soft" is a diary entry.

Keep entries short and non-duplicative. `recall` the page before writing to it,
and if an entry already covers the ground, sharpen that one rather than adding a
near-twin. Three overlapping entries about hedging is a profile that reads as
noise.

**Record silently.** Do not announce it, do not ask permission, and do not end
the reply with a note about what you learned. If it is worth surfacing at all,
one short line at the end is the ceiling.

## Contradictions

When new feedback contradicts a recorded entry, the new one wins — people
change their minds, and the record should track them rather than argue.

Replace the old entry rather than stacking a contradiction next to it. If the
contradiction looks contextual instead of a real change — they want punchier
writing *for launch copy* specifically — record the context with it rather than
overwriting the general case.

## SKILL COMPLETE WHEN

- The relevant page was recalled before drafting, not after.
- The output reflects it without mentioning it.
- Any durable reaction is filed to the right page, phrased as a preference.
- Nothing was recorded from a one-off constraint or contentless praise.
