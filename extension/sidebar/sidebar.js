/**
 * VERSION: V003R006
 * DATE: 2026-09-15
 * CHANGE: Expose DANMAN_hostTabId for tabs that need the host page (forms-tab origin stamp)
 * HISTORY:
 *   V002R071 2026-09-15 Frame-token gate for parent messages (queued until token arrives); copyToClipboard over tabs.sendMessage
 *   V001R249 2026-08-26 Baseline import + Firefox messaging/clipboard fixes (unstamped)
 */
// sidebar/sidebar.js — Tab Controller & Message Bridge
(function() {
  'use strict';

  // Header version — stamped from core/app-version.js instead of hard-coding.
  // Also re-stamped on DOMContentLoaded in case a loader defers scripts.
  function stampVersion() {
    const el = document.getElementById('app-version-label');
    if (el && typeof GPD_APP_VERSION !== 'undefined') el.textContent = 'v' + GPD_APP_VERSION;
  }
  stampVersion();
  document.addEventListener('DOMContentLoaded', stampVersion);

  // Tab switching
  const tabs = document.querySelectorAll('#tab-bar .tab');
  const contents = document.querySelectorAll('.tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  function switchTab(tabName) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
    contents.forEach(c => c.classList.toggle('active', c.id === `tab-${tabName}`));
    // CellsForce is a full embedded app — load its iframe on first visit only
    if (tabName === 'cellsforce') {
      const frame = document.getElementById('cellsforce-frame');
      if (frame && !frame.src) frame.src = frame.dataset.src;
    }
    // Notify tab that it became active
    window.dispatchEvent(new CustomEvent('tab-activated', { detail: { tab: tabName } }));
  }

  // Header buttons
  document.getElementById('btn-close')?.addEventListener('click', () => {
    window.parent.postMessage({ type: 'GPD_CLOSE_SIDEBAR' }, '*');
  });
  document.getElementById('btn-minimize')?.addEventListener('click', () => {
    window.parent.postMessage({ type: 'GPD_MINIMIZE_SIDEBAR' }, '*');
  });

  // ── Frame trust ────────────────────────────────────────────────────
  // This iframe sits inside a web page, and page JS can postMessage into it
  // exactly like the content script does (they share the parent window). The
  // content script stamps every message with a per-tab token both sides fetch
  // from the background over runtime messaging — the page cannot see that
  // channel — and only stamped messages from the parent are delivered here.
  // Every tab listens on the 'gpd-message' event this dispatches; nothing
  // should read window 'message' events directly.
  let frameToken = null;
  let hostTabId = null;
  const pendingFrameEvents = []; // messages that arrived before the token did

  function deliverFrameMessage(msg) {
    // Dispatch to appropriate tab handler
    window.dispatchEvent(new CustomEvent('gpd-message', { detail: msg }));

    // Handle tab switching requests
    if (msg.type === 'GPD_SWITCH_TAB') {
      switchTab(msg.tab);
    }
  }

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (!msg || !msg.type) return;
    if (event.source !== window.parent) return;
    if (!frameToken) {
      if (pendingFrameEvents.length < 100) pendingFrameEvents.push(msg);
      return;
    }
    if (msg.__t !== frameToken) {
      console.debug('[DANMAN] Dropped unauthenticated frame message:', msg.type);
      return;
    }
    deliverFrameMessage(msg);
  });

  (function fetchFrameToken(attempt) {
    const B = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;
    let p;
    try { p = B.runtime.sendMessage({ type: 'FRAME_TOKEN_GET' }); } catch (err) { p = Promise.reject(err); }
    Promise.resolve(p).then((r) => {
      if (!r || !r.token) throw new Error('no frame token');
      frameToken = r.token;
      hostTabId = typeof r.tabId === 'number' ? r.tabId : null;
      window.DANMAN_hostTabId = hostTabId; // tabs read it (forms-tab stamps the autofill origin)
      const queued = pendingFrameEvents.splice(0);
      queued.forEach((m) => { if (m.__t === frameToken) deliverFrameMessage(m); });
    }).catch(() => {
      if (attempt < 5) setTimeout(() => fetchFrameToken(attempt + 1), 400 * (attempt + 1));
      else console.warn('[DANMAN] Frame token unavailable — content-script messages will be ignored');
    });
  })(0);

  function isBackgroundConnectionError(err) {
    const m = (err && err.message) ? err.message : String(err || '');
    return /establish connection|Receiving end does not exist|message port closed|not receiving/i.test(m);
  }

  /** True when this page runs inside the extension (runtime API present). */
  function extensionRuntime() {
    if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.id) return browser;
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) return chrome;
    return null;
  }

  /** Port wake — more reliable than lone sendMessage when Firefox background is asleep. */
  function wakeBackgroundViaPort() {
    const B = extensionRuntime();
    if (!B || !B.runtime.connect) return Promise.resolve(false);
    return new Promise((resolve) => {
      let settled = false;
      function done(ok) {
        if (settled) return;
        settled = true;
        resolve(ok);
      }
      try {
        const port = B.runtime.connect({ name: 'danman-options-wake' });
        port.onMessage.addListener(() => done(true));
        port.onDisconnect.addListener(() => done(true));
        port.postMessage({ type: 'PING' });
        setTimeout(() => {
          try { port.disconnect(); } catch (_) {}
          done(true);
        }, 1500);
      } catch (_) {
        done(false);
      }
    });
  }

  function runtimeSendMessage(msg) {
    const B = extensionRuntime();
    if (!B) {
      return Promise.reject(new Error(
        'This page is not running inside the extension — open the sidebar from the DANMAN toolbar button (or reload the add-on via about:debugging).'
      ));
    }
    // Tag failures with the message type. "Could not establish connection.
    // Receiving end does not exist." on its own says nothing about which
    // request died; with the type attached, the console line names it.
    const tag = (e) => {
      const text = (e && e.message) ? e.message : String(e || '');
      const err = new Error(`${msg && msg.type ? msg.type : 'message'}: ${text}`);
      err.cause = e;
      return err;
    };
    return new Promise((resolve, reject) => {
      try {
        const maybe = B.runtime.sendMessage(msg);
        if (maybe && typeof maybe.then === 'function') {
          maybe.then(resolve, (e) => reject(tag(e)));
          return;
        }
      } catch (_) {}
      try {
        B.runtime.sendMessage(msg, (resp) => {
          const err = B.runtime.lastError;
          if (err) return reject(tag(err));
          resolve(resp);
        });
      } catch (e) {
        reject(tag(e));
      }
    });
  }

  // Safety net. Messaging failures whose receiver simply is not open are
  // expected and non-actionable, but an unhandled rejection for one is
  // reported by Firefox as an "ExtensionError: Could not establish connection.
  // Receiving end does not exist." with no hint of where it came from, which
  // buries the errors that do matter. Keep them at debug level; everything
  // else still surfaces normally.
  window.addEventListener('unhandledrejection', (event) => {
    if (!isBackgroundConnectionError(event.reason)) return;
    event.preventDefault();
    console.debug('[DANMAN] background not reachable for a fire-and-forget send:',
      (event.reason && event.reason.message) || event.reason);
  });

  // Helper: send message to background (port wake + retry for Firefox event background)
  window.sendToBackground = async function(type, payload = {}) {
    const msg = { type, payload };
    const maxAttempts = 8;
    let lastErr;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (attempt > 1) await new Promise((r) => setTimeout(r, 350 * attempt));
      if (attempt <= 3) await wakeBackgroundViaPort();
      try {
        const resp = await runtimeSendMessage(msg);
        if (resp && resp.error && !resp.ok) throw new Error(resp.error);
        return resp;
      } catch (e) {
        lastErr = e;
        if (!isBackgroundConnectionError(e) || attempt >= maxAttempts) {
          throw isBackgroundConnectionError(e) ? unreachable(type, e, maxAttempts) : e;
        }
      }
    }
    throw unreachable(type, lastErr, maxAttempts);
  };

  /** Actionable message for the "background never answered" case. */
  function unreachable(type, cause, attempts) {
    const err = new Error(
      `DANMAN's background script did not answer "${type}" after ${attempts} attempts. ` +
      'Reload the extension (about:debugging → This Firefox → Reload, or chrome://extensions → Reload) and try again.'
    );
    err.cause = cause;
    return err;
  }

  window.wakeBackgroundViaPort = wakeBackgroundViaPort;

  // ── UI customization (config.ui: accent_color / density / start_tab) ──
  // Users can retheme freely from Settings → UI Customization; defaults
  // restore the shipped look. Overrides are one injected <style> block so
  // the base stylesheet stays untouched.
  const UI_DEFAULTS = { accent_color: '#38bdf8', density: 'comfortable', start_tab: 'clipboard' };

  window.GPD_applyUiPrefs = function (ui) {
    ui = { ...UI_DEFAULTS, ...(ui || {}) };
    let styleEl = document.getElementById('gpd-theme-overrides');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'gpd-theme-overrides';
      document.head.appendChild(styleEl);
    }
    const a = /^#[0-9a-fA-F]{3,8}$/.test(ui.accent_color) ? ui.accent_color : UI_DEFAULTS.accent_color;
    let css = '';
    if (a.toLowerCase() !== UI_DEFAULTS.accent_color) {
      css += `
        #tab-bar .tab.active { color: ${a}; border-bottom-color: ${a}; }
        .logo, .text-cyan, .stat-box .value, .btn-secondary { color: ${a}; }
        .btn-primary, .danman-send-btn, .toggle input:checked + .slider { background: ${a}; }
        .input:focus, input:focus, textarea:focus, select:focus { border-color: ${a}; }
        .result-item:hover { border-color: ${a}; }
      `;
    }
    if (ui.density === 'compact') {
      css += `
        body { font-size: 12px; }
        .tab-content { padding: 8px; }
        .card { padding: 8px; margin-bottom: 8px; }
        .btn { padding: 5px 10px; font-size: 12px; }
        #tab-bar .tab { padding: 4px 2px; }
        .form-group { margin-bottom: 8px; }
      `;
    }
    styleEl.textContent = css;
  };

  // Wake background when sidebar loads, then apply saved UI prefs
  wakeBackgroundViaPort()
    .then(() => window.sendToBackground('PING', {}))
    .then(() => window.sendToBackground('CONFIG_LOAD', {}))
    .then((cfg) => {
      const ui = (cfg && cfg.ui) || {};
      window.GPD_applyUiPrefs(ui);
      const startTab = ui.start_tab || UI_DEFAULTS.start_tab;
      if (startTab !== 'clipboard' && document.querySelector(`#tab-bar .tab[data-tab="${startTab}"]`)) {
        switchTab(startTab);
      }
    })
    .catch(() => {});

  // Helper: send message to content script (parent frame)
  window.sendToContent = function(type, payload = {}) {
    window.parent.postMessage({ type, ...payload }, '*');
  };

  // Helper: copy text to clipboard via content script. Goes over runtime
  // messaging so the host page cannot read what is being copied; falls back
  // to the parent postMessage route only when the tab id is unknown.
  window.copyToClipboard = function(text) {
    const B = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;
    if (hostTabId === null || !B.tabs || !B.tabs.sendMessage) {
      window.parent.postMessage({ type: 'GPD_COPY_TO_CLIPBOARD', text }, '*');
      return;
    }
    let p;
    try { p = B.tabs.sendMessage(hostTabId, { type: 'GPD_COPY_TO_CLIPBOARD', text }); } catch (err) { p = Promise.reject(err); }
    Promise.resolve(p).then((r) => {
      deliverFrameMessage(Object.assign({ type: 'GPD_CLIPBOARD_DONE' }, r || { success: false, error: 'No response' }));
    }).catch((err) => {
      deliverFrameMessage({ type: 'GPD_CLIPBOARD_DONE', success: false, error: (err && err.message) || String(err) });
    });
  };

  // Macro Studio events → sidebar tabs (Execute live log)
  try {
    chrome.runtime.onMessage.addListener(function (req) {
      if (req && req.type === 'macro_event' && req.event) {
        window.dispatchEvent(new CustomEvent('dms:macro-event', { detail: req.event }));
      }
    });
  } catch (e) {}

  console.log('[DANMAN Sidebar] Initialized');
})();
