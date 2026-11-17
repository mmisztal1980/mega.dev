// wire: the one way a request leaves this role. It answers two questions in code:
// 1. Where may each secret go? secrets.policy.json (owner-edited, top of the Host Desk) lists the hosts per secret.
//    A request that carries a secret to any other host is refused before it is sent. Documents cannot change this.
// 2. What did the request do on the wire? Redirects are never followed blindly: each hop is checked against the
//    policy again (a secret never rides a redirect to a new host) and recorded with host, what it carried, status.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DESK = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const MAX_HOPS = 5;

export function loadPolicy() {
  try {
    const raw = JSON.parse(readFileSync(join(DESK, 'secrets.policy.json'), 'utf8'));
    return Object.fromEntries(Object.entries(raw).filter(([k, v]) => /^[A-Z][A-Z0-9_]*$/.test(k) && Array.isArray(v)));
  } catch {
    return {};
  }
}

/** Names of the secrets whose values appear in the given text. */
export function secretsIn(text, vars) {
  return Object.entries(vars).filter(([, v]) => v && v.length >= 8 && String(text).includes(v)).map(([k]) => k);
}

/** Secret names not allowed to go to url's host (empty = fine). A secret with no policy entry may go nowhere. */
export function blocked(url, names, policy = loadPolicy()) {
  let host;
  try { host = new URL(url).hostname.toLowerCase(); } catch { return names; }
  if (new URL(url).protocol !== 'https:') return names;
  return names.filter((n) => !(policy[n] ?? []).map((h) => h.toLowerCase()).includes(host));
}

/**
 * fetch with the policy enforced on every hop. `vars` = name→value of all secrets (to spot them in the request).
 * Returns { res, text, hops } or throws Error('blocked: …'). hops = [{ host, method, carried, status, location }].
 */
export async function wireFetch(url, init = {}, vars = {}, policy = loadPolicy()) {
  const hops = [];
  let method = (init.method ?? 'GET').toUpperCase();
  let body = init.body;
  let headers = { ...(init.headers ?? {}) };
  for (let i = 0; i <= MAX_HOPS; i++) {
    const carried = secretsIn(`${url}\n${JSON.stringify(headers)}\n${body ?? ''}`, vars);
    const no = blocked(url, carried, policy);
    const host = (() => { try { return new URL(url).hostname; } catch { return String(url); } })();
    if (no.length) {
      hops.push({ host, method, carried, status: 'blocked' });
      const e = new Error(`blocked: ${no.join(', ')} may not go to ${host} (secrets.policy.json)`);
      e.hops = hops;
      throw e;
    }
    const res = await fetch(url, { ...init, method, headers, body, redirect: 'manual' });
    const location = res.headers.get('location');
    hops.push({ host, method, carried, status: res.status, ...(location ? { location: new URL(location, url).hostname } : {}) });
    if (res.status >= 300 && res.status < 400 && location) {
      url = new URL(location, url).toString();
      if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === 'POST')) { method = 'GET'; body = undefined; }
      continue;
    }
    return { res, text: await res.text(), hops, url };
  }
  const e = new Error(`too many redirects (${MAX_HOPS})`);
  e.hops = hops;
  throw e;
}
