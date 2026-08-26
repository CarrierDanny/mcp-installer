// background/service-worker.js — GetPower DANMAN Service Worker

// Load core modules - Chrome uses importScripts, Firefox uses manifest scripts
if (typeof importScripts === 'function') {
  importScripts(
    'core/browser.js',
    'core/utils.js',
    'core/dms-utils.js',
    'core/config.js',
    'core/storage.js',
    'core/api.js',
    'core/logger.js',
    'core/drive.js',
    'core/memory.js',
    'core/setup-wizard.js',
    'core/dms-adapters.js',
    'template-engine.js',
    'ocr-engine.js',
    'gcp-toolkit.js',
    'macro-engine.js',
    'danman-gas-bridge.js'
  );
}

// ============================================================
// INITIALIZATION
// ============================================================

Logger.init().then(() => {
  console.log('[DANMAN] Service worker initialized, session:', Logger.sessionId);
});

// On first install, check for bootstrap config from installer
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install' || details.reason === 'update') {
    try {
      const resp = await fetch(chrome.runtime.getURL('setup/bootstrap-config.json'));
      if (resp.ok) {
        const bootstrap = await resp.json();
        if (bootstrap._setup_complete) {
          const current = await ConfigManager.load();
          const merged = { ...current, ...bootstrap };
          delete merged._setup_complete;
          delete merged._setup_timestamp;
          await ConfigManager.save(merged);
          console.log('[DANMAN] Bootstrap config applied from installer');
        }
      }
    } catch (_) {
      // No bootstrap config — normal manual setup
    }
  }
});

// ============================================================
// WEBHOOK ACTIVITY LOGGER — logs all actions to Google Sheets via Apps Script
// ============================================================

async function logToWebhook(eventType, details = {}) {
  try {
    const config = await ConfigManager.load();
    const webhookUrl = config.sheets?.webhook_url;
    if (!webhookUrl) return; // No webhook configured — skip silently

    const secret = config.sheets?.webhook_secret || '';
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret,
        action: 'activity_log',
        event_type: eventType,
        session_id: Logger.sessionId,
        timestamp: new Date().toISOString(),
        ...details
      })
    });

    // Also append to Activity_Log sheet if logging enabled
    if (config.logging?.log_to_sheets && config.sheets?.spreadsheet_id) {
      try {
        const logRow = [new Date().toISOString(), Logger.sessionId, eventType, JSON.stringify(details).slice(0, 500), details.url || '', '', 'OK'];
        // Use webhook append if available
        if (webhookUrl) {
          await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              secret,
              action: 'append',
              range: 'Activity_Log!A1',
              values: [logRow],
              spreadsheetId: config.sheets.spreadsheet_id
            })
          });
        }
      } catch (_) {
        // Non-blocking
      }
    }
  } catch (_) {
    // Non-blocking — webhook logging is best-effort
  }
}

// ============================================================
// MESSAGE ROUTER
// ============================================================

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) {
    sendResponse({ error: 'Missing message type' });
    return true;
  }

  handleMessage(msg, sender)
    .then(result => sendResponse(result))
    .catch(err => {
      console.error(`[DANMAN] Error handling ${msg.type}:`, err);
      if (typeof Logger !== 'undefined' && Logger.log) {
        Logger.log('ERROR', `${msg.type} failed: ${err.message}`).catch(() => {});
      }
      sendResponse({ error: err.message });
    });

  return true; // Keep message channel open for async response
});

/** Firefox: options page opens a port to wake the event background before sendMessage. */
if (chrome.runtime.onConnect && chrome.runtime.onConnect.addListener) {
  chrome.runtime.onConnect.addListener((port) => {
    if (!port || port.name !== 'danman-options-wake') return;
    port.onMessage.addListener((msg) => {
      if (msg && msg.type === 'PING') {
        try { port.postMessage({ ok: true, pong: true, sessionId: Logger.sessionId }); } catch (_) {}
      }
    });
  });
}

async function handleMessage(msg, sender) {
  const { type, payload = {} } = msg;

  switch (type) {
    // === SCRAPING ===
    case 'SCRAPE_PAGE': return handleScrapePage(payload, sender);
    case 'SCRAPE_RESULT': return handleScrapeResult(payload);

    // === LINKS ===
    case 'EXTRACT_LINKS': return handleExtractLinks(payload, sender);
    case 'LINKS_RESULT': return handleLinksResult(payload);

    // === FORMS ===
    case 'SCAN_FORMS': return handleScanForms(payload, sender);
    case 'FORMS_RESULT': return handleFormsResult(payload);
    case 'SAVE_AUTOFILL_TEMPLATE': return handleSaveTemplate(payload);
    case 'LOAD_AUTOFILL_TEMPLATE': return handleLoadTemplate(payload);
    case 'GET_AUTOFILL_TEMPLATES': return handleGetTemplates(payload);

    // === GP BRIDGE (capability shim — routed through BridgeRegistry) ===
    case 'GP_PING': return DMS_GpBridge.ping();
    case 'GP_MEMORY_SAVE': return DMS_GpBridge.memorySave(payload || {});
    case 'GP_MEMORY_SEARCH': return DMS_GpBridge.memorySearch(payload || {});
    case 'GP_CHAT': return DMS_GpBridge.chat(payload || {});
    case 'GP_CAPTURE': return DMS_GpBridge.capture(payload || {});
    case 'GP_OVERVIEW': return DMS_GpBridge.overview();

    // === UNIVERSAL BRIDGE (profiles / adapters / tools) ===
    case 'BRIDGE_LIST': return BridgeRegistry.list();
    case 'BRIDGE_SAVE': return BridgeRegistry.save(payload || {});
    case 'BRIDGE_DELETE': return BridgeRegistry.remove(payload.profileId);
    case 'BRIDGE_TEST': return BridgeRegistry.test(payload.profileId);
    case 'BRIDGE_DISCOVER': return BridgeRegistry.discover(payload.profileId);
    case 'BRIDGE_CALL': return BridgeRegistry.callTool(payload.profileId, payload.action, payload.args || {});
    case 'BRIDGE_ROUTING_SET': return BridgeRegistry.setRouting(payload.routing);
    case 'BRIDGE_TOOLS_GET': return BridgeRegistry.getTools(payload.profileId);
    case 'BRIDGE_TOOL_SAVE_CUSTOM': return BridgeRegistry.saveCustomTool(payload.profileId, payload.tool);
    case 'BRIDGE_TOOL_DELETE_CUSTOM': return BridgeRegistry.deleteCustomTool(payload.profileId, payload.name);
    case 'BRIDGE_LOG_GET': return BridgeRegistry.getLog();

    // === MULTI-TAB RIPPER + GOOGLE FORMS CONVERTER ===
    case 'TABS_LIST': return handleTabsList();
    case 'GFORMS_GRAB': return handleGrabTabHtml(payload || {});
    case 'RIP_TAB': return handleRipTab(payload || {});

    // === MEMORY FOLDER ROUTING ===
    case 'MEMORY_STORE_ARTIFACT':
      return MemoryManager.storeArtifact(payload.kind, payload.name, payload.content, payload.mime)
        .then((r) => ({ success: true, ...r }))
        .catch((e) => ({ success: false, error: e.message }));

    // === DANMAN CHAT ===
    case 'DANMAN_CHAT': return handleDanmanChat(payload);
    case 'DANMAN_GET_HISTORY': return handleDanmanGetHistory(payload);
    case 'DANMAN_CLEAR_HISTORY': return handleDanmanClearHistory(payload);
    case 'DANMAN_FORMS_CHAT': return handleDanmanFormsChat(payload);
    case 'DANMAN_POPOUT_OPEN': return openDanmanPopoutWindow();
    case 'DANMAN_POPOUT_DOCK': return closeDanmanPopoutWindow();
    case 'DANMAN_POPOUT_CHAT': return handleDanmanPopoutChat(payload);
    case 'PING': return { ok: true, pong: true, sessionId: Logger.sessionId };
    case 'HEALTH_CHECK': return handleHealthCheck(sender);

    // === WORKBENCH SOQL (v6.9) ===
    case 'SOQL_GET_CATALOG':
    case 'SOQL_EXTRACT_CASES':
    case 'SOQL_BUILD':
    case 'SOQL_VALIDATE':
    case 'SOQL_GET_SLOTS':
    case 'SOQL_SAVE_SLOT':
    case 'SOQL_PARSE_RESULTS':
    case 'SOQL_PREVIEW_WORKBENCH':
    case 'SOQL_IMPORT_WORKBENCH':
      if (typeof SoqlEngine !== 'undefined' && SoqlEngine.handleSoqlMessage) {
        return SoqlEngine.handleSoqlMessage(type, payload);
      }
      return { error: 'SOQL engine not loaded' };
    case 'DANMAN_GAS_PROXY':
      if (typeof handleDanmanGasProxy === 'function') return handleDanmanGasProxy(payload);
      return { error: 'DANMAN GAS bridge not loaded' };

    // === GOOGLE SHEETS ===
    case 'SHEETS_READ': return handleSheetsRead(payload);
    case 'SHEETS_WRITE': return handleSheetsWrite(payload);
    case 'SHEETS_APPEND': return handleSheetsAppend(payload);
    case 'SHEETS_LIST': return handleSheetsList(payload);
    case 'SHEETS_PREVIEW': return handleSheetsPreview(payload);
    case 'WRITE_RESULTS': return handleWriteResults(payload);

    // === EJECT PIPELINE ===
    case 'EJECT_RUN_PIPELINE': return handleEjectPipeline(payload, sender);
    case 'EJECT_SCRAPE_EMAIL': return handleEjectScrapeEmail(sender);
    case 'EJECT_JSONIFY': return handleEjectJsonify(payload);
    case 'EJECT_EXAMINE': return handleEjectExamine(payload);
    case 'EJECT_COMPARE': return handleEjectCompare(payload);
    case 'EJECT_TRANSFER': return handleEjectTransfer(payload);
    case 'EJECT_GET_HISTORY': return Storage.getEjectHistory();
    case 'EJECT_GET_STATS': return handleEjectStats();
    case 'EJECT_CLEAR_HISTORY': return Storage.clearEjectHistory();
    case 'EJECT_TEST_API': return AIClient.testConnection(payload);

    // === CONFIG ===
    case 'CONFIG_LOAD': return ConfigManager.load();
    case 'CONFIG_SAVE': {
      try { MasterLog.append('CONFIG_SAVE', 'keys: ' + Object.keys(payload || {}).join(','), {}); } catch (_) {}
      return ConfigManager.save(payload);
    }
    case 'CONFIG_IMPORT_FROM_SHEET': return handleConfigImportFromSheet(payload);
    case 'CONFIG_SYNC_FROM_WEBHOOK': return handleConfigSyncFromWebhook(payload);
    case 'CONFIG_GET': return ConfigManager.get(payload.key);
    case 'CONFIG_SET': return ConfigManager.set(payload.key, payload.value);

    // === LOGGING ===
    case 'LOG_ACTION': return Logger.log(payload.action, payload.detail, payload.data);
    case 'GET_LOGS': return Logger.getLogs(payload);
    case 'GET_SESSION_LOGS': return Logger.getSessionLogs();
    case 'EXPORT_LOGS': return Logger.exportLogs(payload);
    case 'CLEAR_LOGS': return Logger.clearLogs();
    case 'GET_LOG_STATS': return Logger.getStats();
    case 'LOG_CONFIG_CHANGE': return handleLogConfigChange(payload);

    // === RAG TREE ===
    case 'CRAWL_TREE': return handleCrawlTree(payload);
    case 'CRAWL_TREE_STATUS': return handleCrawlTreeStatus();
    case 'CRAWL_TREE_PAUSE': return handleCrawlTreeCommand('pause');
    case 'CRAWL_TREE_RESUME': return handleCrawlTreeCommand('resume');
    case 'CRAWL_TREE_CANCEL': return handleCrawlTreeCommand('cancel');
    case 'GET_OPEN_TABS': return handleGetOpenTabs();
    case 'GET_ACTIVE_TAB_URL': return handleGetActiveTabUrl();

    // === TREE EXPORT ===
    case 'SHEETS_WEBHOOK': return handleSheetsWebhook(payload);

    // === DANMAN BACKEND ===
    case 'BACKEND_POST': return handleBackendPost(payload);
    case 'CAPTURE_SCREENSHOT': return handleCaptureScreenshot(payload, sender);
    case 'SAVE_SESSION': return handleSaveSession(payload, sender);

    // === SIDEBAR ===
    case 'TOGGLE_SIDEBAR':
      if (sender.tab) {
        await sendMessageToTab(sender.tab.id, { type: 'TOGGLE_SIDEBAR', payload: payload || {} });
      } else {
        await sendMessageToActiveTab({ type: 'TOGGLE_SIDEBAR', payload: payload || {} });
      }
      return { ok: true };

    case 'OPEN_SIDEBAR':
      if (sender.tab) {
        await sendMessageToTab(sender.tab.id, { type: 'OPEN_SIDEBAR', payload: payload || {} });
      } else {
        await sendMessageToActiveTab({ type: 'OPEN_SIDEBAR', payload: payload || {} });
      }
      return { ok: true };

    case 'CONTEXT_MACRO_RECORD_PICK':
      return handleContextMacroRecordPick(sender);

    case 'REFRESH_CONTEXT_MENUS':
      await refreshDanmanContextMenus();
      return { ok: true };

    case 'GET_SESSION':
      return { sessionId: Logger.sessionId };

    // === POPUP STATS ===
    case 'GET_QUICK_STATS': return handleGetQuickStats();


    // === GOOGLE DRIVE ===
    case 'DRIVE_CREATE_FILE': return handleDriveCreateFile(payload);
    case 'DRIVE_CREATE_FOLDER': return handleDriveCreateFolder(payload);
    case 'DRIVE_LIST_FILES': return handleDriveListFiles(payload);
    case 'DRIVE_READ_FILE': return handleDriveReadFile(payload);
    case 'DRIVE_SAVE_FORM_FIELDS': return handleDriveSaveFormFields(payload);
    case 'DRIVE_SAVE_JSON': return handleDriveSaveJson(payload);
    case 'DRIVE_SAVE_HTML': return handleDriveSaveHtml(payload);
    case 'DRIVE_TEST': return DriveClient.testConnection();
    case 'DRIVE_TEST_CONNECTION': return handleDriveTestConnection(payload);
    case 'DRIVE_SAVE_MEDIA': return handleDriveSaveMedia(payload);

    // === CLIPBOARD MANAGER ===
    case 'CLIPBOARD_SAVE': return handleClipboardSave(payload);
    case 'CLIPBOARD_LOAD': return handleClipboardLoad();
    case 'CLIPBOARD_BROADCAST': return handleClipboardBroadcast(payload, sender);
    case 'CLIPBOARD_NEW_CAPTURE': return handleClipboardNewCapture(payload, sender);
    case 'CLIPBOARD_PASTE_TO_PAGE': return handleClipboardPasteToPage(payload);
    case 'CLIPBOARD_HOTKEY_PRESSED': return handleClipboardHotkeyPressed(payload, sender);
    case 'CLIPBOARD_SET_NUMPAD_MODE': return handleClipboardSetNumpadMode(payload);
    case 'CLIPBOARD_GET_NUMPAD_MODE': return handleClipboardGetNumpadMode();
    case 'CLIPBOARD_POPOUT_OPEN': return openClipboardPopoutWindow();
    case 'CLIPBOARD_POPOUT_DOCK': return closeClipboardPopoutWindow();
    case 'CLIPBOARD_POPOUT_PIN': return handleClipboardPopoutPin(payload);
    case 'CLIPBOARD_POPOUT_FOCUS': return focusClipboardPopoutWindow();
    case 'CLIPBOARD_EVENT_LOG': return handleClipboardEventLog(payload, sender);
    case 'CLIPBOARD_FORCE_POLL': return handleClipboardForcePoll(payload, sender);
    case 'CLIPBOARD_GET_EVENT_LOG': return handleClipboardGetEventLog(payload);
    case 'DANMAN_USAGE_CONFIRM': return { ok: true }; // logged client-side; reserved
    case 'ELEVENLABS_TTS': return handleElevenLabsTts(payload);
    case 'DANMAN_PAGE_WATCH_TOGGLE': return handleDanmanPageWatchToggle(payload, sender);

    // === MEMORY SYSTEM ===
    case 'MEMORY_LOAD_CONFIG': return MemoryManager.loadMemoryConfig();
    case 'MEMORY_SAVE_CONFIG': return MemoryManager.saveMemoryConfig(payload).then((ok) => ({ success: !!ok }));
    case 'MEMORY_LIST_PROJECTS': return MemoryManager.listProjects().then((projects) => ({
      success: true,
      projects,
      activeProject: (projects.find((p) => p.active) || {}).name || null
    }));
    case 'MEMORY_CREATE_PROJECT': return MemoryManager.createProject(payload.name, payload.description).then((id) =>
      (id ? { success: true, projectId: id } : { success: false, error: 'Project creation failed' }));
    case 'MEMORY_GET_PROJECT_CONTEXT': return MemoryManager.getProjectContext(payload.projectName);
    case 'MEMORY_ADD_FILE': return MemoryManager.addFileToProject(payload.projectName, payload.fileName, payload.content).then((ok) => ({ success: !!ok }));
    case 'MEMORY_BUILD_CONTEXT': return MemoryManager.buildMemoryContext();
    case 'MEMORY_GET_ACTIVE': return MemoryManager.getActiveProjects();
    case 'MEMORY_SET_ACTIVE': {
      // UIs send {projects:[...]}, {projectId, active}, or {project}
      if (payload && Array.isArray(payload.projects)) {
        return MemoryManager.setActiveProjects(payload.projects).then((ok) => ({ success: !!ok }));
      }
      const memTarget = (payload && (payload.projectId || payload.project)) || '';
      const memActive = payload && payload.active !== undefined ? !!payload.active : true;
      return MemoryManager.setActiveProject(memTarget, memActive).then((ok) => ({ success: !!ok }));
    }
    case 'MEMORY_GET_STATS': return MemoryManager.getMemoryStats();
    case 'MEMORY_INIT': return handleMemoryInit(payload);
    case 'MEMORY_IS_CONFIGURED': return MemoryManager.isMemoryConfigured().then((configured) => ({ configured: !!configured }));
    case 'MEMORY_DELETE_PROJECT': return MemoryManager.deleteProject((payload && (payload.projectId || payload.project)) || '').then((ok) =>
      (ok ? { success: true } : { success: false, error: 'Project delete failed' }));
    case 'MEMORY_CLEAR_ALL': return MemoryManager.clearAll().then((ok) =>
      (ok ? { success: true } : { success: false, error: 'Memory clear failed' }));

    // === SETUP WIZARD ===
    case 'SETUP_STATUS': return SetupWizard.getSetupStatus();
    case 'SETUP_RUN': return handleSetupRun(payload);
    case 'SETUP_VALIDATE': return SetupWizard.validateSetup();
    case 'SETUP_INSTRUCTIONS': return SetupWizard.getSetupInstructions();
    case 'SETUP_GENERATE_WEBHOOK': return SetupWizard.generateWebhookCode();
    case 'SETUP_RESET': return SetupWizard.resetSetup();

    // ─── OCR ───
    case 'OCR_RUN':              return handleOcrRun(payload);
    case 'OCR_EXTRACT_ENTITIES': return handleOcrExtractEntities(payload);
    case 'OCR_EXPORT_SHEETS':    return handleOcrExportSheets(payload);
    case 'GCP_TOOLKIT_INVOKE':   return handleGcpToolkitInvoke(payload);

    // ─── Macros ───
    case 'MACRO_LIST':          return handleMacroList();
    case 'MACRO_LOAD':          return handleMacroLoad(payload);
    case 'MACRO_SAVE':          return handleMacroSave(payload);
    case 'MACRO_DELETE':        return handleMacroDelete(payload);
    case 'MACRO_RUN':           return handleMacroRun(payload);
    case 'MACRO_PAUSE':         return handleMacroPause();
    case 'MACRO_RESUME':        return handleMacroResume();
    case 'MACRO_STOP':          return handleMacroStop();
    case 'MACRO_SNAPSHOT':      return handleMacroSnapshot();
    case 'MACRO_RECORD_START':  return handleMacroRecordStart(payload);
    case 'MACRO_RECORD_STOP':   return handleMacroRecordStop(payload);
    case 'MACRO_STUDIO_RECORD_START': return handleMacroStudioRecordStart(payload);
    case 'MACRO_STUDIO_RECORD_STOP':  return handleMacroStudioRecordStop(payload);
    case 'MACRO_STUDIO_RECORD_PAUSE': return handleMacroStudioRecordPause(payload);
    case 'MACRO_STUDIO_RECORD_RESUME': return handleMacroStudioRecordResume(payload);
    case 'dms_recording_finished':    return handleDmsRecordingFinished(msg);
    case 'dms_recording_step':        return handleDmsRecordingStep(msg);
    case 'dms_recording_paused':      return handleDmsRecordingPaused(msg);

    // ─── Element picker ───
    case 'PICKER_START':     return handlePickerStart(payload);
    case 'PICKER_SELECTED':  return handlePickerSelected(payload);
    case 'PICKER_CANCEL':    return handlePickerCancel(payload);
    case 'PICKER_GET_LAST':  return handlePickerGetLast(payload);
    case 'SCREEN_PICK_START': return handleScreenPickStart(payload);
    case 'SCREEN_PICK_CANCEL': return handleScreenPickCancel(payload);
    case 'dms_picker_picked': return handleDmsPickerPicked(msg, sender);
    case 'dms_screen_picked': return handleDmsScreenPicked(msg, sender);
    case 'dms_screen_pick_move': return handleDmsScreenPickMove(msg, sender);
    case 'SCREEN_PICK_CANCELLED': {
      const _cancelTabId = sender && sender.tab && sender.tab.id;
      if (_cancelTabId != null) {
        const prev = _activeScreenPickSessions.get(_cancelTabId);
        _endScreenPickOnTab(_cancelTabId, prev && prev.sessionId);
        chrome.tabs.sendMessage(_cancelTabId, { type: 'GPD_SIDEBAR_PICK_STOP' }, () => { chrome.runtime.lastError; });
      }
      try {
        chrome.runtime.sendMessage({ type: 'SCREEN_PICK_CANCELLED' }).catch(() => {});
      } catch (e) {}
      return { ok: true };
    }

    default:
      console.warn('[DANMAN] Unknown message type:', type);
      return { error: `Unknown message type: ${type}` };
  }
}

