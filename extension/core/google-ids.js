// core/google-ids.js — Accept full Google URLs or raw IDs; always return IDs.
(function (global) {
  'use strict';

  function extractSpreadsheetId(input) {
    var s = String(input || '').trim();
    if (!s) return '';
    var m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (m) return m[1];
    m = s.match(/^[a-zA-Z0-9_-]{20,}$/);
    return m ? s : s;
  }

  function extractDriveFolderId(input) {
    var s = String(input || '').trim();
    if (!s) return '';
    var m = s.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (m) return m[1];
    m = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (m) return m[1];
    m = s.match(/^[a-zA-Z0-9_-]{20,}$/);
    return m ? s : s;
  }

  function extractDriveFileId(input) {
    var s = String(input || '').trim();
    if (!s) return '';
    var m = s.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (m) return m[1];
    m = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (m) return m[1];
    return extractDriveFolderId(s);
  }

  /** Normalize config fields that may contain full URLs. */
  function normalizeConfigIds(cfg) {
    if (!cfg || typeof cfg !== 'object') return cfg;
    var out = cfg;
    if (out.sheets) {
      if (out.sheets.spreadsheet_id) {
        out.sheets.spreadsheet_id = extractSpreadsheetId(out.sheets.spreadsheet_id);
      }
      if (out.sheets.drive_folder_id) {
        out.sheets.drive_folder_id = extractDriveFolderId(out.sheets.drive_folder_id);
      }
      if (out.sheets.webhook_url) {
        out.sheets.webhook_url = String(out.sheets.webhook_url).trim().split('?')[0];
      }
    }
    if (out.backend) {
      if (out.backend.master_folder_id) {
        out.backend.master_folder_id = extractDriveFolderId(out.backend.master_folder_id);
      }
      if (out.backend.webhook_url) {
        out.backend.webhook_url = String(out.backend.webhook_url).trim().split('?')[0];
      }
    }
    if (out.memory) {
      if (out.memory.folder_id) out.memory.folder_id = extractDriveFolderId(out.memory.folder_id);
      if (out.memory.drive_folder_id) {
        out.memory.drive_folder_id = extractDriveFolderId(out.memory.drive_folder_id);
      }
      if (out.memory.spreadsheet_id) {
        out.memory.spreadsheet_id = extractSpreadsheetId(out.memory.spreadsheet_id);
      }
    }
    if (out.setup) {
      if (out.setup.spreadsheet_id) {
        out.setup.spreadsheet_id = extractSpreadsheetId(out.setup.spreadsheet_id);
      }
      if (out.setup.drive_root_folder_id) {
        out.setup.drive_root_folder_id = extractDriveFolderId(out.setup.drive_root_folder_id);
      }
    }
    if (out.gas_ui && out.gas_ui.url) {
      out.gas_ui.url = String(out.gas_ui.url).trim().split('?')[0];
    }
    return out;
  }

  global.GPD_GoogleIds = {
    extractSpreadsheetId: extractSpreadsheetId,
    extractDriveFolderId: extractDriveFolderId,
    extractDriveFileId: extractDriveFileId,
    normalizeConfigIds: normalizeConfigIds
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : self);
