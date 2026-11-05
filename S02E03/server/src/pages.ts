// HTML pages: the plan page (resource_documentation), the consent page and short messages.
import type { Env } from './worker';
import { TOOLS } from './tools';
import { esc, html } from './util';

const STYLE = `
:root{--bg:#fbfaf7;--fg:#1d1b18;--muted:#615c55;--line:#e3dfd7;--card:#fff;--accent:#5b3fd1}
@media (prefers-color-scheme:dark){:root{--bg:#15141a;--fg:#ece9e4;--muted:#a49e96;--line:#2e2c35;--card:#1d1c23;--accent:#a593ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:760px;margin:0 auto;padding:32px 16px 64px}h1{font-size:1.6rem;margin:0 0 4px}h2{font-size:1.15rem;margin:32px 0 8px}
p,li{color:var(--fg)}.muted{color:var(--muted)}code{font:0.9em ui-monospace,Menlo,monospace;background:var(--card);border:1px solid var(--line);border-radius:4px;padding:1px 4px;overflow-wrap:anywhere}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px;margin:12px 0}
table{border-collapse:collapse;width:100%}td,th{text-align:left;vertical-align:top;padding:6px 8px;border-bottom:1px solid var(--line)}
input[type=password]{width:100%;padding:10px;font:inherit;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--fg)}
button{font:inherit;padding:10px 18px;border-radius:6px;border:1px solid var(--line);cursor:pointer;background:var(--card);color:var(--fg)}
button.primary{background:var(--accent);border-color:var(--accent);color:#fff}.err{color:#c0392b;font-weight:600}
`;

function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${STYLE}</style></head><body><main>${body}</main></body></html>`;
}

export function planPage(env: Env): Response {
  const o = env.ORIGIN;
  const rows = TOOLS.map(
    (t) => `<tr><td><code>${esc(t.name)}</code></td><td>${esc(t.description)}<br><span class="muted">Input: <code>${esc(Object.keys(t.inputSchema.properties).join(', '))}</code> · Result: <code>${esc(Object.keys(t.outputSchema.properties).join(', '))}</code></span></td></tr>`,
  ).join('');
  return html(
    page(
      'toolhome plan',
      `<h1>toolhome</h1>
<p class="muted">A remote MCP server with four tools: notes, file upload and audio transcription. This page is its plan: what the tools do, how sign-in works and what data it keeps.</p>

<h2>Endpoint</h2>
<div class="card"><p>MCP endpoint: <code>${esc(o)}/mcp</code> (Streamable HTTP, POST only).</p>
<p>Protocol revisions: <code>2026-07-28</code> (stateless, per-request <code>_meta</code>, <code>server/discover</code>) and, for older clients, <code>2025-11-25</code>, <code>2025-06-18</code>, <code>2025-03-26</code> through <code>initialize</code>. No sessions are minted.</p></div>

<h2>Tools</h2>
<table>${rows}</table>
<p class="muted">Every successful result is returned as <code>structuredContent</code> that matches the tool's <code>outputSchema</code>, plus the same JSON as text. Errors come back with <code>isError: true</code> and a short reason.</p>

<h2>Sign-in</h2>
<ol>
<li>A call to <code>/mcp</code> without a token returns <code>401</code> with <code>WWW-Authenticate: Bearer resource_metadata="${esc(o)}/.well-known/oauth-protected-resource/mcp"</code>.</li>
<li>The protected resource metadata names this host as the authorization server. Its metadata is at <code>${esc(o)}/.well-known/oauth-authorization-server</code>.</li>
<li>Clients identify with a Client ID Metadata Document (an https <code>client_id</code> URL) or register at <code>${esc(o)}/register</code> (Dynamic Client Registration).</li>
<li>OAuth 2.1 authorization code flow with PKCE (S256 only) and the <code>resource</code> parameter <code>${esc(o)}/mcp</code>. The authorization response carries <code>iss</code>.</li>
<li>The owner of this server approves each client on the consent page with the owner password. Nobody else can let a client in.</li>
<li>Access tokens last 1 hour and are bound to <code>${esc(o)}/mcp</code>. Refresh tokens last 30 days and rotate on each use. Scope: <code>mcp</code>.</li>
</ol>

<h2>Data kept</h2>
<ul>
<li><b>Notes</b>: text, time written and the name of the client that wrote it. Kept until the owner deletes them. Every signed-in client can search every note.</li>
<li><b>Uploaded files</b>: the bytes, file name, media type and size, up to 25 MB each. Anyone with a file's link can open it. Kept until the owner deletes them. A big file can skip the tool arguments: call <code>upload</code> with only <code>filename</code>, then PUT the bytes to the returned <code>upload_url</code> (one use, 30 minutes).</li>
<li><b>Transcriptions</b>: audio is fetched, sent to Whisper on Cloudflare Workers AI, and the transcript is returned. Neither the audio nor the transcript is stored, unless the audio was uploaded.</li>
<li><b>Sign-in</b>: registered client names and redirect URIs, and hashes of codes and tokens (never the tokens themselves). Expired rows are deleted.</li>
<li><b>Logs</b>: method, path, status, tool name and client name, kept by Cloudflare for a few days. No tokens, passwords or note text are logged.</li>
</ul>
<p class="muted">Hosted on Cloudflare Workers with a Durable Object (SQLite). Contact: the owner of ${esc(new URL(o).host)}.</p>`,
    ),
  );
}

export function consentPage(
  p: { id: string; clientName: string; clientId: string; redirect: string; kind: string; error?: string },
  status = 200,
): Response {
  let host = p.redirect;
  try {
    host = new URL(p.redirect).origin;
  } catch {}
  return html(
    page(
      'Let a client in',
      `<h1>Let this client in?</h1>
<p class="muted">An MCP client asks to use the tools on this server. Approve only if you started this connection.</p>
<div class="card"><table>
<tr><th>Client</th><td>${esc(p.clientName)}</td></tr>
<tr><th>Client id</th><td><code>${esc(p.clientId)}</code></td></tr>
<tr><th>Returns to</th><td><code>${esc(host)}</code></td></tr>
<tr><th>Access</th><td>memo_write, memo_search, upload, transcribe</td></tr>
</table></div>
${p.error ? `<p class="err">${esc(p.error)}</p>` : ''}
<form method="post" action="/authorize">
<input type="hidden" name="request" value="${esc(p.id)}">
<p><label>Owner password<br><input type="password" name="password" autocomplete="current-password" autofocus></label></p>
<p><button class="primary" type="submit" name="action" value="approve">Approve</button> <button type="submit" name="action" value="deny">Deny</button></p>
</form>`,
    ),
    status,
  );
}

export function messagePage(title: string, text: string, status: number): Response {
  return html(page(title, `<h1>${esc(title)}</h1><p>${esc(text)}</p>`), status);
}
