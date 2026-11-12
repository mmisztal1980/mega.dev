// night-status: public status page for sched-prod, built from S03E01/list.json.
// Every request reads the ops feed live (R-K8L); nothing is stored or copied.

const AMBER = "#f5a623"; // R-M9Z, sampled from screenshot.png

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*", // R-K4M
  "cache-control": "public, max-age=60", // R-L5Z
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: { ...JSON_HEADERS, "access-control-allow-methods": "GET, HEAD, OPTIONS" },
      });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("method not allowed", { status: 405 });
    }
    if (url.pathname !== "/" && url.pathname !== "/index.html" && url.pathname !== "/status.json") {
      return new Response("not found", { status: 404 });
    }

    let status;
    try {
      status = await readFeed(env.FEED_URL);
    } catch (err) {
      return new Response(`ops feed unavailable: ${err.message}`, { status: 502 });
    }

    if (url.pathname === "/status.json") {
      return new Response(JSON.stringify(status, null, 2), { headers: JSON_HEADERS });
    }
    return new Response(renderPage(status), {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=60",
      },
    });
  },
};

async function readFeed(feedUrl) {
  const res = await fetch(feedUrl, { cache: "no-store", headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const feed = await res.json();
  const incidents = (feed.incidents ?? [])
    .slice()
    .sort((a, b) => Date.parse(b.opened) - Date.parse(a.opened)); // R-M3H newest first
  return { updatedAt: utcZ(feed.updatedAt), incidents }; // R-K8L, R-H8X
}

// R-H8X: updatedAt in UTC ending in Z. The feed already sends that form; keep its value as is.
function utcZ(value) {
  if (typeof value === "string" && /Z$/.test(value)) return value;
  return new Date(value).toISOString().replace(/\.\d{3}Z$/, "Z");
}

const pad = (n) => String(n).padStart(2, "0");
const dayFirst = (iso) => { const d = new Date(iso); return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}`; }; // R-L3K
const hhmm = (iso) => { if (!iso) return "—"; const d = new Date(iso); return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function renderPage({ updatedAt, incidents }) {
  // R-Z2K: one row per incident, and every line gets a row, tram 3 included.
  const rows = incidents.map((i) => `
        <tr>
          <td>${dayFirst(i.opened)}</td>
          <td>${hhmm(i.opened)}</td>
          <td>${hhmm(i.closed)}</td>
          <td>${esc(i.line)}</td>
          <td>${esc(i.what)}</td>
          <td>${esc(i.author)}</td>
        </tr>`);
  const lines = new Set(incidents.map((i) => i.line));
  if (!lines.has("tram 3")) {
    rows.push(`
        <tr><td>—</td><td>—</td><td>—</td><td>tram 3</td><td>no incidents</td><td>—</td></tr>`);
  }
  const banner = incidents.length ? "Some services had problems overnight." : "No problems overnight.";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>status for the night</title>
<style>
  body { margin: 0; font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; color: #1d1d1b; background: #fff; }
  .banner { background: ${AMBER}; padding: 14px 24px; font-weight: 600; }
  main { max-width: 860px; margin: 0 auto; padding: 24px; }
  h1 { font-size: 24px; margin: 8px 0 4px; }
  .readers { color: #555; margin: 0 0 20px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-weight: 600; color: #777; padding: 8px 6px; border-bottom: 1px solid #e5e5e5; }
  td { padding: 10px 6px; border-bottom: 1px solid #eee; }
  footer { max-width: 860px; margin: 0 auto; padding: 16px 24px 32px; color: #555; font-size: 13px; }
  @media (max-width: 600px) { main { padding: 16px; } th, td { padding: 8px 4px; font-size: 13px; } }
</style>
</head>
<body>
<div class="banner" role="status">${banner}</div>
<main>
  <h1>status for the night</h1>
  <p class="readers">sched-prod · read by tram 3 boards · <a href="/status.json">status.json</a></p>
  <table>
    <thead><tr><th>date</th><th>opened</th><th>closed</th><th>line</th><th>what</th><th>ran by</th></tr></thead>
    <tbody>${rows.join("")}
    </tbody>
  </table>
</main>
<footer>All times UTC. Data read from the ops feed at ${hhmm(updatedAt)} on ${dayFirst(updatedAt)} (${esc(updatedAt)}).</footer>
</body>
</html>`;
}
