// Uploaded files: stored in 1 MiB chunks in SQLite, served publicly at /files/<id>/<name>.
import type { Store } from './worker';
import { hashHex, randomId } from './util';

const CHUNK = 1 << 20;
export const MAX_FILE = 25 * 1024 * 1024;

// Types a browser could run as active content are served sandboxed and as downloads.
const ACTIVE = /^(text\/html|application\/xhtml|image\/svg|text\/javascript|application\/javascript|text\/xml|application\/xml)/i;

export function safeName(name: string): string {
  const base = name.split(/[\\/]/).pop() || 'file';
  const clean = base.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '').slice(0, 120);
  return clean || 'file';
}

const UPLOAD_TTL = 30 * 60_000;

function fileUrl(store: Store, id: string, name: string): string {
  return `${store.env.ORIGIN}/files/${id}/${encodeURIComponent(name)}`;
}

// Direct upload: reserve an id and a one-time PUT key; the bytes arrive later at upload_url.
export async function reserveUpload(store: Store, name: string, mime: string, clientId: string) {
  const id = randomId(12);
  const fname = safeName(name);
  const key = randomId(24);
  const expires = Date.now() + UPLOAD_TTL;
  store.sql.exec('DELETE FROM pending_uploads WHERE expires_at < ?', Date.now());
  store.sql.exec('INSERT INTO pending_uploads (id, key_hash, name, mime, client_id, expires_at) VALUES (?, ?, ?, ?, ?, ?)', id, await hashHex(key), fname, mime, clientId, expires);
  const url = fileUrl(store, id, fname);
  return { id, name: fname, url, uploadUrl: `${url}?key=${key}`, expiresAt: new Date(expires).toISOString() };
}

async function receiveUpload(store: Store, req: Request, id: string): Promise<Response> {
  const key = new URL(req.url).searchParams.get('key') ?? '';
  const p = store.sql.exec('SELECT * FROM pending_uploads WHERE id = ?', id).toArray()[0];
  if (!p || !key || (await hashHex(key)) !== p.key_hash) return new Response('unknown upload or wrong key\n', { status: 403 });
  if ((p.expires_at as number) < Date.now()) return new Response('upload_url expired; call upload again\n', { status: 410 });
  const len = Number(req.headers.get('content-length') || 0);
  if (len > MAX_FILE) return new Response(`file is over the ${MAX_FILE} byte limit\n`, { status: 413 });
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length > MAX_FILE) return new Response(`file is over the ${MAX_FILE} byte limit\n`, { status: 413 });
  store.sql.exec('DELETE FROM pending_uploads WHERE id = ?', id);
  saveFile(store, bytes, p.name as string, p.mime as string, p.client_id as string, id);
  console.log(`upload received ${id} ${p.name} ${bytes.length}B`);
  return new Response(JSON.stringify({ url: fileUrl(store, id, p.name as string), size: bytes.length }) + '\n', { status: 201, headers: { 'content-type': 'application/json' } });
}

export function saveFile(store: Store, bytes: Uint8Array, name: string, mime: string, clientId: string, fixedId?: string): { id: string; name: string; url: string } {
  const id = fixedId ?? randomId(12);
  const fname = safeName(name);
  store.ctx.storage.transactionSync(() => {
    store.sql.exec('INSERT INTO files (id, name, mime, size, created_at, client_id) VALUES (?, ?, ?, ?, ?, ?)', id, fname, mime, bytes.length, Date.now(), clientId);
    for (let seq = 0, o = 0; o < bytes.length || seq === 0; seq++, o += CHUNK)
      store.sql.exec('INSERT INTO file_chunks (file_id, seq, data) VALUES (?, ?, ?)', id, seq, bytes.subarray(o, o + CHUNK));
  });
  return { id, name: fname, url: fileUrl(store, id, fname) };
}

export function loadFile(store: Store, id: string): { bytes: Uint8Array; name: string; mime: string } | null {
  const f = store.sql.exec('SELECT name, mime, size FROM files WHERE id = ?', id).toArray()[0];
  if (!f) return null;
  const bytes = new Uint8Array(f.size as number);
  let o = 0;
  for (const c of store.sql.exec('SELECT data FROM file_chunks WHERE file_id = ? ORDER BY seq', id)) {
    const d = new Uint8Array(c.data as ArrayBuffer);
    bytes.set(d, o);
    o += d.length;
  }
  return { bytes, name: f.name as string, mime: f.mime as string };
}

// If url points at a file on this server, return its id.
export function ownFileId(store: Store, url: string): string | null {
  try {
    const u = new URL(url);
    if (u.origin !== store.env.ORIGIN) return null;
    const m = /^\/files\/([A-Za-z0-9_-]+)(\/|$)/.exec(u.pathname);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

export async function serveFile(store: Store, req: Request, path: string): Promise<Response> {
  const m = /^\/files\/([A-Za-z0-9_-]+)(?:\/[^/]*)?$/.exec(path);
  if (req.method === 'PUT' && m) return receiveUpload(store, req, m[1]);
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('method not allowed\n', { status: 405, headers: { allow: 'GET, HEAD, PUT' } });
  const f = m && loadFile(store, m[1]);
  if (!f) return new Response('not found\n', { status: 404 });
  const headers: Record<string, string> = {
    'content-type': f.mime,
    'x-content-type-options': 'nosniff',
    'content-security-policy': 'sandbox',
    'accept-ranges': 'bytes',
    'cache-control': 'public, max-age=3600',
    'access-control-allow-origin': '*',
    'content-disposition': `${ACTIVE.test(f.mime) ? 'attachment' : 'inline'}; filename="${f.name}"`,
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') ?? '');
  let body = f.bytes;
  let status = 200;
  if (range && (range[1] || range[2])) {
    const size = f.bytes.length;
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(size - 1, end);
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
    body = f.bytes.subarray(start, end + 1);
    status = 206;
    headers['content-range'] = `bytes ${start}-${end}/${size}`;
  }
  headers['content-length'] = String(body.length);
  return new Response(req.method === 'HEAD' ? null : body, { status, headers });
}
