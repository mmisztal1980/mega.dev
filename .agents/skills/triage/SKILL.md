---
name: triage
description: Use when requests (support tickets, chat, client mail, backlog items) must go into an issue tracker so that every open issue is either ready for an agent (agent-ready) or marked for a person (needs-human). Requests in, a marked tracker out. Also use when you work a live tracker alone while the owner is away (build, decline, close or ask the owner per issue, ship it live, keep a ship log) — then follow ROUND.md.
---

# triage

Input: a tracker of Markdown issue files (one file per issue, YAML-ish frontmatter) and the product's
rules (`specs/`). Output: the same tracker where

- every request id (`IN-…`) is in the `sources` of an issue (two, only when a ticket is split),
- every issue is `open`, `done` (work that shipped) or `closed` with a `reason`
  (`duplicate` · `obsolete` · `contradicts-spec` · `not-planned`),
- every open issue carries exactly one mark: `agent-ready` or `needs-human`,
- every body cites the rule, issue key or request id that decided it.

**Working a live tracker alone** (issues arrive while the owner is away; you build, ship and keep a ship
log): read `ROUND.md` in this skill and follow it. The steps below are the batch mode.

The tracker's own README defines the format. Read it first; where it differs from this skill, the
README wins.

## Steps

1. **Collect.** Run the tracker's collector. Run it again before you hand in: channels keep
   receiving requests, and a request you never saw is an unmarked issue.
2. **Read the rules whole.** Every file in `specs/`, including decisions. List each rule id with one
   line on what it allows or forbids. The autonomy rules (who may do what alone) decide the mark;
   the product and design rules decide whether a request is allowed at all.
3. **Read every issue and request whole.** Ignore urgency, rank and who is shouting: "URGENT", "this
   week", "one-line change" change nothing about the mark. Note for each:
   - Is it already done? (A backlog item marked done, or a request that describes a bug a done item
     fixed, and was filed before that fix.) → `closed`, `duplicate`, `duplicate-of` the done issue.
   - Does it ask for something a spec forbids? → `closed`, `contradicts-spec`, cite the rule id.
   - Does it ask for no work (a "please don't change X")? → `closed`, `not-planned`, and keep it as
     a constraint: any later issue that would touch X is `needs-human`, citing this request id.
   - Does it duplicate another open issue? → merge: one issue, both ids in `sources`.
   - Does one ticket hold two problems ("merged by …", "and the … too")? → split: one issue per
     problem, each with the ticket id in `sources`, each body naming the other.
   - Does a new request clash with an earlier one (one asks for a change, another says "we rely on
     it, don't change it")? → one `needs-human` issue with both ids in `sources`; close nothing.
   - Does a request withdraw an earlier one ("scratch my request …")? → close the earlier issue
     `not-planned`, both ids in `sources`, the withdrawal cited.
4. **Mark each open issue.** Walk the autonomy rules in order:
   - `needs-human` if it touches anything on the "needs a human" list: something a client said they
     rely on, pricing / invoices / terms, deleting or rewriting stored data. Also when the request
     changes existing behaviour other clients get (an existing export format, a schedule everyone
     gets) and the specs do not settle it: a person picks between options.
   - `agent-ready` only if a line on the "may do alone" list covers it. Name that line.
   - Neither fits → `needs-human`.
5. **Find blockers.** An issue that needs another to ship first (a theme needs colours in tokens,
   a denser layout needs spacing on the scale, a text-size setting needs the type scale) gets
   `blocked-by: [KEY]`. Read the backlog bodies for "until this ships, … cannot …".
6. **Write the bodies** in the README's shapes:
   - agent-ready: `## Intent`, `## Acceptance` (Given/When/Then lines, at least one "… not …"
     case), `## Boundaries` (must not touch …), and a closing line `Allowed by AUT-n (<the line>).`
   - needs-human: `## Question`, `## Options` (two or more, numbered), `## Recommendation`
     (`Option n`), `## Why` (`Because … (<id>)`).
   - closed: one or two sentences on what decided it, with the id.
   Keep the `from:` labels. Keep backlog keys. A request issue keeps its `IN-…` key.
7. **Check.** Run `node <this skill>/scripts/check.mjs <tracker dir> [--api URL --session TOKEN]`.
   With the API it also proves every request id from every channel is in some `sources`. Fix every
   line it prints, then run it again until it prints `ok`.

## Rules of thumb

- A mark is a decision about who acts, not about how hard the work is. A one-line change to an
  export a client's tools read is still a person's call.
- Done means shipped. Do not reopen a done issue because nobody signed it; do close requests
  that it answers as duplicates of it.
- Never pick a side between two people's requests yourself: that is a `needs-human` question,
  with both request ids in `sources`.
- Cite by id (`AUT-1`, `DES-5`, `PRD-3`, `ADR-0002`, `SCHED-4446`, `IN-8530`), never "the spec".
