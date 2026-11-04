#!/usr/bin/env node
// keep-check.mjs: part of the keep skill. Plain Node 18 or newer, no packages.
//
//   node keep-check.mjs can-run <command> [<command> ...]
//       prints the Can run block: for each command name, whether this machine has it on PATH
//   node keep-check.mjs can-run --write KEEP.md <command> [<command> ...]
//       prints the block and puts it in KEEP.md, between the keep:can-run markers
//   node keep-check.mjs findings [KEEP.md]
//       prints every line under Findings that breaks the line's shape, and any line in the file that
//       hides text or looks like a key, each with its line number
//   node keep-check.mjs --self-test
//
// It only looks names up and reads KEEP.md. It runs none of the commands, installs nothing and
// sends nothing anywhere: a PATH folder named by a share path is skipped. It opens KEEP.md only inside
// the folder it runs in, never through a link. --write changes only the Can run section, and swaps the
// whole file in one step, so a stopped run leaves KEEP.md as it was. The block carries no date or time.
// A line it prints from KEEP.md is data: it stands in double quotes, on one line, with hidden characters
// shown as text and anything that looks like a key masked.
//
// Exit status: 0 = every command found, or every line holds · 1 = a command not found, or a line
// breaks the shape · 2 = usage error, or it could not finish.

import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  accessSync,
  closeSync,
  constants,
  fstatSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, delimiter, dirname, isAbsolute, join, relative, sep } from 'node:path';

const START = '<!-- keep:can-run:start -->';
const END = '<!-- keep:can-run:end -->';
const USAGE =
  'usage: node keep-check.mjs can-run [--write KEEP.md] <command> [<command> ...] | findings [KEEP.md] | --self-test';
const PLAIN_NAME = /^[A-Za-z0-9_+][A-Za-z0-9._+-]*$/;
const WINDOWS = process.platform === 'win32';
const MAX_BYTES = 16 * 1024 * 1024; // KEEP.md is read in one go
const MAX_NAMES = 100;
const MAX_NAME = 100;
const MAX_LINE = 4000; // a longer line under Findings is not one fact
const MAX_PRINTED = 50; // lines printed by findings
const MAX_SHOWN = 300; // characters printed of each

// Characters that can steer what a terminal or an agent sees: control characters, line and paragraph
// separators, bidirectional and zero-width marks, tag characters, variation selectors, private-use and
// unassigned code points, and the blank braille cell. A printed line shows each one as \u{…} instead.
const STEERING = /[\p{Cc}\p{Cf}\p{Co}\p{Cn}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}\u2800]/u;
const ALL_STEERING = new RegExp(STEERING, 'gu');
const shown = (text) => String(text).replace(ALL_STEERING, (c) => `\\u{${c.codePointAt(0).toString(16)}}`);

// What looks like a key: a known prefix, a private key block, a sign-in header, an address with a
// password, or a secret's name with a value. Case counts, so `primary_key: id` and `monkey: 3` stay out.
// Each repeat stops at a word's end or has a bound, so a long line cannot stall it.
const VALUE = String.raw`["']?\s*[=:]\s*["']?(?!<secret removed>)[^\s"']{4,}`;
const SECRET = new RegExp(
  [
    String.raw`\bsk-[A-Za-z0-9_-]{20,}`,
    String.raw`\b[sprk]k_(?:live|test)_[A-Za-z0-9]{8,}`,
    String.raw`\bgh[pousr]_[A-Za-z0-9]{20,}`,
    String.raw`\bgithub_pat_\w{20,}`,
    String.raw`\bAKIA[0-9A-Z]{12,}`,
    String.raw`\bxox[abprs]-[A-Za-z0-9-]{10,}`,
    String.raw`\beyJ\w{10,}\.\w{10,}\.`,
    String.raw`-----BEGIN [A-Z -]{0,40}PRIVATE KEY-----`,
    String.raw`\b(?:Bearer|Basic) +[\w.~+/=-]{16,}`,
    String.raw`\b[a-z][a-z0-9+.-]{0,30}://[^\s/:@]{1,200}:[^\s/@]{1,200}@`,
    String.raw`\b[A-Z0-9_]*(?:_KEY|API_?KEY|SECRET|TOKEN|PASSWORD|PASSWD|PWD)${VALUE}`,
    String.raw`\b(?:password|passwd|api_?key|client_secret|access_token|auth_token)${VALUE}`,
  ].join('|'),
);
const looksLikeKey = (line) => SECRET.test(line.replace(ALL_STEERING, ''));
// From the first key shape on, nothing of the line is printed: what follows it may be the rest of the key.
const masked = (text) => {
  const at = text.search(SECRET);
  if (at !== -1) return `${text.slice(0, at)}[hidden]`;
  return looksLikeKey(text) ? '[hidden]' : text;
};
// A line from KEEP.md as it is printed: short, masked, with no closing quote of its own.
const quoted = (text) => {
  const clean = masked(text.slice(0, MAX_LINE));
  const cut = clean.length > MAX_SHOWN || text.length > MAX_LINE ? '…' : '';
  return `"${shown(clean.slice(0, MAX_SHOWN)).replace(/["\u201c\u201d\u201e\u201f]/g, "'")}${cut}"`;
};

