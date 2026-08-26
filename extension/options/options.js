// options/options.js — GetPower DANMAN Settings Page Orchestrator
// Production-ready settings page with full config management
(function () {
  'use strict';

  // =========================================================================
  // CONSTANTS & MODEL DATA
  // =========================================================================

  // Shared catalog (core/model-catalog.js, loaded by options.html before this
  // file) — replaces the local copies that used to drift from the background.
  const AVAILABLE_MODELS = globalThis.DMS_MODEL_CATALOG.AVAILABLE_MODELS;
  const MODEL_LIMITS = globalThis.DMS_MODEL_CATALOG.MODEL_LIMITS;

  const TIER_LABELS = { best: 'Top Tier', balanced: 'Balanced', fast: 'Fast & Cheap' };
  const COST_LABELS = { '$': 'Low Cost', '$$': 'Moderate', '$$$': 'Premium' };
  const PROVIDERS = ['claude', 'openai', 'gemini'];

  // =========================================================================
  // UTILITY HELPERS
  // =========================================================================

  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => document.querySelectorAll(sel);

  const runtimeApi = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;

  function isBackgroundConnectionError(err) {
    const m = (err && err.message) ? err.message : String(err || '');
    return /establish connection|Receiving end does not exist|message port closed|not receiving/i.test(m);
  }

  /** Single send — Firefox uses Promises; Chrome may use callbacks. */
  function runtimeSendMessage(msg) {
    return new Promise((resolve, reject) => {
      try {
        const maybe = runtimeApi.runtime.sendMessage(msg);
        if (maybe && typeof maybe.then === 'function') {
          maybe.then(resolve).catch(reject);
          return;
        }
      } catch (_) {}
      try {
        runtimeApi.runtime.sendMessage(msg, (resp) => {
          const err = runtimeApi.runtime.lastError;
          if (err) reject(new Error(err.message || String(err)));
          else resolve(resp);
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  /** Wake background via port (more reliable than lone sendMessage on Firefox). */
  async function wakeBackgroundViaPort() {
    if (!runtimeApi.runtime.connect) return false;
    return new Promise((resolve) => {
      let settled = false;
      function done(ok) {
        if (settled) return;
        settled = true;
        resolve(ok);
      }
      try {
        const port = runtimeApi.runtime.connect({ name: 'danman-options-wake' });
        port.onMessage.addListener(() => done(true));
        port.onDisconnect.addListener(() => done(true));
        port.postMessage({ type: 'PING' });
        setTimeout(() => {
          try { port.disconnect(); } catch (_) {}
          done(true);
        }, 1500);
      } catch (_) {
        done(false);
      }
    });
  }

  /** Reliable messaging — port wake + retries + PING (Firefox event background sleeps). */
  async function sendMessageReliable(msg, maxAttempts = 8) {
    if (typeof Browser !== 'undefined' && Browser.runtime && Browser.runtime.sendMessageReliable) {
      try {
        return await Browser.runtime.sendMessageReliable(msg, maxAttempts);
      } catch (e) {
        if (!isBackgroundConnectionError(e)) throw e;
      }
    }
    let lastErr;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (attempt > 1) await new Promise((r) => setTimeout(r, 350 * attempt));
      if (attempt <= 3) await wakeBackgroundViaPort();
      try {
        const resp = await runtimeSendMessage(msg);
        if (resp && resp.error) throw new Error(resp.error);
        return resp;
      } catch (e) {
        lastErr = e;
        if (!isBackgroundConnectionError(e) || attempt >= maxAttempts) throw e;
        try { await runtimeSendMessage({ type: 'PING', payload: {} }); } catch (_) {}
      }
    }
    throw lastErr;
  }

  /** Safe sendMessage — background worker with local storage fallback for config ops. */
  const sendMsg = async (type, payload = {}) => {
    const msg = { type, payload: payload || {} };
    try {
      const resp = await sendMessageReliable(msg, 5);
      if (resp && resp.error) {
        throw new Error(resp.error);
      }
      return resp;
    } catch (err) {
      if (type === 'EJECT_TEST_API' && typeof OptionsApiTest !== 'undefined') {
        try {
          const direct = await OptionsApiTest.testConnection(payload);
          console.warn('[Options] EJECT_TEST_API via options page (background unreachable)');
          return direct;
        } catch (directErr) {
          throw new Error(directErr.message || String(directErr));
        }
      }
      if (typeof ConfigManager !== 'undefined') {
        if (type === 'CONFIG_SAVE') {
          const saved = await ConfigManager.save(payload);
          console.warn('[Options] CONFIG_SAVE via local storage (background unreachable)');
          return saved;
        }
        if (type === 'CONFIG_LOAD') {
          return await ConfigManager.load();
        }
        if (type === 'CONFIG_RESET') {
          return await ConfigManager.resetConfig();
        }
      }
      console.error(`[Options] sendMessage(${type}) failed:`, err);
      throw err;
    }
  };

  async function wakeBackgroundWorker() {
    await wakeBackgroundViaPort();
    try {
      if (typeof Browser !== 'undefined' && Browser.runtime && Browser.runtime.wakeBackground) {
        await Browser.runtime.wakeBackground();
        return;
      }
      await sendMessageReliable({ type: 'PING', payload: {} }, 4);
    } catch (_) {}
  }

  // In-memory config state
  let currentConfig = {};

  // =========================================================================
  // 1. TOAST NOTIFICATION SYSTEM
  // =========================================================================

  const Toast = {
    _container: null,

    _getContainer() {
      if (!this._container) {
        this._container = $('toast-container');
        if (!this._container) {
          this._container = document.createElement('div');
          this._container.id = 'toast-container';
          document.body.appendChild(this._container);
        }
      }
      return this._container;
    },

    show(message, type = 'info', duration = 3000) {
      const container = this._getContainer();
      const colors = { success: '#22c55e', error: '#ef4444', warning: '#f59e0b', info: '#38bdf8' };
      const icons = { success: '\u2713', error: '\u2715', warning: '\u26a0', info: '\u2139' };

      const toast = document.createElement('div');
      toast.className = `toast toast-${type}`;
      toast.innerHTML = `<span style="margin-right:8px;font-size:16px;">${icons[type] || icons.info}</span><span>${message}</span>`;
      Object.assign(toast.style, {
        background: '#1e293b', color: '#e2e8f0', padding: '12px 18px',
        borderRadius: '8px', marginBottom: '8px', fontSize: '14px',
        borderLeft: `4px solid ${colors[type] || colors.info}`,
        boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
        opacity: '0', transform: 'translateX(100%)',
        transition: 'all 0.3s ease', display: 'flex', alignItems: 'center',
        cursor: 'pointer', maxWidth: '360px'
      });

      // Click to dismiss
      toast.addEventListener('click', () => dismissToast(toast));
      container.appendChild(toast);

      requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(0)';
      });

      const timer = setTimeout(() => dismissToast(toast), duration);
      toast._timer = timer;

      function dismissToast(el) {
        clearTimeout(el._timer);
        el.style.opacity = '0';
        el.style.transform = 'translateX(100%)';
        setTimeout(() => el.remove(), 300);
      }
    },

    success(msg) { this.show(msg, 'success', 3000); },
    error(msg)   { this.show(msg, 'error', 5000); },
    warning(msg) { this.show(msg, 'warning', 4000); },
    info(msg)    { this.show(msg, 'info', 3000); }
  };

  // =========================================================================
  // 2. SIDEBAR NAVIGATION
  // =========================================================================

  const NAV_SECTIONS = ['ai-config', 'rag-scraping', 'autofill-templates', 'integrations', 'advanced', 'memory', 'config-manager'];

  function initNavigation() {
    const navButtons = $$('[data-section]');
    navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.section;
        switchSection(target);
      });
    });

    // Activate first section by default
    if (navButtons.length > 0) {
      const initial = navButtons[0].dataset.section || NAV_SECTIONS[0];
      switchSection(initial);
    }
  }

  function switchSection(sectionId) {
    // Update nav highlighting
    $$('[data-section]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.section === sectionId);
    });

    // Show/hide section content
    NAV_SECTIONS.forEach(id => {
      const el = $(`section-${id}`);
      if (el) {
        const isTarget = id === sectionId;
        el.style.display = isTarget ? 'block' : 'none';
        if (isTarget) {
          el.style.animation = 'fadeIn 0.25s ease';
        }
      }
    });
  }

  // =========================================================================
  // 3. CONFIG LOADING — populate all form fields from background worker
  // =========================================================================

  async function loadConfig() {
    try {
      const resp = await sendMsg('CONFIG_LOAD');
      if (resp && typeof resp === 'object') {
        currentConfig = resp;
        applyConfigToForm(currentConfig);
        Toast.info('Settings loaded');
      }
    } catch (err) {
      console.warn('[Options] Config load failed:', err);
      Toast.warning('Could not load saved settings, using defaults');
    }
  }

  function applyConfigToForm(c) {
    // --- AI Provider radio ---
    const providerRadio = document.querySelector(`input[name="primary-provider"][value="${c.ai_provider || 'claude'}"]`);
    if (providerRadio) providerRadio.checked = true;

    // --- API Keys ---
    const keys = c.api_keys || {};
    setVal('api-key-claude', keys.claude);
    setVal('api-key-openai', keys.openai);
    setVal('api-key-gemini', keys.gemini);
    setVal('api-key-firecrawl', keys.firecrawl);
    setVal('api-key-elevenlabs', keys.elevenlabs);
    setVal('elevenlabs-voice-id', (c.elevenlabs && (c.elevenlabs.voice_id || c.elevenlabs.agent_id)) || '');

    // --- Model dropdowns (populate first, then set value) ---
    PROVIDERS.forEach(p => {
      populateModelDropdown(p);
      const modelId = (c.ai_models || {})[p];
      if (modelId) setVal(`model-select-${p}`, modelId);
      updateModelInfo(p);
    });

    // --- Token defaults ---
    setVal('tokens-rag-extraction', c.tokens_rag || '');
    setVal('tokens-form-fill', c.tokens_form || '');
    const overrides = c.token_overrides || {};
    PROVIDERS.forEach(p => setVal(`token-override-${p}`, overrides[p] || ''));

    // --- Scraping settings ---
    const sc = c.scraping || {};
    setRangeVal('scrape-depth-slider', 'scrape-depth-value', sc.max_depth, 3);
    setVal('scrape-delay-slider', sc.delay_ms || 1000);
    setVal('scrape-timeout', Math.round((sc.timeout_ms || 30000) / 1000));
    setVal('scrape-concurrent-requests', c.concurrent_requests || 5);
    setChecked('scrape-respect-robots', sc.respect_robots !== false);
    setChecked('scrape-enable-cache', sc.firecrawl_cache === true);

    // Content type checkboxes
    setChecked('scrape-content-text', true); // always on by default
    setChecked('scrape-content-tables', sc.include_tables !== false);
    setChecked('scrape-content-images', sc.include_images !== false);
    setChecked('scrape-content-links', sc.include_links !== false);
    setChecked('scrape-content-headings', sc.include_headings !== false);
    setChecked('scrape-content-pdfs', sc.include_pdfs === true);
    setChecked('scrape-content-videos', sc.include_videos === true);

    // Exclude patterns and keywords
    setVal('scrape-exclude-patterns', (c.exclude_patterns || []).join('\n'));
    setVal('scrape-skip-keywords', (c.skip_keywords || []).join(', '));
    if ($('tree-batch-size')) $('tree-batch-size').value = c.scraping?.tree_batch_size || 25;

    // --- Integrations: Google Sheets ---
    const sh = c.sheets || {};
    const apiRadio = $('gs-method-api');
    const webhookRadio = $('gs-method-webhook');
    if (sh.method === 'webhook' && webhookRadio) webhookRadio.checked = true;
    else if (apiRadio) apiRadio.checked = true;
    setVal('gs-spreadsheet-id', sh.spreadsheet_id);
    setVal('gs-webhook-url', sh.webhook_url);
    setVal('gs-webhook-secret', sh.webhook_secret || '');
    setVal('gs-api-key', sh.api_key);
    setVal('gs-oauth-token', sh.oauth_token || '');
    updateSheetsMethodVisibility();

    // --- Integrations: Backend ---
    setVal('backend-webhook-url', (c.backend || {}).webhook_url);
    setVal('backend-webhook-secret', (c.backend || {}).webhook_secret);
    setVal('backend-folder-id', (c.backend || {}).master_folder_id);

    // --- Quick Connect (unified) ---
    const webhookUrl = (c.backend || {}).webhook_url || (c.sheets || {}).webhook_url || '';
    const webhookSecret = (c.backend || {}).webhook_secret || (c.sheets || {}).webhook_secret || '';
    setVal('quick-webhook-url', webhookUrl);
    setVal('quick-webhook-secret', webhookSecret);
    setVal('quick-gas-ui-url', (c.gas_ui || {}).url || '');
    setVal('quick-sheets-id', (c.sheets || {}).spreadsheet_id || '');
    setVal('quick-drive-id',
      (c.memory || {}).folder_id ||
      (c.backend || {}).master_folder_id ||
      (c.sheets || {}).drive_folder_id || ''
    );

    // --- Integrations: Salesforce ---
    const sf = c.salesforce || {};
    setVal('sf-instance-url', sf.instance_url);
    setVal('sf-access-token', sf.access_token || sf.client_secret || '');
    setVal('sf-default-object', sf.default_object || 'Case');

    // --- Advanced ---
    const logLevel = c.log_level || 'info';
    const logRadio = document.querySelector(`input[name="log-level"][value="${logLevel}"]`);
    if (logRadio) logRadio.checked = true;

    setVal('perf-cache-ttl', c.cache_rag_ttl || 300);
    setVal('perf-cache-max-size', c.cache_api_ttl || 60);
    setVal('perf-max-workers', c.concurrent_requests || 5);
    setVal('perf-max-queue-size', c.concurrent_scrape || 3);

    setChecked('privacy-collect-usage', c.cost_tracking !== false);
    setChecked('perf-debounce-input', c.auto_retry !== false);

    // Queue strategy
    const queueStrat = c.queue_strategy || 'fifo';
    const queueRadio = document.querySelector(`input[name="perf-queue-strategy"][value="${queueStrat}"]`);
    if (queueRadio) queueRadio.checked = true;

    // --- GCP Vision ---
    setVal('gcp-project-id', c.gcp?.project_id || '');
    if ($('gcp-vision-enabled')) $('gcp-vision-enabled').checked = !!(c.gcp?.vision_enabled);
    if ($('gcp-speech-enabled')) $('gcp-speech-enabled').checked = !!(c.gcp?.speech_enabled);
    if ($('gcp-object-enabled')) $('gcp-object-enabled').checked = !!(c.gcp?.object_detection_enabled);
    if ($('gcp-memory-drive')) $('gcp-memory-drive').checked = c.gcp?.memory_on_drive !== false;
    if ($('gcp-rag-scrape-folder')) $('gcp-rag-scrape-folder').checked = c.gcp?.rag_scrape_to_drive !== false;
    setVal('gcp-webhook-action', c.gcp?.webhook_action || 'gcp_toolkit');

    // --- Hotkey ---
    setVal('hotkey-form-fill', c.hotkey?.form_fill || 'Ctrl+Shift+Meta+V');

    // --- Memory ---
    const mem = c.memory || {};
    setVal('mem-drive-folder-id', mem.drive_folder_id || mem.folder_id || c.sheets?.drive_folder_id || '');
    setVal('mem-spreadsheet-id', mem.spreadsheet_id || c.sheets?.spreadsheet_id || c.setup?.spreadsheet_id || '');
    setVal('mem-system-prompt', mem.system_prompt || '');
    setVal('mem-persona-name', mem.persona_name || '');
    if ($('mem-persona-tone') && mem.persona_tone) $('mem-persona-tone').value = mem.persona_tone;

    // Update all token warnings
    PROVIDERS.forEach(p => updateTokenWarning(p));
  }

  /** Safe value setter — skips if element doesn't exist */
  function setVal(id, value) {
    const el = $(id);
    if (el && value !== undefined && value !== null) el.value = value;
  }

  function setChecked(id, checked) {
    const el = $(id);
    if (el) el.checked = !!checked;
  }

  function setRangeVal(sliderId, displayId, value, fallback) {
    const v = value != null ? value : fallback;
    const slider = $(sliderId);
    const display = $(displayId);
    if (slider) slider.value = v;
    if (display) display.textContent = v;
  }

  /** True when an imported value is a placeholder/redacted export, not a real secret */
  function isRedactedImportValue(value) {
    if (value == null || value === '') return true;
    if (typeof value !== 'string') return false;
    const s = value.trim();
    if (!s) return true;
    return /REDACTED|\*\*\*|^your[-_]|^paste[-_]|^sk-your|^AIza\.\.\.|^fc-your/i.test(s);
  }

  /**
   * Normalize exports from options page, sidebar, or template JSON into canonical storage shape.
   */
  function normalizeImportedConfig(raw) {
    const out = JSON.parse(JSON.stringify(raw || {}));
    delete out._README;
    delete out.meta;
    delete out.kind;
    delete out._exported_at;

    const nested = out.config;
    if (nested && typeof nested === 'object') {
      const ai = nested.ai || {};
      out.api_keys = out.api_keys || {};
      if (ai.anthropicKey && !isRedactedImportValue(ai.anthropicKey)) out.api_keys.claude = ai.anthropicKey;
      if (ai.openaiKey && !isRedactedImportValue(ai.openaiKey)) out.api_keys.openai = ai.openaiKey;
      if (ai.geminiKey && !isRedactedImportValue(ai.geminiKey)) out.api_keys.gemini = ai.geminiKey;
      if (ai.firecrawlKey && !isRedactedImportValue(ai.firecrawlKey)) out.api_keys.firecrawl = ai.firecrawlKey;
      if (ai.defaultModel) {
        out.ai_models = out.ai_models || {};
        out.ai_models.claude = ai.defaultModel;
      }
      if (ai.danmanWebhookUrl || nested.danmanWebhookUrl) {
        out.backend = out.backend || {};
        out.backend.webhook_url = String(ai.danmanWebhookUrl || nested.danmanWebhookUrl).split('?')[0];
      }
      if (ai.danmanWebhookToken) {
        out.backend = out.backend || {};
        if (!isRedactedImportValue(ai.danmanWebhookToken)) {
          out.backend.webhook_secret = ai.danmanWebhookToken;
        }
      }
      const sh = nested.sheets || {};
      out.sheets = out.sheets || {};
      if (sh.spreadsheetId) out.sheets.spreadsheet_id = sh.spreadsheetId;
      if (sh.logSheet) out.sheets.log_sheet = sh.logSheet;
      if (sh.serviceAccountKey && !isRedactedImportValue(sh.serviceAccountKey)) {
        out.sheets.webhook_secret = sh.serviceAccountKey;
      }
    }

    out.memory = out.memory || {};
    const driveFolder =
      out.memory.drive_folder_id ||
      out.memory.folder_id ||
      out.sheets?.drive_folder_id ||
      out.setup?.drive_root_folder_id;
    if (driveFolder) {
      out.memory.drive_folder_id = driveFolder;
      out.memory.folder_id = driveFolder;
    }
    if (out.sheets?.spreadsheet_id && !out.memory.spreadsheet_id) {
      out.memory.spreadsheet_id = out.sheets.spreadsheet_id;
    }
    if (out.setup?.spreadsheet_id && !out.sheets?.spreadsheet_id) {
      out.sheets = out.sheets || {};
      out.sheets.spreadsheet_id = out.setup.spreadsheet_id;
    }

    if (out.api_keys) {
      Object.keys(out.api_keys).forEach((k) => {
        if (isRedactedImportValue(out.api_keys[k])) delete out.api_keys[k];
      });
    }
    if (out.sheets) {
      if (isRedactedImportValue(out.sheets.webhook_secret)) delete out.sheets.webhook_secret;
      if (isRedactedImportValue(out.sheets.oauth_token)) delete out.sheets.oauth_token;
      if (isRedactedImportValue(out.sheets.api_key)) delete out.sheets.api_key;
      if (out.sheets.webhook_url) out.sheets.webhook_url = String(out.sheets.webhook_url).split('?')[0];
    }
    if (out.backend) {
      if (isRedactedImportValue(out.backend.webhook_secret)) delete out.backend.webhook_secret;
      if (out.backend.webhook_url) out.backend.webhook_url = String(out.backend.webhook_url).split('?')[0];
    }

    return out;
  }

  /** Deep-merge import into current config without overwriting good values with redacted/empty imports */
  function mergeImportedConfig(current, imported) {
    const base = JSON.parse(JSON.stringify(current || {}));
    const inc = normalizeImportedConfig(imported);

    function mergeObj(target, source) {
      if (!source || typeof source !== 'object' || Array.isArray(source)) return target;
      Object.keys(source).forEach((key) => {
        const next = source[key];
        if (next === undefined) return;
        if (isRedactedImportValue(next)) return;
        const cur = target[key];
        if (
          cur && typeof cur === 'object' && !Array.isArray(cur) &&
          next && typeof next === 'object' && !Array.isArray(next)
        ) {
          target[key] = mergeObj({ ...cur }, next);
        } else if (next !== '' && next != null) {
          target[key] = next;
        }
      });
      return target;
    }

    return mergeObj(base, inc);
  }

  async function applyAndPersistImportedConfig(imported) {
    const merged = mergeImportedConfig(currentConfig, imported);
    applyConfigToForm(merged);
    currentConfig = await sendMsg('CONFIG_SAVE', merged);
    if (merged.memory?.drive_folder_id) {
      await runtimeApi.storage.local.set({ drive_folder_id: merged.memory.drive_folder_id });
    }
    return merged;
  }

  // =========================================================================
  // 4. CONFIG SAVING — section-scoped save with merge
  // =========================================================================

  /** Gather fields for a specific section and merge into currentConfig */
  function gatherSectionConfig(section) {
    const merged = JSON.parse(JSON.stringify(currentConfig));

    switch (section) {
      case 'ai-config':
        merged.ai_provider = getRadioVal('primary-provider') || 'claude';
        merged.api_keys = {
          claude: getVal('api-key-claude') || (currentConfig.api_keys && currentConfig.api_keys.claude) || '',
          openai: getVal('api-key-openai') || (currentConfig.api_keys && currentConfig.api_keys.openai) || '',
          gemini: getVal('api-key-gemini') || (currentConfig.api_keys && currentConfig.api_keys.gemini) || '',
          firecrawl: getVal('api-key-firecrawl') || (currentConfig.api_keys && currentConfig.api_keys.firecrawl) || '',
          elevenlabs: getVal('api-key-elevenlabs') || (currentConfig.api_keys && currentConfig.api_keys.elevenlabs) || ''
        };
        // Empty password fields mean "keep existing"
        ['claude', 'openai', 'gemini', 'firecrawl', 'elevenlabs'].forEach((k) => {
          const elVal = getVal('api-key-' + (k === 'claude' ? 'claude' : k));
          if (!String(elVal || '').trim() && currentConfig.api_keys && currentConfig.api_keys[k]) {
            merged.api_keys[k] = currentConfig.api_keys[k];
          }
        });
        merged.elevenlabs = {
          voice_id: getVal('elevenlabs-voice-id') || '',
          agent_id: getVal('elevenlabs-voice-id') || '',
          model_id: (currentConfig.elevenlabs && currentConfig.elevenlabs.model_id) || 'eleven_multilingual_v2'
        };
        merged.ai_models = {};
        PROVIDERS.forEach(p => {
          merged.ai_models[p] = getVal(`model-select-${p}`) || '';
        });
        merged.tokens_rag = getNumVal('tokens-rag-extraction');
        merged.tokens_form = getNumVal('tokens-form-fill');
        merged.token_overrides = {};
        PROVIDERS.forEach(p => {
          const v = getNumVal(`token-override-${p}`);
          if (v) merged.token_overrides[p] = v;
        });
        merged.gcp = {
          project_id: getVal('gcp-project-id') || '',
          vision_enabled: !!($('gcp-vision-enabled')?.checked),
          speech_enabled: !!($('gcp-speech-enabled')?.checked),
          object_detection_enabled: !!($('gcp-object-enabled')?.checked),
          memory_on_drive: !!($('gcp-memory-drive')?.checked),
          rag_scrape_to_drive: !!($('gcp-rag-scrape-folder')?.checked),
          webhook_action: getVal('gcp-webhook-action') || 'gcp_toolkit'
        };
        break;

      case 'rag-scraping':
        merged.scraping = {
          ...merged.scraping,
          max_depth: getNumVal('scrape-depth-slider') || 3,
          delay_ms: getNumVal('scrape-delay-slider') || 1000,
          timeout_ms: (getNumVal('scrape-timeout') || 30) * 1000,
          include_tables: isChecked('scrape-content-tables'),
          include_images: isChecked('scrape-content-images'),
          include_links: isChecked('scrape-content-links'),
          include_headings: isChecked('scrape-content-headings'),
          include_pdfs: isChecked('scrape-content-pdfs'),
          include_videos: isChecked('scrape-content-videos'),
          respect_robots: isChecked('scrape-respect-robots'),
          firecrawl_cache: isChecked('scrape-enable-cache'),
          tree_batch_size: parseInt($('tree-batch-size')?.value) || 25
        };
        merged.concurrent_requests = getNumVal('scrape-concurrent-requests') || 5;
        // Exclude patterns (newline separated)
        const patternsEl = $('scrape-exclude-patterns');
        merged.exclude_patterns = patternsEl
          ? patternsEl.value.split('\n').map(s => s.trim()).filter(Boolean)
          : [];
        const keywordsEl = $('scrape-skip-keywords');
        merged.skip_keywords = keywordsEl
          ? keywordsEl.value.split(',').map(s => s.trim()).filter(Boolean)
          : [];
        break;

      case 'autofill-templates':
        // Autofill templates are saved to chrome.storage separately
        // This section save stores any global autofill preferences
        merged.auto_trigger = getRadioVal('auto-trigger') || 'manual';
        merged.auto_data_source = getVal('auto-data-source') || 'csv';
        merged.auto_submit_behavior = getVal('auto-submit-behavior') || 'none';
        merged.auto_error_handling = getVal('auto-error-handling') || 'stop';
        break;

      case 'integrations':
        merged.sheets = {
          ...merged.sheets,
          method: getRadioVal('gs-method') || 'api',
          spreadsheet_id: getVal('gs-spreadsheet-id'),
          webhook_url: getVal('gs-webhook-url'),
          webhook_secret: getVal('gs-webhook-secret'),
          api_key: getVal('gs-api-key'),
          oauth_token: getVal('gs-oauth-token')
        };
        merged.backend = {
          webhook_url: getVal('backend-webhook-url') || '',
          webhook_secret: getVal('backend-webhook-secret') || '',
          master_folder_id: getVal('backend-folder-id') || ''
        };
        merged.salesforce = {
          ...merged.salesforce,
          instance_url: getVal('sf-instance-url'),
          access_token: getVal('sf-access-token'),
          default_object: getVal('sf-default-object')
        };
        break;

      case 'advanced':
        merged.log_level = getRadioVal('log-level') || 'info';
        merged.cache_rag_ttl = getNumVal('perf-cache-ttl') || 300;
        merged.cache_api_ttl = getNumVal('perf-cache-max-size') || 60;
        merged.concurrent_requests = getNumVal('perf-max-workers') || 5;
        merged.concurrent_scrape = getNumVal('perf-max-queue-size') || 3;
        merged.queue_strategy = getRadioVal('perf-queue-strategy') || 'fifo';
        merged.cost_tracking = isChecked('privacy-collect-usage');
        merged.auto_retry = isChecked('perf-debounce-input');
        merged.hotkey = {
          form_fill: getVal('hotkey-form-fill') || 'Ctrl+Shift+Meta+V'
        };
        break;
    }

    return merged;
  }

  /** Section-to-status-span map */
  const SECTION_STATUS_MAP = {
    'ai-config': 'save-status-ai',
    'rag-scraping': 'save-status-rag',
    'autofill-templates': 'save-status-autofill',
    'integrations': 'save-status-integrations',
    'advanced': 'save-status-advanced'
  };

  /** Section-to-button-label map */
  const SECTION_LABEL_MAP = {
    'ai-config': 'Save AI Settings',
    'rag-scraping': 'Save Scraping Settings',
    'autofill-templates': 'Save Auto-fill Settings',
    'integrations': 'Save Integration Settings',
    'advanced': 'Save Advanced Settings'
  };

  /** Save a specific section — persists locally + logs to webhook */
  async function saveSection(section) {
    const saveBtn = $(`save-${section}`) || $(`btn-save-${section}`);
    const statusSpan = $(SECTION_STATUS_MAP[section]);
    const originalLabel = SECTION_LABEL_MAP[section] || 'Save';

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
    }

    try {
      const merged = gatherSectionConfig(section);
      const saved = await sendMsg('CONFIG_SAVE', merged);
      currentConfig = (saved && typeof saved === 'object' && !saved.error) ? saved : merged;

      // Show save timestamp
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      if (statusSpan) {
        statusSpan.style.color = '#22c55e';
        statusSpan.textContent = `\u2713 Saved at ${timeStr}`;
      }

      // Log config change to webhook for audit trail (silent if background asleep)
      sendMsg('LOG_CONFIG_CHANGE', {
        section,
        timestamp: now.toISOString(),
        changes_summary: `${section} settings updated`
      }).catch(() => {});

      Toast.success(`${section.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} saved`);
    } catch (err) {
      if (statusSpan) {
        statusSpan.style.color = '#ef4444';
        statusSpan.textContent = `\u2717 Save failed`;
      }
      const hint = isBackgroundConnectionError(err)
        ? 'Background worker not responding — reload the extension in about:debugging, then try again'
        : (err.message || 'Unknown error');
      Toast.error(`Save failed: ${hint}`);
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = originalLabel;
      }
    }
  }

  function getVal(id) {
    const el = $(id);
    return el ? el.value.trim() : '';
  }

  function getNumVal(id) {
    const v = getVal(id);
    return v ? parseInt(v, 10) || 0 : 0;
  }

  function isChecked(id) {
    const el = $(id);
    return el ? el.checked : false;
  }

  function getRadioVal(name) {
    const el = document.querySelector(`input[name="${name}"]:checked`);
    return el ? el.value : '';
  }

  // =========================================================================
  // 5. API KEY MANAGEMENT
  // =========================================================================

  function initApiKeyManagement() {
    // Test buttons for each provider + firecrawl
    ['claude', 'openai', 'gemini', 'firecrawl'].forEach(provider => {
      const testBtn = $(`btn-test-${provider}`);
      const statusDiv = $(`status-${provider}`);
      const revealBtn = $(`btn-reveal-${provider}`);
      const keyInput = $(`api-key-${provider}`);

      // Test connection — tests the live key/model, then auto-saves on success
      if (testBtn) {
        testBtn.addEventListener('click', async () => {
          const key = keyInput ? keyInput.value.trim() : '';
          if (!key) {
            setStatus(statusDiv, 'warning', 'No API key entered');
            return;
          }
          const modelSelect = $(`model-select-${provider}`);
          const model = modelSelect ? modelSelect.value : null;
          testBtn.disabled = true;
          testBtn.textContent = 'Testing...';
          setStatus(statusDiv, 'info', 'Testing connection...');
          try {
            let resp;
            if (typeof OptionsApiTest !== 'undefined') {
              resp = await OptionsApiTest.testConnection({ provider, apiKey: key, model });
            } else {
              await wakeBackgroundWorker();
              resp = await sendMsg('EJECT_TEST_API', { provider, apiKey: key, model });
            }
            if (!resp?.success) {
              throw new Error(resp?.error || 'Connection failed');
            }
            // Auto-save key + model on successful test
            const nextConfig = JSON.parse(JSON.stringify(currentConfig || {}));
            nextConfig.api_keys = {
              ...(nextConfig.api_keys || {}),
              [provider]: key
            };
            if (provider !== 'firecrawl') {
              nextConfig.ai_models = {
                ...(nextConfig.ai_models || {}),
                [provider]: model || ''
              };
            }
            if (!nextConfig.ai_provider && provider !== 'firecrawl') {
              nextConfig.ai_provider = provider;
            }
            await sendMsg('CONFIG_SAVE', nextConfig);
            currentConfig = await sendMsg('CONFIG_LOAD');
            setStatus(statusDiv, 'success', '\u2705 Valid \u2014 tested and saved');
          } catch (err) {
            setStatus(statusDiv, 'error', `\u274C ${err.message || 'Test failed'}`);
          } finally {
            testBtn.disabled = false;
            testBtn.textContent = 'Test';
          }
        });
      }

      // Reveal/hide toggle
      if (revealBtn && keyInput) {
        revealBtn.addEventListener('click', () => {
          const isPassword = keyInput.type === 'password';
          keyInput.type = isPassword ? 'text' : 'password';
          revealBtn.textContent = isPassword ? 'Hide' : 'Show';
          revealBtn.title = isPassword ? 'Hide API key' : 'Reveal API key';
        });
      }
    });

    // ElevenLabs reveal (no test endpoint)
    const elReveal = $('btn-reveal-elevenlabs');
    const elKey = $('api-key-elevenlabs');
    if (elReveal && elKey) {
      elReveal.addEventListener('click', () => {
        const isPassword = elKey.type === 'password';
        elKey.type = isPassword ? 'text' : 'password';
        elReveal.textContent = isPassword ? 'Hide' : 'Show';
      });
    }
  }

  function setStatus(el, type, message) {
    if (!el) return;
    const icons = { success: '\u2705', error: '\u274c', warning: '\u26a0\ufe0f', info: '\u2139\ufe0f' };
    const colors = { success: '#22c55e', error: '#ef4444', warning: '#f59e0b', info: '#38bdf8' };
    el.innerHTML = `<span style="color:${colors[type] || '#94a3b8'}">${icons[type] || ''} ${message}</span>`;
  }

  // =========================================================================
  // 6. MODEL SELECTION & INFO DISPLAY
  // =========================================================================

  function populateModelDropdown(provider) {
    const select = $(`model-select-${provider}`);
    if (!select) return;

    const models = AVAILABLE_MODELS[provider] || [];
    select.innerHTML = '';

    models.forEach(model => {
      const opt = document.createElement('option');
      opt.value = model.id;
      opt.textContent = model.name;
      opt.dataset.tier = model.tier;
      select.appendChild(opt);
    });

    // Listen for changes
    select.addEventListener('change', () => {
      updateModelInfo(provider);
      updateTokenWarning(provider);
    });
  }

  function updateModelInfo(provider) {
    const select = $(`model-select-${provider}`);
    const infoDiv = $(`model-info-${provider}`);
    if (!select || !infoDiv) return;

    const modelId = select.value;
    const limits = MODEL_LIMITS[modelId];

    if (!limits) {
      infoDiv.innerHTML = '<span style="color:#64748b">Select a model to see details</span>';
      return;
    }

    const model = (AVAILABLE_MODELS[provider] || []).find(m => m.id === modelId);
    const tierLabel = model ? (TIER_LABELS[model.tier] || model.tier) : '';
    const costLabel = COST_LABELS[limits.cost] || limits.cost;
    const contextK = (limits.context / 1000).toFixed(0) + 'K';

    infoDiv.innerHTML = `
      <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:12px;margin-top:6px;">
        <span style="color:#94a3b8">Context: <strong style="color:#e2e8f0">${contextK}</strong></span>
        <span style="color:#94a3b8">Max Output: <strong style="color:#e2e8f0">${limits.maxOutput.toLocaleString()}</strong></span>
        <span style="color:#94a3b8">Tier: <strong style="color:#38bdf8">${tierLabel}</strong></span>
        <span style="color:#94a3b8">Cost: <strong style="color:#f59e0b">${costLabel}</strong></span>
      </div>`;
  }

  // =========================================================================
  // 7. TOKEN LIMIT VALIDATION
  // =========================================================================

  function initTokenValidation() {
    // Global token inputs
    ['tokens-rag-extraction', 'tokens-form-fill'].forEach(id => {
      const el = $(id);
      if (el) el.addEventListener('input', () => PROVIDERS.forEach(updateTokenWarning));
    });

    // Per-model override inputs
    PROVIDERS.forEach(p => {
      const el = $(`token-override-${p}`);
      if (el) el.addEventListener('input', () => updateTokenWarning(p));
    });
  }

  function updateTokenWarning(provider) {
    const warningDiv = $(`token-warning-${provider}`);
    if (!warningDiv) return;

    const select = $(`model-select-${provider}`);
    if (!select) return;

    const modelId = select.value;
    const limits = MODEL_LIMITS[modelId];
    if (!limits) {
      warningDiv.innerHTML = '';
      return;
    }

    // Get effective token count: override > global RAG default
    const overrideEl = $(`token-override-${provider}`);
    const globalEl = $('tokens-rag-extraction');
    const overrideVal = overrideEl ? parseInt(overrideEl.value, 10) : 0;
    const globalVal = globalEl ? parseInt(globalEl.value, 10) : 0;
    const tokens = overrideVal || globalVal;

    if (!tokens || tokens <= 0) {
      warningDiv.innerHTML = '<span style="color:#64748b;font-size:12px">Set token limit to see validation</span>';
      return;
    }

    const maxOut = limits.maxOutput;
    const ratio = tokens / maxOut;

    let color, icon, message;
    if (ratio <= 0.8) {
      color = '#22c55e';
      icon = '\u2705';
      message = 'Within safe limits';
    } else if (ratio <= 0.95) {
      color = '#f59e0b';
      icon = '\u26a0\ufe0f';
      message = `Approaching limit (${Math.round(ratio * 100)}% of ${maxOut.toLocaleString()} max)`;
    } else {
      color = '#ef4444';
      icon = '\ud83d\udd34';
      message = `Exceeds model limit (${tokens.toLocaleString()} > ${maxOut.toLocaleString()} max output)`;
    }

    warningDiv.innerHTML = `<span style="color:${color};font-size:12px">${icon} ${message}</span>`;
  }

  // =========================================================================
  // 8. RAG TREE VISUALIZER
  // =========================================================================

  let treeData = null;

  function initTreeVisualizer() {
    const generateBtn = $('btn-generate-tree');
    const clearBtn = $('btn-clear-tree');
    const expandBtn = $('btn-expand-all');
    const collapseBtn = $('btn-collapse-all');
    const pauseBtn = $('btn-pause-tree');
    const resumeBtn = $('btn-resume-tree');
    const cancelBtn = $('btn-cancel-tree');
    const exportBtn = $('btn-export-tree');
    const exportPanel = $('tree-export-panel');
    const runExportBtn = $('btn-run-export');
    const exportStatusEl = $('export-status');

    function setTreeButtonState(status) {
      if (generateBtn) generateBtn.style.display = (status === 'idle' || status === 'complete' || status === 'error' || status === 'cancelled') ? '' : 'none';
      if (pauseBtn) pauseBtn.style.display = status === 'crawling' ? '' : 'none';
      if (resumeBtn) resumeBtn.style.display = status === 'paused' ? '' : 'none';
      if (cancelBtn) cancelBtn.style.display = (status === 'crawling' || status === 'paused') ? '' : 'none';
      if (exportBtn) exportBtn.style.display = treeData ? '' : 'none';
    }

    if (generateBtn) {
      generateBtn.addEventListener('click', async () => {
        const url = getVal('rag-url-input');
        if (!url) {
          Toast.warning('Enter a starting URL first');
          return;
        }

        const depth = getNumVal('scrape-depth-slider') || 3;
        generateBtn.disabled = true;
        generateBtn.textContent = 'Crawling...';

        const container = $('rag-tree-container');
        showCrawlProgress(container, url, depth, 0, 0, url, 0);
        setSummaryValues(0, 0, 'Crawling...', '$?.??');
        Toast.info(`Crawling up to ${depth} degrees of separation...`);

        try {
          // Fire off the crawl — returns immediately (async background pattern)
          const startResp = await sendMsg('CRAWL_TREE', { url, depth });
          if (startResp?.error) {
            throw new Error(startResp.error);
          }

          // Poll for progress until complete or error
          await pollCrawlTreeStatus(container, generateBtn);
        } catch (err) {
          Toast.error(`Tree generation failed: ${err.message}`);
          if (container) container.innerHTML = `<div style="color:#ef4444;text-align:center;padding:24px;">Error: ${err.message}</div>`;
          generateBtn.disabled = false;
          generateBtn.textContent = 'Generate Tree';
        }
      });
    }

    /** Show crawl progress spinner with live stats */
    function showCrawlProgress(container, url, depth, pagesFound, uniqueUrls, currentUrl, currentDepth) {
      if (!container) return;
      const truncUrl = (currentUrl || url).length > 60 ? (currentUrl || url).substring(0, 57) + '...' : (currentUrl || url);
      container.innerHTML = `
        <div style="text-align:center;padding:32px;">
          <div class="crawl-spinner" style="display:inline-block;width:40px;height:40px;border:3px solid #334155;border-top:3px solid #38bdf8;border-radius:50%;animation:spin 1s linear infinite;margin-bottom:16px;"></div>
          <style>@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}</style>
          <div style="color:#e2e8f0;font-size:14px;font-weight:600;">Crawling ${depth} degrees deep...</div>
          <div style="color:#94a3b8;font-size:12px;margin-top:8px;">Depth <strong style="color:#38bdf8;">D${currentDepth}</strong>: <span style="color:#38bdf8;">${truncUrl}</span></div>
          <div style="display:flex;gap:24px;justify-content:center;margin-top:16px;">
            <div style="text-align:center;">
              <div style="color:#22c55e;font-size:20px;font-weight:bold;">${pagesFound}</div>
              <div style="color:#64748b;font-size:11px;">Pages Found</div>
            </div>
            <div style="text-align:center;">
              <div style="color:#38bdf8;font-size:20px;font-weight:bold;">${uniqueUrls}</div>
              <div style="color:#64748b;font-size:11px;">Unique URLs</div>
            </div>
          </div>
          <div style="color:#64748b;font-size:11px;margin-top:12px;">Following each link to discover sub-links... this may take a while.</div>
        </div>`;
    }

    /** Poll CRAWL_TREE_STATUS every 2 seconds until done */
    async function pollCrawlTreeStatus(container, btn) {
      return new Promise((resolve, reject) => {
        const interval = setInterval(async () => {
          try {
            const state = await sendMsg('CRAWL_TREE_STATUS');

            if (!state || state.status === 'idle') {
              clearInterval(interval);
              btn.disabled = false;
              btn.textContent = 'Generate Tree';
              reject(new Error('Crawl not running'));
              return;
            }

            if (state.status === 'crawling') {
              setTreeButtonState('crawling');
              showCrawlProgress(
                container, state.startUrl, state.maxDepth,
                state.pagesFound || 0, state.uniqueUrls || 0,
                state.currentUrl || '', state.currentDepth || 0
              );
              setSummaryValues(
                state.currentDepth || 0,
                state.pagesFound || 0,
                'Crawling...',
                `$${((state.pagesFound || 0) * 0.002).toFixed(3)}`
              );
              return; // keep polling
            }

            if (state.status === 'paused') {
              setTreeButtonState('paused');
              if (container) TreeRenderer.showPaused(container, state);
              return; // keep polling
            }

            if (state.status === 'cancelled') {
              clearInterval(interval);
              setTreeButtonState('cancelled');
              btn.disabled = false;
              btn.textContent = 'Generate Tree';
              if (state.tree) {
                treeData = state.tree;
                renderTree(state.tree);
                exportBtn.style.display = '';
              }
              resolve();
              return;
            }

            if (state.status === 'complete') {
              clearInterval(interval);
              setTreeButtonState('complete');
              btn.disabled = false;
              btn.textContent = 'Generate Tree';

              if (state.tree) {
                treeData = state.tree;
                renderTree(state.tree);
                Toast.success(`Tree complete: ${state.pagesFound || '?'} pages, ${state.uniqueUrls || '?'} unique URLs`);
              } else {
                Toast.warning('Crawl complete but no tree data');
              }
              resolve();
              return;
            }

            if (state.status === 'error') {
              clearInterval(interval);
              setTreeButtonState('error');
              btn.disabled = false;
              btn.textContent = 'Generate Tree';
              Toast.error(`Crawl error: ${state.error || 'Unknown'}`);
              if (container) container.innerHTML = `<div style="color:#ef4444;text-align:center;padding:24px;">Crawl error: ${state.error || 'Unknown error'}</div>`;
              reject(new Error(state.error));
              return;
            }
          } catch (err) {
            // Polling error — service worker may have restarted, keep trying
            console.warn('[Options] Crawl status poll error:', err.message);
          }
        }, 2000); // Poll every 2 seconds

        // Safety timeout: stop polling after 10 minutes
        setTimeout(() => {
          clearInterval(interval);
          btn.disabled = false;
          btn.textContent = 'Generate Tree';
          Toast.warning('Crawl timed out after 10 minutes');
          resolve();
        }, 10 * 60 * 1000);
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        const container = $('rag-tree-container');
        if (container) container.innerHTML = '<div class="tree-placeholder">Enter a URL and click "Generate Tree" to visualize the site structure.</div>';
        treeData = null;
        setSummaryValues(0, 0, '--', '$0.00');
      });
    }

    if (expandBtn) expandBtn.addEventListener('click', () => toggleAllTreeNodes(true));
    if (collapseBtn) collapseBtn.addEventListener('click', () => toggleAllTreeNodes(false));

    if (pauseBtn) pauseBtn.addEventListener('click', () => sendMsg('CRAWL_TREE_PAUSE'));
    if (resumeBtn) resumeBtn.addEventListener('click', () => sendMsg('CRAWL_TREE_RESUME'));
    if (cancelBtn) cancelBtn.addEventListener('click', () => sendMsg('CRAWL_TREE_CANCEL'));

    if (exportBtn) exportBtn.addEventListener('click', () => {
      if (exportPanel) exportPanel.style.display = exportPanel.style.display === 'none' ? '' : 'none';
      if (treeData && $('export-diagram') && $('export-diagram').checked) {
        TreeDiagram.renderInline(treeData, $('diagram-preview'), { collapseDepth: 2 });
      }
    });

    const diagCheckbox = $('export-diagram');
    if (diagCheckbox) diagCheckbox.addEventListener('change', function() {
      const preview = $('diagram-preview');
      if (this.checked && treeData && preview) {
        TreeDiagram.renderInline(treeData, preview, { collapseDepth: 2 });
      } else if (preview) {
        preview.innerHTML = '';
      }
    });

    if (runExportBtn) runExportBtn.addEventListener('click', async () => {
      if (!treeData) return;
      if (exportStatusEl) { exportStatusEl.textContent = 'Exporting...'; exportStatusEl.style.color = '#38bdf8'; }
      const domain = new URL(treeData.url).hostname.replace(/^www\./, '');
      const dateStr = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '');
      const baseName = 'Tree_' + domain + '_' + dateStr;

      try {
        if ($('export-flat') && $('export-flat').checked) {
          const rows = TreeExport.flattenToRows(treeData);
          await sendMsg('SHEETS_WEBHOOK', { action: 'tree_batch', sheet_name: baseName, rows, batch_number: 1 });
        }
        if ($('export-paths') && $('export-paths').checked) {
          await TreeExport.exportPathColumnsToSheet(treeData, baseName, 6);
        }
        if ($('export-indented') && $('export-indented').checked) {
          await TreeExport.exportIndentedToSheet(treeData, baseName);
        }
        if ($('export-diagram') && $('export-diagram').checked) {
          const html = TreeDiagram.generateHTML(treeData, { title: 'Tree: ' + domain });
          await TreeExport.exportDiagramToDrive(html, baseName + '_diagram.html');
        }
        if ($('export-json') && $('export-json').checked) TreeExport.downloadJSON(treeData, baseName + '.json');
        if ($('export-csv') && $('export-csv').checked) TreeExport.downloadCSV(treeData, baseName + '.csv');

        if (exportStatusEl) { exportStatusEl.textContent = '\u2713 Export complete'; exportStatusEl.style.color = '#22c55e'; }
        setTimeout(() => { if (exportStatusEl) exportStatusEl.textContent = ''; }, 3000);
      } catch (e) {
        if (exportStatusEl) { exportStatusEl.textContent = 'Error: ' + e.message; exportStatusEl.style.color = '#ef4444'; }
      }
    });
  }

  function renderTree(node, container, depth = 0) {
    const target = container || $('rag-tree-container');
    if (!target) return;
    if (!container) target.innerHTML = ''; // Clear on root call

    const item = document.createElement('div');
    item.className = 'tree-node';
    item.style.paddingLeft = `${depth * 20}px`;

    const hasChildren = node.children && node.children.length > 0;
    const expandIcon = hasChildren
      ? '<span class="tree-toggle" style="cursor:pointer;margin-right:4px;">&#9660;</span>'
      : '<span style="margin-right:4px;opacity:0.3;">&#8226;</span>';

    // Status indicator
    const statusColors = {
      done: '#22c55e', error: '#ef4444', max_depth: '#f59e0b',
      already_visited: '#64748b', pending: '#94a3b8', crawling: '#38bdf8'
    };
    const statusIcons = {
      done: '', error: '\u26a0', max_depth: '\u23f1', already_visited: '\u21a9', pending: '\u2026'
    };
    const statusColor = statusColors[node.status] || '#94a3b8';
    const statusIcon = statusIcons[node.status] || '';

    // Link count badge
    const linkBadge = node.linkCount > 0
      ? `<span style="font-size:10px;color:#64748b;background:#1e293b;padding:1px 5px;border-radius:4px;margin-left:6px;">${node.linkCount} links</span>`
      : '';

    // Depth badge
    const depthBadge = `<span style="font-size:10px;color:${statusColor};margin-left:4px;">D${depth}</span>`;

    // Truncate title for display
    const displayTitle = (node.title || node.url || 'Unknown').length > 80
      ? (node.title || node.url).substring(0, 77) + '...'
      : (node.title || node.url || 'Unknown');

    item.innerHTML = `
      <div class="tree-row" style="display:flex;align-items:center;padding:3px 0;border-left:2px solid ${statusColor};margin-left:${depth > 0 ? 8 : 0}px;padding-left:6px;">
        ${expandIcon}
        <label style="display:flex;align-items:center;gap:5px;cursor:pointer;margin:0;color:#e2e8f0;font-size:12px;flex:1;min-width:0;">
          <input type="checkbox" class="tree-checkbox" checked data-url="${node.url || ''}" data-depth="${depth}" style="margin:0;flex-shrink:0;">
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${node.url || ''}">${statusIcon ? statusIcon + ' ' : ''}${displayTitle}</span>
        </label>
        ${depthBadge}${linkBadge}
      </div>`;

    const childContainer = document.createElement('div');
    childContainer.className = 'tree-children';
    // Auto-collapse deeper levels (depth >= 2)
    childContainer.style.display = depth >= 2 ? 'none' : 'block';

    // Toggle expand/collapse
    const toggle = item.querySelector('.tree-toggle');
    if (toggle) {
      if (depth >= 2) toggle.innerHTML = '&#9654;'; // Start collapsed
      toggle.addEventListener('click', () => {
        const isOpen = childContainer.style.display !== 'none';
        childContainer.style.display = isOpen ? 'none' : 'block';
        toggle.innerHTML = isOpen ? '&#9654;' : '&#9660;';
      });
    }

    // Checkbox change cascades + updates summary
    const checkbox = item.querySelector('.tree-checkbox');
    if (checkbox) {
      checkbox.addEventListener('change', () => {
        childContainer.querySelectorAll('.tree-checkbox').forEach(cb => {
          cb.checked = checkbox.checked;
        });
        updateTreeSummary();
      });
    }

    target.appendChild(item);
    target.appendChild(childContainer);

    if (hasChildren) {
      node.children.forEach(child => renderTree(child, childContainer, depth + 1));
    }

    if (depth === 0) updateTreeSummary();
  }

  function toggleAllTreeNodes(expand) {
    const container = $('rag-tree-container');
    if (!container) return;
    container.querySelectorAll('.tree-children').forEach(el => {
      el.style.display = expand ? 'block' : 'none';
    });
    container.querySelectorAll('.tree-toggle').forEach(el => {
      el.innerHTML = expand ? '&#9660;' : '&#9654;';
    });
  }

  function setSummaryValues(branches, pages, time, cost) {
    const el = id => $(id);
    if (el('rag-summary-branches')) el('rag-summary-branches').textContent = branches;
    if (el('rag-summary-pages')) el('rag-summary-pages').textContent = pages;
    if (el('rag-summary-time')) el('rag-summary-time').textContent = time;
    if (el('rag-summary-cost')) el('rag-summary-cost').textContent = cost;
  }

  function updateTreeSummary() {
    const container = $('rag-tree-container');
    if (!container) return;

    const all = container.querySelectorAll('.tree-checkbox');
    const checked = container.querySelectorAll('.tree-checkbox:checked');

    // Count unique depths for "branches"
    const depths = new Set();
    checked.forEach(cb => {
      const d = cb.dataset.depth;
      if (d !== undefined) depths.add(d);
    });

    const pageCount = checked.length;
    const branchCount = depths.size;

    // Estimate time: ~1.5s per page (scrape + AI)
    const estSeconds = pageCount * 1.5;
    const estTime = estSeconds < 60
      ? `~${Math.round(estSeconds)}s`
      : `~${Math.round(estSeconds / 60)}m ${Math.round(estSeconds % 60)}s`;

    // Estimate cost: ~$0.002 per page (avg across providers)
    const estCost = `$${(pageCount * 0.002).toFixed(3)}`;

    setSummaryValues(branchCount, `${pageCount}/${all.length}`, estTime, estCost);
  }

  // =========================================================================
  // 9. SCRAPING SETTINGS — range sliders, checkboxes, patterns
  // =========================================================================

  function initScrapingSettings() {
    // Range slider live display
    bindRangeDisplay('scrape-depth-slider', 'scrape-depth-value');
    bindRangeDisplay('scrape-delay-slider', 'scrape-delay-value');

    // Delay and timeout as regular inputs (already handled by load)
    // Max concurrent handled by load
  }

  function bindRangeDisplay(sliderId, displayId) {
    const slider = $(sliderId);
    const display = $(displayId);
    if (slider && display) {
      slider.addEventListener('input', () => {
        display.textContent = slider.value;
      });
    }
  }

  // =========================================================================
  // 10. AUTOFILL TEMPLATE MANAGEMENT
  // =========================================================================

  let templates = [];

  async function loadTemplates() {
    try {
      const result = await chrome.storage.local.get('autofill_templates');
      templates = result.autofill_templates || [];
      renderTemplateList();
    } catch (err) {
      console.warn('[Options] Failed to load templates:', err);
    }
  }

  async function saveTemplates() {
    try {
      await chrome.storage.local.set({ autofill_templates: templates });
    } catch (err) {
      Toast.error('Failed to save templates');
    }
  }

  function renderTemplateList() {
    const list = $('template-card-list');
    if (!list) return;

    if (templates.length === 0) {
      list.innerHTML = '<div style="color:#64748b;text-align:center;padding:16px;">No templates yet. Create one to get started.</div>';
      return;
    }

    list.innerHTML = templates.map((tmpl, idx) => `
      <div class="template-item" style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border:1px solid #334155;border-radius:8px;margin-bottom:8px;background:#0f172a;">
        <div>
          <strong style="color:#e2e8f0">${tmpl.name || 'Untitled'}</strong>
          <span style="color:#64748b;font-size:12px;margin-left:8px;">${(tmpl.fields || []).length} fields</span>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-sm btn-secondary" onclick="window._editTemplate(${idx})">Edit</button>
          <button class="btn btn-sm btn-secondary" onclick="window._duplicateTemplate(${idx})">Duplicate</button>
          <button class="btn btn-sm btn-danger" onclick="window._deleteTemplate(${idx})">Delete</button>
        </div>
      </div>`
    ).join('');
  }

  // Expose template actions to inline onclick handlers
  window._editTemplate = (idx) => {
    const tmpl = templates[idx];
    if (!tmpl) return;
    openTemplateEditor(tmpl, idx);
  };

  window._duplicateTemplate = (idx) => {
    const tmpl = templates[idx];
    if (!tmpl) return;
    const copy = JSON.parse(JSON.stringify(tmpl));
    copy.name = (copy.name || 'Template') + ' (Copy)';
    templates.push(copy);
    saveTemplates();
    renderTemplateList();
    Toast.success('Template duplicated');
  };

  window._deleteTemplate = (idx) => {
    if (!confirm('Delete this template?')) return;
    templates.splice(idx, 1);
    saveTemplates();
    renderTemplateList();
    Toast.success('Template deleted');
  };

  function openTemplateEditor(tmpl, idx) {
    const editor = $('subsection-template-editor');
    if (!editor) return;

    editor.style.display = 'block';
    editor.dataset.index = idx !== undefined ? idx : 'new';

    const nameInput = editor.querySelector('#template-name');
    if (nameInput) nameInput.value = tmpl.name || '';

    const fieldsContainer = editor.querySelector('#field-mapping-list');
    if (fieldsContainer) {
      fieldsContainer.innerHTML = '';
      (tmpl.fields || []).forEach(field => addFieldMappingRow(fieldsContainer, field));
    }
  }

  function addFieldMappingRow(container, field = {}) {
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'field-mapping-row';
    row.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;align-items:center;';
    row.innerHTML = `
      <input type="text" placeholder="Field selector" value="${field.selector || ''}" class="field-selector" style="flex:1;">
      <input type="text" placeholder="Value / source" value="${field.value || ''}" class="field-value" style="flex:1;">
      <button class="btn btn-sm btn-danger field-remove" title="Remove row">X</button>`;

    row.querySelector('.field-remove').addEventListener('click', () => {
      row.remove();
    });

    container.appendChild(row);
  }

  function saveCurrentTemplate() {
    const editor = $('subsection-template-editor');
    if (!editor) return;

    const idx = editor.dataset.index;
    const name = (editor.querySelector('#template-name')?.value || '').trim();
    const rows = editor.querySelectorAll('.field-mapping-row');

    const fields = [];
    rows.forEach(row => {
      const sel = row.querySelector('.field-selector')?.value.trim();
      const val = row.querySelector('.field-value')?.value.trim();
      if (sel) fields.push({ selector: sel, value: val });
    });

    const tmpl = { name: name || 'Untitled', fields };

    if (idx === 'new' || idx === undefined) {
      templates.push(tmpl);
    } else {
      templates[parseInt(idx, 10)] = tmpl;
    }

    saveTemplates();
    renderTemplateList();
    editor.style.display = 'none';
    Toast.success('Template saved');
  }

  function initTemplateEditor() {
    const addRowBtn = $('btn-add-field-mapping');
    if (addRowBtn) {
      addRowBtn.addEventListener('click', () => {
        const container = document.querySelector('#field-mapping-list');
        addFieldMappingRow(container);
      });
    }

    const saveTemplateBtn = $('btn-save-template');
    if (saveTemplateBtn) {
      saveTemplateBtn.addEventListener('click', saveCurrentTemplate);
    }

    const newTemplateBtn = $('btn-new-template');
    if (newTemplateBtn) {
      newTemplateBtn.addEventListener('click', () => {
        openTemplateEditor({ name: '', fields: [] });
      });
    }

    // CSV upload
    const csvInput = $('csv-file-input');
    if (csvInput) {
      csvInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
          try {
            const lines = evt.target.result.split('\n').filter(Boolean);
            const headers = lines[0].split(',').map(h => h.trim());
            const preview = $('csv-preview-area');
            if (preview) {
              preview.innerHTML = `<strong>Columns found:</strong> ${headers.join(', ')}<br><em>${lines.length - 1} data rows</em>`;
              preview.style.display = 'block';
            }
            // Auto-create field mapping rows from CSV headers
            const container = document.querySelector('#field-mapping-list');
            if (container) {
              headers.forEach(h => addFieldMappingRow(container, { selector: '', value: `{{${h}}}` }));
            }
            Toast.info(`CSV loaded: ${headers.length} columns, ${lines.length - 1} rows`);
          } catch (err) {
            Toast.error('Failed to parse CSV');
          }
        };
        reader.readAsText(file);
        e.target.value = '';
      });
    }
  }

  // =========================================================================
  // 11. INTEGRATIONS — Sheets, Salesforce, Webhooks
  // =========================================================================

  function initIntegrations() {
    // Sheets method toggle
    const apiRadio = $('gs-method-api');
    const webhookRadio = $('gs-method-webhook');

    [apiRadio, webhookRadio].forEach(r => {
      if (r) r.addEventListener('change', updateSheetsMethodVisibility);
    });

    // Webhook secret reveal toggle
    const revealSecretBtn = $('btn-reveal-gs-secret');
    const secretInput = $('gs-webhook-secret');
    if (revealSecretBtn && secretInput) {
      revealSecretBtn.addEventListener('click', () => {
        const isPassword = secretInput.type === 'password';
        secretInput.type = isPassword ? 'text' : 'password';
        revealSecretBtn.textContent = isPassword ? 'Hide' : 'Show';
      });
    }

    // Salesforce test connection
    const sfTestBtn = $('btn-test-sf');
    if (sfTestBtn) {
      sfTestBtn.addEventListener('click', async () => {
        sfTestBtn.disabled = true;
        sfTestBtn.textContent = 'Testing...';
        try {
          const resp = await sendMsg('TEST_SALESFORCE', {
            instance_url: getVal('sf-instance-url'),
            access_token: getVal('sf-access-token')
          });
          if (resp && resp.success) {
            Toast.success('Salesforce connection verified');
          } else {
            Toast.error(`Salesforce: ${resp?.error || 'Connection failed'}`);
          }
        } catch (err) {
          Toast.error(`Salesforce test failed: ${err.message}`);
        } finally {
          sfTestBtn.disabled = false;
          sfTestBtn.textContent = 'Test Connection';
        }
      });
    }

    // Webhook endpoint management
    const addWebhookBtn = $('btn-add-webhook-endpoint');
    if (addWebhookBtn) {
      addWebhookBtn.addEventListener('click', () => {
        const list = $('webhook-endpoints-list');
        if (!list) return;
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;';
        row.innerHTML = `
          <input type="url" placeholder="https://hooks.example.com/..." class="webhook-url" style="flex:1;">
          <button class="btn btn-sm btn-danger webhook-remove">Remove</button>`;
        row.querySelector('.webhook-remove').addEventListener('click', () => row.remove());
        list.appendChild(row);
      });
    }

    // Backend test button
    const testBackendBtn = $('test-backend-btn');
    const backendStatus = $('backend-test-status');
    if (testBackendBtn) {
      testBackendBtn.addEventListener('click', async () => {
        const url = $('backend-webhook-url')?.value?.trim();
        if (!url) {
          if (backendStatus) backendStatus.innerHTML = '<span style="color:#f59e0b;">Enter a webhook URL first</span>';
          return;
        }
        testBackendBtn.disabled = true;
        testBackendBtn.textContent = 'Testing...';
        if (backendStatus) backendStatus.innerHTML = '<span style="color:#38bdf8;">Connecting...</span>';
        try {
          const cleanUrl = url.split('?')[0];
          const secret = ($('backend-webhook-secret') || {}).value || '';
          const resp = await fetch(cleanUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'test_connection', secret })
          });
          const text = await resp.text();
          let data;
          try { data = JSON.parse(text); } catch (_) {
            throw new Error('Non-JSON response — redeploy the Web App and use the /exec URL (no ?t= token)');
          }
          if (data.success) {
            if (backendStatus) backendStatus.innerHTML = '<span style="color:#22c55e;">&#10004; Connected (v' + (data.version || '?') + ')</span>';
          } else {
            if (backendStatus) backendStatus.innerHTML = '<span style="color:#ef4444;">&#10060; ' + (data.error || 'Failed') + '</span>';
          }
        } catch (e) {
          if (backendStatus) backendStatus.innerHTML = '<span style="color:#ef4444;">&#10060; ' + e.message + '</span>';
        }
        testBackendBtn.disabled = false;
        testBackendBtn.textContent = 'Test Connection';
      });
    }

    // Reveal backend secret
    const revealBackendBtn = $('reveal-backend-secret');
    if (revealBackendBtn) {
      revealBackendBtn.addEventListener('click', () => {
        const input = $('backend-webhook-secret');
        if (input) {
          input.type = input.type === 'password' ? 'text' : 'password';
          revealBackendBtn.textContent = input.type === 'password' ? 'Show' : 'Hide';
        }
      });
    }

    // Save integrations (wired via initSaveButtons if a save button exists)
  }

  function updateSheetsMethodVisibility() {
    const method = getRadioVal('gs-method') ||
      (document.querySelector('.method-btn.active')?.dataset.method) || 'api';

    // Show/hide webhook vs API fields
    const webhookGroup = $('gs-webhook-url-group');
    const oauthFields = $('gs-oauth-token')?.closest('.form-group');
    const apiKeyFields = $('gs-api-key')?.closest('.form-group');

    const secretGroup = $('gs-webhook-secret-group');
    if (webhookGroup) webhookGroup.style.display = (method === 'webhook') ? 'block' : 'none';
    if (secretGroup) secretGroup.style.display = (method === 'webhook') ? 'block' : 'none';
    if (oauthFields) oauthFields.style.display = (method === 'api') ? 'block' : 'none';
    if (apiKeyFields) apiKeyFields.style.display = (method === 'api') ? 'block' : 'none';
  }

  // =========================================================================
  // 12. ADVANCED OPTIONS — Logging, Performance, Health, Data Management
  // =========================================================================

  function initAdvancedOptions() {
    // Health dashboard refresh
    const healthBtn = $('btn-refresh-worker');
    if (healthBtn) {
      healthBtn.addEventListener('click', runHealthCheck);
    }

    // Data management
    initDataManagement();
  }

  async function runHealthCheck() {
    const indicators = ['health-val-background', 'health-val-content-script', 'health-val-storage', 'health-val-api'];
    indicators.forEach(id => {
      const el = $(id);
      if (el) el.innerHTML = '<span style="color:#f59e0b">Checking...</span>';
    });

    try {
      const resp = await sendMsg('HEALTH_CHECK');
      if (resp) {
        setHealthIndicator('health-val-background', resp.worker);
        setHealthIndicator('health-val-content-script', resp.scripts);
        setHealthIndicator('health-val-storage', resp.storage);
        setHealthIndicator('health-val-api', resp.api);
      }
      Toast.info('Health check complete');
    } catch (err) {
      Toast.error('Health check failed');
      indicators.forEach(id => {
        const el = $(id);
        if (el) el.innerHTML = '<span style="color:#ef4444">Error</span>';
      });
    }
  }

  function setHealthIndicator(id, status) {
    const el = $(id);
    if (!el) return;
    const ok = status === true || status === 'ok' || status === 'connected';
    const color = ok ? '#22c55e' : (status === 'warning' ? '#f59e0b' : '#ef4444');
    const icon = ok ? '\u2705' : (status === 'warning' ? '\u26a0\ufe0f' : '\u274c');
    const label = ok ? 'OK' : (typeof status === 'string' ? status : 'Unavailable');
    el.innerHTML = `<span style="color:${color}">${icon} ${label}</span>`;
  }

  function initDataManagement() {
    // Export config
    const exportBtn = $('btn-export-backup');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const cfg = JSON.parse(JSON.stringify(currentConfig));
        // Redact API keys for safety
        if (cfg.api_keys) {
          Object.keys(cfg.api_keys).forEach(k => {
            const v = cfg.api_keys[k];
            if (v && v.length > 8) {
              cfg.api_keys[k] = v.substring(0, 4) + '...' + v.substring(v.length - 4);
            }
          });
        }
        const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `danman-config-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        Toast.success('Config exported (API keys redacted)');
      });
    }

    // Import config
    const importBtn = $('btn-import-backup');
    const importFile = $('backup-file-input');
    if (importBtn) {
      importBtn.addEventListener('click', () => {
        if (importFile) importFile.click();
        else {
          // Create a temporary file input
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.json';
          input.addEventListener('change', handleConfigImport);
          input.click();
        }
      });
    }
    if (importFile) {
      importFile.addEventListener('change', handleConfigImport);
    }

    async function handleConfigImport(e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const imported = JSON.parse(evt.target.result);
          await applyAndPersistImportedConfig(imported);
          Toast.success('Backup config imported and saved');
        } catch (err) {
          Toast.error('Import failed: ' + (err.message || 'Invalid config file'));
        }
      };
      reader.readAsText(file);
      if (e.target) e.target.value = '';
    }

    // Reset to defaults
    const resetBtn = $('btn-reset-defaults');
    if (resetBtn) {
      resetBtn.addEventListener('click', async () => {
        if (!confirm('Reset all settings to defaults? This cannot be undone.')) return;
        try {
          const resp = await sendMsg('CONFIG_RESET');
          if (resp) {
            currentConfig = resp;
            applyConfigToForm(resp);
          }
          Toast.success('Settings reset to defaults');
        } catch (err) {
          Toast.error('Reset failed');
        }
      });
    }

    // Export data
    const exportDataBtn = $('btn-export-data');
    if (exportDataBtn) {
      exportDataBtn.addEventListener('click', async () => {
        try {
          const resp = await sendMsg('LOGS_EXPORT');
          const logs = (resp && resp.logs) || [];
          const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `danman-logs-${Date.now()}.json`;
          a.click();
          URL.revokeObjectURL(url);
          Toast.success('Data exported');
        } catch (err) {
          Toast.error('Failed to export data');
        }
      });
    }

    // Clear data
    const clearDataBtn = $('btn-clear-data');
    if (clearDataBtn) {
      clearDataBtn.addEventListener('click', async () => {
        if (!confirm('Clear all stored data? This cannot be undone.')) return;
        try {
          await sendMsg('LOGS_CLEAR');
          Toast.success('Data cleared');
        } catch (err) {
          Toast.error('Failed to clear data');
        }
      });
    }
  }

  // =========================================================================
  // 13. COLLAPSIBLE SUBSECTIONS
  // =========================================================================

  function initCollapsibles() {
    $$('.subsection-header[data-toggle]').forEach(header => {
      header.style.cursor = 'pointer';
      header.addEventListener('click', () => {
        const targetId = header.dataset.toggle;
        const content = targetId ? $(targetId) : null;
        if (!content) return;

        const isOpen = content.classList.contains('open');
        content.classList.toggle('open', !isOpen);
        content.style.display = isOpen ? 'none' : 'block';

        // Toggle chevron indicator
        const chevron = header.querySelector('.chevron');
        if (chevron) chevron.textContent = isOpen ? '\u25b6' : '\u25bc';
      });
    });
  }

  // =========================================================================
  // 14. BACK BUTTON
  // =========================================================================

  function initBackButton() {
    const backBtn = $('btn-back');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        if (window.history.length > 1) {
          window.history.back();
        } else {
          window.close();
        }
      });
    }
  }

  // =========================================================================
  // 15. FAB (Floating Action Button)
  // =========================================================================

  function initFAB() {
    const fab = $('fab-configure-test');
    if (!fab) return;

    fab.addEventListener('click', () => {
      // Scroll to the first test button or open quick-config
      const firstTest = $('btn-test-claude');
      if (firstTest) {
        firstTest.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Flash highlight
        firstTest.style.boxShadow = '0 0 0 3px #38bdf8';
        setTimeout(() => { firstTest.style.boxShadow = ''; }, 1500);
      }
    });
  }

  // =========================================================================
  // SECTION SAVE BUTTON WIRING
  // =========================================================================

  function initSaveButtons() {
    const sections = ['ai-config', 'rag-scraping', 'autofill-templates', 'integrations', 'advanced'];
    sections.forEach(section => {
      const btn = $(`save-${section}`);
      if (btn) {
        btn.addEventListener('click', () => saveSection(section));
      }
    });

    // Legacy top/bottom save buttons (if present from old HTML)
    const saveTopBtn = $('btn-save-top');
    const saveBotBtn = $('btn-save-bottom');
    if (saveTopBtn) saveTopBtn.addEventListener('click', saveAllSections);
    if (saveBotBtn) saveBotBtn.addEventListener('click', saveAllSections);
  }

  async function saveAllSections() {
    try {
      const merged = gatherSectionConfig('ai-config');
      const ragMerged = gatherSectionConfig('rag-scraping');
      const intMerged = gatherSectionConfig('integrations');
      const advMerged = gatherSectionConfig('advanced');

      // Deep merge all section results
      const full = { ...merged, ...ragMerged, ...intMerged, ...advMerged };
      const saved = await sendMsg('CONFIG_SAVE', full);
      currentConfig = (saved && typeof saved === 'object') ? saved : full;
      Toast.success('All settings saved');
    } catch (err) {
      Toast.error(`Save failed: ${err.message || 'Unknown error'}`);
    }
  }

  // =========================================================================
  // LEGACY COMPATIBILITY — support old HTML element IDs too
  // =========================================================================

  function initLegacyCompat() {
    // Legacy class-based toggle-vis buttons (if any exist in HTML)
    $$('.toggle-vis').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = $(btn.dataset.target);
        if (!input) return;
        input.type = input.type === 'password' ? 'text' : 'password';
      });
    });

    // Legacy class-based test-btn buttons keyed by data-provider
    $$('.test-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const provider = btn.dataset.provider;
        if (!provider) return;
        const keyInput = $(`api-key-${provider}`);
        const apiKey = keyInput ? keyInput.value.trim() : '';
        const modelSelect = $(`model-select-${provider}`);
        const model = modelSelect ? modelSelect.value : null;
        btn.disabled = true;
        btn.textContent = '...';
        try {
          let resp;
          if (typeof OptionsApiTest !== 'undefined') {
            resp = await OptionsApiTest.testConnection({ provider, apiKey, model });
          } else {
            await wakeBackgroundWorker();
            resp = await sendMsg('EJECT_TEST_API', { provider, apiKey, model });
          }
          if (resp && resp.success) {
            Toast.success(`${provider} connection OK`);
          } else {
            Toast.error(`${provider}: ${resp?.error || 'Failed'}`);
          }
        } catch (err) {
          Toast.error(`${provider}: ${err.message || 'Test failed'}`);
        }
        btn.disabled = false;
        btn.textContent = 'Test';
      });
    });

    // Legacy class-based method-btn toggle for sheets
    $$('.method-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.method-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        updateSheetsMethodVisibility();
      });
    });

    // Legacy class-based engine-btn toggle
    $$('.engine-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.engine-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  }

  /** Apply config using legacy field IDs (no-op if elements don't exist) */
  function applyLegacyConfig(c) {
    // Legacy compat is a no-op for current HTML layout.
    // All config application is handled by applyConfigToForm().
  }

  /** Gather config from legacy field IDs (returns empty if elements don't exist) */
  function gatherLegacyConfig() {
    return {};
  }

  // =========================================================================
  // UNIFIED CONFIG LOAD — supports both old and new HTML layouts
  // =========================================================================

  async function initConfig() {
    try {
      const resp = await sendMsg('CONFIG_LOAD');
      if (resp && typeof resp === 'object') {
        currentConfig = resp;

        // Apply to new-style IDs
        applyConfigToForm(currentConfig);

        // Also apply to legacy IDs for backward compatibility
        applyLegacyConfig(currentConfig);

        console.log('[DANMAN] Config loaded and applied');
      }
    } catch (err) {
      console.warn('[Options] Config load failed:', err);
      Toast.warning('Could not load settings');
    }
  }

  /** Unified save: gathers from whichever IDs exist */
  async function unifiedSave() {
    const saveBtns = $$('[id^="btn-save"], [id^="save-"]');
    saveBtns.forEach(b => { b.disabled = true; });

    try {
      // Try new-style first, fallback to legacy
      const hasNewIds = !!$('api-key-claude');
      let cfg;

      if (hasNewIds) {
        cfg = gatherSectionConfig('ai-config');
        const rag = gatherSectionConfig('rag-scraping');
        const int = gatherSectionConfig('integrations');
        const adv = gatherSectionConfig('advanced');
        cfg = { ...cfg, ...rag, ...int, ...adv };
      } else {
        cfg = { ...currentConfig, ...gatherLegacyConfig() };
      }

      const saved = await sendMsg('CONFIG_SAVE', cfg);
      currentConfig = (saved && typeof saved === 'object') ? saved : cfg;
      Toast.success('Settings saved');
    } catch (err) {
      Toast.error(`Save failed: ${err.message || 'Unknown error'}`);
    } finally {
      saveBtns.forEach(b => { b.disabled = false; });
    }
  }

  // =========================================================================
  // INITIALIZATION — wire everything up on DOMContentLoaded
  // =========================================================================

  // =========================================================================
  // CONFIG MANAGER — Import, Export, Template, Logs
  // =========================================================================

  function getConfigTemplate() {
    return {
      "_README": "GetPower DANMAN Configuration Template — Fill in your values and import via Settings > Import / Export",
      "_version": "6.9.0",
      "ai_provider": "claude",
      "api_keys": {
        "claude": "sk-ant-api03-YOUR_KEY_HERE",
        "openai": "sk-YOUR_KEY_HERE",
        "gemini": "AIza-YOUR_KEY_HERE",
        "firecrawl": "fc-YOUR_KEY_HERE"
      },
      "ai_models": {
        "claude": "claude-sonnet-4-6",
        "openai": "gpt-4o",
        "gemini": "gemini-2.5-flash"
      },
      "tokens_rag": 4096,
      "tokens_form": 2048,
      "token_overrides": {
        "claude": null,
        "openai": null,
        "gemini": null
      },
      "scraping": {
        "max_depth": 3,
        "delay_ms": 500,
        "timeout_ms": 30000,
        "respect_robots": true,
        "firecrawl_cache": true,
        "include_tables": true,
        "include_images": false,
        "include_links": true,
        "include_headings": true,
        "include_pdfs": false,
        "include_videos": false,
        "tree_batch_size": 25
      },
      "exclude_patterns": [],
      "skip_keywords": [],
      "concurrent_requests": 3,
      "sheets": {
        "method": "webhook",
        "spreadsheet_id": "YOUR_SPREADSHEET_ID_HERE",
        "webhook_url": "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec",
        "webhook_secret": "YOUR_SHARED_SECRET_HERE",
        "api_key": "",
        "oauth_token": ""
      },
      "backend": {
        "webhook_url": "https://script.google.com/macros/s/YOUR_BACKEND_ID/exec",
        "webhook_secret": "YOUR_BACKEND_SECRET_HERE",
        "master_folder_id": "YOUR_DRIVE_FOLDER_ID_HERE"
      },
      "drive_folder_id": "YOUR_DRIVE_FOLDER_ID_HERE",
      "salesforce": {
        "instance_url": "https://yourorg.my.salesforce.com",
        "access_token": "",
        "default_object": "Case"
      },
      "gcp": {
        "project_id": "",
        "vision_enabled": false
      },
      "log_level": "production",
      "cache_rag_ttl": 300,
      "cache_api_ttl": 60,
      "queue_strategy": "fifo",
      "cost_tracking": true,
      "auto_retry": true,
      "hotkey": {
        "form_fill": "Ctrl+Shift+Meta+V"
      }
    };
  }

  // =========================================================================
  // MEMORY SYSTEM — Ported from sidebar memory-tab.js to settings page
  // =========================================================================

  function initMemorySection() {
    function sendBg(type, payload) {
      return sendMsg(type, payload || {});
    }

    // --- Check memory configured status ---
    function checkMemoryStatus() {
      wakeBackgroundWorker().then(function() {
        return sendBg('MEMORY_IS_CONFIGURED');
      }).then(function(resp) {
        var dot = $('memory-status-dot');
        var text = $('memory-status-text');
        var grid = $('memory-stats-grid');
        if (resp && resp.configured) {
          dot.style.background = '#22c55e';
          text.textContent = 'Memory system active';
          text.style.color = '#22c55e';
          if (grid) grid.style.display = 'grid';
          loadMemoryStats();
          loadMemoryProjects();
        } else {
          dot.style.background = '#ef4444';
          text.textContent = 'Not initialized — configure below';
          text.style.color = '#ef4444';
          if (grid) grid.style.display = 'none';
        }
      }).catch(function() {
        var text = $('memory-status-text');
        if (text) { text.textContent = 'Could not reach background service'; text.style.color = '#f59e0b'; }
      });
    }

    function loadMemoryStats() {
      sendBg('MEMORY_GET_STATS').then(function(resp) {
        if (resp) {
          var total = $('mem-stat-total');
          var projects = $('mem-stat-projects');
          var active = $('mem-stat-active');
          if (total) total.textContent = resp.totalMemories || 0;
          if (projects) projects.textContent = resp.projectCount || 0;
          if (active) active.textContent = resp.activeProject || '—';
        }
      }).catch(function() {});
    }

    function loadMemoryProjects() {
      sendBg('MEMORY_LIST_PROJECTS').then(function(resp) {
        var list = $('memory-projects-list');
        if (!list) return;
        if (!resp || !resp.projects || resp.projects.length === 0) {
          list.innerHTML = '<div style="color:#64748b;font-size:12px;text-align:center;padding:12px;">No projects yet. Create one above.</div>';
          return;
        }
        var html = '';
        resp.projects.forEach(function(p) {
          var isActive = p.name === resp.activeProject;
          html += '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:' + (isActive ? 'rgba(56,189,248,0.1)' : '#1e293b') + ';border:1px solid ' + (isActive ? '#38bdf8' : '#334155') + ';border-radius:6px;margin-bottom:6px;">';
          html += '<span style="flex:1;color:' + (isActive ? '#38bdf8' : '#e2e8f0') + ';font-size:13px;font-weight:' + (isActive ? '600' : '400') + ';">' + (p.name || 'Unnamed') + '</span>';
          if (!isActive) {
            html += '<button class="btn btn-sm btn-secondary mem-set-active-btn" data-project="' + (p.name || '') + '" style="font-size:10px;padding:2px 8px;">Set Active</button>';
          } else {
            html += '<span style="font-size:10px;color:#38bdf8;font-weight:600;">ACTIVE</span>';
          }
          html += '<button class="btn btn-sm mem-delete-project-btn" data-project="' + (p.name || '') + '" style="font-size:10px;padding:2px 6px;background:#991b1b;color:#fca5a5;border:none;border-radius:3px;cursor:pointer;">Del</button>';
          html += '</div>';
        });
        list.innerHTML = html;

        // Attach event listeners
        list.querySelectorAll('.mem-set-active-btn').forEach(function(btn) {
          btn.addEventListener('click', function() {
            var name = btn.dataset.project;
            sendBg('MEMORY_SET_ACTIVE', { project: name }).then(function() {
              loadMemoryProjects();
              loadMemoryStats();
            });
          });
        });
        list.querySelectorAll('.mem-delete-project-btn').forEach(function(btn) {
          btn.addEventListener('click', function() {
            var name = btn.dataset.project;
            if (confirm('Delete project "' + name + '"? This cannot be undone.')) {
              sendBg('MEMORY_DELETE_PROJECT', { project: name }).then(function() {
                loadMemoryProjects();
                loadMemoryStats();
              });
            }
          });
        });
      }).catch(function() {
        var list = $('memory-projects-list');
        if (list) list.innerHTML = '<div style="color:#ef4444;font-size:12px;text-align:center;padding:12px;">Failed to load projects</div>';
      });
    }

    // --- Load existing config into form fields ---
    function loadMemoryConfig() {
      sendBg('CONFIG_LOAD').then(function(config) {
        if (!config) return;
        var mem = config.memory || {};
        if ($('mem-drive-folder-id') && mem.drive_folder_id) $('mem-drive-folder-id').value = mem.drive_folder_id;
        if ($('mem-spreadsheet-id') && mem.spreadsheet_id) $('mem-spreadsheet-id').value = mem.spreadsheet_id;
        if ($('mem-system-prompt') && mem.system_prompt) $('mem-system-prompt').value = mem.system_prompt;
        if ($('mem-persona-name') && mem.persona_name) $('mem-persona-name').value = mem.persona_name;
        if ($('mem-persona-tone') && mem.persona_tone) $('mem-persona-tone').value = mem.persona_tone;
      }).catch(function() {});
    }

    // --- Initialize Memory button ---
    var initBtn = $('btn-memory-init');
    if (initBtn) {
        initBtn.addEventListener('click', async function() {
        var folderId = ($('mem-drive-folder-id') || {}).value || '';
        var sheetId = ($('mem-spreadsheet-id') || {}).value || '';
        var statusEl = $('memory-init-status');
        if (!folderId) {
          if (statusEl) { statusEl.textContent = 'Please enter a Google Drive Folder ID'; statusEl.style.color = '#ef4444'; }
          return;
        }
        initBtn.disabled = true;
        initBtn.textContent = 'Initializing...';
        if (statusEl) { statusEl.textContent = 'Setting up memory storage...'; statusEl.style.color = '#f59e0b'; }

        await wakeBackgroundWorker();
        sendBg('MEMORY_INIT', { drive_folder_id: folderId, spreadsheet_id: sheetId }).then(function(resp) {
          initBtn.disabled = false;
          initBtn.textContent = 'Initialize Memory Storage';
          if (resp && resp.success) {
            if (statusEl) { statusEl.textContent = 'Memory initialized successfully!'; statusEl.style.color = '#22c55e'; }
            checkMemoryStatus();
          } else {
            if (statusEl) { statusEl.textContent = 'Init failed: ' + ((resp && resp.error) || 'Unknown error'); statusEl.style.color = '#ef4444'; }
          }
        }).catch(function(err) {
          initBtn.disabled = false;
          initBtn.textContent = 'Initialize Memory Storage';
          if (statusEl) { statusEl.textContent = 'Error: ' + (err.message || err); statusEl.style.color = '#ef4444'; }
        });
      });
    }

    // --- Save Memory Config button ---
    var saveMemBtn = $('save-memory-config');
    if (saveMemBtn) {
      saveMemBtn.addEventListener('click', function() {
        var memFolderId = ($('mem-drive-folder-id') || {}).value || '';
        var payload = {
          memory: {
            drive_folder_id: memFolderId,
            // MemoryManager reads memory.folder_id + memory.enabled
            folder_id: memFolderId,
            spreadsheet_id: ($('mem-spreadsheet-id') || {}).value || '',
            system_prompt: ($('mem-system-prompt') || {}).value || '',
            persona_name: ($('mem-persona-name') || {}).value || '',
            persona_tone: ($('mem-persona-tone') || {}).value || 'professional'
          }
        };
        if (memFolderId) payload.memory.enabled = true;
        sendBg('CONFIG_SAVE', payload).then(function() {
          var status = $('save-status-memory');
          if (status) { status.textContent = 'Saved!'; status.style.color = '#22c55e'; }
          setTimeout(function() { if (status) status.textContent = ''; }, 2000);
        }).catch(function(err) {
          var status = $('save-status-memory');
          if (status) { status.textContent = 'Save failed: ' + (err.message || err); status.style.color = '#ef4444'; }
        });
      });
    }

    // --- Save Fine-Tuning ---
    var ftBtn = $('btn-save-finetuning');
    if (ftBtn) {
      ftBtn.addEventListener('click', function() {
        var personaName = ($('mem-persona-name') || {}).value || '';
        // Map onto the Drive memory-config finetuning schema
        sendBg('MEMORY_SAVE_CONFIG', {
          finetuning: {
            systemPrompt: ($('mem-system-prompt') || {}).value || '',
            personalityNotes: personaName ? 'Persona name: ' + personaName : '',
            responseStyle: ($('mem-persona-tone') || {}).value || 'professional'
          }
        }).then(function(resp) {
          if (resp && resp.success) {
            ftBtn.textContent = 'Saved!';
            setTimeout(function() { ftBtn.textContent = 'Save Fine-Tuning'; }, 1500);
          }
        }).catch(function() {});
      });
    }

    // --- Create Project ---
    var createBtn = $('btn-create-project');
    if (createBtn) {
      createBtn.addEventListener('click', function() {
        var nameEl = $('mem-new-project');
        var name = (nameEl ? nameEl.value : '').trim();
        if (!name) return;
        sendBg('MEMORY_CREATE_PROJECT', { name: name }).then(function(resp) {
          if (resp && resp.success) {
            if (nameEl) nameEl.value = '';
            loadMemoryProjects();
            loadMemoryStats();
          }
        }).catch(function() {});
      });
    }

    // --- Memory Actions ---
    var exportBtn = $('btn-memory-export');
    if (exportBtn) {
      exportBtn.addEventListener('click', function() {
        sendBg('MEMORY_GET_STATS').then(function(resp) {
          var blob = new Blob([JSON.stringify(resp, null, 2)], { type: 'application/json' });
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = 'danman_memory_export_' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
          a.click();
          URL.revokeObjectURL(url);
        });
      });
    }

    var refreshBtn = $('btn-memory-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function() {
        checkMemoryStatus();
      });
    }

    var clearBtn = $('btn-memory-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', function() {
        if (confirm('Are you sure you want to clear ALL memory data? This cannot be undone.')) {
          sendBg('MEMORY_CLEAR_ALL').then(function(resp) {
            if (resp && resp.success) {
              checkMemoryStatus();
              alert('Memory cleared.');
            }
          }).catch(function() {});
        }
      });
    }

    // --- Run on load ---
    checkMemoryStatus();
    loadMemoryConfig();
  }

  function initConfigManager() {
    // ── Import Config ───────────────────────────────────────────────────
    var importBtn = $('btn-import-config-file');
    var fileInput = $('config-import-file-input');
    var previewArea = $('import-preview-area');
    var previewContent = $('import-preview-content');
    var confirmBtn = $('btn-confirm-import');
    var cancelBtn = $('btn-cancel-import');
    var pendingImport = null;

    if (importBtn && fileInput) {
      importBtn.addEventListener('click', function() { fileInput.click(); });

      fileInput.addEventListener('change', function(e) {
        var file = e.target.files[0];
        if (!file) return;
        if (!/\.json$/i.test(file.name)) {
          Toast.error('Config import requires a .json file (use Export Config to create one)');
          fileInput.value = '';
          return;
        }
        var reader = new FileReader();
        reader.onload = function(evt) {
          try {
            var parsed = JSON.parse(evt.target.result);
            pendingImport = parsed;
            var normalized = normalizeImportedConfig(parsed);
            if (previewContent) {
              previewContent.textContent = JSON.stringify(normalized, null, 2);
            }
            if (previewArea) previewArea.style.display = 'block';
            Toast.success('Config file loaded — review preview, then click Apply Config');
          } catch (err) {
            Toast.error('Invalid JSON file: ' + err.message);
          }
        };
        reader.readAsText(file);
        fileInput.value = '';
      });
    }

    if (confirmBtn) {
      confirmBtn.addEventListener('click', async function() {
        if (!pendingImport) return;
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Applying...';
        try {
          await applyAndPersistImportedConfig(pendingImport);
          if (previewArea) previewArea.style.display = 'none';
          pendingImport = null;
          Toast.success('Config imported and saved to the extension');
        } catch (err) {
          Toast.error('Apply failed: ' + (err.message || err));
        } finally {
          confirmBtn.disabled = false;
          confirmBtn.textContent = 'Apply Config';
        }
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', function() {
        pendingImport = null;
        if (previewArea) previewArea.style.display = 'none';
      });
    }

    // ── Export Full Config (with API keys) ───────────────────────────────
    var exportFullBtn = $('btn-export-full-config');
    if (exportFullBtn) {
      exportFullBtn.addEventListener('click', function() {
        if (!confirm('This export includes your API keys in plain text. Only share with trusted parties. Continue?')) return;
        var cfg = JSON.parse(JSON.stringify(currentConfig));
        cfg._exported_at = new Date().toISOString();
        cfg._version = '6.9.0';
        var blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'danman-config-full-' + new Date().toISOString().slice(0, 10) + '.json';
        a.click();
        URL.revokeObjectURL(url);
        Toast.success('Full config exported (includes API keys)');
      });
    }

    // ── Export Safe Config (keys redacted) ───────────────────────────────
    var exportSafeBtn = $('btn-export-safe-config');
    if (exportSafeBtn) {
      exportSafeBtn.addEventListener('click', function() {
        var cfg = JSON.parse(JSON.stringify(currentConfig));
        cfg._exported_at = new Date().toISOString();
        cfg._version = '6.9.0';
        // Redact API keys
        if (cfg.api_keys) {
          Object.keys(cfg.api_keys).forEach(function(k) {
            var v = cfg.api_keys[k];
            if (v && v.length > 8) {
              cfg.api_keys[k] = v.substring(0, 4) + '***REDACTED***' + v.substring(v.length - 4);
            }
          });
        }
        if (cfg.salesforce && cfg.salesforce.access_token) {
          cfg.salesforce.access_token = '***REDACTED***';
        }
        if (cfg.sheets && cfg.sheets.webhook_secret) {
          cfg.sheets.webhook_secret = '***REDACTED***';
        }
        if (cfg.backend && cfg.backend.webhook_secret) {
          cfg.backend.webhook_secret = '***REDACTED***';
        }
        var blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'danman-config-safe-' + new Date().toISOString().slice(0, 10) + '.json';
        a.click();
        URL.revokeObjectURL(url);
        Toast.success('Safe config exported (API keys redacted)');
      });
    }

    // ── Download Blank Template ─────────────────────────────────────────
    var templateBtn = $('btn-download-template');
    if (templateBtn) {
      templateBtn.addEventListener('click', function() {
        var template = getConfigTemplate();
        var blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'danman-config-template.json';
        a.click();
        URL.revokeObjectURL(url);
        Toast.success('Template downloaded — fill in your values and import');
      });
    }

    // ── Export Logs (JSON) ───────────────────────────────────────────────
    var exportLogsJsonBtn = $('btn-export-logs-json');
    if (exportLogsJsonBtn) {
      exportLogsJsonBtn.addEventListener('click', async function() {
        try {
          var resp = await sendMsg('LOGS_EXPORT');
          var logs = (resp && resp.logs) || [];
          // Also grab any stored error reports
          var storage = await chrome.storage.local.get(['gpd_error_log', 'gpd_activity_log']);
          var exportData = {
            exported_at: new Date().toISOString(),
            service_worker_logs: logs,
            error_log: storage.gpd_error_log || [],
            activity_log: storage.gpd_activity_log || []
          };
          var blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = 'danman-logs-' + new Date().toISOString().slice(0, 10) + '.json';
          a.click();
          URL.revokeObjectURL(url);
          Toast.success('Logs exported as JSON');
        } catch (err) {
          Toast.error('Log export failed: ' + err.message);
        }
      });
    }

    // ── Export Logs (CSV) ────────────────────────────────────────────────
    var exportLogsCsvBtn = $('btn-export-logs-csv');
    if (exportLogsCsvBtn) {
      exportLogsCsvBtn.addEventListener('click', async function() {
        try {
          var resp = await sendMsg('LOGS_EXPORT');
          var logs = (resp && resp.logs) || [];
          var storage = await chrome.storage.local.get(['gpd_error_log', 'gpd_activity_log']);
          var allLogs = [].concat(logs, storage.gpd_error_log || [], storage.gpd_activity_log || []);

          var csv = 'Timestamp,Type,Message,Details\n';
          allLogs.forEach(function(entry) {
            var ts = entry.timestamp || entry.ts || '';
            var type = entry.type || entry.level || 'info';
            var msg = (entry.message || entry.msg || '').replace(/"/g, '""');
            var details = (entry.details || entry.data || '');
            if (typeof details === 'object') details = JSON.stringify(details).replace(/"/g, '""');
            csv += '"' + ts + '","' + type + '","' + msg + '","' + details + '"\n';
          });

          var blob = new Blob([csv], { type: 'text/csv' });
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = 'danman-logs-' + new Date().toISOString().slice(0, 10) + '.csv';
          a.click();
          URL.revokeObjectURL(url);
          Toast.success('Logs exported as CSV');
        } catch (err) {
          Toast.error('Log export failed: ' + err.message);
        }
      });
    }
  }

  async function init() {
    await wakeBackgroundWorker();

    // Core systems
    initNavigation();
    initApiKeyManagement();
    initTokenValidation();
    initScrapingSettings();
    initTreeVisualizer();
    initTemplateEditor();
    initIntegrations();
    initAdvancedOptions();
    initCollapsibles();
    initBackButton();
    initFAB();
    initSaveButtons();
    initHotkeyRecorder();
    initMemorySection();
    initConfigManager();
    initQuickConnect();

    // Legacy compatibility for old HTML
    initLegacyCompat();

    // Load config from background worker
    initConfig();

    // Load autofill templates from storage
    loadTemplates();

    console.log('[DANMAN] Options page v7.6.0 initialized');

    // Reload when sidebar or another tab saves config
    try {
      const B = (typeof browser !== 'undefined' && browser.storage) ? browser : chrome;
      B.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.config) initConfig();
      });
    } catch (_) {}
  }

  function initQuickConnect() {
    const reveal = $('btn-reveal-quick-secret');
    if (reveal) {
      reveal.addEventListener('click', () => {
        const input = $('quick-webhook-secret');
        if (!input) return;
        input.type = input.type === 'password' ? 'text' : 'password';
      });
    }

    const saveBtn = $('btn-quick-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const status = $('save-status-quick');
        const webhookUrl = (getVal('quick-webhook-url') || '').trim().split('?')[0];
        const webhookSecret = (getVal('quick-webhook-secret') || '').trim();
        const gasUiUrl = (getVal('quick-gas-ui-url') || '').trim();
        const sheetsId = (getVal('quick-sheets-id') || '').trim();
        const driveId = (getVal('quick-drive-id') || '').trim();
        try {
          const ids = (typeof GPD_GoogleIds !== 'undefined') ? GPD_GoogleIds : null;
          const sheetsId = ids ? ids.extractSpreadsheetId(getVal('quick-sheets-id')) : (getVal('quick-sheets-id') || '').trim();
          const driveId = ids ? ids.extractDriveFolderId(getVal('quick-drive-id')) : (getVal('quick-drive-id') || '').trim();
          const payload = {
            backend: {
              webhook_url: webhookUrl,
              master_folder_id: driveId
            },
            sheets: {
              webhook_url: webhookUrl,
              method: 'webhook',
              spreadsheet_id: sheetsId,
              drive_folder_id: driveId
            },
            gas_ui: { url: gasUiUrl || webhookUrl },
            memory: {
              folder_id: driveId,
              drive_folder_id: driveId,
              enabled: !!driveId
            }
          };
          if (webhookSecret) {
            payload.backend.webhook_secret = webhookSecret;
            payload.sheets.webhook_secret = webhookSecret;
          }
          await sendMsg('CONFIG_SAVE', payload);
          // Keep Integrations fields in sync (single webhook)
          setVal('backend-webhook-url', webhookUrl);
          if (webhookSecret) setVal('backend-webhook-secret', webhookSecret);
          setVal('backend-folder-id', driveId);
          setVal('gs-webhook-url', webhookUrl);
          if (webhookSecret) setVal('gs-webhook-secret', webhookSecret);
          setVal('gs-spreadsheet-id', sheetsId);
          setVal('quick-sheets-id', sheetsId);
          setVal('quick-drive-id', driveId);
          if (status) status.textContent = 'Saved. Press Sync to import IDs and keys.';
        } catch (e) {
          if (status) status.textContent = 'Save failed: ' + (e.message || e);
        }
      });
    }

    const syncBtn = $('btn-quick-sync');
    if (syncBtn) {
      syncBtn.addEventListener('click', async () => {
        const status = $('save-status-quick');
        const summary = $('quick-sync-summary');
        const webhookUrl = (getVal('quick-webhook-url') || '').trim().split('?')[0];
        const webhookSecret = (getVal('quick-webhook-secret') || '').trim();
        if (!webhookUrl) {
          if (status) status.textContent = 'Enter Webhook_URL first.';
          return;
        }
        syncBtn.disabled = true;
        if (status) status.textContent = 'Syncing from webhook…';
        try {
          const result = await sendMsg('CONFIG_SYNC_FROM_WEBHOOK', {
            webhook_url: webhookUrl,
            webhook_secret: webhookSecret
          });
          if (result && result.success) {
            if (status) status.textContent = '✓ Sync complete';
            const s = result.summary || {};
            setVal('quick-sheets-id', s.spreadsheet_id || '');
            setVal('quick-drive-id', s.drive_folder_id || '');
            setVal('quick-gas-ui-url', s.gas_ui_url || getVal('quick-gas-ui-url'));
            setVal('gs-spreadsheet-id', s.spreadsheet_id || '');
            setVal('backend-folder-id', s.drive_folder_id || '');
            setVal('backend-webhook-url', webhookUrl);
            setVal('backend-webhook-secret', webhookSecret);
            setVal('gs-webhook-url', webhookUrl);
            setVal('gs-webhook-secret', webhookSecret);
            const keys = s.api_keys || {};
            const present = Object.keys(keys).filter((k) => keys[k]);
            if (summary) {
              summary.textContent = 'API keys present: ' + (present.length ? present.join(', ') : 'none') +
                (s.gas_ui_url ? ' · GAS UI set' : '');
            }
            await loadConfig();
          } else {
            if (status) status.textContent = (result && result.error) || 'Sync failed';
          }
        } catch (e) {
          if (status) status.textContent = 'Sync failed: ' + (e.message || e);
        }
        syncBtn.disabled = false;
      });
    }
  }

  // =========================================================================
  // HOTKEY RECORDER
  // =========================================================================

  function initHotkeyRecorder() {
    const input = $('hotkey-form-fill');
    const recordBtn = $('btn-record-hotkey');
    const resetBtn = $('btn-reset-hotkey');
    if (!input || !recordBtn) return;
    let recording = false;

    recordBtn.addEventListener('click', () => {
      recording = !recording;
      recordBtn.textContent = recording ? 'Press keys...' : 'Record';
      if (recording) input.value = '';
    });

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        input.value = 'Ctrl+Shift+Meta+V';
        recording = false;
        recordBtn.textContent = 'Record';
      });
    }

    input.addEventListener('keydown', (e) => {
      if (!recording) return;
      e.preventDefault();
      const parts = [];
      if (e.ctrlKey) parts.push('Ctrl');
      if (e.shiftKey) parts.push('Shift');
      if (e.altKey) parts.push('Alt');
      if (e.metaKey) parts.push('Meta');
      if (!['Control','Shift','Alt','Meta'].includes(e.key)) {
        parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);
      }
      if (parts.length > 1) {
        input.value = parts.join('+');
        recording = false;
        recordBtn.textContent = 'Record';
      }
    });
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
