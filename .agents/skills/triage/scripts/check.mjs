#!/usr/bin/env node
// Checks a Markdown tracker against the triage rules. Prints one line per problem, or `ok`.
//
//   node check.mjs <dir with issue .md files> [--api <api url> --session <token>]
//
// With --api/--session it also reads every channel from the start and checks that every
// request id sits in the `sources` of some issue, and that every backlog key has a file.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: node check.mjs <issues dir> [--api URL --session TOKEN]');
  process.exit(2);
}
const arg = (n) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};

function parse(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-z-]+):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].replace(/\s+#.*$/, '').trim();
    if (v.startsWith('[')) v = v.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean);
    else if (v.startsWith('"')) v = JSON.parse(v);
    fm[kv[1]] = v;
  }
  return { fm, body: m[2] };
}

const problems = [];
const say = (f, msg) => problems.push(`${f}: ${msg}`);
const issues = [];
for (const f of readdirSync(dir).filter((f) => f.endsWith('.md')).sort()) {
  const p = parse(readFileSync(join(dir, f), 'utf8'));
  if (!p) { say(f, 'no frontmatter'); continue; }
  issues.push({ f, ...p });
}
const keys = new Set(issues.map((i) => i.fm.key));
const seen = new Map();

for (const { f, fm, body } of issues) {
  const labels = fm.labels ?? [];
  const marks = labels.filter((l) => l === 'agent-ready' || l === 'needs-human');
  // A request may feed two issues when it was split (one ticket, two problems).
  for (const s of fm.sources ?? []) seen.set(s, f);
  for (const b of fm['blocked-by'] ?? []) if (!keys.has(b)) say(f, `blocked-by ${b} is no issue`);
  const cites = /\b(AUT|DES|PRD)-\d+\b|ADR-\d{4}|SCHED-\d+|IN-\d+/;

  if (!['open', 'done', 'closed'].includes(fm.status)) { say(f, `status ${fm.status}`); continue; }
  if (fm.status === 'closed') {
    if (!['duplicate', 'obsolete', 'contradicts-spec', 'not-planned'].includes(fm.reason)) say(f, `closed without a valid reason`);
    if (fm.reason === 'duplicate' && !keys.has(fm['duplicate-of'])) say(f, 'duplicate without a duplicate-of issue');
    if (!cites.test(body)) say(f, 'closed body cites no rule, issue or request id');
  }
  if (fm.status !== 'open') continue;
  if (marks.length !== 1) { say(f, `open with marks [${marks.join(', ')}]`); continue; }
  if (marks[0] === 'agent-ready') {
    for (const h of ['## Intent', '## Acceptance', '## Boundaries']) if (!body.includes(h)) say(f, `agent-ready without ${h}`);
    const acc = (body.split('## Acceptance')[1] ?? '').split('## ')[0];
    if (!/Given .*when .*then/i.test(acc) && !/- \[ \]/.test(acc)) say(f, 'acceptance has no Given/When/Then or checks');
    if (!/\bnot\b/i.test(acc)) say(f, 'acceptance has no must-not case');
    if (!/Allowed by AUT-1\b/.test(body)) say(f, 'agent-ready without "Allowed by AUT-1"');
  } else {
    for (const h of ['## Question', '## Options', '## Recommendation', '## Why']) if (!body.includes(h)) say(f, `needs-human without ${h}`);
    const opts = (body.split('## Options')[1] ?? '').split('## ')[0].match(/^\s*\d+\./gm) ?? [];
    if (opts.length < 2) say(f, 'needs-human with fewer than two options');
    if (!cites.test((body.split('## Why')[1] ?? ''))) say(f, 'needs-human Why cites no id');
  }
}

const api = arg('api')?.replace(/\/+$/, '');
const session = arg('session');
if (api && session) {
  const get = async (path, q = {}) => {
    const res = await fetch(`${api}${path}?${new URLSearchParams({ t: session, ...q })}`);
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return res.json();
  };
  const { issues: backlog } = await get('/backlog');
  for (const b of backlog) if (!keys.has(b.key)) problems.push(`backlog ${b.key} has no issue file`);
  for (const ch of ['desk', 'chat', 'mail']) {
    let since;
    for (let n = 0; n < 50; n++) {
      const page = await get(`/channels/${ch}`, since ? { since } : {});
      for (const it of page.items) if (!seen.has(it.id)) problems.push(`${ch} request ${it.id} is in no issue's sources`);
      if (!page.items.length || !page.cursor || page.cursor === since) break;
      since = page.cursor;
    }
  }
}

console.log(problems.length ? problems.join('\n') : 'ok');
process.exit(problems.length ? 1 : 0);
