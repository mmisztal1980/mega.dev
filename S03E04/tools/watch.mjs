import { chromium } from 'playwright';
const browser = await chromium.launch();
const p = await (await browser.newContext()).newPage();
await p.goto(process.argv[2]);
await p.locator('[data-testid=incident-row]').first().waitFor();
const t0 = Date.now();
let last = '';
while (Date.now() - t0 < 40000) {
  const ids = await p.locator('[data-testid=incident-row]').evaluateAll((els) => els.map((e) => e.dataset.id).join(' '));
  if (ids !== last) { console.log(((Date.now() - t0) / 1000).toFixed(1), ids); last = ids; }
  await p.waitForTimeout(250);
}
await browser.close();
