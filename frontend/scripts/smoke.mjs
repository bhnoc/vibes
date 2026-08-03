/**
 * Renders the console in a real browser and fails on anything the operator would
 * see as broken: an uncaught error, a console error, or a shell that never
 * mounted. Typechecking cannot catch a bad hook order or a missing token, and
 * this console is meant to run unattended for the length of a conference.
 *
 * Usage: node scripts/smoke.mjs [url] [--shots]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const url = process.argv[2]?.startsWith('http') ? process.argv[2] : 'http://localhost:5173/';
const wantShots = process.argv.includes('--shots');
const OUT = 'smoke-shots';

const errors = [];
const offline = [];

// The capture socket lives in the Go backend, which is a separate process. Its
// absence is reported but is not a UI failure, or this check could never be run
// against a frontend-only dev server.
const isBackendDown = (text) => /WebSocket|Failed to fetch|ERR_CONNECTION_REFUSED|\/api\//i.test(text);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });

page.on('console', (m) => {
  if (m.type() !== 'error') return;
  (isBackendDown(m.text()) ? offline : errors).push(`console.error: ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(url, { waitUntil: 'networkidle' });

// The engine samples at 1Hz; give the dock a couple of ticks to publish.
await page.waitForTimeout(2500);

const checks = [
  ['top bar', 'header'],
  ['icon rail', 'nav[aria-label="Console surfaces"]'],
  ['status bar', 'footer[aria-label="Capture status"]'],
  ['capture canvas', 'canvas'],
];

const results = [];
for (const [name, selector] of checks) {
  results.push([name, (await page.locator(selector).count()) > 0]);
}

// Regression: choosing Live capture must stay chosen. The backend answers a
// bare /ws with simulated traffic, and the console used to accept that as the
// operator's own choice — flipping out of Live mode and taking the interface
// picker with it, so an interface could never be selected at all.
{
  const settings = page.locator('[aria-label="Capture settings"]').first();
  if ((await settings.count()) > 0) {
    await settings.click();
    await page.waitForTimeout(300);
  }

  const live = page.getByRole('button', { name: 'Live', exact: true }).first();
  if ((await live.count()) > 0) {
    await live.click();
    // Long enough for a socket round trip and the mode frame that used to
    // clobber the selection.
    await page.waitForTimeout(2500);

    const picker = page.locator('select[aria-label="Network interface"]');
    results.push(['live mode holds', (await picker.count()) > 0]);

    if ((await picker.count()) > 0) {
      const options = await picker.locator('option').count();
      results.push(['interfaces offered', options > 1]);
    } else {
      results.push(['interfaces offered', false]);
    }
  }

  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
}

if (wantShots) {
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/01-console.png` });

  // Open every floating layer in turn so a crash in one is caught here rather
  // than by whoever opens it mid-shift.
  for (const [file, label] of [
    ['02-settings', 'Capture settings'],
    ['03-diagnostics', 'Diagnostics'],
    ['04-legend', 'Theme legend'],
    ['05-load', 'Performance test'],
  ]) {
    const button = page.locator(`[aria-label="${label}"]`).first();
    if ((await button.count()) === 0) continue;
    await button.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${file}.png` });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }

  await page.keyboard.press('Control+k');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/06-palette.png` });
  await page.keyboard.press('Escape');

  for (const [file, label] of [
    ['07-flows', 'Flows'],
    ['08-hosts', 'Hosts'],
    ['09-alerts', 'Alerts'],
  ]) {
    const nav = page.locator(`[aria-label="${label}"]`).first();
    if ((await nav.count()) === 0) continue;
    await nav.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/${file}.png` });
  }
}

await browser.close();

for (const [name, ok] of results) console.log(`${ok ? 'ok  ' : 'MISS'}  ${name}`);

if (offline.length) console.log(`\nnote: backend unreachable (${offline.length} socket/API errors) — UI checked standalone`);

if (errors.length) {
  console.log('\n--- runtime errors ---');
  for (const e of errors) console.log(e);
}

const missing = results.filter(([, ok]) => !ok);
process.exit(missing.length || errors.length ? 1 : 0);
