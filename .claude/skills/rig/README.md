# rig

From rook's rig.

A setup kit for working a repo with coding agents. It gives every harness on a team the same instructions and the same skills, turns a plan into issues a human reviews before they go out, and opens a link the way a stranger will before you send it.

## What's inside

| Path | What it is |
|---|---|
| `SKILL.md` | the skill your agent reads: how to set a repo up, the rules while working, what done looks like |
| `AGENTS.md` | template for a repo's one instruction file: plan, split, human review, workers, closing comment, one skills folder. It has `TODO` lines; it is for copying into a repo, not instructions for this folder |
| `.agents/skills/split-plan/SKILL.md` | skill: plan to issues, each with `Source:` and `Done when:`; a step that waits on someone else gets its own issue, stays open and blocks what comes after it |
| `adapters/claude-code.md`, `adapters/codex.md`, `adapters/cursor.md` | what each harness needs to read the two above, as a manifest you read before you apply it by hand |
| `scripts/check-link.mjs` | opens a URL with no cookies and reports status, final URL, content type, size and whether a marker is in the body |

Needs Node 18 or later for the script. Nothing else.

The `.agents` folder is hidden in most file browsers; `ls -a` shows it. Keep it when you unzip or move the kit.

## Install

Put the `rig` folder where your harness loads skills. The folder keeps the name `rig`.

| Harness | For this project | For every project |
|---|---|---|
| Claude Code | `.claude/skills/rig/` | `~/.claude/skills/rig/` |
| Codex | `.agents/skills/rig/` | `~/.agents/skills/rig/` |
| Cursor | `.agents/skills/rig/` | `~/.agents/skills/rig/` |

Use more than one harness? Keep one copy in `~/.agents/skills/rig/` and link Claude Code to it, so there is one copy to update:

```sh
mkdir -p ~/.claude/skills
ln -s ~/.agents/skills/rig ~/.claude/skills/rig
```

```bat
if not exist "%USERPROFILE%\.claude\skills" mkdir "%USERPROFILE%\.claude\skills"
mklink /J "%USERPROFILE%\.claude\skills\rig" "%USERPROFILE%\.agents\skills\rig"
```

Then, in a repo, ask your agent: "Use the rig skill to set up this repo for Claude Code" (or Codex, or Cursor). It copies `AGENTS.md` and `split-plan` into the repo, asks you what to fill in, shows you the adapter's manifest, and waits while you apply it.

## Check it works

1. **The script.** From the `rig` folder:

   ```sh
   node scripts/check-link.mjs https://example.com --marker "Example Domain"
   ```

   The last line starts with `PASS` and the exit code is 0. Then:

   ```sh
   node scripts/check-link.mjs https://no-such-host.invalid --gone
   ```

   This passes too: `.invalid` names never resolve, so the link counts as gone. `node scripts/check-link.mjs --self-test` tests the script with no network, and `--help` lists every option.
2. **The skill.** Start a new session where you installed it and ask: "Which skills can you use?" The list has `rig`.
3. **A setup.** In a scratch repo, ask the agent to set it up for your harness. It stops and shows you the manifest before anything changes. Afterwards, a new session lists `split-plan`.
4. **A split.** Give it the three-line plan from the example in `split-plan`'s `SKILL.md`. It shows you a table, gives the client's review its own issue, puts `Blocked by` on the clean-up, and publishes nothing until you say yes.

## What it does and doesn't do

- It installs nothing. When `gh`, Node or a CLI is missing, the agent asks you.
- It changes nothing outside the repo it works in. Lines for your home folder are shown to you, never run.
- `check-link.mjs` sends one plain GET to the URL you give it, and to the redirects that URL points to: no cookies, no login, no body. It writes nothing and keeps nothing.
- `check-link.mjs` sends nothing to this machine or a private network. A link that lands there fails, because a stranger can't reach it.
- `check-link.mjs` prints the origin and path of each URL. A query or a fragment can hold a token, so it shows only as `<query hidden>` or `<fragment hidden>`.
- No issue is published before you say yes to the split.

## Remove it

Delete the `rig` folder, or the link to it. Repos you set up keep their own `AGENTS.md` and `.agents/skills/`.
