// clipboard-popout.js — Floating clipboard viewer (undocked from sidebar)
(function () {
  'use strict';
  var B = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;
  var slots = [];
  var stayOnTop = false;
  var refocusTimer = null;

  function send(type, payload) {
    return B.runtime.sendMessage({ type: type, payload: payload || {} });
  }

  // Fire-and-forget variant. Without it, every send whose result nobody awaits
  // leaves an unhandled rejection when the background is asleep or the message
  // has no receiver — which the Browser Console prints as
  // "ExtensionError: Could not establish connection. Receiving end does not exist."
  function sendQuiet(type, payload) {
    try {
      var p = send(type, payload);
      if (p && typeof p.catch === 'function') p.catch(function () {});
    } catch (_) {}
  }

  function esc(t) {
    var d = document.createElement('div');
    d.textContent = t || '';
    return d.innerHTML;
  }

  function timeAgo(ts) {
    if (!ts) return '';
    var sec = Math.floor((Date.now() - ts) / 1000);
    if (sec < 60) return sec + 's';
    var min = Math.floor(sec / 60);
    if (min < 60) return min + 'm';
    return Math.floor(min / 60) + 'h';
  }

  function render() {
    var list = document.getElementById('clip-list');
    var q = (document.getElementById('clip-search').value || '').toLowerCase();
    var html = '';
    var shown = 0;
    slots.forEach(function (s, i) {
      var text = s.content || '';
      if (q && text.toLowerCase().indexOf(q) === -1) return;
      shown++;
      var ts = s.timestamp ? new Date(s.timestamp).getTime() : null;
      html += '<div class="clip-row' + (s.frozen ? ' frozen' : '') + '" data-idx="' + i + '">'
        + '<span class="row-num">' + (i + 1) + '</span>'
        + '<span class="row-content" title="' + esc(text) + '">' + esc(text.slice(0, 200) || '(empty)') + '</span>'
        + '<span class="row-ts">' + timeAgo(ts) + '</span></div>';
    });
    list.innerHTML = shown ? html : '<div class="empty">No clips match.</div>';
    list.querySelectorAll('.clip-row').forEach(function (row) {
      row.addEventListener('click', function () {
        var idx = parseInt(row.getAttribute('data-idx'), 10);
        var slot = slots[idx];
        if (!slot || !slot.content) return;
        navigator.clipboard.writeText(slot.content).catch(function () {});
        sendQuiet('CLIPBOARD_PASTE_TO_PAGE', { content: slot.content, slotId: slot.id });
      });
    });
  }

  function load() {
    send('CLIPBOARD_LOAD', {}).then(function (resp) {
      if (resp && resp.slots) slots = resp.slots;
      else if (resp && resp.state && resp.state.slots) slots = resp.state.slots;
      render();
    }).catch(function () { render(); });
  }

  B.runtime.onMessage.addListener(function (msg) {
    if (!msg || msg.type !== 'CLIPBOARD_STATE_UPDATE') return;
    if (msg.payload && msg.payload.state && msg.payload.state.slots) {
      slots = msg.payload.state.slots;
      render();
    }
  });

  document.getElementById('clip-search').addEventListener('input', render);
  document.getElementById('btn-refresh').addEventListener('click', load);
  document.getElementById('btn-dock').addEventListener('click', function () {
    send('CLIPBOARD_POPOUT_DOCK', {}).then(function () { window.close(); }).catch(function () { window.close(); });
  });
  document.getElementById('stay-on-top').addEventListener('change', function (e) {
    stayOnTop = e.target.checked;
    sendQuiet('CLIPBOARD_POPOUT_PIN', { pinned: stayOnTop });
    if (stayOnTop) scheduleRefocus();
    else if (refocusTimer) { clearInterval(refocusTimer); refocusTimer = null; }
  });

  function scheduleRefocus() {
    if (refocusTimer) clearInterval(refocusTimer);
    if (!stayOnTop) return;
    refocusTimer = setInterval(function () {
      sendQuiet('CLIPBOARD_POPOUT_FOCUS', {});
    }, 2500);
  }

  window.addEventListener('blur', function () {
    if (stayOnTop) setTimeout(function () { sendQuiet('CLIPBOARD_POPOUT_FOCUS', {}); }, 120);
  });

  load();
})();
