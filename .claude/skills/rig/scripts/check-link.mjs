#!/usr/bin/env node
// check-link.mjs, from the rig setup kit.
//
// Opens a URL the way a stranger would and says what came back: status, final URL, content type,
// size, and whether a marker is in the body.
//
// A stranger has no cookies and no login, so this sends one plain GET with neither and follows
// redirects one hop at a time. It requests only the URL you give it and the redirects that URL
// points to. It sends no body, writes no file and keeps nothing. Node 18 or later, no dependencies.
//
// A stranger on the internet can't reach this machine or a private network, so a link that lands
// there never passes. Before each request, and before it follows each redirect, it looks up every
// address of the host. If any of them is on this machine or a private network (loopback, private,
// link-local, shared, unique local, IPv4-mapped, unspecified, the other ranges that are not the
// public internet, this machine's own networks), it sends nothing and the check fails. It then
// connects only to the addresses it checked, so the name can't point somewhere else in between.
// What it prints from a server is data: control and invisible characters show as \u{…}.
// Of each URL it prints the origin and path, never a query or a fragment: they can hold a token.

import assert from 'node:assert/strict';
import { lookup as dnsLookup } from 'node:dns/promises';
import { realpathSync } from 'node:fs';
import http, { STATUS_CODES } from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { networkInterfaces } from 'node:os';
import { pipeline } from 'node:stream';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const USAGE = `Usage: node check-link.mjs <url> [options]

  --marker <text>   text only the right page carries; reports whether the body has it
  --type <prefix>   the content type you expect, e.g. text/html
  --gone            pass when the link no longer opens for a stranger: 401, 403, 404, 410,
                    no such host, or a 2xx page without the marker
  --fresh           add a throwaway query parameter, so a cached copy can't answer for the page
  --json            print one JSON object instead of lines
  --timeout <s>     give up after this many seconds (default 10)
  --max-bytes <n>   read at most this much of the body (default 1000000)
  --self-test       test this script, with no network

Exit code: 0 when the check passes, 1 when it doesn't, 2 for a bad command line.`;

const USER_AGENT = 'Mozilla/5.0 (compatible; check-link/1.0)';
const MAX_REDIRECTS = 5;
const FRESH_PARAM = '_cl';
const SIGNED_QUERY = /[?&](x-amz-signature|x-goog-signature|signature|sig)=/i;
const GONE_STATUSES = new Set([401, 403, 404, 410]);
const MAX_SHOWN = 500;

const fmt = (n) => n.toLocaleString('en-US');
const statusLine = (r) => [r.status, r.statusText].filter(Boolean).join(' ');

// Characters a server can use to steer what the terminal or the agent sees: control characters, line
// and paragraph separators, bidirectional and zero-width marks, and every other invisible character:
// tag characters and variation selectors can carry text a model reads and a person cannot see. Printed
// text shows each one as \u{…}, and a header value stops at MAX_SHOWN characters.
const STEERING = /[\p{C}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}\u2800]/gu;
const shown = (s) => String(s).replace(STEERING, (c) => `\\u{${c.codePointAt(0).toString(16)}}`);
const clean = (s) => shown(String(s).slice(0, MAX_SHOWN));

function parseArgs(argv) {
  const opts = {
    url: null,
    marker: null,
    type: null,
    gone: false,
    fresh: false,
    json: false,
    timeout: 10,
    maxBytes: 1_000_000,
    help: false,
    selfTest: false,
  };
  for (let i = 0; i < argv.length; i++) {
    let arg = argv[i];
    let inline;
    if (arg.startsWith('--') && arg.includes('=')) {
      inline = arg.slice(arg.indexOf('=') + 1);
      arg = arg.slice(0, arg.indexOf('='));
    }
    const value = () => {
      if (inline !== undefined) return inline;
      const next = argv[++i];
      if (next === undefined) throw new Error(`${arg} needs a value`);
      return next;
    };
    switch (arg) {
      case '--marker':
        opts.marker = value();
        break;
      case '--type':
        opts.type = value();
        break;
      case '--gone':
        opts.gone = true;
        break;
      case '--fresh':
        opts.fresh = true;
        break;
      case '--json':
        opts.json = true;
        break;
      case '--timeout':
        opts.timeout = Number(value());
        break;
      case '--max-bytes':
        opts.maxBytes = Number(value());
        break;
      case '--self-test':
        opts.selfTest = true;
        break;
      case '-h':
      case '--help':
        opts.help = true;
        break;
      default:
        if (arg.startsWith('-')) throw new Error(`unknown option ${arg}`);
        if (opts.url !== null) throw new Error('one URL at a time');
        opts.url = arg;
    }
  }
  if (opts.help || opts.selfTest) return opts;
  if (opts.url === null) throw new Error('give a URL');
  if (!Number.isFinite(opts.timeout) || opts.timeout <= 0) throw new Error('--timeout takes a number of seconds above 0');
  if (!Number.isInteger(opts.maxBytes) || opts.maxBytes < 1) throw new Error('--max-bytes takes a whole number above 0');
  if (opts.marker === '') throw new Error('--marker takes some text');
  return opts;
}

