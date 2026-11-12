#!/usr/bin/env node
// Tracker client for triage round mode. Reads TRACKER_URL and TRACKER_TOKEN from the environment.
// Usage:
//   node tracker.mjs get /issues        (or: issues)
//   node tracker.mjs issue 3
//   node tracker.mjs get /issues/3
//   node tracker.mjs comment 3 "text"            (or "-" for stdin, or a path to a .md file)
//   node tracker.mjs label 3 needs-human
//   node tracker.mjs close 3
//   node tracker.mjs records | record 0007-slug
//   node tracker.mjs put-record 0007-slug <file.md>
//   node tracker.mjs shiplog | ship "#3 · shipped · live: ✓ · open risks: none"
// Prints the JSON answer. Exits 1 on a refused call. Never prints the token.
import { readFileSync, existsSync, statSync } from 'node:fs';

const base = (process.env.TRACKER_URL || '').replace(/\/$/, '');
const token = process.env.TRACKER_TOKEN || '';
if (!base || !token) {
  console.error('TRACKER_URL and TRACKER_TOKEN must be set');
  process.exit(2);
}

// '-' reads stdin; a path to an existing file reads that file (never post a bare path as text)
const readText = (v) => (v === '-' ? readFileSync(0, 'utf8')
  : !v.includes('\n') && v.length < 1024 && existsSync(v) && statSync(v).isFile() ? readFileSync(v, 'utf8') : v);

async function call(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let out;
  try { out = JSON.parse(text); } catch { out = { raw: text }; }
  console.log(JSON.stringify(out, null, 2));
  if (!res.ok) {
    console.error(`refused: ${method} ${path} -> ${res.status}`);
    process.exit(1);
  }
  return out;
}

const [cmd, a, b] = process.argv.slice(2);
switch (cmd) {
  case 'get': await call('GET', a || '/issues'); break;
  case 'issues': await call('GET', '/issues'); break;
  case 'issue': await call('GET', `/issues/${a}`); break;
  case 'comment': await call('POST', `/issues/${a}/comments`, { body: readText(b) }); break;
  case 'label': await call('POST', `/issues/${a}/labels`, { label: b }); break;
  case 'close': await call('POST', `/issues/${a}/close`); break;
  case 'records': await call('GET', '/records'); break;
  case 'record': await call('GET', `/records/${a}`); break;
  case 'put-record': await call('PUT', `/records/${a}`, { text: readFileSync(b, 'utf8') }); break;
  case 'shiplog': await call('GET', '/shiplog'); break;
  case 'ship': await call('POST', '/shiplog', { line: readText(a) }); break;
  default:
    console.error('commands: get [path], issues, issue <n>, comment, label, close, records, record, put-record, shiplog, ship');
    process.exit(2);
}
