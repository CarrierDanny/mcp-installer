/**
 * VERSION: V002R046
 * DATE: 2026-09-15
 * CHANGE: Extension-origin check on window messages; frame token on sendToSidebar
 * HISTORY:
 *   V001R690 2026-08-26 Baseline import + Firefox messaging/clipboard fixes (unstamped)
 */
// content/clipboard-listener.js — DANMAN Clipboard Listener v6.9.0
// Captures copy/cut events, tracks last focused editable element,
// handles paste-from-slot via service worker, supports custom hotkey combos
// Numpad mode: Ctrl+Shift+Numpad1-0 maps to clipboard slots 1-10
(function() {
  'use strict';

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  var SIDEBAR_CONTAINER_ID = 'gpd-sidebar-container';
  var SIDEBAR_FRAME_ID = 'gpd-sidebar';
  var B = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;

  // Frame trust — see content-main.js. Messages from the sidebar must carry
  // the extension origin; messages we post to it carry the per-tab token.
  var EXT_ORIGIN = (function () {
    try { return String(B.runtime.getURL('')).replace(/\/+$/, ''); } catch (_) { return ''; }
  })();
  var frameTokenReady = (function fetchFrameToken(attempt) {
    return new Promise(function (resolve) {
      var p;
      try { p = B.runtime.sendMessage({ type: 'FRAME_TOKEN_GET' }); } catch (err) { p = Promise.reject(err); }
      Promise.resolve(p).then(function (r) {
        if (!r || !r.token) throw new Error('no frame token');
        resolve(r.token);
      }).catch(function () {
        if (attempt < 5) setTimeout(function () { resolve(fetchFrameToken(attempt + 1)); }, 400 * (attempt + 1));
        else resolve(null);
      });
    });
  })(0);

  // ============================================================================
  // STATE — Last focused editable element (tracked before sidebar steals focus)
  // ============================================================================

  var lastFocusedEditable = null;
  var lastFocusedSelection = null; // { start, end } for input/textarea
  var numpadModeEnabled = false;

  // Load numpad mode state from storage on init
  function loadNumpadModeState() {
    try {
      B.runtime.sendMessage({ type: 'CLIPBOARD_GET_NUMPAD_MODE' }).then(function(resp) {
        if (resp && typeof resp.enabled === 'boolean') {
          numpadModeEnabled = resp.enabled;
        }
      }).catch(function() {});
    } catch (_) {}
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  function getSidebarFrame() {
    try {
      var container = document.getElementById(SIDEBAR_CONTAINER_ID);
      if (!container) return null;
      return container.querySelector('#' + SIDEBAR_FRAME_ID);
    } catch (_) {
      return null;
    }
  }

  function sendToSidebar(message) {
    frameTokenReady.then(function (token) {
      try {
        var frame = getSidebarFrame();
        if (frame && frame.contentWindow) {
          frame.contentWindow.postMessage(Object.assign({}, message, { __t: token }), EXT_ORIGIN || '*');
        }
      } catch (err) {
        console.warn('[DANMAN Clipboard] sendToSidebar error:', err);
      }
    });
  }

  function sendToServiceWorker(message) {
    try {
      B.runtime.sendMessage(message).catch(function() {});
    } catch (_) {
      // Service worker may not be ready — silent fail
    }
  }

  function isElementEditable(el) {
    if (!el || !el.tagName) return false;
    var tag = el.tagName.toUpperCase();
    if (tag === 'TEXTAREA') return true;
    if (tag === 'INPUT') {
      var textTypes = ['text', 'email', 'password', 'search', 'url', 'tel', 'number'];
      return textTypes.indexOf(el.type || 'text') !== -1;
    }
    if (el.contentEditable === 'true') return true;
    // Walk up parents for contenteditable containers
    var parent = el.parentElement;
    while (parent) {
      if (parent.contentEditable === 'true') return true;
      parent = parent.parentElement;
    }
    return false;
  }

  function isInsideSidebar(el) {
    if (!el) return false;
    try {
      if (el.id === SIDEBAR_CONTAINER_ID || el.id === SIDEBAR_FRAME_ID) return true;
      var parent = el.parentElement;
      while (parent) {
        if (parent.id === SIDEBAR_CONTAINER_ID) return true;
        parent = parent.parentElement;
      }
    } catch (_) {}
    return false;
  }

  async function blobToDataUrl(blob) {
    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onload = function() { resolve(reader.result); };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // ============================================================================
  // FOCUS TRACKING — Remember the last editable element BEFORE sidebar steals it
  // ============================================================================

  function handleFocusIn(e) {
    var el = e.target;
    if (!el) return;

    // Skip if the focus moved to the sidebar container or its iframe
    if (isInsideSidebar(el)) return;

    // Check if it's an editable element or inside one
    if (isElementEditable(el)) {
      lastFocusedEditable = el;
      // Save cursor position for input/textarea
      var tag = el.tagName.toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        lastFocusedSelection = {
          start: el.selectionStart || 0,
          end: el.selectionEnd || 0
        };
      } else {
        lastFocusedSelection = null;
      }
    }
  }

  // Update selection position on every selection change inside tracked element
  function handleSelectionChange() {
    if (!lastFocusedEditable) return;
    var el = document.activeElement;
    if (el !== lastFocusedEditable) return;
    if (isInsideSidebar(el)) return;
    var tag = el.tagName.toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      lastFocusedSelection = {
        start: el.selectionStart || 0,
        end: el.selectionEnd || 0
      };
    }
  }

  document.addEventListener('focusin', handleFocusIn, true);
  document.addEventListener('selectionchange', handleSelectionChange, true);

  // ============================================================================
  // CLIPBOARD EVENT HANDLER (copy / cut)
  // ============================================================================

  async function handleClipboardEvent(event) {
    try {
      var clipboardData = event.clipboardData;
      if (!clipboardData) return;

      var timestamp = new Date().toISOString();
      var sourceUrl = window.location.href;

      // Check for image data first
      var items = clipboardData.items;
      if (items && items.length > 0) {
        for (var i = 0; i < items.length; i++) {
          var item = items[i];
          if (item.type && item.type.indexOf('image/') === 0) {
            try {
              var blob = item.getAsFile();
              if (blob) {
                var dataUrl = await blobToDataUrl(blob);
                var imgMsg = {
                  type: 'GPD_CLIPBOARD_CAPTURE',
                  content: dataUrl,
                  contentType: 'image',
                  timestamp: timestamp,
                  sourceUrl: sourceUrl
                };
                sendToSidebar(imgMsg);
                sendToServiceWorker({ type: 'CLIPBOARD_NEW_CAPTURE', payload: imgMsg });
                return;
              }
            } catch (imgErr) {
              console.warn('[DANMAN Clipboard] Image processing error:', imgErr);
            }
          }
        }
      }

      // Try HTML data
      var htmlData = clipboardData.getData('text/html');
      if (htmlData && htmlData.trim()) {
        var plainText = clipboardData.getData('text/plain') || htmlData;
        var htmlMsg = {
          type: 'GPD_CLIPBOARD_CAPTURE',
          content: plainText,
          htmlContent: htmlData,
          contentType: 'html',
          timestamp: timestamp,
          sourceUrl: sourceUrl
        };
        sendToSidebar(htmlMsg);
        sendToServiceWorker({ type: 'CLIPBOARD_NEW_CAPTURE', payload: htmlMsg });
        return;
      }

      // Fall back to plain text
      var textData = clipboardData.getData('text/plain');
      if (textData && textData.trim()) {
        var textMsg = {
          type: 'GPD_CLIPBOARD_CAPTURE',
          content: textData,
          contentType: 'text',
          timestamp: timestamp,
          sourceUrl: sourceUrl
        };
        sendToSidebar(textMsg);
        sendToServiceWorker({ type: 'CLIPBOARD_NEW_CAPTURE', payload: textMsg });
        return;
      }
    } catch (err) {
      console.error('[DANMAN Clipboard] handleClipboardEvent error:', err);
    }
  }

  // ============================================================================
  // INSERT INTO ELEMENT — Programmatic paste into a DOM element
  // ============================================================================

  function insertIntoElement(element, content, contentType) {
    try {
      if (!element) return false;
      var tag = element.tagName.toUpperCase();
      var isContentEditable = element.contentEditable === 'true';

      // Re-focus the element first
      element.focus();

      // TEXT INPUT / TEXTAREA
      if (tag === 'TEXTAREA' || tag === 'INPUT') {
        if (contentType === 'image') {
          console.warn('[DANMAN Clipboard] Cannot paste image into text input');
          return false;
        }
        // Restore cursor position if we tracked it
        var start = 0;
        var end = 0;
        if (lastFocusedSelection && lastFocusedEditable === element) {
          start = lastFocusedSelection.start;
          end = lastFocusedSelection.end;
        } else {
          start = element.selectionStart || 0;
          end = element.selectionEnd || 0;
        }
        // Set selection range before inserting
        try {
          element.setSelectionRange(start, end);
        } catch (_) {}

        var before = element.value.substring(0, start);
        var after = element.value.substring(end);
        element.value = before + content + after;
        var newPos = start + content.length;
        try {
          element.setSelectionRange(newPos, newPos);
        } catch (_) {}
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }

      // CONTENTEDITABLE ELEMENTS
      if (isContentEditable) {
        if (contentType === 'image') {
          try {
            document.execCommand('insertHTML', false, '<img src="' + content + '" style="max-width:100%;height:auto;" />');
          } catch (_) {
            var img = document.createElement('img');
            img.src = content;
            img.style.maxWidth = '100%';
            img.style.height = 'auto';
            element.appendChild(img);
          }
        } else if (contentType === 'html') {
          try {
            document.execCommand('insertHTML', false, content);
          } catch (_) {
            element.textContent += content;
          }
        } else {
          try {
            document.execCommand('insertText', false, content);
          } catch (_) {
            element.textContent += content;
          }
        }
        element.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }

      return false;
    } catch (err) {
      console.error('[DANMAN Clipboard] insertIntoElement error:', err);
      return false;
    }
  }

  // ============================================================================
  // HANDLE PASTE FROM SERVICE WORKER
  // The service worker sends CLIPBOARD_PASTE_CONTENT when the user clicks
  // paste in the sidebar or uses a hotkey. We use the tracked lastFocusedEditable
  // to paste into the correct element on the page.
  // ============================================================================

  function handlePasteFromServiceWorker(payload) {
    try {
      var content = payload.content;
      var contentType = payload.contentType || 'text';
      if (!content) return;

      // Use the tracked last-focused editable element
      var el = lastFocusedEditable;

      // Fallback: check current active element
      if (!el || !document.body.contains(el)) {
        el = document.activeElement;
        if (!isElementEditable(el)) el = null;
      }

      if (el) {
        var inserted = insertIntoElement(el, content, contentType);
        if (inserted) {
          console.log('[DANMAN Clipboard] Pasted into', el.tagName, el.id || el.className || '');
        } else {
          console.warn('[DANMAN Clipboard] insertIntoElement returned false');
        }
      } else {
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(content).then(function () {
              document.execCommand('paste');
            }).catch(function () {});
          }
        } catch (e2) {}
        console.warn('[DANMAN Clipboard] No focused editable element — try clicking the field first, then hotkey again');
      }
    } catch (err) {
      console.error('[DANMAN Clipboard] handlePasteFromServiceWorker error:', err);
    }
  }

  // ============================================================================
  // HOTKEY HANDLER — Supports arbitrary combos (up to 3 keys)
  // Captures the combo string and sends to service worker for lookup.
  // Service worker matches it against the hotkey→slot map and sends paste back.
  // ============================================================================

  function handleHotkey(event) {
    // Build combo string from the keydown event
    // Must have at least one modifier to avoid capturing normal typing
    if (!event.altKey && !event.ctrlKey && !event.metaKey) return;
    // Shift alone is not a trigger (shift is used in typing)
    if (event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) return;

    var parts = [];
    if (event.ctrlKey) parts.push('Ctrl');
    if (event.shiftKey) parts.push('Shift');
    if (event.altKey) parts.push('Alt');
    if (event.metaKey) parts.push('Meta');

    var key = event.key;
    if (key === ' ') key = 'Space';
    else if (key.length === 1) key = key.toUpperCase();

    // Skip modifier-only presses
    if (/^(Control|Shift|Alt|Meta)$/.test(key)) return;

    // Map numpad key codes when numpad mode is active (Ctrl+Shift+Numpad*)
    if (numpadModeEnabled && event.ctrlKey && event.shiftKey && event.code && event.code.indexOf('Numpad') === 0) {
      key = event.code;
    }

    // Alt + Numpad (common "Alt+NumRow" expectation) → same slots as Alt+1..0
    if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.code && /^Numpad[0-9]$/.test(event.code)) {
      key = event.code.replace('Numpad', '');
      parts = ['Alt', key];
    } else {
      parts.push(key);
    }

    if (parts.length > 3) parts = parts.slice(0, 3);

    var combo = parts.join('+');

    // Send to service worker for hotkey lookup
    // The SW will check if this combo matches any slot's hotkey
    // If it does, it sends CLIPBOARD_PASTE_CONTENT back to this tab
    try {
      B.runtime.sendMessage({
        type: 'CLIPBOARD_HOTKEY_PRESSED',
        payload: { combo: combo }
      }).then(function(response) {
        if (response && response.matched) {
          // Match confirmed — paste was routed back via CLIPBOARD_PASTE_CONTENT
        }
      }).catch(function() {});
    } catch (_) {}

    // For known default hotkeys (Alt+digit or Alt+Numpad), prevent default immediately
    if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      if ((event.key >= '0' && event.key <= '9') || (event.code && /^Numpad[0-9]$/.test(event.code))) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    // For numpad mode combos (Ctrl+Shift+Numpad*), prevent default immediately
    if (numpadModeEnabled && event.ctrlKey && event.shiftKey && event.code && event.code.indexOf('Numpad') === 0) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  // ============================================================================
  // MESSAGE LISTENER — receives paste commands from service worker + sidebar
  // ============================================================================

  function setupMessageListener() {
    // Listen for postMessage from sidebar iframe (legacy path + clipboard captures).
    // Only extension-origin frames — the host page shares this window.
    window.addEventListener('message', function(event) {
      try {
        if (!EXT_ORIGIN || event.origin !== EXT_ORIGIN) return;
        var msg = event.data;
        if (!msg || typeof msg !== 'object') return;

        // Legacy paste from sidebar — still supported as fallback
        if (msg.type === 'GPD_PASTE_FROM_SLOT') {
          handlePasteFromServiceWorker(msg);
        }
      } catch (err) {
        console.error('[DANMAN Clipboard] window message listener error:', err);
      }
    });

    // Listen for messages from service worker (primary paste path + cross-tab sync)
    try {
      B.runtime.onMessage.addListener(function(message, sender, sendResponse) {
        try {
          // === PASTE CONTENT (from service worker, triggered by sidebar paste button or hotkey) ===
          if (message.type === 'CLIPBOARD_PASTE_CONTENT') {
            handlePasteFromServiceWorker(message.payload || message);
            sendResponse({ success: true });
            return false;
          }

          // === CROSS-TAB SYNC (broadcast from another tab's sidebar) ===
          if (message.type === 'CLIPBOARD_SYNC_UPDATE') {
            sendToSidebar({
              type: 'CLIPBOARD_STATE_UPDATE',
              state: message.payload && message.payload.state
            });
            sendResponse({ success: true });
            return false;
          }

          // === NUMPAD MODE UPDATE (broadcast from service worker) ===
          if (message.type === 'CLIPBOARD_NUMPAD_MODE_UPDATE') {
            numpadModeEnabled = !!(message.payload && message.payload.enabled);
            sendResponse({ success: true });
            return false;
          }

          // === FORCE POLL (hover panel / SW) ===
          if (message.type === 'CLIPBOARD_FORCE_POLL') {
            pollSystemClipboard((message.payload && message.payload.reason) || 'force-poll')
              .then(function (r) { sendResponse(r || { ok: true }); })
              .catch(function (e) { sendResponse({ ok: false, error: e.message || String(e) }); });
            return true;
          }
        } catch (err) {
          console.error('[DANMAN Clipboard] runtime.onMessage error:', err);
        }
        return false;
      });
    } catch (_) {
      // runtime.onMessage not available in this context
    }
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  function logClip(level, event, detail, extra) {
    try {
      sendToServiceWorker({
        type: 'CLIPBOARD_EVENT_LOG',
        payload: {
          level: level || 'info',
          event: event || 'CLIPBOARD',
          detail: String(detail || '').slice(0, 800),
          extra: Object.assign({
            url: window.location.href,
            ts: new Date().toISOString(),
            hidden: !!document.hidden,
            hasFocus: !!document.hasFocus()
          }, extra || {})
        }
      });
    } catch (_) {}
  }

  function blobToDataUrlLocal(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  var lastPolledText = '';
  var globalPollId = null;

  async function pollSystemClipboard(reason) {
    var via = reason || 'global-poll';
    try {
      if (!navigator.clipboard) {
        logClip('warn', 'POLL_NO_API', 'navigator.clipboard unavailable', { via: via });
        return { ok: false, error: 'no_clipboard_api' };
      }

      if (navigator.clipboard.read) {
        try {
          var items = await navigator.clipboard.read();
          for (var i = 0; i < items.length; i++) {
            var item = items[i];
            var types = item.types || [];
            for (var t = 0; t < types.length; t++) {
              if (String(types[t]).indexOf('image/') === 0) {
                var blob = await item.getType(types[t]);
                var dataUrl = await blobToDataUrlLocal(blob);
                if (dataUrl && dataUrl !== lastPolledText) {
                  lastPolledText = dataUrl;
                  var imgMsg = {
                    type: 'GPD_CLIPBOARD_CAPTURE',
                    content: dataUrl,
                    contentType: 'image',
                    mime: types[t],
                    timestamp: new Date().toISOString(),
                    sourceUrl: window.location.href,
                    via: via
                  };
                  sendToSidebar(imgMsg);
                  sendToServiceWorker({ type: 'CLIPBOARD_NEW_CAPTURE', payload: imgMsg });
                  logClip('info', 'POLL_IMAGE', 'Captured image from OS clipboard', {
                    via: via, mime: types[t], bytes: blob.size || 0
                  });
                  return { ok: true, contentType: 'image' };
                }
              }
            }
            if (types.indexOf('text/plain') >= 0) {
              var textBlob = await item.getType('text/plain');
              var text = await textBlob.text();
              if (text && text.trim() && text !== lastPolledText) {
                lastPolledText = text;
                var textMsg = {
                  type: 'GPD_CLIPBOARD_CAPTURE',
                  content: text,
                  contentType: 'text',
                  timestamp: new Date().toISOString(),
                  sourceUrl: window.location.href,
                  via: via
                };
                sendToSidebar(textMsg);
                sendToServiceWorker({ type: 'CLIPBOARD_NEW_CAPTURE', payload: textMsg });
                logClip('info', 'POLL_TEXT', 'Captured text (' + text.length + ' chars)', {
                  via: via, chars: text.length
                });
                return { ok: true, contentType: 'text', chars: text.length };
              }
            }
          }
          return { ok: true, deduplicated: true };
        } catch (readErr) {
          logClip('warn', 'POLL_READ_FAIL', readErr.message || String(readErr), {
            via: via, fallback: 'readText'
          });
        }
      }

      if (!navigator.clipboard.readText) {
        logClip('warn', 'POLL_NO_READTEXT', 'readText unavailable', { via: via });
        return { ok: false, error: 'no_readText' };
      }
      var plain = await navigator.clipboard.readText();
      if (!plain || !plain.trim() || plain === lastPolledText) {
        return { ok: true, deduplicated: true };
      }
      lastPolledText = plain;
      var msg = {
        type: 'GPD_CLIPBOARD_CAPTURE',
        content: plain,
        contentType: 'text',
        timestamp: new Date().toISOString(),
        sourceUrl: window.location.href,
        via: via
      };
      sendToSidebar(msg);
      sendToServiceWorker({ type: 'CLIPBOARD_NEW_CAPTURE', payload: msg });
      logClip('info', 'POLL_TEXT', 'Captured text via readText (' + plain.length + ' chars)', {
        via: via, chars: plain.length
      });
      return { ok: true, contentType: 'text', chars: plain.length };
    } catch (err) {
      logClip('error', 'POLL_EXCEPTION', err.message || String(err), {
        via: via, name: err.name || ''
      });
      return { ok: false, error: err.message || String(err) };
    }
  }

  function initialize() {
    try {
      document.addEventListener('copy', handleClipboardEvent);
      document.addEventListener('cut', handleClipboardEvent);
      // AHK / system paste often never fires copy — capture paste payloads too
      document.addEventListener('paste', handleClipboardEvent);
      document.addEventListener('keydown', handleHotkey, true);
      setupMessageListener();
      loadNumpadModeState();
      startGlobalClipboardPoll();
      logClip('info', 'LISTENER_INIT', 'Clipboard listener v7.7.0 ready');
      console.log('[DANMAN] Clipboard listener v7.7.0 initialized (images + paste + global poll + logs)');
    } catch (err) {
      console.error('[DANMAN] Clipboard listener init error:', err);
      logClip('error', 'LISTENER_INIT_FAIL', err.message || String(err));
    }
  }

  /**
   * True when the caret is (or may be) sitting in a text field.
   *
   * A focused IFRAME counts: from here `document.activeElement` is the frame
   * element itself and we cannot see which field inside it has focus — and one
   * of those frames is DANMAN's own sidebar/float panel, which is exactly where
   * the chat box lives. Standing down for focused frames costs an occasional
   * poll tick; not standing down costs the user keystrokes.
   */
  function isEditingText() {
    try {
      var el = document.activeElement;
      if (!el) return false;
      var tag = (el.tagName || '').toUpperCase();
      if (tag === 'IFRAME' || tag === 'FRAME') return true;
      return isElementEditable(el);
    } catch (_) {
      return false;
    }
  }

  // Global poll so AHK clipboard writes sync across tabs even without copy events
  // (text + images via pollSystemClipboard).
  //
  // The poll stands down while the user is typing: navigator.clipboard.read()
  // is a user-visible operation (Firefox can surface a paste prompt for it) and
  // firing it every 2 s into a focused input is exactly the interference this
  // listener is supposed to stay out of. Copy/cut/paste events still capture
  // normally while typing, and the poll resumes the moment focus leaves the
  // field. Explicit CLIPBOARD_FORCE_POLL requests are unaffected — those are
  // user-initiated.
  function startGlobalClipboardPoll() {
    if (globalPollId) return;
    globalPollId = setInterval(function () {
      if (document.hidden || !document.hasFocus()) return;
      if (isEditingText()) return;
      pollSystemClipboard('global-poll');
    }, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
})();
// END: content/clipboard-listener.js — DANMAN Clipboard Listener v7.7.0
