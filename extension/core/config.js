const browserApi = (typeof Browser !== 'undefined') ? Browser : chrome;

// Catalog comes from core/model-catalog.js — load it before this file.
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
    firecrawl: ''
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
    url: ''
  },
  scraping: {
    max_depth: 3,
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
    tree_batch_size: 25
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
    language: 'en'
  }
};

function normalizeConfig(config) {
  const merged = deepMerge(DEFAULT_CONFIG, config || {});
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
  async setConfig(config) {
    const normalized = normalizeConfig(config);
    await browserApi.storage.set({ config: normalized });
    return normalized;
  },
  async updateConfig(updates) {
    const current = await this.getConfig();
    const updated = normalizeConfig(deepMerge(current, updates || {}));
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
  }
};

if (typeof globalThis !== 'undefined') {
  globalThis.AVAILABLE_MODELS = AVAILABLE_MODELS;
  globalThis.ConfigManager = ConfigManager;
}
