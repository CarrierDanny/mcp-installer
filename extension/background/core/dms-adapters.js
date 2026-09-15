// core/dms-adapters.js — v5 shims for v6.7 engine dependencies.
//
// v6.7's ocr-engine.js + macro-engine.js call into DMS_Config, DMS_Logger, and
// DMS_WindowBinder. Rather than porting all three full modules, we expose a
// minimal surface that bridges to v5's existing primitives.
//
// DMS_Config.load() -> v5 `config` storage key (NOT v6.7 `dms_config`). This is
// the single biggest fix vs. the broken v6.7 chat path: there is ONE schema.
//
// DMS_Logger.{info,warn,error}() -> console + audit_log push so failures show up
// in the existing Settings tab Logs feed (per CLAUDE.md "no silent drops").
//
// DMS_WindowBinder.getActiveOrBoundTab() -> just returns the active tab. v5 has
// no focus-lock feature; macros run on the active tab.

// Route through v5's Browser.storage / Browser.tabs polyfill when available so
// Firefox-strict environments use browser.* instead of chrome.*. Fall back to
// a chrome.storage-backed Promise wrapper for cases where browser.js hasn't
// loaded yet (e.g. very early service-worker boot).
const _store = (typeof Browser !== 'undefined' && Browser.storage && Browser.storage.get)
  ? Browser.storage
  : {
      get: (k) => new Promise((resolve) => {
        try { chrome.storage.local.get(k, (r) => resolve(r || {})); }
        catch (_) { resolve({}); }
      }),
      set: (o) => new Promise((resolve) => {
        try { chrome.storage.local.set(o, () => resolve()); }
        catch (_) { resolve(); }
      })
    };

const _tabsApi = (typeof Browser !== 'undefined' && Browser.tabs && Browser.tabs.query)
  ? Browser.tabs
  : {
      query: (opts) => new Promise((resolve) => {
        try { chrome.tabs.query(opts, (tabs) => resolve(tabs || [])); }
        catch (_) { resolve([]); }
      })
    };

const DMS_EXEC_DEFAULTS = {
  speedMs: 500,
  debugMode: false,
  stopOnError: true,
  highlightSelectors: true,
  animateMouse: true,
  maxStepRetries: 0,
  captureScreenshots: false
};

const DMS_BIND_DEFAULTS = {
  mode: 'global',
  boundTabId: null,
  boundWindowId: null,
  enforceFocus: false,
  stopOnClose: true,
  snapDebounceMs: 300,
  onNavigate: 'continue',
  onTabClose: 'stop',
  onWindowBlur: 'pause'
};

function _mergeSection(defaults, cfg, nested, key) {
  return Object.assign({}, defaults, (nested && nested[key]) || {}, (cfg && cfg[key]) || {});
}

const DMS_Config = {
  async load() {
    let cfg = {};
    try {
      const r = await _store.get('config');
      cfg = (r && r.config) || {};
    } catch (_) { cfg = {}; }
    const nested = cfg.config || {};
    const ai_models = cfg.ai_models || {};
    const provider = cfg.ai_provider || 'claude';
    return {
      ai: {
        anthropicKey: (cfg.api_keys && cfg.api_keys.claude) || '',
        openaiKey:    (cfg.api_keys && cfg.api_keys.openai) || '',
        geminiKey:    (cfg.api_keys && cfg.api_keys.gemini) || '',
        firecrawlKey: (cfg.api_keys && cfg.api_keys.firecrawl) || '',
        defaultModel: ai_models[provider] || '',
        mode: 'direct'
      },
      sheets: { enabled: !!(cfg.sheets && cfg.sheets.spreadsheet_id) },
      exec: _mergeSection(DMS_EXEC_DEFAULTS, cfg, nested, 'exec'),
      bind: _mergeSection(DMS_BIND_DEFAULTS, cfg, nested, 'bind'),
      _raw: cfg
    };
  }
};

