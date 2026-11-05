// OAuth 2.1 authorization server and protected resource metadata (RFC 9728, RFC 8414).
// Clients: Client ID Metadata Documents (URL client_id) or Dynamic Client Registration (RFC 7591).
// Sign-in: the owner approves each client on a consent page with the owner password.
import type { Store } from './worker';
import { consentPage, messagePage } from './pages';
import { CORS, b64url, hashHex, isLoopback, json, randomId, safeEqual, sha256 } from './util';

export const SCOPE = 'mcp';
const ACCESS_TTL = 3600_000;
const REFRESH_TTL = 30 * 24 * 3600_000;
const CODE_TTL = 5 * 60_000;
const MAX_CLIENTS = 1000;

export type Client = {
  client_id: string;
  client_name?: string;
  redirect_uris: string[];
  token_endpoint_auth_method: string;
  kind: 'cimd' | 'dcr';
  secret_hash?: string | null;
};

type AuthParams = {
  client_id: string;
  client_name: string;
  redirect_uri: string;
  state?: string;
  code_challenge: string;
  resource: string;
  scope: string;
};

export function resourceIds(origin: string): string[] {
  return [`${origin}/mcp`, origin, `${origin}/`];
}

export function prmUrl(origin: string): string {
  return `${origin}/.well-known/oauth-protected-resource/mcp`;
}

export function protectedResourceMetadata(origin: string) {
  return {
    resource: `${origin}/mcp`,
    authorization_servers: [origin],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ['header'],
    resource_name: 'toolhome — memo, upload and transcribe',
    resource_documentation: `${origin}/plan`,
  };
}

