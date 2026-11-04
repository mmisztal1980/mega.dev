# Adapter: Claude Code

Claude Code reads `CLAUDE.md`, not `AGENTS.md`, and loads project skills from `.claude/skills/`, not `.agents/skills/`. This adapter points both at the one source. Nothing is copied.

## Manifest

Show this section to the human, as written, before anything changes.

| Path | Change | Content | In git |
|---|---|---|---|
| `CLAUDE.md` | create it, or add the line at the top if it exists | `@AGENTS.md` | yes |
| `.claude/skills` | create a link to `.agents/skills` | a symbolic link (macOS, Linux) or a directory junction (Windows) | no |
| `.gitignore` | add one line of its own at the end | `.claude/skills` | yes |

`@AGENTS.md` makes Claude Code read `AGENTS.md` as part of `CLAUDE.md`. Rules for every harness go in `AGENTS.md`; `CLAUDE.md` keeps only what is for Claude Code alone. If `CLAUDE.md` already holds the project's rules, move the ones every harness needs into `AGENTS.md` with the human.

## Apply by hand

From the repo root. Each block stops if `.claude`, `.agents`, `CLAUDE.md` or `.gitignore` is itself a link: a write through it lands outside the repo. Show that to the human. Each block also leaves an existing `.claude/skills` alone. If a block prints that it exists, go to "`.claude/skills` already exists" below.

macOS or Linux:

```sh
if [ -L .claude ] || [ -L .agents ] || [ -L CLAUDE.md ] || [ -L .gitignore ]; then
  echo 'stop: a link where a file or folder should be. Show your human.'
else
  [ -e CLAUDE.md ] || printf '@AGENTS.md\n' > CLAUDE.md
  mkdir -p .claude
  if [ -e .claude/skills ] || [ -L .claude/skills ]; then
    echo '.claude/skills exists: nothing linked'
  elif ln -s ../.agents/skills .claude/skills; then
    [ -z "$(tail -c1 .gitignore 2>/dev/null)" ] || echo >> .gitignore
    printf '.claude/skills\n' >> .gitignore
  fi
fi
```

Windows, in Git Bash. `ln -s` makes a copy there, so the link comes from `cmd`:

```sh
if [ -L .claude ] || [ -L .agents ] || [ -L CLAUDE.md ] || [ -L .gitignore ]; then
  echo 'stop: a link where a file or folder should be. Show your human.'
else
  [ -e CLAUDE.md ] || printf '@AGENTS.md\n' > CLAUDE.md
  mkdir -p .claude
  if [ -e .claude/skills ] || [ -L .claude/skills ]; then
    echo '.claude/skills exists: nothing linked'
  elif cmd //c 'mklink /J .claude\skills .agents\skills'; then
    [ -z "$(tail -c1 .gitignore 2>/dev/null)" ] || echo >> .gitignore
    printf '.claude/skills\n' >> .gitignore
  fi
fi
```

Windows, in PowerShell (no admin needed):

```powershell
$links = '.claude', '.agents', 'CLAUDE.md', '.gitignore' | Where-Object { (Get-Item -Force -ErrorAction SilentlyContinue $_).LinkType }
if ($links) { 'stop: a link where a file or folder should be. Show your human.' }
else {
  if (-not (Test-Path CLAUDE.md)) { Set-Content -Path CLAUDE.md -Value '@AGENTS.md' -Encoding ascii }
  if (-not (Test-Path .claude)) { New-Item -ItemType Directory .claude | Out-Null }
  if (Get-Item -Force -ErrorAction SilentlyContinue .claude\skills) { '.claude/skills exists: nothing linked' }
  else { New-Item -ItemType Junction -Path .claude\skills -Target .agents\skills | Out-Null }
}
```

Windows, in Command Prompt (no admin needed). First run `dir /A:L /B`. If it prints `.claude`, `.agents`, `CLAUDE.md` or `.gitignore`, stop and show your human. If not:

```bat
if not exist CLAUDE.md echo @AGENTS.md> CLAUDE.md
if not exist .claude mkdir .claude
if not exist .claude\skills mklink /J .claude\skills .agents\skills
```