// ============================================================
// CONTEXT MENUS
// ============================================================

const GPD_CONTENT_SCRIPT_FILES = [
  'content/content-main.js',
  'content/clipboard-listener.js',
  'content/element-picker.js',
  'content/dms-recorder.js',
  'content/macro-runner.js'
];

async function sendMessageToTab(tabId, message) {
  if (!tabId) return false;
  try {
    await chrome.tabs.sendMessage(tabId, message);
    return true;
  } catch (e) {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: GPD_CONTENT_SCRIPT_FILES });
      await new Promise((r) => setTimeout(r, 500));
      await chrome.tabs.sendMessage(tabId, message);
      return true;
    } catch (e2) {
      console.error('[DANMAN] sendMessageToTab failed:', e2.message);
      return false;
    }
  }
}

async function sendMessageToActiveTab(message) {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs[0] || !tabs[0].id) return false;
  return sendMessageToTab(tabs[0].id, message);
}

function clipMenuTitle(index, content) {
  const t = (content || '').replace(/\s+/g, ' ').trim();
  const preview = t ? (t.length > 42 ? t.slice(0, 42) + '…' : t) : '(empty)';
  return '\uD83D\uDCCB ' + (index + 1) + ': ' + preview;
}

function registerDanmanContextMenus() {
  return new Promise((resolve) => {
    chrome.contextMenus.removeAll(() => {
      const allCtx = ['page', 'selection', 'editable', 'image', 'link'];

      chrome.contextMenus.create({ id: 'gpd-parent', title: '\uD835\uDCD3  DANMAN', contexts: allCtx });
      chrome.contextMenus.create({ id: 'gpd-open-sidebar', parentId: 'gpd-parent', title: '\u2630  Open Sidebar', contexts: allCtx });
      chrome.contextMenus.create({ id: 'gpd-sep-1', parentId: 'gpd-parent', type: 'separator', contexts: allCtx });

      chrome.contextMenus.create({ id: 'gpd-clip-parent', parentId: 'gpd-parent', title: '\uD83D\uDCCB Clipboard (slots 1–10)', contexts: allCtx });
      for (let i = 0; i < 10; i++) {
        chrome.contextMenus.create({
          id: 'gpd-clip-' + i,
          parentId: 'gpd-clip-parent',
          title: 'Slot ' + (i + 1) + '…',
          contexts: allCtx
        });
      }

      chrome.contextMenus.create({ id: 'gpd-sep-clip', parentId: 'gpd-parent', type: 'separator', contexts: allCtx });

      chrome.contextMenus.create({ id: 'gpd-macro-parent', parentId: 'gpd-parent', title: '\u23FA Macros', contexts: allCtx });
      chrome.contextMenus.create({ id: 'gpd-macro-record-pick', parentId: 'gpd-macro-parent', title: '\uD83C\uDFAF Record step (pick element)', contexts: allCtx });
      chrome.contextMenus.create({ id: 'gpd-macro-pick-location', parentId: 'gpd-macro-parent', title: '\uD83D\uDCCD Pick element location', contexts: allCtx });
      chrome.contextMenus.create({ id: 'gpd-sep-macro', parentId: 'gpd-macro-parent', type: 'separator', contexts: allCtx });
      chrome.contextMenus.create({ id: 'gpd-macro-run', parentId: 'gpd-macro-parent', title: '\u25B6 Run last macro', contexts: allCtx });
      chrome.contextMenus.create({ id: 'gpd-macro-pause', parentId: 'gpd-macro-parent', title: '\u23F8 Pause macro', contexts: allCtx });
      chrome.contextMenus.create({ id: 'gpd-macro-resume', parentId: 'gpd-macro-parent', title: '\u25B6 Resume macro', contexts: allCtx });
      chrome.contextMenus.create({ id: 'gpd-macro-stop', parentId: 'gpd-macro-parent', title: '\u23F9 Stop macro', contexts: allCtx });

      chrome.contextMenus.create({ id: 'gpd-eject-selection', parentId: 'gpd-parent', title: '\u26A1 EJECT selected text', contexts: ['selection'] });
      chrome.contextMenus.create({ id: 'gpd-eject-page', parentId: 'gpd-parent', title: '\u26A1 EJECT this page', contexts: ['page'] });

      chrome.contextMenus.create({ id: 'gpd-sep-2', parentId: 'gpd-parent', type: 'separator', contexts: allCtx });
      chrome.contextMenus.create({ id: 'gpd-speed-scrape', parentId: 'gpd-parent', title: '\u26A1 Speed Scrape This Page', contexts: ['page'] });
      chrome.contextMenus.create({ id: 'gpd-ask-danman', parentId: 'gpd-parent', title: '\uD83E\uDD16 Ask DANMAN', contexts: ['selection'] });
      chrome.contextMenus.create({ id: 'gpd-send-to-sheets', parentId: 'gpd-parent', title: '\uD83D\uDCCA Send to Sheets', contexts: ['selection'] });
      chrome.contextMenus.create({ id: 'gpd-screenshot', parentId: 'gpd-parent', title: '\uD83D\uDCF7 Screenshot This Page', contexts: ['page'] });
      chrome.contextMenus.create({ id: 'gpd-clipboard', parentId: 'gpd-parent', title: '\uD83D\uDCCB Open Clipboard tab', contexts: allCtx });
      chrome.contextMenus.create({ id: 'gpd-sep-3', parentId: 'gpd-parent', type: 'separator', contexts: allCtx });
      chrome.contextMenus.create({ id: 'gpd-open-sheets', parentId: 'gpd-parent', title: '\uD83D\uDCC4 Open Google Sheets', contexts: allCtx });
      chrome.contextMenus.create({ id: 'gpd-open-drive', parentId: 'gpd-parent', title: '\uD83D\uDCC2 Open Google Drive Folder', contexts: allCtx });
      chrome.contextMenus.create({ id: 'gpd-sep-4', parentId: 'gpd-parent', type: 'separator', contexts: allCtx });
      chrome.contextMenus.create({ id: 'gpd-open-settings', parentId: 'gpd-parent', title: '\u2699\uFE0F  Settings', contexts: allCtx });

      console.log('[DANMAN] Context menus registered');
      resolve();
    });
  });
}

async function refreshDanmanContextMenus() {
  let slots = [];
  try {
    const stored = await handleClipboardLoad();
    const state = (stored && stored.state) || stored;
    slots = (state && state.slots) || [];
  } catch (_) {
    slots = [];
  }
  for (let i = 0; i < 10; i++) {
    const title = clipMenuTitle(i, slots[i] && slots[i].content);
    try {
      await chrome.contextMenus.update('gpd-clip-' + i, { title });
    } catch (_) { /* menu may not exist yet */ }
  }
}

async function handleContextMacroRecordPick(sender) {
  const tabId = sender && sender.tab && sender.tab.id;
  if (!tabId) return { ok: false, error: 'No tab' };
  await sendMessageToTab(tabId, { type: 'OPEN_SIDEBAR', payload: { tab: 'macros', forceOpen: true } });
  await handleMacroStudioRecordStart({ tabId });
  await handlePickerStart({ tabId, label: 'context-record' });
  return { ok: true };
}

async function handleDanmanPopoutChat(payload) {
  try {
    if (typeof handleDanmanGasProxy !== 'function') {
      return { success: false, error: 'AI bridge not loaded — reload the extension in about:debugging' };
    }
    const resp = await handleDanmanGasProxy({ method: 'sendMessageToDANMAN', args: [payload || {}] });
    if (resp && resp.error) return { success: false, error: resp.error };
    const data = (resp && resp.data !== undefined) ? resp.data : resp;
    if (data && data.success === false) return data;
    if (typeof data === 'string') return { success: true, content: data, model: (await ConfigManager.load()).ai_models?.claude };
    return data || { success: false, error: 'Empty response from AI bridge' };
  } catch (e) {
    return { success: false, error: e.message || String(e) };
  }
}

function ensureBackgroundKeepaliveAlarm() {
  if (!chrome.alarms || !chrome.alarms.create) return;
  try {
    chrome.alarms.create('danman-bg-ping', { periodInMinutes: 1 });
  } catch (_) {}
}

chrome.runtime.onInstalled.addListener(() => {
  registerDanmanContextMenus().then(() => refreshDanmanContextMenus());
  ensureBackgroundKeepaliveAlarm();
});

if (chrome.alarms && chrome.alarms.onAlarm) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm && alarm.name === 'danman-bg-ping') {
      console.log('[DANMAN] background keepalive', Logger.sessionId);
    }
  });
}

chrome.runtime.onStartup.addListener(() => {
  ensureBackgroundKeepaliveAlarm();
  refreshDanmanContextMenus().catch(() => {});
});

ensureBackgroundKeepaliveAlarm();

if (chrome.contextMenus.onShown && chrome.contextMenus.onShown.addListener) {
  chrome.contextMenus.onShown.addListener(() => {
    refreshDanmanContextMenus().catch(() => {});
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.id) return;

  async function openSidebarTab(tabName) {
    await sendMessageToTab(tab.id, {
      type: 'OPEN_SIDEBAR',
      payload: { tab: tabName || null, forceOpen: true }
    });
  }

  const menuId = String(info.menuItemId || '');
  const clipMatch = menuId.match(/^gpd-clip-(\d+)$/);

  if (clipMatch) {
    const slotIndex = parseInt(clipMatch[1], 10);
    await handleClipboardPasteToPage({ slotIndex });
    return;
  }

  switch (info.menuItemId) {
    case 'gpd-open-sidebar':
      openSidebarTab(null);
      break;

    case 'gpd-macro-record-pick':
      await handleContextMacroRecordPick({ tab });
      break;

    case 'gpd-macro-pick-location':
      await handlePickerStart({ tabId: tab.id, label: 'context-pick' });
      await openSidebarTab('macros');
      break;

    case 'gpd-macro-run': {
      const stored = await chrome.storage.local.get(['gpd_last_macro_id', 'macros']);
      const id = stored.gpd_last_macro_id;
      if (id && stored.macros && stored.macros[id]) {
        await handleMacroRun({ id });
      } else {
        await openSidebarTab('macros');
      }
      break;
    }

    case 'gpd-macro-pause':
      await handleMacroPause();
      break;

    case 'gpd-macro-resume':
      await handleMacroResume();
      break;

    case 'gpd-macro-stop':
      await handleMacroStop();
      break;

    case 'gpd-eject-selection':
      if (info.selectionText) {
        await handleEjectPipeline({ text: info.selectionText, source: 'context-menu' }, { tab });
        await openSidebarTab('eject');
      }
      break;

    case 'gpd-eject-page': {
      // Page-context EJECT (ported from Get Power v2.0.0) — scrape the page's
      // email content, then run the pipeline. Tab opens first so the user
      // watches progress via EJECT_PIPELINE_UPDATE broadcasts.
      await openSidebarTab('eject');
      try {
        const d = await chrome.tabs.sendMessage(tab.id, { type: 'DO_SCRAPE_EMAIL' }) || {};
        const pageText = [
          d.subject ? 'Subject: ' + d.subject : '',
          d.from ? 'From: ' + d.from : '',
          d.date ? 'Date: ' + d.date : '',
          d.body || ''
        ].filter(Boolean).join('\n');
        if (pageText.trim()) {
          await handleEjectPipeline({ text: pageText, source: 'context-menu-page' }, { tab });
        }
      } catch (e) {
        console.warn('[DANMAN] EJECT page extract failed:', e);
      }
      break;
    }

    case 'gpd-speed-scrape':
      openSidebarTab('scrape');
      setTimeout(function() {
        chrome.tabs.sendMessage(tab.id, { type: 'DO_SCRAPE_PAGE' }).catch(function() {});
      }, 400);
      break;

    case 'gpd-ask-danman':
      // Open DANMAN chat tab and send the selected text as a question
      openSidebarTab('danman');
      setTimeout(function() {
        chrome.tabs.sendMessage(tab.id, {
          type: 'DANMAN_ASK_SELECTION',
          payload: { text: info.selectionText, sourceUrl: tab.url || '' }
        }).catch(function() {});
      }, 500);
      break;

    case 'gpd-send-to-sheets':
      // Open Sheets tab and pass selected text for sending
      openSidebarTab('sheets');
      setTimeout(function() {
        chrome.tabs.sendMessage(tab.id, {
          type: 'SHEETS_SEND_SELECTION',
          payload: { text: info.selectionText, sourceUrl: tab.url || '' }
        }).catch(function() {});
      }, 500);
      break;

    case 'gpd-screenshot':
      try {
        var dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
        await chrome.storage.local.set({
          danman_screenshot: {
            dataUrl: dataUrl,
            timestamp: new Date().toISOString(),
            url: tab.url || ''
          }
        });
        openSidebarTab('danman');
      } catch (ssErr) {
        console.error('[DANMAN] Screenshot from context menu failed:', ssErr);
      }
      break;

    case 'gpd-clipboard':
      openSidebarTab('clipboard');
      break;

    case 'gpd-open-sheets':
      // Open the configured Google Sheet — use canonical config (not legacy gpd_config)
      try {
        var sheetCfg = await ConfigManager.load();
        var sheetId = (sheetCfg.sheets && sheetCfg.sheets.spreadsheet_id) ||
          (sheetCfg.setup && sheetCfg.setup.spreadsheet_id) ||
          (sheetCfg.memory && sheetCfg.memory.spreadsheet_id) || '';
        if (typeof GPD_GoogleIds !== 'undefined' && GPD_GoogleIds.extractSpreadsheetId) {
          sheetId = GPD_GoogleIds.extractSpreadsheetId(sheetId);
        }
        if (sheetId) {
          chrome.tabs.create({ url: 'https://docs.google.com/spreadsheets/d/' + sheetId + '/edit' });
        } else {
          chrome.runtime.openOptionsPage();
        }
      } catch (e) {
        chrome.tabs.create({ url: 'https://sheets.google.com' });
      }
      break;

    case 'gpd-open-drive':
      // Open the configured Drive folder in a new tab — canonical config
      // first (memory.folder_id is THE memory-folder property), legacy raw
      // storage keys only as a fallback for old installs.
      try {
        var driveCfg = await ConfigManager.load();
        var driveFolderId = driveCfg.memory?.folder_id || driveCfg.memory?.drive_folder_id || driveCfg.sheets?.drive_folder_id || '';
        if (!driveFolderId) {
          var driveResult = await chrome.storage.local.get(['drive_folder_id', 'gpd_config']);
          driveFolderId = (driveResult && driveResult.drive_folder_id) || '';
          if (!driveFolderId && driveResult.gpd_config) {
            driveFolderId = driveResult.gpd_config.drive_folder_id || driveResult.gpd_config.backend_folder_id || '';
          }
        }
        if (driveFolderId) {
          chrome.tabs.create({ url: 'https://drive.google.com/drive/folders/' + driveFolderId });
        } else {
          chrome.tabs.create({ url: 'https://drive.google.com' });
        }
      } catch (e) {
        chrome.tabs.create({ url: 'https://drive.google.com' });
      }
      break;

    case 'gpd-open-settings':
      chrome.runtime.openOptionsPage();
      break;
  }
});

// ============================================================
// KEYBOARD COMMANDS
// ============================================================

chrome.commands.onCommand.addListener(async (command) => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs[0] || !tabs[0].id) return;

  switch (command) {
    case 'toggle-sidebar':
      await sendMessageToTab(tabs[0].id, { type: 'TOGGLE_SIDEBAR' });
      break;
    case 'toggle-eject':
      await sendMessageToTab(tabs[0].id, { type: 'TOGGLE_SIDEBAR', payload: { tab: 'eject' } });
      break;
  }
});

// ============================================================
// HANDLER IMPLEMENTATIONS
// ============================================================

// --- Scraping ---
async function handleScrapePage(payload, sender) {
  await Logger.log('SCRAPE_START', `Scraping page`, { url: payload.url });
  // Forward to content script to do the actual DOM scraping
  if (sender.tab) {
    chrome.tabs.sendMessage(sender.tab.id, { type: 'DO_SCRAPE_PAGE' });
  }
  return { status: 'scraping' };
}

async function handleScrapeResult(payload) {
  await Logger.log('SCRAPE_COMPLETE', `Page scraped: ${payload.title}`, {
    url: payload.url, wordCount: payload.wordCount
  });
  await Storage.saveScrapeResult(Logger.sessionId, payload);
  logToWebhook('scrape_complete', {
    url: payload.url, title: payload.title, word_count: payload.wordCount
  });
  return { status: 'saved', sessionId: Logger.sessionId };
}

// --- Links ---
async function handleExtractLinks(payload, sender) {
  await Logger.log('LINKS_START', 'Extracting links');
  if (sender.tab) {
    chrome.tabs.sendMessage(sender.tab.id, { type: 'DO_EXTRACT_LINKS' });
  }
  return { status: 'extracting' };
}

async function handleLinksResult(payload) {
  await Logger.log('LINKS_COMPLETE', `${payload.links?.length || 0} links extracted`, {
    total: payload.links?.length, internal: payload.internalCount, external: payload.externalCount
  });
  await Storage.setData(`gpd_links_${Logger.sessionId}`, payload);
  logToWebhook('links_extracted', {
    total_links: payload.links?.length || 0,
    internal: payload.internalCount, external: payload.externalCount
  });
  return { status: 'saved' };
}

// --- Forms ---
async function handleScanForms(payload, sender) {
  await Logger.log('FORMS_START', 'Scanning forms');
  if (sender.tab) {
    chrome.tabs.sendMessage(sender.tab.id, { type: 'DO_SCAN_FORMS' });
  }
  return { status: 'scanning' };
}

async function handleFormsResult(payload) {
  await Logger.log('FORMS_COMPLETE', `${payload.forms?.length || 0} forms found`, {
    formCount: payload.forms?.length, totalFields: payload.totalFields
  });
  await Storage.setData(`gpd_forms_${Logger.sessionId}`, payload);
  logToWebhook('forms_scanned', {
    form_count: payload.forms?.length || 0, total_fields: payload.totalFields || 0
  });
  return { status: 'saved' };
}

async function handleSaveTemplate(payload) {
  const config = await ConfigManager.load();
  config.autofill_templates[payload.domain] = payload.template;
  await ConfigManager.save(config);
  await Logger.log('TEMPLATE_SAVED', `Template saved for ${payload.domain}`);
  logToWebhook('template_saved', {
    domain: payload.domain,
    field_count: payload.template?.fields?.length || 0
  });
  return { status: 'saved' };
}

async function handleLoadTemplate(payload) {
  const config = await ConfigManager.load();
  const template = config.autofill_templates[payload.domain] || null;
  return { template, domain: payload.domain };
}

async function handleGetTemplates() {
  const config = await ConfigManager.load();
  return { templates: config.autofill_templates };
}

// --- DANMAN Chat ---
const DANMAN_SYSTEM_PROMPT = `You are DANMAN (Data And Numbers Metrics And Networks), an AI assistant built into the GetPower DANMAN browser extension.

PERSONALITY:
- Professional but approachable. You're a data specialist who knows the HVAC industry inside out.
- Direct and concise. Lead with the answer, then explain if needed.
- Occasionally witty — a well-placed observation, never forced jokes.
- Sometimes refer to yourself in third person: "DANMAN's got you covered."

CAPABILITIES:
- You have access to the current page's scraped data, extracted links, and form fields.
- You can help analyze data, suggest patterns, and assist with HVAC case management.
- When the user mentions spreadsheet operations, help them structure the data.
- You understand Carrier Enterprise workflows, equipment types, serial numbers, and warranty processes.

STYLE:
- Use data to back up suggestions
- Offer next steps proactively
- Keep responses focused and practical
- If you don't know something, say so directly
- Format responses with markdown when helpful (bold, lists, code blocks)`;