export function authServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/authorize`,
    token_endpoint: `${origin}/token`,
    registration_endpoint: `${origin}/register`,
    revocation_endpoint: `${origin}/revoke`,
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    revocation_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    scopes_supported: [SCOPE],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
    service_documentation: `${origin}/plan`,
  };
}

export async function handleOAuth(store: Store, req: Request, url: URL): Promise<Response | null> {
  const origin = store.env.ORIGIN;
  const p = url.pathname;
  if (req.method === 'GET' && (p === '/.well-known/oauth-protected-resource' || p === '/.well-known/oauth-protected-resource/mcp'))
    return json(protectedResourceMetadata(origin), 200, { ...CORS, 'cache-control': 'public, max-age=300' });
  if (req.method === 'GET' && p === '/.well-known/oauth-authorization-server')
    return json(authServerMetadata(origin), 200, { ...CORS, 'cache-control': 'public, max-age=300' });
  if (p === '/register' && req.method === 'POST') return register(store, req);
  if (p === '/authorize' && req.method === 'GET') return authorizeGet(store, url);
  if (p === '/authorize' && req.method === 'POST') return authorizePost(store, req);
  if (p === '/token' && req.method === 'POST') return token(store, req);
  if (p === '/revoke' && req.method === 'POST') return revoke(store, req);
  return null;
}

// ---------- clients ----------

function validRedirect(u: string): boolean {
  try {
    const r = new URL(u);
    if (r.hash) return false;
    if (r.protocol === 'https:' || isLoopback(r)) return true;
    // private-use schemes for native apps (e.g. cursor://, vscode://)
    return /^[a-z][a-z0-9+.-]*:$/.test(r.protocol) && !['http:', 'javascript:', 'data:', 'file:'].includes(r.protocol);
  } catch {
    return false;
  }
}

async function register(store: Store, req: Request): Promise<Response> {
  let m: any;
  try {
    m = await req.json();
  } catch {
    return json({ error: 'invalid_client_metadata', error_description: 'body must be JSON' }, 400, CORS);
  }
  const uris = m?.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > 10 || !uris.every((u) => typeof u === 'string' && validRedirect(u)))
    return json({ error: 'invalid_redirect_uri', error_description: 'redirect_uris must be https, loopback http or a private-use scheme' }, 400, CORS);
  const count = store.sql.exec('SELECT COUNT(*) AS n FROM clients').one().n as number;
  if (count >= MAX_CLIENTS) return json({ error: 'temporarily_unavailable', error_description: 'client limit reached' }, 503, CORS);
  const method = m.token_endpoint_auth_method ?? 'none';
  if (!['none', 'client_secret_post', 'client_secret_basic'].includes(method))
    return json({ error: 'invalid_client_metadata', error_description: `token_endpoint_auth_method ${method} is not supported` }, 400, CORS);
  const grants = m.grant_types ?? ['authorization_code', 'refresh_token'];
  const client_id = `dcr_${randomId(16)}`;
  const now = Math.floor(Date.now() / 1000);
  const out: Record<string, unknown> = {
    client_id,
    client_id_issued_at: now,
    client_name: typeof m.client_name === 'string' ? m.client_name.slice(0, 100) : undefined,
    redirect_uris: uris,
    grant_types: grants,
    response_types: ['code'],
    token_endpoint_auth_method: method,
    application_type: m.application_type,
    scope: SCOPE,
  };
  let secretHash: string | null = null;
  if (method !== 'none') {
    const secret = randomId(32);
    secretHash = await hashHex(secret);
    out.client_secret = secret;
    out.client_secret_expires_at = 0;
  }
  store.sql.exec(
    'INSERT INTO clients (client_id, kind, metadata, secret_hash, created_at) VALUES (?, ?, ?, ?, ?)',
    client_id,
    'dcr',
    JSON.stringify({ client_name: out.client_name, redirect_uris: uris, token_endpoint_auth_method: method }),
    secretHash,
    Date.now(),
  );
  console.log(`register client ${client_id} name=${JSON.stringify(out.client_name)} redirects=${JSON.stringify(uris)}`);
  return json(out, 201, { ...CORS, 'cache-control': 'no-store' });
}

function isCimdId(id: string): boolean {
  try {
    const u = new URL(id);
    return u.protocol === 'https:' && u.pathname.length > 1 && !u.hash && !u.username && !u.password;
  } catch {
    return false;
  }
}

// Look up a client: registered (DCR) from the table, URL-formatted (CIMD) by fetching its document.
async function getClient(store: Store, clientId: string): Promise<Client | { error: string }> {
  if (isCimdId(clientId)) {
    const row = store.sql.exec('SELECT metadata, created_at FROM clients WHERE client_id = ?', clientId).toArray()[0];
    if (row && Date.now() - (row.created_at as number) < 3600_000) return { ...JSON.parse(row.metadata as string), client_id: clientId, kind: 'cimd' };
    let doc: any;
    try {
      const res = await fetch(clientId, { headers: { accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(5000) });
      if (res.status >= 300 && res.status < 400) return { error: 'client metadata document URL redirects' };
      if (!res.ok) return { error: `client metadata document returned HTTP ${res.status}` };
      const text = await res.text();
      if (text.length > 10_000) return { error: 'client metadata document is too large' };
      doc = JSON.parse(text);
    } catch (e) {
      return { error: `could not fetch client metadata document: ${(e as Error).message}` };
    }
    if (doc?.client_id !== clientId) return { error: 'client_id in the metadata document does not match its URL' };
    if (!Array.isArray(doc.redirect_uris) || !doc.redirect_uris.every((u: unknown) => typeof u === 'string' && validRedirect(u)))
      return { error: 'metadata document has no valid redirect_uris' };
    const method = doc.token_endpoint_auth_method ?? 'none';
    if (method !== 'none') return { error: `token_endpoint_auth_method ${method} is not supported for metadata-document clients` };
    const meta = { client_name: typeof doc.client_name === 'string' ? doc.client_name.slice(0, 100) : undefined, redirect_uris: doc.redirect_uris, token_endpoint_auth_method: 'none' };
    store.sql.exec(
      'INSERT INTO clients (client_id, kind, metadata, secret_hash, created_at) VALUES (?, ?, ?, NULL, ?) ON CONFLICT(client_id) DO UPDATE SET metadata = excluded.metadata, created_at = excluded.created_at',
      clientId,
      'cimd',
      JSON.stringify(meta),
      Date.now(),
    );
    console.log(`cimd client ${clientId} name=${JSON.stringify(meta.client_name)}`);
    return { ...meta, client_id: clientId, kind: 'cimd' };
  }
  const row = store.sql.exec('SELECT metadata, secret_hash FROM clients WHERE client_id = ? AND kind = ?', clientId, 'dcr').toArray()[0];
  if (!row) return { error: 'unknown client_id' };
  return { ...JSON.parse(row.metadata as string), client_id: clientId, kind: 'dcr', secret_hash: row.secret_hash as string | null };
}

// Exact match; loopback redirects may differ in port (OAuth 2.1 native apps).
function redirectAllowed(client: Client, uri: string): boolean {
  if (client.redirect_uris.includes(uri)) return true;
  try {
    const u = new URL(uri);
    if (!isLoopback(u)) return false;
    return client.redirect_uris.some((r) => {
      const v = new URL(r);
      return isLoopback(v) && v.hostname === u.hostname && v.pathname === u.pathname && v.search === u.search;
    });
  } catch {
    return false;
  }
}

function redirectWith(base: string, params: Record<string, string | undefined>): Response {
  const u = new URL(base);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) u.searchParams.set(k, v);
  return new Response(null, { status: 302, headers: { location: u.toString(), 'cache-control': 'no-store' } });
}

// ---------- authorize ----------

async function authorizeGet(store: Store, url: URL): Promise<Response> {
  const origin = store.env.ORIGIN;
  const q = url.searchParams;
  const clientId = q.get('client_id') ?? '';
  const redirectUri = q.get('redirect_uri') ?? '';
  if (!clientId) return messagePage('Sign-in request refused', 'The request has no client_id.', 400);
  const client = await getClient(store, clientId);
  if ('error' in client) return messagePage('Sign-in request refused', `The client is not valid: ${client.error}.`, 400);
  const redirect = redirectUri || (client.redirect_uris.length === 1 ? client.redirect_uris[0] : '');
  if (!redirect || !redirectAllowed(client, redirect)) return messagePage('Sign-in request refused', 'The redirect_uri is not registered for this client.', 400);

  const state = q.get('state') ?? undefined;
  const fail = (error: string, error_description: string) => redirectWith(redirect, { error, error_description, state, iss: origin });
  if (q.get('response_type') !== 'code') return fail('unsupported_response_type', 'response_type must be code');
  const challenge = q.get('code_challenge') ?? '';
  if (!challenge || (q.get('code_challenge_method') ?? 'plain') !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(challenge))
    return fail('invalid_request', 'PKCE with code_challenge_method=S256 is required');
  const resource = q.get('resource') ?? `${origin}/mcp`;
  if (!resourceIds(origin).includes(resource)) return fail('invalid_target', `resource must be ${origin}/mcp`);

  const id = randomId(24);
  const params: AuthParams = {
    client_id: clientId,
    client_name: client.client_name || clientId,
    redirect_uri: redirect,
    state,
    code_challenge: challenge,
    resource: `${origin}/mcp`,
    scope: SCOPE,
  };
  store.prune();
  store.sql.exec('INSERT INTO auth_requests (id, params, created_at) VALUES (?, ?, ?)', id, JSON.stringify(params), Date.now());
  return consentPage({ id, clientName: params.client_name, clientId, redirect, kind: client.kind });
}

async function authorizePost(store: Store, req: Request): Promise<Response> {
  const origin = store.env.ORIGIN;
  const f = await req.formData();
  const id = String(f.get('request') ?? '');
  const row = store.sql.exec('SELECT params, created_at FROM auth_requests WHERE id = ?', id).toArray()[0];
  if (!row || Date.now() - (row.created_at as number) > 10 * 60_000)
    return messagePage('Request expired', 'This sign-in request is unknown or older than 10 minutes. Start the connection again from the client.', 400);
  const params = JSON.parse(row.params as string) as AuthParams;

  if (f.get('action') === 'deny') {
    store.sql.exec('DELETE FROM auth_requests WHERE id = ?', id);
    console.log(`authorize denied for ${params.client_id}`);
    return redirectWith(params.redirect_uri, { error: 'access_denied', error_description: 'the owner denied access', state: params.state, iss: origin });
  }

  const recent = store.sql.exec('SELECT COUNT(*) AS n FROM login_failures WHERE ts > ?', Date.now() - 15 * 60_000).one().n as number;
  if (recent >= 10) return messagePage('Too many attempts', 'Too many wrong passwords in the last 15 minutes. Try again later.', 429);
  const password = String(f.get('password') ?? '');
  if (!store.env.OWNER_PASSWORD || !(await safeEqual(password, store.env.OWNER_PASSWORD))) {
    store.sql.exec('INSERT INTO login_failures (ts) VALUES (?)', Date.now());
    console.log(`authorize: wrong password for ${params.client_id}`);
    return consentPage({ id, clientName: params.client_name, clientId: params.client_id, redirect: params.redirect_uri, kind: '', error: 'Wrong password.' }, 401);
  }

  store.sql.exec('DELETE FROM auth_requests WHERE id = ?', id);
  const code = randomId(32);
  store.sql.exec('INSERT INTO codes (code_hash, data, created_at) VALUES (?, ?, ?)', await hashHex(code), JSON.stringify({ ...params, family: randomId(12) }), Date.now());
  console.log(`authorize approved for ${params.client_id} (${params.client_name})`);
  return redirectWith(params.redirect_uri, { code, state: params.state, iss: origin });
}

// ---------- token ----------

async function readParams(req: Request): Promise<Record<string, string>> {
  const type = req.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    const j = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(j).map(([k, v]) => [k, String(v)]));
  }
  const text = await req.text();
  return Object.fromEntries(new URLSearchParams(text));
}

function tokenError(error: string, error_description: string, status = 400): Response {
  return json({ error, error_description }, status, { ...CORS, 'cache-control': 'no-store' });
}

// Client authentication at the token and revocation endpoints.
async function authClient(store: Store, req: Request, p: Record<string, string>): Promise<Client | Response> {
  let id = p.client_id;
  let secret = p.client_secret;
  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Basic ')) {
    try {
      const [u, s] = atob(auth.slice(6)).split(':');
      id = decodeURIComponent(u);
      secret = decodeURIComponent(s ?? '');
    } catch {
      return tokenError('invalid_client', 'bad Basic credentials', 401);
    }
  }
  if (!id) return tokenError('invalid_client', 'client_id is required', 401);
  const client = await getClient(store, id);
  if ('error' in client) return tokenError('invalid_client', client.error, 401);
  if (client.token_endpoint_auth_method !== 'none') {
    if (!secret || !client.secret_hash || (await hashHex(secret)) !== client.secret_hash) return tokenError('invalid_client', 'client authentication failed', 401);
  }
  return client;
}

async function issueTokens(store: Store, client: Client, clientName: string, resource: string, scope: string, family: string): Promise<Response> {
  const access = `at_${randomId(32)}`;
  const refresh = `rt_${randomId(32)}`;
  const now = Date.now();
  store.sql.exec(
    'INSERT INTO tokens (token_hash, kind, client_id, client_name, resource, scope, family, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    await hashHex(access), 'access', client.client_id, clientName, resource, scope, family, now + ACCESS_TTL,
  );
  store.sql.exec(
    'INSERT INTO tokens (token_hash, kind, client_id, client_name, resource, scope, family, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    await hashHex(refresh), 'refresh', client.client_id, clientName, resource, scope, family, now + REFRESH_TTL,
  );
  return json(
    { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL / 1000, refresh_token: refresh, scope },
    200,
    { ...CORS, 'cache-control': 'no-store', pragma: 'no-cache' },
  );
}

async function token(store: Store, req: Request): Promise<Response> {
  const origin = store.env.ORIGIN;
  const p = await readParams(req);
  const client = await authClient(store, req, p);
  if (client instanceof Response) return client;
  if (p.resource && !resourceIds(origin).includes(p.resource)) return tokenError('invalid_target', `resource must be ${origin}/mcp`);

  if (p.grant_type === 'authorization_code') {
    if (!p.code || !p.code_verifier) return tokenError('invalid_request', 'code and code_verifier are required');
    const h = await hashHex(p.code);
    const row = store.sql.exec('SELECT data, created_at, used FROM codes WHERE code_hash = ?', h).toArray()[0];
    if (!row) return tokenError('invalid_grant', 'unknown code');
    const data = JSON.parse(row.data as string) as AuthParams & { family: string };
    if (row.used) {
      // A replayed code revokes everything issued from it.
      store.sql.exec('UPDATE tokens SET revoked = 1 WHERE family = ?', data.family);
      return tokenError('invalid_grant', 'code was already used');
    }
    store.sql.exec('UPDATE codes SET used = 1 WHERE code_hash = ?', h);
    if (Date.now() - (row.created_at as number) > CODE_TTL) return tokenError('invalid_grant', 'code expired');
    if (data.client_id !== client.client_id) return tokenError('invalid_grant', 'code was issued to another client');
    if (p.redirect_uri && p.redirect_uri !== data.redirect_uri) return tokenError('invalid_grant', 'redirect_uri does not match');
    if (b64url(await sha256(p.code_verifier)) !== data.code_challenge) return tokenError('invalid_grant', 'PKCE verification failed');
    console.log(`token issued (code) to ${client.client_id}`);
    return issueTokens(store, client, data.client_name, data.resource, data.scope, data.family);
  }

  if (p.grant_type === 'refresh_token') {
    if (!p.refresh_token) return tokenError('invalid_request', 'refresh_token is required');
    const h = await hashHex(p.refresh_token);
    const row = store.sql.exec("SELECT * FROM tokens WHERE token_hash = ? AND kind = 'refresh'", h).toArray()[0];
    if (!row || row.revoked || (row.expires_at as number) < Date.now()) return tokenError('invalid_grant', 'refresh token is invalid or expired');
    if (row.client_id !== client.client_id) return tokenError('invalid_grant', 'refresh token was issued to another client');
    store.sql.exec('UPDATE tokens SET revoked = 1 WHERE token_hash = ?', h); // rotation
    console.log(`token issued (refresh) to ${client.client_id}`);
    return issueTokens(store, client, row.client_name as string, row.resource as string, row.scope as string, row.family as string);
  }

  return tokenError('unsupported_grant_type', 'grant_type must be authorization_code or refresh_token');
}

async function revoke(store: Store, req: Request): Promise<Response> {
  const p = await readParams(req);
  const client = await authClient(store, req, p);
  if (client instanceof Response) return client;
  if (p.token) store.sql.exec('UPDATE tokens SET revoked = 1 WHERE token_hash = ? AND client_id = ?', await hashHex(p.token), client.client_id);
  return new Response(null, { status: 200, headers: CORS });
}

// ---------- resource server ----------

export type Caller = { clientId: string; clientName: string };

export async function verifyAccess(store: Store, req: Request): Promise<Caller | null> {
  const auth = req.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(\S+)$/i.exec(auth);
  if (!m) return null;
  const row = store.sql.exec("SELECT client_id, client_name, resource, revoked, expires_at FROM tokens WHERE token_hash = ? AND kind = 'access'", await hashHex(m[1])).toArray()[0];
  if (!row || row.revoked || (row.expires_at as number) < Date.now()) return null;
  if (!resourceIds(store.env.ORIGIN).includes(row.resource as string)) return null;
  return { clientId: row.client_id as string, clientName: (row.client_name as string) || (row.client_id as string) };
}
