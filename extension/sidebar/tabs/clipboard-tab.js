// clipboard-tab.js — DANMAN Clipboard Manager v6.9.0
// Pre-ordained 20 slots, system clipboard capture, cross-tab sync, service-worker paste
// Numpad toggle mode, reset-to-default, hotkeys work without sidebar open
// Danny Protocol: Complete implementation, no placeholders
(function() {
  'use strict';

  var container = document.getElementById('tab-clipboard');
  if (!container) return;

  var B = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;

  // ============================================================================
  // CONSTANTS
  // ============================================================================

  var SLOT_COUNT = 20;
  var POLL_INTERVAL_MS = 1500;
  var SYNC_DEBOUNCE_MS = 400;
  var DEFAULT_HOTKEYS = [
    'Alt+1', 'Alt+2', 'Alt+3', 'Alt+4', 'Alt+5',
    'Alt+6', 'Alt+7', 'Alt+8', 'Alt+9', 'Alt+0',
    '', '', '', '', '', '', '', '', '', ''
  ];
  var NUMPAD_HOTKEYS = [
    'Ctrl+Shift+Numpad1', 'Ctrl+Shift+Numpad2', 'Ctrl+Shift+Numpad3',
    'Ctrl+Shift+Numpad4', 'Ctrl+Shift+Numpad5', 'Ctrl+Shift+Numpad6',
    'Ctrl+Shift+Numpad7', 'Ctrl+Shift+Numpad8', 'Ctrl+Shift+Numpad9',
    'Ctrl+Shift+Numpad0', '', '', '', '', '', '', '', '', '', ''
  ];

  // ============================================================================
  // STATE — In-memory, synced to service worker for cross-tab and paste routing
  // ============================================================================

  var slots = [];
  var pollTimerId = null;
  var lastClipboardText = '';
  var searchQuery = '';
  var hotkeyEditSlotIdx = null;
  var syncTimer = null;
  var numpadMode = false;

  for (var i = 0; i < SLOT_COUNT; i++) {
    slots.push({
      id: i + 1,
      content: '',
      contentType: 'text',
      timestamp: null,
      frozen: false,
      hotkey: DEFAULT_HOTKEYS[i] || ''
    });
  }

  // ============================================================================
  // INLINE STYLES — Compact Row Layout (ClipboardFusion style)
  // ============================================================================

  var styleElement = document.createElement('style');
  styleElement.textContent = [
    '.clip-container { display:flex; flex-direction:column; height:100%; background:#0f172a; color:#e2e8f0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; overflow:hidden; }',
    '.clip-header-bar { display:flex; align-items:center; gap:4px; padding:6px 8px; border-bottom:1px solid #334155; background:#0f172a; flex-wrap:wrap; }',
    '.clip-search { flex:1; min-width:80px; padding:4px 8px; background:#1e293b; border:1px solid #334155; border-radius:4px; color:#e2e8f0; font-size:11px; outline:none; box-sizing:border-box; }',
    '.clip-search:focus { border-color:#38bdf8; }',
    '.clip-search::placeholder { color:#64748b; }',
    '.clip-toolbar-btn { padding:3px 7px; background:#1e293b; border:1px solid #334155; color:#94a3b8; border-radius:3px; cursor:pointer; font-size:10px; font-weight:500; transition:all 0.1s; white-space:nowrap; }',
    '.clip-toolbar-btn:hover { background:#334155; color:#e2e8f0; border-color:#475569; }',
    '.clip-toolbar-btn:active { background:#38bdf8; color:#0f172a; border-color:#38bdf8; }',
    '.clip-toolbar-btn.sync-btn { color:#22c55e; border-color:#22c55e44; }',
    '.clip-toolbar-btn.sync-btn:hover { background:#22c55e22; color:#22c55e; }',
    '.clip-stats-bar { display:flex; align-items:center; justify-content:space-between; padding:4px 8px; border-bottom:1px solid #1e293b; font-size:10px; color:#64748b; background:rgba(30,41,59,0.5); }',
    '.clip-list { flex:1; overflow-y:auto; padding:0; margin:0; }',
    '.clip-list::-webkit-scrollbar { width:6px; }',
    '.clip-list::-webkit-scrollbar-track { background:#0f172a; }',
    '.clip-list::-webkit-scrollbar-thumb { background:#334155; border-radius:3px; }',
    '.clip-list::-webkit-scrollbar-thumb:hover { background:#475569; }',
    '.clip-row { display:flex; align-items:center; padding:3px 8px; gap:5px; border-bottom:1px solid #1e293b; cursor:pointer; min-height:28px; transition:background 0.1s; }',
    '.clip-row:hover { background:#1e293b; }',
    '.clip-row.frozen { background:rgba(59,130,246,0.05); border-left:2px solid #3b82f6; padding-left:6px; }',
    '.clip-row.slot-1 { border-left:2px solid #38bdf8; padding-left:6px; background:rgba(56,189,248,0.04); }',
    '.clip-row.active { background:#1e3a5f; }',
    '.clip-row.empty-slot { opacity:0.35; }',
    '.clip-row.empty-slot:hover { opacity:0.6; }',
    '.row-num { flex:0 0 22px; color:#475569; font-size:10px; font-weight:700; text-align:right; font-family:"Consolas","Monaco",monospace; }',
    '.clip-row.slot-1 .row-num { color:#38bdf8; }',
    '.row-hotkey { flex:0 0 44px; font-size:8px; background:#1e293b; color:#64748b; padding:1px 3px; border-radius:2px; text-align:center; cursor:pointer; border:1px solid #334155; font-family:"Consolas","Monaco",monospace; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }',
    '.row-hotkey:hover { background:#334155; color:#e2e8f0; border-color:#475569; }',
    '.row-content { flex:1; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; font-size:11px; color:#cbd5e1; }',
    '.clip-row.slot-1 .row-content { color:#e2e8f0; font-weight:500; }',
    '.clip-row.empty-slot .row-content { color:#334155; font-style:italic; }',
    '.row-timestamp { flex:0 0 auto; min-width:36px; text-align:right; font-size:9px; color:#475569; font-family:"Consolas","Monaco",monospace; }',
    '.row-actions { display:flex; gap:1px; align-items:center; opacity:0; transition:opacity 0.15s; }',
    '.clip-row:hover .row-actions { opacity:1; }',
    '.row-act { padding:2px 4px; border:none; background:transparent; color:#64748b; font-size:10px; cursor:pointer; border-radius:2px; }',
    '.row-act:hover { background:rgba(148,163,184,0.15); color:#e2e8f0; }',
    '.row-act.paste-btn { color:#38bdf8; }',
    '.row-act.paste-btn:hover { background:rgba(56,189,248,0.1); }',
    '.row-act.freeze-btn { color:#94a3b8; }',
    '.row-act.del-btn { color:#ef4444; }',
    '.row-act.del-btn:hover { background:rgba(239,68,68,0.1); }',
    '.clip-row.frozen .freeze-btn { color:#3b82f6; }',
    '.clip-empty-msg { text-align:center; padding:40px 20px; color:#475569; font-size:12px; }',
    '.clip-empty-msg .big-icon { font-size:32px; margin-bottom:8px; display:block; }',
    '.clip-toast { position:fixed; bottom:12px; left:50%; transform:translateX(-50%); background:#22c55e; color:#0f172a; padding:6px 16px; border-radius:6px; font-size:11px; font-weight:600; z-index:99999; box-shadow:0 4px 12px rgba(0,0,0,0.4); pointer-events:none; animation:toastPop 0.2s ease; }',
    '.clip-toast.error { background:#ef4444; color:#fff; }',
    '@keyframes toastPop { from { opacity:0; transform:translateX(-50%) translateY(10px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }',
    '.hk-overlay { position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.65); display:flex; align-items:center; justify-content:center; z-index:9999; }',
    '.hk-dialog { background:#1e293b; border:1px solid #475569; border-radius:8px; padding:16px; width:280px; box-shadow:0 8px 30px rgba(0,0,0,0.5); }',
    '.hk-title { font-size:13px; font-weight:600; color:#e2e8f0; margin-bottom:10px; }',
    '.hk-current { font-size:11px; color:#94a3b8; margin-bottom:10px; padding:6px; background:#0f172a; border-radius:4px; border:1px solid #334155; }',
    '.hk-hint { font-size:10px; color:#64748b; margin-bottom:8px; }',
    '.hk-input { width:100%; padding:6px 8px; background:#0f172a; border:1px solid #334155; border-radius:4px; color:#e2e8f0; font-size:12px; box-sizing:border-box; margin-bottom:10px; outline:none; }',
    '.hk-input:focus { border-color:#38bdf8; }',
    '.hk-btns { display:flex; gap:6px; }',
    '.hk-btn { flex:1; padding:5px; background:#334155; border:1px solid #475569; color:#e2e8f0; border-radius:4px; cursor:pointer; font-size:11px; }',
    '.hk-btn:hover { background:#475569; }',
    '.hk-btn.save { background:#3b82f6; border-color:#3b82f6; }',
    '.hk-btn.save:hover { background:#2563eb; }',
    '.clip-toolbar-btn.numpad-btn { font-family:"Consolas","Monaco",monospace; font-weight:700; letter-spacing:0.5px; }',
    '.clip-toolbar-btn.numpad-btn.active { background:#f59e0b; color:#0f172a; border-color:#f59e0b; }',
    '.clip-toolbar-btn.numpad-btn.active:hover { background:#d97706; border-color:#d97706; }',
    '.clip-toolbar-btn.reset-btn { color:#ef4444; border-color:#ef444444; }',
    '.clip-toolbar-btn.reset-btn:hover { background:#ef444422; color:#ef4444; }'
  ].join('\n');
  document.head.appendChild(styleElement);

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  function escHtml(t) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(t));
    return d.innerHTML;
  }

  function timeAgo(ts) {
    if (!ts) return '';
    var diff = Date.now() - ts;
    var sec = Math.floor(diff / 1000);
    if (sec < 5) return 'now';
    if (sec < 60) return sec + 's';
    var min = Math.floor(sec / 60);
    if (min < 60) return min + 'm';
    var hr = Math.floor(min / 60);
    if (hr < 24) return hr + 'h';
    return Math.floor(hr / 24) + 'd';
  }

  function showToast(msg, isError) {
    var existing = container.querySelector('.clip-toast');
    if (existing) existing.remove();
    var el = document.createElement('div');
    el.className = 'clip-toast' + (isError ? ' error' : '');
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(function() { if (el.parentNode) el.remove(); }, 1800);
  }

  // ============================================================================
  // SYNC — Push/pull slot state to service worker for cross-tab + paste routing
  // ============================================================================

  function buildSyncPayload() {
    return {
      slots: slots.map(function(s) {
        return {
          id: s.id,
          content: s.content,
          contentType: s.contentType,
          timestamp: s.timestamp ? new Date(s.timestamp).toISOString() : null,
          frozen: s.frozen,
          hotkey: s.hotkey,
          sourceUrl: s.sourceUrl || ''
        };
      })
    };
  }

  function debouncedSync() {
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(function() {
      pushStateToBackground();
    }, SYNC_DEBOUNCE_MS);
  }

  function pushStateToBackground() {
    try {
      var state = buildSyncPayload();
      B.runtime.sendMessage({ type: 'CLIPBOARD_BROADCAST', payload: { state: state } }).catch(function() {});
    } catch (err) {
      console.warn('[DANMAN Clipboard] pushStateToBackground error:', err.message);
    }
  }

  async function pullStateFromBackground() {
    try {
      var result = await B.runtime.sendMessage({ type: 'CLIPBOARD_LOAD' });
      if (!result) return false;
      var state = result.state || result;
      if (!state || !Array.isArray(state.slots)) return false;

      var changed = false;
      for (var k = 0; k < Math.min(state.slots.length, SLOT_COUNT); k++) {
        var remote = state.slots[k];
        if (remote && remote.content && !slots[k].frozen) {
          if (slots[k].content !== remote.content) {
            slots[k].content = remote.content;
            slots[k].contentType = remote.contentType || 'text';
            slots[k].timestamp = remote.timestamp ? new Date(remote.timestamp).getTime() : Date.now();
            changed = true;
          }
        }
        // Always pull hotkey mappings if set remotely and local is default or empty
        if (remote && remote.hotkey && !slots[k].hotkey) {
          slots[k].hotkey = remote.hotkey;
          changed = true;
        }
      }
      return changed;
    } catch (err) {
      console.warn('[DANMAN Clipboard] pullStateFromBackground error:', err.message);
      return false;
    }
  }

  async function syncClipboard() {
    // Push first so other tabs get our state
    pushStateToBackground();
    // Then pull to merge anything from other tabs
    var changed = await pullStateFromBackground();
    if (changed) {
      render();
      updateStats();
    }
    showToast('Synced across tabs');
  }

  // ============================================================================
  // SYSTEM CLIPBOARD READING
  // ============================================================================

  /** True while the user is typing into a field somewhere in this document. */
  function isEditingText() {
    try {
      var el = document.activeElement;
      if (!el) return false;
      var tag = (el.tagName || '').toUpperCase();
      if (tag === 'TEXTAREA') return true;
      if (tag === 'INPUT') {
        var textTypes = ['text', 'email', 'password', 'search', 'url', 'tel', 'number', ''];
        return textTypes.indexOf((el.type || 'text').toLowerCase()) !== -1;
      }
      if (el.isContentEditable) return true;
    } catch (_) {}
    return false;
  }

  /**
   * Read the OS clipboard.
   *
   * The execCommand fallback has to focus a scratch <textarea>, which steals
   * focus from whatever the user is typing into. That is fine for a read the
   * user just asked for, and unacceptable for the 1.5 s background poll — it
   * used to yank the caret out of the DANMAN chat box (same document) mid-word
   * every time navigator.clipboard.readText() was denied. So the fallback is
   * opt-in, and it puts focus and selection back where it found them.
   */
  async function readSystemClipboard(allowFocusFallback) {
    try {
      var text = await navigator.clipboard.readText();
      return text || '';
    } catch (err) {
      if (!allowFocusFallback) return '';
      console.warn('[DANMAN Clipboard] navigator.clipboard.readText failed:', err.message);
      var previous = document.activeElement;
      var prevStart = null;
      var prevEnd = null;
      try {
        prevStart = previous.selectionStart;
        prevEnd = previous.selectionEnd;
      } catch (_) {}
      try {
        var textarea = document.createElement('textarea');
        textarea.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;';
        document.body.appendChild(textarea);
        textarea.focus();
        document.execCommand('paste');
        var result = textarea.value;
        document.body.removeChild(textarea);
        return result || '';
      } catch (fallbackErr) {
        console.warn('[DANMAN Clipboard] execCommand paste fallback failed:', fallbackErr.message);
        return '';
      } finally {
        try {
          if (previous && previous !== document.body && document.body.contains(previous)) {
            previous.focus();
            if (prevStart !== null && prevEnd !== null && previous.setSelectionRange) {
              previous.setSelectionRange(prevStart, prevEnd);
            }
          }
        } catch (_) {}
      }
    }
  }

  // ============================================================================
  // CASCADE LOGIC — Push new content into first unfrozen slot, cascade down
  // ============================================================================

  function cascadeNewContent(text) {
    if (!text || typeof text !== 'string' || !text.trim()) return false;
    if (slots[0].content === text) return false;

    var unfrozenIndices = [];
    for (var i = 0; i < SLOT_COUNT; i++) {
      if (!slots[i].frozen) unfrozenIndices.push(i);
    }
    if (unfrozenIndices.length === 0) return false;

    for (var j = unfrozenIndices.length - 1; j > 0; j--) {
      var toIdx = unfrozenIndices[j];
      var fromIdx = unfrozenIndices[j - 1];
      slots[toIdx].content = slots[fromIdx].content;
      slots[toIdx].contentType = slots[fromIdx].contentType;
      slots[toIdx].timestamp = slots[fromIdx].timestamp;
    }

    var firstUnfrozen = unfrozenIndices[0];
    slots[firstUnfrozen].content = text;
    slots[firstUnfrozen].contentType = 'text';
    slots[firstUnfrozen].timestamp = Date.now();

    debouncedSync();
    return true;
  }

  // ============================================================================
  // CLIPBOARD POLLING
  // ============================================================================

  async function pollClipboard() {
    // Never poll over the user's shoulder: a poll that reaches the
    // execCommand fallback moves focus, and a clipboard read prompt on top of
    // a half-typed message is just as disruptive. Typing wins; the next tick
    // (or a copy event, which we also listen for) picks the clip up.
    if (isEditingText() || document.hidden || !document.hasFocus()) return;
    var current = await readSystemClipboard(false);
    if (current && current !== lastClipboardText) {
      lastClipboardText = current;
      var changed = cascadeNewContent(current);
      if (changed) {
        render();
        updateStats();
      }
    }
  }

  function startPolling() {
    pollClipboard();
    if (pollTimerId) clearInterval(pollTimerId);
    pollTimerId = setInterval(pollClipboard, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (pollTimerId) {
      clearInterval(pollTimerId);
      pollTimerId = null;
    }
  }

  // ============================================================================
  // LISTEN FOR CONTENT SCRIPT CAPTURES + CROSS-TAB SYNC
  // ============================================================================

  window.addEventListener('message', function(e) {
    // Content script posts into the sidebar iframe → e.source is parent, not window.
    // Also accept same-window messages (tests / internal).
    if (e.source !== window && e.source !== window.parent) return;
    var msg = e.data;
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'GPD_CLIPBOARD_CAPTURE') {
      var text = msg.content || '';
      if (text && text !== lastClipboardText) {
        lastClipboardText = text;
        var changed = cascadeNewContent(text);
        if (changed) {
          render();
          updateStats();
        }
      }
    }

    if (msg.type === 'CLIPBOARD_STATE_UPDATE') {
      if (msg.state && msg.state.slots && Array.isArray(msg.state.slots)) {
        for (var k = 0; k < Math.min(msg.state.slots.length, SLOT_COUNT); k++) {
          if (!slots[k].frozen) {
            var remote = msg.state.slots[k];
            if (remote && remote.content) {
              slots[k].content = remote.content;
              slots[k].contentType = remote.contentType || 'text';
              slots[k].timestamp = remote.timestamp ? new Date(remote.timestamp).getTime() : Date.now();
            }
          }
        }
        render();
        updateStats();
      }
    }
  });

  // Global storage sync — other tabs / AHK-driven captures land in chrome.storage
  try {
    B.storage.onChanged.addListener(function(changes, area) {
      if (area !== 'local' || !changes.gpd_clipboard_state) return;
      var nv = changes.gpd_clipboard_state.newValue;
      var remoteSlots = (nv && nv.state && nv.state.slots) || (nv && nv.slots) || null;
      if (!remoteSlots || !Array.isArray(remoteSlots)) return;
      for (var i = 0; i < Math.min(remoteSlots.length, SLOT_COUNT); i++) {
        if (slots[i].frozen) continue;
        var r = remoteSlots[i];
        if (!r) continue;
        slots[i].content = r.content || '';
        slots[i].contentType = r.contentType || 'text';
        slots[i].timestamp = r.timestamp ? new Date(r.timestamp).getTime() : slots[i].timestamp;
        if (r.hotkey != null) slots[i].hotkey = r.hotkey;
        if (r.frozen != null) slots[i].frozen = !!r.frozen;
      }
      if (remoteSlots[0] && remoteSlots[0].content) lastClipboardText = remoteSlots[0].content;
      render();
      updateStats();
    });
  } catch (_) {}

  // ============================================================================
  // PASTE — Write to system clipboard + route through service worker to page
  // ============================================================================

  async function pasteSlot(idx) {
    var slot = slots[idx];
    if (!slot || !slot.content) return;

    // Step 1: Write the slot content onto the system clipboard
    // This is the primary mechanism — content reaches the OS clipboard immediately
    try {
      await navigator.clipboard.writeText(slot.content);
    } catch (err) {
      console.warn('[DANMAN Clipboard] writeText to system clipboard failed:', err.message);
      // Fallback: try execCommand copy
      try {
        var ta = document.createElement('textarea');
        ta.value = slot.content;
        ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      } catch (fbErr) {
        console.warn('[DANMAN Clipboard] execCommand copy fallback failed:', fbErr.message);
        showToast('Clipboard write failed', true);
        return;
      }
    }

    // Step 2: Send to service worker to auto-paste into the active tab
    // The service worker forwards to the content script which tracks the
    // last focused editable element and inserts the text there
    try {
      B.runtime.sendMessage({
        type: 'CLIPBOARD_PASTE_TO_PAGE',
        payload: {
          content: slot.content,
          contentType: slot.contentType || 'text'
        }
      }).catch(function(err) {
        console.warn('[DANMAN Clipboard] PASTE_TO_PAGE sendMessage failed:', err.message);
      });
    } catch (err) {
      console.warn('[DANMAN Clipboard] PASTE_TO_PAGE error:', err.message);
    }

    showToast('Slot ' + (idx + 1) + ' pasted');
  }

  // ============================================================================
  // SLOT ACTIONS
  // ============================================================================

  function toggleFreeze(idx) {
    if (idx === 0) return;
    slots[idx].frozen = !slots[idx].frozen;
    render();
    updateStats();
    debouncedSync();
  }

  function deleteSlot(idx) {
    slots[idx].content = '';
    slots[idx].contentType = 'text';
    slots[idx].timestamp = null;
    render();
    updateStats();
    debouncedSync();
  }

  function clearAll() {
    for (var i = 0; i < SLOT_COUNT; i++) {
      if (!slots[i].frozen) {
        slots[i].content = '';
        slots[i].contentType = 'text';
        slots[i].timestamp = null;
      }
    }
    lastClipboardText = '';
    render();
    updateStats();
    debouncedSync();
  }

  // ============================================================================
  // EXPORT (CSV / TXT)
  // ============================================================================

  function exportCSV() {
    var csv = 'Slot,Hotkey,Content,Type,Frozen,Timestamp\n';
    for (var i = 0; i < SLOT_COUNT; i++) {
      var s = slots[i];
      if (!s.content) continue;
      var content = (s.content || '').replace(/"/g, '""');
      var ts = s.timestamp ? new Date(s.timestamp).toISOString() : '';
      csv += (i + 1) + ',"' + (s.hotkey || '') + '","' + content + '",' + s.contentType + ',' + s.frozen + ',' + ts + '\n';
    }
    var blob = new Blob([csv], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'danman_clipboard_' + new Date().toISOString().replace(/[:.]/g, '-') + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportTXT() {
    var lines = ['DANMAN Clipboard Export', '='.repeat(50), ''];
    for (var i = 0; i < SLOT_COUNT; i++) {
      var s = slots[i];
      if (!s.content) continue;
      var ts = s.timestamp ? new Date(s.timestamp).toISOString() : 'N/A';
      lines.push('[Slot ' + (i + 1) + '] ' + (s.hotkey || 'no hotkey') + ' | ' + ts);
      lines.push(s.content);
      lines.push('-'.repeat(50));
      lines.push('');
    }
    var blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'danman_clipboard_' + new Date().toISOString().replace(/[:.]/g, '-') + '.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  // ============================================================================
  // HOTKEY REMAP DIALOG — Supports up to 3-key combos (e.g. Ctrl+Shift+V)
  // ============================================================================

  function showHotkeyRemapDialog(idx) {
    hotkeyEditSlotIdx = idx;
    var current = slots[idx].hotkey || 'None';

    var overlay = document.createElement('div');
    overlay.className = 'hk-overlay';
    overlay.innerHTML =
      '<div class="hk-dialog">' +
        '<div class="hk-title">Remap Hotkey \u2014 Slot ' + (idx + 1) + '</div>' +
        '<div class="hk-current">Current: <strong>' + escHtml(current) + '</strong></div>' +
        '<div class="hk-hint">Press up to 3-key combo (e.g. Ctrl+Shift+V, Alt+3)</div>' +
        '<input type="text" class="hk-input" id="hk-inp" placeholder="Press a key combo..." autocomplete="off" />' +
        '<div class="hk-btns">' +
          '<button class="hk-btn" id="hk-cancel">Cancel</button>' +
          '<button class="hk-btn" id="hk-clear">Clear</button>' +
          '<button class="hk-btn save" id="hk-save">Save</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    var inp = overlay.querySelector('#hk-inp');
    var captured = '';

    inp.focus();

    inp.addEventListener('keydown', function(e) {
      e.preventDefault();
      e.stopPropagation();
      var parts = [];
      if (e.ctrlKey) parts.push('Ctrl');
      if (e.shiftKey) parts.push('Shift');
      if (e.altKey) parts.push('Alt');
      if (e.metaKey) parts.push('Meta');
      var key = e.key;
      if (key === ' ') key = 'Space';
      else if (key.length === 1) key = key.toUpperCase();
      // Don't add modifier-only keys
      if (!/^(Control|Shift|Alt|Meta)$/.test(key)) parts.push(key);

      // Enforce max 3 parts
      if (parts.length > 3) parts = parts.slice(0, 3);

      captured = parts.join('+');
      inp.value = captured;
    });

    overlay.querySelector('#hk-cancel').addEventListener('click', function() {
      overlay.remove();
      hotkeyEditSlotIdx = null;
    });

    overlay.querySelector('#hk-clear').addEventListener('click', function() {
      slots[idx].hotkey = '';
      overlay.remove();
      hotkeyEditSlotIdx = null;
      render();
      debouncedSync();
    });

    overlay.querySelector('#hk-save').addEventListener('click', function() {
      if (captured) {
        // Check for conflicts with other slots
        for (var c = 0; c < SLOT_COUNT; c++) {
          if (c !== idx && slots[c].hotkey === captured) {
            slots[c].hotkey = '';
          }
        }
        slots[idx].hotkey = captured;
      }
      overlay.remove();
      hotkeyEditSlotIdx = null;
      render();
      debouncedSync();
    });

    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) {
        overlay.remove();
        hotkeyEditSlotIdx = null;
      }
    });
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  function render() {
    var filter = searchQuery.toLowerCase();
    var listEl = container.querySelector('.clip-list');
    if (!listEl) return;

    var html = '';
    var visibleCount = 0;

    for (var i = 0; i < SLOT_COUNT; i++) {
      var s = slots[i];
      var preview = (s.content || '').substring(0, 80);
      var isEmpty = !s.content;

      if (filter && !isEmpty) {
        if (preview.toLowerCase().indexOf(filter) === -1) continue;
      }

      visibleCount++;

      var classes = 'clip-row';
      if (i === 0) classes += ' slot-1';
      if (s.frozen) classes += ' frozen';
      if (isEmpty) classes += ' empty-slot';

      var hotkeyBadge = '';
      if (s.hotkey) {
        hotkeyBadge = '<div class="row-hotkey" data-idx="' + i + '" title="Click to remap: ' + escHtml(s.hotkey) + '">' + escHtml(s.hotkey) + '</div>';
      } else {
        hotkeyBadge = '<div class="row-hotkey" data-idx="' + i + '" title="Click to set hotkey">---</div>';
      }

      var contentHtml;
      if (isEmpty) {
        contentHtml = '<div class="row-content">[ empty ]</div>';
      } else {
        contentHtml = '<div class="row-content">' + escHtml(preview) + '</div>';
      }

      var tsHtml = '<div class="row-timestamp">' + timeAgo(s.timestamp) + '</div>';

      var actionsHtml = '<div class="row-actions">';
      if (!isEmpty) {
        actionsHtml += '<button class="row-act paste-btn" data-act="paste" data-idx="' + i + '" title="Paste to active field">\u270e</button>';
      }
      if (i > 0) {
        actionsHtml += '<button class="row-act freeze-btn" data-act="freeze" data-idx="' + i + '" title="' + (s.frozen ? 'Unfreeze' : 'Freeze') + '">' + (s.frozen ? '\uD83D\uDD12' : '\uD83D\uDCCC') + '</button>';
      }
      if (!isEmpty) {
        actionsHtml += '<button class="row-act del-btn" data-act="delete" data-idx="' + i + '" title="Clear slot">\u2715</button>';
      }
      actionsHtml += '</div>';

      html += '<div class="' + classes + '" data-idx="' + i + '">';
      html += '<div class="row-num">' + (i + 1) + '</div>';
      html += hotkeyBadge;
      html += contentHtml;
      html += tsHtml;
      html += actionsHtml;
      html += '</div>';
    }

    if (visibleCount === 0 && filter) {
      html = '<div class="clip-empty-msg"><span class="big-icon">\uD83D\uDD0D</span>No matches for "' + escHtml(filter) + '"</div>';
    }

    listEl.innerHTML = html;
    attachRowListeners();
  }

  function updateStats() {
    var statsEl = container.querySelector('.clip-stats-bar');
    if (!statsEl) return;
    var filled = 0;
    var frozenCount = 0;
    for (var i = 0; i < SLOT_COUNT; i++) {
      if (slots[i].content) filled++;
      if (slots[i].frozen) frozenCount++;
    }
    statsEl.innerHTML =
      '<span>' + filled + '/' + SLOT_COUNT + ' slots used</span>' +
      '<span>' + frozenCount + ' frozen</span>' +
      '<span style="color:#22c55e;">\u25cf polling</span>';
  }

  function attachRowListeners() {
    container.querySelectorAll('.clip-row').forEach(function(row) {
      row.addEventListener('click', function() {
        container.querySelectorAll('.clip-row').forEach(function(r) { r.classList.remove('active'); });
        row.classList.add('active');
      });
      // Double-click to paste
      row.addEventListener('dblclick', function() {
        var idx = parseInt(row.dataset.idx);
        if (!isNaN(idx) && slots[idx] && slots[idx].content) {
          pasteSlot(idx);
        }
      });
    });

    container.querySelectorAll('.row-act').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var idx = parseInt(btn.dataset.idx);
        var act = btn.dataset.act;
        if (act === 'paste') pasteSlot(idx);
        else if (act === 'freeze') toggleFreeze(idx);
        else if (act === 'delete') deleteSlot(idx);
      });
    });

    container.querySelectorAll('.row-hotkey').forEach(function(badge) {
      badge.addEventListener('click', function(e) {
        e.stopPropagation();
        showHotkeyRemapDialog(parseInt(badge.dataset.idx));
      });
    });
  }

  // ============================================================================
  // NUMPAD MODE — Toggle Ctrl+Shift+Numpad1-0 for slots 1-10
  // ============================================================================

  function loadNumpadMode() {
    B.runtime.sendMessage({ type: 'CLIPBOARD_GET_NUMPAD_MODE' }).then(function(resp) {
      if (resp && typeof resp.enabled === 'boolean') {
        numpadMode = resp.enabled;
        updateNumpadButtonUI();
        if (numpadMode) applyNumpadHotkeys();
      }
    }).catch(function() {});
  }

  function toggleNumpadMode() {
    numpadMode = !numpadMode;
    updateNumpadButtonUI();
    if (numpadMode) {
      applyNumpadHotkeys();
    } else {
      restoreDefaultHotkeys();
    }
    // Persist to storage via service worker
    B.runtime.sendMessage({
      type: 'CLIPBOARD_SET_NUMPAD_MODE',
      payload: { enabled: numpadMode }
    }).catch(function() {});
    debouncedSync();
    render();
    showToast(numpadMode ? 'Numpad mode ON — Ctrl+Shift+Numpad1-0' : 'Numpad mode OFF — custom hotkeys');
  }

  function applyNumpadHotkeys() {
    for (var i = 0; i < SLOT_COUNT; i++) {
      if (NUMPAD_HOTKEYS[i]) {
        slots[i].hotkey = NUMPAD_HOTKEYS[i];
      }
    }
  }

  function restoreDefaultHotkeys() {
    for (var i = 0; i < SLOT_COUNT; i++) {
      slots[i].hotkey = DEFAULT_HOTKEYS[i] || '';
    }
  }

  function resetToDefaults() {
    numpadMode = false;
    updateNumpadButtonUI();
    // Restore all hotkeys to factory defaults
    for (var i = 0; i < SLOT_COUNT; i++) {
      slots[i].hotkey = DEFAULT_HOTKEYS[i] || '';
      slots[i].frozen = false;
    }
    // Persist numpad mode off
    B.runtime.sendMessage({
      type: 'CLIPBOARD_SET_NUMPAD_MODE',
      payload: { enabled: false }
    }).catch(function() {});
    debouncedSync();
    render();
    updateStats();
    showToast('Reset to defaults — all hotkeys and freezes cleared');
  }

  function updateNumpadButtonUI() {
    var btn = container.querySelector('#btn-numpad');
    if (!btn) return;
    if (numpadMode) {
      btn.classList.add('active');
      btn.title = 'Numpad mode ON — Ctrl+Shift+Numpad1-0 mapped to slots 1-10. Click to disable.';
    } else {
      btn.classList.remove('active');
      btn.title = 'Enable Numpad mode — maps Ctrl+Shift+Numpad1-0 to slots 1-10';
    }
  }

  // ============================================================================
  // BUILD UI
  // ============================================================================

  function buildUI() {
    container.innerHTML =
      '<div class="clip-header-bar">' +
        '<input type="text" class="clip-search" id="clip-search" placeholder="Filter slots..." />' +
        '<button class="clip-toolbar-btn sync-btn" id="btn-sync" title="Sync slots across all tabs">\u21C4 Sync</button>' +
        '<button class="clip-toolbar-btn numpad-btn" id="btn-numpad" title="Enable Numpad mode — maps Ctrl+Shift+Numpad1-0 to slots 1-10">NUM</button>' +
        '<button class="clip-toolbar-btn" id="btn-clear" title="Clear unfrozen slots">Clear</button>' +
        '<button class="clip-toolbar-btn" id="btn-csv" title="Export CSV">CSV</button>' +
        '<button class="clip-toolbar-btn" id="btn-txt" title="Export TXT">TXT</button>' +
        '<button class="clip-toolbar-btn reset-btn" id="btn-reset" title="Reset all hotkeys and freezes to factory defaults">\u21BA Reset</button>' +
        '<button class="clip-toolbar-btn" id="btn-popout" title="Pop out clipboard viewer (undock)">\u2197 Pop Out</button>' +
        '<button class="clip-toolbar-btn" id="btn-clip-logs" title="Show detailed clipboard capture logs">Logs</button>' +
      '</div>' +
      '<div class="clip-stats-bar"></div>' +
      '<div class="clip-list"></div>';

    container.querySelector('#clip-search').addEventListener('input', function(e) {
      searchQuery = e.target.value;
      render();
    });

    container.querySelector('#btn-sync').addEventListener('click', syncClipboard);
    container.querySelector('#btn-numpad').addEventListener('click', toggleNumpadMode);
    container.querySelector('#btn-clear').addEventListener('click', clearAll);
    container.querySelector('#btn-csv').addEventListener('click', exportCSV);
    container.querySelector('#btn-txt').addEventListener('click', exportTXT);
    container.querySelector('#btn-reset').addEventListener('click', resetToDefaults);
    var popoutBtn = container.querySelector('#btn-popout');
    if (popoutBtn) {
      popoutBtn.addEventListener('click', function () {
        B.runtime.sendMessage({ type: 'CLIPBOARD_POPOUT_OPEN' }).catch(function () {});
      });
    }
    var logsBtn = container.querySelector('#btn-clip-logs');
    if (logsBtn) {
      logsBtn.addEventListener('click', function () {
        B.runtime.sendMessage({ type: 'CLIPBOARD_GET_EVENT_LOG', payload: { limit: 40 } }).then(function (resp) {
          var events = (resp && resp.events) || [];
          var text = events.length
            ? events.map(function (e) {
                return '[' + (e.iso || '') + '] ' + (e.level || '') + ' ' + (e.event || '') + ' — ' + (e.detail || '') +
                  (e.extra ? ' | ' + JSON.stringify(e.extra).slice(0, 180) : '');
              }).join('\n')
            : 'No clipboard events logged yet. Copy/paste or hover the DANMAN edge tab to generate logs.';
          var w = window.open('', 'gpd-clip-logs', 'width=720,height=480');
          if (w) {
            w.document.write('<pre style="font:12px/1.4 Consolas,monospace;white-space:pre-wrap;padding:12px;background:#0f172a;color:#e2e8f0;">' +
              text.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</pre>');
          } else if (window.Toast) {
            Toast.info('Clipboard log: ' + events.length + ' events (popup blocked)');
          }
        }).catch(function (err) {
          if (window.Toast) Toast.error('Could not load clipboard logs: ' + (err.message || err));
        });
      });
    }

    render();
    updateStats();
    startPolling();
    loadNumpadMode();
  }

  // ============================================================================
  // TAB VISIBILITY — Start/stop polling, auto-sync on show
  // ============================================================================

  window.addEventListener('tab-activated', function(e) {
    if (e.detail && e.detail.tabId === 'tab-clipboard') {
      startPolling();
      // Auto-sync when clipboard tab is opened
      pullStateFromBackground().then(function(changed) {
        if (changed) {
          render();
          updateStats();
        }
      });
    }
  });

  document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
      stopPolling();
    }
  });

  // ============================================================================
  // INIT — Build UI, pull existing state from background
  // ============================================================================

  buildUI();

  // Pull existing state on first load so cross-tab clips are available
  pullStateFromBackground().then(function(changed) {
    if (changed) {
      render();
      updateStats();
    }
  });

})();
// END: clipboard-tab.js — DANMAN Clipboard Manager v6.9.0
