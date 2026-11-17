import { chromium } from 'playwright';
const url = process.argv[2];
const browser = await chromium.launch();
for (const [tz, loc] of [['Pacific/Auckland', 'en-NZ'], ['Europe/Berlin', 'de-DE'], ['America/New_York', 'en-US']]) {
  const ctx = await browser.newContext({ timezoneId: tz, locale: loc });
  const p = await ctx.newPage();
  p.on('console', (m) => m.type() === 'error' && console.log('console error', m.text()));
  await p.goto(url);
  const loaderAtOpen = await p.locator('[data-testid=loader]').isVisible().catch(() => 'n/a');
  await p.locator('[data-testid=incident-row]').first().waitFor();
  const rows = await p.locator('[data-testid=incident-row]').count();
  const first = await p.locator('[data-testid=incident-row] time').first();
  console.log(tz, loc, { loaderAtOpen, loaderAfter: await p.locator('[data-testid=loader]').isVisible(), rows,
    acks: await p.locator('[data-testid=ack]').count(), time: await first.textContent(), dt: await first.getAttribute('datetime'),
    sha: await p.locator('[data-testid=build-sha]').textContent(), meta: await p.locator('meta[name=build]').getAttribute('content') });
  await ctx.close();
}
await browser.close();
