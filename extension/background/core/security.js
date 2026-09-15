/**
 * VERSION: V001R220
 * DATE: 2026-09-15
 * CHANGE: Initial creation — trust zones, frame tokens, URL policy for the background
 * HISTORY:
 *   V001R220 2026-09-15 Initial creation
 */
// background/core/security.js — trust-zone classification, frame tokens,
// and URL policy for the DANMAN background.
//
// Every message reaching chrome.runtime.onMessage comes from one of two
// zones: an extension page (sidebar/popout/options/popup — full trust) or a
// content script (runs in a hostile web page's tab — limited trust). The
// router uses senderZone() + CONTENT_ALLOWED_TYPES to keep content scripts
// on the small set of messages they actually send, so a page that manages
// to drive the content script cannot reach config, secrets, Drive, macros
// with inline workflows, or cross-tab reads.

/* global chrome */
const DANMAN_Security = (() => {
  'use strict';

  const EXT_ORIGIN = (() => {
    // String-derived: URL.origin is 'null' for non-special schemes in some engines.
    try { return String(chrome.runtime.getURL('')).replace(/\/+$/, ''); } catch (_) { return ''; }
  })();

  /** Message types content scripts legitimately send to the background.
   *  Enumerated from content/*.js — extend this list when a content script
   *  gains a new send, otherwise the router refuses it with a console warning. */
  const CONTENT_ALLOWED_TYPES = new Set([
    // content-main.js
    'SCRAPE_RESULT', 'LINKS_RESULT', 'FORMS_RESULT',
    'DANMAN_POPOUT_OPEN',
    'CLIPBOARD_LOAD', 'CLIPBOARD_FORCE_POLL', 'CLIPBOARD_PASTE_TO_PAGE', 'CLIPBOARD_EVENT_LOG',
    'MACRO_RUN', 'MACRO_PAUSE', 'CONTEXT_MACRO_RECORD_PICK',
    'LOG_ACTION',
    'FRAME_TOKEN_GET',
    // clipboard-listener.js
    'CLIPBOARD_GET_NUMPAD_MODE', 'CLIPBOARD_NEW_CAPTURE', 'CLIPBOARD_HOTKEY_PRESSED',
    // dms-recorder.js / element-picker.js broadcasts (consumed by sidebar pages;
    // the router answers "unknown type" as before)
    'dms_recording_step', 'dms_recording_step_update', 'dms_recording_paused', 'dms_recording_finished',
    'dms_picker_picked', 'dms_screen_pick_move', 'dms_screen_picked', 'SCREEN_PICK_CANCELLED'
  ]);

  /** 'ui' for extension pages, 'content' for content scripts. Web pages
   *  cannot reach onMessage at all (no externally_connectable), so anything
   *  without a tab is an extension page. */
  function senderZone(sender) {
    if (!sender) return 'content';
    const url = String(sender.url || '');
    if (EXT_ORIGIN && url.indexOf(EXT_ORIGIN + '/') === 0) return 'ui';
    if (sender.tab) return 'content';
    return 'ui';
  }

  /** Returns null when the message may proceed, else an error string. */
  function routerPolicy(type, sender) {
    if (senderZone(sender) === 'ui') return null;
    if (CONTENT_ALLOWED_TYPES.has(type)) return null;
    return 'Message type ' + type + ' is not permitted from a content script';
  }

  // ── Frame token ─────────────────────────────────────────────────────
  // The sidebar/float iframes and the content script share a web page's
  // window, so postMessage alone cannot tell the content script apart from
  // the page. Both sides fetch a per-tab token over runtime messaging
  // (which the page cannot observe) and the frames only accept postMessages
  // carrying it. Derived from a per-install secret so it survives background
  // restarts without any session state.
  let installSecretPromise = null;
  function getInstallSecret() {
    if (!installSecretPromise) {
      installSecretPromise = new Promise((resolve) => {
        chrome.storage.local.get('gpd_frame_secret', (r) => {
          const existing = r && typeof r.gpd_frame_secret === 'string' && r.gpd_frame_secret.length >= 32
            ? r.gpd_frame_secret : '';
          if (existing) return resolve(existing);
          const bytes = new Uint8Array(32);
          crypto.getRandomValues(bytes);
          const secret = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
          chrome.storage.local.set({ gpd_frame_secret: secret }, () => resolve(secret));
        });
      }).catch(() => {
        const bytes = new Uint8Array(32);
        crypto.getRandomValues(bytes);
        return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      });
    }
    return installSecretPromise;
  }

  async function frameTokenForTab(tabId) {
    const secret = await getInstallSecret();
    const data = new TextEncoder().encode(secret + ':' + String(tabId));
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  }

  /** FRAME_TOKEN_GET handler — only senders that live in a tab get a token. */
  async function handleFrameTokenGet(sender) {
    const tabId = sender && sender.tab && sender.tab.id;
    if (typeof tabId !== 'number') return { error: 'No tab for frame token' };
    return { token: await frameTokenForTab(tabId), tabId };
  }

  // ── URL policy ─────────────────────────────────────────────────────
  function parseIPv4(host) {
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
    if (!m) return null;
    const p = m.slice(1).map(Number);
    return p.every((n) => n <= 255) ? p : null;
  }

  /** Classifies a hostname: 'loopback' | 'linklocal' | 'metadata' | 'private' | 'public'. */
  function hostClass(hostname) {
    const h = String(hostname || '').toLowerCase().replace(/\.$/, '');
    if (!h) return 'loopback';
    if (h === 'localhost' || h.endsWith('.localhost')) return 'loopback';
    if (h === 'metadata.google.internal' || h === 'metadata' || h.endsWith('.internal')) return 'metadata';
    if (h === '[::1]' || h === '::1') return 'loopback';
    if (h.startsWith('[')) {
      const v6 = h.slice(1, -1);
      if (v6 === '::1' || v6 === '::') return 'loopback';
      if (/^fe[89ab]/.test(v6)) return 'linklocal';
      if (/^f[cd]/.test(v6)) return 'private';
      if (v6.startsWith('::ffff:')) return hostClass(v6.slice(7));
      return 'public';
    }
    const v4 = parseIPv4(h);
    if (v4) {
      const [a, b] = v4;
      if (a === 127 || a === 0) return 'loopback';
      if (a === 169 && b === 254) return 'metadata'; // 169.254.169.254 + link-local
      if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return 'private';
      return 'public';
    }
    if (h.endsWith('.local') || h.endsWith('.home') || h.endsWith('.lan') || h.indexOf('.') === -1) return 'private';
    return 'public';
  }

  /**
   * Background fetch policy for crawl / rip targets.
   * Loopback, link-local and cloud-metadata hosts are always refused. RFC1918
   * and single-label intranet hosts are refused only when the user enables
   * scraping.block_private_network (default off so intranet crawls keep working).
   */
  function checkFetchTarget(url, opts) {
    let u;
    try { u = new URL(String(url)); } catch (_) { return { ok: false, reason: 'invalid URL' }; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, reason: 'scheme ' + u.protocol + ' not allowed' };
    if (u.username || u.password) return { ok: false, reason: 'credentials in URL' };
    const cls = hostClass(u.hostname);
    if (cls === 'loopback' || cls === 'linklocal' || cls === 'metadata') return { ok: false, reason: cls + ' host blocked' };
    if (cls === 'private' && opts && opts.blockPrivate) return { ok: false, reason: 'private-network host blocked by setting' };
    return { ok: true, url: u.toString() };
  }

  /**
   * Webhook / bridge endpoint policy: https only (plain http tolerated for
   * loopback dev endpoints), no embedded credentials, no metadata hosts.
   * Returns the normalized URL string or throws.
   */
  function assertWebhookUrl(url, label) {
    const name = label || 'Webhook URL';
    let u;
    try { u = new URL(String(url || '').trim()); } catch (_) { throw new Error(name + ' is not a valid URL'); }
    if (u.username || u.password) throw new Error(name + ' must not contain credentials');
    const cls = hostClass(u.hostname);
    if (cls === 'metadata' || cls === 'linklocal') throw new Error(name + ' points at a blocked host');
    if (u.protocol === 'https:') return u.toString();
    if (u.protocol === 'http:' && cls === 'loopback') return u.toString();
    throw new Error(name + ' must use https://');
  }

  /** True when the URL is empty or passes assertWebhookUrl (for config writes). */
  function webhookUrlProblem(url, label) {
    if (!url) return null;
    try { assertWebhookUrl(url, label); return null; } catch (e) { return e.message; }
  }

  /**
   * After a redirect-following fetch, confirm the final host is the one we
   * asked for. Apps Script answers POSTs with a 302 to script.googleusercontent.com,
   * which is the one cross-host hop we accept.
   */
  function assertResponseHost(resp, requestUrl) {
    if (!resp || !resp.url) return;
    let from, to;
    try { from = new URL(requestUrl); to = new URL(resp.url); } catch (_) { return; }
    if (from.host === to.host) return;
    if (from.hostname === 'script.google.com' && /(^|\.)googleusercontent\.com$/.test(to.hostname)) return;
    throw new Error('Webhook redirected to an unexpected host: ' + to.host);
  }

  /** Salesforce REST calls only go to Salesforce-owned domains. */
  function isSalesforceInstanceUrl(url) {
    try {
      const u = new URL(String(url || ''));
      if (u.protocol !== 'https:') return false;
      return /(^|\.)(salesforce\.com|force\.com|salesforce-sites\.com|site\.com)$/.test(u.hostname);
    } catch (_) { return false; }
  }

  return {
    EXT_ORIGIN,
    CONTENT_ALLOWED_TYPES,
    senderZone,
    routerPolicy,
    handleFrameTokenGet,
    frameTokenForTab,
    hostClass,
    checkFetchTarget,
    assertWebhookUrl,
    webhookUrlProblem,
    assertResponseHost,
    isSalesforceInstanceUrl
  };
})();
