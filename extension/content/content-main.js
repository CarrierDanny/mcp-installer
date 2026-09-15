/**
 * VERSION: V002R108
 * DATE: 2026-09-15
 * CHANGE: isTrusted gates on trigger/hover/slot clicks; extension-origin check on every frame message; per-tab frame token on messages into frames; GPD_COPY_TO_CLIPBOARD over runtime messaging
 * HISTORY:
 *   V001R1344 2026-08-26 Baseline import + Firefox messaging/clipboard fixes (unstamped)
 */
// content/content-main.js — GetPower DANMAN Content Script
(function() {
  'use strict';

  // ============================================================
  // STATE
  // ============================================================
  let sidebarOpen = false;
  let sidebarFrame = null;
  let triggerBtn = null;
  let sidebarMinimized = false;
  const SIDEBAR_WIDTH = 520;
  const SIDEBAR_HIDDEN_RIGHT = -(SIDEBAR_WIDTH + 20);
  const TRIGGER_OPEN_OFFSET = SIDEBAR_WIDTH - 100;
  let hoverPanel = null;
  let hoverPanelTimer = null;

  // ============================================================
  // FRAME TRUST
  // ============================================================
  // The sidebar/float iframes are extension pages, so a real message from
  // them carries the extension origin. The host page cannot produce that.
  const EXT_ORIGIN = (() => {
    try { return String(chrome.runtime.getURL('')).replace(/\/+$/, ''); } catch (_) { return ''; }
  })();
  function fromExtensionFrame(event) {
    return !!EXT_ORIGIN && event.origin === EXT_ORIGIN;
  }
  // Messages we post INTO those frames are stamped with a per-tab token that
  // both sides fetch over runtime messaging (invisible to the page), so the
  // frames can tell this script apart from page JS that shares the window.
  let frameToken = null;
  const frameTokenReady = (function fetchFrameToken(attempt) {
    return new Promise((resolve) => {
      let p;
      try { p = chrome.runtime.sendMessage({ type: 'FRAME_TOKEN_GET' }); } catch (err) { p = Promise.reject(err); }
      Promise.resolve(p).then((r) => {
        if (!r || !r.token) throw new Error('no frame token');
        frameToken = r.token;
        resolve(r.token);
      }).catch(() => {
        if (attempt < 5) setTimeout(() => resolve(fetchFrameToken(attempt + 1)), 400 * (attempt + 1));
        else resolve(null);
      });
    });
  })(0);
  function postToFrame(frame, msg) {
    if (!frame || !frame.contentWindow) return;
    frameTokenReady.then((token) => {
      try {
        // Target the extension origin explicitly: if the page ever navigates
        // the iframe elsewhere, the browser drops the message instead of
        // handing it (and the token) to that document.
        if (frame.contentWindow) frame.contentWindow.postMessage(Object.assign({}, msg, { __t: token }), EXT_ORIGIN || '*');
      } catch (_) {}
    });
  }
  function postToSidebar(msg) { postToFrame(sidebarFrame, msg); }

  // ============================================================
  // MESSAGING
  // ============================================================
  /**
   * Fire-and-forget message to the background.
   *
   * `chrome.runtime.sendMessage(msg)` returns a Promise on both Firefox and
   * Chrome MV3. Dropping that Promise leaves an unhandled rejection whenever
   * the background is asleep or the message has no receiver, which the
   * Browser Console reports as
   * "ExtensionError: Could not establish connection. Receiving end does not exist."
   * A bare try/catch does NOT catch it — the failure is asynchronous. Every
   * send whose result we do not await must go through here.
   */
  function safeSend(message) {
    try {
      const p = chrome.runtime.sendMessage(message);
      if (p && typeof p.catch === 'function') {
        p.catch((err) => {
          console.debug('[DANMAN] send skipped:', message && message.type, (err && err.message) || err);
        });
      }
    } catch (err) {
      console.debug('[DANMAN] send skipped:', message && message.type, (err && err.message) || err);
    }
  }

  // ============================================================
  // TRIGGER BUTTON
  // ============================================================
  function createTriggerButton() {
    if (document.getElementById('gpd-trigger')) return;
    triggerBtn = document.createElement('div');
    triggerBtn.id = 'gpd-trigger';
    triggerBtn.innerHTML = '\u26A1 D A N M A N';
    const style = {
      position: 'fixed', right: '0', top: '50%', transform: 'translateY(-50%)',
      writingMode: 'vertical-rl', textOrientation: 'mixed',
      background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
      color: '#38bdf8', padding: '14px 7px', cursor: 'pointer',
      fontSize: '11px', fontWeight: '700', letterSpacing: '3px',
      borderRadius: '8px 0 0 8px', zIndex: '2147483646',
      boxShadow: '0 0 15px rgba(56,189,248,0.3)',
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      userSelect: 'none', lineHeight: '1'
    };
    Object.assign(triggerBtn.style, style);

    triggerBtn.addEventListener('mouseenter', () => {
      triggerBtn.style.boxShadow = '0 0 25px rgba(56,189,248,0.6)';
      triggerBtn.style.padding = '14px 10px';
      triggerBtn.style.color = '#7dd3fc';
    });
    triggerBtn.addEventListener('mouseleave', () => {
      triggerBtn.style.boxShadow = '0 0 15px rgba(56,189,248,0.3)';
      triggerBtn.style.padding = '14px 7px';
      triggerBtn.style.color = '#38bdf8';
    });
    triggerBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!e.isTrusted) return; // page-synthesized clicks do not open the panel
      toggleSidebar();
    });
    triggerBtn.addEventListener('mouseenter', (e) => { if (e.isTrusted) scheduleHoverPanel(); });
    triggerBtn.addEventListener('mouseleave', () => cancelHoverPanel());
    document.body.appendChild(triggerBtn);
  }

  function scheduleHoverPanel() {
    cancelHoverPanel();
    hoverPanelTimer = setTimeout(showHoverPanel, 350);
  }

  function cancelHoverPanel() {
    if (hoverPanelTimer) {
      clearTimeout(hoverPanelTimer);
      hoverPanelTimer = null;
    }
    if (hoverPanel) {
      hoverPanel.remove();
      hoverPanel = null;
    }
  }

  function clipPreview(text, max) {
    const t = (text || '').replace(/\s+/g, ' ').trim();
    if (!t) return '(empty)';
    if (String(text || '').indexOf('data:image/') === 0) return '[image]';
    return t.length > (max || 48) ? t.slice(0, max || 48) + '…' : t;
  }

  function logClipboardEvent(level, event, detail, extra) {
    try {
      chrome.runtime.sendMessage({
        type: 'CLIPBOARD_EVENT_LOG',
        payload: {
          level: level || 'info',
          event: event || 'CLIPBOARD',
          detail: String(detail || '').slice(0, 500),
          extra: Object.assign({
            url: location.href,
            ts: new Date().toISOString()
          }, extra || {})
        }
      }).catch(function () {});
    } catch (_) {}
  }

  async function showHoverPanel() {
    if (hoverPanel || !triggerBtn) return;
    let slots = [];
    try {
      // Force a global poll so hover always shows freshest OS clipboard (text + images)
      try {
        await chrome.runtime.sendMessage({ type: 'CLIPBOARD_FORCE_POLL', payload: { reason: 'hover-panel' } });
      } catch (pollErr) {
        logClipboardEvent('warn', 'HOVER_FORCE_POLL_FAIL', pollErr.message || String(pollErr));
      }
      const resp = await chrome.runtime.sendMessage({ type: 'CLIPBOARD_LOAD' });
      const state = (resp && resp.state) || resp;
      slots = (state && state.slots) || [];
      logClipboardEvent('info', 'HOVER_PANEL_OPEN', 'Loaded ' + slots.filter(function (s) { return s && s.content; }).length + ' filled slots', {
        filled: slots.filter(function (s) { return s && s.content; }).length
      });
    } catch (err) {
      slots = [];
      logClipboardEvent('error', 'HOVER_PANEL_LOAD_FAIL', err.message || String(err));
    }

    hoverPanel = document.createElement('div');
    hoverPanel.id = 'gpd-hover-panel';
    Object.assign(hoverPanel.style, {
      position: 'fixed',
      right: '42px',
      top: '50%',
      transform: 'translateY(-50%)',
      width: '300px',
      maxHeight: '70vh',
      overflowY: 'auto',
      background: '#0f172a',
      border: '1px solid #334155',
      borderRadius: '10px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
      zIndex: '2147483645',
      padding: '8px',
      fontFamily: 'system-ui, sans-serif',
      fontSize: '12px',
      color: '#e2e8f0'
    });

    const title = document.createElement('div');
    title.textContent = 'DANMAN — global clips';
    title.style.cssText = 'font-weight:700;color:#38bdf8;margin-bottom:4px;font-size:11px;letter-spacing:0.5px;';
    hoverPanel.appendChild(title);

    const sub = document.createElement('div');
    sub.textContent = 'Live OS clipboard · text + images · synced across tabs';
    sub.style.cssText = 'font-size:10px;color:#64748b;margin-bottom:8px;';
    hoverPanel.appendChild(sub);

    function renderSlots(list) {
      const existing = hoverPanel.querySelectorAll('.gpd-hover-slot');
      existing.forEach(function (n) { n.remove(); });
      const after = hoverPanel.querySelector('.gpd-hover-actions');
      for (let i = 0; i < 10; i++) {
        const slot = list[i] || {};
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'gpd-hover-slot';
        const isImg = slot.contentType === 'image' || String(slot.content || '').indexOf('data:image/') === 0;
        if (isImg && slot.content) {
          btn.innerHTML = '<span style="opacity:0.7;margin-right:6px;">' + (i + 1) + '.</span>' +
            '<img src="" alt="clip" style="height:28px;width:auto;max-width:180px;vertical-align:middle;border-radius:3px;border:1px solid #334155;">';
          btn.querySelector('img').src = slot.content;
        } else {
          btn.textContent = (i + 1) + '. ' + clipPreview(slot.content, 42);
        }
        btn.style.cssText = 'display:block;width:100%;text-align:left;margin:2px 0;padding:6px 8px;border:1px solid #1e293b;border-radius:6px;background:#1e293b;color:#e2e8f0;cursor:pointer;font-size:11px;overflow:hidden;';
        btn.addEventListener('mouseenter', () => { btn.style.borderColor = '#38bdf8'; });
        btn.addEventListener('mouseleave', () => { btn.style.borderColor = '#1e293b'; });
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (!e.isTrusted) return; // only a real click may paste a clip into the page
          safeSend({ type: 'CLIPBOARD_PASTE_TO_PAGE', payload: { slotIndex: i } });
          logClipboardEvent('info', 'HOVER_PASTE_SLOT', 'Paste slot ' + (i + 1), { slot: i + 1, type: slot.contentType || 'text' });
          cancelHoverPanel();
        });
        if (after) hoverPanel.insertBefore(btn, after);
        else hoverPanel.appendChild(btn);
      }
    }

    renderSlots(slots);

    const actions = document.createElement('div');
    actions.className = 'gpd-hover-actions';
    actions.style.cssText = 'margin-top:8px;padding-top:6px;border-top:1px solid #334155;display:flex;gap:6px;flex-wrap:wrap;';
    [
      { label: 'Open sidebar', fn: () => openSidebar() },
      { label: 'Refresh clips', fn: async () => {
          try {
            await chrome.runtime.sendMessage({ type: 'CLIPBOARD_FORCE_POLL', payload: { reason: 'hover-refresh' } });
            const resp = await chrome.runtime.sendMessage({ type: 'CLIPBOARD_LOAD' });
            const state = (resp && resp.state) || resp;
            renderSlots((state && state.slots) || []);
            logClipboardEvent('info', 'HOVER_REFRESH', 'Manual refresh');
          } catch (e) {
            logClipboardEvent('error', 'HOVER_REFRESH_FAIL', e.message || String(e));
          }
        } },
      { label: 'Record pick', fn: () => safeSend({ type: 'CONTEXT_MACRO_RECORD_PICK' }) },
      { label: 'Macro run', fn: () => safeSend({ type: 'MACRO_RUN', payload: {} }) },
      { label: 'Pause', fn: () => safeSend({ type: 'MACRO_PAUSE' }) }
    ].forEach((a) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = a.label;
      b.style.cssText = 'padding:4px 8px;font-size:10px;border-radius:5px;border:1px solid #475569;background:#334155;color:#f8fafc;cursor:pointer;';
      b.addEventListener('click', (e) => { e.stopPropagation(); if (!e.isTrusted) return; a.fn(); if (a.label !== 'Refresh clips') cancelHoverPanel(); });
      actions.appendChild(b);
    });
    hoverPanel.appendChild(actions);

    hoverPanel.addEventListener('mouseenter', () => { if (hoverPanelTimer) clearTimeout(hoverPanelTimer); });
    hoverPanel.addEventListener('mouseleave', cancelHoverPanel);
    document.body.appendChild(hoverPanel);

    // Live sync while open
    try {
      chrome.storage.onChanged.addListener(function hoverClipSync(changes, area) {
        if (!hoverPanel || area !== 'local' || !changes.gpd_clipboard_state) return;
        const nv = changes.gpd_clipboard_state.newValue;
        const remoteSlots = (nv && nv.state && nv.state.slots) || (nv && nv.slots) || [];
        renderSlots(remoteSlots);
      });
    } catch (_) {}
  }

  // ============================================================
  // SIDEBAR
  // ============================================================
  function createSidebar() {
    if (document.getElementById('gpd-sidebar-container')) return;

    const container = document.createElement('div');
    container.id = 'gpd-sidebar-container';
    Object.assign(container.style, {
      position: 'fixed', right: SIDEBAR_HIDDEN_RIGHT + 'px', top: '0',
      width: SIDEBAR_WIDTH + 'px', minWidth: SIDEBAR_WIDTH + 'px', height: '100vh',
      zIndex: '2147483647',
      transition: 'right 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      boxShadow: '-5px 0 30px rgba(0,0,0,0.5)'
    });

    sidebarFrame = document.createElement('iframe');
    sidebarFrame.id = 'gpd-sidebar';
    sidebarFrame.src = chrome.runtime.getURL('sidebar/sidebar.html');
    Object.assign(sidebarFrame.style, {
      width: '100%', height: '100%', border: 'none',
      backgroundColor: '#0f172a', borderRadius: '0'
    });

    container.appendChild(sidebarFrame);
    document.body.appendChild(container);
  }

  function restoreSidebarWidth() {
    const container = document.getElementById('gpd-sidebar-container');
    if (!container) return;
    sidebarMinimized = false;
    container.style.width = SIDEBAR_WIDTH + 'px';
    container.style.minWidth = SIDEBAR_WIDTH + 'px';
    if (sidebarFrame) {
      sidebarFrame.style.width = '100%';
      sidebarFrame.style.minWidth = '100%';
    }
  }

  function openSidebar(targetTab) {
    if (!sidebarFrame) createSidebar();
    const container = document.getElementById('gpd-sidebar-container');
    if (!container) return;

    // Always expand to full width — minimize used to leave width at 40px
    restoreSidebarWidth();
    sidebarOpen = true;
    container.style.right = '0';
    if (triggerBtn) triggerBtn.style.right = TRIGGER_OPEN_OFFSET + 'px';

    if (targetTab && sidebarFrame && sidebarFrame.contentWindow) {
      setTimeout(() => {
        postToSidebar({ type: 'GPD_SWITCH_TAB', tab: targetTab });
      }, 300);
    }
  }

  function toggleSidebar(targetTab) {
    if (!sidebarFrame) createSidebar();
    const container = document.getElementById('gpd-sidebar-container');
    if (!container) return;

    if (targetTab && !sidebarOpen) {
      openSidebar(targetTab);
      return;
    }

    sidebarOpen = !sidebarOpen;
    if (sidebarOpen) {
      restoreSidebarWidth();
      container.style.right = '0';
    } else {
      // Closing must also clear minimized width so next open is full-size
      restoreSidebarWidth();
      container.style.right = SIDEBAR_HIDDEN_RIGHT + 'px';
    }
    if (triggerBtn) {
      triggerBtn.style.right = sidebarOpen ? (TRIGGER_OPEN_OFFSET + 'px') : '0';
    }

    if (sidebarOpen && targetTab && sidebarFrame && sidebarFrame.contentWindow) {
      setTimeout(() => {
        postToSidebar({ type: 'GPD_SWITCH_TAB', tab: targetTab });
      }, 300);
    }
  }

  function minimizeSidebar() {
    const container = document.getElementById('gpd-sidebar-container');
    if (!container) return;
    sidebarMinimized = !sidebarMinimized;
    if (sidebarMinimized) {
      container.style.width = '40px';
      container.style.minWidth = '40px';
    } else {
      restoreSidebarWidth();
    }
    if (triggerBtn) {
      triggerBtn.style.right = sidebarOpen
        ? (sidebarMinimized ? '40px' : (TRIGGER_OPEN_OFFSET + 'px'))
        : '0';
    }
  }

  // Slide sidebar fully off-screen during pick mode (not just minimize to 40px)
  var _pickHidden = false;
  function _sidebarPickMinimize() {
    const container = document.getElementById('gpd-sidebar-container');
    if (!container || _pickHidden) return;
    _pickHidden = true;
    container.style.transition = 'right 0.2s ease';
    container.style.right = SIDEBAR_HIDDEN_RIGHT + 'px';
    if (triggerBtn) triggerBtn.style.opacity = '0.4';
  }
  function _sidebarPickRestore() {
    const container = document.getElementById('gpd-sidebar-container');
    if (!container || !_pickHidden) return;
    _pickHidden = false;
    container.style.transition = 'right 0.2s ease';
    if (sidebarOpen) {
      restoreSidebarWidth();
      container.style.right = '0';
    } else {
      container.style.right = SIDEBAR_HIDDEN_RIGHT + 'px';
    }
    if (triggerBtn) triggerBtn.style.opacity = '1';
  }

  // ============================================================
  // PAGE SCRAPING
  // ============================================================
  function scrapeCurrentPage() {
    const title = document.title || '';
    const url = window.location.href;
    const metaDesc = document.querySelector('meta[name="description"]')?.content || '';

    // Headings
    const headings = [];
    document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(h => {
      headings.push({ level: parseInt(h.tagName[1]), text: h.textContent.trim() });
    });

    // Main text
    const bodyText = document.body?.innerText || '';
    const wordCount = bodyText.trim().split(/\s+/).filter(Boolean).length;

    // Images
    const images = [];
    document.querySelectorAll('img').forEach(img => {
      if (img.src && !img.src.startsWith('data:') && img.width > 50 && img.height > 50) {
        images.push({
          src: img.src,
          alt: img.alt || '',
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height
        });
      }
    });

    // Tables
    const tables = [];
    document.querySelectorAll('table').forEach((table, idx) => {
      const headers = [];
      const rows = [];
      table.querySelectorAll('thead th, thead td, tr:first-child th').forEach(th => {
        headers.push(th.textContent.trim());
      });
      table.querySelectorAll('tbody tr, tr').forEach((tr, ri) => {
        if (ri === 0 && headers.length > 0) return; // Skip header row
        const cells = [];
        tr.querySelectorAll('td, th').forEach(td => cells.push(td.textContent.trim()));
        if (cells.length > 0) rows.push(cells);
      });
      tables.push({ index: idx, headers, rows, rowCount: rows.length });
    });

    return {
      title, url, metaDesc, headings, bodyText: bodyText.slice(0, 50000),
      wordCount, images, tables,
      imageCount: images.length, tableCount: tables.length,
      headingCount: headings.length,
      scrapedAt: new Date().toISOString()
    };
  }

  // ============================================================
  // LINK EXTRACTION
  // ============================================================
  function extractLinksFromPage() {
    const currentDomain = window.location.hostname;
    const links = [];
    const seen = new Set();

    document.querySelectorAll('a[href]').forEach(a => {
      let href = a.href;
      if (!href || href === '#' || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;

      // Deduplicate
      if (seen.has(href)) return;
      seen.add(href);

      const displayText = a.textContent?.trim() || a.title || a.getAttribute('aria-label') || '[no text]';
      let linkDomain = '';
      try { linkDomain = new URL(href).hostname; } catch {}
      const isInternal = linkDomain === currentDomain;

      links.push({
        url: href,
        displayText: displayText.slice(0, 200),
        isInternal,
        domain: linkDomain,
        rel: a.getAttribute('rel') || '',
        target: a.getAttribute('target') || ''
      });
    });

    const internalCount = links.filter(l => l.isInternal).length;
    const externalCount = links.filter(l => !l.isInternal).length;

    return {
      links,
      total: links.length,
      internalCount,
      externalCount,
      currentDomain,
      extractedAt: new Date().toISOString()
    };
  }

  // ============================================================
  // FORM SCANNING
  // ============================================================
  function scanFormsOnPage() {
    const forms = [];
    let totalFields = 0;

    // Scan all form elements
    const formElements = document.querySelectorAll('form');
    const processedInputs = new Set();

    formElements.forEach((form, formIdx) => {
      const formData = {
        index: formIdx,
        action: form.action || '',
        method: (form.method || 'GET').toUpperCase(),
        id: form.id || '',
        name: form.name || '',
        fields: []
      };

      // Scan all inputs within this form
      form.querySelectorAll('input, select, textarea, button[type="submit"]').forEach(el => {
        processedInputs.add(el);
        const field = extractFieldInfo(el);
        if (field) {
          formData.fields.push(field);
          totalFields++;
        }
      });

      forms.push(formData);
    });

    // Also find orphan inputs (not inside any form)
    const orphanFields = [];
    document.querySelectorAll('input, select, textarea').forEach(el => {
      if (processedInputs.has(el)) return;
      const field = extractFieldInfo(el);
      if (field) {
        orphanFields.push(field);
        totalFields++;
      }
    });

    if (orphanFields.length > 0) {
      forms.push({
        index: forms.length,
        action: '',
        method: '',
        id: '[orphan-fields]',
        name: 'Fields outside forms',
        fields: orphanFields
      });
    }

    return {
      forms,
      formCount: forms.length,
      totalFields,
      scannedAt: new Date().toISOString()
    };
  }

  function extractFieldInfo(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'input' && ['hidden', 'submit', 'reset', 'image'].includes(el.type)) return null;

    const field = {
      tag,
      type: el.type || (tag === 'textarea' ? 'textarea' : tag === 'select' ? 'select' : 'text'),
      name: el.name || '',
      id: el.id || '',
      className: el.className || '',
      placeholder: el.placeholder || '',
      required: el.required || false,
      disabled: el.disabled || false,
      value: el.value || '',
      label: findLabel(el),
      ariaLabel: el.getAttribute('aria-label') || ''
    };

    // For selects, get all options
    if (tag === 'select') {
      field.options = [];
      el.querySelectorAll('option').forEach(opt => {
        field.options.push({ value: opt.value, text: opt.textContent.trim(), selected: opt.selected });
      });
    }

    // For inputs, get constraints
    if (tag === 'input') {
      if (el.pattern) field.pattern = el.pattern;
      if (el.min !== '') field.min = el.min;
      if (el.max !== '') field.max = el.max;
      if (el.maxLength > 0 && el.maxLength < 524288) field.maxLength = el.maxLength;
      if (el.step) field.step = el.step;
    }

    // For checkboxes/radios, get group options
    if (el.type === 'checkbox' || el.type === 'radio') {
      const groupName = el.name;
      if (groupName) {
        field.groupOptions = [];
        document.querySelectorAll(`input[name="${CSS.escape(groupName)}"]`).forEach(opt => {
          field.groupOptions.push({
            value: opt.value,
            label: findLabel(opt) || opt.value,
            checked: opt.checked
          });
        });
      }
    }

    return field;
  }

  function findLabel(el) {
    // Try associated label
    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label) return label.textContent.trim();
    }
    // Try parent label
    const parentLabel = el.closest('label');
    if (parentLabel) return parentLabel.textContent.trim().replace(el.value, '').trim();
    // Try aria-label or aria-labelledby
    if (el.getAttribute('aria-labelledby')) {
      const labelEl = document.getElementById(el.getAttribute('aria-labelledby'));
      if (labelEl) return labelEl.textContent.trim();
    }
    return '';
  }

  // ============================================================
  // AUTOFILL
  // ============================================================
  function applyAutofill(template) {
    if (!template) return { filled: 0 };
    let filled = 0;
    for (const [selector, value] of Object.entries(template)) {
      // Try by ID, then by name
      let el = document.getElementById(selector) || document.querySelector(`[name="${CSS.escape(selector)}"]`);
      if (!el) continue;

      if (el.tagName === 'SELECT') {
        const opt = Array.from(el.options).find(o => o.value === value || o.textContent.trim() === value);
        if (opt) { el.value = opt.value; filled++; }
      } else if (el.type === 'checkbox' || el.type === 'radio') {
        el.checked = value === true || value === 'true' || value === el.value;
        filled++;
      } else {
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        filled++;
      }
    }
    return { filled };
  }

  // ============================================================
  // EMAIL DETECTION (for EJECT)
  // ============================================================
  function detectEmailContext() {
    const url = window.location.href;
    if (/outlook\.(office|office365|live)\.com/i.test(url)) return 'owa';
    if (/mail\.google\.com/i.test(url)) return 'gmail';
    return null;
  }

  function scrapeEmail() {
    const provider = detectEmailContext();
    const result = { success: false, provider, url: window.location.href };

    try {
      if (provider === 'owa') {
        result.subject = document.querySelector('[aria-label*="Subject"], .hcptT')?.textContent?.trim() || '';
        result.from = document.querySelector('[aria-label*="From"], .OZZZK')?.textContent?.trim() || '';
        result.body = document.querySelector('[aria-label*="Message body"], .XbIp4')?.innerText?.trim() || '';
        result.date = document.querySelector('[aria-label*="Received"], .SvBin')?.textContent?.trim() || '';
      } else if (provider === 'gmail') {
        result.subject = document.querySelector('h2[data-thread-perm-id], .hP')?.textContent?.trim() || '';
        result.from = document.querySelector('.gD, [email]')?.getAttribute('email') || document.querySelector('.gD')?.textContent?.trim() || '';
        result.body = document.querySelector('.a3s.aiL, .ii.gt')?.innerText?.trim() || '';
        result.date = document.querySelector('.g3, .gH .g3')?.getAttribute('title') || '';
      } else {
        // Generic: try to get selected text or main content
        const selection = window.getSelection()?.toString()?.trim();
        if (selection) {
          result.body = selection;
        } else {
          result.body = document.querySelector('main, article, .content, #content, [role="main"]')?.innerText?.trim() || document.body?.innerText?.trim()?.slice(0, 10000) || '';
        }
        result.subject = document.title;
      }
      result.success = !!(result.body || result.subject);
    } catch (e) {
      result.error = e.message;
    }
    return result;
  }

  // ============================================================
  // FLOATING CHAT WINDOW
  // ============================================================
  function createDanmanFloat() {
    // Remove existing float if any
    const existing = document.getElementById('danman-float-container');
    if (existing) { existing.remove(); return; } // Toggle behavior

    const container = document.createElement('div');
    container.id = 'danman-float-container';
    container.style.cssText = 'position:fixed;bottom:80px;right:20px;width:380px;height:500px;z-index:2147483646;' +
      'border-radius:12px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.5);resize:both;min-width:300px;min-height:300px;';

    const iframe = document.createElement('iframe');
    iframe.src = chrome.runtime.getURL('sidebar/danman-float.html');
    iframe.style.cssText = 'width:100%;height:100%;border:none;border-radius:12px;';
    iframe.id = 'danman-float-iframe';

    // Make draggable via header
    let isDragging = false, startX, startY, startLeft, startTop;
    container.addEventListener('mousedown', (e) => {
      if (e.target === iframe) return;
      isDragging = true;
      startX = e.clientX; startY = e.clientY;
      const rect = container.getBoundingClientRect();
      startLeft = rect.left; startTop = rect.top;
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      container.style.left = (startLeft + e.clientX - startX) + 'px';
      container.style.top = (startTop + e.clientY - startY) + 'px';
      container.style.right = 'auto';
      container.style.bottom = 'auto';
    });
    document.addEventListener('mouseup', () => { isDragging = false; });

    container.appendChild(iframe);
    document.body.appendChild(container);
  }

  // ============================================================
  // MESSAGE HANDLERS
  // ============================================================

  // From service worker
  // Firefox: return true ONLY when sendResponse will be called asynchronously.
  // A blanket `return true` after sync sendResponse causes
  // "Promised response from onMessage listener went out of scope".
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.type) return false;

    // macro-runner.js owns these — do not claim the async response channel
    if (msg.type === 'dms_run_step' || msg.type === 'dms_stop') return false;

    switch (msg.type) {
      case 'dms_ping':
        sendResponse({ ok: true, ping: true });
        return false;
      case 'DANMAN_FLOAT_OPEN':
        createDanmanFloat();
        sendResponse({ ok: true });
        return false;
      case 'DANMAN_POPOUT_OPEN':
        chrome.runtime.sendMessage({ type: 'DANMAN_POPOUT_OPEN' }).catch((err) => {
          console.error('[DANMAN] Popout open failed:', err);
        });
        sendResponse({ ok: true });
        return false;
      case 'TOGGLE_SIDEBAR':
        if (msg.payload && msg.payload.forceOpen) {
          openSidebar(msg.payload.tab);
        } else {
          toggleSidebar(msg.payload?.tab);
        }
        sendResponse({ open: sidebarOpen });
        return false;
      case 'OPEN_SIDEBAR':
        openSidebar(msg.payload?.tab);
        sendResponse({ open: sidebarOpen });
        return false;
      case 'DO_SCRAPE_PAGE': {
        const data = scrapeCurrentPage();
        // Send result back to service worker
        safeSend({ type: 'SCRAPE_RESULT', payload: data });
        // Also forward to sidebar
        if (sidebarFrame?.contentWindow) {
          postToSidebar({ type: 'GPD_SCRAPE_RESULT', data });
        }
        sendResponse(data);
        return false;
      }
      case 'DO_EXTRACT_LINKS': {
        const data = extractLinksFromPage();
        safeSend({ type: 'LINKS_RESULT', payload: data });
        if (sidebarFrame?.contentWindow) {
          postToSidebar({ type: 'GPD_LINKS_RESULT', data });
        }
        sendResponse(data);
        return false;
      }
      case 'DO_SCAN_FORMS': {
        const data = scanFormsOnPage();
        safeSend({ type: 'FORMS_RESULT', payload: data });
        if (sidebarFrame?.contentWindow) {
          postToSidebar({ type: 'GPD_FORMS_RESULT', data });
        }
        sendResponse(data);
        return false;
      }
      case 'DO_SCRAPE_EMAIL': {
        const data = scrapeEmail();
        sendResponse(data);
        return false;
      }
      case 'AUTOFILL_FORM': {
        const result = applyAutofill(msg.payload);
        sendResponse(result);
        return false;
      }
      case 'SCRAPE_SELECTION': {
        if (sidebarFrame?.contentWindow) {
          postToSidebar({ type: 'GPD_SELECTION_DATA', text: msg.payload.text });
        }
        sendResponse({ ok: true });
        return false;
      }
      // Sidebar → clipboard over runtime messaging. The postMessage route to
      // window.parent is readable by the host page; this one is not.
      case 'GPD_COPY_TO_CLIPBOARD': {
        navigator.clipboard.writeText(String(msg.text == null ? '' : msg.text))
          .then(() => sendResponse({ success: true }))
          .catch((err) => sendResponse({ success: false, error: err.message }));
        return true;
      }
      // Bridges for v6.7 element-picker. element-picker.js exposes
      // window.DMS_Picker.start()/stop() but has no chrome.runtime listener;
      // service-worker.js relies on us to translate PICKER_ACTIVATE /
      // PICKER_DEACTIVATE into local DMS_Picker calls (same content-script
      // isolated world, so window.DMS_Picker is visible here).
      case 'PICKER_ACTIVATE': {
        try {
          if (window.DMS_Picker && typeof window.DMS_Picker.start === 'function') {
            window.DMS_Picker.start();
            sendResponse({ ok: true });
          } else {
            sendResponse({ ok: false, error: 'DMS_Picker not available' });
          }
        } catch (e) {
          sendResponse({ ok: false, error: e.message });
        }
        return false;
      }
      case 'PICKER_DEACTIVATE': {
        try {
          if (window.DMS_Picker && typeof window.DMS_Picker.stop === 'function') {
            window.DMS_Picker.stop();
          }
          sendResponse({ ok: true });
        } catch (e) {
          sendResponse({ ok: false, error: e.message });
        }
        return false;
      }
      case 'MACRO_RECORDER_START': {
        try {
          if (window.DMS_Recorder && typeof window.DMS_Recorder.start === 'function') {
            window.DMS_Recorder.start();
            sendResponse({ ok: true, recording: true });
          } else {
            sendResponse({ ok: false, error: 'DMS_Recorder not available' });
          }
        } catch (e) {
          sendResponse({ ok: false, error: e.message });
        }
        return false;
      }
      case 'MACRO_RECORDER_STOP': {
        try {
          var captured = null;
          if (window.DMS_Recorder && typeof window.DMS_Recorder.stop === 'function') {
            captured = window.DMS_Recorder.stop();
          }
          sendResponse({ ok: true, steps: captured || [] });
        } catch (e) {
          sendResponse({ ok: false, error: e.message });
        }
        return false;
      }
      case 'MACRO_RECORDER_PAUSE': {
        try {
          if (window.DMS_Recorder && typeof window.DMS_Recorder.pause === 'function') {
            window.DMS_Recorder.pause();
            sendResponse({ ok: true, paused: true });
          } else {
            sendResponse({ ok: false, error: 'DMS_Recorder not available' });
          }
        } catch (e) {
          sendResponse({ ok: false, error: e.message });
        }
        return false;
      }
      case 'MACRO_RECORDER_RESUME': {
        try {
          if (window.DMS_Recorder && typeof window.DMS_Recorder.resume === 'function') {
            window.DMS_Recorder.resume();
            sendResponse({ ok: true, paused: false });
          } else {
            sendResponse({ ok: false, error: 'DMS_Recorder not available' });
          }
        } catch (e) {
          sendResponse({ ok: false, error: e.message });
        }
        return false;
      }
      case 'SCREEN_PICK_ACTIVATE': {
        try {
          if (window.DMS_Picker && typeof window.DMS_Picker.startScreen === 'function') {
            window.DMS_Picker.startScreen({ coordMode: msg.coordMode || 'precise' });
            // Minimize sidebar so the full page is visible for picking
            _sidebarPickMinimize();
            sendResponse({ ok: true });
          } else {
            sendResponse({ ok: false, error: 'DMS_Picker.startScreen not available' });
          }
        } catch (e) {
          sendResponse({ ok: false, error: e.message });
        }
        return false;
      }
      case 'ELEMENT_PICK_ACTIVATE': {
        try {
          if (window.DMS_Picker && typeof window.DMS_Picker.start === 'function') {
            window.DMS_Picker.start();
            _sidebarPickMinimize();
            sendResponse({ ok: true });
          } else {
            sendResponse({ ok: false, error: 'DMS_Picker not available' });
          }
        } catch (e) {
          sendResponse({ ok: false, error: e.message });
        }
        return false;
      }
      case 'GPD_SIDEBAR_PICK_STOP':
        _sidebarPickRestore();
        sendResponse({ ok: true });
        return false;
      default:
        return false;
    }
  });

  // From floating chat iframe (postMessage) — extension-origin frames only
  window.addEventListener('message', (event) => {
    if (!fromExtensionFrame(event)) return;
    if (!event.data || !event.data.type) return;
    const floatType = event.data.type;

    if (floatType === 'DANMAN_FLOAT_CLOSE') {
      const el = document.getElementById('danman-float-container');
      if (el) el.remove();
      return;
    }
    if (floatType === 'DANMAN_FLOAT_MINIMIZE') {
      const el = document.getElementById('danman-float-container');
      if (el) {
        if (el.style.height === '40px') {
          el.style.height = '500px'; el.style.resize = 'both';
        } else {
          el.style.height = '40px'; el.style.overflow = 'hidden'; el.style.resize = 'none';
        }
      }
      return;
    }
    if (floatType === 'DANMAN_FLOAT_ANALYZE') {
      // Extract page data and send back to iframe
      const pageData = {
        url: window.location.href,
        title: document.title,
        headings: Array.from(document.querySelectorAll('h1,h2,h3,h4')).map(h => ({tag: h.tagName, text: h.textContent.trim().slice(0, 200)})),
        links: Array.from(document.querySelectorAll('a[href]')).slice(0, 100).map(a => ({href: a.href, text: (a.textContent || '').trim().slice(0, 100)})),
        forms: Array.from(document.querySelectorAll('form')).map(f => ({
          action: f.action, method: f.method,
          fields: Array.from(f.querySelectorAll('input,select,textarea')).map(i => ({name: i.name, type: i.type, id: i.id}))
        })),
        meta: Array.from(document.querySelectorAll('meta[name],meta[property]')).map(m => ({name: m.name || m.getAttribute('property'), content: (m.content || '').slice(0, 200)})),
        text: document.body.innerText.slice(0, 3000)
      };
      const floatIframe = document.getElementById('danman-float-iframe');
      if (floatIframe) postToFrame(floatIframe, { type: 'DANMAN_PAGE_ANALYSIS', payload: pageData });
      return;
    }
    if (floatType === 'DANMAN_FLOAT_OPEN') {
      createDanmanFloat();
      return;
    }
  });

  // From sidebar iframe (postMessage)
  window.addEventListener('message', (event) => {
    if (!sidebarFrame || event.source !== sidebarFrame.contentWindow) return;
    if (!fromExtensionFrame(event)) return; // frame navigated away by the page → ignore
    const msg = event.data;
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case 'GPD_REQUEST_SCRAPE': {
        const data = scrapeCurrentPage();
        postToSidebar({ type: 'GPD_SCRAPE_RESULT', data });
        safeSend({ type: 'SCRAPE_RESULT', payload: data });
        break;
      }
      case 'GPD_SIDEBAR_PICK_START':
        _sidebarPickMinimize();
        break;
      case 'GPD_SIDEBAR_PICK_STOP':
        _sidebarPickRestore();
        break;

      case 'GPD_REQUEST_LINKS': {
        const data = extractLinksFromPage();
        postToSidebar({ type: 'GPD_LINKS_RESULT', data });
        safeSend({ type: 'LINKS_RESULT', payload: data });
        break;
      }
      case 'GPD_REQUEST_FORMS': {
        const data = scanFormsOnPage();
        postToSidebar({ type: 'GPD_FORMS_RESULT', data });
        safeSend({ type: 'FORMS_RESULT', payload: data });
        break;
      }
      case 'GPD_REQUEST_EMAIL': {
        const data = scrapeEmail();
        postToSidebar({ type: 'GPD_EMAIL_RESULT', data });
        break;
      }
      case 'GPD_AUTOFILL': {
        const result = applyAutofill(msg.template);
        postToSidebar({ type: 'GPD_AUTOFILL_DONE', result });
        break;
      }
      case 'DANMAN_ANALYZE_PAGE_REQUEST': {
        const pageData = {
          url: window.location.href,
          title: document.title,
          headings: Array.from(document.querySelectorAll('h1,h2,h3,h4')).map(h => ({tag: h.tagName, text: h.textContent.trim().slice(0, 200)})),
          links: Array.from(document.querySelectorAll('a[href]')).slice(0, 100).map(a => ({href: a.href, text: (a.textContent || '').trim().slice(0, 100)})),
          forms: Array.from(document.querySelectorAll('form')).map(f => ({
            action: f.action, method: f.method,
            fields: Array.from(f.querySelectorAll('input,select,textarea')).map(i => ({name: i.name, type: i.type, id: i.id}))
          })),
          meta: Array.from(document.querySelectorAll('meta[name],meta[property]')).map(m => ({name: m.name || m.getAttribute('property'), content: (m.content || '').slice(0, 200)})),
          text: document.body.innerText.slice(0, 3000)
        };
        postToSidebar({ type: 'DANMAN_PAGE_ANALYSIS_RESULT', payload: pageData });
        break;
      }
      case 'DANMAN_FLOAT_OPEN':
        createDanmanFloat();
        break;
      case 'DANMAN_POPOUT_OPEN':
        chrome.runtime.sendMessage({ type: 'DANMAN_POPOUT_OPEN' }).catch((err) => {
          console.error('[DANMAN] Popout open failed:', err);
        });
        break;
      case 'GPD_CLOSE_SIDEBAR':
        toggleSidebar();
        break;
      case 'GPD_MINIMIZE_SIDEBAR':
        minimizeSidebar();
        break;
      case 'GPD_COPY_TO_CLIPBOARD': {
        navigator.clipboard.writeText(msg.text).then(() => {
          postToSidebar({ type: 'GPD_CLIPBOARD_DONE', success: true });
        }).catch(err => {
          postToSidebar({ type: 'GPD_CLIPBOARD_DONE', success: false, error: err.message });
        });
        break;
      }
    }
  });

  // ============================================================
  // EMAIL DETECTION BADGE
  // ============================================================
  function checkEmailContext() {
    const provider = detectEmailContext();
    if (provider) {
      safeSend({ type: 'LOG_ACTION', payload: {
        action: 'EMAIL_DETECTED', detail: `Email provider: ${provider}`, data: { provider }
      }});
    }
  }

  // ============================================================
  // INIT
  // ============================================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    createTriggerButton();
    checkEmailContext();
    initPageWatch();
    console.log('[DANMAN] Content script initialized');
  }

  // Continuous page sight — when enabled, notify sidebar/SW on navigation
  function initPageWatch() {
    var lastUrl = location.href;
    function snapshot() {
      try {
        return {
          url: location.href,
          title: document.title || '',
          text: (document.body && document.body.innerText || '').slice(0, 4000),
          ts: Date.now()
        };
      } catch (_) {
        return { url: location.href, title: '', text: '', ts: Date.now() };
      }
    }
    function maybeEmit() {
      chrome.storage.local.get('gpd_page_watch', function (r) {
        var watch = r && r.gpd_page_watch;
        if (!watch || !watch.enabled) return;
        var payload = snapshot();
        chrome.runtime.sendMessage({
          type: 'LOG_ACTION',
          payload: { action: 'PAGE_WATCH', detail: payload.title || payload.url, data: { url: payload.url, chars: payload.text.length } }
        }).catch(function () {});
        chrome.storage.local.set({ gpd_page_watch_latest: payload });
        if (sidebarFrame && sidebarFrame.contentWindow) {
          postToSidebar({ type: 'DANMAN_PAGE_WATCH', payload: payload });
        }
      });
    }
    setInterval(function () {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        setTimeout(maybeEmit, 800);
      }
    }, 1000);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) maybeEmit();
    });
  }
})();

