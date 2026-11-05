// Small helpers shared by the OAuth, MCP and file code.

export function randomId(bytes = 24): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return b64url(b);
}

export function b64url(b: Uint8Array): string {
  return toBase64(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256(s: string | Uint8Array): Promise<Uint8Array> {
  const data = typeof s === 'string' ? new TextEncoder().encode(s) : s;
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data));
}

export async function hashHex(s: string): Promise<string> {
  return [...(await sha256(s))].map((x) => x.toString(16).padStart(2, '0')).join('');
}

// Constant-time compare of two strings via their digests.
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([sha256(a), sha256(b)]);
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

export function toBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(s: string): Uint8Array {
  const clean = s.replace(/^data:[^,]*,/, '').replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(clean + '='.repeat((4 - (clean.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

export function html(body: string, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'x-frame-options': 'DENY',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
      'referrer-policy': 'no-referrer',
      ...headers,
    },
  });
}

export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, mcp-protocol-version, mcp-method, mcp-name',
  'access-control-expose-headers': 'www-authenticate',
};

export function isLoopback(u: URL): boolean {
  return u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]');
}

// Fetch a URL with a byte cap. Throws on errors and oversized bodies.
export async function fetchCapped(url: string, maxBytes: number, init: RequestInit = {}): Promise<{ bytes: Uint8Array; type: string; res: Response }> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`it returned HTTP ${res.status}`);
  const len = Number(res.headers.get('content-length') || 0);
  if (len > maxBytes) throw new Error(`file is ${len} bytes; the limit is ${maxBytes}`);
  const reader = res.body!.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`file is over the ${maxBytes} byte limit`);
    }
    parts.push(value);
  }
  const bytes = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    bytes.set(p, o);
    o += p.length;
  }
  return { bytes, type: res.headers.get('content-type') || 'application/octet-stream', res };
}
