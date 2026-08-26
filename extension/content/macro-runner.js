// content/macro-runner.js — Ported verbatim from DANMAN_Macro_Studio v6.7.0
// Loads alongside content-main.js + clipboard-listener.js in v4.6.
// content/macro-runner.js — DANMAN Macro Studio
// Executes a SINGLE step delivered from the background macro-engine. Each
// invocation is independent; engine takes care of the loop and ordering.
//
// Step schema (resolved & with placeholders already substituted):
//   { type, selector, text?, clear?, value?, waitType?, timeout?, extractType?,
//     attribute?, variable?, waitAfter?, key? }
//
// File: DANMAN_Macro_StudioV001r000

(function () {
  if (window.__DMS_RUNNER_INSTALLED__) return;
  window.__DMS_RUNNER_INSTALLED__ = true;

  let stopFlag = false;

  function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function _highlight(el, on, color) {
    if (!el || !el.style) return;
    if (on) {
      el.dataset.__dmsPriorOutline = el.style.outline || '';
      el.dataset.__dmsPriorOutlineOffset = el.style.outlineOffset || '';
      el.style.outline = '3px solid ' + (color || '#38bdf8');
      el.style.outlineOffset = '2px';
      try { el.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' }); } catch (e) { try { el.scrollIntoView(); } catch (e2) {} }
    } else {
      if (el.dataset.__dmsPriorOutline !== undefined) {
        el.style.outline = el.dataset.__dmsPriorOutline;
        el.style.outlineOffset = el.dataset.__dmsPriorOutlineOffset || '';
        delete el.dataset.__dmsPriorOutline;
        delete el.dataset.__dmsPriorOutlineOffset;
      }
    }
  }

  async function _waitForElement(selector, timeoutMs) {
    const deadline = Date.now() + (timeoutMs || 5000);
    return new Promise((resolve, reject) => {
      const tick = () => {
        if (stopFlag) return reject(new Error('Stopped'));
        let el = null;
        try { el = document.querySelector(selector); } catch (e) { return reject(new Error('Bad selector: ' + selector)); }
        if (el) return resolve(el);
        if (Date.now() > deadline) return reject(new Error('Timeout waiting for: ' + selector));
        setTimeout(tick, 100);
      };
      tick();
    });
  }

  function _setNativeValue(el, value) {
    // For React/Vue/Angular form controls, dispatch through the native setter
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : (el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype);
    const setter = Object.getOwnPropertyDescriptor(proto, 'value');
    if (setter && setter.set) {
      setter.set.call(el, value);
    } else {
      el.value = value;
    }
  }

  function _resolveCoords(step) {
    var mode = step.coordMode || 'precise';
    var x = parseFloat(step.x);
    var y = parseFloat(step.y);
    if (mode === 'relative') {
      x = (x / 100) * window.innerWidth;
      y = (y / 100) * window.innerHeight;
    }
    return { x: Math.round(x), y: Math.round(y) };
  }

  function _ensureGhostCursor() {
    var el = document.getElementById('__dms_ghost_cursor__');
    if (el) return el;
    el = document.createElement('div');
    el.id = '__dms_ghost_cursor__';
    el.style.cssText = 'position:fixed;width:14px;height:14px;border-radius:50%;background:#f97316;border:2px solid #fff;' +
      'box-shadow:0 0 8px rgba(249,115,22,.8);z-index:2147483646;pointer-events:none;transform:translate(-50%,-50%);transition:none;';
    document.documentElement.appendChild(el);
    return el;
  }

  async function _animateMouseTo(x, y, opts) {
    if (!opts || !opts.animateMouse) return;
    var cursor = _ensureGhostCursor();
    var startX = window.__dms_lastMouseX != null ? window.__dms_lastMouseX : 0;
    var startY = window.__dms_lastMouseY != null ? window.__dms_lastMouseY : 0;
    var frames = 12;
    for (var i = 1; i <= frames; i++) {
      var t = i / frames;
      var cx = startX + (x - startX) * t;
      var cy = startY + (y - startY) * t;
      cursor.style.left = cx + 'px';
      cursor.style.top = cy + 'px';
      await _sleep(16);
    }
    window.__dms_lastMouseX = x;
    window.__dms_lastMouseY = y;
    await _sleep(40);
    cursor.remove();
  }

  function _dispatchMouse(el, type, x, y, button) {
    var btn = button === 'right' ? 2 : (button === 'middle' ? 1 : 0);
    var init = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: btn, buttons: btn === 2 ? 2 : (btn === 1 ? 4 : 1) };
    var target = el || document.elementFromPoint(x, y) || document.body;
    target.dispatchEvent(new MouseEvent(type, init));
  }

  function _dispatchWheelAt(x, y, lines, direction) {
    var target = document.elementFromPoint(x, y) || document.documentElement;
    var deltaY = (direction === 'up' ? -1 : 1) * (parseInt(lines, 10) || 3);
    target.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y,
      deltaY: deltaY,
      deltaMode: WheelEvent.DOM_DELTA_LINE
    }));
  }

  async function _performClick(button, el, x, y) {
    if (button === 'double') {
      try { el.click(); } catch (e) {}
      try { el.click(); } catch (e) {}
      _dispatchMouse(el, 'dblclick', x, y, 'left');
      return;
    }
    if (button === 'right') {
      _dispatchMouse(el, 'contextmenu', x, y, 'right');
      return;
    }
    if (button === 'middle') {
      _dispatchMouse(el, 'mousedown', x, y, 'middle');
      _dispatchMouse(el, 'mouseup', x, y, 'middle');
      _dispatchMouse(el, 'click', x, y, 'middle');
      return;
    }
    try { el.click(); } catch (e) {}
    ['mousedown', 'mouseup', 'click'].forEach(function (evt) {
      _dispatchMouse(el, evt, x, y, 'left');
    });
  }

  async function _executeStep(step, variables, opts) {
    const debug = opts && opts.debug;
    const highlight = opts && opts.highlight;
    const speed = (opts && opts.speedMs) || 0;
    let captured = {};

    const t = step.type;
    if (t === 'wait') {
      if (step.waitType === 'selector') {
        await _waitForElement(step.selector || step.value, parseInt(step.timeout, 10) || 5000);
      } else if (step.waitType === 'network') {
        await _sleep(Math.min(parseInt(step.value, 10) || 1000, parseInt(step.timeout, 10) || 10000));
      } else {
        await _sleep(parseInt(step.value, 10) || 1000);
      }
      return { ok: true };
    }

    if (t === 'screenshot') {
      var captureMode = step.captureMode || (step.selector ? 'selector' : 'viewport');
      var shotLabel = step.value || step.label || '';
      var shotDpr = window.devicePixelRatio || 1;
      if (captureMode === 'selector') {
        if (!step.selector) {
          return { ok: true, captureRequest: { mode: 'viewport', label: shotLabel, dpr: shotDpr, url: location.href } };
        }
        var shotEl = document.querySelector(step.selector);
        if (!shotEl) {
          if (step.pauseOnMissing !== false) {
            return { ok: false, pauseRequired: true, error: 'Selector not found for screenshot: ' + step.selector };
          }
          throw new Error('Selector not found for screenshot: ' + step.selector);
        }
        var shotRect = shotEl.getBoundingClientRect();
        return {
          ok: true,
          captureRequest: {
            mode: 'selector',
            rect: { x: shotRect.left, y: shotRect.top, width: shotRect.width, height: shotRect.height },
            dpr: shotDpr,
            label: shotLabel,
            url: location.href,
            selector: step.selector
          }
        };
      }
      if (captureMode === 'screen' || captureMode === 'coords') {
        var shotPt = _resolveCoords(step);
        var shotW = parseFloat(step.width || step.w) || 200;
        var shotH = parseFloat(step.height || step.h) || 150;
        return {
          ok: true,
          captureRequest: {
            mode: 'coords',
            rect: { x: shotPt.x, y: shotPt.y, width: shotW, height: shotH },
            dpr: shotDpr,
            label: shotLabel,
            url: location.href
          }
        };
      }
      return { ok: true, captureRequest: { mode: 'viewport', label: shotLabel, dpr: shotDpr, url: location.href } };
    }

    if (t === 'copy') {
      document.execCommand('copy');
      return { ok: true };
    }

    if (t === 'paste') {
      document.execCommand('paste');
      return { ok: true };
    }

    if (t === 'mouseMove') {
      var mv = _resolveCoords(step);
      await _animateMouseTo(mv.x, mv.y, opts);
      window.__dms_lastMouseX = mv.x;
      window.__dms_lastMouseY = mv.y;
      return { ok: true };
    }

    if (t === 'screenClick') {
      var pt = _resolveCoords(step);
      await _animateMouseTo(pt.x, pt.y, opts);
      var targetEl = document.elementFromPoint(pt.x, pt.y) || document.body || document.documentElement;
      var screenAction = step.screenAction || 'click';
      if (screenAction === 'scrollUp') {
        _dispatchWheelAt(pt.x, pt.y, step.scrollLines, 'up');
        return { ok: true, x: pt.x, y: pt.y, coordMode: step.coordMode || 'precise', screenAction: screenAction };
      }
      if (screenAction === 'scrollDown') {
        _dispatchWheelAt(pt.x, pt.y, step.scrollLines, 'down');
        return { ok: true, x: pt.x, y: pt.y, coordMode: step.coordMode || 'precise', screenAction: screenAction };
      }
      if (screenAction === 'hover') {
        ['mouseover', 'mouseenter', 'mousemove'].forEach(function (evt) {
          targetEl.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: window, clientX: pt.x, clientY: pt.y }));
        });
        await _sleep(parseInt(step.waitMs, 10) || 1000);
        return { ok: true, x: pt.x, y: pt.y, coordMode: step.coordMode || 'precise', screenAction: screenAction };
      }
      // Coordinate-only click — never requires a selector; dispatch at pixel location.
      await _performClick(step.button || 'left', targetEl, pt.x, pt.y);
      return { ok: true, x: pt.x, y: pt.y, coordMode: step.coordMode || 'precise', screenAction: 'click', button: step.button || 'left' };
    }

    if (t === 'keypress') {
      // Dispatch keyboard events to active element or selector target
      const el = step.selector ? document.querySelector(step.selector) : document.activeElement;
      if (!el) throw new Error('No target for keypress');
      const init = { key: step.key || 'Enter', code: step.key || 'Enter', bubbles: true, cancelable: true };
      el.dispatchEvent(new KeyboardEvent('keydown', init));
      el.dispatchEvent(new KeyboardEvent('keypress', init));
      el.dispatchEvent(new KeyboardEvent('keyup', init));
      return { ok: true };
    }

    // Selector-bound steps
    var pauseOnMissing = step.pauseOnMissing !== false;
    var el = null;
    try {
      el = await _waitForElement(step.selector, parseInt(step.timeout, 10) || 5000);
    } catch (err) {
      if (pauseOnMissing && (step.type === 'click' || step.type === 'type' || step.type === 'select' || step.type === 'hover')) {
        return { ok: false, pauseRequired: true, error: err.message };
      }
      throw err;
    }
    if (stopFlag) throw new Error('Stopped');
    if (highlight) _highlight(el, true);

    try {
      switch (t) {
        case 'click': {
          var rect = el.getBoundingClientRect();
          var cx = Math.round(rect.left + rect.width / 2);
          var cy = Math.round(rect.top + rect.height / 2);
          await _animateMouseTo(cx, cy, opts);
          if (step.wait) await _sleep(parseInt(step.wait, 10));
          await _performClick(step.button || 'left', el, cx, cy);
          break;
        }
        case 'type': {
          el.focus();
          if (step.clear) {
            if ('value' in el) _setNativeValue(el, '');
            else el.textContent = '';
          }
          const text = step.text != null ? String(step.text) : '';
          if ('value' in el) {
            _setNativeValue(el, ((step.clear ? '' : el.value || '') + text));
          } else {
            el.textContent = (step.clear ? '' : (el.textContent || '')) + text;
          }
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          break;
        }
        case 'select': {
          // Ported from DANMAN OMEGA's workflow `select` step; matches an
          // option by value first, then by visible label.
          if (!el.options) throw new Error('Selector is not a <select> element');
          var wantOpt = step.value != null ? String(step.value) : '';
          var matchedOpt = false;
          for (var oi = 0; oi < el.options.length; oi++) {
            if (el.options[oi].value === wantOpt || el.options[oi].text.trim() === wantOpt) {
              el.selectedIndex = oi;
              matchedOpt = true;
              break;
            }
          }
          if (!matchedOpt) throw new Error('No option matching "' + wantOpt + '" in ' + step.selector);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          break;
        }
        case 'hover': {
          ['mouseover', 'mouseenter', 'mousemove'].forEach(evt => {
            el.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: window }));
          });
          break;
        }
        case 'scroll': {
          try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
          catch (e) { el.scrollIntoView(); }
          break;
        }
        case 'upload': {
          if (el.type !== 'file') throw new Error('Selector is not a file input');
          // The DataTransfer trick works in some sites but a true OS file
          // dialog can't be driven from the page sandbox. We dispatch a
          // synthetic "change" to keep the workflow moving — the recommended
          // approach is to use a Native Messaging Host that pre-stages the
          // file path. For now we document and emit a non-fatal warning.
          try {
            const path = step.filePath || step.value || '';
            if (path) {
              const dt = new DataTransfer();
              // We can't create a File from a path inside content scripts,
              // but we can fire change so dependent JS proceeds.
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }
          } catch (e) { /* non-fatal */ }
          await _sleep(parseInt(step.waitAfter, 10) || 1000);
          break;
        }
        case 'extract': {
          let value;
          switch (step.extractType) {
            case 'value':     value = el.value || ''; break;
            case 'attribute': value = el.getAttribute(step.attribute || 'href') || ''; break;
            case 'html':      value = el.innerHTML || ''; break;
            case 'table':     value = _extractTable(el); break;
            case 'text':
            default:          value = el.innerText || el.textContent || ''; break;
          }
          captured[step.variable || '_'] = value;
          break;
        }
        default:
          throw new Error('Unknown step type: ' + t);
      }
    } finally {
      if (highlight) _highlight(el, false);
    }

    if (speed > 0) await _sleep(speed);
    return { ok: true, variables: captured };
  }

  function _extractTable(table) {
    const out = [];
    try {
      const rows = table.querySelectorAll('tr');
      rows.forEach(tr => {
        const cols = [];
        tr.querySelectorAll('th, td').forEach(c => cols.push((c.innerText || '').trim()));
        if (cols.length) out.push(cols);
      });
    } catch (e) {}
    return out;
  }

  // ---------- Message router ----------
  chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    if (!req || !req.type) return false;

    if (req.type === 'dms_ping') {
      sendResponse({ ok: true, ping: true });
      return false;
    }

    if (req.type === 'dms_run_step') {
      stopFlag = false;
      var responded = false;
      function reply(payload) {
        if (responded) return;
        responded = true;
        try { sendResponse(payload); } catch (e) {}
      }
      _executeStep(req.step, req.variables || {}, {
        debug: req.debug,
        highlight: req.highlight,
        speedMs: req.speedMs,
        animateMouse: req.animateMouse
      })
        .then(r => reply(r))
        .catch(e => reply({ ok: false, error: e.message }));
      return true;
    }

    if (req.type === 'dms_stop') {
      stopFlag = true;
      try { window.DMS_Picker && window.DMS_Picker.stop(); } catch (e) {}
      try { window.DMS_Recorder && window.DMS_Recorder.stop && window.DMS_Recorder.stop(); } catch (e) {}
      sendResponse({ stopped: true });
      return false;
    }

    return false;
  });

  window.DMS_Runner = { executeStep: _executeStep };
})();
