// Records the board in use: open-board, watch-board, ack-incident.
// The recording shows a visible pointer and an elapsed mm:ss stamp (recording aids, injected here, not in the build).
// usage: node record.mjs <url> <outdir>
import { chromium } from 'playwright';
import fs from 'node:fs';

const [url, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1100, height: 720 },
  recordVideo: { dir: out, size: { width: 1100, height: 720 } },
  timezoneId: 'Europe/Berlin',
  locale: 'en-GB',
});
const t0 = Date.now();
const mmss = () => {
  const s = Math.floor((Date.now() - t0) / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
const events = [];
const note = (what, extra = {}) => {
  const e = { at: mmss(), ms: Date.now() - t0, wall: new Date().toISOString(), what, ...extra };
  events.push(e);
  console.log(JSON.stringify(e));
};

await ctx.addInitScript((start) => {
  addEventListener('DOMContentLoaded', () => {
    const dot = document.createElement('div');
    dot.style.cssText = 'position:fixed;z-index:99999;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:rgba(220,0,80,.55);border:2px solid #c00050;pointer-events:none;left:-50px;top:-50px;transition:transform .08s';
    const stamp = document.createElement('div');
    stamp.style.cssText = 'position:fixed;z-index:99999;right:8px;top:8px;font:600 14px ui-monospace,monospace;background:#111;color:#fff;padding:3px 8px;border-radius:4px;pointer-events:none';
    document.body.append(dot, stamp);
    addEventListener('mousemove', (e) => { dot.style.left = e.clientX + 'px'; dot.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', () => { dot.style.transform = 'scale(1.8)'; }, true);
    addEventListener('mouseup', () => { dot.style.transform = ''; }, true);
    const tick = () => { const s = Math.floor((Date.now() - start) / 1000); stamp.textContent = 'rec ' + String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
    tick(); setInterval(tick, 200);
  });
}, t0);

const page = await ctx.newPage();
page.on('console', (m) => {
  const t = m.text();
  if (t.startsWith('ack ')) {
    const [, id, ackedAt, receipt] = t.split(' ');
    note('ack-reply', { id, ackedAt, receipt });
  }
});
const ids = () => page.locator('[data-testid=incident-row]').evaluateAll((els) => els.map((e) => e.dataset.id));

// open-board
note('open-board: goto', { url });
await page.goto(url);
note('loader visible', { visible: await page.locator('[data-testid=loader]').isVisible() });
await page.locator('[data-testid=incident-row]').first().waitFor();
note('incidents on screen', { ids: await ids(), sha: await page.locator('[data-testid=build-sha]').textContent() });

// watch-board: keep it open until at least one new incident arrives at the top.
let before = await ids();
await page.waitForFunction((top) => document.querySelector('[data-testid=incident-row]')?.dataset.id !== top, before[0], { timeout: 60000 });
note('watch-board: new incident at top', { ids: await ids() });

// ack-incident: on-call picks the third row and moves to its Ack button.
before = await ids();
const target = before[2];
const btn = page.locator(`[data-testid=incident-row][data-id="${target}"] [data-testid=ack]`);
const box = await btn.boundingBox();
const x = box.x + box.width / 2, y = box.y + box.height / 2;
await page.mouse.move(x - 300, y + 120);
await page.mouse.move(x, y, { steps: 25 });
note('pointer on Ack', { aimedAt: target, x, y });
// A person reads the row before clicking. The click goes where the pointer is when they press.
// We hold the pointer still and press right after the next refresh shifts the list.
await page.waitForFunction((top) => document.querySelector('[data-testid=incident-row]')?.dataset.id !== top, before[0], { timeout: 60000 });
const underPointer = await page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.closest('[data-testid=incident-row]')?.dataset.id, [x, y]);
note('list shifted under the pointer', { aimedAt: target, nowUnderPointer: underPointer, ids: await ids() });
await page.waitForTimeout(250);
await page.mouse.down();
await page.mouse.up();
note('click', { aimedAt: target, landedOn: underPointer });
await page.locator('[data-testid=acked]').first().waitFor();
const ackedIds = await page.locator('[data-testid=acked]').evaluateAll((els) => els.map((e) => e.closest('[data-testid=incident-row]').dataset.id));
note('acked mark', { ackedIds, aimedAtStillOpen: (await page.locator(`[data-testid=incident-row][data-id="${target}"] [data-testid=ack]`).count()) === 1 });

await page.waitForTimeout(4000);
note('end');
const video = await page.video().path();
await ctx.close();
await browser.close();
fs.writeFileSync(`${out}/events.json`, JSON.stringify({ url, t0: new Date(t0).toISOString(), video, events }, null, 2));
console.log('video', video);
