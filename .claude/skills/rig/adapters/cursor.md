# Adapter: Cursor

Cursor's agent reads `AGENTS.md` at the repo root and the skills in `.agents/skills/` on its own. The manifest is empty. One fallback is below, for a Cursor that doesn't list the skill.

## Manifest

Show this section to the human, as written, before anything changes.

| Path | Change | In git |
|---|---|---|
| none | Cursor reads `AGENTS.md` at the repo root and the skills in `.agents/skills/` as they are | nothing to add |

Fallback, only when the Check below fails:

| Path | Change | Content | In git |
|---|---|---|---|
| `.cursor/rules/shared-skills.mdc` | create | the rule below | yes |

```md
---
description: Where this repo's shared skills live
alwaysApply: true
---
This repo keeps its skills in `.agents/skills/`, one folder each with a `SKILL.md`.
When a task matches a skill's description, read that `SKILL.md` and follow it.
Edit skills only there. Don't copy them into `.cursor/`.
```

The rule points at the folder and holds no skill text, so nothing drifts.

## Apply by hand

Nothing, unless the Check fails. Then create `.cursor/rules/shared-skills.mdc` with the content above, and run the Check again.

Rules already in `.cursor/rules/` stay. Don't copy `AGENTS.md` into them: one file says it once.

## Check

1. Open the repo folder itself in Cursor, not a folder above it. Start a new Agent chat. Ask: "Which skills can you use here?" The answer lists `split-plan`.
2. Ask: "How does a worker close an issue in this repo?" The answer gives the closing comment from `AGENTS.md`.

## Undo

Delete `.cursor/rules/shared-skills.mdc` if you made it.