async function handleDanmanChat(payload) {
  // Workbench-style payloads (system + messages[]) from Studio / Triage tabs
  if (payload && Array.isArray(payload.messages) && !payload.message) {
    const parts = [];
    if (payload.system) parts.push(String(payload.system));
    payload.messages.forEach(function (m) {
      const role = (m && m.role) || 'user';
      let text = '';
      if (typeof m.content === 'string') text = m.content;
      else if (Array.isArray(m.content)) {
        text = m.content.map(function (c) {
          if (!c) return '';
          if (typeof c === 'string') return c;
          if (c.type === 'text') return c.text || '';
          if (c.type === 'image') return '[image attached]';
          return '';
        }).join('\n');
      }
      parts.push(role.toUpperCase() + ': ' + text);
    });
    payload = Object.assign({}, payload, { message: parts.join('\n\n') });
  }
  const { message, includeContext = false, attachmentContext = '', bridgeRag = false } = payload;
  const sessionId = Logger.sessionId;

  // Bridge-RAG mode: route through the GrowTelliGence backend, which injects
  // its own vectorized memory context server-side (no client token spend on
  // re-pasted project context).
  if (bridgeRag) {
    const history = (await Storage.getChatHistory(sessionId)).slice(-20)
      .map((m) => ({ role: m.role, content: m.content }));
    const bridgeMessage = attachmentContext
      ? '[Attached files]\n' + attachmentContext + '\n\n' + message
      : message;
    await Logger.log('DANMAN_CHAT', `[bridge-rag] User: ${Utils.truncate(message, 100)}`);
    const gp = await DMS_GpBridge.chat({ message: bridgeMessage, history });
    const reply = (gp && (gp.content || gp.reply)) || '';
    await Storage.saveChatMessage(sessionId, { role: 'user', content: message });
    await Storage.saveChatMessage(sessionId, { role: 'assistant', content: reply });
    // Route the dialog + any attachments into the memory folder; usage → master sheet
    MemoryManager.appendChatLog(sessionId, message, reply, { model: gp.model || 'bridge-rag' }).catch(() => {});
    if (attachmentContext) {
      MemoryManager.storeArtifact('upload', 'attachments-' + Date.now() + '.md', attachmentContext, 'text/markdown').catch(() => {});
    }
    try { MasterLog.append('CHAT_USAGE', 'bridge-rag chat', { model: gp.model || 'bridge', in_chars: bridgeMessage.length, out_chars: reply.length, rag: true }); } catch (_) {}
    return { success: true, response: reply, model: gp.model || 'bridge', usedContext: !!gp.usedContext };
  }

  // Build messages array
  const messages = [{ role: 'system', content: DANMAN_SYSTEM_PROMPT }];

  // Ingested attachment context (extracted client-side by the sidebar
  // ingest engine — transcripts, zip trees, file text)
  if (attachmentContext) {
    messages.push({ role: 'user', content: '[Attached files — extracted content]\n' + attachmentContext });
    messages.push({ role: 'assistant', content: 'Attachment content loaded. I will use it to answer.' });
  }

  // Inject memory context if enabled
  try {
    const memConfig = await ConfigManager.load();
    if (memConfig.memory?.enabled) {
      const memoryContext = await MemoryManager.buildMemoryContext();
      if (memoryContext && memoryContext.context) {
        // Override system prompt with memory-enhanced version
        let enhancedPrompt = DANMAN_SYSTEM_PROMPT;
        if (memoryContext.memoryConfig?.system_prompt_override) {
          enhancedPrompt = memoryContext.memoryConfig.system_prompt_override + '\n\n' + DANMAN_SYSTEM_PROMPT;
        }
        if (memoryContext.memoryConfig?.custom_instructions) {
          enhancedPrompt += '\n\nCUSTOM INSTRUCTIONS:\n' + memoryContext.memoryConfig.custom_instructions;
        }
        if (memoryContext.memoryConfig?.personality_notes) {
          enhancedPrompt += '\n\nPERSONALITY NOTES:\n' + memoryContext.memoryConfig.personality_notes;
        }
        messages[0] = { role: 'system', content: enhancedPrompt };
        
        // Add memory context as assistant knowledge
        if (memoryContext.context.trim()) {
          messages.push({ role: 'user', content: '[DANMAN MEMORY CONTEXT]\n' + memoryContext.context });
          messages.push({ role: 'assistant', content: 'Memory context loaded. I have access to the stored project knowledge and will use it in my responses.' });
        }
      }
    }
  } catch (memErr) {
    console.warn('[DANMAN] Memory context load failed (non-fatal):', memErr.message);
  }

  // Add page context if requested — extract LIVE from the active tab
  if (includeContext) {
    let contextParts = [];

    // Strategy 1: Live extraction via chrome.scripting (always fresh)
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]?.id) {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: () => {
            const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4')).map(h => h.tagName + ': ' + h.textContent.trim().slice(0, 150));
            const links = document.querySelectorAll('a[href]').length;
            const forms = document.querySelectorAll('form').length;
            const fields = document.querySelectorAll('input,select,textarea').length;
            const text = document.body?.innerText?.slice(0, 4000) || '';
            return {
              url: location.href, title: document.title,
              headings, linkCount: links, formCount: forms, fieldCount: fields,
              textPreview: text, wordCount: text.split(/\s+/).length
            };
          }
        });
        if (results?.[0]?.result) {
          const pg = results[0].result;
          contextParts.push(`CURRENT PAGE:\nURL: ${pg.url}\nTitle: ${pg.title}\nWord count: ${pg.wordCount}\nLinks: ${pg.linkCount}\nForms: ${pg.formCount} (${pg.fieldCount} fields)\nHeadings:\n${pg.headings.join('\n')}\n\nPage text (first 4000 chars):\n${pg.textPreview}`);
        }
      }
    } catch (e) {
      console.warn('[DANMAN] Live page extraction failed:', e.message);
    }

    // Strategy 2: Fallback to cached scrape data
    if (contextParts.length === 0) {
      const scrapeData = await Storage.getScrapeResults(sessionId);
      if (scrapeData?.length > 0) {
        const latest = scrapeData[scrapeData.length - 1];
        contextParts.push(`CACHED PAGE DATA:\nTitle: ${latest.title}\nURL: ${latest.url}\nWord count: ${latest.wordCount}`);
      }
    }

    // Strategy 3: Fallback to screenshot if available (for pages that block scripts)
    if (contextParts.length === 0) {
      try {
        const ssData = await chrome.storage.local.get('danman_screenshot');
        if (ssData.danman_screenshot && ssData.danman_screenshot.dataUrl) {
          const ss = ssData.danman_screenshot;
          contextParts.push(`SCREENSHOT AVAILABLE:\nURL: ${ss.url}\nCaptured at: ${ss.timestamp}\n[A screenshot of this page was captured via the toolbar. The user may be asking about what they see on screen.]`);
          // If the AI provider supports vision (Claude, OpenAI, Gemini all do), include the image
          const base64 = ss.dataUrl.replace(/^data:image\/png;base64,/, '');
          messages.push({
            role: 'user',
            content: [
              { type: 'text', text: 'Here is a screenshot of the page I am looking at. Please analyze what you see.' },
              { type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64 } }
            ]
          });
        }
      } catch (_) {}
    }

    if (contextParts.length > 0) {
      messages.push({
        role: 'user',
        content: `[Context from current page]\n${contextParts.join('\n\n')}`
      });
      messages.push({
        role: 'assistant',
        content: "Got it, I've analyzed the current page. What would you like to know?"
      });
    }
  }

  // Add chat history
  const history = await Storage.getChatHistory(sessionId);
  for (const msg of history.slice(-20)) { // Last 20 messages for context
    messages.push({ role: msg.role, content: msg.content });
  }

  // Add current message
  messages.push({ role: 'user', content: message });

  // Persona / system override from DANMAN multimodal UI
  if (payload && payload.systemOverride) {
    messages[0] = {
      role: 'system',
      content: String(payload.systemOverride) + '\n\n' + (messages[0] && messages[0].content ? messages[0].content : DANMAN_SYSTEM_PROMPT)
    };
  }

  // Call AI
  await Logger.log('DANMAN_CHAT', `User: ${Utils.truncate(message, 100)}`);
  
  // Respect memory config for max tokens
  const chatOptions = {};
  try {
    const memConfig = await ConfigManager.load();
    if (memConfig.memory?.enabled) {
      const memCfg = await MemoryManager.loadMemoryConfig();
      if (memCfg?.max_tokens) chatOptions.max_tokens = memCfg.max_tokens;
    }
  } catch (_) {}
  const response = await AIClient.chat(messages, chatOptions);

  // Save to history
  await Storage.saveChatMessage(sessionId, { role: 'user', content: message });
  await Storage.saveChatMessage(sessionId, { role: 'assistant', content: response });

  // Route the dialog + any attachments into the memory folder; usage → master sheet
  MemoryManager.appendChatLog(sessionId, message, response, {}).catch(() => {});
  if (attachmentContext) {
    MemoryManager.storeArtifact('upload', 'attachments-' + Date.now() + '.md', attachmentContext, 'text/markdown').catch(() => {});
  }
  try {
    MasterLog.append('CHAT_USAGE', 'local chat', {
      in_chars: message.length + (attachmentContext ? attachmentContext.length : 0),
      out_chars: (response || '').length,
      rag: false
    });
  } catch (_) {}

  await Logger.log('DANMAN_RESPONSE', `DANMAN: ${Utils.truncate(response, 100)}`);

  // Log AI usage to webhook for cost tracking
  const config = await ConfigManager.load();
  logToWebhook('ai_chat', {
    provider: config.ai_provider,
    model: config.ai_models?.[config.ai_provider],
    message_length: message.length,
    response_length: response.length,
    include_context: includeContext
  });

  return { response, sessionId };
}

async function handleDanmanGetHistory(payload) {
  const sessionId = payload?.sessionId || Logger.sessionId;
  return { history: await Storage.getChatHistory(sessionId) };
}

async function handleDanmanClearHistory(payload) {
  const sessionId = payload?.sessionId || Logger.sessionId;
  await Storage.setData(`gpd_chat_${sessionId}`, []);
  return { status: 'cleared' };
}

async function handleDanmanFormsChat(payload) {
  const { message, context } = payload;

  const formsContext = `[FORMS AUTOFILL CONTEXT]
Form fields: ${JSON.stringify(context.form_fields || [])}
Sheet headers: ${JSON.stringify(context.sheet_headers || [])}
Sample data (first 3 rows): ${JSON.stringify(context.sample_rows || [])}
Total rows: ${context.total_rows || 0}
Current mappings: ${JSON.stringify(context.column_mappings || {})}
User instructions: ${context.user_instructions || 'None'}

You are helping the user fill web forms from Google Sheets data. Analyze the form fields, sheet columns, and mappings. Suggest improvements, flag issues (type mismatches, missing required fields, data formatting needs), and answer questions about the autofill process.`;

  const messages = [
    { role: 'system', content: DANMAN_SYSTEM_PROMPT },
    { role: 'user', content: formsContext },
    { role: 'assistant', content: 'Got it. I can see the form fields, sheet data, and your current mappings. How can I help?' }
  ];

  const sessionId = Logger.sessionId;
  const history = await Storage.getChatHistory(sessionId);
  for (const msg of history.slice(-10)) {
    messages.push({ role: msg.role, content: msg.content });
  }

  messages.push({ role: 'user', content: message });

  const response = await AIClient.chat(messages);

  await Storage.saveChatMessage(sessionId, { role: 'user', content: message });
  await Storage.saveChatMessage(sessionId, { role: 'assistant', content: response });

  logToWebhook('ai_forms_chat', { message_length: message.length });

  return { response };
}

// --- Google Sheets ---
async function handleSheetsRead(payload) {
  const config = await ConfigManager.load();
  const { range } = payload;

  await Logger.log('SHEETS_READ', `Reading ${range}`);

  if (config.sheets.method === 'api') {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${config.sheets.spreadsheet_id}/values/${encodeURIComponent(range)}`;
    const headers = {};
    if (config.sheets.oauth_token) {
      headers['Authorization'] = `Bearer ${config.sheets.oauth_token}`;
    } else if (config.sheets.api_key) {
      // API key goes in query param
    }
    const apiKeyParam = config.sheets.api_key ? `?key=${config.sheets.api_key}` : '';
    const resp = await fetch(url + apiKeyParam, { headers });
    if (!resp.ok) throw new Error(`Sheets API error: ${resp.status}`);
    const data = await resp.json();
    return { values: data.values || [], range: data.range };
  } else {
    // Webhook method
    const resp = await fetch(config.sheets.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'read', range, spreadsheetId: config.sheets.spreadsheet_id })
    });
    if (!resp.ok) throw new Error(`Webhook error: ${resp.status}`);
    return resp.json();
  }
}

async function handleSheetsWrite(payload) {
  const config = await ConfigManager.load();
  const { range, values } = payload;

  await Logger.log('SHEETS_WRITE', `Writing to ${range}`, { rows: values?.length });

  // Write operations ALWAYS prefer webhook (API keys are read-only for Sheets)
  if (config.sheets.webhook_url) {
    const resp = await fetch(config.sheets.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'write', range, values, spreadsheetId: config.sheets.spreadsheet_id })
    });
    if (!resp.ok) throw new Error(`Webhook error: ${resp.status}`);
    return resp.json();
  }

  // Fallback: direct API only if OAuth token is available (API key alone cannot write)
  if (config.sheets.oauth_token) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${config.sheets.spreadsheet_id}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
    const resp = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.sheets.oauth_token}`
      },
      body: JSON.stringify({ range, values })
    });
    if (!resp.ok) throw new Error(`Sheets API error: ${resp.status}`);
    return resp.json();
  }

  throw new Error('No webhook URL or OAuth token configured. Write operations require a webhook or OAuth token — API keys are read-only.');
}

async function handleSheetsAppend(payload) {
  const config = await ConfigManager.load();
  const { values } = payload;
  const range = payload.range || config.sheets.append_range;

  await Logger.log('SHEETS_APPEND', `Appending to ${range}`, { rows: values?.length });

  // Write operations ALWAYS prefer webhook (API keys are read-only for Sheets)
  if (config.sheets.webhook_url) {
    const resp = await fetch(config.sheets.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'append', range, values, spreadsheetId: config.sheets.spreadsheet_id })
    });
    if (!resp.ok) throw new Error(`Webhook error: ${resp.status}`);
    return resp.json();
  }

  // Fallback: direct API only if OAuth token is available (API key alone cannot write)
  if (config.sheets.oauth_token) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${config.sheets.spreadsheet_id}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.sheets.oauth_token}`
      },
      body: JSON.stringify({ range, values })
    });
    if (!resp.ok) throw new Error(`Sheets API error: ${resp.status}`);
    return resp.json();
  }

  throw new Error('No webhook URL or OAuth token configured. Append operations require a webhook or OAuth token — API keys are read-only.');
}

async function handleSheetsList() {
  const config = await ConfigManager.load();

  if (config.sheets.method === 'api') {
    const apiKeyParam = config.sheets.api_key ? `?key=${config.sheets.api_key}` : '';
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${config.sheets.spreadsheet_id}${apiKeyParam}`;
    const headers = {};
    if (config.sheets.oauth_token) {
      headers['Authorization'] = `Bearer ${config.sheets.oauth_token}`;
    }
    const resp = await fetch(url, { headers });
    if (!resp.ok) throw new Error(`Sheets API error: ${resp.status}`);
    const data = await resp.json();
    return { sheets: data.sheets?.map(s => ({ title: s.properties.title, index: s.properties.index, rowCount: s.properties.gridProperties?.rowCount })) || [] };
  } else {
    const resp = await fetch(config.sheets.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'listSheets', spreadsheetId: config.sheets.spreadsheet_id })
    });
    if (!resp.ok) throw new Error(`Webhook error: ${resp.status}`);
    return resp.json();
  }
}

async function handleSheetsPreview(payload) {
  const config = await ConfigManager.load();
  const spreadsheetId = payload.spreadsheet_id || config.sheets.spreadsheet_id;
  const gid = payload.gid;
  const apiKey = config.sheets.api_key;
  const oauthToken = config.sheets.oauth_token;

  let sheetName = 'Sheet1';
  const metaUrl = 'https://sheets.googleapis.com/v4/spreadsheets/' + spreadsheetId +
    (apiKey ? '?key=' + apiKey : '');
  const headers = oauthToken ? { 'Authorization': 'Bearer ' + oauthToken } : {};
  const metaResp = await fetch(metaUrl, { headers });
  if (metaResp.ok) {
    const meta = await metaResp.json();
    if (gid) {
      const sheet = meta.sheets.find(s => String(s.properties.sheetId) === String(gid));
      if (sheet) sheetName = sheet.properties.title;
    } else if (meta.sheets && meta.sheets[0]) {
      sheetName = meta.sheets[0].properties.title;
    }
  }

  const range = sheetName + '!A1:Z3';
  const dataUrl = 'https://sheets.googleapis.com/v4/spreadsheets/' + spreadsheetId +
    '/values/' + encodeURIComponent(range) + (apiKey ? '?key=' + apiKey : '');
  const dataResp = await fetch(dataUrl, { headers });
  if (!dataResp.ok) throw new Error('Sheets preview error: ' + dataResp.status);
  const data = await dataResp.json();

  return {
    sheet_name: sheetName,
    headers: (data.values && data.values[0]) || [],
    sample_rows: (data.values && data.values.slice(1, 3)) || [],
    total_columns: (data.values && data.values[0] && data.values[0].length) || 0
  };
}

// --- Write Results to Google Sheet (via webhook) ---
async function handleWriteResults(payload) {
  const config = await ConfigManager.load();

  // Route through webhook if configured
  if (config.sheets.webhook_url) {
    const secret = config.sheets.webhook_secret || '';
    const body = {
      secret,
      action: 'write_results',
      result_type: payload.result_type || 'scrape',
      spreadsheet_id: payload.spreadsheet_id || config.sheets.spreadsheet_id || '',
      gid: payload.gid || '',
      source_url: payload.source_url || '',
      session_id: Logger.sessionId,
      data: payload.data || null,
      values: payload.values || null
    };

    const resp = await fetch(config.sheets.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!resp.ok) throw new Error('Webhook write_results error: ' + resp.status);
    const result = await resp.json();
    await Logger.log('WRITE_RESULTS', `Wrote ${result.rows_written || 0} rows to ${result.sheet_name || 'sheet'}`, {
      type: payload.result_type, sheet: result.sheet_name
    });
    return result;
  }

  // Fallback: direct Sheets API write
  if (!config.sheets.spreadsheet_id && !payload.spreadsheet_id) {
    throw new Error('No spreadsheet configured. Set a webhook URL or spreadsheet ID in Settings.');
  }

  const spreadsheetId = payload.spreadsheet_id || config.sheets.spreadsheet_id;
  const apiKey = config.sheets.api_key;
  const oauthToken = config.sheets.oauth_token;

  if (!apiKey && !oauthToken) {
    throw new Error('No Sheets API key or OAuth token configured');
  }

  // If values provided directly, append them
  if (payload.values && Array.isArray(payload.values)) {
    const sheetName = payload.sheet_name || payload.result_type || 'Results';
    const range = sheetName + '!A1';
    const headers = oauthToken ? { 'Authorization': 'Bearer ' + oauthToken } : {};
    const url = 'https://sheets.googleapis.com/v4/spreadsheets/' + spreadsheetId +
      '/values/' + encodeURIComponent(range) + ':append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS' +
      (apiKey ? '&key=' + apiKey : '');

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ values: payload.values })
    });

    if (!resp.ok) throw new Error('Sheets API append error: ' + resp.status);
    const data = await resp.json();
    await Logger.log('WRITE_RESULTS', `Appended ${payload.values.length} rows via API`, { type: payload.result_type });
    return { success: true, rows_written: payload.values.length, range: data.updates?.updatedRange || range };
  }

  throw new Error('No values provided for write_results');
}

// --- Log Config Changes to Webhook ---
async function handleLogConfigChange(payload) {
  const config = await ConfigManager.load();
  await Logger.log('CONFIG_CHANGE', payload.changes_summary || 'Settings updated', {
    section: payload.section,
    timestamp: payload.timestamp
  });

  // Also push to webhook for audit trail if configured
  if (config.sheets.webhook_url) {
    try {
      const secret = config.sheets?.webhook_secret || '';
      await fetch(config.sheets.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret,
          action: 'activity_log',
          event_type: 'config_change',
          section: payload.section,
          timestamp: payload.timestamp || new Date().toISOString(),
          session_id: Logger.sessionId,
          details: payload.changes_summary || ''
        })
      });
    } catch (_) {
      // Non-blocking
    }
  }
  return { logged: true };
}

// --- RAG Tree Crawler (Recursive Link Discovery up to 6 Degrees) ---
// Uses async background pattern: returns immediately, writes progress to
// chrome.storage.local so the options page can poll for updates.
// This prevents MV3 service worker timeout (30s message channel limit).

/** Poll handler — options page calls this to check crawl status */
async function handleCrawlTreeStatus() {
  const result = await chrome.storage.local.get('crawl_tree_state');
  return result.crawl_tree_state || { status: 'idle' };
}

async function handleCrawlTreeCommand(command) {
  await chrome.storage.local.set({ crawl_tree_command: { command, timestamp: Date.now() } });
  return { status: 'ok', command };
}

async function handleGetOpenTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    return {
      success: true,
      tabs: tabs.map(t => ({
        id: t.id,
        url: t.url || '',
        title: t.title || '',
        active: t.active,
        windowId: t.windowId,
        favIconUrl: t.favIconUrl || ''
      })).filter(t => t.url && !t.url.startsWith('about:') && !t.url.startsWith('moz-extension:') && !t.url.startsWith('chrome:'))
    };
  } catch (err) {
    console.error('[DANMAN] Get open tabs error:', err);
    return { success: false, tabs: [], error: err.message };
  }
}

async function handleGetActiveTabUrl() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs.length > 0 && tabs[0].url) {
      return { success: true, url: tabs[0].url, title: tabs[0].title || '' };
    }
    return { success: false, url: '', error: 'No active tab' };
  } catch (err) {
    console.error('[DANMAN] Get active tab URL error:', err);
    return { success: false, url: '', error: err.message };
  }
}

async function handleSheetsWebhook(payload) {
  const config = await ConfigManager.load();
  const webhookUrl = config.sheets?.webhook_url;
  const secret = config.sheets?.webhook_secret;
  if (!webhookUrl) return { success: false, error: 'No webhook configured' };

  try {
    const resp = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, secret })
    });
    return await resp.json();
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function handleBackendPost(payload) {
  const config = await ConfigManager.load();
  const webhookUrl = config.backend?.webhook_url;
  const secret = config.backend?.webhook_secret;
  if (!webhookUrl) return { success: false, error: 'Backend webhook not configured. Go to Settings > Integrations.' };

  try {
    const resp = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, secret })
    });
    const text = await resp.text();
    try { return JSON.parse(text); }
    catch (_) { return { success: false, error: 'Non-JSON response', raw: text.slice(0, 500) }; }
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function handleCaptureScreenshot(payload, sender) {
  const config = await ConfigManager.load();
  const firecrawlKey = config.api_keys?.firecrawl;
  const url = payload.url;

  if (firecrawlKey) {
    try {
      const resp = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + firecrawlKey
        },
        body: JSON.stringify({ url, formats: ['screenshot'], timeout: 30000 })
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.data?.screenshot) {
          return { success: true, base64: data.data.screenshot, method: 'firecrawl' };
        }
      }
    } catch (_) {}
  }

  try {
    const tabId = sender?.tab?.id || (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
    if (!tabId) return { success: false, error: 'No active tab' };
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png', quality: 100 });
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    return { success: true, base64, method: 'browser' };
  } catch (e) {
    return { success: false, error: 'Screenshot failed: ' + e.message };
  }
}

