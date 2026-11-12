import crypto from 'node:crypto';
const [url, key, from, text, replyUrl] = process.argv.slice(2);
const body = JSON.stringify({ from, subject: 'test', text, replyUrl });
const ts = String(Math.floor(Date.now() / 1000));
const sig = 'sha256=' + crypto.createHmac('sha256', key).update(`${ts}.${body}`).digest('hex');
const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-course-timestamp': ts, 'x-course-signature': sig }, body });
console.log(r.status, await r.text());
