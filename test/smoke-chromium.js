#!/usr/bin/env node
// Live smoke test for the DANMAN extension's trust boundaries.
//
// Loads the extension into headless Chromium (new headless supports
// extensions), serves test/danman-hostile-page.html from a local port, then
// runs the hostile-page harness plus the legitimate flows and prints a
// PASS/FAIL table. Every browser call is time-boxed so a hang is a FAIL.
//
// Requirements: node 18+, the `playwright` package resolvable (npm i -D
// playwright, or NODE_PATH pointing at a global install) and a Chromium that
// Playwright can find (npx playwright install chromium).
//
//   node test/smoke-chromium.js
//
// The manifest targets Firefox (background.scripts). Chromium needs a
// background.service_worker entry, so this script copies the extension to a
// temp dir and points the manifest at background/service-worker.js, which
// imports the same module list itself.

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const SRC_EXT = path.join(ROOT, 'extension');
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'danman-smoke-'));
const EXT = path.join(WORK, 'ext');
const PROFILE = path.join(WORK, 'profile');
const PORT = 8765 + Math.floor(Math.random() * 1000);
const PAGE_URL = 'http://127.0.0.1:' + PORT + '/danman-hostile-page.html';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const verdict = (name, ok, note) => {
  results.push([name, ok ? 'PASS' : 'FAIL', String(note || '')]);
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (note ? ' — ' + String(note).slice(0, 160) : ''));
};
const T = (label, p, ms = 15000) => Promise.race([p, sleep(ms).then(() => { throw new Error('TIMEOUT: ' + label); })]);
const swLogs = [], pageLogs = [];
let ctx, server;

function buildChromiumCopy() {
  fs.cpSync(SRC_EXT, EXT, { recursive: true });
  const mp = path.join(EXT, 'manifest.json');
  const m = JSON.parse(fs.readFileSync(mp, 'utf8'));
  m.background = { service_worker: 'background/service-worker.js' };
  fs.writeFileSync(mp, JSON.stringify(m, null, 2));
}

function serveTestDir() {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      const file = path.join(__dirname, path.basename(req.url.split('?')[0]));
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('nope'); return; }
      res.writeHead(200, { 'Content-Type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain' });
      fs.createReadStream(file).pipe(res);
    }).listen(PORT, '127.0.0.1', resolve);
  });
}