async function handleSaveSession(payload, sender) {
  const results = { steps: [] };
  try {
    let session;
    if (payload.spreadsheet_id) {
      session = { spreadsheet_id: payload.spreadsheet_id, folder_id: payload.folder_id };
    } else {
      session = await handleBackendPost({ action: 'init_session', url: payload.url, title: payload.title });
      if (!session.success) return session;
    }
    results.session = session;
    results.steps.push('init_session');

    if (payload.include_screenshot !== false) {
      const screenshot = await handleCaptureScreenshot({ url: payload.url }, sender);
      if (screenshot.success) {
        await handleBackendPost({
          action: 'save_screenshot',
          spreadsheet_id: session.spreadsheet_id,
          folder_id: session.folder_id,
          base64: screenshot.base64
        });
        results.steps.push('screenshot');
      }
    }

    if (payload.content_rows && payload.content_rows.length > 0) {
      await handleBackendPost({ action: 'write_content', spreadsheet_id: session.spreadsheet_id, rows: payload.content_rows });
      results.steps.push('content:' + payload.content_rows.length);
    }

    if (payload.link_rows && payload.link_rows.length > 0) {
      await handleBackendPost({ action: 'write_links', spreadsheet_id: session.spreadsheet_id, rows: payload.link_rows });
      results.steps.push('links:' + payload.link_rows.length);
    }

    if (payload.media_items && payload.media_items.length > 0) {
      await handleBackendPost({ action: 'write_media', spreadsheet_id: session.spreadsheet_id, folder_id: session.folder_id, media_items: payload.media_items });
      results.steps.push('media:' + payload.media_items.length);
    }

    if (payload.form_rows && payload.form_rows.length > 0) {
      await handleBackendPost({ action: 'write_forms', spreadsheet_id: session.spreadsheet_id, rows: payload.form_rows });
      results.steps.push('forms:' + payload.form_rows.length);
    }

    if (payload.raw_html) {
      await handleBackendPost({ action: 'write_raw_html', spreadsheet_id: session.spreadsheet_id, folder_id: session.folder_id, html: payload.raw_html });
      results.steps.push('raw_html');
    }

    await handleBackendPost({
      action: 'update_summary',
      spreadsheet_id: session.spreadsheet_id,
      updates: {
        'Title': payload.title || '',
        'Word Count': payload.word_count || '',
        'Links Count': (payload.link_rows || []).length,
        'Media Count': (payload.media_items || []).length,
        'Forms Count': (payload.form_rows || []).length,
        'Status': 'Complete'
      }
    });
    results.steps.push('summary_updated');
    results.success = true;
    return results;
  } catch (e) {
    results.success = false;
    results.error = e.message;
    return results;
  }
}

/** Start handler — kicks off the crawl in background, returns immediately */
async function handleCrawlTree(payload) {
  const config = await ConfigManager.load();
  const startUrl = payload.url;
  const maxDepth = Math.min(payload.depth || 3, 6);

  // Write initial state so options page knows we've started
  await chrome.storage.local.set({
    crawl_tree_state: {
      status: 'crawling',
      startUrl,
      maxDepth,
      pagesFound: 0,
      uniqueUrls: 0,
      currentUrl: startUrl,
      currentDepth: 0,
      tree: null,
      error: null,
      startedAt: Date.now()
    }
  });

  await chrome.storage.local.remove('crawl_tree_command');

  // Fire and forget — the actual crawl runs in the background
  // Each fetch keeps the service worker alive (active network requests prevent termination)
  _runCrawlTree(config, startUrl, maxDepth).catch(async (err) => {
    console.error('[DANMAN] Crawl tree error:', err);
    const state = (await chrome.storage.local.get('crawl_tree_state')).crawl_tree_state || {};
    state.status = 'error';
    state.error = err.message;
    await chrome.storage.local.set({ crawl_tree_state: state });
  });

  // Return immediately — options page will poll CRAWL_TREE_STATUS
  return { status: 'started', message: 'Crawl started. Poll CRAWL_TREE_STATUS for progress.' };
}

/** Internal: runs the actual crawl, updating chrome.storage.local as it goes */
async function _runCrawlTree(config, startUrl, maxDepth) {
  const delayMs = config.scraping?.delay_ms || 500;
  const timeout = config.scraping?.timeout_ms || 30000;
  // Global page ceiling (ported from OMEGA) — depth alone doesn't bound a
  // crawl on link-dense sites; 3 levels × 50 links/node is 125k fetches.
  const maxPages = config.scraping?.max_pages || 150;
  const firecrawlKey = config.api_keys?.firecrawl;
  const useFirecrawl = config.scraping?.scraper_provider === 'firecrawl' && firecrawlKey;

  await Logger.log('CRAWL_TREE', `Starting tree crawl: ${startUrl}, depth ${maxDepth}`);

  function normalizeUrl(u) {
    try { return u.split('#')[0].replace(/\/+$/, '').replace(/\?$/, ''); } catch(_) { return u; }
  }

  const visited = new Set();
  const tree = { url: startUrl, title: startUrl, children: [], depth: 0, status: 'pending' };
  let totalPages = 0;
  const crawlStartedAt = Date.now();

  /** Update storage with current progress (keeps worker alive + informs UI) */
  async function updateProgress(currentUrl, currentDepth) {
    await chrome.storage.local.set({
      crawl_tree_state: {
        status: 'crawling',
        startUrl,
        maxDepth,
        pagesFound: totalPages,
        uniqueUrls: visited.size,
        currentUrl,
        currentDepth,
        batchesWritten,
        pendingBatchSize: pendingBatch.length,
        batchSheetName,
        tree: null,
        error: null,
        startedAt: crawlStartedAt
      }
    });
  }

    async function checkCommand() {
      const data = await chrome.storage.local.get('crawl_tree_command');
      const cmd = data.crawl_tree_command;
      if (!cmd) return 'continue';

      if (cmd.command === 'cancel') {
        await chrome.storage.local.remove('crawl_tree_command');
        const currentState = (await chrome.storage.local.get('crawl_tree_state')).crawl_tree_state || {};
        currentState.status = 'cancelled';
        currentState.tree = tree;
        currentState.completedAt = new Date().toISOString();
        await chrome.storage.local.set({ crawl_tree_state: currentState });
        await flushBatch();
        return 'cancel';
      }

      if (cmd.command === 'pause') {
        const currentState = (await chrome.storage.local.get('crawl_tree_state')).crawl_tree_state || {};
        currentState.status = 'paused';
        await chrome.storage.local.set({ crawl_tree_state: currentState });

        while (true) {
          await new Promise(r => setTimeout(r, 1000));
          const check = await chrome.storage.local.get('crawl_tree_command');
          const next = check.crawl_tree_command;
          if (!next) continue;
          if (next.command === 'resume') {
            await chrome.storage.local.remove('crawl_tree_command');
            const resumeState = (await chrome.storage.local.get('crawl_tree_state')).crawl_tree_state || {};
            resumeState.status = 'crawling';
            await chrome.storage.local.set({ crawl_tree_state: resumeState });
            return 'continue';
          }
          if (next.command === 'cancel') {
            await chrome.storage.local.remove('crawl_tree_command');
            const cancelState = (await chrome.storage.local.get('crawl_tree_state')).crawl_tree_state || {};
            cancelState.status = 'cancelled';
            cancelState.tree = tree;
            cancelState.completedAt = new Date().toISOString();
            await chrome.storage.local.set({ crawl_tree_state: cancelState });
            await flushBatch();
            return 'cancel';
          }
        }
      }

      return 'continue';
    }

    // --- Batch writing state ---
    const pendingBatch = [];
    let batchSheetName = null;
    let batchesWritten = 0;
    const batchSize = config.scraping?.tree_batch_size || 25;

    async function createBatchSheet() {
      const domain = new URL(startUrl).hostname.replace(/^www\./, '');
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 16).replace('T', '_').replace(':', '');
      batchSheetName = ('Tree_' + domain + '_' + dateStr).slice(0, 100);
      await logToWebhook('tree_session_start', {
        sheet_name: batchSheetName,
        start_url: startUrl,
        max_depth: maxDepth,
        batch_size: batchSize
      });
    }

    async function flushBatch() {
      if (pendingBatch.length === 0 || !batchSheetName) return;
      const rows = pendingBatch.splice(0, pendingBatch.length);
      batchesWritten++;
      try {
        await logToWebhook('tree_batch', {
          sheet_name: batchSheetName,
          rows: rows,
          batch_number: batchesWritten
        });
      } catch (e) {
        console.error('[DANMAN] Batch write failed:', e);
        pendingBatch.unshift(...rows);
        batchesWritten--;
      }
    }

    function addToBatch(node, parentUrl) {
      pendingBatch.push([
        new Date().toISOString(),
        node.url,
        node.title || '',
        node.depth,
        parentUrl || '',
        node.status,
        node.linkCount || 0,
        node.error || ''
      ]);
    }

  /**
   * Fetch links from a single page.
   * Uses Firecrawl if available, otherwise fetches HTML and parses <a> tags.
   */
  async function fetchPageLinks(url) {
    try {
      if (useFirecrawl) {
        const resp = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${firecrawlKey}`
          },
          body: JSON.stringify({
            url,
            formats: ['links'],
            onlyMainContent: true,
            blockAds: true,
            timeout
          })
        });
        if (!resp.ok) throw new Error(`Firecrawl ${resp.status}`);
        const data = await resp.json();
        const title = data.data?.metadata?.title || url;
        const links = (data.data?.links || [])
          .filter(l => l && l.startsWith('http'))
          .filter(l => !l.match(/\.(jpg|jpeg|png|gif|svg|ico|css|js|woff|woff2|ttf|eot|mp4|mp3|zip|pdf)(\?|$)/i));
        return { title, links };
      }

      // ── Strategy 1: Direct fetch (works for same-origin, simple sites) ──
      let html = null;
      let strategy1Links = [];
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        const resp = await fetch(url, {
          signal: controller.signal,
          redirect: 'follow',
          headers: { 'User-Agent': config.scraping?.user_agent || 'DANMAN/2.0' }
        });
        clearTimeout(timer);
        if (resp.ok) {
          const contentType = resp.headers.get('content-type') || '';
          if (!contentType.includes('text/html')) return { title: url, links: [] };
          html = await resp.text();
          // Quick check: count <a href> tags (NOT <link href>) in raw HTML
          const quickCount = (html.match(/<a\s[^>]*href\s*=\s*["']https?:\/\//gi) || []).length;
          if (quickCount > 3) {
            strategy1Links = [quickCount]; // marker that Strategy 1 found real links
          }
        }
      } catch (_) { /* CORS or network error — fall through to Strategy 2 */ }

      // ── Strategy 2: Background tab + chrome.scripting (bypasses CORS) ──
      // Also runs when Strategy 1 got HTML but found few/no links (SPA sites)
      if (!html || strategy1Links.length === 0) {
        let tab = null;
        try {
          tab = await chrome.tabs.create({ url, active: false });
          await new Promise((resolve) => {
            const listener = (tabId, info) => {
              if (tabId === tab.id && info.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
              }
            };
            chrome.tabs.onUpdated.addListener(listener);
            setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); resolve(); }, Math.min(timeout, 15000));
          });

          const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              const anchors = Array.from(document.querySelectorAll('a[href]'));
              return {
                title: document.title,
                links: anchors.map(a => a.href).filter(h => h && h.startsWith('http'))
              };
            }
          });

          if (results && results[0] && results[0].result) {
            const r = results[0].result;
            try { await chrome.tabs.remove(tab.id); } catch(_) {}
            return {
              title: r.title || url,
              links: (r.links || [])
                .filter(l => !l.match(/\.(jpg|jpeg|png|gif|svg|ico|css|js|woff|woff2|ttf|eot|mp4|mp3|zip|pdf)(\?|$)/i))
                .map(l => normalizeUrl(l))
                .filter((l, i, arr) => arr.indexOf(l) === i)
            };
          }
        } catch (scriptErr) {
          // Strategy 2 failed — return partial error
          return { title: url, links: [], error: 'Tab scripting failed: ' + scriptErr.message };
        } finally {
          if (tab) { try { await chrome.tabs.remove(tab.id); } catch(_) {} }
        }
        return { title: url, links: [], error: 'Could not extract links from page' };
      }

      // ── Parse HTML from Strategy 1 ──
      const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : url;

      const linkRegex = /href\s*=\s*["']([^"'#]+)["']/gi;
      const rawLinks = [];
      let match;
      while ((match = linkRegex.exec(html)) !== null) {
        rawLinks.push(match[1]);
      }

      const base = new URL(url);
      const links = rawLinks
        .map(l => {
          try { return new URL(l, base).href; } catch (_) { return null; }
        })
        .filter(Boolean)
        .filter(l => l.startsWith('http'))
        .filter(l => !l.match(/\.(jpg|jpeg|png|gif|svg|ico|css|js|woff|woff2|ttf|eot|mp4|mp3|zip|pdf)(\?|$)/i))
        .map(l => normalizeUrl(l))
        .filter((l, i, arr) => arr.indexOf(l) === i);

      return { title, links };
    } catch (err) {
      return { title: url, links: [], error: err.message };
    }
  }

  /**
   * Recursively crawl from a node up to maxDepth.
   */
  async function crawlNode(node, depth, parentUrl = '') {
    const normUrl = normalizeUrl(node.url);
    if (depth > maxDepth || visited.has(normUrl) || visited.size >= maxPages) {
      node.status = visited.has(normUrl) ? 'already_visited'
        : (depth > maxDepth ? 'max_depth' : 'max_pages');
      addToBatch(node, parentUrl);
      if (pendingBatch.length >= batchSize) await flushBatch();
      return;
    }

    visited.add(normUrl);
    const cmd = await checkCommand();
    if (cmd === 'cancel') return;
    totalPages++;
    node.status = 'crawling';

    // Update progress — this also keeps the service worker alive
    await updateProgress(node.url, depth);

    const { title, links, error } = await fetchPageLinks(node.url);
    node.title = title || node.url;
    node.linkCount = links ? links.length : 0;

    if (error && (!links || links.length === 0)) {
      // Total failure — no links recovered at all
      node.status = 'error';
      node.error = error;
      addToBatch(node, parentUrl);
      if (pendingBatch.length >= batchSize) await flushBatch();
      return;
    }

    // Got links (possibly with a partial error)
    node.status = error ? 'partial' : 'done';
    if (error) node.error = error;
    addToBatch(node, parentUrl);
    if (pendingBatch.length >= batchSize) await flushBatch();

    const childLinks = links.filter(l => !visited.has(normalizeUrl(l)));
    const cappedLinks = childLinks.slice(0, 50);
    node.children = cappedLinks.map(l => ({
      url: l,
      title: l,
      children: [],
      depth: depth + 1,
      status: 'pending'
    }));

    if (depth < maxDepth) {
      for (const child of node.children) {
        const loopCmd = await checkCommand();
        if (loopCmd === 'cancel') return;
        if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
        await crawlNode(child, depth + 1, node.url);
      }
    }
  }

  await createBatchSheet();
  await crawlNode(tree, 0);
  await flushBatch(); // Flush any remaining rows

  await Logger.log('CRAWL_TREE', `Tree complete: ${totalPages} pages crawled, ${visited.size} unique URLs`, {
    startUrl, depth: maxDepth, pages: totalPages
  });

  // Write final state with full tree
  await chrome.storage.local.set({
    crawl_tree_state: {
      status: 'complete',
      startUrl,
      maxDepth,
      pagesFound: totalPages,
      uniqueUrls: visited.size,
      currentUrl: '',
      currentDepth: 0,
      tree,
      error: null,
      completedAt: Date.now()
    }
  });

  // Log to webhook
  logToWebhook('crawl_tree', {
    start_url: startUrl,
    depth: maxDepth,
    pages_crawled: totalPages,
    unique_urls: visited.size
  });
}

// --- EJECT Pipeline ---
// (Full EJECT implementation — ported from eject-core.js patterns)

const EJECT_SCHEMA = {
  contact_name:    { required: true,  maxLen: 120, weight: 15 },
  company_name:    { required: false, maxLen: 200, weight: 8 },
  account_name:    { required: false, maxLen: 100, weight: 8 },
  model_number:    { required: false, maxLen: 30,  weight: 8, pattern: /^[A-Za-z0-9\-\/]+$/ },
  serial_number:   { required: false, maxLen: 30,  weight: 8, pattern: /^\d{4}[A-Za-z]\d{5}$/ },
  phone_number:    { required: false, maxLen: 20,  weight: 8 },
  email_address:   { required: false, maxLen: 100, weight: 8, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  equipment_type:  { required: false, maxLen: 100, weight: 8 },
  issue_summary:   { required: false, maxLen: 500, weight: 8 },
  warranty_ref:    { required: false, maxLen: 50,  weight: 8 },
  branch_number:   { required: false, maxLen: 5,   weight: 8, pattern: /^\d{1,5}$/ },
  address:         { required: false, maxLen: 300, weight: 8 }
};

const SERIAL_FORMATS = [
  { pattern: /\b(\d{4}[A-Za-z]\d{5})\b/g, confidence: 0.95 },
  { pattern: /\b(\d)\s+(\d)\s+(\d)\s+(\d)\s+([A-Za-z])\s+(\d)\s+(\d)\s+(\d)\s+(\d)\s+(\d)\b/g, confidence: 0.90 },
  { pattern: /\b(\d{4})-([A-Za-z])-(\d{5})\b/g, confidence: 0.90 },
  { pattern: /\b(\d)_(\d)_(\d)_(\d)_([A-Za-z])_(\d)_(\d)_(\d)_(\d)_(\d)\b/g, confidence: 0.85 }
];

const EJECT_EXTRACTION_PROMPT = `Extract structured HVAC service data from this email. Return ONLY a JSON object with these fields:

{
  "extracted": {
    "contact_name": "person seeking help (REQUIRED)",
    "company_name": "company or customer name",
    "account_name": "business account name (max 5 words)",
    "model_number": "equipment model number",
    "serial_number": "equipment serial number (format: 1234V54321)",
    "phone_number": "contact phone",
    "email_address": "contact email",
    "equipment_type": "e.g. Furnace, AC, Heat Pump, Mini-Split",
    "issue_summary": "1-2 sentence problem description",
    "warranty_ref": "warranty or case reference number",
    "branch_number": "store/branch number",
    "address": "service address"
  },
  "confidence": {
    "contact_name": 0.0-1.0,
    ...each field gets a confidence score
  },
  "meta": {
    "total_fields_found": number,
    "avg_confidence": number,
    "extraction_notes": "any notes about the extraction"
  }
}

Confidence guidelines:
- 0.85+ (HIGH): Explicitly stated in the email
- 0.60-0.84 (MEDIUM): Strongly implied or partially visible
- 0.30-0.59 (LOW): Inferred or weak evidence
- 0.0: Not found

EMAIL TEXT:
`;

async function handleEjectPipeline(payload, sender) {
  const startTime = Date.now();
  const record = {
    id: Utils.uuid(),
    timestamp: Utils.now(),
    source: payload.source || {},
    rawText: payload.text || '',
    extracted: {},
    confidence: {},
    meta: {},
    examination: {},
    comparison: {},
    transfer: { targets: [], results: [] },
    pipeline_stage: 'INIT',
    ai_provider_used: ''
  };

  try {
    await Logger.log('EJECT_START', 'Pipeline started');

    // Stage 1: Email (already provided as text)
    record.pipeline_stage = 'EMAIL_CAPTURED';

    // Pre-extract serial numbers
    let preExtractedSerial = null;
    for (const fmt of SERIAL_FORMATS) {
      const match = record.rawText.match(fmt.pattern);
      if (match) {
        preExtractedSerial = { value: match[0].replace(/[\s_-]/g, ''), confidence: fmt.confidence };
        break;
      }
    }

    // Stage 2: Jsonify (AI extraction)
    record.pipeline_stage = 'JSONIFYING';
    const aiResponse = await AIClient.chat([
      { role: 'user', content: EJECT_EXTRACTION_PROMPT + record.rawText }
    ]);
    record.ai_provider_used = (await ConfigManager.get('ai_provider')) || 'unknown';

    // Parse AI response
    let parsed;
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(aiResponse);
    } catch (e) {
      throw new Error('Failed to parse AI extraction response');
    }

    record.extracted = parsed.extracted || {};
    record.confidence = parsed.confidence || {};
    record.meta = parsed.meta || {};

    // Override serial if pre-extracted with higher confidence
    if (preExtractedSerial && (!record.confidence.serial_number || record.confidence.serial_number < preExtractedSerial.confidence)) {
      record.extracted.serial_number = preExtractedSerial.value;
      record.confidence.serial_number = preExtractedSerial.confidence;
    }

    // Clean phone number
    if (record.extracted.phone_number) {
      record.extracted.phone_number = Utils.cleanPhone(record.extracted.phone_number);
    }

    record.pipeline_stage = 'JSONIFIED';
    await Logger.log('EJECT_JSONIFIED', 'AI extraction complete', { fields: Object.keys(record.extracted).length });

    // Stage 3: Examine (validation)
    record.pipeline_stage = 'EXAMINING';
    const examination = examineExtraction(record.extracted, record.confidence);
    record.examination = examination;
    record.pipeline_stage = 'EXAMINED';
    await Logger.log('EJECT_EXAMINED', `Score: ${examination.score}`, { passed: examination.passed });

    // Stage 4: Compare (cross-reference)
    const config = await ConfigManager.load();
    if (config.eject.auto_compare) {
      record.pipeline_stage = 'COMPARING';
      record.comparison = await compareExtraction(record.extracted, config);
      record.pipeline_stage = 'COMPARED';
      await Logger.log('EJECT_COMPARED', 'Comparison complete', { isDuplicate: record.comparison.is_duplicate });
    }

    // Stage 5: Transfer (auto clipboard if enabled)
    if (config.eject.auto_transfer_clipboard) {
      record.pipeline_stage = 'TRANSFERRING';
      const clipboardText = formatForClipboard(record);
      record.transfer.targets.push('clipboard_text');
      record.transfer.results.push({ target: 'clipboard_text', text: clipboardText, success: true });
    }

    record.pipeline_stage = 'COMPLETE';
    record.duration = Date.now() - startTime;

    await Storage.saveEjectRecord(record);
    await Logger.log('EJECT_COMPLETE', `Pipeline complete in ${Utils.formatDuration(record.duration)}`, {
      score: examination.score, fields: record.meta.total_fields_found
    });

    logToWebhook('eject_complete', {
      score: examination.score,
      fields_found: record.meta.total_fields_found,
      duration_ms: record.duration,
      source_url: record.source_url || ''
    });

    return { record, status: 'complete' };
  } catch (err) {
    record.pipeline_stage = 'ERROR';
    record.error = err.message;
    await Storage.saveEjectRecord(record);
    await Logger.log('EJECT_ERROR', err.message);
    throw err;
  }
}

function examineExtraction(extracted, confidence) {
  const errors = [];
  const warnings = [];
  let score = 0;
  let maxScore = 0;

  for (const [field, schema] of Object.entries(EJECT_SCHEMA)) {
    maxScore += schema.weight;
    const value = extracted[field];
    const conf = confidence[field] || 0;

    if (schema.required && !value) {
      errors.push(`Missing required field: ${field}`);
      continue;
    }
    if (!value) continue;

    // Validate
    if (schema.maxLen && value.length > schema.maxLen) {
      warnings.push(`${field} exceeds max length (${value.length}/${schema.maxLen})`);
    }
    if (schema.pattern && !schema.pattern.test(value)) {
      warnings.push(`${field} format mismatch`);
    }
    if (conf < 0.6) {
      warnings.push(`${field} has low confidence (${(conf * 100).toFixed(0)}%)`);
    }

    // Score
    let fieldScore = schema.weight;
    if (conf >= 0.85) fieldScore *= 1.0;
    else if (conf >= 0.60) fieldScore *= 0.7;
    else if (conf >= 0.30) fieldScore *= 0.4;
    else fieldScore *= 0.1;

    score += fieldScore;
  }

  // Contactability bonus
  if (extracted.phone_number || extracted.email_address) {
    score += 10;
    maxScore += 10;
  }

  const normalizedScore = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;

  return {
    errors,
    warnings,
    score: normalizedScore,
    passed: errors.length === 0 && normalizedScore >= 40,
    fieldCount: Object.keys(extracted).filter(k => extracted[k]).length,
    totalFields: Object.keys(EJECT_SCHEMA).length
  };
}

async function compareExtraction(extracted, config) {
  const result = { salesforce_matches: [], sheets_matches: [], is_duplicate: false };

  // Salesforce comparison
  if (config.salesforce.instance_url && config.salesforce.access_token) {
    try {
      const searchTerms = [];
      if (extracted.serial_number) searchTerms.push(extracted.serial_number);
      if (extracted.email_address) searchTerms.push(extracted.email_address);
      if (extracted.phone_number) {
        const digits = extracted.phone_number.replace(/\D/g, '');
        if (digits.length >= 7) searchTerms.push(digits.slice(-7));
      }

      for (const term of searchTerms) {
        const url = `${config.salesforce.instance_url}/services/data/v59.0/search/?q=${encodeURIComponent(`FIND {${term}} IN ALL FIELDS RETURNING Case(Id, CaseNumber, Subject), Contact(Id, Name, Email, Phone)`)}`;
        const resp = await fetch(url, {
          headers: { 'Authorization': `Bearer ${config.salesforce.access_token}` }
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data.searchRecords?.length > 0) {
            result.salesforce_matches.push(...data.searchRecords.map(r => ({
              type: r.attributes.type,
              id: r.Id,
              name: r.Name || r.CaseNumber || r.Subject,
              matchedOn: term
            })));
          }
        }
      }
      result.is_duplicate = result.salesforce_matches.some(m => m.type === 'Case' || m.type === 'Contact');
    } catch (e) {
      console.warn('[EJECT] Salesforce comparison failed:', e.message);
    }
  }

  // Sheets comparison
  if (config.sheets.spreadsheet_id && (config.sheets.api_key || config.sheets.oauth_token)) {
    try {
      const sheetsData = await handleSheetsRead({ range: config.sheets.range });
      if (sheetsData.values?.length > 0) {
        const rows = sheetsData.values;
        for (let i = 0; i < rows.length; i++) {
          const rowText = rows[i].join(' ').toLowerCase();
          if (extracted.serial_number && rowText.includes(extracted.serial_number.toLowerCase())) {
            result.sheets_matches.push({ row: i + 1, matchedOn: 'serial_number', values: rows[i] });
          }
          if (extracted.email_address && rowText.includes(extracted.email_address.toLowerCase())) {
            result.sheets_matches.push({ row: i + 1, matchedOn: 'email', values: rows[i] });
          }
        }
      }
    } catch (e) {
      console.warn('[EJECT] Sheets comparison failed:', e.message);
    }
  }

  return result;
}

function formatForClipboard(record) {
  const lines = ['=== EJECT Extraction ==='];
  const labels = {
    contact_name: 'Contact', company_name: 'Company', account_name: 'Account',
    model_number: 'Model #', serial_number: 'Serial #', phone_number: 'Phone',
    email_address: 'Email', equipment_type: 'Equipment', issue_summary: 'Issue',
    warranty_ref: 'Warranty Ref', branch_number: 'Branch #', address: 'Address'
  };
  for (const [key, label] of Object.entries(labels)) {
    if (record.extracted[key]) {
      const conf = record.confidence[key] || 0;
      const indicator = conf >= 0.85 ? '\u25CF' : conf >= 0.60 ? '\u25D0' : '\u25CB';
      lines.push(`${indicator} ${label}: ${record.extracted[key]}`);
    }
  }
  lines.push(`\nScore: ${record.examination.score}/100`);
  lines.push(`Provider: ${record.ai_provider_used}`);
  lines.push(`Time: ${record.timestamp}`);
  return lines.join('\n');
}

async function handleEjectScrapeEmail(sender) {
  if (!sender.tab) throw new Error('No tab context');
  // Send message to content script to detect and scrape email
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(sender.tab.id, { type: 'DO_SCRAPE_EMAIL' }, (response) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(response);
    });
  });
}

async function handleEjectJsonify(payload) {
  const aiResponse = await AIClient.chat([
    { role: 'user', content: EJECT_EXTRACTION_PROMPT + payload.text }
  ]);
  const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(aiResponse);
}

async function handleEjectExamine(payload) {
  return examineExtraction(payload.extracted, payload.confidence);
}

async function handleEjectCompare(payload) {
  const config = await ConfigManager.load();
  return compareExtraction(payload.extracted, config);
}

async function handleEjectTransfer(payload) {
  const { record, target } = payload;
  const config = await ConfigManager.load();

  switch (target) {
    case 'clipboard_text':
      return { text: formatForClipboard(record), success: true };

    case 'clipboard_json':
      return { text: JSON.stringify(record, null, 2), success: true };

    case 'salesforce': {
      if (!config.salesforce.instance_url || !config.salesforce.access_token) {
        throw new Error('Salesforce not configured');
      }
      const sfObject = config.salesforce.default_object || 'Case';
      const fieldMap = {
        Case: {
          Subject: record.extracted.issue_summary || 'EJECT Extraction',
          Description: record.rawText?.slice(0, 1000),
          ContactEmail: record.extracted.email_address,
          ContactPhone: record.extracted.phone_number
        },
        Contact: {
          LastName: record.extracted.contact_name?.split(' ').pop() || 'Unknown',
          FirstName: record.extracted.contact_name?.split(' ').slice(0, -1).join(' ') || '',
          Email: record.extracted.email_address,
          Phone: record.extracted.phone_number
        }
      };
      const body = fieldMap[sfObject] || fieldMap.Case;
      const resp = await fetch(
        `${config.salesforce.instance_url}/services/data/v59.0/sobjects/${sfObject}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.salesforce.access_token}`
          },
          body: JSON.stringify(body)
        }
      );
      if (!resp.ok) throw new Error(`Salesforce error: ${resp.status}`);
      const data = await resp.json();
      return { id: data.id, success: true, object: sfObject };
    }

    case 'sheets': {
      const row = [[
        Utils.now(), record.source?.provider || '', record.source?.subject || '',
        record.extracted.contact_name || '', record.extracted.company_name || '',
        record.extracted.account_name || '', record.extracted.model_number || '',
        record.extracted.serial_number || '', record.extracted.phone_number || '',
        record.extracted.email_address || '', record.extracted.equipment_type || '',
        record.extracted.issue_summary || '', record.extracted.warranty_ref || '',
        record.extracted.branch_number || '', record.extracted.address || '',
        `${record.examination.score}%`, record.ai_provider_used || ''
      ]];
      return handleSheetsAppend({ values: row });
    }

    default:
      throw new Error(`Unknown transfer target: ${target}`);
  }
}

async function handleEjectStats() {
  const history = await Storage.getEjectHistory();
  if (history.length === 0) {
    return { total: 0, successful: 0, avgConfidence: 0, avgScore: 0, providers: {} };
  }
  const successful = history.filter(r => r.pipeline_stage === 'COMPLETE').length;
  const scores = history.filter(r => r.examination?.score).map(r => r.examination.score);
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const providers = {};
  for (const r of history) {
    if (r.ai_provider_used) {
      providers[r.ai_provider_used] = (providers[r.ai_provider_used] || 0) + 1;
    }
  }
  return { total: history.length, successful, avgConfidence: 0, avgScore, providers };
}

// --- Quick Stats for Popup ---
async function handleGetQuickStats() {
  const logs = await Logger.getLogs({ session: Logger.sessionId });
  const scrapeCount = logs.filter(l => l.action === 'SCRAPE_COMPLETE').length;
  const linksCount = logs.filter(l => l.action === 'LINKS_COMPLETE').length;
  const formsCount = logs.filter(l => l.action === 'FORMS_COMPLETE').length;
  const ejectCount = logs.filter(l => l.action === 'EJECT_COMPLETE').length;
  const chatCount = logs.filter(l => l.action === 'DANMAN_CHAT').length;

  return {
    session: Logger.sessionId,
    scrapes: scrapeCount,
    links: linksCount,
    forms: formsCount,
    ejects: ejectCount,
    chats: chatCount
  };
}


// --- Google Drive ---
async function handleDriveCreateFile(payload) {
  await Logger.log('DRIVE_CREATE_FILE', `Creating ${payload.name}`);
  const result = await DriveClient.createFile(payload.name, payload.content, payload.mimeType, payload.folderId);
  logToWebhook('drive_file_created', { name: payload.name, file_id: result.id });
  return result;
}

async function handleDriveCreateFolder(payload) {
  await Logger.log('DRIVE_CREATE_FOLDER', `Creating folder ${payload.name}`);
  const result = await DriveClient.createFolder(payload.name, payload.parentFolderId);
  logToWebhook('drive_folder_created', { name: payload.name, folder_id: result.id });
  return result;
}

async function handleDriveListFiles(payload) {
  return DriveClient.listFiles(payload.folderId, payload.query);
}

async function handleDriveReadFile(payload) {
  return DriveClient.readFile(payload.fileId);
}

async function handleDriveSaveFormFields(payload) {
  await Logger.log('DRIVE_SAVE_FORM_FIELDS', `Saving form fields for ${payload.pageUrl}`);
  const result = await DriveClient.saveFormFieldsFile(payload.formData, payload.pageUrl, payload.folderId);
  // Also append hyperlink to the spreadsheet if configured
  try {
    const config = await ConfigManager.load();
    if (config.sheets.webhook_url || config.sheets.oauth_token) {
      const link = result.link || `https://drive.google.com/file/d/${result.id}/view`;
      const timestamp = new Date().toISOString();
      const row = [timestamp, payload.pageUrl, 'Form Fields', payload.formData?.length || 0, link, result.id];
      await handleSheetsAppend({ values: [row], range: 'Form_Fields!A1' });
    }
  } catch (e) {
    console.warn('[DANMAN] Failed to append form fields link to sheets:', e.message);
  }
  logToWebhook('form_fields_saved', { url: payload.pageUrl, file_id: result.id });
  return result;
}

