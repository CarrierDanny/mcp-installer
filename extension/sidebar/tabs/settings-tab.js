// sidebar/tabs/settings-tab.js — Full Settings Tab
(function() {
  'use strict';

  const container = document.getElementById('tab-settings');
  if (!container) return;

  let config = {};

  // ===== Render =====
  container.innerHTML = `
    <div class="tab-title">&#9881;&#65039; Settings</div>
    <div class="tab-desc">Enter each value once. Full Google Sheets / Drive URLs are OK — IDs are extracted automatically. Full API keys and advanced options live in the extension Options page.</div>

    <!-- Unified Connection -->
    <div class="card" id="card-unified-connect" style="border:1px solid #38bdf8;">
      <div class="card-header">
        <span class="section-title">&#128279; Webhook Connection</span>
        <span class="badge" id="unified-sync-badge" style="font-size:10px;">Not synced</span>
      </div>
      <p style="font-size:12px;color:#94a3b8;margin-bottom:10px;">
        One Apps Script <code>/exec</code> URL + secret powers Sheets, Drive sync, Memory, Triage export, and GAS Console.
        Prefer the <strong>extension Options</strong> page for first-time setup; this tab mirrors the same fields.
      </p>
      <div class="form-group">
        <label>Webhook_URL <span class="text-muted">(GAS /exec — used everywhere)</span></label>
        <input type="url" id="set-webhook-url" placeholder="https://script.google.com/macros/s/.../exec">
      </div>
      <div class="form-group">
        <label>Webhook_Secret</label>
        <div class="settings-key-row">
          <input type="password" id="set-webhook-secret" placeholder="Leave blank to keep existing">
          <button class="btn btn-sm btn-secondary settings-toggle-vis" data-target="set-webhook-secret" title="Show/hide">&#128065;</button>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
        <button class="btn btn-primary" id="btn-sync-webhook" style="flex:1;">&#128260; Sync from Webhook</button>
        <button class="btn btn-secondary btn-sm" id="btn-save-webhook-only">Save</button>
        <button class="btn btn-secondary btn-sm" id="btn-open-options">Open Options</button>
      </div>
      <div id="unified-sync-status" class="text-xs text-muted" style="margin-bottom:8px;"></div>
      <div id="unified-sync-summary" style="display:none;font-size:11px;color:#94a3b8;background:#0f172a;border-radius:6px;padding:8px;">
        <div>Sheets ID: <code id="sum-sheets-id">—</code></div>
        <div>Drive Folder ID: <code id="sum-drive-id">—</code></div>
        <div>GAS UI URL: <code id="sum-gas-ui">—</code></div>
        <div>API keys: <span id="sum-api-keys">—</span></div>
      </div>
      <div class="form-group" style="margin-top:10px;">
        <label>Drive folder <span class="text-muted">(full URL or ID)</span></label>
        <input type="text" id="set-drive-folder-id" placeholder="https://drive.google.com/drive/folders/... or ID">
      </div>
      <div class="form-group">
        <label>Google Sheet <span class="text-muted">(full URL or ID)</span></label>
        <input type="text" id="set-sheets-id" placeholder="https://docs.google.com/spreadsheets/d/.../edit or ID">
      </div>
      <div class="form-group">
        <label>GAS Console / HTML URL <span class="text-muted">(optional — Sync can fill this)</span></label>
        <input type="url" id="set-gas-ui-url" placeholder="Same /exec URL or dedicated HTML deployment">
        <div style="font-size:10px;color:#64748b;margin-top:4px;">Defaults to Webhook_URL when blank. Not a second secret — just the HTML entrypoint.</div>
      </div>
      <!-- Hidden legacy fields so gatherConfig / method toggles keep working -->
      <input type="hidden" id="set-sheets-webhook" value="">
      <input type="hidden" id="set-sheets-oauth" value="">
      <input type="hidden" id="set-sheets-apikey" value="">
      <div style="display:none;">
        <button class="btn btn-sm settings-method-btn active" data-method="webhook">Webhook</button>
      </div>
    </div>

    <!-- AI Provider (models only — keys in Options) -->
    <div class="card">
      <div class="card-header">
        <span class="section-title">AI Provider</span>
      </div>
      <p style="font-size:11px;color:#64748b;margin-bottom:8px;">API keys are managed once in Options (or imported via Sync). Empty key fields never wipe saved keys.</p>

      <div class="form-group">
        <label>Provider</label>
        <select id="set-ai-provider">
          <option value="claude">Claude</option>
          <option value="gemini">Gemini</option>
          <option value="openai">OpenAI</option>
        </select>
      </div>

      <div class="form-group">
        <label>Claude Model</label>
        <select id="set-model-claude"></select>
      </div>
      <div class="form-group">
        <label>OpenAI Model</label>
        <select id="set-model-openai"></select>
      </div>
      <div class="form-group">
        <label>Gemini Model</label>
        <select id="set-model-gemini"></select>
      </div>

      <div class="form-group">
        <label>Claude API Key <span class="text-muted">(optional override)</span></label>
        <div class="settings-key-row">
          <input type="password" id="set-key-claude" placeholder="Leave blank to keep existing">
          <button class="btn btn-sm btn-secondary settings-toggle-vis" data-target="set-key-claude" title="Show/hide">&#128065;</button>
          <button class="btn btn-sm btn-secondary settings-test-btn" data-provider="claude" title="Test">Test</button>
        </div>
      </div>

      <div class="form-group">
        <label>Gemini API Key</label>
        <div class="settings-key-row">
          <input type="password" id="set-key-gemini" placeholder="Leave blank to keep existing">
          <button class="btn btn-sm btn-secondary settings-toggle-vis" data-target="set-key-gemini" title="Show/hide">&#128065;</button>
          <button class="btn btn-sm btn-secondary settings-test-btn" data-provider="gemini" title="Test">Test</button>
        </div>
      </div>

      <div class="form-group">
        <label>OpenAI API Key</label>
        <div class="settings-key-row">
          <input type="password" id="set-key-openai" placeholder="Leave blank to keep existing">
          <button class="btn btn-sm btn-secondary settings-toggle-vis" data-target="set-key-openai" title="Show/hide">&#128065;</button>
          <button class="btn btn-sm btn-secondary settings-test-btn" data-provider="openai" title="Test">Test</button>
        </div>
      </div>

      <div class="form-group">
        <label>Firecrawl API Key</label>
        <div class="settings-key-row">
          <input type="password" id="set-key-firecrawl" placeholder="Leave blank to keep existing">
          <button class="btn btn-sm btn-secondary settings-toggle-vis" data-target="set-key-firecrawl" title="Show/hide">&#128065;</button>
          <button class="btn btn-sm btn-secondary settings-test-btn" data-provider="firecrawl" title="Test">Test</button>
        </div>
      </div>
    </div>

    <!-- Salesforce -->
    <div class="card">
      <div class="card-header">
        <span class="section-title">Salesforce</span>
      </div>

      <div class="form-group">
        <label>Instance URL</label>
        <input type="url" id="set-sf-instance" placeholder="https://yourorg.my.salesforce.com">
      </div>

      <div class="form-group">
        <label>Access Token</label>
        <input type="password" id="set-sf-token" placeholder="00D...">
      </div>

      <div class="form-group">
        <label>Default Object</label>
        <select id="set-sf-object">
          <option value="Case">Case</option>
          <option value="Contact">Contact</option>
          <option value="Lead">Lead</option>
        </select>
      </div>
    </div>

    <!-- Scraping -->
    <div class="card">
      <div class="card-header">
        <span class="section-title">Scraping</span>
      </div>

      <div class="form-group">
        <label>Engine</label>
        <div class="settings-toggle-group">
          <button class="btn btn-sm settings-engine-btn active" data-engine="native">Native</button>
          <button class="btn btn-sm settings-engine-btn" data-engine="firecrawl">Firecrawl</button>
        </div>
      </div>

      <div class="form-group">
        <label>Max Depth: <span id="set-depth-val">3</span></label>
        <input type="range" id="set-scrape-depth" min="0" max="10" value="3" class="settings-slider">
      </div>

      <div class="form-group">
        <label>Delay (ms): <span id="set-delay-val">500</span></label>
        <input type="range" id="set-scrape-delay" min="0" max="5000" step="100" value="500" class="settings-slider">
      </div>

      <div class="toggle-row">
        <label>Include links</label>
        <div class="toggle"><input type="checkbox" id="set-scrape-links" checked><span class="slider"></span></div>
      </div>
      <div class="toggle-row">
        <label>Include images</label>
        <div class="toggle"><input type="checkbox" id="set-scrape-images" checked><span class="slider"></span></div>
      </div>
      <div class="toggle-row">
        <label>Include tables</label>
        <div class="toggle"><input type="checkbox" id="set-scrape-tables" checked><span class="slider"></span></div>
      </div>
      <div class="toggle-row">
        <label>Respect robots.txt</label>
        <div class="toggle"><input type="checkbox" id="set-scrape-robots" checked><span class="slider"></span></div>
      </div>
    </div>

    <!-- Data Management -->
    <div class="card">
      <div class="card-header">
        <span class="section-title">Data Management</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;">
        <button class="btn btn-secondary btn-sm" id="btn-export-config">Export Config</button>
        <button class="btn btn-secondary btn-sm" id="btn-import-config">Import Config</button>
        <button class="btn btn-secondary btn-sm" id="btn-export-logs">Export Logs</button>
        <button class="btn btn-danger btn-sm" id="btn-clear-logs">Clear Logs</button>
        <button class="btn btn-danger btn-sm" id="btn-clear-templates">Clear Autofill Templates</button>
      </div>
      <input type="file" id="settings-import-file" accept=".json" style="display:none;">
    </div>

    <!-- One-Click Backend Setup -->
    <div class="card" id="card-setup-wizard">
      <div class="card-header">
        <span class="section-title">&#128640; Backend Setup Wizard</span>
        <span class="badge" id="setup-status-badge" style="font-size:10px;">Not configured</span>
      </div>
      <p style="font-size:12px;color:#64748b;margin-bottom:12px;">Optional legacy path. Prefer Webhook Connection + Sync above when you already have a deployed Apps Script backend.</p>

      <div id="setup-status-details" style="display:none;margin-bottom:12px;">
        <div style="font-size:11px;color:#94a3b8;">
          <div id="setup-check-spreadsheet" style="margin:2px 0;">&#9744; Spreadsheet</div>
          <div id="setup-check-folders" style="margin:2px 0;">&#9744; Drive Folders</div>
          <div id="setup-check-webhook" style="margin:2px 0;">&#9744; Webhook</div>
        </div>
      </div>

      <div class="form-group">
        <label>Google OAuth Token</label>
        <input type="password" id="set-setup-oauth" placeholder="ya29... (paste your OAuth token)">
        <div style="font-size:10px;color:#64748b;margin-top:4px;">OAuth token from <a href="https://developers.google.com/oauthplayground/" target="_blank" style="color:#38bdf8;">OAuth Playground</a> — enable Drive, Sheets, Gmail, and Apps Script scopes</div>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:8px;">
        <button class="btn btn-primary" id="btn-run-setup" style="flex:1;">&#128640; Run Full Setup</button>
        <button class="btn btn-secondary btn-sm" id="btn-check-setup">Check Status</button>
      </div>

      <div id="setup-progress" style="display:none;margin-top:8px;">
        <div id="setup-progress-bar" style="height:4px;background:#334155;border-radius:2px;overflow:hidden;margin-bottom:6px;">
          <div id="setup-progress-fill" style="height:100%;width:0%;background:#0ea5e9;transition:width 0.3s ease;"></div>
        </div>
        <div id="setup-progress-text" style="font-size:11px;color:#94a3b8;"></div>
      </div>

      <div id="setup-result" style="display:none;margin-top:8px;padding:10px;background:#0f2b1a;border:1px solid #166534;border-radius:6px;">
        <div style="color:#86efac;font-size:12px;font-weight:600;margin-bottom:4px;">&#9989; Setup Complete!</div>
        <div id="setup-result-details" style="font-size:11px;color:#94a3b8;"></div>
      </div>

      <div style="margin-top:12px;border-top:1px solid #334155;padding-top:12px;">
        <div class="card-header" style="margin-bottom:8px;">
          <span class="section-title" style="font-size:11px;">Webhook Code</span>
          <button class="btn btn-secondary btn-sm" id="btn-get-webhook-code">Generate</button>
        </div>
        <div id="webhook-code-area" style="display:none;">
          <textarea id="webhook-code-output" readonly style="min-height:120px;font-family:monospace;font-size:10px;background:#0f172a;"></textarea>
          <button class="btn btn-secondary btn-sm btn-block" id="btn-copy-webhook-code" style="margin-top:4px;">&#128203; Copy Webhook Code</button>
          <p style="font-size:10px;color:#64748b;margin-top:4px;">Paste this into a new Google Apps Script project at <a href="https://script.google.com" target="_blank" style="color:#38bdf8;">script.google.com</a>, then deploy as Web App.</p>
        </div>
      </div>

      <div style="margin-top:8px;">
        <button class="btn btn-danger btn-sm" id="btn-reset-setup" style="width:100%;">Reset Setup</button>
      </div>
    </div>

    <!-- Save -->
    <button class="btn btn-primary btn-block mt-3" id="btn-save-settings">Save Settings</button>

    <div class="text-muted text-xs" style="text-align:center;margin-top:12px;">
      DANMAN v7.5.1 &mdash; GetPower<br><span style="color:#93c5fd;font-size:10px;">For API access, contact Danny.Huynh@CarrierEnterprise.com</span>
    </div>
  `;

  const $ = (id) => document.getElementById(id);

  function populateModelSelects() {
    const catalog = (globalThis.DMS_MODEL_CATALOG && globalThis.DMS_MODEL_CATALOG.AVAILABLE_MODELS) || {};
    ['claude', 'openai', 'gemini'].forEach((provider) => {
      const select = $('set-model-' + provider);
      if (!select) return;
      select.innerHTML = '';
      (catalog[provider] || []).forEach((model) => {
        const opt = document.createElement('option');
        opt.value = model.id;
        opt.textContent = model.name;
        select.appendChild(opt);
      });
    });
  }
  populateModelSelects();

  // ===== Method toggle =====
  const methodBtns = container.querySelectorAll('.settings-method-btn');
  methodBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      methodBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateSheetsVisibility();
    });
  });

  function updateSheetsVisibility() {
    const method = container.querySelector('.settings-method-btn.active')?.dataset.method || 'webhook';
    const webhookGroup = $('set-sheets-webhook-group');
    const oauthGroup = $('set-sheets-oauth-group');
    if (webhookGroup) webhookGroup.style.display = method === 'webhook' ? 'block' : 'none';
    if (oauthGroup) oauthGroup.style.display = method === 'api' ? 'block' : 'none';
  }
  updateSheetsVisibility();

  // ===== Engine toggle =====
  const engineBtns = container.querySelectorAll('.settings-engine-btn');
  engineBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      engineBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // ===== Sliders =====
  $('set-scrape-depth').addEventListener('input', (e) => {
    $('set-depth-val').textContent = e.target.value;
  });
  $('set-scrape-delay').addEventListener('input', (e) => {
    $('set-delay-val').textContent = e.target.value;
  });

  // ===== Reveal / test key buttons =====
  container.querySelectorAll('.settings-toggle-vis').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = $(btn.dataset.target);
      if (!input) return;
      input.type = input.type === 'password' ? 'text' : 'password';
    });
  });

  function renderSyncSummary(summary) {
    const box = $('unified-sync-summary');
    const badge = $('unified-sync-badge');
    if (!summary) return;
    box.style.display = 'block';
    $('sum-sheets-id').textContent = summary.spreadsheet_id || '—';
    $('sum-drive-id').textContent = summary.drive_folder_id || '—';
    $('sum-gas-ui').textContent = summary.gas_ui_url || '—';
    const keys = summary.api_keys || {};
    const present = Object.keys(keys).filter((k) => keys[k]);
    $('sum-api-keys').textContent = present.length ? present.join(', ') : 'none';
    badge.textContent = 'Synced';
    badge.style.background = 'rgba(34,197,94,0.15)';
    badge.style.color = '#22c55e';
  }

  async function syncFromWebhook() {
    const status = $('unified-sync-status');
    const btn = $('btn-sync-webhook');
    const webhookUrl = ($('set-webhook-url').value || '').trim();
    const webhookSecret = ($('set-webhook-secret').value || '').trim();
    if (!webhookUrl) {
      status.textContent = 'Enter Webhook_URL first.';
      if (window.Toast) Toast.warning(status.textContent);
      return;
    }
    btn.disabled = true;
    status.textContent = 'Syncing Drive / Sheets / keys from backend…';
    try {
      const result = await window.sendToBackground('CONFIG_SYNC_FROM_WEBHOOK', {
        webhook_url: webhookUrl,
        webhook_secret: webhookSecret
      });
      if (result && result.success) {
        status.textContent = '✓ Sync complete. Reloading settings…';
        renderSyncSummary(result.summary || {});
        if (window.Toast) Toast.success('Config synced from webhook');
        await loadConfig();
        if (window.dispatchEvent) {
          window.dispatchEvent(new CustomEvent('gas-ui-url-changed', {
            detail: { url: (result.summary && result.summary.gas_ui_url) || $('set-gas-ui-url').value }
          }));
        }
      } else {
        status.textContent = (result && result.error) || 'Sync failed';
        if (window.Toast) Toast.error(status.textContent);
      }
    } catch (e) {
      status.textContent = 'Sync failed: ' + (e.message || e);
      if (window.Toast) Toast.error(status.textContent);
    }
    btn.disabled = false;
  }

  $('btn-sync-webhook').addEventListener('click', syncFromWebhook);
  const openOpts = $('btn-open-options');
  if (openOpts) {
    openOpts.addEventListener('click', () => {
      try {
        if (chrome.runtime && chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
        else window.open(chrome.runtime.getURL('options/options.html'), '_blank');
      } catch (e) {
        window.open('../options/options.html', '_blank');
      }
    });
  }
  $('btn-save-webhook-only').addEventListener('click', async () => {
    try {
      const webhookUrl = ($('set-webhook-url').value || '').trim().split('?')[0];
      const webhookSecret = ($('set-webhook-secret').value || '').trim();
      const extracted = extractIds($('set-drive-folder-id').value, $('set-sheets-id').value);
      const gasUiUrl = ($('set-gas-ui-url').value || '').trim().split('?')[0] || webhookUrl;
      const payload = {
        backend: {
          webhook_url: webhookUrl,
          master_folder_id: extracted.drive
        },
        sheets: {
          webhook_url: webhookUrl,
          method: 'webhook',
          spreadsheet_id: extracted.sheets,
          drive_folder_id: extracted.drive
        },
        gas_ui: { url: gasUiUrl },
        memory: {
          folder_id: extracted.drive,
          drive_folder_id: extracted.drive
        }
      };
      // Never wipe secret with an empty field
      if (webhookSecret) {
        payload.backend.webhook_secret = webhookSecret;
        payload.sheets.webhook_secret = webhookSecret;
      }
      await window.sendToBackground('CONFIG_SAVE', payload);
      if (window.Toast) Toast.success('Connection saved');
      $('unified-sync-status').textContent = 'Saved. Press Sync to import IDs and keys.';
      await loadConfig();
    } catch (e) {
      if (window.Toast) Toast.error(e.message || String(e));
    }
  });

  // Cross-tab / Options page config sync
  try {
    const B = (typeof browser !== 'undefined' && browser.storage) ? browser : chrome;
    B.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.config || changes.gpd_config) {
        loadConfig().catch(() => {});
      }
    });
  } catch (_) {}

  container.querySelectorAll('.settings-test-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const provider = btn.dataset.provider;
      btn.disabled = true;
      try {
        const r = await window.sendToBackground('EJECT_TEST_API', { provider });
        if (r && (r.success || r.ok)) {
          if (window.Toast) Toast.success(provider + ' OK');
        } else {
          if (window.Toast) Toast.error((r && r.error) || (provider + ' test failed'));
        }
      } catch (e) {
        if (window.Toast) Toast.error(e.message || String(e));
      }
      btn.disabled = false;
    });
  });

  // ===== Inline styles for settings-specific elements =====
  const style = document.createElement('style');
  style.textContent = `
    .settings-key-row {
      display: flex;
      gap: 4px;
    }
    .settings-key-row input {
      flex: 1;
      min-width: 0;
    }
    .settings-toggle-group {
      display: flex;
      gap: 0;
      border: 1px solid #334155;
      border-radius: 6px;
      overflow: hidden;
    }
    .settings-toggle-group .btn {
      flex: 1;
      border-radius: 0;
      border: none;
      background: transparent;
      color: #94a3b8;
    }
    .settings-toggle-group .btn.active {
      background: #0ea5e9;
      color: #fff;
    }
    .settings-slider {
      width: 100%;
      -webkit-appearance: none;
      appearance: none;
      height: 6px;
      background: #334155;
      border-radius: 3px;
      outline: none;
      border: none;
      padding: 0;
    }
    .settings-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #0ea5e9;
      cursor: pointer;
    }
    .settings-slider::-moz-range-thumb {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #0ea5e9;
      cursor: pointer;
      border: none;
    }
  `;
  container.appendChild(style);

  // ===== Load config =====
  async function loadConfig() {
    try {
      const resp = await window.sendToBackground('CONFIG_LOAD');
      if (resp && typeof resp === 'object') {
        config = resp;
        applyConfig(mapToSidebarSettings(resp));
        const summary = {
          spreadsheet_id: resp.sheets?.spreadsheet_id || '',
          drive_folder_id: resp.memory?.folder_id || resp.sheets?.drive_folder_id || resp.backend?.master_folder_id || '',
          gas_ui_url: resp.gas_ui?.url || '',
          api_keys: {
            claude: !!(resp.api_keys && resp.api_keys.claude),
            openai: !!(resp.api_keys && resp.api_keys.openai),
            gemini: !!(resp.api_keys && resp.api_keys.gemini),
            firecrawl: !!(resp.api_keys && resp.api_keys.firecrawl)
          }
        };
        if (summary.spreadsheet_id || summary.drive_folder_id || summary.gas_ui_url) {
          renderSyncSummary(summary);
        }
      }
    } catch (err) {
      console.warn('[Settings] Failed to load config:', err);
    }
  }

  function applyConfig(c) {
    if (c.webhookUrl) $('set-webhook-url').value = c.webhookUrl;
    // Never auto-fill secrets/keys into password fields — blank means "keep existing"
    if ($('set-webhook-secret')) {
      $('set-webhook-secret').value = '';
      $('set-webhook-secret').placeholder = c.webhookSecret ? '•••• saved — leave blank to keep' : 'Leave blank to keep existing';
    }
    if (c.driveFolderId) $('set-drive-folder-id').value = c.driveFolderId;
    if (c.gasUiUrl) $('set-gas-ui-url').value = c.gasUiUrl;

    if (c.aiProvider) $('set-ai-provider').value = c.aiProvider;
    if (c.models) {
      if (c.models.claude) $('set-model-claude').value = c.models.claude;
      if (c.models.openai) $('set-model-openai').value = c.models.openai;
      if (c.models.gemini) $('set-model-gemini').value = c.models.gemini;
    }
    if (c.keys) {
      ['claude', 'gemini', 'openai', 'firecrawl'].forEach((k) => {
        const el = $('set-key-' + k);
        if (!el) return;
        el.value = '';
        el.placeholder = c.keys[k] ? '•••• saved — leave blank to keep' : 'Leave blank to keep existing';
      });
    }

    if (c.sheets) {
      if (c.sheets.method) {
        methodBtns.forEach(b => b.classList.toggle('active', b.dataset.method === c.sheets.method));
        if (typeof updateSheetsVisibility === 'function') updateSheetsVisibility();
      }
      if (c.sheets.spreadsheetId) $('set-sheets-id').value = c.sheets.spreadsheetId;
      if ($('set-sheets-webhook')) $('set-sheets-webhook').value = c.webhookUrl || c.sheets.webhookUrl || '';
    }

    if (c.salesforce) {
      if (c.salesforce.instanceUrl) $('set-sf-instance').value = c.salesforce.instanceUrl;
      if (c.salesforce.accessToken) $('set-sf-token').value = c.salesforce.accessToken;
      if (c.salesforce.defaultObject) $('set-sf-object').value = c.salesforce.defaultObject;
    }

    if (c.scraping) {
      if (c.scraping.engine) {
        engineBtns.forEach(b => b.classList.toggle('active', b.dataset.engine === c.scraping.engine));
      }
      if (c.scraping.maxDepth != null) {
        $('set-scrape-depth').value = c.scraping.maxDepth;
        $('set-depth-val').textContent = c.scraping.maxDepth;
      }
      if (c.scraping.delay != null) {
        $('set-scrape-delay').value = c.scraping.delay;
        $('set-delay-val').textContent = c.scraping.delay;
      }
      if (c.scraping.includeLinks != null) $('set-scrape-links').checked = c.scraping.includeLinks;
      if (c.scraping.includeImages != null) $('set-scrape-images').checked = c.scraping.includeImages;
      if (c.scraping.includeTables != null) $('set-scrape-tables').checked = c.scraping.includeTables;
      if (c.scraping.respectRobots != null) $('set-scrape-robots').checked = c.scraping.respectRobots;
    }
  }

  // ===== Gather config =====
  function extractIds(driveOrUrl, sheetsOrUrl) {
    const ids = (typeof GPD_GoogleIds !== 'undefined') ? GPD_GoogleIds : null;
    return {
      drive: ids ? ids.extractDriveFolderId(driveOrUrl) : String(driveOrUrl || '').trim(),
      sheets: ids ? ids.extractSpreadsheetId(sheetsOrUrl) : String(sheetsOrUrl || '').trim()
    };
  }

  function gatherConfig() {
    const webhookUrl = ($('set-webhook-url').value || '').trim().split('?')[0];
    const webhookSecret = ($('set-webhook-secret').value || '').trim();
    // Single webhook URL for Sheets + backend — no duplicate field
    const sheetsWebhook = webhookUrl;
    const gasUiUrl = ($('set-gas-ui-url').value || '').trim().split('?')[0] || webhookUrl;
    const extracted = extractIds($('set-drive-folder-id').value, $('set-sheets-id').value);
    const keys = {
      claude: ($('set-key-claude').value || '').trim(),
      gemini: ($('set-key-gemini').value || '').trim(),
      openai: ($('set-key-openai').value || '').trim(),
      firecrawl: ($('set-key-firecrawl').value || '').trim()
    };
    // Drop empty keys so CONFIG_SAVE deep-merge does not wipe synced secrets
    Object.keys(keys).forEach((k) => { if (!keys[k]) delete keys[k]; });
    return {
      webhookUrl,
      webhookSecret,
      driveFolderId: extracted.drive,
      gasUiUrl,
      aiProvider: $('set-ai-provider').value,
      models: {
        claude: $('set-model-claude').value,
        openai: $('set-model-openai').value,
        gemini: $('set-model-gemini').value
      },
      keys,
      sheets: {
        method: container.querySelector('.settings-method-btn.active')?.dataset.method || 'webhook',
        spreadsheetId: extracted.sheets,
        webhookUrl: sheetsWebhook,
        oauthToken: ($('set-sheets-oauth').value || '').trim(),
        apiKey: ($('set-sheets-apikey').value || '').trim()
      },
      salesforce: {
        instanceUrl: $('set-sf-instance').value,
        accessToken: $('set-sf-token').value,
        defaultObject: $('set-sf-object').value
      },
      scraping: {
        engine: container.querySelector('.settings-engine-btn.active')?.dataset.engine || 'native',
        maxDepth: parseInt($('set-scrape-depth').value, 10),
        delay: parseInt($('set-scrape-delay').value, 10),
        includeLinks: $('set-scrape-links').checked,
        includeImages: $('set-scrape-images').checked,
        includeTables: $('set-scrape-tables').checked,
        respectRobots: $('set-scrape-robots').checked
      }
    };
  }

  // ===== Save =====
  $('btn-save-settings').addEventListener('click', async () => {
    const btn = $('btn-save-settings');
    btn.disabled = true;
    btn.textContent = 'Saving...';
    try {
      // Map the sidebar field shape back to the canonical config before
      // saving — CONFIG_SAVE deep-merges the payload, so sending the raw
      // camelCase shape would pollute the config without changing behavior.
      const canonical = mapFromSidebarSettings(gatherConfig());
      const saved = await window.sendToBackground('CONFIG_SAVE', canonical);
      if (saved && typeof saved === 'object') config = saved;
      Toast.success('Settings saved');
    } catch (err) {
      Toast.error('Failed to save: ' + (err.message || err));
    }
    btn.disabled = false;
    btn.textContent = 'Save Settings';
  });

  // ===== Export Config =====
  $('btn-export-config').addEventListener('click', () => {
    // Export the canonical shape (round-trips with the import path below)
    // with API keys redacted — same semantics as the options-page export.
    const cfg = mapFromSidebarSettings(gatherConfig());
    if (cfg.api_keys) {
      Object.keys(cfg.api_keys).forEach((k) => {
        if (cfg.api_keys[k]) cfg.api_keys[k] = 'REDACTED';
      });
    }
    const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `danman-config-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    Toast.success('Config exported');
  });

  // ===== Import Config =====
  $('btn-import-config').addEventListener('click', () => {
    $('settings-import-file').click();
  });

  $('settings-import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const imported = JSON.parse(evt.target.result);
        const cfg = await window.sendToBackground('CONFIG_LOAD');
        const merged = mergeSidebarImportedConfig(cfg, imported);
        applyConfig(mapToSidebarSettings(merged));
        await window.sendToBackground('CONFIG_SAVE', merged);
        Toast.success('Config imported and saved');
      } catch (err) {
        Toast.error('Import failed: ' + (err.message || 'Invalid config file'));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  function isRedactedSidebarValue(v) {
    if (v == null || v === '') return true;
    if (typeof v !== 'string') return false;
    return /REDACTED|\*\*\*/i.test(v);
  }

  function mergeSidebarImportedConfig(current, raw) {
    const out = JSON.parse(JSON.stringify(current || {}));
    const inc = raw || {};
    const keys = inc.api_keys || {};
    out.api_keys = out.api_keys || {};
    ['claude', 'openai', 'gemini', 'firecrawl'].forEach((k) => {
      if (keys[k] && !isRedactedSidebarValue(keys[k])) out.api_keys[k] = keys[k];
    });
    const nested = inc.config;
    if (nested?.ai) {
      const ai = nested.ai;
      if (ai.anthropicKey && !isRedactedSidebarValue(ai.anthropicKey)) out.api_keys.claude = ai.anthropicKey;
      if (ai.openaiKey && !isRedactedSidebarValue(ai.openaiKey)) out.api_keys.openai = ai.openaiKey;
      if (ai.geminiKey && !isRedactedSidebarValue(ai.geminiKey)) out.api_keys.gemini = ai.geminiKey;
      if (ai.firecrawlKey && !isRedactedSidebarValue(ai.firecrawlKey)) out.api_keys.firecrawl = ai.firecrawlKey;
    }
    if (inc.ai_provider) out.ai_provider = inc.ai_provider;
    if (inc.ai_models) out.ai_models = { ...out.ai_models, ...inc.ai_models };
    if (inc.sheets) {
      out.sheets = { ...out.sheets, ...inc.sheets };
      if (out.sheets.webhook_url) out.sheets.webhook_url = String(out.sheets.webhook_url).split('?')[0];
    }
    if (inc.backend) {
      out.backend = { ...out.backend, ...inc.backend };
      if (out.backend.webhook_url) out.backend.webhook_url = String(out.backend.webhook_url).split('?')[0];
    }
    if (inc.scraping) out.scraping = { ...out.scraping, ...inc.scraping };
    if (inc.salesforce) out.salesforce = { ...out.salesforce, ...inc.salesforce };
    return out;
  }

  /** Inverse of mapToSidebarSettings — sidebar field shape → canonical config. */
  function mapFromSidebarSettings(s) {
    const webhookUrl = (s.webhookUrl || s.sheets?.webhookUrl || '').split('?')[0];
    const webhookSecret = (s.webhookSecret || '').trim();
    const driveFolderId = s.driveFolderId || '';
    const apiKeys = {};
    Object.keys(s.keys || {}).forEach((k) => {
      const v = (s.keys[k] || '').trim();
      if (v && !isRedactedSidebarValue(v)) apiKeys[k] = v;
    });
    const out = {
      ai_provider: s.aiProvider,
      api_keys: apiKeys,
      ai_models: { ...(s.models || {}) },
      backend: {
        webhook_url: webhookUrl,
        master_folder_id: driveFolderId
      },
      gas_ui: {
        url: s.gasUiUrl || webhookUrl || ''
      },
      memory: {
        folder_id: driveFolderId,
        drive_folder_id: driveFolderId,
        enabled: !!driveFolderId
      },
      sheets: {
        method: s.sheets.method,
        spreadsheet_id: s.sheets.spreadsheetId,
        webhook_url: webhookUrl || s.sheets.webhookUrl,
        oauth_token: s.sheets.oauthToken || undefined,
        api_key: s.sheets.apiKey || undefined,
        drive_folder_id: driveFolderId
      },
      salesforce: {
        instance_url: s.salesforce.instanceUrl,
        access_token: s.salesforce.accessToken,
        default_object: s.salesforce.defaultObject
      },
      scraping: {
        scraper_provider: s.scraping.engine,
        max_depth: s.scraping.maxDepth,
        delay_ms: s.scraping.delay,
        include_links: s.scraping.includeLinks,
        include_images: s.scraping.includeImages,
        include_tables: s.scraping.includeTables,
        respect_robots: s.scraping.respectRobots
      }
    };
    if (webhookSecret) {
      out.backend.webhook_secret = webhookSecret;
      out.sheets.webhook_secret = webhookSecret;
    }
    if (typeof GPD_GoogleIds !== 'undefined' && GPD_GoogleIds.normalizeConfigIds) {
      return GPD_GoogleIds.normalizeConfigIds(out);
    }
    return out;
  }

  function mapToSidebarSettings(c) {
    const webhookUrl = (c.backend || {}).webhook_url || (c.sheets || {}).webhook_url || '';
    const webhookSecret = (c.backend || {}).webhook_secret || (c.sheets || {}).webhook_secret || '';
    const driveFolderId = (c.memory || {}).folder_id ||
      (c.memory || {}).drive_folder_id ||
      (c.backend || {}).master_folder_id ||
      (c.sheets || {}).drive_folder_id || '';
    return {
      webhookUrl,
      webhookSecret,
      driveFolderId,
      gasUiUrl: (c.gas_ui || {}).url || '',
      aiProvider: c.ai_provider || 'claude',
      models: {
        claude: (c.ai_models || {}).claude || 'claude-sonnet-5',
        openai: (c.ai_models || {}).openai || 'gpt-5.6-terra',
        gemini: (c.ai_models || {}).gemini || 'gemini-3.5-flash'
      },
      keys: c.api_keys || {},
      sheets: {
        method: (c.sheets || {}).method || 'webhook',
        spreadsheetId: (c.sheets || {}).spreadsheet_id || '',
        webhookUrl: (c.sheets || {}).webhook_url || webhookUrl,
        oauthToken: (c.sheets || {}).oauth_token || '',
        apiKey: (c.sheets || {}).api_key || ''
      },
      salesforce: {
        instanceUrl: (c.salesforce || {}).instance_url || '',
        accessToken: (c.salesforce || {}).access_token || '',
        defaultObject: (c.salesforce || {}).default_object || 'Case'
      },
      scraping: {
        engine: (c.scraping || {}).scraper_provider || 'native',
        maxDepth: (c.scraping || {}).max_depth,
        delay: (c.scraping || {}).delay_ms,
        includeLinks: (c.scraping || {}).include_links,
        includeImages: (c.scraping || {}).include_images,
        includeTables: (c.scraping || {}).include_tables,
        respectRobots: (c.scraping || {}).respect_robots
      }
    };
  }

  // ===== Export Logs =====
  $('btn-export-logs').addEventListener('click', async () => {
    try {
      const resp = await window.sendToBackground('EXPORT_LOGS');
      const blob = new Blob([resp || '[]'], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `danman-logs-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      Toast.success('Logs exported');
    } catch (err) {
      Toast.error('Failed to export logs');
    }
  });

  // ===== Clear Logs =====
  $('btn-clear-logs').addEventListener('click', async () => {
    if (!confirm('Clear all logs? This cannot be undone.')) return;
    try {
      await window.sendToBackground('CLEAR_LOGS');
      Toast.success('Logs cleared');
    } catch (err) {
      Toast.error('Failed to clear logs');
    }
  });

  // ===== Clear Autofill Templates =====
  $('btn-clear-templates').addEventListener('click', async () => {
    if (!confirm('Clear all autofill templates? This cannot be undone.')) return;
    try {
      const cfg = await window.sendToBackground('CONFIG_LOAD');
      cfg.autofill_templates = {};
      await window.sendToBackground('CONFIG_SAVE', cfg);
      Toast.success('Autofill templates cleared');
    } catch (err) {
      Toast.error('Failed to clear templates');
    }
  });

  // ===== UI Customization (config.ui — applied live via GPD_applyUiPrefs) =====
  const UI_TAB_CHOICES = [
    'clipboard', 'danman', 'scrape', 'links', 'tree', 'forms', 'macros', 'execute',
    'ocr', 'soql', 'eject', 'cellsforce', 'sheets', 'memory', 'recall', 'bridge',
    'gasconsole', 'settings', 'help'
  ];
  const uiCard = document.createElement('div');
  uiCard.className = 'card';
  uiCard.innerHTML = `
    <div class="card-header"><span class="section-title">UI Customization</span></div>
    <div class="form-group">
      <label>Accent color</label>
      <input type="color" id="set-ui-accent" value="#38bdf8" style="height:34px;padding:2px;cursor:pointer;">
    </div>
    <div class="form-group">
      <label>Density</label>
      <select id="set-ui-density">
        <option value="comfortable">Comfortable (default)</option>
        <option value="compact">Compact</option>
      </select>
    </div>
    <div class="form-group">
      <label>Start tab (opens first when the sidebar loads)</label>
      <select id="set-ui-start-tab">${UI_TAB_CHOICES.map(t => `<option value="${t}">${t}</option>`).join('')}</select>
    </div>
    <div class="flex gap-2">
      <button class="btn btn-primary btn-sm" id="btn-ui-save">Save &amp; apply</button>
      <button class="btn btn-secondary btn-sm" id="btn-ui-reset">Reset to defaults</button>
    </div>
  `;
  container.appendChild(uiCard);

  // ===== Config sync (one config, many doors) =====
  // JSON import/export lives above; this adds the master-sheet path: a
  // CONFIG tab (key/value rows, dot-path keys) on the master spreadsheet.
  const syncCard = document.createElement('div');
  syncCard.className = 'card';
  syncCard.innerHTML = `
    <div class="card-header"><span class="section-title">Config Sync — Master Sheet</span></div>
    <div class="tab-desc" style="margin-bottom:8px;">Import settings from the master spreadsheet's CONFIG tab (column A = key like <code>memory.folder_id</code>, column B = value). All surfaces — this tab, the toolbar popup, and the options page — read and write the same stored config.</div>
    <button class="btn btn-secondary btn-sm btn-block" id="btn-import-sheet-config">&#128229; Import from Sheets CONFIG tab</button>
    <div id="sheet-config-status" class="text-xs text-muted mt-2"></div>
  `;
  container.appendChild(syncCard);

  $('btn-import-sheet-config').addEventListener('click', async () => {
    const btn = $('btn-import-sheet-config');
    const status = $('sheet-config-status');
    btn.disabled = true;
    status.textContent = 'Reading CONFIG tab…';
    try {
      const r = await window.sendToBackground('CONFIG_IMPORT_FROM_SHEET', {});
      if (r && r.success) {
        status.textContent = '✓ Imported ' + r.applied + ' keys. Reloading…';
        Toast.success('Config imported from master sheet');
        loadConfig();
        loadUiPrefs();
      } else {
        status.textContent = (r && r.error) || 'Import failed';
        Toast.error(status.textContent);
      }
    } catch (e) {
      status.textContent = 'Import failed: ' + (e.message || e);
      Toast.error(status.textContent);
    }
    btn.disabled = false;
  });

  async function loadUiPrefs() {
    try {
      const cfg = await window.sendToBackground('CONFIG_LOAD');
      const ui = (cfg && cfg.ui) || {};
      if (ui.accent_color) $('set-ui-accent').value = ui.accent_color;
      $('set-ui-density').value = ui.density || 'comfortable';
      $('set-ui-start-tab').value = ui.start_tab || 'clipboard';
    } catch (_) {}
  }

  async function saveUiPrefs(ui) {
    await window.sendToBackground('CONFIG_SAVE', { ui });
    if (window.GPD_applyUiPrefs) window.GPD_applyUiPrefs(ui);
  }

  $('btn-ui-save').addEventListener('click', async () => {
    try {
      await saveUiPrefs({
        accent_color: $('set-ui-accent').value,
        density: $('set-ui-density').value,
        start_tab: $('set-ui-start-tab').value
      });
      Toast.success('UI preferences applied');
    } catch (e) {
      Toast.error('Failed to save UI prefs: ' + (e.message || e));
    }
  });

  $('btn-ui-reset').addEventListener('click', async () => {
    try {
      const defaults = { accent_color: '#38bdf8', density: 'comfortable', start_tab: 'clipboard' };
      await saveUiPrefs(defaults);
      $('set-ui-accent').value = defaults.accent_color;
      $('set-ui-density').value = defaults.density;
      $('set-ui-start-tab').value = defaults.start_tab;
      Toast.success('UI reset to defaults');
    } catch (e) {
      Toast.error('Reset failed: ' + (e.message || e));
    }
  });

  // ===== Tab activation listener =====
  window.addEventListener('tab-activated', (e) => {
    if (e.detail.tab === 'settings') {
      loadConfig();
      loadUiPrefs();
    }
  });

  // ===== One-Click Backend Setup =====
  async function checkSetupStatus() {
    try {
      const status = await window.sendToBackground('SETUP_STATUS', {});
      const badge = document.getElementById('setup-status-badge');
      const details = document.getElementById('setup-status-details');

      if (!status) return;
      details.style.display = 'block';

      // Update checkmarks
      const ssEl = document.getElementById('setup-check-spreadsheet');
      const foldEl = document.getElementById('setup-check-folders');
      const whEl = document.getElementById('setup-check-webhook');

      ssEl.innerHTML = (status.hasSpreadsheet ? '&#9745;' : '&#9744;') + ' Spreadsheet' + (status.spreadsheetId ? ' <span style="color:#64748b;font-size:10px;">(' + status.spreadsheetId.slice(0,12) + '...)</span>' : '');
      foldEl.innerHTML = (status.hasFolders ? '&#9745;' : '&#9744;') + ' Drive Folders' + (status.driveFolderId ? ' <span style="color:#64748b;font-size:10px;">(' + status.driveFolderId.slice(0,12) + '...)</span>' : '');
      whEl.innerHTML = (status.hasWebhook ? '&#9745;' : '&#9744;') + ' Webhook';

      if (status.isComplete) {
        badge.textContent = 'Configured';
        badge.style.background = 'rgba(34,197,94,0.15)';
        badge.style.color = '#22c55e';
      } else if (status.hasSpreadsheet || status.hasFolders) {
        badge.textContent = 'Partial';
        badge.style.background = 'rgba(245,158,11,0.15)';
        badge.style.color = '#f59e0b';
      } else {
        badge.textContent = 'Not configured';
        badge.style.background = 'rgba(239,68,68,0.15)';
        badge.style.color = '#ef4444';
      }
    } catch (e) {
      console.warn('[Settings] Setup status check failed:', e);
    }
  }

  document.getElementById('btn-check-setup')?.addEventListener('click', () => {
    checkSetupStatus();
    if (window.Toast) Toast.info('Checking setup status...');
  });

  document.getElementById('btn-run-setup')?.addEventListener('click', async () => {
    const oauthToken = document.getElementById('set-setup-oauth')?.value?.trim();
    if (!oauthToken) {
      if (window.Toast) Toast.warning('Enter your Google OAuth token first');
      return;
    }

    const btn = document.getElementById('btn-run-setup');
    const progressArea = document.getElementById('setup-progress');
    const progressFill = document.getElementById('setup-progress-fill');
    const progressText = document.getElementById('setup-progress-text');
    const resultArea = document.getElementById('setup-result');
    const resultDetails = document.getElementById('setup-result-details');

    btn.disabled = true;
    btn.textContent = 'Setting up...';
    progressArea.style.display = 'block';
    resultArea.style.display = 'none';

    try {
      // Step 1: Validate token
      progressFill.style.width = '10%';
      progressText.textContent = 'Validating OAuth token...';

      // Step 2: Run setup
      progressFill.style.width = '30%';
      progressText.textContent = 'Creating spreadsheet and folders...';

      const result = await window.sendToBackground('SETUP_RUN', {
        oauthToken,
        createSpreadsheet: true,
        createFolders: true,
        generateWebhook: true
      });

      if (result && result.success) {
        progressFill.style.width = '100%';
        progressText.textContent = 'Setup complete!';
        resultArea.style.display = 'block';

        let detailsHtml = '';
        if (result.spreadsheet_id) detailsHtml += 'Spreadsheet ID: <span style="font-family:monospace;color:#e2e8f0;">' + result.spreadsheet_id + '</span><br>';
        if (result.drive_root_folder_id) detailsHtml += 'Drive Folder ID: <span style="font-family:monospace;color:#e2e8f0;">' + result.drive_root_folder_id + '</span><br>';
        if (result.steps) detailsHtml += '<br>Steps completed: ' + result.steps.filter(s => s.success).length + '/' + result.steps.length;
        resultDetails.innerHTML = detailsHtml;

        // Also update the Sheets settings fields with new values
        const ssIdField = document.getElementById('set-sheets-id');
        if (ssIdField && result.spreadsheet_id) ssIdField.value = result.spreadsheet_id;
        const oauthField = document.getElementById('set-sheets-oauth');
        if (oauthField) oauthField.value = oauthToken;

        if (window.Toast) Toast.success('Backend setup complete!');
        checkSetupStatus();
      } else {
        progressFill.style.width = '100%';
        progressFill.style.background = '#ef4444';
        progressText.textContent = 'Setup failed: ' + (result?.error || 'Unknown error');
        if (window.Toast) Toast.error('Setup failed: ' + (result?.error || 'Unknown error'));
      }
    } catch (err) {
      progressFill.style.width = '100%';
      progressFill.style.background = '#ef4444';
      progressText.textContent = 'Error: ' + err.message;
      if (window.Toast) Toast.error(err.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '&#128640; Run Full Setup';
    }
  });

  document.getElementById('btn-get-webhook-code')?.addEventListener('click', async () => {
    try {
      const result = await window.sendToBackground('SETUP_GENERATE_WEBHOOK', {});
      const codeArea = document.getElementById('webhook-code-area');
      const codeOutput = document.getElementById('webhook-code-output');
      if (result && result.code) {
        codeOutput.value = result.code;
        codeArea.style.display = 'block';
        if (window.Toast) Toast.success('Webhook code generated');
      } else {
        if (window.Toast) Toast.warning('No webhook code generated — run setup first');
      }
    } catch (err) {
      if (window.Toast) Toast.error(err.message);
    }
  });

  document.getElementById('btn-copy-webhook-code')?.addEventListener('click', () => {
    const codeOutput = document.getElementById('webhook-code-output');
    if (codeOutput && codeOutput.value) {
      window.copyToClipboard(codeOutput.value);
      if (window.Toast) Toast.success('Webhook code copied to clipboard');
    }
  });

  document.getElementById('btn-reset-setup')?.addEventListener('click', async () => {
    if (!confirm('This will clear all backend setup configuration. Your spreadsheets and Drive folders will NOT be deleted, but the extension will forget about them. Continue?')) return;
    try {
      await window.sendToBackground('SETUP_RESET', {});
      if (window.Toast) Toast.info('Setup configuration reset');
      checkSetupStatus();
    } catch (err) {
      if (window.Toast) Toast.error(err.message);
    }
  });

  // Check setup status on load
  checkSetupStatus();

  console.log('[DANMAN] Settings tab loaded');
})();