// Address ranges that are not the public internet, as [first address, prefix length, what it is]
// (the IANA special-purpose address registries).
const NOT_PUBLIC = [
  ['0.0.0.0', 8, 'an unspecified address'],
  ['10.0.0.0', 8, 'a private address'],
  ['100.64.0.0', 10, 'a shared (carrier-grade NAT) address'],
  ['127.0.0.0', 8, 'a loopback address'],
  ['168.63.129.16', 32, 'a cloud platform address'],
  ['169.254.0.0', 16, 'a link-local address'],
  ['172.16.0.0', 12, 'a private address'],
  ['192.0.0.0', 24, 'a reserved address'],
  ['192.0.2.0', 24, 'a documentation address'],
  ['192.88.99.0', 24, 'a relay address'],
  ['192.168.0.0', 16, 'a private address'],
  ['198.18.0.0', 15, 'a benchmarking address'],
  ['198.51.100.0', 24, 'a documentation address'],
  ['203.0.113.0', 24, 'a documentation address'],
  ['224.0.0.0', 4, 'a multicast address'],
  ['240.0.0.0', 4, 'a reserved address'],
  ['::', 128, 'an unspecified address'],
  ['::1', 128, 'a loopback address'],
  ['::ffff:0:0', 96, 'an IPv4-mapped address'],
  ['::', 96, 'an IPv4-compatible address'],
  ['64:ff9b:1::', 48, 'a local NAT64 address'],
  ['100::', 64, 'a discard address'],
  ['2001::', 23, 'a reserved address'],
  ['2001:db8::', 32, 'a documentation address'],
  ['3fff::', 20, 'a documentation address'],
  ['fc00::', 7, 'a unique local address'],
  ['fe80::', 10, 'a link-local address'],
  ['fec0::', 10, 'a site-local address'],
  ['ff00::', 8, 'a multicast address'],
];
// IPv6 ranges that carry an IPv4 address: [first address, prefix length, bits to the right of it].
// NAT64 (64:ff9b::) and 6to4 (2002::) reach that IPv4 address, so it is checked too.
const CARRIES_IPV4 = [
  ['64:ff9b::', 96, 0],
  ['2002::', 16, 80],
];

