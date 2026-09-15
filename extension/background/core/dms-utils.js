// core/dms-utils.js — Ported verbatim from DANMAN_Macro_Studio/background/core/utils.js
// Dependency of ocr-engine.js + macro-engine.js (DMS_Utils.{clone, uuid, nowISO, sleep,
// resolvePlaceholders, withTimeout, ...}).
// background/core/utils.js — DANMAN Macro Studio
// Cross-script utility helpers (loaded first in background script chain)
// File: DANMAN_Macro_StudioV001r000

const DMS_Utils = {
  uuid() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : ((r & 0x3) | 0x8);
      return v.toString(16);
    });
  },

  nowISO() { return new Date().toISOString(); },

  sleep(ms) { return new Promise(r => setTimeout(r, ms)); },

  // Deep clone via JSON (safe for our serializable workflow shapes)
  clone(obj) {
    try { return JSON.parse(JSON.stringify(obj)); } catch (e) { return obj; }
  },

  // Safe stringify (handles cycles / errors)
  safeStringify(obj, space = 2) {
    const seen = new WeakSet();
    try {
      return JSON.stringify(obj, (k, v) => {
        if (typeof v === 'object' && v !== null) {
          if (seen.has(v)) return '[Circular]';
          seen.add(v);
        }
        if (v instanceof Error) return { name: v.name, message: v.message, stack: v.stack };
        return v;
      }, space);
    } catch (e) {
      return String(obj);
    }
  },

  // Promise with timeout (rejects if base promise takes too long)
  withTimeout(promise, ms, message = 'Timeout') {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(message + ' (' + ms + 'ms)')), ms);
      promise.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
    });
  },

  // Debounce
  debounce(fn, ms = 250) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(null, args), ms);
    };
  },

  // Throttle
  throttle(fn, ms = 250) {
    let last = 0, queued = null;
    return (...args) => {
      const now = Date.now();
      if (now - last >= ms) {
        last = now;
        fn.apply(null, args);
      } else {
        clearTimeout(queued);
        queued = setTimeout(() => { last = Date.now(); fn.apply(null, args); }, ms - (now - last));
      }
    };
  },

  // CSV row escape (RFC 4180 style)
  csvEscape(v) {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  },

  // Truncate a string with ellipsis
  truncate(s, n = 80) {
    if (!s) return '';
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  },

  // Resolve {variable} placeholders against a context dictionary
  resolvePlaceholders(text, ctx) {
    if (!text || typeof text !== 'string') return text;
    return text.replace(/\{(\w+)\}/g, (m, key) => (ctx && key in ctx) ? String(ctx[key]) : m);
  },

  isUrl(s) {
    try { new URL(s); return true; } catch (e) { return false; }
  },

  /** Normalize editor/legacy step fields to macro-engine shape (does not mutate storage on load). */
  normalizeMacroStep(step) {
    if (!step || !step.type) return step;
    const s = this.clone(step);
    if (s.type === 'type') {
      if (s.text == null && s.value != null) s.text = s.value;
      delete s.value;
      if (s.clear == null) s.clear = true;
    }
    if (s.type === 'wait') {
      if (!s.waitType) {
        s.waitType = 'time';
        s.value = s.ms != null ? String(s.ms) : (s.value != null ? String(s.value) : '1000');
      }
      delete s.ms;
    }
    if (s.type === 'extract') {
      if (s.variable == null && s.name != null) s.variable = s.name;
      delete s.name;
      if (!s.extractType) s.extractType = 'text';
    }
    if (s.type === 'navigate' && s.value == null && s.url != null) s.value = s.url;
    if (s.type === 'upload') {
      if (s.filePath == null && s.value != null) s.filePath = s.value;
      delete s.value;
    }
    if (s.type === 'keypress' && s.key == null && s.value != null) s.key = s.value;
    if (s.type === 'click') {
      if (!s.button) s.button = 'left';
      if (s.pauseOnMissing == null) s.pauseOnMissing = true;
    }
    if (s.type === 'screenClick') {
      if (!s.screenAction) s.screenAction = 'click';
      if (!s.button) s.button = 'left';
      if (s.scrollLines == null) s.scrollLines = 3;
      if (s.waitMs == null) s.waitMs = 1000;
      if (!s.coordMode) s.coordMode = 'precise';
    }
    if (s.type === 'mouseMove' && !s.coordMode) s.coordMode = 'precise';
    if (s.type === 'switchTab' && !s.tabMatch) s.tabMatch = 'title';
    return s;
  },

  normalizeMacroWorkflow(workflow) {
    const w = workflow || {};
    return {
      ...w,
      steps: (w.steps || []).map((st) => this.normalizeMacroStep(st))
    };
  }
};

// Expose for both service-worker globals and event scripts
if (typeof self !== 'undefined') self.DMS_Utils = DMS_Utils;
