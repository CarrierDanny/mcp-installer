// sidebar/tabs/gas-console-tab.js — Embed Apps Script HTML web app as a tab.
(function () {
  'use strict';

  const container = document.getElementById('tab-gasconsole');
  if (!container) return;

  container.innerHTML = `
    <div class="tab-title">&#128421; GAS Console</div>
    <div class="tab-desc">Your Google Apps Script HTML UI, embedded from the configured web app URL.</div>
    <div class="card" style="padding:10px;">
      <div class="form-group" style="margin-bottom:8px;">
        <label>Apps Script HTML URL</label>
        <div style="display:flex;gap:6px;">
          <input type="url" id="gas-console-url" placeholder="https://script.google.com/macros/s/.../exec" style="flex:1;">
          <button class="btn btn-sm btn-secondary" id="btn-gas-console-save">Save</button>
          <button class="btn btn-sm btn-primary" id="btn-gas-console-load">Load</button>
        </div>
        <div style="font-size:10px;color:#64748b;margin-top:4px;">
          Synced from Script Property <code>GAS_UI_URL</code> / <code>HTML_APP_URL</code>, or paste the full web app URL here.
          Same deployment as Webhook_URL works when doGet serves HTML.
        </div>
      </div>
      <div id="gas-console-status" class="text-xs text-muted" style="margin-bottom:8px;"></div>
      <iframe id="gas-console-frame"
              title="GAS Console"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
              style="width:100%;height:calc(100vh - 220px);min-height:420px;border:1px solid #334155;border-radius:8px;background:#0f172a;"></iframe>
    </div>
  `;

  const urlInput = document.getElementById('gas-console-url');
  const frame = document.getElementById('gas-console-frame');
  const status = document.getElementById('gas-console-status');

  function normalizeGasUrl(url) {
    if (!url) return '';
    return String(url).trim().split('?')[0];
  }

  function loadFrame(url) {
    const clean = normalizeGasUrl(url);
    if (!clean) {
      status.textContent = 'No GAS Console URL set. Paste one above, or Sync from Webhook in Settings.';
      frame.removeAttribute('src');
      return;
    }
    status.textContent = 'Loading ' + clean + ' …';
    frame.src = clean;
    frame.onload = function () {
      status.textContent = 'Loaded. If blank, open the URL once in a browser tab to approve Google sign-in, then Reload.';
    };
  }

  async function refreshFromConfig() {
    try {
      const cfg = await window.sendToBackground('CONFIG_LOAD');
      const url = (cfg && cfg.gas_ui && cfg.gas_ui.url) ||
        (cfg && cfg.backend && cfg.backend.webhook_url) ||
        (cfg && cfg.sheets && cfg.sheets.webhook_url) || '';
      urlInput.value = url || '';
      loadFrame(url);
    } catch (e) {
      status.textContent = 'Could not load config: ' + (e.message || e);
    }
  }

  document.getElementById('btn-gas-console-load').addEventListener('click', function () {
    loadFrame(urlInput.value);
  });

  document.getElementById('btn-gas-console-save').addEventListener('click', async function () {
    const url = normalizeGasUrl(urlInput.value);
    try {
      await window.sendToBackground('CONFIG_SAVE', { gas_ui: { url: url } });
      status.textContent = 'Saved.';
      if (window.Toast) Toast.success('GAS Console URL saved');
      loadFrame(url);
    } catch (e) {
      status.textContent = 'Save failed: ' + (e.message || e);
    }
  });

  window.addEventListener('tab-activated', function (e) {
    if (e.detail && e.detail.tab === 'gasconsole') refreshFromConfig();
  });

  window.addEventListener('gas-ui-url-changed', function (e) {
    if (e.detail && e.detail.url) {
      urlInput.value = e.detail.url;
      loadFrame(e.detail.url);
    }
  });

  refreshFromConfig();
})();