// An IP address as one number and its length in bits, or null.
function ipBits(ip) {
  const v = isIP(ip);
  if (v === 4) return { n: ip.split('.').reduce((n, b) => (n << 8n) | BigInt(b), 0n), bits: 32 };
  if (v !== 6) return null;
  let s = ip;
  const v4 = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(s);
  if (v4) {
    const [a, b, c, d] = v4.slice(1).map(Number);
    s = `${s.slice(0, v4.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [left, right] = s.split('::');
  const head = left ? left.split(':') : [];
  const tail = right ? right.split(':') : [];
  const words = right === undefined ? head : [...head, ...Array(8 - head.length - tail.length).fill('0'), ...tail];
  return { n: words.reduce((n, w) => (n << 16n) | BigInt(parseInt(w, 16)), 0n), bits: 128 };
}

function inRange(a, first, prefix) {
  const f = ipBits(first);
  const shift = BigInt(a.bits - prefix);
  return f.bits === a.bits && a.n >> shift === f.n >> shift;
}

// The IPv4 address that ip carries, or null.
function carried(ip) {
  const a = ipBits(ip.replace(/%.*$/, ''));
  const range = a && CARRIES_IPV4.find(([first, prefix]) => inRange(a, first, prefix));
  if (!range) return null;
  const v4 = (a.n >> BigInt(range[2])) & 0xffffffffn;
  return [24n, 16n, 8n, 0n].map((s) => (v4 >> s) & 255n).join('.');
}

// What kind of address ip is when it is not a public one ("a loopback address"); null when it is public.
// In IPv6 only the block that starts at 2000:: is the public internet, so anything else is refused.
function notPublic(ip) {
  const a = ipBits(ip.replace(/%.*$/, ''));
  if (!a) return 'not an IP address';
  const inner = carried(ip);
  if (inner) {
    const why = notPublic(inner);
    return why && `an address that carries ${inner}, ${why}`;
  }
  const listed = NOT_PUBLIC.find(([first, prefix]) => inRange(a, first, prefix))?.[2];
  if (listed) return listed;
  return a.bits === 128 && !inRange(a, '2000::', 3) ? 'not a global IPv6 address' : null;
}

// A network as an address on it and its prefix length in bits (the whole address when none), or null.
function net(ip, prefix) {
  const a = ipBits(ip.replace(/%.*$/, ''));
  return a && { ...a, prefix: prefix ?? a.bits };
}

// The networks this machine is on, from each interface's address and prefix. A public address on one
// (a global IPv6 address, a server's IPv4, the router at the network's ::1) reaches this machine or the
// devices next to it. A prefix shorter than a quarter of the address (a catch-all VPN route) is no network
// of ours: only the address itself counts.
const netsOf = (interfaces) =>
  Object.values(interfaces)
    .flat()
    .map((i) => net(i.address, i.cidr ? Number(i.cidr.slice(i.cidr.lastIndexOf('/') + 1)) : undefined))
    .filter(Boolean)
    .map((n) => (n.prefix >= n.bits / 4 ? n : { ...n, prefix: n.bits }));
let own = null;
function ownNets() {
  if (own) return own;
  try {
    own = netsOf(networkInterfaces());
  } catch {
    own = [];
  }
  return own;
}

function onOwnNet(ip, nets) {
  const a = ipBits(ip.replace(/%.*$/, ''));
  return Boolean(a) && nets.some((n) => n.bits === a.bits && a.n >> BigInt(a.bits - n.prefix) === n.n >> BigInt(n.bits - n.prefix));
}

const bare = (host) => host.replace(/^\[|\]$/g, '');

// A name that says it is local: localhost, or a name under .localhost, .local, .internal or .home.arpa.
const LOCAL_NAME = /^(.*\.)?(localhost|local|internal|home\.arpa)\.*$/i;
const namesLocal = (host) => LOCAL_NAME.test(host) || (isIP(bare(host)) !== 0 && notPublic(bare(host)) !== null);

// A request the script will not send. ownNet: the address may be public, so a stranger may reach it,
// but this machine can't stand in for one.
const refusal = (message, ownNet = false) => Object.assign(new Error(message), { refused: true, ownNet });

// Every address of the URL's host, each one checked. An address that is not public, or is on one of
// this machine's own networks, refuses the whole request. So does a local name, before any lookup: a
// company's .internal host can sit at a public address.
async function vet(url, lookup, ownList) {
  const host = bare(url.hostname);
  const name = clean(host);
  if (LOCAL_NAME.test(host)) throw refusal(`${name} is a local name`);
  const list = await lookup(host, { all: true });
  if (list.length === 0) throw Object.assign(new Error('no address'), { code: 'ENOTFOUND' });
  const named = (address, why) => (address === host ? `${name} is ${why}` : `${name} resolves to ${address}, ${why}`);
  for (const { address } of list) {
    const why = notPublic(address);
    if (why) throw refusal(named(address, why));
  }
  for (const { address } of list) {
    if ([address, carried(address)].some((ip) => ip && onOwnNet(ip, ownList()))) throw refusal(named(address, "an address on this machine's own network"), true);
  }
  return list;
}

// A lookup for the connection that answers only with the addresses vet() checked, so the request goes
// where the check looked even if the name now resolves elsewhere.
function pinned(list) {
  return (hostname, options, callback) => {
    if (typeof options === 'function') [options, callback] = [{}, options];
    const family = typeof options === 'number' ? options : options?.family;
    const fit = list.filter((a) => a.family === family);
    const use = fit.length ? fit : list;
    if (options?.all) callback(null, use);
    else callback(null, use[0].address, use[0].family);
  };
}

// What a stranger somewhere else can't open, said before the request goes out.
function hostNotes(u) {
  const notes = [];
  const host = bare(u.hostname).toLowerCase();
  const ip = isIP(host) !== 0;
  if (u.protocol === 'http:') notes.push('plain http: browsers warn about it or upgrade it; send https if the host has it');
  if (namesLocal(host)) {
    const why = ip ? notPublic(host) : 'a local address';
    const kind = /loopback|unspecified/.test(why) ? 'a local address' : why;
    notes.push(`${kind}: nobody on the internet can open it`);
    return notes;
  }
  if (ip) notes.push('an IP address, not a name: check that it is public and stays the same');
  if (u.port) notes.push(`port ${u.port}: some offices and public Wi-Fi let only 80 and 443 through`);
  return notes;
}

function whyNoAnswer(err, timeout) {
  const code = String(err?.cause?.code ?? err?.code ?? '');
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError' || code === 'UND_ERR_CONNECT_TIMEOUT') {
    return { reason: `no answer within ${timeout} s`, noHost: false };
  }
  if (code === 'ENOTFOUND') return { reason: 'no such host', noHost: true };
  if (code === 'EAI_AGAIN') return { reason: 'the name lookup failed for now', noHost: false };
  if (code === 'ECONNREFUSED') return { reason: 'the host refused the connection', noHost: false };
  if (code === 'ECONNRESET') return { reason: 'the connection was cut', noHost: false };
  if (/CERT|SSL|TLS|SELF_SIGNED|VERIFY/i.test(code)) return { reason: `the certificate failed (${code})`, noHost: false };
  const detail = code || err?.cause?.message || err?.message || String(err);
  return { reason: `no answer (${clean(detail)})`, noHost: false };
}

const UNZIP = new Map([['gzip', zlib.createGunzip], ['x-gzip', zlib.createGunzip], ['deflate', zlib.createInflate], ['br', zlib.createBrotliDecompress]]);

// One GET to url, connecting only to `addresses`. It follows no redirect. The answer holds the status and
// headers; read(maxBytes) reads the body, after decompression, and discard() closes the connection.
// signal ends both the request and the read.
function send(url, addresses, signal) {
  return new Promise((done, fail) => {
    const client = url.protocol === 'https:' ? https : http;
    let res = null;
    const stop = () => (res ?? req).destroy(signal.reason);
    const req = client.request(
      url,
      {
        agent: false,
        lookup: pinned(addresses),
        headers: { 'user-agent': USER_AGENT, accept: '*/*', 'accept-encoding': 'gzip, deflate, br' },
      },
      (r) => {
        res = r;
        // A body the script stops reading ends with an error nobody waits for.
        r.on('error', () => {});
        done({
          status: r.statusCode,
          statusText: r.statusMessage,
          type: r.headers['content-type'] ?? null,
          location: r.headers.location ?? null,
          discard: () => r.destroy(),
          read: (maxBytes) => readBody(r, maxBytes),
        });
      },
    );
    signal.addEventListener('abort', stop, { once: true });
    req.on('error', fail);
    // A 101 reply never fires the response callback, so without these the script would end with no report.
    req.on('upgrade', (_, socket) => {
      socket.destroy();
      fail(new Error('it switched protocols instead of answering'));
    });
    req.on('close', () => fail(new Error('the connection closed with no answer')));
    req.end();
  });
}

async function readBody(res, maxBytes) {
  const unzip = UNZIP.get((res.headers['content-encoding'] ?? '').trim().toLowerCase());
  const body = unzip ? pipeline(res, unzip(), () => {}) : res;
  const chunks = [];
  let bytes = 0;
  for await (const chunk of body) {
    const room = maxBytes - bytes;
    if (chunk.length > room) {
      chunks.push(chunk.subarray(0, room));
      bytes += room;
      res.destroy();
      return { bytes, complete: false, text: Buffer.concat(chunks).toString('utf8') };
    }
    chunks.push(chunk);
    bytes += chunk.length;
  }
  return { bytes, complete: true, text: Buffer.concat(chunks).toString('utf8') };
}

// The promise, or the signal's reason when the signal fires first: a name lookup can't be stopped.
const within = (signal, promise) =>
  Promise.race([
    promise,
    new Promise((_, no) => {
      if (signal.aborted) no(signal.reason);
      signal.addEventListener('abort', () => no(signal.reason), { once: true });
    }),
  ]);

export async function check(opts, { lookup = dnsLookup, send: sendOne = send, own: ownList = ownNets } = {}) {
  let url;
  try {
    url = new URL(opts.url);
  } catch {
    throw new Error('that is not a URL; it needs https:// in front');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error(`only http and https links, not ${url.protocol}`);

  const notes = [];
  if (url.username || url.password) {
    url.username = '';
    url.password = '';
    notes.push('the link carried a login: checked without it, the way a stranger opens it');
  }
  notes.push(...hostNotes(url));
  // The throwaway parameter is added as text, so the rest of the query goes out exactly as written.
  let fresh = null;
  if (opts.fresh) {
    if (SIGNED_QUERY.test(url.search)) {
      notes.push('a signed link: --fresh skipped, because the signature covers the whole query');
    } else {
      fresh = `${FRESH_PARAM}=${Math.random().toString(36).slice(2, 10)}`;
      url.search = url.search ? `${url.search}&${fresh}` : `?${fresh}`;
      if (opts.gone) notes.push('--fresh with --gone skips a cached copy that strangers may still get');
    }
  }
  // A URL as it may be printed: origin and path, cut to MAX_SHOWN. A query or a fragment can hold a token,
  // also one a redirect handed over that you never had, so only their presence shows. The throwaway
  // parameter is the script's own, so it doesn't count. A path can hold shell or Markdown text, so the
  // characters that carry it print percent-encoded, as a browser can send them.
  const show = (u) => {
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return clean(u.protocol);
    const copy = new URL(u.href);
    if (fresh !== null) copy.search = copy.search.replace(new RegExp(`([?&])${fresh}(&|$)`), (_, lead, tail) => (tail ? lead : ''));
    const path = copy.pathname.replace(/[`$()[\]!]/g, (c) => `%${c.charCodeAt(0).toString(16)}`);
    return `${clean(copy.origin + path)}${copy.search.length > 1 ? '?<query hidden>' : ''}${copy.hash.length > 1 ? '#<fragment hidden>' : ''}`;
  };

  const report = {
    pass: false,
    result: '',
    url: show(url),
    status: null,
    statusText: null,
    finalUrl: null,
    redirects: [],
    contentType: null,
    size: null,
    sizeComplete: null,
    marker: opts.marker === null ? null : { text: shown(opts.marker), found: false },
    noAnswer: null,
    notes,
  };

  const fromHost = url.hostname;
  const signal = AbortSignal.timeout(opts.timeout * 1000);
  let res;
  for (;;) {
    try {
      const addresses = await within(signal, vet(url, lookup, ownList));
      res = await sendOne(url, addresses, signal);
    } catch (err) {
      report.finalUrl = show(url);
      report.noAnswer = err.refused
        ? {
            reason: report.redirects.length ? `it redirects to ${show(url)}, and ${err.message}` : err.message,
            noHost: false,
            refused: true,
            ownNet: err.ownNet,
          }
        : whyNoAnswer(err, opts.timeout);
      return judge(report, opts);
    }
    if (res.status < 300 || res.status > 399 || !res.location) break;
    res.discard();
    let next;
    try {
      next = new URL(res.location, url);
    } catch {
      report.finalUrl = show(url);
      report.noAnswer = { reason: 'it redirects to an address that is not a URL', noHost: false };
      return judge(report, opts);
    }
    if (next.username || next.password) {
      next.username = '';
      next.password = '';
      notes.push('a redirect carried a login: followed without it');
    }
    report.redirects.push({ status: res.status, from: show(url), to: show(next) });
    if (next.protocol !== 'https:' && next.protocol !== 'http:') {
      report.finalUrl = show(next);
      report.noAnswer = { reason: `it redirects to a ${clean(next.protocol)} link`, noHost: false };
      return judge(report, opts);
    }
    if (url.protocol === 'https:' && next.protocol === 'http:') notes.push('it steps down from https to plain http: browsers warn about it');
    if (report.redirects.length > MAX_REDIRECTS) {
      report.finalUrl = show(next);
      report.noAnswer = { reason: `more than ${MAX_REDIRECTS} redirects`, noHost: false };
      return judge(report, opts);
    }
    url = next;
  }

  report.status = res.status;
  report.statusText = clean(res.statusText || STATUS_CODES[res.status] || '');
  report.finalUrl = show(url);
  report.contentType = res.type === null ? null : clean(res.type);
  try {
    const body = await res.read(opts.maxBytes);
    report.size = body.bytes;
    report.sizeComplete = body.complete;
    if (report.marker) report.marker.found = body.text.includes(opts.marker);
  } catch (err) {
    report.sizeComplete = false;
    notes.push(`the body stopped before the end: ${whyNoAnswer(err, opts.timeout).reason}`);
  }
  if (url.hostname !== fromHost) notes.push(`it ended on another host, ${clean(url.hostname)}: check that this is the page you meant`);
  return judge(report, opts);
}

