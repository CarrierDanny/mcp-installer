/**
 * VERSION: V002R027
 * DATE: 2026-09-15
 * CHANGE: Fail closed: every request refused until BRIDGE_SECRET is set
 * HISTORY:
 *   V001R173 2026-08-26 Baseline import + Firefox messaging/clipboard fixes (unstamped)
 */
/**
 * DANMAN_Bridge.gs — universal bridge endpoint for ANY Google Apps Script project.
 * ─────────────────────────────────────────────────────────────────────────────
 * Drop this file into a GAS project and the GetPower DANMAN extension can:
 *   • verify the connection            ({bridge:'danman', action:'ping'})
 *   • DISCOVER the project's tools     ({bridge:'danman', action:'describe'})
 *   • call any registered tool         ({bridge:'danman', action:'<tool>', args:{…}})
 *
 * INSTALL — 3 steps:
 *
 * 1. Copy this file into the project (plus a Bridge_*.gs tool file, or write
 *    your own danmanBridgeTools_() — sample at the bottom).
 *
 * 2. Wire it into doPost. If the project has NO doPost, this file's fallback
 *    doPost below activates automatically. If it HAS one, add these lines at
 *    the TOP of the existing doPost, right after the body is parsed:
 *
 *      // var body = JSON.parse(e.postData.contents);   ← existing line
 *      if (danmanBridgeIsRequest_(body)) {
 *        return ContentService.createTextOutput(JSON.stringify(danmanBridgeHandle_(body)))
 *          .setMimeType(ContentService.MimeType.JSON);
 *      }
 *
 * 3. Set Script Property BRIDGE_SECRET (Project Settings → Script Properties)
 *    and put the same value in the extension's Bridge profile. REQUIRED:
 *    the bridge refuses every request (including ping/describe) until it is
 *    set, because a web app deployed to "Anyone" is reachable by the whole
 *    internet.
 *
 * Deploy as Web App (Execute as: Me, Access: Anyone) and paste the /exec URL
 * into the extension's Bridge tab with dialect "DANMAN Bridge kit".
 */

/** True when a POST body is addressed to the bridge (marker field). */
function danmanBridgeIsRequest_(body) {
  return !!(body && body.bridge === 'danman');
}

/** Registry access — tools live in danmanBridgeTools_() (own file) so load
 *  order never matters. */
function danmanBridgeConfig_() {
  var cfg = { service: 'unnamed', version: '', caps: {}, tools: {} };
  // Main registry (per-backend tools), optional.
  if (typeof danmanBridgeTools_ === 'function') {
    try {
      var m = danmanBridgeTools_() || {};
      _danmanBridgeMerge_(cfg, m);
    } catch (err) { cfg._registryError = err.message; }
  }
  // Drive add-on (Bridge_Drive.gs), optional and mergeable — a backend can
  // host BOTH its own tools AND the Drive tools without a name collision.
  if (typeof danmanDriveBridgeTools_ === 'function') {
    try { _danmanBridgeMerge_(cfg, danmanDriveBridgeTools_() || {}); }
    catch (err2) { cfg._driveError = err2.message; }
  }
  // Config Sync add-on (Bridge_ConfigSync.gs) — get_config / sync_config so the
  // extension can import Drive/Sheets IDs + API keys from Script Properties.
  if (typeof danmanConfigBridgeTools_ === 'function') {
    try { _danmanBridgeMerge_(cfg, danmanConfigBridgeTools_() || {}); }
    catch (err3) { cfg._configError = err3.message; }
  }
  return cfg;
}

function _danmanBridgeMerge_(cfg, m) {
  if (m.service && (!cfg.service || cfg.service === 'unnamed')) cfg.service = m.service;
  if (m.version && !cfg.version) cfg.version = m.version;
  if (m.caps) for (var k in m.caps) cfg.caps[k] = m.caps[k];
  if (m.tools) for (var t in m.tools) cfg.tools[t] = m.tools[t];
}