async function handleDriveSaveJson(payload) {
  await Logger.log('DRIVE_SAVE_JSON', `Saving JSON: ${payload.filename}`);
  const result = await DriveClient.saveJsonFile(payload.data, payload.filename, payload.folderId);
  logToWebhook('json_saved', { filename: payload.filename, file_id: result.id });
  return result;
}

async function handleDriveSaveHtml(payload) {
  await Logger.log('DRIVE_SAVE_HTML', `Saving HTML: ${payload.filename}`);
  const result = await DriveClient.saveHtmlFile(payload.html, payload.filename, payload.folderId);
  logToWebhook('html_saved', { filename: payload.filename, file_id: result.id });
  return result;
}

// --- Setup Wizard ---
async function handleSetupRun(payload) {
  await Logger.log('SETUP_START', 'Running backend setup wizard');
  const result = await SetupWizard.runSetup(payload);
  if (result.success) {
    await Logger.log('SETUP_COMPLETE', 'Backend setup completed successfully', {
      spreadsheet_id: result.spreadsheet_id,
      drive_root_folder_id: result.drive_root_folder_id
    });
    logToWebhook('setup_complete', {
      spreadsheet_id: result.spreadsheet_id,
      drive_folder_id: result.drive_root_folder_id
    });
  } else {
    await Logger.log('SETUP_FAILED', `Setup failed: ${result.error}`);
  }
  return result;
}
// ============================================================
// CLIPBOARD MANAGER HANDLERS
// ============================================================

async function handleClipboardSave(payload) {
  try {
    // payload may be { state: {...} } or direct state object
    const stateToSave = payload.state || payload;
    await chrome.storage.local.set({ gpd_clipboard_state: { state: stateToSave } });
    refreshDanmanContextMenus().catch(() => {});
    return { success: true };
  } catch (err) {
    console.error('[DANMAN] Clipboard save error:', err);
    return { success: false, error: err.message };
  }
}

async function handleClipboardLoad() {
  try {
    const result = await chrome.storage.local.get('gpd_clipboard_state');
    const stored = result.gpd_clipboard_state || null;
    // Return in consistent format
    if (stored && stored.state) return stored;
    if (stored && stored.slots) return { state: stored };
    return stored;
  } catch (err) {
    console.error('[DANMAN] Clipboard load error:', err);
    return null;
  }
}

async function handleClipboardBroadcast(payload, sender) {
  try {
    // Save the state first
    const stateToSave = payload.state || payload;
    await chrome.storage.local.set({ gpd_clipboard_state: { state: stateToSave } });
    refreshDanmanContextMenus().catch(() => {});

    // Broadcast to ALL tabs (except the sender) so every sidebar instance stays in sync
    const tabs = await chrome.tabs.query({});
    const senderTabId = sender && sender.tab ? sender.tab.id : null;
    for (const tab of tabs) {
      if (tab.id !== senderTabId && tab.id) {
        try {
          await chrome.tabs.sendMessage(tab.id, {
            type: 'CLIPBOARD_SYNC_UPDATE',
            payload: { state: stateToSave }
          });
        } catch (_) {
          // Tab may not have content script loaded — skip silently
        }
      }
    }
    return { success: true };
  } catch (err) {
    console.error('[DANMAN] Clipboard broadcast error:', err);
    return { success: false, error: err.message };
  }
}

async function handleClipboardNewCapture(payload, sender) {
  try {
    // A content script captured a new clipboard item.
    // Load current state, cascade the new item in, save, and broadcast to all tabs.
    const result = await chrome.storage.local.get('gpd_clipboard_state');
    let stored = result.gpd_clipboard_state || null;
    let state = (stored && stored.state) ? stored.state : (stored && stored.slots ? stored : null);

    if (!state || !Array.isArray(state.slots) || state.slots.length === 0) {
      // Initialize empty state if nothing exists
      state = { slots: [] };
      for (let i = 1; i <= 20; i++) {
        const defaultHotkeys = ['Alt+1','Alt+2','Alt+3','Alt+4','Alt+5','Alt+6','Alt+7','Alt+8','Alt+9','Alt+0'];
        state.slots.push({
          id: i, content: '', contentType: 'text', timestamp: null,
          frozen: false, hotkey: i <= 10 ? defaultHotkeys[i - 1] : '', sourceUrl: ''
        });
      }
    }

    const newContent = payload.content;
    const newType = payload.contentType || 'text';
    const newUrl = payload.sourceUrl || '';

    if (!newContent) return { success: false, error: 'No content' };

    // Deduplicate — skip if slot 1 already has this exact content
    if (state.slots[0].content === newContent) return { success: true, deduplicated: true };

    // Cascade logic: gather unfrozen values, clear them, put new in slot 1, cascade rest down
    const cascadeValues = [];
    for (let i = 0; i < state.slots.length; i++) {
      if (!state.slots[i].frozen && state.slots[i].content) {
        cascadeValues.push({
          content: state.slots[i].content,
          contentType: state.slots[i].contentType,
          timestamp: state.slots[i].timestamp,
          sourceUrl: state.slots[i].sourceUrl || ''
        });
      }
    }

    for (let i = 0; i < state.slots.length; i++) {
      if (!state.slots[i].frozen) {
        state.slots[i].content = '';
        state.slots[i].contentType = 'text';
        state.slots[i].timestamp = null;
        state.slots[i].sourceUrl = '';
      }
    }

    state.slots[0].content = newContent;
    state.slots[0].contentType = newType;
    state.slots[0].timestamp = new Date().toISOString();
    state.slots[0].sourceUrl = newUrl;

    let valIdx = 0;
    for (let i = 1; i < state.slots.length && valIdx < cascadeValues.length; i++) {
      if (!state.slots[i].frozen) {
        state.slots[i].content = cascadeValues[valIdx].content;
        state.slots[i].contentType = cascadeValues[valIdx].contentType;
        state.slots[i].timestamp = cascadeValues[valIdx].timestamp;
        state.slots[i].sourceUrl = cascadeValues[valIdx].sourceUrl;
        valIdx++;
      }
    }

    // Save
    await chrome.storage.local.set({ gpd_clipboard_state: { state } });
    refreshDanmanContextMenus().catch(() => {});
    try {
      await handleClipboardEventLog({
        level: 'info',
        event: 'CAPTURE_OK',
        detail: 'Stored ' + newType + ' into slot 1',
        extra: {
          contentType: newType,
          via: payload && payload.via,
          chars: typeof newContent === 'string' ? newContent.length : 0,
          sourceUrl: newUrl
        }
      }, sender);
    } catch (_) {}

    // Broadcast to ALL tabs so every sidebar instance updates
    const tabs = await chrome.tabs.query({});
    const senderTabId = sender && sender.tab ? sender.tab.id : null;
    for (const tab of tabs) {
      if (tab.id) {
        try {
          await chrome.tabs.sendMessage(tab.id, {
            type: 'CLIPBOARD_SYNC_UPDATE',
            payload: { state }
          });
        } catch (_) {
          // silent
        }
      }
    }

    return { success: true };
  } catch (err) {
    console.error('[DANMAN] Clipboard new capture error:', err);
    try {
      await handleClipboardEventLog({
        level: 'error',
        event: 'CAPTURE_FAIL',
        detail: err.message || String(err),
        extra: { contentType: payload && payload.contentType, via: payload && payload.via }
      }, sender);
    } catch (_) {}
    return { success: false, error: err.message };
  }
}

async function handleClipboardEventLog(payload, sender) {
  try {
    const entry = {
      ts: Date.now(),
      iso: new Date().toISOString(),
      level: (payload && payload.level) || 'info',
      event: (payload && payload.event) || 'CLIPBOARD',
      detail: String((payload && payload.detail) || '').slice(0, 1000),
      extra: Object.assign({
        tabId: sender && sender.tab ? sender.tab.id : null,
        tabUrl: sender && sender.tab ? sender.tab.url : ''
      }, (payload && payload.extra) || {})
    };
    const stored = await chrome.storage.local.get('gpd_clipboard_event_log');
    const log = Array.isArray(stored.gpd_clipboard_event_log) ? stored.gpd_clipboard_event_log : [];
    log.push(entry);
    while (log.length > 300) log.shift();
    await chrome.storage.local.set({ gpd_clipboard_event_log: log });
    try {
      MasterLog.append('CLIPBOARD_' + entry.event, entry.detail, entry.extra);
    } catch (_) {}
    if (entry.level === 'error' || entry.level === 'warn') {
      console.warn('[DANMAN Clipboard]', entry.event, entry.detail, entry.extra);
    }
    return { success: true };
  } catch (err) {
    console.error('[DANMAN] Clipboard event log failed:', err);
    return { success: false, error: err.message };
  }
}

async function handleClipboardGetEventLog(payload) {
  const stored = await chrome.storage.local.get('gpd_clipboard_event_log');
  const log = Array.isArray(stored.gpd_clipboard_event_log) ? stored.gpd_clipboard_event_log : [];
  const limit = (payload && payload.limit) || 50;
  return { success: true, events: log.slice(-limit).reverse() };
}

async function handleClipboardForcePoll(payload, sender) {
  const tabId = sender && sender.tab && sender.tab.id;
  const reason = (payload && payload.reason) || 'force-poll';
  // Ask the active / sender tab to poll; also broadcast to all tabs as fallback
  const results = [];
  try {
    if (tabId) {
      try {
        const r = await chrome.tabs.sendMessage(tabId, { type: 'CLIPBOARD_FORCE_POLL', payload: { reason: reason } });
        results.push({ tabId: tabId, result: r });
      } catch (e) {
        results.push({ tabId: tabId, error: e.message });
      }
    } else {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      for (const tab of tabs) {
        if (!tab.id) continue;
        try {
          const r = await chrome.tabs.sendMessage(tab.id, { type: 'CLIPBOARD_FORCE_POLL', payload: { reason: reason } });
          results.push({ tabId: tab.id, result: r });
        } catch (e) {
          results.push({ tabId: tab.id, error: e.message });
        }
      }
    }
  } catch (err) {
    await handleClipboardEventLog({
      level: 'error',
      event: 'FORCE_POLL_FAIL',
      detail: err.message || String(err),
      extra: { reason: reason }
    }, sender);
    return { success: false, error: err.message };
  }
  await handleClipboardEventLog({
    level: 'info',
    event: 'FORCE_POLL',
    detail: 'Forced clipboard poll (' + reason + ')',
    extra: { reason: reason, results: results }
  }, sender);
  return { success: true, results: results };
}