async function main() {
  buildChromiumCopy();
  await serveTestDir();
  ctx = await chromium.launchPersistentContext(PROFILE, {
    channel: 'chromium', headless: true, chromiumSandbox: false, viewport: { width: 1600, height: 900 },
    args: ['--disable-extensions-except=' + EXT, '--load-extension=' + EXT, '--no-sandbox'],
  });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:' + PORT });
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  const extId = new URL(sw.url()).host;
  sw.on('console', (m) => swLogs.push('[sw:' + m.type() + '] ' + m.text()));
  await sleep(1500);
  const diag = await T('sw-diag', sw.evaluate(() => ({ security: typeof DANMAN_Security, listeners: chrome.runtime.onMessage.hasListeners(), router: typeof handleMessage })));
  verdict('service worker booted with security module + router listener', diag.security === 'object' && diag.listeners === true, JSON.stringify(diag));
  const shadow = await T('sw-shadow', sw.evaluate(() => ({ mem: typeof MemoryManager.isMemoryConfigured, wiz: typeof SetupWizard.getSetupStatus })));
  verdict('MemoryManager / SetupWizard resolve to instances, not classes', shadow.mem === 'function' && shadow.wiz === 'function', JSON.stringify(shadow));

  const page = await ctx.newPage();
  page.on('console', (m) => pageLogs.push('[' + m.type() + '] ' + m.text()));
  page.on('pageerror', (e) => pageLogs.push('[pageerror] ' + e.message));
  await T('goto', page.goto(PAGE_URL));
  await T('trigger-host', page.waitForSelector('[data-danman]', { state: 'attached', timeout: 15000 }));
  const shadowClosed = await page.evaluate(() => { const h = document.querySelector('[data-danman]'); return h && h.shadowRoot === null && !document.getElementById('gpd-trigger'); });
  verdict('content script injected; UI host present with closed shadow root', shadowClosed === true);
  const harness = (id) => page.evaluate((i) => document.getElementById(i).click(), id);

  // A1: synthetic hover + click
  await harness('a1'); await sleep(2200);
  const a1 = await page.textContent('#a1r');
  verdict('A1 synthetic hover/click on trigger', a1.startsWith('BLOCKED'), a1);

  // Legit: a real (trusted) click opens the sidebar. The trigger is not
  // addressable through the DOM any more, so click its screen position
  // (fixed at the right edge, vertically centred).
  const vp = page.viewportSize();
  await T('click-trigger', page.mouse.click(vp.width - 12, Math.round(vp.height / 2))); await sleep(1200);
  const sidebar = page.frames().find((f) => f.url().includes('sidebar/sidebar.html'));
  verdict('legit: trusted click opens sidebar (frame created)', !!sidebar);
  verdict('sidebar iframe loaded from extension origin', !!sidebar && sidebar.url().startsWith('chrome-extension://' + extId));
  const ping = await T('sidebar-ping', sidebar.evaluate(() => chrome.runtime.sendMessage({ type: 'PING' })), 8000);
  verdict('sidebar ↔ background messaging alive', !!(ping && ping.pong), JSON.stringify(ping));
  await sidebar.evaluate(() => { window.__got = []; window.addEventListener('gpd-message', (e) => window.__got.push(e.detail.type)); });
  await sleep(1000);

  // Legit round trip: sidebar asks content for a scrape, content answers with the token
  await sidebar.evaluate(() => window.parent.postMessage({ type: 'GPD_REQUEST_SCRAPE' }, '*')); await sleep(1200);
  let got = await sidebar.evaluate(() => window.__got.slice());
  verdict('legit: content→sidebar reply accepted (token round trip)', got.includes('GPD_SCRAPE_RESULT'), 'gpd-message types: ' + got.join(','));

  // A2: page forges messages into the sidebar
  await sidebar.evaluate(() => { window.__got = []; });
  await harness('a2'); await sleep(1000);
  got = await sidebar.evaluate(() => window.__got.slice());
  const activeTab = await sidebar.evaluate(() => (document.querySelector('#tab-bar .tab.active') || { dataset: {} }).dataset.tab);
  const dropped = pageLogs.filter((l) => l.includes('Dropped unauthenticated frame message')).length;
  const a2r = await page.textContent('#a2r');
  // With the closed shadow root the page cannot even address the iframe; if it
  // somehow could, every forged message must be dropped by the token gate.
  const a2ok = got.length === 0 && activeTab !== 'settings' && (/unreachable/.test(a2r) || dropped >= 4);
  verdict('A2 forged postMessage into sidebar', a2ok, a2r + ' delivered=' + JSON.stringify(got) + ' droppedLogs=' + dropped);
  // Token gate still enforced for messages that reach the frame without the stamp
  await sidebar.evaluate(() => { window.__got = []; window.postMessage({ type: 'GPD_SWITCH_TAB', tab: 'settings' }, '*'); }); await sleep(500);
  got = await sidebar.evaluate(() => window.__got.slice());
  verdict('A2 unstamped message reaching the frame is not delivered', got.length === 0, 'delivered=' + JSON.stringify(got));

  // A4/A5: page-origin messages to the content script
  await harness('a4'); await sleep(1200);
  const a4 = await page.textContent('#a4r');
  verdict('A4/A5 page-origin messages to content script', a4.startsWith('BLOCKED'), a4);

  // Eavesdrop: page listens, sidebar copies
  await harness('ev');
  await sidebar.evaluate(() => { window.__got = []; window.copyToClipboard('SECRET-CLIP-' + Date.now()); }); await sleep(1200);
  const evlog = await page.textContent('#evlog');
  got = await sidebar.evaluate(() => window.__got.slice());
  verdict('eavesdrop: copied text hidden from page', !evlog.includes('SECRET-CLIP') && got.includes('GPD_CLIPBOARD_DONE'), 'page saw: ' + JSON.stringify(evlog.slice(0, 100)) + ' sidebar got: ' + got.join(','));

  // Router gate from the content-script world (executeScript runs in the tab's isolated world)
  const tabId = (await T('tok', sidebar.evaluate(() => chrome.runtime.sendMessage({ type: 'FRAME_TOKEN_GET' })), 8000)).tabId;
  const runInContentWorld = (msg) => T('cw:' + msg.type, sidebar.evaluate(async ({ tabId, msg }) => {
    const r = await chrome.scripting.executeScript({ target: { tabId }, func: async (m) => { try { return await chrome.runtime.sendMessage(m); } catch (e) { return { thrown: e.message }; } }, args: [msg] });
    return r[0].result;
  }, { tabId, msg }), 10000);
  const cfg = await runInContentWorld({ type: 'CONFIG_GET', payload: { key: 'api_keys' } });
  verdict('B1 router refuses CONFIG_GET from content zone', !!(cfg && cfg.error && /not permitted/.test(cfg.error)), JSON.stringify(cfg));
  const tabs = await runInContentWorld({ type: 'GET_OPEN_TABS' });
  verdict('B5 router refuses GET_OPEN_TABS from content zone', !!(tabs && tabs.error && /not permitted/.test(tabs.error)), JSON.stringify(tabs));
  const sync = await runInContentWorld({ type: 'CONFIG_SYNC_FROM_WEBHOOK', payload: { webhook_url: 'https://evil.example/x' } });
  verdict('B2 router refuses CONFIG_SYNC_FROM_WEBHOOK from content zone', !!(sync && sync.error && /not permitted/.test(sync.error)), JSON.stringify(sync));
  const clip = await runInContentWorld({ type: 'CLIPBOARD_LOAD' });
  verdict('router still serves CLIPBOARD_LOAD to content zone', !(clip && clip.error), JSON.stringify(clip).slice(0, 80) + ' (null = nothing stored yet)');
  const macro = await runInContentWorld({ type: 'MACRO_RUN', payload: { workflow: { steps: [{ type: 'navigate', url: PAGE_URL + '?pwned' }] } } });
  verdict('B6 inline workflow from content zone is discarded', !!macro && macro.ok === false && /No workflow|not found/i.test(macro.error || ''), JSON.stringify(macro));
  const uiCfg = await T('ui-cfg', sidebar.evaluate(() => chrome.runtime.sendMessage({ type: 'CONFIG_GET', payload: { key: 'ai_provider' } })), 8000);
  verdict('router serves CONFIG_GET to extension page', typeof uiCfg === 'string', JSON.stringify(uiCfg));
  const badSave = await T('bad-save', sidebar.evaluate(() => chrome.runtime.sendMessage({ type: 'CONFIG_SET', payload: { key: 'sheets', value: { webhook_url: 'http://evil.example/hook' } } })), 8000);
  verdict('B3 config write with plain-http webhook URL is refused', !!(badSave && badSave.error && /https/.test(badSave.error)), JSON.stringify(badSave));
  const goodSave = await T('good-save', sidebar.evaluate(() => chrome.runtime.sendMessage({ type: 'CONFIG_SET', payload: { key: 'sheets', value: { webhook_url: 'https://script.google.com/macros/s/AKf/exec' } } })), 8000);
  verdict('B3 config write with https Apps Script URL is accepted', !!(goodSave && !goodSave.error), JSON.stringify(goodSave).slice(0, 80));
  const crawl = await T('crawl', sidebar.evaluate(() => chrome.runtime.sendMessage({ type: 'CRAWL_TREE', payload: { url: 'http://169.254.169.254/latest/meta-data/', depth: 1 } })), 8000);
  verdict('B4 crawl of metadata endpoint is refused', !!(crawl && crawl.status === 'error' && /metadata/.test(crawl.error || '')), JSON.stringify(crawl));

  // Float frame: legit open + analyze round trip
  await sidebar.evaluate(() => window.parent.postMessage({ type: 'DANMAN_FLOAT_OPEN' }, '*')); await sleep(1800);
  const floatFrame = page.frames().find((f) => f.url().includes('danman-float.html'));
  verdict('legit: sidebar can open float', !!floatFrame);
  if (floatFrame) {
    await floatFrame.evaluate(() => window.parent.postMessage({ type: 'DANMAN_FLOAT_ANALYZE' }, '*')); await sleep(1200);
    const txt = await floatFrame.evaluate(() => Array.from(document.querySelectorAll('.msg')).map((m) => m.textContent).join(' | '));
    verdict('legit: float receives tokened DANMAN_PAGE_ANALYSIS', /Page: DANMAN hostile page harness/.test(txt), txt.slice(0, 80));
  }

  // Navigate the sidebar frame away and try to speak from it
  await harness('nav'); await sleep(2000);
  const navr = await page.textContent('#navr');
  verdict('navigated frame cannot drive content script', navr.startsWith('BLOCKED'), navr);

  // A3: an armed autofill session only injects on the origin it was armed for
  const pageOrigin = new URL(PAGE_URL).origin;
  const armSession = (origin) => sw.evaluate((o) => chrome.storage.local.set({ danman_autofill_session: {
    armed: true, target_origin: o, injection_mode: 'refresh', current_row: 1,
    column_mappings: { victim: 'Email' }, cached_headers: ['Email'], cached_sheet_data: [['Email'], ['leak@example.com']],
    field_progress: [], auto_submit_enabled: false, submit_selector: ''
  } }), origin);
  await armSession('https://crm.example');
  await page.reload(); await sleep(2000);
  let victim = await page.$eval('#victim', (el) => el.value);
  verdict('A3 session armed for another origin does not inject here', victim === '', 'victim=' + JSON.stringify(victim));
  await armSession(pageOrigin);
  await page.reload(); await sleep(2500);
  victim = await page.$eval('#victim', (el) => el.value);
  verdict('A3 session armed for this origin still injects', victim === 'leak@example.com', 'victim=' + JSON.stringify(victim));
  await sw.evaluate(() => chrome.storage.local.remove('danman_autofill_session'));

  // E1 mitigation: per-site kill switch keeps the content scripts inert
  await sw.evaluate((o) => chrome.storage.local.set({ gpd_disabled_sites: [o] }), pageOrigin);
  const logMark = pageLogs.length;
  await page.reload(); await sleep(2000);
  const hostWhileDisabled = await page.evaluate(() => !!document.querySelector('[data-danman]'));
  const logsAfter = pageLogs.slice(logMark);
  const clipInit = logsAfter.some((l) => /Clipboard listener .* initialized/.test(l));
  const disabledLog = logsAfter.some((l) => /Disabled on this site/.test(l));
  verdict('per-site disable: no DANMAN UI or clipboard listener on a disabled origin', hostWhileDisabled === false && !clipInit && disabledLog, 'host=' + hostWhileDisabled + ' clipInit=' + clipInit + ' disabledLog=' + disabledLog);
  await sw.evaluate(() => chrome.storage.local.remove('gpd_disabled_sites'));

  const swErrors = swLogs.filter((l) => /\[sw:error\]/.test(l) && !/Unknown message type|API key|not configured|Refused/i.test(l));
  const pageErrors = pageLogs.filter((l) => /^\[pageerror\]|^\[error\]/.test(l) && !/Unknown message type|Receiving end|Extension context|net::ERR|Failed to load resource|Macro|DANMAN_CHAT|API key|clipboard|Popout/i.test(l));
  verdict('no unexpected service-worker errors', swErrors.length === 0, swErrors.slice(0, 3).join(' || '));
  verdict('no unexpected page/frame errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' || '));
  const notFn = pageLogs.filter((l) => /is not a function/.test(l));
  verdict('no "is not a function" warnings from sidebar tabs', notFn.length === 0, notFn.slice(0, 2).join(' || '));
}

function report(code) {
  console.log('\nRESULTS');
  for (const [n, s, note] of results) console.log(s.padEnd(5), n.padEnd(62), note ? '— ' + note.slice(0, 140) : '');
  if (code !== 0) {
    console.log('\n--- sw log (last 20) ---\n' + swLogs.slice(-20).join('\n'));
    console.log('\n--- page log (last 30) ---\n' + pageLogs.filter((l) => !/Failed to load resource/.test(l)).slice(-30).join('\n'));
  }
  Promise.resolve(ctx && ctx.close()).catch(() => {}).then(() => {
    try { server && server.close(); } catch (_) {}
    try { fs.rmSync(WORK, { recursive: true, force: true }); } catch (_) {}
    process.exit(code);
  });
}
main().then(() => report(results.some((r) => r[1] === 'FAIL') ? 1 : 0))
  .catch((e) => { console.error('STEP FAILED:', e.message); report(2); });
setTimeout(() => { console.error('WATCHDOG'); report(3); }, 170000);
