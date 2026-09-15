// core/progressive-learn.js — Workbench-style progressive learning + memory log.
// Persists to chrome.storage.local so every extension page and browser tab syncs.
(function (global) {
  'use strict';

  var STORAGE_KEY = 'gpd_learn_stats';
  var MEMORIES_KEY = 'gpd_progressive_memories';
  var FEED_LOG_KEY = 'gpd_progressive_feed_log';
  var browserApi = (typeof browser !== 'undefined' && browser.storage)
    ? browser
    : (typeof chrome !== 'undefined' ? chrome : null);

  function storageGet(keys) {
    return new Promise(function (resolve) {
      if (!browserApi || !browserApi.storage || !browserApi.storage.local) {
        resolve({});
        return;
      }
      try {
        var maybe = browserApi.storage.local.get(keys);
        if (maybe && typeof maybe.then === 'function') {
          maybe.then(resolve).catch(function () { resolve({}); });
          return;
        }
      } catch (_) {}
      try {
        browserApi.storage.local.get(keys, function (r) { resolve(r || {}); });
      } catch (_) { resolve({}); }
    });
  }

  function storageSet(obj) {
    return new Promise(function (resolve) {
      if (!browserApi || !browserApi.storage || !browserApi.storage.local) {
        resolve();
        return;
      }
      try {
        var maybe = browserApi.storage.local.set(obj);
        if (maybe && typeof maybe.then === 'function') {
          maybe.then(resolve).catch(function () { resolve(); });
          return;
        }
      } catch (_) {}
      try {
        browserApi.storage.local.set(obj, function () { resolve(); });
      } catch (_) { resolve(); }
    });
  }

  var stats = { events: {}, bigrams: {}, last: null, personaHist: [], enabled: true };
  var memories = [];
  var feedLog = [];
  var saveTimer = null;
  var ready = null;

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      storageSet({
        gpd_learn_stats: stats,
        gpd_progressive_memories: memories,
        gpd_progressive_feed_log: feedLog.slice(-500)
      });
    }, 500);
  }

  function load() {
    if (ready) return ready;
    ready = storageGet([STORAGE_KEY, MEMORIES_KEY, FEED_LOG_KEY]).then(function (r) {
      if (r[STORAGE_KEY] && typeof r[STORAGE_KEY] === 'object') {
        stats = Object.assign(stats, r[STORAGE_KEY]);
      }
      if (Array.isArray(r[MEMORIES_KEY])) memories = r[MEMORIES_KEY];
      if (Array.isArray(r[FEED_LOG_KEY])) feedLog = r[FEED_LOG_KEY];
      return { stats: stats, memories: memories, feedLog: feedLog };
    });
    return ready;
  }

  function record(action, detail) {
    if (!stats.enabled) return;
    action = String(action || '').trim();
    if (!action) return;
    stats.events[action] = (stats.events[action] || 0) + 1;
    if (stats.last && stats.last !== action) {
      var k = stats.last + '\u25B8' + action;
      stats.bigrams[k] = (stats.bigrams[k] || 0) + 1;
    }
    stats.last = action;
    feedLog.push({
      ts: Date.now(),
      action: action,
      detail: detail ? String(detail).slice(0, 500) : ''
    });
    if (feedLog.length > 500) feedLog = feedLog.slice(-500);
    scheduleSave();
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('gpd-learn-updated', { detail: { action: action } }));
      }
    } catch (_) {}
  }

  function count(action) {
    return stats.events[action] || 0;
  }

  function suggestions() {
    var out = [];
    if (!stats.last) return out;
    var prefix = stats.last + '\u25B8';
    var next = Object.keys(stats.bigrams)
      .filter(function (k) { return k.indexOf(prefix) === 0 && stats.bigrams[k] >= 2; })
      .sort(function (a, b) { return stats.bigrams[b] - stats.bigrams[a]; })[0];
    if (next) {
      out.push({
        label: 'Next: ' + next.split('\u25B8')[1].replace(/[_:]/g, ' '),
        action: next.split('\u25B8')[1]
      });
    }
    return out.slice(0, 3);
  }

  function addMemory(type, content, weight) {
    var m = {
      id: 'm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      type: type || 'fact',
      content: String(content || '').trim(),
      weight: weight || 1,
      updated: Date.now(),
      deleted: false
    };
    if (!m.content) return null;
    memories.push(m);
    record('mem:add', m.type);
    scheduleSave();
    return m;
  }

  function listMemories() {
    return memories.filter(function (m) { return !m.deleted; })
      .sort(function (a, b) { return (b.weight || 1) - (a.weight || 1); });
  }

  function updateMemory(id, patch) {
    var m = memories.find(function (x) { return x.id === id; });
    if (!m) return null;
    Object.assign(m, patch || {}, { updated: Date.now() });
    scheduleSave();
    return m;
  }

  function setEnabled(on) {
    stats.enabled = !!on;
    scheduleSave();
  }

  function getFeedLog(limit) {
    var n = limit || 50;
    return feedLog.slice(-n).reverse();
  }

  function getStatsPairs() {
    var macroRuns = Object.keys(stats.events)
      .filter(function (k) { return k.indexOf('macro:') === 0; })
      .reduce(function (n, k) { return n + stats.events[k]; }, 0);
    return [
      ['Chats sent', count('chat:send')],
      ['Clips captured', count('clip:add')],
      ['Macros run', macroRuns],
      ['OCR runs', count('studio:ocr')],
      ['Triage steps', count('triage:extract') + count('triage:export')],
      ['Patterns learned', Object.keys(stats.bigrams).length],
      ['Memories', listMemories().length]
    ];
  }

  // Cross-tab: reload when another context writes
  if (browserApi && browserApi.storage && browserApi.storage.onChanged) {
    try {
      browserApi.storage.onChanged.addListener(function (changes, area) {
        if (area !== 'local') return;
        if (changes[STORAGE_KEY] && changes[STORAGE_KEY].newValue) {
          stats = Object.assign(stats, changes[STORAGE_KEY].newValue);
        }
        if (changes[MEMORIES_KEY] && Array.isArray(changes[MEMORIES_KEY].newValue)) {
          memories = changes[MEMORIES_KEY].newValue;
        }
        if (changes[FEED_LOG_KEY] && Array.isArray(changes[FEED_LOG_KEY].newValue)) {
          feedLog = changes[FEED_LOG_KEY].newValue;
        }
        try {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('gpd-learn-updated', { detail: { external: true } }));
          }
        } catch (_) {}
      });
    } catch (_) {}
  }

  global.GPD_ProgressiveLearn = {
    load: load,
    record: record,
    count: count,
    suggestions: suggestions,
    addMemory: addMemory,
    listMemories: listMemories,
    updateMemory: updateMemory,
    setEnabled: setEnabled,
    getFeedLog: getFeedLog,
    getStatsPairs: getStatsPairs,
    getStats: function () { return stats; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : self);