async function handleElevenLabsTts(payload) {
  try {
    const cfg = await ConfigManager.load();
    const apiKey = (payload && payload.apiKey) || (cfg.api_keys && cfg.api_keys.elevenlabs) || '';
    const voiceId = (payload && payload.voiceId) || (cfg.elevenlabs && cfg.elevenlabs.voice_id) ||
      (cfg.elevenlabs && cfg.elevenlabs.agent_id) || '21m00Tcm4TlvDq8ikWAM';
    const text = String((payload && payload.text) || '').slice(0, 2500);
    if (!apiKey) return { success: false, error: 'ElevenLabs API key missing — add it in Options / DANMAN settings' };
    if (!text) return { success: false, error: 'No text to speak' };
    const resp = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + encodeURIComponent(voiceId), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
        Accept: 'audio/mpeg'
      },
      body: JSON.stringify({
        text: text,
        model_id: (cfg.elevenlabs && cfg.elevenlabs.model_id) || 'eleven_multilingual_v2'
      })
    });
    if (!resp.ok) {
      const errText = await resp.text();
      return { success: false, error: 'ElevenLabs ' + resp.status + ': ' + errText.slice(0, 200) };
    }
    const buf = await resp.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const b64 = btoa(binary);
    try { MasterLog.append('ELEVENLABS_TTS', 'TTS ' + text.length + ' chars', { voiceId: voiceId }); } catch (_) {}
    return { success: true, mime: 'audio/mpeg', dataBase64: b64 };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
}

async function handleDanmanPageWatchToggle(payload, sender) {
  const enabled = !!(payload && payload.enabled);
  await chrome.storage.local.set({
    gpd_page_watch: {
      enabled: enabled,
      updated: Date.now(),
      tabId: sender && sender.tab ? sender.tab.id : null
    }
  });
  try {
    MasterLog.append('PAGE_WATCH', enabled ? 'enabled' : 'disabled', {
      tabId: sender && sender.tab ? sender.tab.id : null
    });
  } catch (_) {}
  return { success: true, enabled: enabled };
}

/**
 * handleClipboardPasteToPage — Forward paste content to the active tab's content script
 * Called when user clicks paste in the sidebar. The sidebar writes content to the system
 * clipboard AND sends this message so the content script can auto-insert at the last
 * focused editable element.
 */
async function handleClipboardPasteToPage(payload) {
  try {
    let content = payload && payload.content;
    let contentType = (payload && payload.contentType) || 'text';
    if ((!content || content === '') && payload && typeof payload.slotIndex === 'number') {
      const stored = await handleClipboardLoad();
      const state = (stored && stored.state) || stored;
      const slots = (state && state.slots) || [];
      const slot = slots[payload.slotIndex];
      if (!slot || !slot.content) return { success: false, error: 'Clipboard slot ' + (payload.slotIndex + 1) + ' is empty' };
      content = slot.content;
      contentType = slot.contentType || 'text';
    }
    if (!content) return { success: false, error: 'No content to paste' };

    // Find the active tab in the current window
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) {
      return { success: false, error: 'No active tab found' };
    }

    const activeTab = tabs[0];
    if (!activeTab.id) return { success: false, error: 'Active tab has no ID' };

    // Send to the content script in the active tab
    try {
      await chrome.tabs.sendMessage(activeTab.id, {
        type: 'CLIPBOARD_PASTE_CONTENT',
        payload: { content, contentType: contentType || 'text' }
      });
    } catch (tabErr) {
      // Content script may not be loaded — try injecting it first
      console.warn('[DANMAN] Paste sendMessage failed, attempting script injection:', tabErr.message);
      try {
        await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          files: ['content/clipboard-listener.js']
        });
        // Retry after injection
        await chrome.tabs.sendMessage(activeTab.id, {
          type: 'CLIPBOARD_PASTE_CONTENT',
          payload: { content, contentType: contentType || 'text' }
        });
      } catch (injectErr) {
        console.error('[DANMAN] Paste injection fallback failed:', injectErr.message);
        return { success: false, error: 'Could not reach content script: ' + injectErr.message };
      }
    }

    return { success: true };
  } catch (err) {
    console.error('[DANMAN] Clipboard paste to page error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * handleClipboardHotkeyPressed — Look up a hotkey combo in stored clipboard state
 * If a match is found, send the slot's content to the sender tab for auto-paste.
 * This allows arbitrary user-configured hotkey combos (up to 3 keys).
 */
async function handleClipboardHotkeyPressed(payload, sender) {
  try {
    const { combo } = payload || {};
    if (!combo) return { matched: false };

    // Load stored clipboard state to check hotkey mappings
    const result = await chrome.storage.local.get('gpd_clipboard_state');
    const stored = result.gpd_clipboard_state || null;
    const state = (stored && stored.state) ? stored.state : stored;

    if (!state || !Array.isArray(state.slots)) return { matched: false };

    // Find the slot whose hotkey matches this combo
    let matchedSlot = null;
    for (let i = 0; i < state.slots.length; i++) {
      const slot = state.slots[i];
      const hk = slot.hotkey || slot.hotkeyMap;
      if (hk && hk === combo && slot.content) {
        matchedSlot = slot;
        break;
      }
    }

    if (!matchedSlot) return { matched: false };

    // Found a match — send paste content back to the sender tab
    const senderTabId = sender && sender.tab ? sender.tab.id : null;
    if (senderTabId) {
      try {
        await chrome.tabs.sendMessage(senderTabId, {
          type: 'CLIPBOARD_PASTE_CONTENT',
          payload: {
            content: matchedSlot.content,
            contentType: matchedSlot.contentType || 'text'
          }
        });
      } catch (tabErr) {
        console.warn('[DANMAN] Hotkey paste to tab failed:', tabErr.message);
      }
    }

    return { matched: true, slotId: matchedSlot.id };
  } catch (err) {
    console.error('[DANMAN] Clipboard hotkey pressed error:', err);
    return { matched: false, error: err.message };
  }
}

// ============================================================
// CLIPBOARD NUMPAD MODE HANDLERS
// ============================================================

async function handleClipboardSetNumpadMode(payload) {
  try {
    const enabled = !!(payload && payload.enabled);
    await chrome.storage.local.set({ gpd_clipboard_numpad_mode: enabled });

    // Broadcast numpad mode to ALL tabs so content scripts know
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id) {
        try {
          await chrome.tabs.sendMessage(tab.id, {
            type: 'CLIPBOARD_NUMPAD_MODE_UPDATE',
            payload: { enabled }
          });
        } catch (_) {}
      }
    }

    return { success: true, enabled };
  } catch (err) {
    console.error('[DANMAN] Set numpad mode error:', err);
    return { success: false, error: err.message };
  }
}

async function handleClipboardGetNumpadMode() {
  try {
    const result = await chrome.storage.local.get('gpd_clipboard_numpad_mode');
    return { enabled: !!result.gpd_clipboard_numpad_mode };
  } catch (err) {
    console.error('[DANMAN] Get numpad mode error:', err);
    return { enabled: false };
  }
}

// ============================================================
// DRIVE TEST CONNECTION & MEDIA SAVE HANDLERS
// ============================================================

async function handleDriveTestConnection(payload) {
  try {
    const folderId = payload.folder_id;
    if (!folderId) return { success: false, error: 'No folder ID provided' };

    // Save the folder ID to config
    const config = await ConfigManager.load();
    config.backend = config.backend || {};
    config.backend.master_folder_id = folderId;
    await ConfigManager.save(config);

    // Test by listing files in the folder
    if (typeof DriveClient !== 'undefined' && DriveClient.testConnection) {
      const result = await DriveClient.testConnection();
      return result;
    }

    // Fallback: try listing via webhook
    const webhookUrl = config.sheets?.webhook_url;
    if (webhookUrl) {
      const resp = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: config.sheets?.webhook_secret || '',
          action: 'drive_list',
          folder_id: folderId,
          max_results: 1
        })
      });
      if (resp.ok) {
        return { success: true, message: 'Drive folder accessible via webhook' };
      }
      return { success: false, error: 'Webhook returned error' };
    }

    return { success: false, error: 'No Drive access method configured' };
  } catch (err) {
    console.error('[DANMAN] Drive test connection error:', err);
    return { success: false, error: err.message };
  }
}

async function handleDriveSaveMedia(payload) {
  try {
    const { url, data, mimeType, fileName, sessionFolder, targetSubfolder } = payload;
    const config = await ConfigManager.load();
    const rootId = config.backend?.master_folder_id;
    if (!rootId) return { success: false, error: 'No Drive folder configured' };

    let scrapesId = rootId;
    if (typeof DriveClient !== 'undefined' && DriveClient.getOrCreateFolder) {
      const subfolderName = targetSubfolder || 'Scrapes';
      const subFolder = await DriveClient.getOrCreateFolder(subfolderName, rootId);
      scrapesId = subFolder?.id || rootId;

      // Create session subfolder with URL + timestamp (Scrapes only)
      if (sessionFolder && subfolderName === 'Scrapes') {
        const sessionFolderObj = await DriveClient.getOrCreateFolder(sessionFolder, scrapesId);
        scrapesId = sessionFolderObj?.id || scrapesId;
      }
    }

    // Upload the media file
    if (typeof DriveClient !== 'undefined' && DriveClient.createFile) {
      const result = await DriveClient.createFile({
        name: fileName,
        content: data,
        mimeType: mimeType || 'application/octet-stream',
        folderId: scrapesId
      });
      await Logger.log('DRIVE_MEDIA_SAVED', `Saved media: ${fileName}`, { url, mimeType });
      logToWebhook('media_saved', { fileName, url, mimeType });
      return { success: true, fileId: result?.id, fileName };
    }

    return { success: false, error: 'DriveClient not available' };
  } catch (err) {
    console.error('[DANMAN] Drive save media error:', err);
    return { success: false, error: err.message };
  }
}

// ════════════════════════════════════════════════════════════════════
//   PHASE 5 — OCR + Macro + Element-picker handlers
// ════════════════════════════════════════════════════════════════════

// ─── Popout windows (DANMAN V008 chat + clipboard viewer) ───
// Firefox: no "windows" manifest permission — browser.windows works with "tabs" only.
const GpdBrowser = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;
const danmanPopoutRef = { windowId: null, tabId: null };
const clipboardPopoutRef = { windowId: null, tabId: null };
let clipboardPopoutPinned = false;

async function focusPopoutRef(ref) {
  if (ref.windowId != null && GpdBrowser.windows) {
    try {
      await GpdBrowser.windows.update(ref.windowId, { focused: true });
      return true;
    } catch (_) {
      ref.windowId = null;
    }
  }
  if (ref.tabId != null && GpdBrowser.tabs) {
    try {
      const tab = await GpdBrowser.tabs.get(ref.tabId);
      if (tab && tab.windowId != null && GpdBrowser.windows) {
        await GpdBrowser.windows.update(tab.windowId, { focused: true });
      }
      await GpdBrowser.tabs.update(ref.tabId, { active: true });
      return true;
    } catch (_) {
      ref.tabId = null;
      ref.windowId = null;
    }
  }
  return false;
}

async function closePopoutRef(ref) {
  if (ref.windowId != null && GpdBrowser.windows) {
    try { await GpdBrowser.windows.remove(ref.windowId); } catch (_) {}
  }
  ref.windowId = null;
  if (ref.tabId != null && GpdBrowser.tabs) {
    try { await GpdBrowser.tabs.remove(ref.tabId); } catch (_) {}
  }
  ref.tabId = null;
}

async function openExtensionPopout(path, ref, size) {
  if (await focusPopoutRef(ref)) return { ok: true, reused: true };

  ref.windowId = null;
  ref.tabId = null;
  const url = GpdBrowser.runtime.getURL(path);
  const width = (size && size.width) || 520;
  const height = (size && size.height) || 720;

  if (GpdBrowser.windows && GpdBrowser.windows.create) {
    try {
      const win = await GpdBrowser.windows.create({
        url,
        type: 'popup',
        width,
        height,
        focused: true
      });
      ref.windowId = win.id;
      if (win.tabs && win.tabs[0]) ref.tabId = win.tabs[0].id;
      return { ok: true, windowId: win.id, tabId: ref.tabId };
    } catch (e) {
      console.warn('[DANMAN] windows.create failed, opening in tab:', e.message);
    }
  }

  const tab = await GpdBrowser.tabs.create({ url, active: true });
  ref.tabId = tab.id;
  ref.windowId = tab.windowId != null ? tab.windowId : null;
  return { ok: true, tabId: tab.id, windowId: ref.windowId, fallbackTab: true };
}

function clearPopoutRefIfWindowClosed(windowId) {
  if (danmanPopoutRef.windowId === windowId) {
    danmanPopoutRef.windowId = null;
    danmanPopoutRef.tabId = null;
  }
  if (clipboardPopoutRef.windowId === windowId) {
    clipboardPopoutRef.windowId = null;
    clipboardPopoutRef.tabId = null;
  }
}

function clearPopoutRefIfTabClosed(tabId) {
  if (danmanPopoutRef.tabId === tabId) {
    danmanPopoutRef.tabId = null;
    danmanPopoutRef.windowId = null;
  }
  if (clipboardPopoutRef.tabId === tabId) {
    clipboardPopoutRef.tabId = null;
    clipboardPopoutRef.windowId = null;
  }
}

function normalizeOcrResult(raw, opts) {
  if (!raw) return null;
  opts = opts || {};
  if (raw.fullText !== undefined || (raw.pages && raw.pages.length)) {
    const pages = raw.pages || [];
    if (!raw.fullText && pages.length) {
      raw.fullText = pages.map((p) => p.text || p.fullText || '').filter(Boolean).join('\n\n');
    }
    if (!raw.entities && self.DMS_OCREngine && self.DMS_OCREngine.extractEntities) {
      raw.entities = self.DMS_OCREngine.extractEntities(raw.fullText || '');
    }
    return raw;
  }
  const text = raw.text || raw.fullText || raw.extractedText || raw.ocrText || '';
  const pages = Array.isArray(raw.pages) && raw.pages.length
    ? raw.pages.map((p, i) => ({
        index: p.index != null ? p.index : i,
        text: p.text || p.fullText || '',
        source: p.source || raw.source || 'gcp'
      }))
    : [{ index: 0, text, source: raw.source || 'gcp' }];
  const fullText = text || pages.map((p) => p.text || '').join('\n\n');
  return {
    id: raw.id || ('ocr_' + Date.now()),
    sourceName: opts.sourceName || raw.sourceName || 'document',
    pages,
    fullText,
    entities: raw.entities || (self.DMS_OCREngine ? self.DMS_OCREngine.extractEntities(fullText) : {}),
    errors: raw.errors || [],
    model: raw.model || opts.model || '',
    createdAt: raw.createdAt || new Date().toISOString()
  };
}

async function handleHealthCheck(sender) {
  const result = { worker: true, storage: false, scripts: 'warning', api: 'warning' };
  try {
    await chrome.storage.local.set({ _health_ping: Date.now() });
    const got = await chrome.storage.local.get('_health_ping');
    result.storage = !!got._health_ping;
  } catch (_) {
    result.storage = false;
  }
  try {
    const config = await ConfigManager.load();
    const hasAi = !!(config.api_keys?.claude || config.api_keys?.openai || config.api_keys?.gemini);
    const hasWebhook = !!(config.backend?.webhook_url || config.sheets?.webhook_url);
    result.api = hasAi || hasWebhook ? 'ok' : 'warning';
  } catch (_) {
    result.api = false;
  }
  try {
    if (sender?.tab?.id) {
      await chrome.tabs.sendMessage(sender.tab.id, { type: 'HEALTH_PING' });
      result.scripts = 'ok';
    } else {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]?.id) {
        await chrome.tabs.sendMessage(tabs[0].id, { type: 'HEALTH_PING' });
        result.scripts = 'ok';
      } else {
        result.scripts = 'warning';
      }
    }
  } catch (_) {
    result.scripts = 'warning';
  }
  return result;
}

/** List open tabs across all windows (http/https only) for the tab pickers. */
async function handleTabsList() {
  const tabs = await chrome.tabs.query({});
  return {
    tabs: tabs
      .filter((t) => /^https?:/i.test(t.url || ''))
      .map((t) => ({ id: t.id, title: t.title || t.url, url: t.url, favIconUrl: t.favIconUrl || '', active: !!t.active, windowId: t.windowId }))
  };
}

/** Grab a tab's full HTML (Google Forms converter feeds this to the parser —
 *  works for unpublished/edit forms because the user's session renders them). */
async function handleGrabTabHtml(payload) {
  const tabId = payload.tabId;
  if (!tabId) throw new Error('No tabId');
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => ({
      html: document.documentElement.outerHTML,
      url: location.href,
      title: document.title
    })
  });
  const r = results && results[0] && results[0].result;
  if (!r || !r.html) throw new Error('Could not read the tab (is it still open?)');
  return r;
}

/**
 * RIP_TAB — extract EVERYTHING from one tab into a rag/ job folder:
 * page.html, styles.css (same-origin rules + fetched cross-origin sheets),
 * page.json (structured content), widgets.json (every button/input/select/
 * iframe/video with a selector), plus media files (capped). Appends a row
 * with the Drive folder link to the master sheet's RAG_JOBS tab.
 */
async function handleRipTab(payload) {
  const tabId = payload.tabId;
  const includeMedia = payload.includeMedia !== false;
  const mediaMax = Math.min(payload.mediaMax || 30, 60);
  const mediaMaxBytes = Math.min(payload.mediaMaxBytes || 2 * 1024 * 1024, 8 * 1024 * 1024);
  if (!tabId) throw new Error('No tabId');

  const tab = await chrome.tabs.get(tabId);
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const abs = (u) => { try { return new URL(u, location.href).href; } catch (_) { return ''; } };
      const css = [];
      const cssLinks = [];
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          const rules = Array.from(sheet.cssRules || []).map((r) => r.cssText).join('\n');
          if (rules) css.push('/* ' + (sheet.href || 'inline') + ' */\n' + rules);
        } catch (_) {
          if (sheet.href) cssLinks.push(sheet.href);
        }
      }
      const selFor = (el) => {
        if (el.id) return el.tagName.toLowerCase() + '#' + el.id;
        let s = el.tagName.toLowerCase();
        if (el.name) return s + '[name="' + el.name + '"]';
        if (el.className && typeof el.className === 'string') {
          const c = el.className.trim().split(/\s+/).slice(0, 2).join('.');
          if (c) s += '.' + c;
        }
        return s;
      };
      const widgets = Array.from(document.querySelectorAll(
        'button, input, select, textarea, [role="button"], a[class*="btn"], iframe, video, audio, form'
      )).slice(0, 400).map((el) => ({
        tag: el.tagName.toLowerCase(),
        type: el.type || el.getAttribute('role') || '',
        id: el.id || '',
        name: el.name || '',
        label: (el.labels && el.labels[0] && el.labels[0].textContent || el.textContent || el.placeholder || el.title || el.src || '').trim().slice(0, 80),
        selector: selFor(el)
      }));
      const mediaUrls = [];
      document.querySelectorAll('img[src], video[src], video[poster], source[src], link[rel*="icon"]').forEach((el) => {
        ['src', 'poster', 'href'].forEach((a) => {
          const v = el.getAttribute && el.getAttribute(a);
          if (v) { const u = abs(v); if (u && !u.startsWith('data:')) mediaUrls.push(u); }
        });
      });
      const og = document.querySelector('meta[property="og:image"]');
      if (og && og.content) mediaUrls.push(abs(og.content));
      const tables = Array.from(document.querySelectorAll('table')).slice(0, 10).map((tbl) =>
        Array.from(tbl.querySelectorAll('tr')).slice(0, 50).map((tr) =>
          Array.from(tr.querySelectorAll('td,th')).map((c) => c.textContent.trim().slice(0, 200))
        )
      );
      return {
        html: document.documentElement.outerHTML,
        css: css.join('\n\n'),
        cssLinks: Array.from(new Set(cssLinks)).slice(0, 10),
        widgets,
        mediaUrls: Array.from(new Set(mediaUrls)).slice(0, 100),
        pageJson: {
          title: document.title,
          url: location.href,
          description: (document.querySelector('meta[name="description"]') || {}).content || '',
          headings: Array.from(document.querySelectorAll('h1,h2,h3')).slice(0, 60).map((h) => h.tagName + ': ' + h.textContent.trim().slice(0, 150)),
          linkCount: document.querySelectorAll('a[href]').length,
          imageCount: document.querySelectorAll('img').length,
          tables,
          bodyText: (document.body && document.body.innerText || '').slice(0, 30000)
        }
      };
    }
  });
  const rip = results && results[0] && results[0].result;
  if (!rip) throw new Error('Extraction script returned nothing — the tab may block scripts');

  // Cross-origin stylesheets: fetch the text from the background (host perms)
  let extCss = '';
  for (const href of rip.cssLinks) {
    try {
      const r = await fetch(href);
      const t = (await r.text()).slice(0, 200000);
      extCss += '\n\n/* fetched: ' + href + ' */\n' + t;
    } catch (_) { extCss += '\n\n/* unavailable: ' + href + ' */'; }
  }

  const host = (() => { try { return new URL(tab.url).hostname.replace(/^www\./, ''); } catch (_) { return 'page'; } })();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const job = await MemoryManager.createRagJobFolder('rip-' + host + '-' + stamp);

  const files = [];
  async function put(name, content, mime, opts) {
    const f = await DriveClient.createFile(name, content, mime, job.id, opts || {});
    files.push(name);
    return f;
  }
  await put('page.html', rip.html, 'text/html');
  await put('styles.css', (rip.css || '') + extCss, 'text/css');
  await put('page.json', JSON.stringify(rip.pageJson, null, 2), 'application/json');
  await put('widgets.json', JSON.stringify(rip.widgets, null, 2), 'application/json');

  // Media — capped fetches, base64 upload via the existing multipart path
  const skipped = [];
  let mediaCount = 0;
  if (includeMedia) {
    for (const url of rip.mediaUrls) {
      if (mediaCount >= mediaMax) { skipped.push(url + ' (cap reached)'); continue; }
      try {
        const r = await fetch(url);
        const buf = await r.arrayBuffer();
        if (buf.byteLength > mediaMaxBytes) { skipped.push(url + ' (too large)'); continue; }
        const bytes = new Uint8Array(buf);
        let bin = '';
        const CHUNK = 0x8000;
        for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
        const b64 = btoa(bin);
        const mime = r.headers.get('content-type') || 'application/octet-stream';
        const base = (url.split('/').pop() || 'media').split('?')[0].slice(0, 60) || 'media';
        await put(String(mediaCount + 1).padStart(2, '0') + '-' + base, b64, mime.split(';')[0], { contentEncoding: 'base64' });
        mediaCount++;
      } catch (e) {
        skipped.push(url + ' (' + (e.message || 'fetch failed') + ')');
      }
    }
  }

  // Job list row on the master sheet (best-effort) + audit trail
  try {
    await handleSheetsAppend({
      range: 'RAG_JOBS!A:G',
      values: [[new Date().toISOString(), tab.title || '', tab.url || '', job.link, files.length, mediaCount, skipped.length]]
    });
  } catch (e) {
    console.warn('[DANMAN] RAG_JOBS append failed (non-fatal):', e.message);
  }
  try { MasterLog.append('RAG_RIP', (tab.title || tab.url || '').slice(0, 120), { folder_id: job.id, files: files.length, media: mediaCount, url: tab.url }); } catch (_) {}
  await Logger.log('RAG_RIP', `Ripped ${tab.url} → ${files.length} files`, { folder: job.id });

  return { success: true, folderId: job.id, folderLink: job.link, files, mediaCount, skipped };
}

