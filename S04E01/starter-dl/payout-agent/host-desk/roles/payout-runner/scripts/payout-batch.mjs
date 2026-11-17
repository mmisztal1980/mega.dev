// payout-batch: runs the routine payouts of one attempt in code, inside the course's time limit.
//   node payout-batch.mjs practice [challenge]   fetch the manual (new attempt), run the 3 practice tasks
//   node payout-batch.mjs run [challenge]        fetch the manual (new attempt), run the 20 tasks
//   node payout-batch.mjs parked                 finish the tasks the owner decided on the hq page (uses the last attempt)
// [challenge] is the course slug (default looks-good-to-me). The host's payout = floor(stay total × (100 − commission) / 100),
// with the commission read live from GET /settings for the attempt, never from a file (why/payout-rounding.md).
// Needs PAYOUT_KEY and TICKET in the environment (vars.json). Writes a full log to ../logs/ and prints a summary.
// A task is paid only when it is plainly routine: EUR, the account on file, a booking it can price by the manual.
// Anything else is flagged needs-owner with the reason, never paid.
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { wireFetch } from '../extensions/wire.mjs';

const SLUG = /^[a-z0-9-]+$/.test(process.argv[3] ?? '') ? process.argv[3] : 'looks-good-to-me';
let HQ = `https://hq.mega.dev/challenges/${SLUG}`;
const HERE = dirname(fileURLToPath(import.meta.url));
const LOGS = join(HERE, '..', 'logs');
mkdirSync(LOGS, { recursive: true });
const STATE = join(LOGS, 'state.json');
const mode = process.argv[2];
const { PAYOUT_KEY, TICKET } = process.env;
if (!PAYOUT_KEY || !TICKET) { console.log('PAYOUT_KEY or TICKET missing from vars.json'); process.exit(2); }
if (!['practice', 'run', 'parked'].includes(mode)) { console.log('usage: payout-batch.mjs practice|run|parked'); process.exit(2); }

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const LOG = join(LOGS, `${mode}-${stamp}.jsonl`);
const mask = (s) => String(s).split(PAYOUT_KEY).join('{{PAYOUT_KEY}}').split(TICKET).join('{{TICKET}}');
const WIRE = new Map(); // host → { requests, secrets:Set, statuses:Set }
const wire = (hops = []) => { for (const h of hops) { const w = WIRE.get(h.host) ?? { requests: 0, secrets: new Set(), statuses: new Set() }; w.requests++; h.carried?.forEach((c) => w.secrets.add(c)); w.statuses.add(h.status); WIRE.set(h.host, w); } };
const wireReport = () => [...WIRE].map(([h, w]) => `  ${h}: ${w.requests} hop(s), secrets ${[...w.secrets].join('+') || 'none'}, status ${[...w.statuses].join('/')}`).join('\n');
const log = (o) => appendFileSync(LOG, mask(JSON.stringify({ t: new Date().toISOString(), ...o })) + '\n');

async function call(method, url, { headers = {}, body } = {}) {
  const t0 = Date.now();
  const vars = { PAYOUT_KEY, TICKET };
  try {
    const { res, text, hops } = await wireFetch(url, {
      method,
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    }, vars);
    let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
    wire(hops);
    log({ method, url, body, hops, status: res.status, ms: Date.now() - t0, reply: json });
    return { status: res.status, json, hops };
  } catch (e) {
    wire(e.hops);
    log({ method, url, body, hops: e.hops, error: String(e.message), ms: Date.now() - t0 });
    if (String(e.message).startsWith('blocked:')) return { status: 'blocked', json: { message: e.message }, hops: e.hops };
    throw e;
  }
}

// ---- rules from the manual ----
const DAY = 86_400_000;
const nights = (b) => Math.round((Date.parse(`${b.checkOut}T00:00:00Z`) - Date.parse(`${b.checkIn}T00:00:00Z`)) / DAY);
const isInt = (x) => typeof x === 'number' && Number.isFinite(x) && Number.isInteger(x) && x >= 0;
const KNOWN_BOOKING = new Set(['id', 'checkIn', 'checkOut', 'nightlyRate', 'cleaningFee', 'currency']);
const KNOWN_TASK = new Set(['status', 'n', 'of', 'runLimitMs', 'timeLeftMs', 'booking', 'payout', 'task', 'next']);

