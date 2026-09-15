// content/dms-recorder.js — Macro Studio page recorder (GetPower v46)
(function () {
  'use strict';

  var DMS_Recorder = (function () {
    var recording = false;
    var paused = false;
    var steps = [];
    var banner = null;
    var lastMouse = { x: 0, y: 0 };

    // Fire-and-forget broadcast. sendMessage returns a Promise here, and a
    // plain try/catch cannot catch an asynchronous rejection — the dropped
    // Promise surfaced as "ExtensionError: Could not establish connection.
    // Receiving end does not exist." once per recorded step whenever the
    // background was asleep or the Studio tab was closed.
    function send(msg) {
      try {
        var p = chrome.runtime.sendMessage(msg);
        if (p && typeof p.catch === 'function') p.catch(function () {});
      } catch (e) {}
    }

    function bestSel(el) {
      try {
        if (window.DMS_Picker && typeof window.DMS_Picker.bestSelector === 'function') {
          return window.DMS_Picker.bestSelector(el);
        }
      } catch (e) {}
      return el && el.tagName ? el.tagName.toLowerCase() : '';
    }

    function clickButton(e) {
      if (e.button === 2) return 'right';
      if (e.detail >= 2) return 'double';
      return 'left';
    }

    function emitStep(step) {
      send({ type: 'dms_recording_step', step: step });
    }

    function pushStep(step) {
      steps.push(step);
      renderCount();
      emitStep(step);
    }

    function onMouseMove(e) {
      if (!recording || paused) return;
      lastMouse.x = e.clientX;
      lastMouse.y = e.clientY;
    }

    function onClick(e) {
      if (!recording || paused) return;
      if (e.target && e.target.closest && e.target.closest('#__dms_recorder_banner__')) return;
      var btn = clickButton(e);
      var moveFrom = { x: lastMouse.x, y: lastMouse.y, coordMode: 'precise' };
      if (moveFrom.x !== e.clientX || moveFrom.y !== e.clientY) {
        pushStep({
          type: 'mouseMove',
          x: moveFrom.x,
          y: moveFrom.y,
          coordMode: 'precise',
          recordedAt: new Date().toISOString()
        });
      }
      pushStep({
        type: 'click',
        clickTarget: 'selector',
        selector: bestSel(e.target),
        button: btn,
        pauseOnMissing: true,
        clientX: e.clientX,
        clientY: e.clientY,
        recordedAt: new Date().toISOString()
      });
      flashRecorded(e.target);
    }

    function onInput(e) {
      if (!recording || paused) return;
      var el = e.target;
      if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA' && !el.isContentEditable)) return;
      var sel = bestSel(el);
      var text = ('value' in el ? el.value : el.textContent) || '';
      var last = steps[steps.length - 1];
      if (last && last.type === 'type' && last.selector === sel) {
        last.text = text;
        emitStep({ type: 'dms_recording_step_update', index: steps.length - 1, step: last });
      } else {
        pushStep({ type: 'type', selector: sel, text: text, clear: true, recordedAt: new Date().toISOString() });
      }
    }

    function onKey(e) {
      if (!recording || paused) return;
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'c' || e.key === 'C') {
          pushStep({ type: 'copy', recordedAt: new Date().toISOString() });
          return;
        }
        if (e.key === 'v' || e.key === 'V') {
          pushStep({ type: 'paste', recordedAt: new Date().toISOString() });
          return;
        }
      }
      if (['Enter', 'Tab', 'Escape'].indexOf(e.key) >= 0) {
        pushStep({
          type: 'keypress',
          key: e.key,
          selector: bestSel(e.target),
          recordedAt: new Date().toISOString()
        });
      }
    }

    function flashRecorded(el) {
      try {
        var prev = el.style.boxShadow;
        el.style.boxShadow = '0 0 0 3px #ef4444';
        setTimeout(function () { el.style.boxShadow = prev; }, 400);
      } catch (e) {}
    }

    function renderCount() {
      if (!banner) return;
      var span = banner.querySelector('.count');
      if (span) span.textContent = String(steps.length);
      var pauseBtn = banner.querySelector('[data-act="pause"]');
      if (pauseBtn) pauseBtn.textContent = paused ? 'Resume' : 'Pause';
    }

    function ensureBanner() {
      if (banner) return banner;
      banner = document.createElement('div');
      banner.id = '__dms_recorder_banner__';
      banner.style.cssText =
        'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#dc2626;color:#fff;' +
        'padding:8px 16px;font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;' +
        'display:flex;align-items:center;gap:12px;box-shadow:0 2px 12px rgba(0,0,0,.35);';
      banner.innerHTML =
        '<span>&#128308; <strong>Recording</strong> — <strong class="count">0</strong> steps</span>' +
        '<span style="flex:1"></span>' +
        '<button type="button" data-act="pause" style="background:rgba(0,0,0,.25);color:#fff;border:1px solid rgba(255,255,255,.35);border-radius:6px;padding:4px 10px;cursor:pointer;">Pause</button>' +
        '<button type="button" data-act="undo" style="background:rgba(0,0,0,.25);color:#fff;border:1px solid rgba(255,255,255,.35);border-radius:6px;padding:4px 10px;cursor:pointer;">Undo</button>' +
        '<button type="button" data-act="stop" style="background:rgba(0,0,0,.25);color:#fff;border:1px solid rgba(255,255,255,.35);border-radius:6px;padding:4px 10px;cursor:pointer;">Stop</button>';
      document.documentElement.appendChild(banner);
      banner.querySelector('[data-act="stop"]').addEventListener('click', function () { stop(); });
      banner.querySelector('[data-act="undo"]').addEventListener('click', function () {
        if (steps.length) steps.pop();
        renderCount();
      });
      banner.querySelector('[data-act="pause"]').addEventListener('click', function () {
        paused = !paused;
        renderCount();
        send({ type: 'dms_recording_paused', paused: paused });
      });
      return banner;
    }

    function bindListeners() {
      document.addEventListener('mousemove', onMouseMove, true);
      document.addEventListener('click', onClick, true);
      document.addEventListener('input', onInput, true);
      document.addEventListener('keydown', onKey, true);
    }

    function unbindListeners() {
      document.removeEventListener('mousemove', onMouseMove, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('input', onInput, true);
      document.removeEventListener('keydown', onKey, true);
    }

    function start() {
      if (recording) return;
      steps = [];
      recording = true;
      paused = false;
      lastMouse = { x: 0, y: 0 };
      ensureBanner();
      renderCount();
      bindListeners();
    }

    function pause() {
      if (!recording) return;
      paused = true;
      renderCount();
    }

    function resume() {
      if (!recording) return;
      paused = false;
      renderCount();
    }

    function stop() {
      if (!recording) return null;
      recording = false;
      paused = false;
      unbindListeners();
      if (banner) {
        banner.remove();
        banner = null;
      }
      var captured = steps.slice();
      send({ type: 'dms_recording_finished', steps: captured });
      return captured;
    }

    function toggle() {
      return recording ? stop() : (start(), null);
    }

    return {
      start: start,
      stop: stop,
      pause: pause,
      resume: resume,
      toggle: toggle,
      isRecording: function () { return recording; },
      isPaused: function () { return paused; },
      getSteps: function () { return steps.slice(); }
    };
  })();

  window.DMS_Recorder = DMS_Recorder;
})();
