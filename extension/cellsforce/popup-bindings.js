/* popup-bindings.js — Firefox-safe event wiring (CSP blocks inline handlers) */
(function () {
  'use strict';

  function parseArg(raw, el, ev) {
    var arg = raw.trim();
    if (arg === 'this') return el;
    if (arg === 'event') return ev;
    if (arg.indexOf('this.') === 0) {
      return el[arg.substring(5)];
    }
    if (arg.indexOf('event.') === 0) {
      return ev[arg.substring(6)];
    }
    if (/^-?\d+$/.test(arg)) return parseInt(arg, 10);
    if (/^-?\d+\.\d+$/.test(arg)) return parseFloat(arg);
    if ((arg.charAt(0) === "'" && arg.charAt(arg.length - 1) === "'") ||
      (arg.charAt(0) === '"' && arg.charAt(arg.length - 1) === '"')) {
      return arg.slice(1, -1).replace(/\\'/g, "'").replace(/\\"/g, '"');
    }
    return arg;
  }

  function splitArgs(argsStr) {
    var args = [];
    var current = '';
    var inQuote = null;
    var i;
    for (i = 0; i < argsStr.length; i++) {
      var c = argsStr[i];
      if (inQuote) {
        current += c;
        if (c === inQuote && argsStr[i - 1] !== '\\') inQuote = null;
      } else if (c === "'" || c === '"') {
        inQuote = c;
        current += c;
      } else if (c === ',') {
        args.push(current);
        current = '';
      } else {
        current += c;
      }
    }
    if (current.length) args.push(current);
    return args;
  }

  function runHandlerCode(code, el, ev) {
    code = String(code || '').trim().replace(/;$/, '');
    if (!code) return;

    var m;

    m = code.match(/^([A-Za-z_$][\w$]*)\(([\s\S]*)\)$/);
    if (m) {
      var fn = window[m[1]];
      if (typeof fn !== 'function') {
        console.warn('[CellsForce] Missing handler:', m[1]);
        return;
      }
      var args = splitArgs(m[2]).map(function (a) { return parseArg(a, el, ev); });
      fn.apply(null, args);
      return;
    }

    m = code.match(/^document\.getElementById\(['"]([^'"]+)['"]\)\.click\(\)$/);
    if (m) {
      var clickEl = document.getElementById(m[1]);
      if (clickEl) clickEl.click();
      return;
    }

    m = code.match(/^document\.getElementById\(['"]([^'"]+)['"]\)\.value\s*=\s*['"]([^'"]*)['"]$/);
    if (m) {
      var valEl = document.getElementById(m[1]);
      if (valEl) valEl.value = m[2];
      return;
    }

    m = code.match(/^document\.getElementById\(['"]([^'"]+)['"]\)\.remove\(\)$/);
    if (m) {
      var rm = document.getElementById(m[1]);
      if (rm) rm.remove();
      return;
    }

    console.warn('[CellsForce] Unhandled inline handler:', code);
  }

  function bindClick(el) {
    var code = el.getAttribute('onclick');
    if (!code) return;
    el.removeAttribute('onclick');
    el.addEventListener('click', function (ev) {
      runHandlerCode(code, el, ev);
    });
  }

  function bindInput(el, attr, evtName) {
    var code = el.getAttribute(attr);
    if (!code) return;
    el.removeAttribute(attr);
    el.addEventListener(evtName, function (ev) {
      runHandlerCode(code, el, ev);
    });
  }

  function bindDragDrop(el) {
    var dropCode = el.getAttribute('ondrop');
    if (dropCode) {
      el.removeAttribute('ondrop');
      el.addEventListener('drop', function (ev) {
        ev.preventDefault();
        el.classList.remove('drag-over');
        runHandlerCode(dropCode, el, ev);
      });
    }

    if (el.hasAttribute('ondragover')) {
      el.removeAttribute('ondragover');
      el.addEventListener('dragover', function (ev) {
        ev.preventDefault();
        el.classList.add('drag-over');
      });
    }

    if (el.hasAttribute('ondragleave')) {
      el.removeAttribute('ondragleave');
      el.addEventListener('dragleave', function () {
        el.classList.remove('drag-over');
      });
    }
  }

  function bindRoot(root) {
    if (!root || root.nodeType !== 1) return;
    root.querySelectorAll('[onclick]').forEach(bindClick);
    root.querySelectorAll('[oninput]').forEach(function (el) { bindInput(el, 'oninput', 'input'); });
    root.querySelectorAll('[onchange]').forEach(function (el) { bindInput(el, 'onchange', 'change'); });
    if (root.hasAttribute && root.hasAttribute('onclick')) bindClick(root);
    if (root.hasAttribute && root.hasAttribute('oninput')) bindInput(root, 'oninput', 'input');
    if (root.hasAttribute && root.hasAttribute('onchange')) bindInput(root, 'onchange', 'change');
    if (root.hasAttribute && (root.hasAttribute('ondrop') || root.hasAttribute('ondragover') || root.hasAttribute('ondragleave'))) {
      bindDragDrop(root);
    }
    root.querySelectorAll('[ondrop],[ondragover],[ondragleave]').forEach(bindDragDrop);
  }

  function initBindings() {
    bindRoot(document.body);
    try {
      new MutationObserver(function (mutations) {
        mutations.forEach(function (m) {
          m.addedNodes.forEach(function (node) {
            if (node.nodeType === 1) bindRoot(node);
          });
        });
      }).observe(document.body, { childList: true, subtree: true });
    } catch (e) {
      console.warn('[CellsForce] MutationObserver unavailable', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBindings);
  } else {
    initBindings();
  }
})();
