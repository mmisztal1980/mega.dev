// Local mock of the course tracker (AGENTS.md shapes) for a dry run. Not the course.
// Also serves a mock feed at /feed. node mock-tracker.mjs [port]
import { createServer } from 'node:http';

const port = Number(process.argv[2] || 8788);
const now = () => new Date().toISOString();
const issues = [
  { n: 1, title: 'Filter incidents by service', body: 'From support: the console needs only one service\'s incidents. Can we get GET /incidents?service=booking-api ? — support', openedAt: now(), labels: [], closed: false, thread: [] },
];
const records = [];
const ship = new Map();
const feed = { incidents: [
  { id: 'INC-2', service: 'calendar-sync', summary: 'sync lag', status: 'open', openedAt: '2026-11-11T02:45:00.000Z' },
  { id: 'INC-1', service: 'booking-api', summary: '5xx spike', status: 'open', openedAt: '2026-11-11T02:43:00.000Z' },
] };

const send = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
createServer(async (req, res) => {
  let raw = ''; for await (const c of req) raw += c;
  const body = raw ? JSON.parse(raw) : {};
  const u = new URL(req.url, 'http://x');
  console.log(req.method, u.pathname, raw.slice(0, 300));
  if (u.pathname === '/feed') return send(res, 200, feed);
  if (req.headers.authorization !== 'Bearer mock-token') return send(res, 401, { message: 'no' });
  let m;
  if (req.method === 'GET' && u.pathname === '/issues') return send(res, 200, { now: now(), lastIssueBy: now(), issues });
  if ((m = u.pathname.match(/^\/issues\/(\d+)(\/(\w+))?$/))) {
    const i = issues.find((x) => x.n === Number(m[1])); if (!i) return send(res, 404, { message: 'no issue' });
    if (req.method === 'GET' && !m[3]) return send(res, 200, i);
    if (m[3] === 'comments') i.thread.push({ by: 'agent', at: now(), kind: 'comment', body: body.body });
    if (m[3] === 'labels') { i.labels.push(body.label); i.thread.push({ by: 'agent', at: now(), kind: 'label', label: body.label }); }
    if (m[3] === 'close') { i.closed = true; i.thread.push({ by: 'agent', at: now(), kind: 'close' }); }
    return send(res, 200, { ok: true });
  }
  if (u.pathname === '/records' && req.method === 'GET') return send(res, 200, { records });
  if ((m = u.pathname.match(/^\/records\/(.+)$/))) {
    let r = records.find((x) => x.id === m[1]);
    if (req.method === 'GET') return r ? send(res, 200, r) : send(res, 404, { message: 'no record' });
    if (!r) { r = { id: m[1], by: 'agent', status: 'proposed', versions: [], history: [] }; records.push(r); }
    r.text = body.text; r.updatedAt = now(); r.versions.push({ at: now(), signed: false }); r.history.push({ at: now(), text: body.text });
    return send(res, 200, { ok: true, version: r.versions.length });
  }
  if (u.pathname === '/shiplog' && req.method === 'GET') return send(res, 200, { text: [...ship.values()].join('\n') });
  if (u.pathname === '/shiplog' && req.method === 'POST') { ship.set(body.line.split(' ')[0], body.line); return send(res, 200, { ok: true }); }
  // test hook: owner answers
  if (u.pathname === '/_owner' && req.method === 'POST') { issues.find((x) => x.n === body.n).thread.push({ by: 'owner', at: now(), kind: 'comment', body: body.body }); return send(res, 200, { ok: true }); }
  if (u.pathname === '/_issue' && req.method === 'POST') { issues.push({ n: issues.length + 1, openedAt: now(), labels: [], closed: false, thread: [], ...body }); return send(res, 200, { ok: true }); }
  send(res, 404, { message: 'not found' });
}).listen(port, () => console.log('mock tracker on', port));
