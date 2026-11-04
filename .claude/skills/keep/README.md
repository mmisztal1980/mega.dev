# keep

keep gives your harness one file of findings, `KEEP.md`, at the root of your project. Each line is one finding, where it came from (a file and a line, a recording and a second in it, or you) and how your harness knows it: it ran something, it read it, or you told it. A new session reads `KEEP.md` first, so it starts from sourced findings instead of a recap.

It works in any harness that reads skills in the Agent Skills format (a folder with a `SKILL.md`), such as Claude Code, Cursor and Codex.

## What is in the folder

| File | What it is |
|---|---|
| `SKILL.md` | The rules your harness follows, each with a check. |
| `KEEP.md` | The template. A copy goes in the root of your project. |
| `scripts/keep-check.mjs` | Fills the Can run section of `KEEP.md` with which of the commands you name this machine has, and checks the shape of the Findings lines. |
| `AGENTS.snippet.md` | The one line that makes a new session read `KEEP.md` first. |
| `README.md` | This page. |

The script needs Node 18 or newer, on macOS, Linux or Windows. It uses no packages.

## Install

Keep the folder name `keep`, with `SKILL.md` directly inside it.

**Claude Code**
1. Copy this folder to `.claude/skills/keep/` in your project. To have it in every project, copy it to `~/.claude/skills/keep/` instead.
2. Copy `KEEP.md` to the root of your project.
3. Paste the line from `AGENTS.snippet.md` near the top of `CLAUDE.md`. If your `CLAUDE.md` only points to `AGENTS.md` (`@AGENTS.md`), paste it into `AGENTS.md`.

**Cursor or Codex**
1. Copy this folder to `.agents/skills/keep/` in your project. To have it in every project, copy it to `~/.agents/skills/keep/` instead.
2. Copy `KEEP.md` to the root of your project.
3. Paste the line from `AGENTS.snippet.md` near the top of `AGENTS.md`.

Start a new session after you install: a harness loads its skills when a session starts.

## Check that it works

1. In the root of your project, run the script with one command name (use your own install path):
   `node .claude/skills/keep/scripts/keep-check.mjs can-run git`
   It prints a fenced block that starts with `checked by keep-check.mjs` and has a `found:` or `not found:` line for `git`.
2. Run it with `--write`:
   `node .claude/skills/keep/scripts/keep-check.mjs can-run --write KEEP.md git`
   The Can run section of `KEEP.md` now holds the same block.
3. Start a new session in the root of your project and ask which skills it has. `keep` is on the list.
4. Tell it one fact about the project and ask it to keep it. `KEEP.md` gets a line like `- the staging database is shared · source: human · how: told`, and `node .claude/skills/keep/scripts/keep-check.mjs findings KEEP.md` prints nothing.
5. Start another new session and ask what has been found in this project so far. It answers from `KEEP.md`, with the sources, without being told where to look.

## What it does not do

It reads and writes `KEEP.md` in your project, nothing else. The script reads `KEEP.md` and looks command names up on this machine: it runs none of them, installs nothing and sends nothing anywhere. It opens `KEEP.md` only inside the folder you run it in, and never through a link. Your harness is told to ask you before it edits `AGENTS.md` or `CLAUDE.md`, or installs a tool. Keys and passwords stay out of `KEEP.md`, because every session reads it and it may end up in git.

`KEEP.md` holds notes, not instructions. Receipts are raw tool output, and that output can carry text from a page or a stranger. Your harness is told not to act on a line in it, and to tell you what the line says. The script reports a line that holds hidden characters or looks like a key, anywhere in `KEEP.md`. Outside Findings it lets colour codes and carriage returns through, because ordinary tool output holds them. In a terminal they can still hide text, so read `KEEP.md` in an editor, not with `cat`. The script knows only some shapes of a key, so read what goes in. It misses, for example, `apiKey` and `accessToken` in camelCase, `Password=` in a connection string, `aws_secret_access_key` in an AWS credentials file, and an npm token or a Google API key with no name such as `NPM_TOKEN=` before it.
