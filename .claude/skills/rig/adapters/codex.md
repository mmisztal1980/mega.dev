# Adapter: Codex

Codex reads `AGENTS.md` and the skills in `.agents/skills/` on its own. This adapter changes no file; it says what to check.

## Manifest

Show this section to the human, as written, before anything changes.

| Path | Change | In git |
|---|---|---|
| none | Codex reads `AGENTS.md` at the repo root and the skills in `.agents/skills/` as they are | nothing to add |

## Apply by hand

Nothing to apply. Two habits:

- Start Codex in the repo root, or a folder inside it. Codex looks for project skills from where its session starts, so a session started above the repo misses them.
- Keep `AGENTS.md` short. Codex reads a limited amount of project instructions (32 KiB by default, `project_doc_max_bytes`) and leaves out the rest.

## Check

1. Start a new Codex session in the repo root. Ask: "Which skills can you use here?" The answer lists `split-plan`.
2. Ask: "How does a worker close an issue in this repo?" The answer gives the closing comment from `AGENTS.md`.

## If the skill isn't listed

An older Codex may load skills from another folder. Update Codex, or look up in its docs where it loads project skills, and link that folder to `.agents/skills` the way the Claude Code adapter does. Never paste the skill in. A folder under the human's home, such as `~/.codex/`, is outside the repo: show the line and let the human run it.

## Undo

Nothing to undo.