// ============================================================
// FORM FILL INJECTION ENGINE
// ============================================================
(function initFormFillEngine() {
  let session = null;
  let fieldQueue = [];
  let currentFieldIndex = 0;

  chrome.storage.local.get('danman_autofill_session', function(stored) {
    session = stored.danman_autofill_session;
    if (session && session.armed) {
      prepareInjection();
      if (session.injection_mode === 'refresh') {
        setTimeout(function() { injectAllFields(); }, 500);
      }
    }
  });

  chrome.storage.onChanged.addListener(function(changes) {
    if (changes.danman_autofill_session) {
      session = changes.danman_autofill_session.newValue;
      if (session && session.armed) {
        prepareInjection();
      }
    }
  });

  function prepareInjection() {
    if (!session || !session.column_mappings || !session.cached_sheet_data) return;
    var headers = session.cached_headers || (session.cached_sheet_data[0] || []);
    var rowData = session.cached_sheet_data[session.current_row] || [];
    fieldQueue = [];

    Object.keys(session.column_mappings).forEach(function(fieldId) {
      var colName = session.column_mappings[fieldId];
      var colIndex = headers.indexOf(colName);
      if (colIndex === -1) return;
      var value = rowData[colIndex] || '';
      var el = document.getElementById(fieldId) ||
         document.querySelector('[name="' + CSS.escape(fieldId) + '"]') ||
         document.querySelector('#' + CSS.escape(fieldId));
      if (el) {
        fieldQueue.push({ el: el, fieldId: fieldId, value: value, colName: colName });
      }
    });

    currentFieldIndex = (session.field_progress && session.field_progress.length) || 0;
  }

  function shouldSkip(el) {
    if (!session || !session.skip_filled) return false;
    var val = (el.value || '').trim();
    if (!val) return false;
    if (session.overwrite_existing) return false;

    if (session.skip_mode === 'simple') {
      return val.length > 0;
    }
    // AI-enhanced: skip placeholders
    var lower = val.toLowerCase();
    var placeholders = ['select', 'choose', 'n/a', 'enter', 'type here', 'none', '--', 'please'];
    for (var i = 0; i < placeholders.length; i++) {
      if (lower.indexOf(placeholders[i]) !== -1) return false;
    }
    return true;
  }

  function injectNextField() {
    if (!session || !session.armed || currentFieldIndex >= fieldQueue.length) {
      if (currentFieldIndex >= fieldQueue.length && fieldQueue.length > 0) {
        advanceRow();
      }
      return;
    }

    while (currentFieldIndex < fieldQueue.length) {
      var item = fieldQueue[currentFieldIndex];
      if (shouldSkip(item.el)) {
        currentFieldIndex++;
        continue;
      }

      item.el.focus();
      item.el.value = item.value;
      item.el.dispatchEvent(new Event('input', { bubbles: true }));
      item.el.dispatchEvent(new Event('change', { bubbles: true }));

      item.el.style.outline = '2px solid #38bdf8';
      setTimeout(function() { item.el.style.outline = ''; }, 1000);

      currentFieldIndex++;

      session.field_progress = [];
      for (var i = 0; i < currentFieldIndex; i++) session.field_progress.push(i);
      chrome.storage.local.set({ danman_autofill_session: session });

      if (currentFieldIndex < fieldQueue.length) {
        var next = fieldQueue[currentFieldIndex];
        if (next && !shouldSkip(next.el)) {
          setTimeout(function() { next.el.focus(); }, 100);
        }
      }
      return;
    }
    advanceRow();
  }

  function injectAllFields() {
    while (currentFieldIndex < fieldQueue.length) {
      var item = fieldQueue[currentFieldIndex];
      if (!shouldSkip(item.el)) {
        item.el.value = item.value;
        item.el.dispatchEvent(new Event('input', { bubbles: true }));
        item.el.dispatchEvent(new Event('change', { bubbles: true }));
        item.el.style.outline = '2px solid #38bdf8';
        (function(el) { setTimeout(function() { el.style.outline = ''; }, 1500); })(item.el);
      }
      currentFieldIndex++;
    }
    session.field_progress = [];
    for (var i = 0; i < currentFieldIndex; i++) session.field_progress.push(i);
    chrome.storage.local.set({ danman_autofill_session: session });
    showToast('Row ' + session.current_row + ' injected');
    setTimeout(advanceRow, 1000);
  }

  function advanceRow() {
    if (!session) return;

    // Auto-submit: click the save/submit button if enabled
    if (session.auto_submit_enabled && session.submit_selector) {
      setTimeout(function() {
        var btn = document.querySelector(session.submit_selector);
        if (btn) {
          btn.click();
          console.log('[DANMAN] Auto-submitted via', session.submit_selector);
        }
      }, 500);
    }

    session.current_row++;
    session.field_progress = [];
    currentFieldIndex = 0;
    if (session.current_row >= (session.cached_sheet_data ? session.cached_sheet_data.length : 0)) {
      session.armed = false;
      chrome.storage.local.set({ danman_autofill_session: session });
      showToast('All rows injected!');
      return;
    }
    chrome.storage.local.set({ danman_autofill_session: session });
    prepareInjection();
    showToast('Row ' + session.current_row + ' of ' + ((session.cached_sheet_data ? session.cached_sheet_data.length : 1) - 1) + ' armed');
  }

  function showToast(msg) {
    var el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = 'position:fixed;bottom:20px;right:20px;padding:10px 20px;background:#38bdf8;color:#0f172a;border-radius:8px;font-weight:600;font-size:13px;z-index:99999;box-shadow:0 4px 12px rgba(0,0,0,0.3);font-family:system-ui,sans-serif;';
    document.body.appendChild(el);
    setTimeout(function() { el.remove(); }, 3000);
  }

  // Hotkey listener removed — injection is triggered via sidebar buttons only

  // Listen for sidebar messages (extension-origin frames only)
  window.addEventListener('message', function(event) {
    if (!fromExtensionFrame(event)) return;
    if (event.data && event.data.type === 'DANMAN_INJECT_NEXT') injectNextField();
    if (event.data && event.data.type === 'DANMAN_INJECT_ALL') injectAllFields();
  });

  // Element picker for auto-submit button mapping
  window.addEventListener('message', function(event) {
    if (!fromExtensionFrame(event)) return;
    if (event.data && event.data.type === 'DANMAN_PICK_ELEMENT') {
      document.body.style.cursor = 'crosshair';
      var overlay = document.createElement('div');
      overlay.id = 'danman-picker-overlay';
      overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:999998;cursor:crosshair;';
      document.body.appendChild(overlay);

      function buildSelector(el) {
        if (el.id) return '#' + el.id;
        var path = [];
        while (el && el !== document.body) {
          var tag = el.tagName.toLowerCase();
          if (el.id) { path.unshift('#' + el.id); break; }
          if (el.className && typeof el.className === 'string') {
            var cls = el.className.trim().split(/\s+/).slice(0, 2).join('.');
            path.unshift(tag + '.' + cls);
          } else {
            path.unshift(tag);
          }
          el = el.parentElement;
        }
        return path.join(' > ');
      }

      overlay.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        overlay.remove();
        document.body.style.cursor = '';
        var target = document.elementFromPoint(e.clientX, e.clientY);
        if (target) {
          var selector = buildSelector(target);
          postToSidebar({ type: 'DANMAN_ELEMENT_PICKED', selector: selector });
        }
      });
    }
  });
})();
