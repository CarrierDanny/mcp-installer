/**
 * Bridge_ConfigSync.gs — sync Script Properties + IDs into GetPower DANMAN.
 * ─────────────────────────────────────────────────────────────────────────────
 * Drop this into any GAS backend (alongside DANMAN_Bridge.gs). The extension's
 * unified Settings tab needs only Webhook URL + Webhook Secret; pressing Sync
 * calls get_config and imports Drive folder ID, Sheets ID, API keys, and other
 * script properties automatically.
 *
 * INSTALL:
 * 1. Copy this file + DANMAN_Bridge.gs into the project.
 * 2. Project Settings → Script Properties — set any of the keys below.
 * 3. Deploy as Web App (Execute as: Me, Access: Anyone).
 * 4. Extension → Settings → paste /exec URL + secret → Sync from Webhook.
 *
 * Recognized Script Property keys (any alias works):
 *   BRIDGE_SECRET / WEBHOOK_SECRET
 *   SPREADSHEET_ID / SHEETS_ID / GOOGLE_SHEETS_ID / MASTER_SHEET_ID
 *   DRIVE_FOLDER_ID / MASTER_FOLDER_ID / MEMORY_FOLDER_ID
 *   CLAUDE_API_KEY / ANTHROPIC_API_KEY
 *   OPENAI_API_KEY
 *   GEMINI_API_KEY / GOOGLE_AI_API_KEY
 *   FIRECRAWL_API_KEY
 *   GAS_UI_URL / HTML_APP_URL / COPILOT_UI_URL
 *   SF_INSTANCE_URL / SALESFORCE_INSTANCE_URL
 *   SF_ACCESS_TOKEN / SALESFORCE_ACCESS_TOKEN
 */

function danmanConfigBridgeTools_() {
  return {
    service: 'Config Sync',
    version: '1.0',
    caps: {
      'config.get': 'get_config',
      'config.sync': 'get_config'
    },
    tools: {
      get_config: {
        description: 'Return Drive/Sheets IDs, API keys, and other Script Properties for extension sync',
        category: 'config',
        params: [],
        handler: function () {
          return danmanBuildConfigPayload_();
        }
      },
      sync_config: {
        description: 'Alias of get_config',
        category: 'config',
        params: [],
        handler: function () {
          return danmanBuildConfigPayload_();
        }
      }
    }
  };
}

/**
 * Merge Config Sync into DANMAN_Bridge's registry loader.
 * DANMAN_Bridge already merges danmanBridgeTools_ + danmanDriveBridgeTools_.
 * We hook via danmanBridgeTools_ only when no other Bridge_* file defines it;
 * otherwise call danmanConfigBridgeTools_ from your own registry, or rely on
 * the merge helper below used by DANMAN_Bridge after this update.
 */
function danmanConfigSyncMergeInto_(cfg) {
  var m = danmanConfigBridgeTools_() || {};
  if (m.service && (!cfg.service || cfg.service === 'unnamed')) cfg.service = m.service;
  if (m.version && !cfg.version) cfg.version = m.version;
  if (m.caps) for (var k in m.caps) cfg.caps[k] = m.caps[k];
  if (m.tools) for (var t in m.tools) cfg.tools[t] = m.tools[t];
  return cfg;
}

function danmanBuildConfigPayload_() {
  var props = {};
  try {
    props = PropertiesService.getScriptProperties().getProperties() || {};
  } catch (e) {
    props = {};
  }

  function first_() {
    for (var i = 0; i < arguments.length; i++) {
      var k = arguments[i];
      if (props[k] != null && String(props[k]).trim() !== '') return String(props[k]).trim();
    }
    return '';
  }

  var spreadsheetId = first_(
    'SPREADSHEET_ID', 'SHEETS_ID', 'GOOGLE_SHEETS_ID', 'MASTER_SHEET_ID',
    'spreadsheet_id', 'sheets.spreadsheet_id'
  );
  var driveFolderId = first_(
    'DRIVE_FOLDER_ID', 'MASTER_FOLDER_ID', 'MEMORY_FOLDER_ID',
    'drive_folder_id', 'memory.folder_id', 'backend.master_folder_id'
  );
  var gasUiUrl = first_('GAS_UI_URL', 'HTML_APP_URL', 'COPILOT_UI_URL', 'gas_ui.url');
  var claudeKey = first_('CLAUDE_API_KEY', 'ANTHROPIC_API_KEY', 'api_keys.claude');
  var openaiKey = first_('OPENAI_API_KEY', 'api_keys.openai');
  var geminiKey = first_('GEMINI_API_KEY', 'GOOGLE_AI_API_KEY', 'api_keys.gemini');
  var firecrawlKey = first_('FIRECRAWL_API_KEY', 'api_keys.firecrawl');
  var sfInstance = first_('SF_INSTANCE_URL', 'SALESFORCE_INSTANCE_URL', 'salesforce.instance_url');
  var sfToken = first_('SF_ACCESS_TOKEN', 'SALESFORCE_ACCESS_TOKEN', 'salesforce.access_token');

  if (!spreadsheetId) {
    try {
      var active = SpreadsheetApp.getActiveSpreadsheet();
      if (active) spreadsheetId = active.getId();
    } catch (e2) {}
  }

  var config = {
    sheets: {
      spreadsheet_id: spreadsheetId,
      drive_folder_id: driveFolderId,
      method: 'webhook'
    },
    backend: {
      master_folder_id: driveFolderId
    },
    memory: {
      folder_id: driveFolderId,
      drive_folder_id: driveFolderId,
      enabled: !!driveFolderId
    },
    setup: {
      spreadsheet_id: spreadsheetId,
      drive_root_folder_id: driveFolderId,
      completed: !!(spreadsheetId || driveFolderId)
    },
    gas_ui: {
      url: gasUiUrl
    },
    api_keys: {},
    salesforce: {}
  };

  if (claudeKey) config.api_keys.claude = claudeKey;
  if (openaiKey) config.api_keys.openai = openaiKey;
  if (geminiKey) config.api_keys.gemini = geminiKey;
  if (firecrawlKey) config.api_keys.firecrawl = firecrawlKey;
  if (sfInstance) config.salesforce.instance_url = sfInstance;
  if (sfToken) config.salesforce.access_token = sfToken;

  var safeProps = {};
  var secretKeys = { BRIDGE_SECRET: 1, WEBHOOK_SECRET: 1, SECRET: 1 };
  Object.keys(props).forEach(function (k) {
    if (secretKeys[k]) return;
    safeProps[k] = props[k];
  });

  return {
    success: true,
    config: config,
    properties: safeProps,
    spreadsheet_id: spreadsheetId,
    drive_folder_id: driveFolderId,
    gas_ui_url: gasUiUrl
  };
}
