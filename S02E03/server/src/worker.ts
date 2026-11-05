// toolhome: a remote MCP server with memo, upload and transcribe tools.
// Every request goes to one Durable Object (Store), which holds the notes, files and OAuth state in SQLite.
import { DurableObject } from 'cloudflare:workers';
import { handleOAuth } from './oauth';
import { handleMcp } from './mcp';
import { serveFile } from './files';
import { planPage } from './pages';
import { CORS, json } from './util';

export interface Env {
  ORIGIN: string; // https://host, no trailing slash
  ALLOWED_ORIGINS: string; // comma separated browser origins allowed on /mcp besides ORIGIN
  WHISPER_MODEL: string;
  OWNER_PASSWORD: string; // secret: the human types it on the consent page
  AI: Ai;
  STORE: DurableObjectNamespace<Store>;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const stub = env.STORE.get(env.STORE.idFromName('main'));
    return stub.fetch(req);
  },
} satisfies ExportedHandler<Env>;

export class Store extends DurableObject<Env> {
  sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS memos (id TEXT PRIMARY KEY, text TEXT NOT NULL, created_at INTEGER NOT NULL, client_id TEXT, client_name TEXT);
      CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, created_at INTEGER NOT NULL, client_id TEXT);
      CREATE TABLE IF NOT EXISTS file_chunks (file_id TEXT NOT NULL, seq INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY (file_id, seq));
      CREATE TABLE IF NOT EXISTS clients (client_id TEXT PRIMARY KEY, kind TEXT NOT NULL, metadata TEXT NOT NULL, secret_hash TEXT, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS auth_requests (id TEXT PRIMARY KEY, params TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS codes (code_hash TEXT PRIMARY KEY, data TEXT NOT NULL, created_at INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS tokens (token_hash TEXT PRIMARY KEY, kind TEXT NOT NULL, client_id TEXT NOT NULL, client_name TEXT, resource TEXT NOT NULL, scope TEXT NOT NULL, family TEXT NOT NULL, expires_at INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS pending_uploads (id TEXT PRIMARY KEY, key_hash TEXT NOT NULL, name TEXT NOT NULL, mime TEXT NOT NULL, client_id TEXT, expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS login_failures (ts INTEGER NOT NULL);
    `);
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const p = url.pathname;
    const t0 = Date.now();
    let res: Response;
    try {
      if (req.method === 'OPTIONS') res = new Response(null, { status: 204, headers: CORS });
      else if (p === '/mcp' || p === '/mcp/') res = await handleMcp(this, req);
      else if (p.startsWith('/files/')) res = await serveFile(this, req, p);
      else if (p === '/' || p === '/plan') res = planPage(this.env);
      else if (p === '/healthz') res = json({ ok: true });
      else res = (await handleOAuth(this, req, url)) ?? new Response('not found\n', { status: 404 });
    } catch (e) {
      console.log(`error ${req.method} ${p}: ${(e as Error).stack || e}`);
      res = json({ error: 'server_error', error_description: 'internal error' }, 500);
    }
    console.log(`${req.method} ${p} -> ${res.status} ${Date.now() - t0}ms ${req.headers.get('mcp-method') ?? ''} ${req.headers.get('mcp-name') ?? ''}`.trim());
    return res;
  }

  // Housekeeping: drop expired OAuth rows.
  prune(): void {
    const now = Date.now();
    this.sql.exec('DELETE FROM auth_requests WHERE created_at < ?', now - 15 * 60_000);
    this.sql.exec('DELETE FROM codes WHERE created_at < ?', now - 15 * 60_000);
    this.sql.exec('DELETE FROM tokens WHERE expires_at < ?', now - 24 * 3600_000);
    this.sql.exec('DELETE FROM login_failures WHERE ts < ?', now - 3600_000);
  }
}
