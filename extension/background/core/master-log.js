/**
 * VERSION: V002R021
 * DATE: 2026-09-15
 * CHANGE: "Sheet not found" stops the re-queue loop and warns once that the DANMAN_LOG tab is missing
 * HISTORY:
 *   V001R107 2026-08-26 Baseline import (unstamped)
 */
// background/core/master-log.js — session/audit trail to the ONE master sheet.
// Everything worth monitoring lands as rows in the DANMAN_LOG tab of the
// master spreadsheet (config.sheets.spreadsheet_id — deliberately a single
// fixed sheet across deployments): session starts, config modifications,
// fine-tuning changes, memory-folder routing, bridge/tool calls with their
// profile + deployment, and chat usage (chars in/out per model) so token
// spend can be budgeted from one place.
//
// Buffered + best-effort: rows queue locally and flush in batches through
// the existing SHEETS_APPEND pathway (webhook preferred, OAuth fallback).
// Logging must never break a feature — every failure is swallowed after a
// console warning, and rows are re-queued once.
(function () {
  'use strict';

  const RANGE = 'DANMAN_LOG!A:G';
  const FLUSH_ROWS = 10;
  const FLUSH_MS = 20000;

  let buffer = [];
  let timer = null;
  let flushing = false;

  function deploymentIdFrom(url) {
    const m = String(url || '').match(/\/macros\/s\/([^/]+)/);
    return m ? m[1].slice(0, 18) + '…' : '';
  }

  async function flush() {
    if (flushing || !buffer.length) return;
    flushing = true;
    const rows = buffer.splice(0, buffer.length);
    try {
      const cfg = await ConfigManager.load();
      if (!cfg.sheets?.spreadsheet_id || (!cfg.sheets?.webhook_url && !cfg.sheets?.oauth_token)) {
        // Master sheet not configured — drop silently; local Logger still has it.
        flushing = false;
        return;
      }
      if (typeof globalThis.handleSheetsAppend !== 'function') {
        flushing = false;
        return;
      }
      await globalThis.handleSheetsAppend({ range: RANGE, values: rows });
    } catch (e) {
      const msg = String((e && e.message) || e);
      if (/sheet not found/i.test(msg)) {
        // The master spreadsheet has no DANMAN_LOG tab. Retrying every 20 s
        // just fills the bridge log with the same error — drop the rows and
        // say once what fixes it.
        if (!globalThis.__masterLogTabWarned) {
          globalThis.__masterLogTabWarned = true;
          console.warn('[MasterLog] Master spreadsheet has no "DANMAN_LOG" tab — add a sheet named DANMAN_LOG to it (Settings → Integrations → master spreadsheet). Session rows are dropped until then.');
        }
        flushing = false;
        return;
      }
      console.warn('[MasterLog] flush failed (rows re-queued once):', msg);
      if (!rows._requeued) {
        rows._requeued = true;
        buffer = rows.concat(buffer).slice(0, 200);
      }
    }
    flushing = false;
  }

  function schedule() {
    if (buffer.length >= FLUSH_ROWS) {
      flush();
      return;
    }
    if (!timer) {
      timer = setTimeout(() => { timer = null; flush(); }, FLUSH_MS);
    }
  }

  const MasterLog = {
    /**
     * Queue one audit row.
     * @param {string} event   e.g. SESSION_START, CONFIG_SAVE, BRIDGE_CALL,
     *                         CHAT_USAGE, MEMORY_FOLDER, FINE_TUNING
     * @param {string} detail  short human-readable detail
     * @param {object} extra   context (json-ified into one cell)
     */
    append(event, detail, extra) {
      try {
        const ex = extra || {};
        buffer.push([
          new Date().toISOString(),
          (typeof Logger !== 'undefined' && Logger.sessionId) || '',
          event,
          String(detail || '').slice(0, 300),
          JSON.stringify(ex).slice(0, 900),
          ex.folder_id || '',
          (globalThis.GPD_APP_VERSION || '') + (ex.deployment ? ' @' + ex.deployment : '')
        ]);
        schedule();
      } catch (_) {}
    },

    deploymentIdFrom,
    flush
  };

  globalThis.MasterLog = MasterLog;

  // Session-start row (buffered; lands with the first flush)
  setTimeout(async () => {
    try {
      const cfg = await ConfigManager.load();
      MasterLog.append('SESSION_START', 'extension background started', {
        provider: cfg.ai_provider,
        memory_enabled: !!cfg.memory?.enabled,
        folder_id: cfg.memory?.folder_id || '',
        bridges: (cfg.bridges || []).length
      });
    } catch (_) {}
  }, 3000);
})();
