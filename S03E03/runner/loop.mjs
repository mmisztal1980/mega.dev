#!/usr/bin/env node
// S03E03 runner: polls the course tracker every POLL_S seconds, posts a pickup comment on each new
// issue at once, and hands each issue that needs work to headless Claude Code (claude -p) in the
// sched-prod-api repo, which works it from the triage skill (ROUND.md). One claude run at a time.
//
// Config: ../round.secret.json { "trackerUrl": "...", "token": "..." }  (outside every repo)
// Logs:   ./runs/<time>-issue-<n>.log (claude output), ./events.jsonl (one line per event)
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = process.env.REPO || join(here, '..', 'sched-prod-api');
const cfg = JSON.parse(readFileSync(process.env.ROUND_CFG || join(here, '..', 'round.secret.json'), 'utf8'));
const DRY = process.env.DRY_RUN === '1';
const base = cfg.trackerUrl.replace(/\/$/, '');
const POLL_S = Number(process.env.POLL_S || 30);
const statePath = join(here, DRY ? 'state.dry.json' : 'state.json');
const runsDir = join(here, DRY ? 'runs-dry' : 'runs');
mkdirSync(runsDir, { recursive: true });

// state.issues[n] = { seenEntries: number of thread entries already handed to claude (or posted by us) }
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : { issues: {} };
const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2));
const log = (event, data = {}) => {
  const line = { at: new Date().toISOString(), event, ...data };
  appendFileSync(join(here, DRY ? 'events.dry.jsonl' : 'events.jsonl'), JSON.stringify(line) + '\n');
  console.log(JSON.stringify(line));
};

async function api(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { authorization: `Bearer ${cfg.token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

const queue = [];          // issue numbers waiting for a claude run
let running = null;        // issue number claude is working now

// An issue needs a claude run when it is open and its thread has entries from someone other than the
// agent that claude has not seen yet (new issue, owner answer, course comment), or it was never worked.
function needsRun(issue) {
  const s = state.issues[issue.n];
  if (!s || !s.worked) return !issue.closed;
  const fresh = issue.thread.slice(s.seenEntries).filter((e) => e.by !== 'agent');
  return fresh.length > 0;
}

async function pickup(issue) {
  const hasAgent = issue.thread.some((e) => e.by === 'agent');
  if (hasAgent) return;
  await api('POST', `/issues/${issue.n}/comments`, {
    body: 'Picked up by the agent. Working it now from the triage skill; updates follow here and in the ship log.',
  });
  log('pickup', { n: issue.n, openedAt: issue.openedAt });
}

function runClaude(n) {
  return new Promise((resolve) => {
    const prompt = [
      `You are the agent that delivers sched-prod-api while the owner is away (see AGENTS.md).`,
      `Work tracker issue #${n} now, alone, from the triage skill in round mode: load the triage skill and follow its ROUND.md.`,
      `Tracker client: node .agents/skills/triage/scripts/tracker.mjs (TRACKER_URL and TRACKER_TOKEN are set).`,
      `Live address: https://megadevs03e03.cloud-tek.io . Deploy with npm run deploy.`,
      `Read the whole issue thread: if the owner (by: owner) answered /answer <n>, act on it; if a course comment changed the ask, follow up.`,
      `If the issue is already fully handled and nothing new needs doing, do nothing and say so.`,
      `End with one line: RESULT #${n} <verb>.`,
      ...(DRY ? ['DRY RUN: do not run npm run deploy and do not curl the live address. Do everything else; the ship line says live: ✗ and waiting instead of shipped.'] : []),
    ].join('\n');
    const file = join(runsDir, `${new Date().toISOString().replace(/[:.]/g, '-')}-issue-${n}.log`);
    const args = [
      '-p', prompt,
      '--model', 'claude-opus-5-5',
      '--output-format', 'stream-json', '--verbose',
      '--permission-mode', 'acceptEdits',
      '--allowedTools',
      'Read', 'Edit', 'Write', 'Glob', 'Grep', 'Skill',
      'Bash(node:*)', 'Bash(npm run deploy:*)', 'Bash(npx wrangler:*)', 'Bash(curl:*)', 'Bash(git:*)',
      'Bash(ls:*)', 'Bash(cat:*)', 'Bash(mkdir:*)',
    ];
    log('claude-start', { n, logFile: file });
    const child = spawn('claude', args, {
      cwd: repo,
      env: { ...process.env, TRACKER_URL: base, TRACKER_TOKEN: cfg.token },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const timer = setTimeout(() => { log('claude-timeout', { n }); child.kill('SIGTERM'); }, 25 * 60 * 1000);
    child.stdout.on('data', (d) => appendFileSync(file, d));
    child.stderr.on('data', (d) => appendFileSync(file, d));
    child.on('close', (code) => {
      clearTimeout(timer);
      const out = existsSync(file) ? readFileSync(file, 'utf8') : '';
      const result = (out.match(/RESULT #\d+ [^"\\]*/g) || []).pop() || '(no RESULT line)';
      log('claude-end', { n, code, result });
      resolve(code);
    });
  });
}

async function drain() {
  if (running !== null || queue.length === 0) return;
  const n = queue.shift();
  running = n;
  try {
    // snapshot thread length before the run: anything that arrives during the run triggers another run
    const before = await api('GET', `/issues/${n}`);
    const seen = before.thread.length;
    await runClaude(n);
    const after = await api('GET', `/issues/${n}`);
    // the first non-agent entry that arrived during the run stays unseen, so it triggers another run
    const idx = after.thread.findIndex((e, i) => i >= seen && e.by !== 'agent');
    state.issues[n] = { worked: true, seenEntries: idx === -1 ? after.thread.length : idx };
    save();
  } catch (e) {
    log('run-error', { n, error: String(e) });
  } finally {
    running = null;
    setTimeout(drain, 0);
  }
}

async function tick() {
  try {
    const { now, lastIssueBy, issues } = await api('GET', '/issues');
    for (const issue of issues) {
      if (!issue.closed) await pickup(issue).catch((e) => log('pickup-error', { n: issue.n, error: String(e) }));
      if (needsRun(issue) && running !== issue.n && !queue.includes(issue.n)) {
        queue.push(issue.n);
        log('queued', { n: issue.n, title: issue.title });
      }
    }
    log('tick', { now, lastIssueBy, issues: issues.length, open: issues.filter((i) => !i.closed).length, queue: [...queue], running });
  } catch (e) {
    log('tick-error', { error: String(e) });
  }
  drain();
}

log('runner-start', { base, repo, pollS: POLL_S });
tick();
setInterval(tick, POLL_S * 1000);
