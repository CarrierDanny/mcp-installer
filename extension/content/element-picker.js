// content/element-picker.js — Ported verbatim from DANMAN_Macro_Studio v6.7.0
// Loads alongside content-main.js + clipboard-listener.js in v4.6.
// content/element-picker.js — DANMAN Macro Studio
// Floating overlay that lets the user point at any element and capture a
// robust CSS selector. Toggled by service worker via { type: 'dms_picker_toggle' }.
// Exposes DMS_Picker on window for the other content scripts to use.
// File: DANMAN_Macro_StudioV001r000

(function () {
  if (window.__DMS_PICKER_INSTALLED__) return;
  window.__DMS_PICKER_INSTALLED__ = true;

  const STYLE_ID = '__dms_picker_style__';
  const BANNER_ID = '__dms_picker_banner__';
  const HIGHLIGHT_ID = '__dms_picker_highlight__';
  const TOOLTIP_ID = '__dms_picker_tooltip__';

  let active = false;
  let mode = 'element'; // 'element' | 'screen'
  let screenOpts = null;
  let lastEl = null;
  let onPick = null;     // optional callback (also broadcasts via runtime)
  let _lastScreenMoveSent = 0;

  function _screenPointFromEvent(e) {
    var coordMode = (screenOpts && screenOpts.coordMode) || 'precise';
    return {
      x: coordMode === 'relative' ? parseFloat(((e.clientX / window.innerWidth) * 100).toFixed(2)) : e.clientX,
      y: coordMode === 'relative' ? parseFloat(((e.clientY / window.innerHeight) * 100).toFixed(2)) : e.clientY,
      coordMode: coordMode,
      viewportW: window.innerWidth,
      viewportH: window.innerHeight
    };
  }

  function _ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '#' + BANNER_ID + ' { position: fixed; top: 0; left: 0; right: 0; z-index: 2147483647; ',
      '  background: linear-gradient(90deg, #0ea5e9, #38bdf8); color: #fff; padding: 8px 16px; ',
      '  font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; ',
      '  display: flex; align-items: center; gap: 12px; box-shadow: 0 2px 12px rgba(0,0,0,.35); }',
      '#' + BANNER_ID + ' button { background: rgba(0,0,0,.25); color: #fff; border: 1px solid rgba(255,255,255,.35); ',
      '  border-radius: 6px; padding: 4px 10px; cursor: pointer; font: inherit; }',
      '#' + BANNER_ID + ' button:hover { background: rgba(0,0,0,.5); }',
      '#' + HIGHLIGHT_ID + ' { position: fixed; pointer-events: none; z-index: 2147483646; ',
      '  border: 2px solid #f59e0b; background: rgba(245,158,11,.12); transition: all .05s linear; }',
      '#' + TOOLTIP_ID + ' { position: fixed; pointer-events: none; z-index: 2147483647; ',
      '  background: #0f172a; color: #f8fafc; padding: 6px 10px; border-radius: 6px; ',
      '  font: 12px/1.3 Consolas, Monaco, monospace; box-shadow: 0 4px 12px rgba(0,0,0,.4); ',
      '  max-width: 480px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
      'body.__dms_picker_active__ * { cursor: crosshair !important; }'
    ].join('\n');
    (document.head || document.documentElement).appendChild(s);
  }

  function _ensureBanner() {
    let el = document.getElementById(BANNER_ID);
    if (el) return el;
    el = document.createElement('div');
    el.id = BANNER_ID;
    el.innerHTML =
      '<span>🎯 <strong>DANMAN Picker</strong> — hover and click any element to capture its selector. ESC to cancel.</span>' +
      '<span style="flex:1"></span>' +
      '<button data-act="copy">Copy last</button>' +
      '<button data-act="cancel">Cancel</button>';
    (document.body || document.documentElement).appendChild(el);
    el.querySelector('[data-act="cancel"]').addEventListener('click', stop);
    el.querySelector('[data-act="copy"]').addEventListener('click', () => {
      if (lastEl) {
        const sel = bestSelector(lastEl);
        navigator.clipboard.writeText(sel).catch(() => {});
      }
    });
    return el;
  }

  function _ensureHighlight() {
    let el = document.getElementById(HIGHLIGHT_ID);
    if (el) return el;
    el = document.createElement('div');
    el.id = HIGHLIGHT_ID;
    document.documentElement.appendChild(el);
    const tip = document.createElement('div');
    tip.id = TOOLTIP_ID;
    document.documentElement.appendChild(tip);
    return el;
  }

  function _positionHighlight(el) {
    const h = document.getElementById(HIGHLIGHT_ID);
    const t = document.getElementById(TOOLTIP_ID);
    if (!h || !el) return;
    const r = el.getBoundingClientRect();
    h.style.left = r.left + 'px';
    h.style.top = r.top + 'px';
    h.style.width = r.width + 'px';
    h.style.height = r.height + 'px';
    const sel = bestSelector(el);
    t.textContent = sel;
    const tipTop = Math.max(40, r.bottom + 6);
    t.style.left = Math.min(window.innerWidth - 500, r.left) + 'px';
    t.style.top = tipTop + 'px';
  }

  function _onMove(e) {
    if (!active) return;
    const el = e.target;
    if (!el || el === lastEl) return;
    if (el.id === BANNER_ID || el.closest && el.closest('#' + BANNER_ID)) return;
    lastEl = el;
    _positionHighlight(el);
  }

  function _onClick(e) {
    if (!active) return;
    if (e.target && e.target.closest && e.target.closest('#' + BANNER_ID)) return;
    e.preventDefault();
    e.stopPropagation();
    const sel = bestSelector(e.target);
    const info = {
      selector: sel,
      tag: e.target.tagName.toLowerCase(),
      text: (e.target.innerText || e.target.value || '').slice(0, 200),
      attrs: _attrs(e.target),
      rect: e.target.getBoundingClientRect()
    };
    try { chrome.runtime.sendMessage({ type: 'dms_picker_picked', info }); } catch (err) {}
    if (typeof onPick === 'function') { try { onPick(info); } catch (err) {} }
    stop();
  }

  function _onKey(e) {
    if (!active) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      var wasScreen = mode === 'screen';
      stop();
      if (wasScreen) {
        try { chrome.runtime.sendMessage({ type: 'SCREEN_PICK_CANCELLED' }); } catch (err) {}
      }
    }
  }

  function _ensureScreenBanner() {
    let el = document.getElementById(BANNER_ID);
    if (el) return el;
    el = document.createElement('div');
    el.id = BANNER_ID;
    el.innerHTML =
      '<span>🎯 <strong>Screen click</strong> — left-click the spot to capture coordinates. Choose the action in the editor next. ESC to cancel.</span>' +
      '<span style="flex:1"></span>' +
      '<button data-act="cancel">Cancel</button>';
    (document.body || document.documentElement).appendChild(el);
    el.querySelector('[data-act="cancel"]').addEventListener('click', stop);
    return el;
  }

  function _onScreenMove(e) {
    if (!active || mode !== 'screen') return;
    var pt = _screenPointFromEvent(e);
    var t = document.getElementById(TOOLTIP_ID);
    if (t) {
      var relX = ((e.clientX / window.innerWidth) * 100).toFixed(1);
      var relY = ((e.clientY / window.innerHeight) * 100).toFixed(1);
      t.textContent = 'x=' + e.clientX + ' y=' + e.clientY + '  (' + relX + '%, ' + relY + '%)';
      t.style.left = Math.min(window.innerWidth - 500, e.clientX + 12) + 'px';
      t.style.top = Math.min(window.innerHeight - 40, e.clientY + 12) + 'px';
    }
    var now = Date.now();
    if (now - _lastScreenMoveSent < 40) return;
    _lastScreenMoveSent = now;
    try { chrome.runtime.sendMessage({ type: 'dms_screen_pick_move', info: pt }); } catch (err) {}
  }

  function _onScreenClick(e) {
    if (!active || mode !== 'screen') return;
    if (e.target && e.target.closest && e.target.closest('#' + BANNER_ID)) return;
    // Capture position only — left click records coordinates; action type is chosen in the editor.
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    var info = _screenPointFromEvent(e);
    info.button = 'left';
    try { chrome.runtime.sendMessage({ type: 'dms_screen_picked', info: info }); } catch (err) {}
    stop();
  }

  function startScreen(opts) {
    if (active) stop();
    mode = 'screen';
    screenOpts = opts || {};
    _ensureStyle();
    _ensureScreenBanner();
    _ensureHighlight();
    var tip = document.getElementById(TOOLTIP_ID);
    if (tip) tip.style.display = 'block';
    document.body.classList.add('__dms_picker_active__');
    document.addEventListener('mousemove', _onScreenMove, true);
    document.addEventListener('click', _onScreenClick, true);
    document.addEventListener('keydown', _onKey, true);
    active = true;
  }

  function start(opts) {
    if (active) return;
    mode = 'element';
    screenOpts = null;
    _ensureStyle();
    _ensureBanner();
    _ensureHighlight();
    onPick = (opts && opts.onPick) || null;
    document.body.classList.add('__dms_picker_active__');
    document.addEventListener('mousemove', _onMove, true);
    document.addEventListener('click', _onClick, true);
    document.addEventListener('keydown', _onKey, true);
    active = true;
  }

  function stop() {
    document.body.classList.remove('__dms_picker_active__');
    document.removeEventListener('mousemove', _onMove, true);
    document.removeEventListener('click', _onClick, true);
    document.removeEventListener('mousemove', _onScreenMove, true);
    document.removeEventListener('click', _onScreenClick, true);
    document.removeEventListener('keydown', _onKey, true);
    [BANNER_ID, HIGHLIGHT_ID, TOOLTIP_ID].forEach(id => {
      const n = document.getElementById(id);
      if (n) n.remove();
    });
    active = false;
    mode = 'element';
    screenOpts = null;
    lastEl = null;
    onPick = null;
  }

  function toggle() { active ? stop() : start(); }

  function _attrs(el) {
    const out = {};
    for (const a of el.attributes || []) out[a.name] = a.value;
    return out;
  }

  function bestSelector(el) {
    if (!el || el.nodeType !== 1) return '';
    // Prefer data-test / data-testid attributes (stable)
    for (const attr of ['data-test', 'data-testid', 'data-test-id', 'data-qa', 'data-cy']) {
      const v = el.getAttribute(attr);
      if (v) return '[' + attr + '="' + CSS.escape(v) + '"]';
    }
    if (el.id) return '#' + CSS.escape(el.id);

    // Name attribute on inputs is very stable
    if (el.name && /^(input|select|textarea|button)$/i.test(el.tagName)) {
      return el.tagName.toLowerCase() + '[name="' + CSS.escape(el.name) + '"]';
    }

    // aria-label on buttons/links
    const aria = el.getAttribute('aria-label');
    if (aria && (el.tagName === 'BUTTON' || el.tagName === 'A')) {
      return el.tagName.toLowerCase() + '[aria-label="' + CSS.escape(aria) + '"]';
    }

    // Build a path with classes + nth-of-type
    const parts = [];
    let node = el;
    let depth = 0;
    while (node && node.nodeType === 1 && node !== document.documentElement && depth < 6) {
      let part = node.tagName.toLowerCase();
      const cls = (node.className && typeof node.className === 'string')
        ? node.className.split(/\s+/).filter(c => c && !/^ng-|^v-|^_/.test(c)).slice(0, 2)
        : [];
      if (cls.length) part += '.' + cls.map(c => CSS.escape(c)).join('.');
      if (node.parentElement) {
        const same = Array.prototype.filter.call(node.parentElement.children, n => n.tagName === node.tagName);
        if (same.length > 1) {
          const idx = same.indexOf(node) + 1;
          part += ':nth-of-type(' + idx + ')';
        }
      }
      parts.unshift(part);
      node = node.parentElement;
      depth++;
    }
    return parts.join(' > ') || el.tagName.toLowerCase();
  }

  window.DMS_Picker = { start, startScreen, stop, toggle, bestSelector, isActive: () => active };
})();