/**
 * Import config from the master sheet's CONFIG tab (key/value rows).
 * Column A = dot-path key (e.g. "ai_provider", "memory.folder_id",
 * "api_keys.claude"); column B = value (JSON parsed when it looks like
 * JSON/number/boolean, else taken as string). Merged into the one
 * canonical config every surface reads.
 */
async function handleConfigImportFromSheet(payload) {
  const range = (payload && payload.range) || 'CONFIG!A:B';
  const data = await handleSheetsRead({ range });
  const rows = (data && (data.values || data.data)) || [];
  if (!rows.length) return { success: false, error: 'CONFIG tab is empty or unreadable (' + range + ')' };

  const updates = {};
  let applied = 0;
  for (const row of rows) {
    const key = String(row[0] || '').trim();
    if (!key || key.toLowerCase() === 'key') continue; // skip blank/header
    let value = row.length > 1 ? row[1] : '';
    const s = String(value).trim();
    if (/^(true|false)$/i.test(s)) value = /^true$/i.test(s);
    else if (s !== '' && !isNaN(Number(s)) && !/^0[0-9]/.test(s)) value = Number(s);
    else if (/^[\[{]/.test(s)) { try { value = JSON.parse(s); } catch (_) { value = s; } }
    else value = s;
    // dot-path → nested object
    const parts = key.split('.');
    let node = updates;
    for (let i = 0; i < parts.length - 1; i++) {
      node[parts[i]] = node[parts[i]] || {};
      node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = value;
    applied++;
  }
  if (!applied) return { success: false, error: 'No key/value rows found in ' + range };
  await ConfigManager.updateConfig(updates);
  try { MasterLog.append('CONFIG_IMPORT_SHEET', applied + ' keys imported from ' + range, {}); } catch (_) {}
  // Re-initialize memory routing if the import changed the folder
  if (updates.memory && (updates.memory.folder_id || updates.memory.drive_folder_id)) {
    const fid = updates.memory.folder_id || updates.memory.drive_folder_id;
    try { await MemoryManager.initializeMemoryFolder(fid); } catch (_) {}
  }
  return { success: true, applied, keys: applied };
}

/**
 * Unified setup: given Webhook URL + Secret, pull Drive folder ID, Sheets ID,
 * API keys, gas UI URL, and other Script Properties from the backend.
 * Tries DANMAN Bridge get_config first, then legacy { action:'get_config' }.
 */
async function handleConfigSyncFromWebhook(payload) {
  const current = await ConfigManager.load();
  const webhookUrl = String(
    (payload && payload.webhook_url) ||
    current.backend?.webhook_url ||
    current.sheets?.webhook_url ||
    ''
  ).trim().split('?')[0];
  const secret = String(
    (payload && payload.webhook_secret) ||
    current.backend?.webhook_secret ||
    current.sheets?.webhook_secret ||
    ''
  );

  if (!webhookUrl) {
    return { success: false, error: 'Enter Webhook_URL first (Apps Script /exec deployment).' };
  }

  // Persist credentials immediately so other surfaces see them.
  await ConfigManager.updateConfig({
    backend: { webhook_url: webhookUrl, webhook_secret: secret },
    sheets: {
      webhook_url: webhookUrl,
      webhook_secret: secret,
      method: 'webhook'
    }
  });

  let payloadOut = null;
  let lastError = '';

  async function postJson(body) {
    const resp = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const text = await resp.text();
    try { return JSON.parse(text); }
    catch (_) { throw new Error('Non-JSON response from webhook (' + resp.status + '): ' + text.slice(0, 180)); }
  }

  // 1) Bridge protocol
  try {
    const bridge = await postJson({
      bridge: 'danman',
      secret: secret,
      action: 'get_config',
      args: {}
    });
    if (bridge && bridge.ok && bridge.result) {
      payloadOut = bridge.result;
    } else if (bridge && (bridge.success || bridge.config)) {
      payloadOut = bridge;
    } else {
      lastError = (bridge && bridge.error) || 'Bridge get_config returned no config';
    }
  } catch (e) {
    lastError = e.message || String(e);
  }

  // 2) Legacy webhook action
  if (!payloadOut) {
    try {
      const legacy = await postJson({ action: 'get_config', secret: secret });
      if (legacy && (legacy.success || legacy.ok || legacy.config || legacy.properties)) {
        payloadOut = legacy;
      } else {
        lastError = (legacy && legacy.error) || lastError || 'get_config failed';
      }
    } catch (e) {
      lastError = e.message || String(e);
    }
  }

  // 3) sync_config alias
  if (!payloadOut) {
    try {
      const alt = await postJson({
        bridge: 'danman',
        secret: secret,
        action: 'sync_config',
        args: {}
      });
      if (alt && alt.ok && alt.result) payloadOut = alt.result;
      else if (alt && (alt.success || alt.config)) payloadOut = alt;
    } catch (_) {}
  }

  if (!payloadOut) {
    return {
      success: false,
      error: (lastError || 'Could not sync from webhook') +
        '. Deploy Bridge_ConfigSync.gs (or add a get_config action) on the Apps Script backend.'
    };
  }

  const updates = mapWebhookConfigPayload_(payloadOut);
  // Keep the credentials the user just typed — never blank them from sync.
  updates.backend = Object.assign({}, updates.backend || {}, {
    webhook_url: webhookUrl,
    webhook_secret: secret
  });
  updates.sheets = Object.assign({}, updates.sheets || {}, {
    webhook_url: webhookUrl,
    webhook_secret: secret,
    method: 'webhook'
  });

  await ConfigManager.updateConfig(updates);

  const folderId = updates.memory?.folder_id || updates.memory?.drive_folder_id ||
    updates.backend?.master_folder_id || updates.sheets?.drive_folder_id || '';
  if (folderId) {
    try { await chrome.storage.local.set({ drive_folder_id: folderId }); } catch (_) {}
    try { await MemoryManager.initializeMemoryFolder(folderId); } catch (_) {}
  }

  try {
    MasterLog.append('CONFIG_SYNC_WEBHOOK', 'Synced from webhook', {
      spreadsheet: !!(updates.sheets && updates.sheets.spreadsheet_id),
      drive: !!folderId,
      keys: Object.keys(updates.api_keys || {}).filter(function (k) { return !!(updates.api_keys || {})[k]; })
    });
  } catch (_) {}

  const cfg = await ConfigManager.load();
  return {
    success: true,
    config: cfg,
    summary: {
      spreadsheet_id: cfg.sheets?.spreadsheet_id || '',
      drive_folder_id: cfg.memory?.folder_id || cfg.sheets?.drive_folder_id || cfg.backend?.master_folder_id || '',
      gas_ui_url: cfg.gas_ui?.url || '',
      api_keys: {
        claude: !!(cfg.api_keys && cfg.api_keys.claude),
        openai: !!(cfg.api_keys && cfg.api_keys.openai),
        gemini: !!(cfg.api_keys && cfg.api_keys.gemini),
        firecrawl: !!(cfg.api_keys && cfg.api_keys.firecrawl)
      }
    }
  };
}

function mapWebhookConfigPayload_(raw) {
  const root = raw.config || raw.result || raw;
  const props = raw.properties || root.properties || {};
  const updates = {};

  function pickProp() {
    for (let i = 0; i < arguments.length; i++) {
      const k = arguments[i];
      if (props[k] != null && String(props[k]).trim() !== '') return String(props[k]).trim();
      if (root[k] != null && typeof root[k] !== 'object' && String(root[k]).trim() !== '') {
        return String(root[k]).trim();
      }
    }
    return '';
  }

  if (root.sheets && typeof root.sheets === 'object') {
    updates.sheets = Object.assign({}, root.sheets);
  }
  if (root.backend && typeof root.backend === 'object') {
    updates.backend = Object.assign({}, root.backend);
  }
  if (root.memory && typeof root.memory === 'object') {
    updates.memory = Object.assign({}, root.memory);
  }
  if (root.setup && typeof root.setup === 'object') {
    updates.setup = Object.assign({}, root.setup);
  }
  if (root.gas_ui && typeof root.gas_ui === 'object') {
    updates.gas_ui = Object.assign({}, root.gas_ui);
  }
  if (root.api_keys && typeof root.api_keys === 'object') {
    updates.api_keys = Object.assign({}, root.api_keys);
  }
  if (root.salesforce && typeof root.salesforce === 'object') {
    updates.salesforce = Object.assign({}, root.salesforce);
  }
  if (root.ai_models && typeof root.ai_models === 'object') {
    updates.ai_models = Object.assign({}, root.ai_models);
  }
  if (root.ai_provider) updates.ai_provider = root.ai_provider;

  const spreadsheetId = pickProp(
    'SPREADSHEET_ID', 'SHEETS_ID', 'GOOGLE_SHEETS_ID', 'MASTER_SHEET_ID', 'spreadsheet_id'
  ) || raw.spreadsheet_id || '';
  const driveFolderId = pickProp(
    'DRIVE_FOLDER_ID', 'MASTER_FOLDER_ID', 'MEMORY_FOLDER_ID', 'drive_folder_id'
  ) || raw.drive_folder_id || '';
  const gasUiUrl = pickProp('GAS_UI_URL', 'HTML_APP_URL', 'COPILOT_UI_URL') || raw.gas_ui_url || '';
  const claudeKey = pickProp('CLAUDE_API_KEY', 'ANTHROPIC_API_KEY');
  const openaiKey = pickProp('OPENAI_API_KEY');
  const geminiKey = pickProp('GEMINI_API_KEY', 'GOOGLE_AI_API_KEY');
  const firecrawlKey = pickProp('FIRECRAWL_API_KEY');

  if (spreadsheetId) {
    updates.sheets = Object.assign({}, updates.sheets || {}, { spreadsheet_id: spreadsheetId });
    updates.setup = Object.assign({}, updates.setup || {}, { spreadsheet_id: spreadsheetId });
  }
  if (driveFolderId) {
    updates.sheets = Object.assign({}, updates.sheets || {}, { drive_folder_id: driveFolderId });
    updates.backend = Object.assign({}, updates.backend || {}, { master_folder_id: driveFolderId });
    updates.memory = Object.assign({}, updates.memory || {}, {
      folder_id: driveFolderId,
      drive_folder_id: driveFolderId,
      enabled: true
    });
    updates.setup = Object.assign({}, updates.setup || {}, {
      drive_root_folder_id: driveFolderId,
      completed: true
    });
  }
  if (gasUiUrl) {
    updates.gas_ui = Object.assign({}, updates.gas_ui || {}, { url: gasUiUrl });
  }

  const keys = Object.assign({}, updates.api_keys || {});
  if (claudeKey) keys.claude = claudeKey;
  if (openaiKey) keys.openai = openaiKey;
  if (geminiKey) keys.gemini = geminiKey;
  if (firecrawlKey) keys.firecrawl = firecrawlKey;
  if (Object.keys(keys).length) updates.api_keys = keys;

  // Strip empty nested leaves so deepMerge doesn't wipe existing secrets with ""
  Object.keys(updates).forEach(function (section) {
    const val = updates[section];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      Object.keys(val).forEach(function (k) {
        if (val[k] === '' || val[k] == null) delete val[k];
      });
      if (!Object.keys(val).length) delete updates[section];
    }
  });

  return updates;
}

async function handleMemoryInit(payload) {
  const folderId = (payload && (payload.folderId || payload.drive_folder_id)) || '';
  const spreadsheetId = payload && (payload.spreadsheet_id || payload.spreadsheetId);
  await logToWebhook('memory_init', { folder: folderId ? 'provided' : 'missing', spreadsheet: !!spreadsheetId });
  if (!folderId) return { success: false, error: 'No folder ID provided' };
  const mm = globalThis.MemoryManager;
  if (!mm || typeof mm.initializeMemoryFolder !== 'function') {
    return {
      success: false,
      error: 'MemoryManager.initializeMemoryFolder is not available — reload the extension (about:debugging → Reload)'
    };
  }
  try {
    const config = await ConfigManager.load();
    // Resolve the ACTUAL method DriveClient will use (auto-prefers a connected
    // Drive Bridge), not just the raw sheets.method.
    const method = await DriveClient._getMethod();
    if (method === 'api' && !config.sheets?.oauth_token && !config.google_oauth_token) {
      return {
        success: false,
        error: 'No way to reach Google Drive yet. Easiest fix: add Bridge_Drive.gs to a backend and Discover it in the Bridge tab (then a Folder ID alone works). Or paste a Google OAuth token in Settings → Integrations, or use Webhook mode.'
      };
    }
    const ok = await mm.initializeMemoryFolder(folderId);
    if (!ok) {
      const detail = mm._lastInitError || '';
      const hint = method === 'bridge'
        ? 'Drive Bridge call failed — check the profile Tests green in the Bridge tab and that Bridge_Drive.gs is deployed'
        : method === 'webhook'
          ? 'Webhook Drive init failed — the Web App URL is unreachable. Recommended: switch to the Drive Bridge (add Bridge_Drive.gs to a backend, Discover it in the Bridge tab)'
          : 'Drive API failed — refresh the OAuth token in Integrations, or switch to the Drive Bridge (Bridge tab)';
      return { success: false, error: detail ? `${hint}: ${detail}` : hint };
    }
    config.memory = config.memory || {};
    config.memory.drive_folder_id = folderId;
    config.memory.folder_id = folderId;
    config.memory.enabled = true;
    if (spreadsheetId) config.memory.spreadsheet_id = spreadsheetId;
    await ConfigManager.save(config);
    // Mirror to the legacy raw key so pre-7.3 surfaces stay in sync
    try { await chrome.storage.local.set({ drive_folder_id: folderId }); } catch (_) {}
    try { MasterLog.append('MEMORY_FOLDER', 'memory folder set + subfolders initialized', { folder_id: folderId }); } catch (_) {}
    await logToWebhook('memory_init_ok', { folderId });
    return { success: true };
  } catch (e) {
    await logToWebhook('memory_init_error', { error: e.message });
    return { success: false, error: e.message };
  }
}

async function openDanmanPopoutWindow() {
  const result = await openExtensionPopout('sidebar/danman-popout.html', danmanPopoutRef, { width: 520, height: 720 });
  await logToWebhook('danman_popout_open', { windowId: result.windowId, tabId: result.tabId });
  return result;
}

async function closeDanmanPopoutWindow() {
  await closePopoutRef(danmanPopoutRef);
  return { ok: true };
}

async function openClipboardPopoutWindow() {
  return openExtensionPopout('sidebar/clipboard-popout.html', clipboardPopoutRef, { width: 380, height: 560 });
}

async function closeClipboardPopoutWindow() {
  await closePopoutRef(clipboardPopoutRef);
  return { ok: true };
}

async function handleClipboardPopoutPin(payload) {
  clipboardPopoutPinned = !!(payload && payload.pinned);
  return { ok: true, pinned: clipboardPopoutPinned };
}

async function focusClipboardPopoutWindow() {
  if (clipboardPopoutRef.windowId == null && clipboardPopoutRef.tabId == null) return { ok: false };
  const ok = await focusPopoutRef(clipboardPopoutRef);
  return ok ? { ok: true } : { ok: false, error: 'Popout not available' };
}

if (GpdBrowser.windows && GpdBrowser.windows.onRemoved) {
  GpdBrowser.windows.onRemoved.addListener(clearPopoutRefIfWindowClosed);
}
if (GpdBrowser.tabs && GpdBrowser.tabs.onRemoved) {
  GpdBrowser.tabs.onRemoved.addListener(clearPopoutRefIfTabClosed);
}

// ─── OCR ───
async function handleGcpToolkitInvoke(payload) {
  try {
    if (!self.DMS_GCPToolkit) throw new Error('GCP toolkit not loaded');
    const tool = (payload && payload.tool) || 'vision_ocr';
    const fn = {
      vision_ocr: self.DMS_GCPToolkit.visionOcr,
      speech_to_text: self.DMS_GCPToolkit.speechToText,
      object_detection: self.DMS_GCPToolkit.objectDetect,
      memory_sync: self.DMS_GCPToolkit.memorySync,
      rag_index_url: self.DMS_GCPToolkit.ragIndexUrl
    }[tool];
    if (!fn) throw new Error('Unknown GCP tool: ' + tool);
    const data = await fn(payload && payload.payload);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function resolveOcrRunPayload(payload) {
  const base = Object.assign({}, payload || {});
  if (base.pages && base.pages.length) {
    delete base.sessionId;
    return base;
  }
  if (!base.sessionId) return base;
  const storageKey = 'ocr_run_pending_' + base.sessionId;
  let pending = null;
  try {
    if (chrome.storage.session && chrome.storage.session.get) {
      const sess = await chrome.storage.session.get(storageKey);
      pending = sess && sess[storageKey];
    }
  } catch (e) { /* fall through */ }
  if (!pending) {
    const local = await chrome.storage.local.get(storageKey);
    pending = local && local[storageKey];
  }
  if (!pending || !pending.pages || !pending.pages.length) {
    throw new Error('OCR pages not found in storage — reload the extension and try again');
  }
  base.pages = pending.pages;
  if (!base.sourceName && pending.sourceName) base.sourceName = pending.sourceName;
  delete base.sessionId;
  try {
    if (chrome.storage.session && chrome.storage.session.remove) await chrome.storage.session.remove(storageKey);
  } catch (e) {}
  try { await chrome.storage.local.remove(storageKey); } catch (e) {}
  return base;
}

async function handleOcrRun(payload) {
  try {
    const runPayload = await resolveOcrRunPayload(payload);
    const cfg = await ConfigManager.load();
    await logToWebhook('ocr_run', {
      pages: (runPayload.pages && runPayload.pages.length) || 0,
      model: runPayload.model,
      gcp: !!(cfg.gcp && cfg.gcp.vision_enabled)
    });
    if (cfg.gcp && cfg.gcp.vision_enabled && self.DMS_GCPToolkit) {
      try {
        const gcpResult = await self.DMS_GCPToolkit.visionOcr({
          pages: (payload && payload.pages) || [],
          sourceName: payload && payload.sourceName,
          language: payload && payload.language
        });
        const normalized = normalizeOcrResult(gcpResult, payload || {});
        if (normalized && (normalized.fullText || '').trim()) {
          chrome.storage.local.set({ ocr_last_result: normalized });
          return { ok: true, data: normalized, via: 'gcp' };
        }
        await logToWebhook('ocr_gcp_empty', { hint: 'falling back to AI OCR' });
      } catch (gcpErr) {
        await logToWebhook('ocr_gcp_error', { error: gcpErr.message });
      }
    }
    if (!self.DMS_OCREngine) throw new Error('OCR engine not loaded');
    const result = await self.DMS_OCREngine.run(runPayload);
    const normalized = normalizeOcrResult(result, runPayload);
    if (!normalized || !(normalized.fullText || '').trim()) {
      const errHint = (normalized && normalized.errors && normalized.errors.length)
        ? normalized.errors.map((e) => e.error).join('; ')
        : 'No text extracted — check API keys in Settings and try Claude or GPT model';
      return { ok: false, error: errHint, data: normalized };
    }
    chrome.storage.local.set({ ocr_last_result: normalized });
    return { ok: true, data: normalized };
  } catch (e) {
    if (self.DMS_Logger) self.DMS_Logger.error('OCR_RUN: ' + e.message);
    await logToWebhook('ocr_run_error', { error: e.message });
    return { ok: false, error: e.message };
  }
}

async function handleOcrExtractEntities(payload) {
  try {
    if (!self.DMS_OCREngine) throw new Error('OCR engine not loaded');
    const data = self.DMS_OCREngine.extractEntities((payload && payload.text) || '');
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function handleOcrExportSheets(payload) {
  // Phase 8 deliverable — for now return a not-implemented stub so the UI can wire to it
  // without runtime errors. Actual GAS bridge call lands when the OCR tab + Sheets handler land.
  return { ok: false, error: 'OCR Sheets export not wired yet (Phase 8)' };
}

// ─── Macros ───
function handleMacroList() {
  return new Promise((resolve) => {
    chrome.storage.local.get('macros', (r) => {
      const macros = (r && r.macros) || {};
      const list = Object.values(macros).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      resolve({ ok: true, data: list });
    });
  });
}

function handleMacroLoad(payload) {
  return new Promise((resolve) => {
    chrome.storage.local.get('macros', (r) => {
      const m = (r && r.macros && r.macros[payload && payload.id]) || null;
      if (!m) return resolve({ ok: false, error: 'Macro not found: ' + (payload && payload.id) });
      resolve({ ok: true, data: m });
    });
  });
}

function _padMacroVer(n) {
  return String(Math.max(0, n | 0)).padStart(3, '0');
}

function _countMacroStepDelta(prevSteps, nextSteps) {
  const a = prevSteps || [];
  const b = nextSteps || [];
  let delta = Math.abs(a.length - b.length);
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) delta++;
  }
  return delta;
}

function handleMacroSave(payload) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['macros', 'macro_versions'], (r) => {
      const macros = (r && r.macros) || {};
      const versions = (r && r.macro_versions) || {};
      const id = (payload && payload.id) || crypto.randomUUID();
      const now = new Date().toISOString();
      const prev = macros[id] || null;
      const nextSteps = (payload && Array.isArray(payload.steps)) ? payload.steps : [];
      const versionNum = (prev && prev.version) ? prev.version + 1 : 1;
      const rendition = payload && payload.rendition != null
        ? payload.rendition
        : _countMacroStepDelta(prev && prev.steps, nextSteps);
      const versionLabel = 'V' + _padMacroVer(versionNum) + 'R' + _padMacroVer(rendition);

      if (prev && payload && payload.versioned) {
        const hist = versions[id] || [];
        hist.push({
          version: prev.version || 1,
          rendition: prev.rendition || 0,
          versionLabel: prev.versionLabel || ('V' + _padMacroVer(prev.version || 1) + 'R' + _padMacroVer(prev.rendition || 0)),
          savedAt: prev.updatedAt || now,
          name: prev.name,
          steps: prev.steps,
          variables: prev.variables || {}
        });
        versions[id] = hist.slice(-30);
      }

      macros[id] = {
        id,
        name: (payload && payload.name) || 'Untitled',
        steps: nextSteps,
        variables: (payload && payload.variables) || {},
        createdAt: (prev && prev.createdAt) || now,
        updatedAt: now,
        runs: (prev && prev.runs) || 0,
        version: versionNum,
        rendition: rendition,
        versionLabel: versionLabel
      };
      chrome.storage.local.set({ macros, macro_versions: versions }, () => resolve({ ok: true, data: macros[id] }));
    });
  });
}