function judge(r, opts) {
  const done = (pass, result) => Object.assign(r, { pass, result });
  const ok = r.status !== null && r.status >= 200 && r.status < 300;
  const cut = r.sizeComplete === false;
  const markerMissing = r.marker !== null && !r.marker.found;
  const cutNote =
    r.size === null ? 'the body did not arrive whole' : `only the first ${fmt(r.size)} bytes were read; raise --max-bytes`;

  // Nothing was sent, so nothing is known about the page: never a pass, with or without --gone.
  if (r.noAnswer?.refused) {
    const reason = r.noAnswer.reason;
    if (r.noAnswer.ownNet) return done(false, `can't tell from here: ${reason}. Open it from another network, such as a phone on mobile data.`);
    if (opts.gone) return done(false, `can't tell from here: ${reason}. Open it from another network, such as a phone on mobile data.`);
    return done(false, `a stranger cannot reach this: ${reason}`);
  }

  if (opts.gone) {
    if (r.noAnswer?.noHost) return done(true, 'gone: no such host. An offline machine gets the same answer, so check that you are online.');
    if (r.noAnswer) return done(false, `can't tell yet: ${r.noAnswer.reason}. Try again in a minute.`);
    if (GONE_STATUSES.has(r.status)) return done(true, `gone: a stranger gets ${statusLine(r)}`);
    if (ok && markerMissing && cut) return done(false, `can't tell: the marker is not there, but ${cutNote}`);
    if (ok && markerMissing) return done(true, 'gone: the address answers, but the page with the marker is not there');
    if (ok && r.marker === null) return done(false, 'still up: it answers 2xx. Add --marker to tell the old page from a new one.');
    if (ok) return done(false, 'still up: the page and its marker are there. A host or CDN cache can keep serving a deleted file; purge it or wait.');
    return done(false, `can't tell: ${statusLine(r)}. Try again in a minute.`);
  }

  if (r.noAnswer) return done(false, `does not open: ${r.noAnswer.reason}`);
  if (!ok) return done(false, `does not open for a stranger: ${statusLine(r)}`);
  if (markerMissing && cut) return done(false, `opens, but the marker is not there: ${cutNote}`);
  if (markerMissing) return done(false, 'opens, but the marker is not in the body: a login page, an old copy or another file?');
  if (opts.type && !(r.contentType ?? '').toLowerCase().startsWith(opts.type.toLowerCase())) {
    return done(false, `opens, but the content type is ${r.contentType ?? 'not given'}, not ${shown(opts.type)}`);
  }
  return done(true, r.marker ? 'opens for a stranger, and the marker is there' : 'opens for a stranger');
}