/** Main handler. Always returns a JSON-able object; never throws. */
function danmanBridgeHandle_(body) {
  try {
    var cfg = danmanBridgeConfig_();
    var secret = '';
    try { secret = PropertiesService.getScriptProperties().getProperty('BRIDGE_SECRET') || ''; } catch (e) {}

    // Fail closed. A web app deployed as "Anyone with the link" is reachable by
    // the whole internet; without a shared secret every bridge tool (Drive,
    // Sheets, get_config) would be open. Set BRIDGE_SECRET once in Project
    // Settings → Script Properties and paste the same value into the
    // extension's webhook secret field.
    if (!secret) {
      return { ok: false, error: 'Bridge locked: set Script Property BRIDGE_SECRET (Project Settings → Script Properties) and enter the same value as the webhook secret in the extension.' };
    }
    var authMode = 'secret';

    if (String(body.secret || '') !== secret) {
      return { ok: false, error: 'Invalid or missing bridge secret.' };
    }

    var action = String(body.action || '');

    if (action === 'ping') {
      return { ok: true, service: cfg.service || 'unnamed', version: cfg.version || '', auth: authMode };
    }

    if (action === 'describe') {
      var tools = [];
      var reg = cfg.tools || {};
      for (var name in reg) {
        tools.push({
          name: name,
          action: name,
          description: reg[name].description || '',
          category: reg[name].category || '',
          params: reg[name].params || []
        });
      }
      return {
        ok: true,
        service: cfg.service || 'unnamed',
        version: cfg.version || '',
        auth: authMode,
        caps: cfg.caps || {},
        tools: tools,
        warning: cfg._registryError ? ('Tool registry error: ' + cfg._registryError) : undefined
      };
    }

    var tool = (cfg.tools || {})[action];
    if (!tool || typeof tool.handler !== 'function') {
      return { ok: false, error: 'Unknown bridge tool: ' + action + '. Run describe for the list.' };
    }

    var result = tool.handler(body.args || {});
    return { ok: true, result: result };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

/** Fallback web-app entry points — ONLY define these if the host project has
 *  no doPost/doGet of its own. If it does, DELETE this block and use the
 *  wiring snippet from the header instead (GAS allows one doPost per project;
 *  a duplicate here would silently shadow or be shadowed). */
function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents || '{}'); } catch (err) {}
  if (danmanBridgeIsRequest_(body)) {
    return ContentService.createTextOutput(JSON.stringify(danmanBridgeHandle_(body)))
      .setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'Not a bridge request (missing bridge:"danman" marker).' }))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ── SAMPLE tool registry ─────────────────────────────────────────────────
 * Copy into its own file (e.g. Bridge_MyTools.gs), uncomment, adapt. Each
 * handler receives the extension's `args` object and returns any JSON-able
 * value; errors thrown inside handlers are caught and reported cleanly.
 *
 * function danmanBridgeTools_() {
 *   return {
 *     service: 'My Project',
 *     version: '1.0',
 *     caps: {},   // optional: map standard verbs → tool names, e.g. {'chat': 'my_chat'}
 *     tools: {
 *       list_sheets: {
 *         description: 'List sheet names in the bound spreadsheet',
 *         category: 'sheets',
 *         params: [],
 *         handler: function () {
 *           return SpreadsheetApp.getActive().getSheets().map(function (s) { return s.getName(); });
 *         }
 *       },
 *       append_row: {
 *         description: 'Append a row to a named sheet',
 *         category: 'sheets',
 *         params: [
 *           { key: 'sheet', label: 'Sheet name', type: 'string', required: true },
 *           { key: 'row', label: 'Row values (JSON array)', type: 'json', required: true }
 *         ],
 *         handler: function (args) {
 *           SpreadsheetApp.getActive().getSheetByName(args.sheet).appendRow(args.row);
 *           return { appended: true };
 *         }
 *       }
 *     }
 *   };
 * }
 * ──────────────────────────────────────────────────────────────────────── */