class UsageError extends Error {}
const fail = (message) => {
  throw new UsageError(message);
};

// --- can-run ---

const PATH_EXTS = WINDOWS
  ? (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD')
      .split(';')
      .filter(Boolean)
      .map((ext) => ext.toLowerCase())
  : [];

// On Windows a command is a file with one of the PATHEXT endings; elsewhere, a file you may run.
const candidates = (name) => {
  if (!WINDOWS) return [name];
  const dot = name.lastIndexOf('.');
  const own = dot > 0 && PATH_EXTS.includes(name.slice(dot).toLowerCase()) ? [name] : [];
  return [...own, ...PATH_EXTS.map((ext) => name + ext)];
};

const runnable = (file) => {
  try {
    if (!statSync(file).isFile()) return false;
    if (!WINDOWS) accessSync(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

// The PATH folders it looks in: only a full path. A share path is skipped, because looking would open a
// sign-in to it. So is a relative folder, or on Windows one with no drive: each means a different place
// depending on where you stand. A mapped drive or a link to a share cannot be told from a local folder.
const pathFolders = () => {
  const entries = (process.env.PATH || '').split(delimiter).map((entry) => entry.replace(/^"(.*)"$/, '$1'));
  const full = (dir) => (WINDOWS ? /^[A-Za-z]:[\\/]/.test(dir) : isAbsolute(dir));
  const folders = entries.filter(full);
  return { folders, skipped: entries.some((dir) => dir && !full(dir)) };
};

const lookUp = (name, folders) => {
  for (const dir of folders) {
    for (const candidate of candidates(name)) {
      const file = join(dir, candidate);
      if (runnable(file)) return file;
    }
  }
  return null;
};

// A path under the home folder shows as ~/..., so the block does not carry the user name. A home folder
// that reads another way (a short name, another user's) still loses the name.
const HOME = (() => {
  try {
    return homedir();
  } catch {
    return '';
  }
})();
const fold = (path) => (WINDOWS ? path.toLowerCase() : path); // Windows paths ignore case
const short = (file) => {
  const tilde = HOME && fold(file).startsWith(fold(HOME + sep)) ? `~${file.slice(HOME.length)}` : file;
  return tilde.replace(/([\\/](?:Users|home)[\\/])[^\\/]+/i, '$1<user>');
};

// cmd.exe runs a file in the folder it stands in before anything on PATH.
const shadow = (name) => (WINDOWS ? candidates(name).find(runnable) : undefined);

const canRunBlock = (names) => {
  let missing = false;
  const { folders, skipped } = pathFolders();
  const lines = ['```', `checked by keep-check.mjs on ${process.platform} ${process.arch}`];
  if (skipped) lines.push('skipped: a share or a relative folder on PATH (not looked at)');
  for (const name of names) {
    if (name.length > MAX_NAME || !PLAIN_NAME.test(name)) {
      lines.push(`skipped: ${name.slice(0, 40).replace(/[^A-Za-z0-9._+-]/g, '?')} (not a plain command name)`);
      missing = true;
      continue;
    }
    const file = lookUp(name, folders);
    if (file) {
      const here = shadow(name);
      lines.push(`found: ${name} at ${shown(short(file))}${here ? ` (this folder holds ${here} too: cmd.exe runs that one)` : ''}`);
    } else {
      lines.push(`not found: ${name}`);
      missing = true;
    }
  }
  lines.push('```');
  return { block: lines.join('\n'), missing };
};

// --- fences ---

// A fence mark on this line, or null. A backtick mark with a backtick after it is inline code.
const fenceMark = (line) => {
  const found = /^ {0,3}(`{3,}|~{3,})/.exec(line);
  if (!found) return null;
  const rest = line.slice(found[0].length);
  return found[1][0] === '`' && rest.includes('`') ? null : { mark: found[1], rest };
};
// A fence closes only on the same mark, at least as long, with nothing after it.
const closes = (found, mark) => found && found.mark[0] === mark[0] && found.mark.length >= mark.length && !found.rest.trim();

// --- KEEP.md ---

// KEEP.md is opened only inside the folder this runs in: no absolute path, no "..", no link anywhere on
// the way, no hard link to a file elsewhere. A share path is refused by its name, before anything looks
// at it, because looking at it would open a sign-in to the share. On Windows the name holds no ":": a
// drive letter with no slash can be a mapped share, and after a file name it opens a hidden data stream.
const checkTarget = (target) => {
  const outside = `${quoted(target)} is not a file inside this folder. Run this from the folder that holds KEEP.md.`;
  const parts = target.split(/[\\/]/).filter((part) => part && part !== '.');
  const refused = target.startsWith('-') || isAbsolute(target) || parts.includes('..');
  if (refused || parts.length === 0 || (WINDOWS && target.includes(':'))) fail(outside);
  let path = '';
  let stat;
  for (const part of parts) {
    path = join(path, part);
    try {
      stat = lstatSync(path, { bigint: true });
    } catch {
      fail(`${quoted(target)} not found. Copy the KEEP.md template here first.`);
    }
    if (stat.isSymbolicLink()) fail(`${quoted(path)} is a link. Point at the file itself.`);
  }
  if (!stat.isFile()) fail(`${quoted(target)} is not a file.`);
  if (stat.nlink > 1n) fail(`${quoted(target)} is a hard link. Point at the file itself.`);
  const rel = relative(realpathSync(process.cwd()), realpathSync(target));
  if (!rel || isAbsolute(rel) || rel.split(sep)[0] === '..') fail(outside);
  return stat;
};

// Reads the file checkTarget saw, and only that file: not a link swapped in since. Text that is not clean
// UTF-8 is refused: a lossy read would turn those bytes into U+FFFD, and --write would keep that for good.
const readChecked = (target) => {
  const seen = checkTarget(target);
  let fd;
  try {
    fd = openSync(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch {
    fail(`could not open ${quoted(target)}`);
  }
  try {
    const now = fstatSync(fd, { bigint: true });
    if (!now.isFile() || now.ino !== seen.ino || now.dev !== seen.dev || now.nlink !== 1n) {
      fail(`${quoted(target)} changed. Run this again.`);
    }
    if (now.size > BigInt(MAX_BYTES)) fail(`${quoted(target)} is too large: over 16 MB.`);
    const bytes = readFileSync(fd);
    let text = '\0';
    try {
      text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    } catch {
      // stays '\0': refused below
    }
    if (text.includes('\0')) fail(`${quoted(target)} is not UTF-8 text. Save it as UTF-8.`);
    return { bytes, text, mode: Number(now.mode) & 0o777 };
  } finally {
    closeSync(fd);
  }
};

// A UTF-8 byte order mark goes here: PowerShell's Out-File writes one.
const readKeep = (target) => readChecked(target).text.replace(/^\uFEFF/, '');

// Where the block goes: the one pair of marker lines in the one Can run section, which ends at the next
// heading. A marker quoted anywhere else, or in a fence, moves nothing. null = not exactly one of each.
const blockSpan = (text) => {
  const starts = [];
  const ends = [];
  let offset = 0;
  let sections = 0;
  let inSection = false;
  let fence = null;
  for (const raw of text.split('\n')) {
    const line = (raw.endsWith('\r') ? raw.slice(0, -1) : raw).replace(/^\uFEFF/, '');
    const found = fenceMark(line);
    if (fence) {
      if (closes(found, fence)) fence = null;
    } else if (found) {
      fence = found.mark;
    } else if (/^#{1,6} /.test(line)) {
      inSection = line.trimEnd() === '## Can run';
      if (inSection) sections += 1;
    } else if (inSection && line === START) {
      starts.push(offset + raw.indexOf(START) + START.length);
    } else if (inSection && line === END) {
      ends.push(offset + raw.indexOf(END));
    }
    offset += raw.length + 1;
  }
  if (sections !== 1 || starts.length !== 1 || ends.length !== 1 || ends[0] < starts[0]) return null;
  return [starts[0], ends[0]];
};

// The file's own name, whatever case was typed: a rename would take the typed one.
const ownName = (target) => {
  const dir = dirname(target);
  const base = basename(target);
  const names = readdirSync(dir);
  const name = names.includes(base) ? base : (names.find((n) => n.toLowerCase() === base.toLowerCase()) ?? base);
  return join(dir, name);
};

const BUSY = new Set(['EPERM', 'EBUSY', 'EACCES']); // Windows, while a virus scanner or an editor holds the file
const replace = (temp, target) => {
  for (let tries = 1; ; tries += 1) {
    try {
      return renameSync(temp, target);
    } catch (err) {
      if (!BUSY.has(err.code) || tries === 5) throw err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
};

// The new text goes to a new file beside KEEP.md, and that file replaces KEEP.md in one step, so a stopped
// run leaves KEEP.md whole. If KEEP.md changed in the meantime, the run stops and changes nothing. A write
// in the last instant before the swap can still be lost: only a lock that every writer honoured would stop
// that, and a harness's own edit tool honours none. A killed run can leave its .tmp file beside KEEP.md.
const writeBlock = (target, block) => {
  const { bytes, text, mode } = readChecked(target);
  const span = blockSpan(text);
  if (!span) fail(`${quoted(target)} needs one pair of keep:can-run markers under one "## Can run". Copy that section from the template.`);
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const next = text.slice(0, span[0]) + eol + block.split('\n').join(eol) + eol + text.slice(span[1]);
  const temp = `${target}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    writeFileSync(temp, next, { flag: 'wx', mode, flush: true });
    if (!readChecked(target).bytes.equals(bytes)) fail(`${quoted(target)} changed while this ran. Run it again.`);
    replace(temp, ownName(target));
  } catch (err) {
    if (err instanceof UsageError) throw err;
    fail(`could not write ${quoted(target)}${BUSY.has(err.code) ? ': another program may hold it open, or this folder may not take new files. Close it and run again.' : ''}`);
  } finally {
    rmSync(temp, { force: true });
  }
};

// --- findings ---

// - <finding> · source: <file>:<where> · how: ran | read | told   (or source: human · how: told)
// Read by hand, not by a pattern: a long line of colons stalls one.
const SOURCE = ' · source: ';
const HOW = ' · how: ';
const holdsShape = (line) => {
  const text = line.trimEnd();
  const at = text.lastIndexOf(HOW);
  const from = at === -1 ? -1 : text.lastIndexOf(SOURCE, at);
  if (!text.startsWith('- ') || from < 2) return false;
  const finding = text.slice(2, from);
  const source = text.slice(from + SOURCE.length, at);
  const how = text.slice(at + HOW.length);
  if (!/^\S/.test(finding) || finding.includes(SOURCE) || finding.includes(HOW)) return false;
  if (!['ran', 'read', 'told'].includes(how) || source.includes('·')) return false;
  if (source === 'human' || how === 'told') return source === 'human' && how === 'told';
  // The where stands after the last colon. A lone letter before a path is a drive, so no where is left.
  const colon = source.lastIndexOf(':');
  const file = source.slice(0, Math.max(colon, 0)).trim();
  const where = source.slice(colon + 1).trim();
  return colon > 0 && file.length > 0 && where.length > 0 && !(/^[A-Za-z]$/.test(file) && /^[\\/]/.test(where));
};

// Ordinary tool output holds these, and they hide no text: a tab, a carriage return, colour codes, and the
// marks that emoji and some scripts need. Under Findings a line holds none of them.
const HARMLESS = /[\t\r\u00ad\u200c\u200d\ufe0f]|\u001b\[[0-9;]*m/gu;
const hidesText = (line) => STEERING.test(line.replace(HARMLESS, ''));

// A heading that reads like Findings and is not: what stands under it would go unchecked.
const lookAlike = (line) => {
  if (line.trimEnd() === '## Findings') return false;
  const bare = line.replace(/[\s#*:_=]/g, '').toLowerCase();
  return bare === 'findings' || (/^\s*#{1,6}/.test(line) && bare.includes('findings'));
};

// The whole file: no line anywhere hides text or looks like a key, and every fence closes. Every non-blank
// line under "## Findings", up to the next "## " heading, must have the line's shape and no hidden
// characters. Each broken line comes with its line number. null = the file has no Findings heading.
const brokenLines = (text) => {
  const broken = [];
  const lines = text.split(/\r?\n/);
  let sawFindings = false;
  let inFindings = false;
  let fence = null; // the mark that opened the block we are in, with the line it opened on
  for (const [i, line] of lines.entries()) {
    const at = i + 1;
    if (looksLikeKey(line)) broken.push({ at, line, why: 'looks like a key' });
    else if (hidesText(line)) broken.push({ at, line, why: 'hidden characters' });
    const flagged = broken.at(-1)?.at === at;
    // Fenced blocks (under Receipts) may hold anything else, headings too.
    const found = fenceMark(line);
    if (fence) {
      if (closes(found, fence.mark)) fence = null;
      continue;
    }
    if (!inFindings && found) {
      fence = { mark: found.mark, at };
      continue;
    }
    if (lookAlike(line)) {
      inFindings = false;
      broken.push({ at, line, why: 'not the Findings heading' });
      continue;
    }
    if (line.startsWith('## ')) {
      inFindings = line.trimEnd() === '## Findings';
      if (inFindings && sawFindings) broken.push({ at, line, why: 'second Findings heading' });
      if (inFindings) sawFindings = true;
      continue;
    }
    if (!inFindings || line.trim() === '' || flagged) continue;
    if (line.length > MAX_LINE || !holdsShape(line)) broken.push({ at, line, why: '' });
    else if (STEERING.test(line)) broken.push({ at, line, why: 'hidden characters' });
  }
  if (fence) broken.push({ at: fence.at, line: lines[fence.at - 1], why: 'fence not closed' });
  return sawFindings ? broken : null;
};

// --- self-test ---

// No network: the share paths below are refused by name, before anything looks at them.
const selfTest = () => {
  const shape = (findings) => brokenLines(`## Findings\n${findings}\n## Receipts\n`);
  assert.deepEqual(shape('- the job runs at 02:00 · source: config/app.toml:12 · how: read'), []);
  assert.deepEqual(shape('- the build needs Node 20 · source: package.json:14 · how: ran  '), []);
  assert.deepEqual(shape('- from a call · source: call.m4a:95s · how: read'), []);
  assert.deepEqual(shape('- on Windows · source: C:\\x\\app.toml:12 · how: read'), []);
  assert.deepEqual(shape('- kept · source: human · how: told'), []);
  assert.equal(brokenLines('# no heading'), null);
  assert.deepEqual(shape('- no source'), [{ at: 2, line: '- no source', why: '' }]);
  for (const line of [
    '- a · source: human · how: ran',
    '- a · source: a.log:1 · how: told',
    '- a · source: b:1 · source: c:1 · how: read',
    '- a · how: ran · source: b:1 · how: read',
    '- a · source: nocolon · how: read',
    '- a · source: :1 · how: read',
    '- a · source: ::: · how: read',
    '- a · source: C:\\x\\app.toml · how: read',
    '-  a · source: b:1 · how: read',
    '- a · source: b:1 · how: guessed',
    `- ${'x'.repeat(MAX_LINE)} · source: a:1 · how: read`,
  ]) {
    assert.equal(shape(line).length, 1, line);
  }
  assert.equal(shape('- a\u200b · source: a:1 · how: read')[0].why, 'hidden characters');
  assert.equal(shape('- a\u200d · source: a:1 · how: read')[0].why, 'hidden characters');

  const receipt = (body) => brokenLines(`## Findings\n## Receipts\n\`\`\`\n${body}\n\`\`\`\n`);
  for (const body of ['a\tb', '50%\r100%', '\u001b[32mok\u001b[0m', 'warn\ufe0f', 'a\u200db', 'key: value', 'primary_key: id', 'MAX_TOKENS=4096']) {
    assert.deepEqual(receipt(body), [], body);
  }
  assert.equal(receipt('ok\u{e0041}')[0].why, 'hidden characters');
  assert.equal(receipt('\u001b[2J')[0].why, 'hidden characters');
  assert.equal(receipt('x\u202ey')[0].why, 'hidden characters');

  assert.deepEqual(brokenLines('## Receipts\n```\n## Findings\n- no\n```\n## Findings\n'), []);
  assert.deepEqual(brokenLines('## Receipts\n````\n```\n## Findings\n```\n````\n## Findings\n'), []);
  assert.deepEqual(brokenLines('## Receipts\n```npm test``` ran\n## Findings\n'), []);
  assert.equal(brokenLines('## Findings\n## Receipts\n```\nopen\n')[0].why, 'fence not closed');
  assert.equal(brokenLines('## Findings\n## Findings\n')[0].why, 'second Findings heading');
  for (const heading of ['###  findings', ' ## Findings', '## Findings ##', '## Findings:', '**Findings**', '## More findings']) {
    assert.equal(brokenLines(`## Findings\n${heading}\n`)[0].why, 'not the Findings heading', heading);
  }

  const key = `gh${'p_'}${'a'.repeat(30)}`;
  assert.equal(receipt(key)[0].why, 'looks like a key');
  assert.equal(receipt(`{"password":"hunter2"}`)[0].why, 'looks like a key');
  assert.equal(receipt('postgres://admin:hunter2@db/app')[0].why, 'looks like a key');
  assert.deepEqual(shape(`- it needs API_TOKEN=<secret removed> · source: a:1 · how: read`), []);
  assert.deepEqual(shape(`- it needs API_KEY="<secret removed>" · source: a:1 · how: read`), []);
  assert.equal(quoted(key), '"[hidden]"');
  assert.equal(quoted('password: correct horse'), '"[hidden]"');
  assert.equal(quoted(`gh\u200b${key.slice(2)}`), '"[hidden]"');

  assert.equal(quoted('a\u001b[2J\u202eb\u2028"c"\u201d'), `"a\\u{1b}[2J\\u{202e}b\\u{2028}'c''"`);
  for (const c of [0x07, 0x200b, 0x2029, 0x2800, 0xe000, 0xfe0f, 0xe0041]) {
    assert.ok(quoted(`a${String.fromCodePoint(c)}b`).includes(`\\u{${c.toString(16)}}`));
  }
  assert.ok(quoted('x'.repeat(5000)).length <= MAX_SHOWN + 3);

  // Each of these stalled a pattern once: they must stay quick.
  const started = Date.now();
  for (const line of ['`'.repeat(1 << 20), `${'`'.repeat(1 << 20)}\u2028`, `- a · source: ${':'.repeat(1 << 20)} · how: x`, 'eyJ-'.repeat(1 << 18), ' '.repeat(1 << 20)]) {
    brokenLines(`## Findings\n## Receipts\n${line}\n`);
    blockSpan(`## Can run\n${line}\n`);
  }
  assert.ok(Date.now() - started < 5000);

  assert.match(canRunBlock(['a;b', 'x'.repeat(MAX_NAME + 1)]).block, /skipped: a\?b .*\n.*skipped: x+ /);
  assert.equal(canRunBlock(['a/b']).missing, true);
  assert.match(short(`${sep}Users${sep}someone-else${sep}bin${sep}x`), /<user>/);
  assert.match(short(`${sep}home${sep}someone-else${sep}bin${sep}x`), /<user>/);

  assert.ok(blockSpan(`note ${START} ${END}\n## Can run\n${START}\nold\n${END}\n`));
  assert.ok(blockSpan(`\`\`\`\`\n## Can run\n${START}\n${END}\n\`\`\`\`\n## Can run\n${START}\n${END}\n`));
  assert.equal(blockSpan(`## Can run\n${START}\n## Findings\n${END}\n`), null);
  assert.equal(blockSpan(`## Can run\n${START}\n# Other\n${END}\n`), null);
  assert.equal(blockSpan(`## Can run\n${START}\n${START}\n${END}\n`), null);
  assert.equal(blockSpan(`## Can run\n${END}\n${START}\n`), null);
  assert.equal(blockSpan(`## Can run\nx\u2028${START}\n${END}\n`), null);
  assert.equal(blockSpan(`## Can run\n${START}\n${END}\n## Can run\n`), null);
  assert.equal(blockSpan(`${START}\n${END}\n`), null);

  const back = process.cwd();
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'keep-self-test-')));
  const other = realpathSync(mkdtempSync(join(tmpdir(), 'keep-self-test-')));
  const refused = (target, words) =>
    assert.throws(
      () => checkTarget(target),
      (e) => e instanceof UsageError && words.test(e.message),
    );
  try {
    process.chdir(dir);
    const template = `## Can run\n${START}\nold\n${END}\n## Findings\n`;
    writeFileSync('KEEP.md', template);
    writeFileSync(join(other, 'KEEP.md'), template);
    mkdirSync('real');
    writeFileSync('real/KEEP.md', template);
    symlinkSync(other, 'door', 'junction');
    symlinkSync(join(dir, 'real'), 'inner', 'junction');
    linkSync(join(other, 'KEEP.md'), 'hard.md');

    assert.equal(checkTarget('KEEP.md').isFile(), true);
    assert.equal(checkTarget('./real/KEEP.md').isFile(), true);
    writeBlock('KEEP.md', 'new');
    assert.equal(readKeep('KEEP.md'), `## Can run\n${START}\nnew\n${END}\n## Findings\n`);
    assert.ok(!readdirSync('.').some((name) => name.endsWith('.tmp')));
    refused('door/KEEP.md', /is a link/);
    refused('inner/KEEP.md', /is a link/);
    refused('hard.md', /hard link/);
    refused('real', /not a file/);
    refused('nothing.md', /not found/);
    const names = ['', '.', '-x', '../KEEP.md', 'real/../../KEEP.md', join(other, 'KEEP.md'), '//server.invalid/share/KEEP.md'];
    if (WINDOWS) names.push('\\\\server.invalid\\share\\KEEP.md', '\\\\?\\C:\\KEEP.md', 'Z:KEEP.md', 'KEEP.md:hidden');
    for (const name of names) refused(name, /inside this folder/);
    assert.equal(readFileSync(join(other, 'KEEP.md'), 'utf8'), template);

    writeFileSync('ansi.md', Buffer.concat([Buffer.from(template), Buffer.from([0xb3, 0x0a])]));
    assert.throws(() => writeBlock('ansi.md', 'new'), /not UTF-8/);
    assert.throws(() => readKeep('ansi.md'), /not UTF-8/);
    writeFileSync('wide.md', Buffer.from(`\uFEFF${template}`, 'utf16le'));
    assert.throws(() => readKeep('wide.md'), /not UTF-8/);
    writeFileSync('mark.md', `\uFEFF${template}`);
    writeBlock('mark.md', 'new');
    assert.equal(readFileSync('mark.md')[0], 0xef);
    writeFileSync('big.md', Buffer.alloc(MAX_BYTES + 1));
    assert.throws(() => readKeep('big.md'), /too large/);
  } finally {
    process.chdir(back);
    rmSync(dir, { recursive: true, force: true });
    rmSync(other, { recursive: true, force: true });
  }
};

// --- main ---

const main = (args) => {
  const [mode, ...rest] = args;

  if (mode === '--self-test') {
    selfTest();
    console.log('self-test ok');
    return 0;
  }

  if (mode === 'findings') {
    if (rest.length > 1) fail(USAGE);
    const target = rest[0] ?? 'KEEP.md';
    const broken = brokenLines(readKeep(target));
    if (broken === null) fail(`${quoted(target)} has no "## Findings" heading. Copy the sections from the template.`);
    for (const { at, line, why } of broken.slice(0, MAX_PRINTED)) {
      console.log(`line ${at}: ${why ? `${why}: ` : ''}${quoted(line)}`);
    }
    if (broken.length > MAX_PRINTED) console.log(`and ${broken.length - MAX_PRINTED} more lines that break the shape`);
    return broken.length > 0 ? 1 : 0;
  }

  if (mode !== 'can-run') fail(USAGE);
  let target = null;
  let names = rest;
  if (rest[0] === '--write') {
    if (rest.length < 3) fail(USAGE);
    target = rest[1];
    names = rest.slice(2);
    checkTarget(target);
  }
  if (names.length === 0 || names.length > MAX_NAMES || names.includes('--write')) fail(USAGE);
  const { block, missing } = canRunBlock(names);
  if (target) writeBlock(target, block);
  console.log(block);
  return missing ? 1 : 0;
};

try {
  process.exitCode = main(process.argv.slice(2));
} catch (err) {
  if (process.argv[2] === '--self-test') throw err;
  console.error(`keep-check: ${err instanceof UsageError ? err.message : `could not finish (${shown(err?.code ?? 'error')}).`}`);
  process.exitCode = 2;
}