function format(r) {
  const size =
    r.size === null ? '-' : r.sizeComplete ? `${fmt(r.size)} bytes` : `over ${fmt(r.size)} bytes (stopped reading there)`;
  const noStatus = `${r.noAnswer?.refused ? 'not opened' : 'no answer'}: ${r.noAnswer?.reason ?? 'unknown'}`;
  const rows = [
    ['url', r.url],
    ['status', r.status === null ? noStatus : statusLine(r)],
    ['final url', r.finalUrl ?? '-'],
    ['redirects', r.redirects.length === 0 ? 'none' : r.redirects.map((h) => `${h.status} to ${h.to}`).join('\n')],
    ['content type', r.contentType ?? '-'],
    ['size', size],
    ['marker', r.marker === null ? 'none given' : `${r.marker.found ? 'found' : 'not found'}: "${r.marker.text}"`],
    ...r.notes.map((note) => ['note', note]),
  ];
  const width = Math.max(...rows.map(([label]) => label.length)) + 2;
  const lines = rows.flatMap(([label, value]) =>
    String(value)
      .split('\n')
      .map((line, i) => `  ${(i === 0 ? label : '').padEnd(width)}${line}`),
  );
  return ['check-link: opened as a stranger, no cookies, no login', ...lines, `${r.pass ? 'PASS' : 'FAIL'}  ${r.result}`].join('\n');
}