function handleMacroDelete(payload) {
  return new Promise((resolve) => {
    chrome.storage.local.get('macros', (r) => {
      const macros = (r && r.macros) || {};
      delete macros[payload && payload.id];
      chrome.storage.local.set({ macros }, () => resolve({ ok: true, data: { deleted: true } }));
    });
  });
}

async function handleMacroRun(payload) {
  try {
    if (!self.DMS_MacroEngine) throw new Error('Macro engine not loaded');
    payload = payload || {};
    if (!payload.id && !payload.workflow) {
      const last = await new Promise((res) => chrome.storage.local.get('gpd_last_macro_id', res));
      if (last && last.gpd_last_macro_id) payload.id = last.gpd_last_macro_id;
    }
    let workflow = payload.workflow;
    if (!workflow && payload.id) {
      const r = await new Promise(res => chrome.storage.local.get('macros', res));
      workflow = r.macros && r.macros[payload.id];
      if (!workflow) throw new Error('Macro not found: ' + payload.id);
    }
    if (!workflow) throw new Error('No workflow provided');
    if (self.DMS_Utils && typeof self.DMS_Utils.normalizeMacroWorkflow === 'function') {
      workflow = self.DMS_Utils.normalizeMacroWorkflow(workflow);
    }
    const macroId = payload.id || (workflow && workflow.id);
    if (macroId) await chrome.storage.local.set({ gpd_last_macro_id: macroId });
    const result = await self.DMS_MacroEngine.run(workflow, (payload && payload.options) || {});
    return { ok: true, data: result };
  } catch (e) {
    if (self.DMS_Logger) self.DMS_Logger.error('MACRO_RUN: ' + e.message);
    return { ok: false, error: e.message };
  }
}

function handleMacroPause()  { try { self.DMS_MacroEngine.pause();  return Promise.resolve({ok:true, data:{status:'paused'}});  } catch(e){ return Promise.resolve({ok:false, error:e.message}); } }
function handleMacroResume() { try { self.DMS_MacroEngine.resume(); return Promise.resolve({ok:true, data:{status:'running'}}); } catch(e){ return Promise.resolve({ok:false, error:e.message}); } }
function handleMacroStop()   { try { self.DMS_MacroEngine.stop();   return Promise.resolve({ok:true, data:{status:'stopped'}}); } catch(e){ return Promise.resolve({ok:false, error:e.message}); } }
function handleMacroSnapshot(){ try { return Promise.resolve({ok:true, data: self.DMS_MacroEngine.snapshot()}); } catch(e){ return Promise.resolve({ok:false, error:e.message}); } }

function handleMacroRecordStart(payload) {
  return new Promise((resolve) => {
    const sessionId = crypto.randomUUID();
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = (payload && payload.tabId) || (tabs[0] && tabs[0].id);
      chrome.storage.local.set({
        macro_recording_session: { sessionId, tabId, startedAt: new Date().toISOString(), steps: [] }
      }, () => resolve({ ok: true, data: { sessionId, tabId } }));
    });
  });
}

function handleMacroRecordStop(payload) {
  return new Promise((resolve) => {
    chrome.storage.local.get('macro_recording_session', (r) => {
      const s = (r && r.macro_recording_session) || null;
      if (!s) return resolve({ ok: false, error: 'No active recording session' });
      chrome.storage.local.remove('macro_recording_session', () => {
        resolve({ ok: true, data: { steps: s.steps || [] } });
      });
    });
  });
}

function handleMacroStudioRecordStart(payload) {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = (payload && payload.tabId) || (tabs[0] && tabs[0].id);
      if (!tabId) return resolve({ ok: false, error: 'No active tab' });
      chrome.tabs.sendMessage(tabId, { type: 'MACRO_RECORDER_START' }, (resp) => {
        const err = chrome.runtime.lastError;
        if (err) return resolve({ ok: false, error: err.message });
        resolve({ ok: true, data: resp || { recording: true } });
      });
    });
  });
}

function handleMacroStudioRecordStop(payload) {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = (payload && payload.tabId) || (tabs[0] && tabs[0].id);
      if (!tabId) return resolve({ ok: false, error: 'No active tab' });
      chrome.tabs.sendMessage(tabId, { type: 'MACRO_RECORDER_STOP' }, (resp) => {
        const err = chrome.runtime.lastError;
        if (err) return resolve({ ok: false, error: err.message });
        const steps = (resp && resp.steps) || [];
        resolve({ ok: true, data: { steps } });
      });
    });
  });
}

function handleDmsRecordingFinished(msg) {
  const steps = (msg && msg.steps) || [];
  try {
    chrome.runtime.sendMessage({ type: 'MACRO_RECORDING_FINISHED', steps }).catch(() => {});
  } catch (e) { /* swallow */ }
  return Promise.resolve({ ok: true, data: { steps } });
}

function handleDmsRecordingStep(msg) {
  const step = msg && msg.step;
  if (!step) return Promise.resolve({ ok: false, error: 'no step' });
  try {
    chrome.runtime.sendMessage({ type: 'MACRO_RECORDING_STEP', step }).catch(() => {});
  } catch (e) {}
  return Promise.resolve({ ok: true });
}

function handleDmsRecordingPaused(msg) {
  try {
    chrome.runtime.sendMessage({ type: 'MACRO_RECORDING_PAUSED', paused: !!(msg && msg.paused) }).catch(() => {});
  } catch (e) {}
  return Promise.resolve({ ok: true });
}

function handleMacroStudioRecordPause(payload) {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = (payload && payload.tabId) || (tabs[0] && tabs[0].id);
      if (!tabId) return resolve({ ok: false, error: 'No active tab' });
      chrome.tabs.sendMessage(tabId, { type: 'MACRO_RECORDER_PAUSE' }, (resp) => {
        const err = chrome.runtime.lastError;
        if (err) return resolve({ ok: false, error: err.message });
        resolve({ ok: true, data: resp || { paused: true } });
      });
    });
  });
}

function handleMacroStudioRecordResume(payload) {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = (payload && payload.tabId) || (tabs[0] && tabs[0].id);
      if (!tabId) return resolve({ ok: false, error: 'No active tab' });
      chrome.tabs.sendMessage(tabId, { type: 'MACRO_RECORDER_RESUME' }, (resp) => {
        const err = chrome.runtime.lastError;
        if (err) return resolve({ ok: false, error: err.message });
        resolve({ ok: true, data: resp || { paused: false } });
      });
    });
  });
}

const _activeScreenPickSessions = new Map(); // tabId -> { sessionId, stepType, coordMode }

function _endScreenPickOnTab(tabId, sessionId) {
  if (tabId == null) return;
  _activeScreenPickSessions.delete(tabId);
  chrome.tabs.sendMessage(tabId, { type: 'PICKER_DEACTIVATE' }, () => { chrome.runtime.lastError; });
  try {
    chrome.runtime.sendMessage({
      type: 'SCREEN_PICK_SESSION_ENDED',
      sessionId: sessionId || null,
      tabId: tabId
    }).catch(() => {});
  } catch (e) {}
}

function handleScreenPickStart(payload) {
  return new Promise((resolve) => {
    const sessionId = crypto.randomUUID();
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = (payload && payload.tabId) || (tabs[0] && tabs[0].id);
      if (!tabId) return resolve({ ok: false, error: 'No active tab' });
      const prev = _activeScreenPickSessions.get(tabId);
      if (prev) _endScreenPickOnTab(tabId, prev.sessionId);
      const coordMode = (payload && payload.coordMode) || 'precise';
      const stepType = (payload && payload.stepType) || 'screenClick';
      _activeScreenPickSessions.set(tabId, { sessionId, coordMode, stepType, label: payload && payload.label });
      chrome.tabs.sendMessage(tabId, { type: 'SCREEN_PICK_ACTIVATE', coordMode }, () => {
        const err = chrome.runtime.lastError;
        if (err && self.DMS_Logger) self.DMS_Logger.warn('SCREEN_PICK_START: ' + err.message);
        resolve({ ok: true, data: { sessionId, tabId } });
      });
    });
  });
}

function handleScreenPickCancel(payload) {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tid = (payload && payload.tabId) || (tabs[0] && tabs[0].id);
      if (tid != null) {
        const prev = _activeScreenPickSessions.get(tid);
        _endScreenPickOnTab(tid, prev && prev.sessionId);
        chrome.tabs.sendMessage(tid, { type: 'GPD_SIDEBAR_PICK_STOP' }, () => { chrome.runtime.lastError; });
      }
      resolve({ ok: true });
    });
  });
}

function handleDmsScreenPickMove(msg, sender) {
  return new Promise((resolve) => {
    const tabId = sender && sender.tab && sender.tab.id;
    const info = (msg && msg.info) || {};
    if (tabId == null) return resolve({ ok: false, error: 'No sender tab' });
    const session = _activeScreenPickSessions.get(tabId);
    if (!session) return resolve({ ok: false, error: 'No active screen pick session' });
    try {
      chrome.runtime.sendMessage({
        type: 'SCREEN_PICK_MOVE',
        sessionId: session.sessionId,
        point: info
      }).catch(() => {});
    } catch (e) {}
    resolve({ ok: true });
  });
}

function handleDmsScreenPicked(msg, sender) {
  return new Promise((resolve) => {
    const tabId = sender && sender.tab && sender.tab.id;
    const info = (msg && msg.info) || {};
    if (tabId == null) return resolve({ ok: false, error: 'No sender tab' });
    const session = _activeScreenPickSessions.get(tabId);
    if (!session) return resolve({ ok: false, error: 'No active screen pick session' });
    _activeScreenPickSessions.delete(tabId);
    chrome.tabs.sendMessage(tabId, { type: 'PICKER_DEACTIVATE' }, () => { chrome.runtime.lastError; });
    chrome.tabs.sendMessage(tabId, { type: 'GPD_SIDEBAR_PICK_STOP' }, () => { chrome.runtime.lastError; });
    try {
      chrome.runtime.sendMessage({
        type: 'SCREEN_PICK_BROADCAST',
        sessionId: session.sessionId,
        stepType: session.stepType || 'screenClick',
        point: info
      }).catch(() => {});
      chrome.runtime.sendMessage({
        type: 'SCREEN_PICK_SESSION_ENDED',
        sessionId: session.sessionId,
        tabId: tabId
      }).catch(() => {});
    } catch (e) {}
    resolve({ ok: true });
  });
}

// ─── Element picker ───
// content/element-picker.js (verbatim v6.7 port) has its own message
// vocabulary: it emits chrome.runtime.sendMessage({type:'dms_picker_picked',
// info:{selector,tag,text,attrs,rect}}) and exposes window.DMS_Picker.{start,
// stop} on the page. It does NOT listen for any chrome.runtime messages, and
// it neither accepts nor echoes a sessionId in its payload. content-main.js
// owns the activation bridge: it listens for PICKER_ACTIVATE / PICKER_DEACTIVATE
// and calls window.DMS_Picker.start() / stop() locally.
//
// We track the active picker session per-tab so when 'dms_picker_picked' fires
// (from sender.tab.id) we can route to the sessionId the sidebar received from
// PICKER_START.
const _activePickerSessions = new Map(); // tabId -> { sessionId, label, startedAt }

function handlePickerStart(payload) {
  return new Promise((resolve) => {
    const sessionId = crypto.randomUUID();
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = (payload && payload.tabId) || (tabs[0] && tabs[0].id);
      if (!tabId) return resolve({ ok: false, error: 'No active tab' });
      const label = (payload && payload.label) || 'pick';
      _activePickerSessions.set(tabId, { sessionId, label, startedAt: Date.now() });
      // content-main.js bridges PICKER_ACTIVATE → window.DMS_Picker.start()
      chrome.tabs.sendMessage(tabId, { type: 'PICKER_ACTIVATE', sessionId, label }, () => {
        const err = chrome.runtime.lastError;
        if (err && self.DMS_Logger) self.DMS_Logger.warn('PICKER_START sendMessage: ' + err.message);
        resolve({ ok: true, data: { sessionId, tabId } });
      });
    });
  });
}

function handlePickerSelected(payload) {
  return new Promise((resolve) => {
    if (!payload || !payload.sessionId) return resolve({ ok: false, error: 'sessionId required' });
    const key = 'picker_last_selection_' + payload.sessionId;
    chrome.storage.local.set({ [key]: {
      selector: payload.selector,
      attributes: payload.attributes || {},
      text: payload.text || '',
      capturedAt: new Date().toISOString()
    }}, () => {
      // Broadcast to sidebar (best-effort; sidebar may not be open)
      try {
        chrome.runtime.sendMessage({
          type: 'PICKER_BROADCAST',
          sessionId: payload.sessionId,
          selection: { selector: payload.selector, attributes: payload.attributes, text: payload.text }
        }).catch(() => {});
      } catch (e) { /* swallow */ }
      // Append to active recording session if the pick happened on the
      // recording tab. We match by tabId (not sessionId) because PICKER_START
      // mints its own sessionId distinct from MACRO_RECORD_START's; the
      // sidebar tracks both separately and merges via MACRO_RECORD_STOP.
      chrome.storage.local.get('macro_recording_session', (r) => {
        const s = r && r.macro_recording_session;
        const pickTabId = payload.tabId;
        const tabMatches = s && (
          (pickTabId != null && s.tabId === pickTabId) ||
          (!s.tabId && pickTabId == null)
        );
        if (s && tabMatches) {
          s.steps = s.steps || [];
          s.steps.push({ type: 'click', selector: payload.selector, recordedAt: new Date().toISOString() });
          chrome.storage.local.set({ macro_recording_session: s });
        }
      });
      resolve({ ok: true });
    });
  });
}

// Native pick-emit from element-picker.js. Translates the v6.7 payload shape
// {info:{selector,tag,text,attrs,rect}} into the PICKER_SELECTED contract
// {sessionId,selector,attributes,text} and routes via handlePickerSelected.
function handleDmsPickerPicked(msg, sender) {
  return new Promise((resolve) => {
    const tabId = sender && sender.tab && sender.tab.id;
    const info = (msg && msg.info) || {};
    if (tabId == null) {
      if (self.DMS_Logger) self.DMS_Logger.warn('dms_picker_picked: no sender.tab.id');
      return resolve({ ok: false, error: 'No sender tab' });
    }
    const session = _activePickerSessions.get(tabId);
    if (!session) {
      if (self.DMS_Logger) self.DMS_Logger.warn('dms_picker_picked: no active session for tab ' + tabId);
      return resolve({ ok: false, error: 'No active picker session for tab' });
    }
    const keepAlive = session.label && (
      String(session.label).indexOf('record:') === 0 ||
      String(session.label).indexOf('append:') === 0
    );
    if (!keepAlive) {
      _activePickerSessions.delete(tabId);
    }
    const normalized = {
      sessionId: session.sessionId,
      selector: info.selector || '',
      attributes: info.attrs || {},
      text: info.text || '',
      tabId
    };
    handlePickerSelected(normalized).then(function (r) {
      if (keepAlive) {
        chrome.tabs.sendMessage(tabId, { type: 'PICKER_ACTIVATE', sessionId: session.sessionId, label: session.label }, () => {});
      }
      resolve(r);
    });
  });
}

function handlePickerCancel(payload) {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        const tid = tabs[0].id;
        _activePickerSessions.delete(tid);
        // content-main.js bridges PICKER_DEACTIVATE → window.DMS_Picker.stop()
        chrome.tabs.sendMessage(tid, { type: 'PICKER_DEACTIVATE', sessionId: payload && payload.sessionId }, () => {
          // ignore lastError
          const err = chrome.runtime.lastError;
          if (err) { /* expected on pages without content script */ }
        });
      }
      if (payload && payload.sessionId) {
        chrome.storage.local.remove('picker_last_selection_' + payload.sessionId);
      }
      resolve({ ok: true });
    });
  });
}

function handlePickerGetLast(payload) {
  return new Promise((resolve) => {
    if (!payload || !payload.sessionId) return resolve({ ok: false, error: 'sessionId required' });
    const key = 'picker_last_selection_' + payload.sessionId;
    chrome.storage.local.get(key, (r) => {
      resolve({ ok: true, data: r[key] || null });
    });
  });
}

// ─── v6.7.0 → v4.6.0+OCR+macros migration ───────────────────────────
// When a user upgrades from DANMAN Macro Studio v6.7.0 on the same AMO
// listing (getpower@danman.solutions), their chrome.storage.local is
// preserved. v6.7.0 stored keys at dms_config.ai.*; v4.6 reads from
// config.api_keys.*. This one-time migration copies them over so chat
// works on first launch without manual re-entry.
//
// Self-gated: never runs more than once per install (_dms_migration_v570
// flag). Never overwrites populated v4.6 keys. Never deletes dms_config
// (downgrade safety).
async function _migrateDmsConfigOnce_() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['_dms_migration_v570', 'dms_config', 'config'], (r) => {
      if (r && r._dms_migration_v570) {
        return resolve({ migrated: false, reason: 'already done' });
      }
      const dms = (r && r.dms_config) || {};
      const ai = dms.ai || {};
      const cur = (r && r.config) || {};
      const api_keys = Object.assign({}, cur.api_keys || {});
      const ai_models = Object.assign({}, cur.ai_models || {});
      let touched = false;

      if (ai.anthropicKey && !api_keys.claude)    { api_keys.claude    = ai.anthropicKey; touched = true; }
      if (ai.openaiKey    && !api_keys.openai)    { api_keys.openai    = ai.openaiKey;    touched = true; }
      if (ai.geminiKey    && !api_keys.gemini)    { api_keys.gemini    = ai.geminiKey;    touched = true; }
      // v4.6-specific: firecrawl lives under api_keys (NOT scraping like v5)
      if (ai.firecrawlKey && !api_keys.firecrawl) { api_keys.firecrawl = ai.firecrawlKey; touched = true; }

      // Default model — map family → provider slot
      if (ai.defaultModel) {
        const dm = String(ai.defaultModel);
        const provider =
          dm.startsWith('claude') || dm.startsWith('anthropic') ? 'claude' :
          dm.startsWith('gpt') || dm.startsWith('openai') ? 'openai' :
          dm.startsWith('gemini') || dm.startsWith('google') ? 'gemini' : null;
        if (provider && !ai_models[provider]) {
          ai_models[provider] = dm;
          touched = true;
        }
      }

      if (!touched) {
        chrome.storage.local.set({ _dms_migration_v570: true }, () => {
          resolve({ migrated: false, reason: 'nothing to migrate' });
        });
        return;
      }

      const next = Object.assign({}, cur, { api_keys, ai_models });
      chrome.storage.local.set({ config: next, _dms_migration_v570: true }, () => {
        console.log('[DANMAN] dms_config migration: copied',
                    Object.keys(api_keys).filter(k => api_keys[k]).length,
                    'provider key(s) into config.api_keys');
        resolve({ migrated: true, providers: Object.keys(api_keys).filter(k => api_keys[k]) });
      });
    });
  });
}

// Fire on every background load — the function self-gates after the first hit.
_migrateDmsConfigOnce_().then((r) => {
  if (r.migrated) {
    console.log('[DANMAN] Migration complete:', r.providers.length, 'provider key(s) copied from dms_config');
  }
}).catch((e) => {
  console.warn('[DANMAN] Migration failed:', e && e.message || e);
});

console.log('[DANMAN] Service worker ready');
