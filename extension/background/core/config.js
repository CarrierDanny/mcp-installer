/**
 * VERSION: V002R025
 * DATE: 2026-09-15
 * CHANGE: validateEndpoints() on every config write; scraping.block_private_network setting
 * HISTORY:
 *   V001R275 2026-08-26 Baseline import + Firefox messaging/clipboard fixes (unstamped)
 */
const browserApi = (typeof Browser !== 'undefined') ? Browser : chrome;

// Model catalog lives in core/model-catalog.js (loaded before this file per
// manifest background.scripts). Fail fast if it's missing — every consumer
// below depends on it.
const CLAUDE_MODEL_ALIASES = globalThis.DMS_MODEL_CATALOG.CLAUDE_MODEL_ALIASES;
const resolveModelId = globalThis.DMS_MODEL_CATALOG.resolveModelId;
const AVAILABLE_MODELS = globalThis.DMS_MODEL_CATALOG.AVAILABLE_MODELS;

function deepMerge(base, incoming) {
  if (Array.isArray(base)) {
    return Array.isArray(incoming) ? incoming.slice() : base.slice();
  }
  if (base && typeof base === 'object') {
    const out = { ...base };
    const source = (incoming && typeof incoming === 'object') ? incoming : {};
    Object.keys(source).forEach((key) => {
      const baseVal = base[key];
      const nextVal = source[key];
      if (
        baseVal && typeof baseVal === 'object' && !Array.isArray(baseVal) &&
        nextVal && typeof nextVal === 'object' && !Array.isArray(nextVal)
      ) {
        out[key] = deepMerge(baseVal, nextVal);
      } else {
        out[key] = nextVal;
      }
    });
    return out;
  }
  return incoming !== undefined ? incoming : base;
}

const DEFAULT_CONFIG = {
  ai_provider: 'claude',
  api_keys: {
    claude: '',
    gemini: '',
    openai: '',
    firecrawl: '',
    elevenlabs: ''
  },
  elevenlabs: {
    voice_id: '',
    agent_id: '',
    model_id: 'eleven_multilingual_v2'
  },
  danman_chat: {
    streaming: false,
    page_watch: false,
    tts: false,
    tts_provider: 'browser', // browser | elevenlabs
    stt: false,
    persona: 'auto'
  },
  ai_models: {
    claude: 'claude-sonnet-5',
    gemini: 'gemini-3.5-flash',
    openai: 'gpt-5.6-terra'
  },
  salesforce: {
    instance_url: '',
    client_id: '',
    client_secret: '',
    username: '',
    password: ''
  },
  sheets: {
    spreadsheet_id: '',
    api_key: '',
    drive_folder_id: '',
    webhook_url: '',
    webhook_secret: '',
    method: 'api'
  },
  backend: {
    webhook_url: '',
    webhook_secret: '',
    master_folder_id: ''
  },
  gas_ui: {
    // Apps Script HTML console (doGet web app). Synced via get_config or pasted manually.
    url: ''
  },
  drive: {
    method: ''  // '' = auto (prefer Drive Bridge if connected); or api|webhook|bridge
  },
  scraping: {
    max_depth: 3,
    max_pages: 150,
    delay_ms: 1000,
    timeout_ms: 30000,
    include_images: true,
    include_tables: true,
    include_links: true,
    respect_robots: true,
    scraper_provider: 'firecrawl',
    firecrawl_only_main: true,
    firecrawl_cache: false,
    user_agent: 'DANMAN/2.0',
    // Crawl/rip fetches always refuse loopback, link-local and cloud-metadata
    // hosts; turn this on to also refuse RFC1918 / intranet hosts.
    block_private_network: false,
    tree_batch_size: 25
  },
  memory: {
    enabled: false,
    folder_id: '',
    max_context_tokens: 4000,
    active_projects: [],
    auto_include: false
  },
  setup: {
    completed: false,
    spreadsheet_id: '',
    drive_root_folder_id: '',
    webhook_deployed: false,
    setup_timestamp: ''
  },
  logging: {
    log_to_sheets: true,
    log_scrapes: true,
    log_forms: true,
    log_eject: true,
    log_chat: false,
    log_level: 'info'
  },
  gcp: {
    project_id: '',
    vision_enabled: false,
    speech_enabled: false,
    object_detection_enabled: false,
    memory_on_drive: true,
    rag_scrape_to_drive: true,
    webhook_action: 'gcp_toolkit'
  },
  hotkey: {
    form_fill: 'Ctrl+Shift+Meta+V',
    record_mode: false
  },
  autofill: {
    skip_filled: true,
    skip_mode: 'simple',
    overwrite_existing: false,
    inject_on_refresh: false
  },
  autofill_templates: {},
  cost_tracking: true,
  auto_retry: true,
  max_retries: 3,
  concurrent_requests: 5,
  default_ai_provider: 'claude',
  ui: {
    language: 'en',
    accent_color: '#38bdf8',
    density: 'comfortable',
    start_tab: 'clipboard'
  }
};

