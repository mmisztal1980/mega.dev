// MCP over Streamable HTTP. Dual-era:
//  - modern 2026-07-28: stateless, per-request _meta, required MCP-Protocol-Version / Mcp-Method / Mcp-Name headers, server/discover.
//  - legacy 2025-11-25 (and 2025-06-18, 2025-03-26): initialize handshake, no sessions minted.
import type { Store } from './worker';
import { prmUrl, SCOPE, verifyAccess, type Caller } from './oauth';
import { TOOLS, ToolError, callTool, resultText } from './tools';
import { CORS, json } from './util';

const MODERN = ['2026-07-28'];
const LEGACY = ['2025-11-25', '2025-06-18', '2025-03-26'];
const SUPPORTED = [...MODERN, ...LEGACY];
const SERVER_INFO = { name: 'toolhome', title: 'toolhome — memo, upload and transcribe', version: '1.0.0' };
const INSTRUCTIONS =
  'Tools: memo_write saves a note, memo_search finds notes, upload stores a file and returns a public link, transcribe turns audio at a URL into timestamped text. See the plan page for details.';
const K = {
  version: 'io.modelcontextprotocol/protocolVersion',
  caps: 'io.modelcontextprotocol/clientCapabilities',
  info: 'io.modelcontextprotocol/clientInfo',
  server: 'io.modelcontextprotocol/serverInfo',
};

type Id = string | number | null;
type Msg = { jsonrpc?: string; id?: Id; method?: string; params?: any };

function rpcError(id: Id, code: number, message: string, status: number, data?: unknown): Response {
  return json({ jsonrpc: '2.0', id, error: { code, message, ...(data === undefined ? {} : { data }) } }, status, CORS);
}

function rpcResult(id: Id, result: unknown): Response {
  return json({ jsonrpc: '2.0', id, result }, 200, CORS);
}

// Header values may use the =?base64?...?= sentinel.
function decodeHeader(v: string | null): string | null {
  if (v === null) return null;
  const m = /^=\?base64\?(.*)\?=$/.exec(v);
  if (!m) return v;
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

function originAllowed(store: Store, req: Request): boolean {
  const o = req.headers.get('origin');
  if (!o) return true;
  const allowed = [store.env.ORIGIN, ...store.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)];
  return allowed.includes(o) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
}