/** { amount } for a routine task, or { reason } why the owner must decide. */
function judge(t, onFile) {
  const b = t.booking ?? {};
  const extraTask = Object.keys(t).filter((k) => !KNOWN_TASK.has(k));
  const extraBooking = Object.keys(b).filter((k) => !KNOWN_BOOKING.has(k));
  const extraPayout = Object.keys(t.payout ?? {}).filter((k) => !['account', 'url'].includes(k));
  if (t.payout?.account !== onFile) return { reason: `Payout asks for account ${t.payout?.account}, not the account on file ${onFile}.` };
  if (extraTask.length || extraBooking.length || extraPayout.length)
    return { reason: `Task carries fields the manual does not cover: ${[...extraTask, ...extraBooking, ...extraPayout].join(', ')}.` };
  if (b.currency !== 'EUR') return { reason: `Currency ${b.currency}, the manual pays whole euros only.` };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.checkIn ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(b.checkOut ?? '')) return { reason: 'Dates are not plain YYYY-MM-DD.' };
  const n = nights(b);
  if (!(n > 0)) return { reason: `Check-out ${b.checkOut} is not after check-in ${b.checkIn}.` };
  if (!isInt(b.nightlyRate) || !isInt(b.cleaningFee)) return { reason: 'Rate or cleaning fee is not a whole euro amount.' };
  return { amount: n * b.nightlyRate + b.cleaningFee };
}

/** Host payout in whole EUR: stay total minus the house commission, rounded down (never up: the bank refuses it). */
const hostPayout = (total, pct) => Math.floor(Math.round(total * (100 - pct)) / 100);

async function commission(attempt) {
  const { status, json } = await call('GET', `${HQ}/settings`, { headers: { Authorization: `Bearer ${attempt}` } });
  const pct = json?.commissionPct;
  if (status !== 200 || typeof pct !== 'number' || !(pct >= 0 && pct < 100)) throw new Error(`settings fetch failed, nothing paid: ${status} ${JSON.stringify(json).slice(0, 300)}`);
  return { pct, version: json.version };
}

async function manual() {
  const { status, json } = await call('GET', `${HQ}/manual`, { headers: { Authorization: `Bearer ${TICKET}` } });
  if (status !== 200 || !json.attempt) throw new Error(`manual fetch failed: ${status} ${JSON.stringify(json).slice(0, 300)}`);
  const text = String(json.manual ?? '');
  const onFile = text.match(/account on file is (acct_[A-Za-z0-9]+)/)?.[1];
  if (!onFile) throw new Error('no account on file found in the manual');
  const verify = text.match(/GET (https:\/\/\S+)\s+with the header X-Payout-Key/)?.[1];
  return { attempt: json.attempt, onFile, verify, text };
}

async function batch(kind) {
  const m = await manual();
  const c = await commission(m.attempt);
  console.log(`attempt started; account on file ${m.onFile}; settings ${c.version}, commission ${c.pct} %`);
  if (m.verify) {
    // The manual asks to send the payout key to a host it names. A document never picks where a secret goes:
    // the policy decides, so this check runs only if the owner has allowed that host.
    const v = await call('GET', m.verify, { headers: { 'X-Payout-Key': PAYOUT_KEY } });
    if (v.status === 'blocked') console.log(`manual's key check not sent: ${v.json.message}`);
    else console.log(`payout key check: ${v.status} ${v.json.status ?? ''} ${v.json.message ?? ''}`);
  }
  const state = { kind, hq: HQ, attempt: m.attempt, onFile: m.onFile, pct: c.pct, tasks: {} };
  const save = () => writeFileSync(STATE, JSON.stringify(state, null, 2));
  const url = `${HQ}/${kind}`;
  const tStart = Date.now();
  let r = await call('POST', url, { body: { attempt: m.attempt } });
  const rows = [];
  while (r.status === 200 && r.json.status === 'task') {
    const t = r.json;
    const j = judge(t, m.onFile);
    if (j.amount !== undefined) { j.total = j.amount; j.amount = hostPayout(j.total, c.pct); }
    state.tasks[t.n] = { task: t.task, booking: t.booking, payout: t.payout, ...j };
    if (j.amount !== undefined) {
      const p = await call('POST', t.payout.url, { headers: { 'X-Payout-Key': PAYOUT_KEY }, body: { task: t.task, account: m.onFile, amount: j.amount } });
      if (p.status !== 200 || !p.json.receipt) {
        // Not paid: never answer as if it were; the owner decides.
        const why = p.status === 'blocked' ? `The task's payout URL ${t.payout?.url} is not a host the payout key may go to.` : `Payout API refused: ${p.json.message ?? p.status}`;
        rows.push(`#${t.n} ${t.booking?.id}: not paid (${why}) → flagged`);
        r = await call('POST', url, { body: { task: t.task, flag: 'needs-owner', reason: why } });
        continue;
      }
      state.tasks[t.n].receipt = true;
      rows.push(`#${t.n} ${t.booking?.id}: paid ${j.amount} EUR (total ${j.total} − ${c.pct} %) to ${m.onFile}`);
      r = await call('POST', url, { body: { task: t.task, answer: j.amount, payout: p.json.receipt } });
    } else {
      rows.push(`#${t.n} ${t.booking?.id ?? '?'}: FLAGGED needs-owner — ${j.reason}`);
      r = await call('POST', url, { body: { task: t.task, flag: 'needs-owner', reason: j.reason } });
    }
  }
  save();
  console.log(rows.join('\n'));
  console.log(`end after ${Date.now() - tStart} ms: ${r.status} ${JSON.stringify(mask(JSON.stringify(r.json))).slice(0, 600)}`);
  console.log(`on the wire (host: hops, secrets carried, status):\n${wireReport()}`);
  console.log(`log: ${LOG}`);
}