async function selfTest() {
  // Addresses that are not public, in every spelling, and ones that are.
  for (const ip of ['168.63.129.16', '192.88.99.1', '192.0.0.192', '100.100.100.200', '2002:c058:6301::1', '3fff::1', '5f00::1', '4000::1', '1::1', '::ffff:0:7f00:1', '127.0.0.1', '10.1.2.3', '100.64.0.1', '100.127.255.255', '169.254.169.254', '172.16.0.1', '192.168.1.20', '0.0.0.0', '224.0.0.1', '::', '::1', 'fe80::1', 'febf::1', 'fc00::1', 'fd12:3456::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:8.8.8.8', '64:ff9b::a9fe:a9fe', '64:ff9b::7f00:1', '2002:a00:1::1', '2002:7f00:1::1']) {
    assert.notEqual(notPublic(ip), null, ip);
  }
  for (const ip of ['93.184.215.14', '8.8.8.8', '100.128.0.1', '2606:4700:4700::1111', '64:ff9b::808:808', '2002:808:808::1']) {
    assert.equal(notPublic(ip), null, ip);
  }
  assert.equal(notPublic('64:ff9b::a9fe:a9fe'), 'an address that carries 169.254.169.254, a link-local address');
  for (const host of ['localhost', 'api.localhost', 'printer.local', 'db.internal', 'nas.home.arpa', '127.0.0.1', '[::1]', '10.0.0.7']) assert.ok(namesLocal(host), host);
  for (const host of ['example.test', 'localhost.example.test', '8.8.8.8', '']) assert.ok(!namesLocal(host), host);
  for (const host of ['.local', '.internal', '.localhost', '.home.arpa', 'x.local..', 'x.internal..', 'localhost..', 'X.HOME.ARPA...']) assert.ok(namesLocal(host), host);

  // The note for a URL that names a local host, in every spelling a URL parser leaves.
  const noted = (url) => hostNotes(new URL(url)).join(' | ');
  for (const url of ['http://localhost:3000/', 'https://app.local/', 'http://127.0.0.1/', 'http://0.0.0.0/', 'http://[::1]/', 'http://2130706433/', 'http://0x7f.1/']) {
    assert.match(noted(url), /a local address: nobody on the internet can open it/, url);
  }
  assert.match(noted('http://192.168.1.20/'), /a private address: nobody/);
  assert.match(noted('http://100.64.0.1/'), /a shared \(carrier-grade NAT\) address: nobody/);
  assert.match(noted('http://[fc00::1]/'), /a unique local address: nobody/);
  assert.match(noted('http://[fe80::1]/'), /a link-local address: nobody/);
  assert.match(noted('http://[::ffff:127.0.0.1]/'), /an IPv4-mapped address: nobody/);
  assert.match(noted('https://8.8.8.8/'), /an IP address, not a name/);
  assert.match(noted('https://example.test:8443/'), /port 8443/);
  assert.equal(noted('https://example.test/'), '');

  // Requests, with a stand-in for DNS and for the server: nothing leaves this machine.
  const names = {
    'site.example.test': ['93.184.215.14'],
    'cdn.example.test': ['93.184.215.14'],
    'public.example.test': ['127.0.0.1'],
    'mixed.example.test': ['93.184.215.14', '10.0.0.7'],
    'cloud.example.test': ['169.254.169.254'],
    'cgnat.example.test': ['100.64.0.1'],
    'ula.example.test': ['fd00::1'],
    'mapped.example.test': ['::ffff:10.0.0.7'],
    'nat64.example.test': ['64:ff9b::7f00:1'],
    '6to4.example.test': ['2002:7f00:1::1'],
    'zero.example.test': ['0.0.0.0'],
    'self.example.test': ['2a01:4f8::7'],
    'db.internal': ['93.184.215.14'],
    localhost: ['93.184.215.14'],
  };
  const lookup = async (host) => {
    const list = isIP(host) ? [host] : names[host];
    if (!list) throw Object.assign(new Error('not found'), { code: 'ENOTFOUND' });
    return list.map((address) => ({ address, family: isIP(address) }));
  };
  const routes = {
    'https://site.example.test/start': 'http://169.254.169.254/latest/meta-data/',
    'https://site.example.test/via-name': 'http://public.example.test/admin',
    'https://site.example.test/file': 'file:///etc/passwd',
    'https://site.example.test/loop': '/loop',
    'https://site.example.test/old': '/new',
    'https://site.example.test/down': 'http://site.example.test/new',
    'https://site.example.test/login': 'https://user:hunter2@site.example.test/new',
    'https://site.example.test/bad': 'http://user:hunter2@[not-a-url',
    'https://site.example.test/mail': 'mailto:user:hunter2@example.test',
    'https://site.example.test/signed': 'https://cdn.example.test/f?X-Amz-Signature=s3cret&token=t0ken#access_token=fr4g',
    'https://site.example.test/long': `/${'a'.repeat(9000)}/x`,
  };
  const sent = [];
  const server = async (url, addresses) => {
    sent.push([url.href, addresses.map((a) => a.address)]);
    const location = routes[url.href] ?? null;
    const missing = url.pathname === '/missing';
    const text = '<p>the marker is here</p>';
    return {
      status: location ? 302 : missing ? 404 : 200,
      statusText: '',
      type: url.pathname === '/steer' ? 'text/html\u001b[2J\u009b' : 'text/html',
      location,
      discard() {},
      read: async () => ({ bytes: text.length, complete: true, text }),
    };
  };
  const opts = { marker: null, type: null, gone: false, fresh: false, timeout: 5, maxBytes: 1000 };
  const ownNet = () => [net('2a01:4f8:0:0::7', 64)];
  const run = (url, more = {}) => check({ ...opts, url, ...more }, { lookup, send: server, own: ownNet });

  // Every name and address that lands off the public internet: FAIL, no request, no marker answer.
  for (const url of ['http://db.internal/', 'http://localhost/', 'http://[::ffff:0:7f00:1]/', 'http://[3fff::1]/', 'http://[5f00::1]/', 'http://168.63.129.16/machine', 'http://127.0.0.1/', 'http://0.0.0.0/', 'http://100.64.0.1/', 'http://[fc00::1]/', 'http://[fe80::1]/', 'http://[::ffff:127.0.0.1]/', 'http://[64:ff9b::7f00:1]/', 'http://[2002:7f00:1::1]/', 'http://public.example.test/', 'http://mixed.example.test/', 'http://cloud.example.test/', 'http://cgnat.example.test/', 'http://ula.example.test/', 'http://mapped.example.test/', 'http://nat64.example.test/', 'http://6to4.example.test/', 'http://zero.example.test/']) {
    const r = await run(url, { marker: 'marker' });
    assert.equal(r.pass, false, url);
    assert.match(r.result, /^a stranger cannot reach this: /, url);
    assert.equal(r.marker.found, false, url);
    assert.equal(r.status, null, url);
    const gone = await run(url, { gone: true });
    assert.equal(gone.pass, false, url);
    assert.match(gone.result, /^can't tell from here: /, url);
  }
  assert.deepEqual(sent, []);
  assert.equal((await run('http://public.example.test/')).result, 'a stranger cannot reach this: public.example.test resolves to 127.0.0.1, a loopback address');
  assert.match(format(await run('http://127.0.0.1/')), /not opened: 127\.0\.0\.1 is a loopback address/);

  // This machine's own network, even at a public address: FAIL, this machine can't stand in for a stranger.
  for (const url of ['http://self.example.test/', 'http://[2a01:4f8::7]:11434/', 'http://[2a01:4f8::1]/']) {
    const r = await run(url);
    assert.equal(r.pass, false, url);
    assert.match(r.result, /^can't tell from here: .*own network\. Open it from another network/, url);
  }
  assert.deepEqual(sent, []);
  assert.equal(onOwnNet('2a01:4f8:0:1::1', ownNet()), false);
  assert.equal(net('10.0.0.5', 24).prefix, 24);
  // A catch-all route adds no network, and the machine's own address on it still counts.
  const wide = netsOf({ vpn: [['8.2.3.1', 1], ['2a01:4f8::7', 16]].map(([address, bits]) => ({ address, cidr: `${address}/${bits}` })) });
  for (const ip of ['8.2.3.1', '2a01:4f8::7']) assert.ok(onOwnNet(ip, wide), ip);
  for (const ip of ['8.2.3.2', '2a01:4f8::8', '93.184.215.14']) assert.ok(!onOwnNet(ip, wide), ip);

  // An address on this machine's own network, also when an IPv6 form carries it.
  const ownV4 = () => [net('8.2.3.1', 24)];
  for (const url of ['http://8.2.3.1/', 'http://[64:ff9b::802:301]/', 'http://[2002:802:301::1]/']) {
    const seen = await check({ ...opts, url }, { lookup, send: server, own: ownV4 });
    assert.match(seen.result, /^can't tell from here: /, url);
  }
  assert.deepEqual(sent, []);

  // A redirect: each hop is checked before it is sent.
  let r = await run('https://site.example.test/start', { marker: 'marker' });
  assert.equal(r.pass, false);
  assert.equal(r.result, 'a stranger cannot reach this: it redirects to http://169.254.169.254/latest/meta-data/, and 169.254.169.254 is a link-local address');
  assert.equal(r.finalUrl, 'http://169.254.169.254/latest/meta-data/');
  assert.equal(r.marker.found, false);
  r = await run('https://site.example.test/via-name');
  assert.match(r.result, /public\.example\.test resolves to 127\.0\.0\.1/);
  assert.equal((await run('https://site.example.test/start', { gone: true })).pass, false);
  r = await run('https://site.example.test/file');
  assert.equal(r.result, 'does not open: it redirects to a file: link');
  assert.deepEqual(sent, [
    ['https://site.example.test/start', ['93.184.215.14']],
    ['https://site.example.test/via-name', ['93.184.215.14']],
    ['https://site.example.test/start', ['93.184.215.14']],
    ['https://site.example.test/file', ['93.184.215.14']],
  ]);
  assert.equal((await run('https://site.example.test/loop')).result, 'does not open: more than 5 redirects');
  assert.match((await run('https://site.example.test/bad')).result, /not a URL/);
  r = await run('https://site.example.test/old', { marker: 'marker' });
  assert.deepEqual([r.pass, r.finalUrl, r.redirects.length], [true, 'https://site.example.test/new', 1]);

  // A token in a query or a fragment is never printed, the path is cut, and shell and Markdown text in it
  // doesn't reach the terminal or the agent as it is.
  r = await run('https://site.example.test/given?token=mine#hash');
  assert.deepEqual([r.url, r.finalUrl], Array(2).fill('https://site.example.test/given?<query hidden>#<fragment hidden>'));
  r = await run('https://site.example.test/signed');
  assert.equal(r.finalUrl, 'https://cdn.example.test/f?<query hidden>#<fragment hidden>');
  assert.equal(r.redirects[0].to, r.finalUrl);
  assert.doesNotMatch(format(r) + JSON.stringify(r), /s3cret|t0ken|fr4g/);
  r = await run('https://site.example.test/long');
  assert.ok(r.finalUrl.length <= MAX_SHOWN);
  r = await run('https://site.example.test/![x](y)/$(id)');
  assert.equal(r.finalUrl, 'https://site.example.test/%21%5bx%5d%28y%29/%24%28id%29');
  for (const url of ['https://site.example.test/bad', 'https://site.example.test/mail']) {
    r = await run(url);
    assert.ok(!r.pass && !format(r).includes('hunter2') && !JSON.stringify(r).includes('hunter2'), url);
  }
  assert.equal(r.result, 'does not open: it redirects to a mailto: link');

  // A login is never sent or printed; a step down from https is said.
  r = await run('https://user:hunter2@site.example.test/ok');
  assert.ok(r.pass && !JSON.stringify(r).includes('hunter2'));
  r = await run('https://site.example.test/login');
  assert.ok(r.pass && !JSON.stringify(r).includes('hunter2') && !format(r).includes('hunter2'));
  assert.ok(r.notes.includes('a redirect carried a login: followed without it'));
  r = await run('https://site.example.test/down');
  assert.ok(r.notes.some((n) => n.startsWith('it steps down from https')));

  // A public page, and the old verdicts.
  assert.equal((await run('https://site.example.test/ok')).result, 'opens for a stranger');
  assert.equal((await run('https://site.example.test/ok', { marker: 'marker' })).result, 'opens for a stranger, and the marker is there');
  assert.match((await run('https://site.example.test/ok', { marker: 'nope' })).result, /marker is not in the body/);
  assert.match((await run('https://site.example.test/ok', { type: 'application/json' })).result, /content type is text\/html/);
  assert.equal((await run('https://site.example.test/missing')).pass, false);
  assert.equal((await run('https://site.example.test/missing', { gone: true })).pass, true);
  assert.equal((await run('https://no-such.example.test/', { gone: true })).pass, true);
  assert.equal((await run('https://no-such.example.test/')).result, 'does not open: no such host');
  assert.equal((await run('https://site.example.test/ok', { gone: true })).pass, false);
  r = await run('https://site.example.test/ok', { fresh: true });
  assert.equal(r.finalUrl, 'https://site.example.test/ok');
  assert.ok(sent.at(-1)[0].includes('_cl='));

  // What a server sends is printed so that it can't reach the terminal.
  r = await run('https://site.example.test/steer');
  assert.equal(r.contentType, 'text/html\\u{1b}[2J\\u{9b}');
  assert.doesNotMatch(format(r), /[\u0000-\u0009\u000b-\u001f\u0080-\u009f]/);
  assert.equal(clean('x'.repeat(MAX_SHOWN + 10)).length, MAX_SHOWN);
  // A redirect can hand over a name of many kilobytes: the verdict stays short.
  r = await run(`http://${'a'.repeat(5000)}.local/`);
  assert.match(r.result, /^a stranger cannot reach this: a+ is a local name$/);
  assert.ok(r.result.length < MAX_SHOWN + 100);
  r = await run('https://site.example.test/ok', { marker: 'a\u001bb', type: 'x\u001by' });
  assert.equal(r.marker.text, 'a\\u{1b}b');
  assert.doesNotMatch(format(r) + r.result, /\u001b/);
  assert.equal(shown('a\u2028b\u200bc\u{e0072}'), 'a\\u{2028}b\\u{200b}c\\u{e0072}');
  // Every other invisible character: variation selectors, default-ignorables, format, private-use and blank ones.
  for (const c of ['\ufe00', '\ufe0f', '\u{e0100}', '\u2065', '\u206a', '\u180e', '\ufff9', '\u034f', '\u3164', '\u115f', '\u17b4', '\u{1d173}', '\u2800', '\ue000', '\u{f0000}']) {
    assert.match(shown(c), /^\\u\{/, c);
  }
  assert.equal(shown('plain, \u00fcn\u00ef \u65e5\u672c\u8a9e \ud83d\ude42'), 'plain, \u00fcn\u00ef \u65e5\u672c\u8a9e \ud83d\ude42');

  // The connection is handed the checked addresses only, whatever DNS says by then.
  const pin = pinned([{ address: '93.184.215.14', family: 4 }, { address: '2606:2800::1', family: 6 }]);
  pin('x.example.test', { all: true }, (e, list) => assert.deepEqual(list.map((a) => a.address), ['93.184.215.14', '2606:2800::1']));
  pin('x.example.test', { family: 6 }, (e, address, family) => assert.deepEqual([address, family], ['2606:2800::1', 6]));
  pin('x.example.test', {}, (e, address, family) => assert.deepEqual([address, family], ['93.184.215.14', 4]));

  console.log('self-test ok');
  return 0;
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`check-link: ${err.message}\n\n${USAGE}`);
    return 2;
  }
  if (opts.help) {
    console.log(USAGE);
    return 0;
  }
  if (opts.selfTest) return selfTest();
  let report;
  try {
    report = await check(opts);
  } catch (err) {
    console.error(`check-link: ${err.message}`);
    return 2;
  }
  console.log(opts.json ? JSON.stringify(report, null, 2) : format(report));
  return report.pass ? 0 : 1;
}

// Run as a command, through a link or a junction too; imported, it only exports (the pack's spec).
const ran = () => {
  const real = (path) => {
    const p = realpathSync(path);
    return process.platform === 'win32' ? p.toLowerCase() : p;
  };
  if (!process.argv[1]) return false;
  try {
    return real(process.argv[1]) === real(fileURLToPath(import.meta.url));
  } catch {
    return true;
  }
};

if (ran()) {
  // Whatever ends the run early, it is never a pass.
  process.exitCode = 1;
  main().then((code) => {
    process.exitCode = code;
  });
}

export { send };
