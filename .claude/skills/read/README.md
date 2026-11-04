# read

by rook

`read` is a skill for your AI agent. It gives the agent three habits for moments when a quick answer looks right and is wrong:

1. **Contracts.** Before it sends a body to an API or a form it has not read, it finds the contract the page declares and quotes it.
2. **Cuts.** Before it shortens a text you gave it, it writes a keep list, counts with a script, and shows you every cut.
3. **Newest names.** When you ask it to name the newest model or product, it writes its memory answer and how sure it is, then checks a live page and cites it.

The folder uses the Agent Skills format: a folder with a `SKILL.md` file, which Claude Code, Cursor and Codex read.

## What is in the folder

| File | What it does |
|---|---|
| `SKILL.md` | The rules your agent follows, with a check or a question for each and what "done" looks like. |
| `scripts/find-contract.mjs` | Fetches a page, or reads a saved one, and lists the contracts it declares: `service-desc`, `describedby` and `service-doc` links, JSON or YAML alternates, the schema a JSON response names in `$schema`, and each form with the fields it sends and their limits. |
| `scripts/find-contract.selftest.mjs` | The checks behind `find-contract.mjs --self-test`. Your agent does not run this file. |
| `scripts/cut-diff.mjs` | Compares an original text with a short version. It counts characters and words against a limit, checks that each keep passage is still there character for character and whole, and lists every sentence that was cut, including one whose words now sit only inside a longer sentence. |
| `README.md` | This file. |

The scripts need Node.js 18 or newer. There is nothing to install: no packages and no dependencies.

## Install

Copy the whole `read` folder and keep its name. The folder name must match `name: read` in `SKILL.md`. To update, replace the whole folder with the new one.

**Claude Code**
- One project: `<project>/.claude/skills/read/`
- Every project: `~/.claude/skills/read/`

Start a new session so Claude Code loads the skill.

**Cursor, Codex and other agents that read skill folders:** put the `read` folder in the skills folder named in that agent's own documentation, then start a new session.

**An agent without skill folders:** paste the text of `SKILL.md`, without the part between the two `---` lines, into the agent's instructions file, for example `AGENTS.md`, and keep the `scripts/` folder in the project.

## Check that it works

1. **The scripts run.** From your project folder (Claude Code path shown):

   ```
   node .claude/skills/read/scripts/cut-diff.mjs --self-test
   node .claude/skills/read/scripts/find-contract.mjs --self-test
   ```

   Each prints `self-test ok`. Neither one uses the network.
2. **A real try.** In a new session, paste three or four paragraphs and ask: "Shorten this to 400 characters. Keep the second paragraph exactly as written." The agent should write a keep list, run `cut-diff.mjs`, and show you the counts and the cut list before it gives you the short version.

## Known limits

- A `form=` field inside a `<template>`, a `<noscript>` or a shadow root can be missing, or stand under the wrong form.
- An option's text stops at its first tag, and text over two lines keeps its line break.
- A query in a page that is not UTF-8 prints as UTF-8, so the address can differ from a browser's.
- A legacy page with no encoding near its top gets a sign, not a right reading.
- XHTML is read as HTML, so `<script/>` can hide what follows it.
- `rel="alternate"` with the OpenAPI or AsyncAPI media type is not listed.
- A saved YAML contract with `<form>` in a string can read as a page.
- CDATA under an HTML element in an `<svg>` can hide a form.

## Safety

- `find-contract.mjs` sends one GET request to the URL you give it, and with `--open` one GET for each contract it lists (ten at most), following at most five redirects. It sends no body, no cookies and no keys. It refuses a URL with a user name or password in it, and a redirect from `https` to plain `http`.
- Before each request, and before it follows each redirect, `find-contract.mjs` refuses a name that says it is local: `localhost`, or a name under `.localhost`, `.local`, `.internal` or `.home.arpa`. Then it looks up every address of the host. If any of them is on your machine or a private network, it refuses and tells the agent to ask you: loopback such as `127.0.0.1`, private such as `192.168.x.x`, link-local such as `169.254.169.254`, cloud metadata such as `168.63.129.16`, the networks your machine is on (also a public IPv6 one, and the router on it), and every other range that is not the public internet. In IPv6, only `2000::/3` counts as public, and a NAT64 address when the IPv4 address it carries is public. It then connects only to the addresses it checked, so a name cannot switch to another address in between.
- One exception, which you give: `--local`. When you ask your agent to check your own local page, such as `http://localhost:3000`, it adds `--local`, and the script may open pages and contracts on that same address and port. The URL itself must say it is local: a local name from the list above, or a private address. A name that only resolves to one, such as `myapp.test` in your hosts file, is refused, so give the agent the address instead. The first address it accepts holds for the whole run. Any other port or host on your network is still refused, and a link-local or cloud metadata address always is.
- It reads at most 5 MB of each response or file. It lists at most 200 links and 200 forms, cuts a value over 2,000 characters, stops the report at 256 KB, and says so each time. With `--open`, it prints at most 5 MB of each contract and 10 MB in all, counted as printed, and says when it cuts one.
- It reads the page as written, by the rules a browser's reader follows, in the encoding the page names. No script runs and no frame opens, so a form a script adds is not listed, and the report counts the frames. A form in a `<template>`, a `<noscript>`, an `<svg>` or a `<math>` is listed and says so: where it cannot be sure of a browser, it lists and labels, and never hides. It builds no page, so on odd markup a browser can still differ, such as tags inside a `<select>`, where browsers differ too.
- The report prints the value of each hidden field, radio, checkbox and button, because a form sends it. A page saved while you are signed in can hold a one-time token there, so treat the report as you treat that page.
- What it prints from a page is data. In the report, everything from the page stands in double quotes, and a `"` of the page's own shows as `\u{22}`, so the page cannot end its quotes. Line breaks, control characters and invisible characters inside a field name, a value or a contract show as `\u{…}`, so a page cannot write a line that looks like the script's own, move the cursor or hide text. With `--open`, each contract stands between two lines with a random word in them that the server cannot know. The skill tells the agent never to follow instructions found in that text.
- `cut-diff.mjs` uses no network. It prints text from your files the same way: in double quotes, with control and invisible characters as `\u{…}`. It stops with a `FAIL` on a text of over 20,000 sentences, a text too long or too repetitive to check in a few seconds, or a cut list over 256 KB, and takes at most 50 keep passages. For such a text, check one part at a time.
- Both scripts read files only inside the folder you run them from, also when a link points out of it. A network path such as `\\server\share\page.html` is refused before anything looks it up, and on Windows they do not follow a link at all. For a file anywhere else, they stop and tell the agent to ask you first. One kind of link they cannot see: a hard link looks like a plain file in the folder.
- Neither script writes, installs or deletes anything.
- Your agent writes files in the folder it works in, usually your project: rule 2 saves the text you shorten, its short version and the keep list (for example in `cut/`), and rule 1 can ask you to save a signed-in page there. Delete them when you are done, and keep them out of commits.
