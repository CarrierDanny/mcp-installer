// sidebar/core/macro-shared.js — shared macro workflow between Macros + Execute tabs
(function (global) {
  'use strict';

  var workflow = { id: null, name: '', steps: [], variables: {} };
  var listeners = [];

  function notify() {
    var snap = global.GPD_MacroShared.get();
    listeners.forEach(function (fn) {
      try { fn(snap); } catch (e) { console.warn('[MacroShared]', e); }
    });
    try {
      global.dispatchEvent(new CustomEvent('gpd:macro-workflow-changed', { detail: snap }));
    } catch (e) {}
  }

  global.GPD_MacroShared = {
    get: function () {
      return {
        id: workflow.id,
        name: workflow.name || '',
        steps: (workflow.steps || []).slice(),
        variables: Object.assign({}, workflow.variables || {})
      };
    },
    set: function (w) {
      w = w || {};
      workflow = {
        id: w.id || null,
        name: w.name || '',
        steps: Array.isArray(w.steps) ? w.steps.slice() : [],
        variables: w.variables || {}
      };
      notify();
    },
    onChange: function (fn) {
      if (typeof fn === 'function') listeners.push(fn);
      return function () {
        listeners = listeners.filter(function (x) { return x !== fn; });
      };
    }
  };
})(typeof window !== 'undefined' ? window : self);
