// sidebar/tabs/recall-tab.js — Recall: DANMAN's growing memory
// Browse, search, and grow the vectorized Drive knowledge base through the
// GAS bridge (gp_* actions). Sources it can ingest: chat replies & history,
// clipboard slots, the current page, arbitrary URLs, and uploaded files
// (via the same ingest engine the chat attachments use). Everything saved
// here is chunked + vectorized server-side into DANMAN's Drive folder, and
// the Bridge-RAG chat mode recalls it automatically — no re-pasting context.
(function () {
  'use strict';

  const container = document.getElementById('tab-recall');
  if (!container) return;

  let overviewLoaded = false;
  let pendingCapture = null; // resolver for GPD_SCRAPE_RESULT

  container.innerHTML = `
    <div class="tab-title">&#128269; Recall</div>
    <div class="tab-desc">Search and grow DANMAN's vectorized Drive memory — chats, clips, pages, files</div>

    <div class="card" id="recall-status-card">
      <div class="card-header">
        <span class="section-title">Bridge</span>
        <button class="btn btn-sm btn-secondary" id="recall-ping">Test</button>
      </div>
      <div id="recall-status" class="text-sm text-muted">Not checked yet — bridge URL comes from Settings &rarr; Integrations.</div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="section-title">Search memory</span>
        <span id="recall-overview" class="text-xs text-muted"></span>
      </div>
      <div class="flex gap-2">
        <input type="text" id="recall-query" placeholder="Semantic search over everything saved...">
        <button class="btn btn-primary btn-sm" id="recall-search-btn">Search</button>
      </div>
      <div id="recall-results" class="mt-2"></div>
    </div>

    <div class="card">
      <div class="card-header"><span class="section-title">Add to memory</span></div>

      <div class="form-group">
        <label>Current page</label>
        <button class="btn btn-secondary btn-sm btn-block" id="recall-capture-page">&#128247; Capture &amp; vectorize this page</button>
      </div>

      <div class="form-group">
        <label>Any URL</label>
        <div class="flex gap-2">
          <input type="url" id="recall-url" placeholder="https://...">
          <button class="btn btn-secondary btn-sm" id="recall-ingest-url">Ingest</button>
        </div>
      </div>

      <div class="form-group">
        <label>Files (zip / audio / pdf / docs — same pipeline as chat attachments)</label>
        <input type="file" id="recall-file-input" multiple style="display:none;">
        <button class="btn btn-secondary btn-sm btn-block" id="recall-upload-btn">&#128206; Upload &amp; vectorize files</button>
        <div id="recall-upload-status" class="text-xs text-muted mt-2"></div>
      </div>

      <div class="form-group">
        <label>Free note</label>
        <textarea id="recall-note" rows="3" placeholder="Project state, decisions, anything DANMAN should remember..."></textarea>
        <button class="btn btn-secondary btn-sm btn-block mt-2" id="recall-save-note">&#128190; Save note to memory</button>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="section-title">From chat history</span>
        <button class="btn btn-sm btn-secondary" id="recall-load-chat">Load</button>
      </div>
      <div id="recall-chat-list" class="text-sm text-muted">Load recent DANMAN messages, then save the ones worth keeping.</div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="section-title">From clipboard slots</span>
        <button class="btn btn-sm btn-secondary" id="recall-load-clips">Load</button>
      </div>
      <div id="recall-clips-list" class="text-sm text-muted">Pull the 20-slot clipboard and vectorize any slot.</div>
    </div>

    <div class="card">
      <div class="card-header"><span class="section-title">Recently saved</span></div>
      <div id="recall-log" class="text-sm text-muted">Nothing saved from this tab yet.</div>
    </div>
  `;

  const $ = (id) => container.querySelector('#' + id) || document.getElementById(id);

  // ── Local log of what this tab saved ───────────────────────────────────
  async function logSave(kind, name) {
    try {
      const { gpd_recall_log = [] } = await chrome.storage.local.get('gpd_recall_log');
      gpd_recall_log.unshift({ kind, name, at: Date.now() });
      if (gpd_recall_log.length > 50) gpd_recall_log.length = 50;
      await chrome.storage.local.set({ gpd_recall_log });
      renderLog(gpd_recall_log);
    } catch (_) {}
  }

  function renderLog(items) {
    const el = $('recall-log');
    if (!items || !items.length) { el.textContent = 'Nothing saved from this tab yet.'; return; }
    el.innerHTML = items.slice(0, 12).map((it) =>
      '<div class="result-item"><span class="badge badge-cyan">' + escText(it.kind) + '</span> '
      + escText(it.name) + '<div class="meta">' + new Date(it.at).toLocaleString() + '</div></div>'
    ).join('');
  }

  function escText(s) {
    const d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
  }

  async function saveText(text, name, kind) {
    const r = await window.sendToBackground('GP_MEMORY_SAVE', { text, name, category: '' });
    await logSave(kind, r.name || name);
    if (window.Toast) Toast.success('Vectorized: ' + (r.name || name) + (r.chunks ? ' (' + r.chunks + ' chunks)' : ''));
    return r;
  }

  // ── Bridge status / overview ───────────────────────────────────────────
  async function ping() {
    const el = $('recall-status');
    el.textContent = 'Pinging bridge…';
    try {
      const r = await window.sendToBackground('GP_PING', {});
      el.innerHTML = '<span class="badge badge-green">connected</span> '
        + escText(r.service || 'bridge') + ' ' + escText(r.version || '')
        + (r.needsSecret === false ? '' : ' — <span class="text-muted">no secret set (default folder scope)</span>');
    } catch (e) {
      el.innerHTML = '<span class="badge badge-red">unreachable</span> ' + escText(e.message || e)
        + '<div class="text-xs text-muted mt-2">Set the backend webhook URL in Settings &rarr; Integrations (your GAS /exec deployment).</div>';
    }
  }

  async function loadOverview() {
    try {
      const r = await window.sendToBackground('GP_OVERVIEW', {});
      const ov = r.overview || r;
      const total = ov.total || ov.count || (ov.categories && ov.categories.reduce
        ? ov.categories.reduce((s, c) => s + (c.count || 0), 0) : '');
      if (total !== '') $('recall-overview').textContent = total + ' items in memory';
    } catch (_) { /* overview is best-effort */ }
  }

  // ── Search ─────────────────────────────────────────────────────────────
  async function doSearch() {
    const q = $('recall-query').value.trim();
    const el = $('recall-results');
    if (!q) return;
    el.innerHTML = '<div class="text-sm text-muted">Searching…</div>';
    try {
      const r = await window.sendToBackground('GP_MEMORY_SEARCH', { query: q, limit: 8 });
      const hits = r.hits || [];
      if (!hits.length) { el.innerHTML = '<div class="empty-state"><div class="message">No matches in memory.</div></div>'; return; }
      el.innerHTML = '';
      hits.forEach((h) => {
        const item = document.createElement('div');
        item.className = 'result-item';
        item.innerHTML = '<strong>' + escText(h.name || '(unnamed)') + '</strong>'
          + (h.category ? ' <span class="badge badge-cyan">' + escText(h.category) + '</span>' : '')
          + (h.score != null ? ' <span class="text-xs text-muted">' + Number(h.score).toFixed(3) + '</span>' : '')
          + '<div class="meta">' + escText(String(h.text || '').slice(0, 300)) + '</div>';
        const row = document.createElement('div');
        row.className = 'flex gap-2 mt-2';
        const toChat = document.createElement('button');
        toChat.className = 'btn btn-sm btn-secondary';
        toChat.textContent = 'Insert into chat';
        toChat.addEventListener('click', () => {
          const ta = document.getElementById('danman-textarea');
          if (ta) {
            ta.value = (ta.value ? ta.value + '\n\n' : '') + '[Recalled memory: ' + (h.name || '') + ']\n' + (h.text || '');
            const tab = document.querySelector('#tab-bar .tab[data-tab="danman"]');
            if (tab) tab.click();
            ta.focus();
          }
        });
        const copy = document.createElement('button');
        copy.className = 'btn btn-sm btn-secondary';
        copy.textContent = 'Copy';
        copy.addEventListener('click', () => {
          if (window.copyToClipboard) window.copyToClipboard(h.text || '');
          if (window.Toast) Toast.info('Copied');
        });
        row.appendChild(toChat);
        row.appendChild(copy);
        item.appendChild(row);
        el.appendChild(item);
      });
    } catch (e) {
      el.innerHTML = '<div class="text-sm" style="color:#fca5a5;">Search failed: ' + escText(e.message || e) + '</div>';
    }
  }

  // ── Current page capture ───────────────────────────────────────────────
  function requestPageScrape() {
    return new Promise((resolve, reject) => {
      pendingCapture = resolve;
      window.sendToContent('GPD_REQUEST_SCRAPE');
      setTimeout(() => {
        if (pendingCapture) { pendingCapture = null; reject(new Error('Page scrape timed out')); }
      }, 15000);
    });
  }

  window.addEventListener('gpd-message', (e) => {
    const msg = e.detail;
    if (msg && msg.type === 'GPD_SCRAPE_RESULT' && pendingCapture) {
      const resolve = pendingCapture;
      pendingCapture = null;
      resolve(msg.data || {});
    }
  });

  async function capturePage() {
    const btn = $('recall-capture-page');
    btn.disabled = true;
    try {
      const data = await requestPageScrape();
      const r = await window.sendToBackground('GP_CAPTURE', {
        url: data.url || '', title: data.title || '',
        text: data.text || data.fullText || '',
        html: ''
      });
      await logSave('page', r.name || data.title || data.url || 'page');
      if (window.Toast) Toast.success('Page vectorized: ' + (r.name || data.title || ''));
    } catch (e) {
      if (window.Toast) Toast.error('Capture failed: ' + (e.message || e));
    }
    btn.disabled = false;
  }

  async function ingestUrl() {
    const url = $('recall-url').value.trim();
    if (!url) return;
    const btn = $('recall-ingest-url');
    btn.disabled = true;
    try {
      const resp = await fetch(url, { redirect: 'follow' });
      const html = await resp.text();
      const r = await window.sendToBackground('GP_CAPTURE', { url, title: url, html });
      await logSave('url', r.name || url);
      $('recall-url').value = '';
      if (window.Toast) Toast.success('URL vectorized: ' + (r.name || url));
    } catch (e) {
      if (window.Toast) Toast.error('URL ingest failed: ' + (e.message || e));
    }
    btn.disabled = false;
  }

  // ── File upload (shared ingest engine) ─────────────────────────────────
  async function uploadFiles(fileList) {
    const status = $('recall-upload-status');
    for (const file of Array.from(fileList || [])) {
      status.textContent = 'Ingesting ' + file.name + '…';
      try {
        const rec = await window.DMS_Ingest.ingestFile(file);
        const text = window.DMS_Ingest.summarizeForChat([rec], 100000);
        status.textContent = 'Vectorizing ' + file.name + '…';
        await saveText(text, file.name, rec.kind);
      } catch (e) {
        if (window.Toast) Toast.error(file.name + ': ' + (e.message || e));
      }
    }
    status.textContent = '';
  }

  // ── Chat history picker ────────────────────────────────────────────────
  async function loadChatHistory() {
    const el = $('recall-chat-list');
    el.textContent = 'Loading…';
    try {
      const r = await window.sendToBackground('DANMAN_GET_HISTORY', {});
      const msgs = (r && (r.history || r.messages)) || (Array.isArray(r) ? r : []);
      if (!msgs.length) { el.textContent = 'No chat history in this session.'; return; }
      el.innerHTML = '';
      msgs.slice(-15).reverse().forEach((m) => {
        const item = document.createElement('div');
        item.className = 'result-item';
        item.innerHTML = '<span class="badge ' + (m.role === 'user' ? 'badge-cyan' : 'badge-green') + '">'
          + escText(m.role) + '</span> <span class="text-sm">' + escText(String(m.content || '').slice(0, 140)) + '</span>';
        const save = document.createElement('button');
        save.className = 'btn btn-sm btn-secondary mt-2';
        save.textContent = '💾 Remember';
        save.addEventListener('click', async () => {
          save.disabled = true;
          try {
            await saveText(m.content || '', 'chat-' + m.role + '-' + new Date(m.timestamp || Date.now()).toISOString().slice(0, 19), 'chat');
            save.textContent = '✓ Saved';
          } catch (e) {
            save.disabled = false;
            if (window.Toast) Toast.error('Save failed: ' + (e.message || e));
          }
        });
        item.appendChild(save);
        el.appendChild(item);
      });
    } catch (e) {
      el.textContent = 'Failed to load history: ' + (e.message || e);
    }
  }

  // ── Clipboard slots picker ─────────────────────────────────────────────
  async function loadClips() {
    const el = $('recall-clips-list');
    el.textContent = 'Loading…';
    try {
      const r = await window.sendToBackground('CLIPBOARD_LOAD', {});
      const slots = (r && (r.slots || r.state && r.state.slots)) || [];
      const filled = (Array.isArray(slots) ? slots : Object.values(slots || {}))
        .map((s, i) => ({ i, text: (s && (s.text || s.content)) || '' }))
        .filter((s) => s.text && s.text.trim());
      if (!filled.length) { el.textContent = 'All clipboard slots are empty.'; return; }
      el.innerHTML = '';
      filled.forEach((s) => {
        const item = document.createElement('div');
        item.className = 'result-item';
        item.innerHTML = '<span class="badge badge-yellow">slot ' + (s.i + 1) + '</span> <span class="text-sm">'
          + escText(s.text.slice(0, 140)) + '</span>';
        const save = document.createElement('button');
        save.className = 'btn btn-sm btn-secondary mt-2';
        save.textContent = '💾 Remember';
        save.addEventListener('click', async () => {
          save.disabled = true;
          try {
            await saveText(s.text, 'clip-slot-' + (s.i + 1) + '-' + new Date().toISOString().slice(0, 19), 'clip');
            save.textContent = '✓ Saved';
          } catch (e) {
            save.disabled = false;
            if (window.Toast) Toast.error('Save failed: ' + (e.message || e));
          }
        });
        item.appendChild(save);
        el.appendChild(item);
      });
    } catch (e) {
      el.textContent = 'Failed to load clipboard: ' + (e.message || e);
    }
  }

  // ── Wire up ────────────────────────────────────────────────────────────
  $('recall-ping').addEventListener('click', ping);
  $('recall-search-btn').addEventListener('click', doSearch);
  $('recall-query').addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
  $('recall-capture-page').addEventListener('click', capturePage);
  $('recall-ingest-url').addEventListener('click', ingestUrl);
  $('recall-upload-btn').addEventListener('click', () => $('recall-file-input').click());
  $('recall-file-input').addEventListener('change', (e) => { uploadFiles(e.target.files); e.target.value = ''; });
  $('recall-save-note').addEventListener('click', async () => {
    const note = $('recall-note').value.trim();
    if (!note) return;
    const btn = $('recall-save-note');
    btn.disabled = true;
    try {
      await saveText(note, 'note-' + new Date().toISOString().slice(0, 19), 'note');
      $('recall-note').value = '';
    } catch (e) {
      if (window.Toast) Toast.error('Save failed: ' + (e.message || e));
    }
    btn.disabled = false;
  });
  $('recall-load-chat').addEventListener('click', loadChatHistory);
  $('recall-load-clips').addEventListener('click', loadClips);

  window.addEventListener('tab-activated', (e) => {
    if (e.detail && e.detail.tab === 'recall' && !overviewLoaded) {
      overviewLoaded = true;
      ping();
      loadOverview();
      chrome.storage.local.get('gpd_recall_log').then((r) => renderLog(r.gpd_recall_log || [])).catch(() => {});
    }
  });

  console.log('[DANMAN] Recall tab loaded');
})();