After the PowerShell or Command Prompt lines, open `.gitignore` in an editor and add `.claude/skills` as a new line at the end. Do this by hand: `echo` from these shells joins the last line when the file has no final newline, and a last line `.env` then stops being ignored.

`CLAUDE.md` already existed: open it and add `@AGENTS.md` as its first line.

### `.claude/skills` already exists

It holds skills of its own, or it holds `rig` itself. Don't replace it. Link each shared skill inside it, and put each link's path in `.gitignore`, on a line of its own. The lines below do this for `split-plan`. In PowerShell or Command Prompt, add the `.gitignore` line in an editor.

macOS or Linux:

```sh
if [ -L .claude ] || [ -L .agents ] || [ -L .gitignore ]; then
  echo 'stop: a link where a file or folder should be. Show your human.'
elif [ -e .claude/skills/split-plan ] || [ -L .claude/skills/split-plan ]; then
  echo '.claude/skills/split-plan exists: nothing linked'
elif ln -s ../../.agents/skills/split-plan .claude/skills/split-plan; then
  [ -z "$(tail -c1 .gitignore 2>/dev/null)" ] || echo >> .gitignore
  printf '.claude/skills/split-plan\n' >> .gitignore
fi
```

Windows, in Git Bash:

```sh
if [ -L .claude ] || [ -L .agents ] || [ -L .gitignore ]; then
  echo 'stop: a link where a file or folder should be. Show your human.'
elif [ -e .claude/skills/split-plan ] || [ -L .claude/skills/split-plan ]; then
  echo '.claude/skills/split-plan exists: nothing linked'
elif cmd //c 'mklink /J .claude\skills\split-plan .agents\skills\split-plan'; then
  [ -z "$(tail -c1 .gitignore 2>/dev/null)" ] || echo >> .gitignore
  printf '.claude/skills/split-plan\n' >> .gitignore
fi
```

Windows, in PowerShell:

```powershell
$links = '.claude', '.agents', '.gitignore' | Where-Object { (Get-Item -Force -ErrorAction SilentlyContinue $_).LinkType }
if ($links) { 'stop: a link where a file or folder should be. Show your human.' }
elseif (Get-Item -Force -ErrorAction SilentlyContinue .claude\skills\split-plan) { '.claude/skills/split-plan exists: nothing linked' }
else { New-Item -ItemType Junction -Path .claude\skills\split-plan -Target .agents\skills\split-plan | Out-Null }
```

Windows, in Command Prompt. Run `dir /A:L /B` first, as above:

```bat
if not exist .claude\skills\split-plan mklink /J .claude\skills\split-plan .agents\skills\split-plan
```

The link stays out of git because `git add` follows a Windows junction and commits a second copy. Each person makes the link once on their own machine.

## Check

1. `ls -la .claude` shows `skills -> ../.agents/skills`. Windows: `dir .claude` shows `<JUNCTION>` next to `skills`. If you linked one skill at a time, look in `.claude/skills` instead.
2. `git diff .gitignore` shows only added lines. No old line changed: `.env` and the rest are still there as they were.
3. `git status --short` lists only paths from this manifest, `AGENTS.md` and `.agents/`. Anything else, such as `.env`: stop and fix it before you commit. `.claude/skills/rig/` shows there when this kit is installed in the repo: ask the human whether to commit it or add it to `.gitignore`.
4. Start a new Claude Code session in the repo root. Ask: "Which skills can you use here?" The answer lists `split-plan`.
5. Ask: "How does a worker close an issue in this repo?" The answer gives the closing comment from `AGENTS.md`.

## Undo

Remove the link only, never with a recursive delete: a recursive delete goes through the link and empties `.agents/skills`.

- macOS, Linux or Git Bash: `rm .claude/skills`, with no trailing slash.
- PowerShell or Command Prompt: `cmd /c rmdir .claude\skills`. The PowerShell `rmdir` alone is `Remove-Item`, which can go through a junction.

Use the same command for a link inside `.claude/skills`. `.agents/skills` stays as it is. Then delete the `@AGENTS.md` line and the `.gitignore` line.