// Serialize all audit_log writes through a single promise chain. Without this,
// fast-burst _log() calls (Phase 7 macro engine will emit several per step at
// sub-100ms cadence) race on get→modify→set and drop entries. The queue must
// NEVER throw or reject — a failing logger crashing the engine is far worse
// than a missed audit entry.
let _logQueue = Promise.resolve();
function _appendToAuditLog(entry) {
  _logQueue = _logQueue.then(() => new Promise((resolve) => {
    try {
      _store.get('audit_log').then((r) => {
        try {
          const arr = (r && r.audit_log) || [];
          arr.push(entry);
          while (arr.length > 500) arr.shift();
          _store.set({ audit_log: arr }).then(resolve, resolve);
        } catch (_) { resolve(); }
      }, resolve);
    } catch (_) { resolve(); }
  }));
  return _logQueue;
}

function _log(level, msg) {
  const line = '[' + new Date().toISOString() + '] [' + level + '] ' + String(msg);
  // eslint-disable-next-line no-console
  console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](line);
  try {
    _appendToAuditLog({ ts: new Date().toISOString(), level, msg: String(msg) });
  } catch (_) { /* swallow — logger must never throw */ }
}

const DMS_Logger = {
  info(msg)  { _log('info', msg); },
  warn(msg)  { _log('warn', msg); },
  error(msg) { _log('error', msg); }
};

const DMS_WindowBinder = {
  async getActiveOrBoundTab() {
    try {
      const tabs = await _tabsApi.query({ active: true, currentWindow: true });
      return tabs && tabs[0] ? tabs[0] : null;
    } catch (_) {
      return null;
    }
  }
};

if (typeof self !== 'undefined') {
  self.DMS_Config = DMS_Config;
  self.DMS_Logger = DMS_Logger;
  self.DMS_WindowBinder = DMS_WindowBinder;
}

// ---------------------------------------------------------------------------
// DMS_Browser — cross-browser tab/windows shim expected by macro-engine.js.
// v46 background/core/browser.js exports `Browser` (v5 naming). macro-engine
// (ported from DANMAN_Macro_Studio) calls `DMS_Browser.*`, so we build the
// alias here with the full surface macro-engine needs.
// ---------------------------------------------------------------------------
const DMS_Browser = (function () {
  const _B = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;
  const isFirefox = (typeof browser !== 'undefined' && !!browser.runtime);

  function _p(fn, ctx) {
    return function () {
      const args = Array.prototype.slice.call(arguments);
      try {
        const r = fn.apply(ctx, args);
        if (r && typeof r.then === 'function') return r;
      } catch (e) { /* fall through */ }
      return new Promise(function (resolve, reject) {
        try {
          fn.apply(ctx, args.concat([function (result) {
            const err = _B.runtime && _B.runtime.lastError;
            if (err) reject(new Error(err.message || String(err)));
            else resolve(result);
          }]));
        } catch (e2) { reject(e2); }
      });
    };
  }

  const tabs = {
    query:       _p(_B.tabs.query, _B.tabs),
    get:         _p(_B.tabs.get, _B.tabs),
    update:      _p(_B.tabs.update, _B.tabs),
    remove:      _p(_B.tabs.remove, _B.tabs),
    sendMessage: _p(_B.tabs.sendMessage, _B.tabs),
    // Must go through _p: on Firefox `browser.tabs.captureVisibleTab` returns a
    // Promise and takes no callback, so the hand-rolled callback version here
    // never settled and every capture hung. _p tries the Promise form first and
    // only falls back to callbacks.
    captureVisibleTab: function (windowId, opts) {
      return _p(_B.tabs.captureVisibleTab, _B.tabs)(windowId, opts || {});
    },
    executeScript: (_B.scripting && _B.scripting.executeScript)
      ? _p(_B.scripting.executeScript, _B.scripting)
      : null
  };

  // Firefox native promise override
  if (isFirefox) {
    tabs.query       = (opts) => _B.tabs.query(opts);
    tabs.get         = (id) => _B.tabs.get(id);
    tabs.update      = (id, props) => _B.tabs.update(id, props);
    tabs.sendMessage = (id, msg) => _B.tabs.sendMessage(id, msg);
  }

  const windows = {
    get:          _p(_B.windows.get, _B.windows),
    getAll:       _p(_B.windows.getAll, _B.windows),
    getCurrent:   _p(_B.windows.getCurrent, _B.windows),
    getLastFocused: _p(_B.windows.getLastFocused, _B.windows),
    update:       _p(_B.windows.update, _B.windows)
  };

  return { isFirefox, tabs, windows, root: _B };
})();

if (typeof self !== 'undefined') self.DMS_Browser = DMS_Browser;