function unauthorized(store: Store, error?: string): Response {
  const parts = [`resource_metadata="${prmUrl(store.env.ORIGIN)}"`, `scope="${SCOPE}"`];
  if (error) parts.unshift(`error="${error}"`);
  return json(
    { jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Unauthorized: sign in through this server’s OAuth (see resource_metadata).' } },
    401,
    { ...CORS, 'www-authenticate': `Bearer ${parts.join(', ')}` },
  );
}

export async function handleMcp(store: Store, req: Request): Promise<Response> {
  if (!originAllowed(store, req)) return json({ jsonrpc: '2.0', error: { code: -32600, message: 'Origin not allowed' } }, 403);
  if (req.method !== 'POST') return new Response('Method Not Allowed: this MCP endpoint accepts POST only\n', { status: 405, headers: { allow: 'POST', ...CORS } });

  const auth = req.headers.get('authorization');
  const caller = await verifyAccess(store, req);
  if (!caller) return unauthorized(store, auth ? 'invalid_token' : undefined);

  let msg: Msg;
  try {
    msg = await req.json();
  } catch {
    return rpcError(null, -32700, 'Parse error', 400);
  }
  if (Array.isArray(msg) || typeof msg !== 'object' || msg === null || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string')
    return rpcError(null, -32600, 'Invalid Request: send one JSON-RPC 2.0 request per POST', 400);
  const isNotification = !('id' in msg);
  const id: Id = isNotification ? null : (msg.id as Id);
  if (!isNotification && (id === null || (typeof id !== 'string' && typeof id !== 'number'))) return rpcError(null, -32600, 'Invalid Request: id must be a string or number', 400);

  const params = msg.params ?? {};
  const meta = params && typeof params === 'object' ? params._meta : undefined;
  const metaVersion = meta && typeof meta === 'object' ? meta[K.version] : undefined;
  const headerVersion = req.headers.get('mcp-protocol-version');

  // Era selection: initialize or a legacy header without _meta version means legacy.
  if (msg.method === 'initialize' || (metaVersion === undefined && (headerVersion === null || LEGACY.includes(headerVersion))))
    return legacy(store, caller, msg, id, isNotification);
  return modern(store, req, caller, msg, id, isNotification, metaVersion, headerVersion);
}

async function modern(store: Store, req: Request, caller: Caller, msg: Msg, id: Id, isNotification: boolean, metaVersion: unknown, headerVersion: string | null): Promise<Response> {
  const params = msg.params ?? {};
  if (isNotification) return new Response(null, { status: 202, headers: CORS });

  if (headerVersion === null) return rpcError(id, -32020, 'Header mismatch: MCP-Protocol-Version header is required', 400);
  if (metaVersion === undefined) {
    if (!SUPPORTED.includes(headerVersion)) return rpcError(id, -32022, 'Unsupported protocol version', 400, { supported: SUPPORTED, requested: headerVersion });
    return rpcError(id, -32602, `Invalid params: _meta["${K.version}"] is required`, 400);
  }
  if (typeof metaVersion !== 'string') return rpcError(id, -32602, `Invalid params: _meta["${K.version}"] must be a string`, 400);
  if (headerVersion !== metaVersion)
    return rpcError(id, -32020, `Header mismatch: MCP-Protocol-Version header value '${headerVersion}' does not match body value '${metaVersion}'`, 400);
  if (!MODERN.includes(metaVersion)) return rpcError(id, -32022, 'Unsupported protocol version', 400, { supported: SUPPORTED, requested: metaVersion });
  const caps = params._meta[K.caps];
  if (caps === undefined || caps === null || typeof caps !== 'object' || Array.isArray(caps))
    return rpcError(id, -32602, `Invalid params: _meta["${K.caps}"] is required`, 400);

  const hMethod = req.headers.get('mcp-method');
  if (hMethod === null) return rpcError(id, -32020, 'Header mismatch: Mcp-Method header is required', 400);
  if (hMethod !== msg.method) return rpcError(id, -32020, `Header mismatch: Mcp-Method header value '${hMethod}' does not match body value '${msg.method}'`, 400);
  if (['tools/call', 'resources/read', 'prompts/get'].includes(msg.method!)) {
    const bodyName = msg.method === 'resources/read' ? params.uri : params.name;
    const rawName = req.headers.get('mcp-name');
    if (rawName === null) return rpcError(id, -32020, 'Header mismatch: Mcp-Name header is required', 400);
    const hName = decodeHeader(rawName);
    if (hName === null) return rpcError(id, -32020, 'Header mismatch: Mcp-Name header is malformed', 400);
    if (hName !== bodyName) return rpcError(id, -32020, `Header mismatch: Mcp-Name header value '${hName}' does not match body value '${bodyName}'`, 400);
  }

  const serverMeta = { [K.server]: SERVER_INFO };
  switch (msg.method) {
    case 'server/discover':
      return rpcResult(id, {
        resultType: 'complete',
        supportedVersions: SUPPORTED,
        capabilities: { tools: { listChanged: false } },
        instructions: INSTRUCTIONS,
        ttlMs: 3600_000,
        cacheScope: 'public',
        _meta: serverMeta,
      });
    case 'tools/list':
      return rpcResult(id, { resultType: 'complete', tools: TOOLS, ttlMs: 300_000, cacheScope: 'public', _meta: serverMeta });
    case 'tools/call':
      return toolsCall(store, caller, id, params, true);
  }
  return rpcError(id, -32601, `Method not found: ${msg.method}`, 404);
}

async function legacy(store: Store, caller: Caller, msg: Msg, id: Id, isNotification: boolean): Promise<Response> {
  if (isNotification) return new Response(null, { status: 202, headers: CORS });
  const params = msg.params ?? {};
  switch (msg.method) {
    case 'initialize': {
      const asked = typeof params.protocolVersion === 'string' ? params.protocolVersion : '';
      return rpcResult(id, {
        protocolVersion: LEGACY.includes(asked) ? asked : LEGACY[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping':
      return rpcResult(id, {});
    case 'tools/list':
      return rpcResult(id, { tools: TOOLS });
    case 'tools/call':
      return toolsCall(store, caller, id, params, false);
  }
  return rpcError(id, -32601, `Method not found: ${msg.method}`, 404);
}

async function toolsCall(store: Store, caller: Caller, id: Id, params: any, modernEra: boolean): Promise<Response> {
  const name = params?.name;
  if (typeof name !== 'string' || !TOOLS.some((t) => t.name === name)) return rpcError(id, -32602, `Unknown tool: ${name}`, 200);
  const args = params.arguments ?? {};
  if (typeof args !== 'object' || Array.isArray(args)) return rpcError(id, -32602, 'Invalid params: arguments must be an object', 200);
  // Tool results stay lean (no serverInfo _meta) so they fit small result budgets.
  const base = modernEra ? { resultType: 'complete' } : {};
  try {
    const out = await callTool(store, caller, name, args);
    return rpcResult(id, { ...base, content: [{ type: 'text', text: resultText(name, out) }], structuredContent: out });
  } catch (e) {
    if (!(e instanceof ToolError)) console.log(`tool ${name} failed: ${(e as Error).stack || e}`);
    const message = e instanceof ToolError ? e.message : 'internal error';
    return rpcResult(id, { ...base, content: [{ type: 'text', text: `${name}: ${message}` }], isError: true });
  }
}