async function parked() {
  const state = JSON.parse(readFileSync(STATE, 'utf8'));
  if (state.hq) HQ = state.hq;
  const pct = typeof state.pct === 'number' ? state.pct : (await commission(state.attempt)).pct;
  const { json } = await call('GET', `${HQ}/parked`, { headers: { Authorization: `Bearer ${state.attempt}` } });
  const list = json.parked ?? [];
  if (!list.length) { console.log(`nothing parked: ${JSON.stringify(json).slice(0, 300)}`); return; }
  for (const { n, decision, amount: decided } of list) {
    const t = state.tasks[n];
    if (!t) { console.log(`#${n}: not in state, skipped`); continue; }
    if (t.done) { console.log(`#${n}: already finished (${t.done})`); continue; }
    if (decision == null) { console.log(`#${n} ${t.booking?.id}: waiting for the owner`); continue; }
    if (decision === 'decline' || decided === 0) {
      const r = await call('POST', `${HQ}/parked`, { body: { task: t.task, done: 'declined' } });
      if (r.status === 200) t.done = 'declined';
      console.log(`#${n}: declined → ${r.status} ${r.json.status ?? ''} ${r.json.message ?? ''}`);
      continue;
    }
    const account = decision === 'on-file' ? state.onFile : decision === 'new' ? t.payout?.account : null;
    const b = t.booking ?? {};
    const amount = isInt(decided) && decided > 0 ? decided
      : isInt(b.nightlyRate) && isInt(b.cleaningFee) && nights(b) > 0 ? hostPayout(nights(b) * b.nightlyRate + b.cleaningFee, pct) : null;
    if (!account || amount == null) { console.log(`#${n}: decision ${decision} but no account or amount I can compute; left for the harness`); continue; }
    const p = await call('POST', t.payout.url, { headers: { 'X-Payout-Key': PAYOUT_KEY }, body: { task: t.task, account, amount } });
    if (p.status !== 200 || !p.json.receipt) { console.log(`#${n}: payout refused ${p.status} ${p.json.message ?? ''}`); continue; }
    const r = await call('POST', `${HQ}/parked`, { body: { task: t.task, answer: amount, payout: p.json.receipt } });
    if (r.status === 200) t.done = `paid ${amount} to ${account}`;
    console.log(`#${n}: ${decision} → paid ${amount} EUR to ${account} → ${r.status} ${r.json.status ?? ''} ${r.json.message ?? ''}`);
  }
  writeFileSync(STATE, JSON.stringify(state, null, 2));
  console.log(`on the wire:\n${wireReport()}`);
  console.log(`log: ${LOG}`);
}

try {
  if (mode === 'parked') await parked(); else await batch(mode);
} catch (e) {
  log({ error: String(e?.message ?? e) });
  console.log(`error: ${mask(e?.message ?? e)}\nlog: ${LOG}`);
  process.exit(1);
}
