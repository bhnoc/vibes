/**
 * Drives the console against a REAL backend and proves the live-capture path:
 *  1. Live mode stays selected and the interface picker stays on screen.
 *  2. Selecting a real interface actually starts a real capture.
 *  3. A capture the backend cannot open is reported, not silently faked.
 *
 * Unlike smoke.mjs this needs the Go backend up, because the bugs it guards
 * against only appear once something is answering the socket: the backend
 * reports "simulated" both when it reconnects and when it quietly substitutes
 * its simulator for a capture it could not open, and the console used to treat
 * that as the operator changing their mind — dropping out of Live mode and
 * taking the interface picker with it.
 *
 * Usage: npm run verify:live [url]      (expects a backend behind the dev proxy)
 */
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://localhost:5174/';
const browser = await chromium.launch();

const log = [];
const results = [];
const record = (name, ok, detail = '') => {
  results.push([name, ok, detail]);
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  :: ${detail}` : ''}`);
};

// ---------- Case 1: pick a real interface through the UI ----------
{
  const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
  page.on('console', (m) => { if (m.type() === 'error') log.push(m.text()); });
  page.on('pageerror', (e) => log.push(`pageerror: ${e.message}`));

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  await page.locator('[aria-label="Capture settings"]').first().click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Live', exact: true }).first().click();
  await page.waitForTimeout(1500);

  const picker = page.locator('select[aria-label="Network interface"]');
  record('picker appears in Live mode', (await picker.count()) > 0);

  const names = await picker.locator('option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
  record('real interfaces listed', names.includes('eth0'), names.join(','));

  await picker.selectOption('eth0');
  // Give the socket time to reconnect with ?interface=eth0 and stream.
  await page.waitForTimeout(6000);

  record('still in Live mode after selecting', (await picker.count()) > 0);
  const selected = await picker.inputValue();
  record('selection retained', selected === 'eth0', `value=${selected}`);

  const socket = await page.locator('text=/ws?interface=eth0').count();
  record('socket points at the interface', socket > 0);

  const failure = await page.locator('[role="alert"]').count();
  const failureText = failure ? await page.locator('[role="alert"]').first().innerText() : '';
  record('no capture failure reported', failure === 0, failureText.replace(/\s+/g, ' ').slice(0, 160));

  // SEEN in the status bar is the session packet total from the telemetry engine.
  const seen = await page.locator('footer[aria-label="Capture status"]').innerText();
  const m = seen.match(/SEEN\s+([\d.,kKmM]+)/);
  const packets = m ? m[1] : '0';
  record('packets captured', !!m && parseFloat(packets.replace(/,/g, '')) > 0, `SEEN=${packets}`);

  await page.close();
}

// ---------- Case 2: an interface the backend cannot open ----------
{
  const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
  page.on('pageerror', (e) => log.push(`pageerror: ${e.message}`));

  await page.goto(`${url}?ws=interface=nosuchdev0`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);

  const alert = page.locator('[role="alert"]');
  const shown = (await alert.count()) > 0;
  const text = shown ? (await alert.first().innerText()).replace(/\s+/g, ' ') : '';
  record('bad interface is reported', shown, text.slice(0, 200));

  const picker = page.locator('select[aria-label="Network interface"]');
  record('stays in Live mode after failure', (await picker.count()) > 0);

  await page.close();
}

await browser.close();

if (log.length) {
  console.log('\n--- console errors ---');
  for (const l of [...new Set(log)]) console.log(l);
}

process.exit(results.some(([, ok]) => !ok) ? 1 : 0);