function normalizeConfig(config) {
  let merged = deepMerge(DEFAULT_CONFIG, config || {});
  merged.api_keys = deepMerge(DEFAULT_CONFIG.api_keys, merged.api_keys || {});
  merged.ai_models = deepMerge(DEFAULT_CONFIG.ai_models, merged.ai_models || {});
  merged.autofill_templates = merged.autofill_templates || {};
  Object.keys(AVAILABLE_MODELS).forEach((provider) => {
    const validIds = AVAILABLE_MODELS[provider].map((m) => m.id);
    if (!validIds.includes(merged.ai_models[provider])) {
      merged.ai_models[provider] = DEFAULT_CONFIG.ai_models[provider];
    }
  });
  if (!AVAILABLE_MODELS[merged.ai_provider]) {
    merged.ai_provider = DEFAULT_CONFIG.ai_provider;
  }
  // Accept full Google Sheets / Drive URLs and collapse to IDs once
  if (typeof GPD_GoogleIds !== 'undefined' && GPD_GoogleIds.normalizeConfigIds) {
    merged = GPD_GoogleIds.normalizeConfigIds(merged);
  }
  // Single webhook: if only one is set, mirror to the other
  if (merged.backend && merged.sheets) {
    if (merged.backend.webhook_url && !merged.sheets.webhook_url) {
      merged.sheets.webhook_url = merged.backend.webhook_url;
    }
    if (merged.sheets.webhook_url && !merged.backend.webhook_url) {
      merged.backend.webhook_url = merged.sheets.webhook_url;
    }
    if (merged.backend.webhook_secret && !merged.sheets.webhook_secret) {
      merged.sheets.webhook_secret = merged.backend.webhook_secret;
    }
    if (merged.sheets.webhook_secret && !merged.backend.webhook_secret) {
      merged.backend.webhook_secret = merged.sheets.webhook_secret;
    }
  }
  if (merged.gas_ui && !merged.gas_ui.url && merged.backend && merged.backend.webhook_url) {
    merged.gas_ui.url = merged.backend.webhook_url;
  }
  return merged;
}

const ConfigManager = {
  async getConfig() {
    const stored = await browserApi.storage.get('config');
    const normalized = normalizeConfig(stored.config || {});
    if (JSON.stringify(stored.config || {}) !== JSON.stringify(normalized)) {
      await browserApi.storage.set({ config: normalized });
    }
    return normalized;
  },
  /** Refuse to persist endpoint URLs that fail the URL policy (see core/security.js). */
  validateEndpoints(config) {
    if (typeof DANMAN_Security === 'undefined' || !config) return;
    const problems = [
      DANMAN_Security.webhookUrlProblem(config.sheets && config.sheets.webhook_url, 'Sheets webhook URL'),
      DANMAN_Security.webhookUrlProblem(config.backend && config.backend.webhook_url, 'Backend webhook URL')
    ].filter(Boolean);
    const sfUrl = config.salesforce && config.salesforce.instance_url;
    if (sfUrl && !DANMAN_Security.isSalesforceInstanceUrl(sfUrl)) {
      problems.push('Salesforce instance URL must be an https://*.salesforce.com or *.force.com address');
    }
    if (problems.length) throw new Error(problems.join('; '));
  },
  async setConfig(config) {
    const normalized = normalizeConfig(config);
    this.validateEndpoints(normalized);
    await browserApi.storage.set({ config: normalized });
    return normalized;
  },
  async updateConfig(updates) {
    const current = await this.getConfig();
    // Preserve secrets/keys when incoming fields are empty strings
    const cleaned = JSON.parse(JSON.stringify(updates || {}));
    if (cleaned.backend && cleaned.backend.webhook_secret === '') delete cleaned.backend.webhook_secret;
    if (cleaned.sheets && cleaned.sheets.webhook_secret === '') delete cleaned.sheets.webhook_secret;
    if (cleaned.api_keys) {
      Object.keys(cleaned.api_keys).forEach((k) => {
        if (!cleaned.api_keys[k]) delete cleaned.api_keys[k];
      });
    }
    const updated = normalizeConfig(deepMerge(current, cleaned));
    this.validateEndpoints(updated);
    await browserApi.storage.set({ config: updated });
    return updated;
  },
  async resetConfig() {
    await browserApi.storage.set({ config: DEFAULT_CONFIG });
    return DEFAULT_CONFIG;
  },
  async load() {
    return this.getConfig();
  },
  async save(config) {
    return this.updateConfig(config);
  },
  async get(key) {
    const config = await this.getConfig();
    return key ? config[key] : config;
  },
  async set(key, value) {
    const current = await this.getConfig();
    current[key] = value;
    return this.setConfig(current);
  },
  getAvailableModels(provider) {
    return AVAILABLE_MODELS[provider] || [];
  },
  isValidModel(provider, modelId) {
    const models = AVAILABLE_MODELS[provider] || [];
    return models.some((m) => m.id === modelId);
  },
  // Compat surface used by SetupWizard (flat keys like google_oauth_token
  // coexist with the nested schema; deepMerge preserves them).
  async getAll() {
    return this.getConfig();
  },
  async setMany(updates) {
    return this.updateConfig(updates);
  },
  async remove(key) {
    const stored = await browserApi.storage.get('config');
    const config = stored.config || {};
    delete config[key];
    const normalized = normalizeConfig(config);
    await browserApi.storage.set({ config: normalized });
    return normalized;
  }
};

if (typeof globalThis !== 'undefined') {
  globalThis.AVAILABLE_MODELS = AVAILABLE_MODELS;
  globalThis.CLAUDE_MODEL_ALIASES = CLAUDE_MODEL_ALIASES;
  globalThis.resolveModelId = resolveModelId;
  globalThis.ConfigManager = ConfigManager;
}
