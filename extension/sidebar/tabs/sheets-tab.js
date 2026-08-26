// sidebar/tabs/sheets-tab.js — Google Sheets Integration Tab
(function() {
  'use strict';

  const container = document.getElementById('tab-sheets');
  if (!container) return;

  // State
  let isConnected = false;
  let sheetNames = [];
  let readData = null;
  let operationsLog = [];
  let method = 'api'; // 'api' or 'webhook'

  function parseGoogleSheetsUrl(input) {
    const urlMatch = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    const gidMatch = input.match(/[?#&]gid=(\d+)/);
    return {
      spreadsheet_id: urlMatch ? urlMatch[1] : input.trim(),
      gid: gidMatch ? gidMatch[1] : null
    };
  }

  container.innerHTML = `
    <div class="tab-title">&#128202; Google Sheets</div>
    <div class="tab-desc">Read from and write to Google Sheets</div>

    <!-- Connection Section -->
    <div class="card">
      <div class="card-header">
        <span class="section-title">Connection</span>
        <span class="badge badge-yellow" id="sheets-status">Disconnected</span>
      </div>
      <div class="form-group">
        <label>Spreadsheet ID</label>
        <div style="display:flex;gap:6px;">
          <input type="text" id="sheets-spreadsheet-id" placeholder="Enter Spreadsheet ID or URL..." style="flex:1;">
          <button class="btn btn-secondary btn-sm" id="btn-sheets-from-settings" title="Load from settings">&#9881;</button>
        </div>
      </div>
      <div id="sheets-parsed-info" style="display:none;font-size:11px;color:#94a3b8;margin-top:4px;font-family:monospace;"></div>
      <div class="form-group">
        <label>Sheet Name</label>
        <div style="display:flex;gap:6px;">
          <select id="sheets-sheet-name" style="flex:1;">
            <option value="">-- Select sheet --</option>
          </select>
          <button class="btn btn-secondary btn-sm" id="btn-sheets-refresh" title="Refresh sheet list">&#128260;</button>
        </div>
      </div>
      <div class="form-group">
        <label>Range</label>
        <input type="text" id="sheets-range" placeholder="A1:D10">
      </div>
      <div id="sheets-header-preview" style="display:none;margin-top:12px;">
        <label style="font-size:12px;color:#94a3b8;margin-bottom:6px;display:block;">Column Preview</label>
        <div id="sheets-preview-table" style="max-height:150px;overflow:auto;border:1px solid #334155;border-radius:6px;font-size:11px;"></div>
        <button class="btn btn-secondary btn-sm" id="btn-sheets-preview-refresh" style="margin-top:6px;">Refresh Preview</button>
      </div>
      <div class="form-group">
        <label>Method</label>
        <div style="display:flex;gap:4px;">
          <button class="btn btn-sm sheets-method-btn active" id="btn-method-api" style="flex:1;">API</button>
          <button class="btn btn-sm sheets-method-btn" id="btn-method-webhook" style="flex:1;">Webhook</button>
        </div>
      </div>
    </div>

    <!-- Read Section -->
    <div class="card">
      <div class="card-header">
        <span class="section-title">Read Data</span>
      </div>
      <button class="btn btn-primary btn-block" id="btn-sheets-read">&#128196; Read</button>
      <div id="sheets-read-stats" style="display:none;margin-top:8px;">
        <div class="stat-row">
          <div class="stat-box">
            <div class="value" id="sheets-row-count">0</div>
            <div class="label">Rows</div>
          </div>
          <div class="stat-box">
            <div class="value" id="sheets-col-count">0</div>
            <div class="label">Columns</div>
          </div>
        </div>
      </div>
      <div id="sheets-data-table" style="display:none;margin-top:8px;max-height:300px;overflow:auto;border:1px solid #334155;border-radius:6px;"></div>
    </div>

    <!-- Write Section -->
    <div class="card">
      <div class="card-header">
        <span class="section-title">Write Data</span>
      </div>
      <div class="form-group">
        <label>Data (CSV or JSON array)</label>
        <textarea id="sheets-write-data" rows="5" placeholder='Paste CSV rows or JSON array, e.g.:\nName,Email,Phone\nJohn,john@example.com,555-1234\n\nor\n\n[["Name","Email"],["John","john@example.com"]]'></textarea>
      </div>
      <div class="form-group">
        <label>Session Folder Label (optional)</label>
        <input type="text" id="sheets-session-label" placeholder="Auto: page-url_timestamp">
        <div style="font-size:11px;color:#64748b;margin-top:2px;">Leave blank to use the current page URL + timestamp</div>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-primary" id="btn-sheets-write" style="flex:1;">&#128221; Write</button>
        <button class="btn btn-success" id="btn-sheets-append" style="flex:1;">&#10010; Append</button>
      </div>
    </div>

    <!-- Push Results Section -->
    <div class="card">
      <div class="card-header">
        <span class="section-title">Push Results</span>
      </div>
      <div class="form-group">
        <label>Data Source</label>
        <select id="sheets-push-source">
          <option value="scrape">Push scrape results</option>
          <option value="links">Push links</option>
          <option value="forms">Push form data</option>
          <option value="eject">Push EJECT results</option>
        </select>
      </div>
      <button class="btn btn-primary btn-block" id="btn-sheets-push">&#128640; Push</button>
    </div>

    <!-- Recent Operations Log -->
    <div class="card">
      <div class="card-header">
        <span class="section-title">Recent Operations</span>
        <span class="text-muted text-xs" id="sheets-ops-count"></span>
      </div>
      <div id="sheets-ops-log">
        <div class="empty-state" style="padding:16px 0;">
          <div class="message">No operations yet</div>
        </div>
      </div>
    </div>
  `;

  // ---- Inline styles for method toggle ----
  const methodStyle = document.createElement('style');
  methodStyle.textContent = `
    .sheets-method-btn {
      background: #1e293b;
      color: #94a3b8;
      border: 1px solid #334155;
      transition: all 0.2s ease;
    }
    .sheets-method-btn:hover {
      background: #334155;
      color: #e2e8f0;
    }
    .sheets-method-btn.active {
      background: #0ea5e9;
      color: #fff;
      border-color: #0ea5e9;
    }
  `;
  container.appendChild(methodStyle);

  // ---- Helpers ----

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function extractSpreadsheetId(input) {
    if (!input) return '';
    input = input.trim();
    // Match URL pattern: /spreadsheets/d/{ID}/
    const urlMatch = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (urlMatch) return urlMatch[1];
    // Otherwise treat the whole thing as an ID
    return input;
  }

  function getSheetId() {
    return extractSpreadsheetId(document.getElementById('sheets-spreadsheet-id').value);
  }

  function getRange() {
    const sheet = document.getElementById('sheets-sheet-name').value;
    const range = document.getElementById('sheets-range').value.trim();
    if (sheet && range) return `${sheet}!${range}`;
    if (range) return range;
    if (sheet) return sheet;
    return '';
  }

  function parseInputData(raw) {
    raw = raw.trim();
    if (!raw) return null;

    // Try JSON first
    if (raw.startsWith('[')) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          // If it's an array of arrays, use directly
          if (Array.isArray(parsed[0])) return parsed;
          // If it's a flat array, wrap it
          return [parsed];
        }
      } catch (e) { /* fall through to CSV */ }
    }

    // Parse as CSV
    const lines = raw.split('\n').filter(l => l.trim());
    return lines.map(line => {
      const cells = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (ch === ',' && !inQuotes) {
          cells.push(current);
          current = '';
        } else {
          current += ch;
        }
      }
      cells.push(current);
      return cells;
    });
  }

  function formatTimestamp(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    const s = d.getSeconds().toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  function logOperation(type, status, detail) {
    operationsLog.unshift({
      timestamp: Date.now(),
      type,
      status,
      detail: detail || ''
    });
    if (operationsLog.length > 5) operationsLog.length = 5;
    renderOpsLog();
  }

  function setConnected(connected) {
    isConnected = connected;
    const badge = document.getElementById('sheets-status');
    if (connected) {
      badge.textContent = 'Connected';
      badge.className = 'badge badge-green';
    } else {
      badge.textContent = 'Disconnected';
      badge.className = 'badge badge-yellow';
    }
  }

  // ---- Renderers ----

  function renderDataTable(values) {
    const wrapper = document.getElementById('sheets-data-table');
    const statsEl = document.getElementById('sheets-read-stats');

    if (!values || values.length === 0) {
      wrapper.style.display = 'none';
      statsEl.style.display = 'none';
      return;
    }

    const rowCount = values.length;
    const colCount = Math.max(...values.map(r => (r || []).length));

    document.getElementById('sheets-row-count').textContent = rowCount;
    document.getElementById('sheets-col-count').textContent = colCount;
    statsEl.style.display = 'block';

    // Build the table with headers from first row
    const headerRow = values[0] || [];
    const dataRows = values.slice(1);

    let html = '<table class="data-table" style="min-width:100%;">';
    html += '<thead><tr>';
    for (let c = 0; c < colCount; c++) {
      html += `<th style="white-space:nowrap;">${escapeHtml(String(headerRow[c] != null ? headerRow[c] : ''))}</th>`;
    }
    html += '</tr></thead><tbody>';

    const displayRows = dataRows.slice(0, 500);
    displayRows.forEach(row => {
      html += '<tr>';
      for (let c = 0; c < colCount; c++) {
        const val = row && row[c] != null ? String(row[c]) : '';
        html += `<td title="${escapeHtml(val)}">${escapeHtml(val)}</td>`;
      }
      html += '</tr>';
    });

    html += '</tbody></table>';

    if (dataRows.length > 500) {
      html += `<div class="text-muted text-xs" style="padding:6px 10px;">Showing 500 of ${dataRows.length} data rows</div>`;
    }

    wrapper.innerHTML = html;
    wrapper.style.display = 'block';
  }

  function renderOpsLog() {
    const logEl = document.getElementById('sheets-ops-log');
    const countEl = document.getElementById('sheets-ops-count');
    countEl.textContent = operationsLog.length > 0 ? `${operationsLog.length}/5` : '';

    if (operationsLog.length === 0) {
      logEl.innerHTML = '<div class="empty-state" style="padding:16px 0;"><div class="message">No operations yet</div></div>';
      return;
    }

    logEl.innerHTML = operationsLog.map(op => {
      const statusBadge = op.status === 'success'
        ? '<span class="badge badge-green" style="font-size:10px;">OK</span>'
        : op.status === 'error'
          ? '<span class="badge badge-red" style="font-size:10px;">ERR</span>'
          : '<span class="badge badge-yellow" style="font-size:10px;">...</span>';

      const typeIcons = {
        read: '&#128196;',
        write: '&#128221;',
        append: '&#10010;',
        push: '&#128640;',
        list: '&#128260;',
        connect: '&#128279;'
      };
      const icon = typeIcons[op.type] || '&#128202;';

      return `
        <div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #1e293b;font-size:12px;">
          <span class="text-muted text-xs font-mono" style="flex-shrink:0;width:55px;">${formatTimestamp(op.timestamp)}</span>
          <span style="flex-shrink:0;">${icon}</span>
          <span style="flex:1;color:#e2e8f0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(op.detail)}">${escapeHtml(op.type.toUpperCase())}${op.detail ? ' - ' + escapeHtml(op.detail) : ''}</span>
          ${statusBadge}
        </div>
      `;
    }).join('');
  }

  // ---- Method Toggle ----

  document.getElementById('btn-method-api').addEventListener('click', () => {
    method = 'api';
    document.getElementById('btn-method-api').classList.add('active');
    document.getElementById('btn-method-webhook').classList.remove('active');
  });

  document.getElementById('btn-method-webhook').addEventListener('click', () => {
    method = 'webhook';
    document.getElementById('btn-method-webhook').classList.add('active');
    document.getElementById('btn-method-api').classList.remove('active');
  });

  // ---- Load from Settings ----

  document.getElementById('btn-sheets-from-settings').addEventListener('click', () => {
    window.sendToBackground('CONFIG_LOAD', {}).then(config => {
      if (config && config.sheetsSpreadsheetId) {
        document.getElementById('sheets-spreadsheet-id').value = config.sheetsSpreadsheetId;
        setConnected(true);
        logOperation('connect', 'success', 'Loaded from settings');
        Toast.success('Spreadsheet ID loaded from settings');
        refreshSheetList();
      } else if (config && config.spreadsheetId) {
        document.getElementById('sheets-spreadsheet-id').value = config.spreadsheetId;
        setConnected(true);
        logOperation('connect', 'success', 'Loaded from settings');
        Toast.success('Spreadsheet ID loaded from settings');
        refreshSheetList();
      } else {
        Toast.warning('No Spreadsheet ID found in settings');
      }
    }).catch(() => {
      Toast.error('Failed to load settings');
    });
  });

  // ---- Refresh Sheet List ----

  function refreshSheetList() {
    const id = getSheetId();
    if (!id) {
      Toast.warning('Enter a Spreadsheet ID first');
      return;
    }

    const btn = document.getElementById('btn-sheets-refresh');
    btn.disabled = true;

    window.sendToBackground('SHEETS_LIST', { spreadsheetId: id }).then(result => {
      btn.disabled = false;
      const sheets = result && result.sheets ? result.sheets : (Array.isArray(result) ? result : []);

      if (sheets.length > 0) {
        sheetNames = sheets.map(s => typeof s === 'string' ? s : (s.title || s.name || ''));
        const select = document.getElementById('sheets-sheet-name');
        select.innerHTML = '<option value="">-- Select sheet --</option>' +
          sheetNames.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');

        if (sheetNames.length > 0) {
          select.value = sheetNames[0];
        }

        setConnected(true);
        logOperation('list', 'success', `${sheetNames.length} sheet(s)`);
        Toast.success(`Found ${sheetNames.length} sheet(s)`);
      } else {
        setConnected(true);
        logOperation('list', 'success', 'No sheets returned');
        Toast.info('Connected but no sheets returned');
      }
    }).catch(err => {
      btn.disabled = false;
      setConnected(false);
      logOperation('list', 'error', err.message || 'Failed');
      Toast.error(err.message || 'Failed to list sheets');
    });
  }

  document.getElementById('btn-sheets-refresh').addEventListener('click', refreshSheetList);

  // Also try to connect when the spreadsheet ID field loses focus
  document.getElementById('sheets-spreadsheet-id').addEventListener('change', () => {
    const id = getSheetId();
    if (id) {
      setConnected(true);
      refreshSheetList();
    } else {
      setConnected(false);
    }
  });

  // ---- URL Parsing on blur ----
  document.getElementById('sheets-spreadsheet-id').addEventListener('blur', function() {
    const raw = this.value.trim();
    if (!raw) return;
    const parsed = parseGoogleSheetsUrl(raw);
    this.dataset.spreadsheetId = parsed.spreadsheet_id;
    this.dataset.gid = parsed.gid || '';
    const infoEl = document.getElementById('sheets-parsed-info');
    if (infoEl) {
      infoEl.innerHTML = 'ID: <code>' + parsed.spreadsheet_id.slice(0, 16) + '...</code>' +
        (parsed.gid ? ' | GID: <code>' + parsed.gid + '</code>' : ' | GID: (none - will use first sheet)');
      infoEl.style.display = 'block';
    }
  });

  // ---- Column Preview ----
  document.getElementById('btn-sheets-preview-refresh')?.addEventListener('click', async () => {
    const input = document.getElementById('sheets-spreadsheet-id');
    const parsed = parseGoogleSheetsUrl(input.value);
    try {
      const preview = await window.sendToBackground('SHEETS_PREVIEW', {
        spreadsheet_id: parsed.spreadsheet_id,
        gid: parsed.gid
      });
      const container = document.getElementById('sheets-preview-table');
      if (!preview.headers || !preview.headers.length) {
        container.innerHTML = '<div style="padding:8px;color:#64748b;">Empty sheet</div>';
      } else {
        let html = '<table style="width:100%;border-collapse:collapse;font-family:monospace;font-size:11px;">';
        html += '<tr>' + preview.headers.map(h =>
          '<th style="padding:4px 8px;border-bottom:2px solid #38bdf8;color:#38bdf8;text-align:left;white-space:nowrap;">' + h + '</th>'
        ).join('') + '</tr>';
        (preview.sample_rows || []).forEach(row => {
          html += '<tr>' + preview.headers.map((_, i) =>
            '<td style="padding:4px 8px;border-bottom:1px solid #334155;color:#94a3b8;white-space:nowrap;">' + (row[i] || '') + '</td>'
          ).join('') + '</tr>';
        });
        html += '</table>';
        container.innerHTML = html;
      }
      document.getElementById('sheets-header-preview').style.display = 'block';
    } catch (err) {
      if (typeof Toast !== 'undefined') Toast.error('Preview failed: ' + err.message);
    }
  });

  // ---- Read ----

  document.getElementById('btn-sheets-read').addEventListener('click', () => {
    const id = getSheetId();
    if (!id) return Toast.warning('Enter a Spreadsheet ID');

    const range = getRange();
    if (!range) return Toast.warning('Enter a range (e.g. A1:D10)');

    const btn = document.getElementById('btn-sheets-read');
    btn.disabled = true;
    btn.textContent = 'Reading...';

    window.sendToBackground('SHEETS_READ', { spreadsheetId: id, range, method }).then(result => {
      btn.disabled = false;
      btn.innerHTML = '&#128196; Read';

      const values = result && result.values ? result.values : (Array.isArray(result) ? result : []);
      readData = values;

      renderDataTable(values);
      logOperation('read', 'success', `${values.length} row(s) from ${range}`);
      Toast.success(`Read ${values.length} row(s)`);
    }).catch(err => {
      btn.disabled = false;
      btn.innerHTML = '&#128196; Read';
      logOperation('read', 'error', err.message || 'Failed');
      Toast.error(err.message || 'Failed to read from Sheets');
    });
  });

  // ---- Write ----

  document.getElementById('btn-sheets-write').addEventListener('click', () => {
    const id = getSheetId();
    if (!id) return Toast.warning('Enter a Spreadsheet ID');

    const range = getRange();
    if (!range) return Toast.warning('Enter a range');

    const raw = document.getElementById('sheets-write-data').value;
    const values = parseInputData(raw);
    if (!values) return Toast.warning('Enter data to write (CSV or JSON)');

    const btn = document.getElementById('btn-sheets-write');
    btn.disabled = true;
    btn.textContent = 'Writing...';

    window.sendToBackground('SHEETS_WRITE', { spreadsheetId: id, range, values, method }).then(result => {
      btn.disabled = false;
      btn.innerHTML = '&#128221; Write';
      const count = values.length;
      logOperation('write', 'success', `${count} row(s) to ${range}`);
      Toast.success(`Wrote ${count} row(s) to sheet`);
    }).catch(err => {
      btn.disabled = false;
      btn.innerHTML = '&#128221; Write';
      logOperation('write', 'error', err.message || 'Failed');
      Toast.error(err.message || 'Failed to write to Sheets');
    });
  });

  // ---- Append ----

  document.getElementById('btn-sheets-append').addEventListener('click', () => {
    const id = getSheetId();
    if (!id) return Toast.warning('Enter a Spreadsheet ID');

    const raw = document.getElementById('sheets-write-data').value;
    const values = parseInputData(raw);
    if (!values) return Toast.warning('Enter data to append (CSV or JSON)');

    const range = getRange() || undefined;

    const btn = document.getElementById('btn-sheets-append');
    btn.disabled = true;
    btn.textContent = 'Appending...';

    window.sendToBackground('SHEETS_APPEND', { spreadsheetId: id, values, range, method }).then(result => {
      btn.disabled = false;
      btn.innerHTML = '&#10010; Append';
      const count = values.length;
      logOperation('append', 'success', `${count} row(s)`);
      Toast.success(`Appended ${count} row(s)`);
    }).catch(err => {
      btn.disabled = false;
      btn.innerHTML = '&#10010; Append';
      logOperation('append', 'error', err.message || 'Failed');
      Toast.error(err.message || 'Failed to append to Sheets');
    });
  });

  // ---- Push Results ----

  document.getElementById('btn-sheets-push').addEventListener('click', () => {
    const id = getSheetId();
    if (!id) return Toast.warning('Enter a Spreadsheet ID');

    const source = document.getElementById('sheets-push-source').value;
    const btn = document.getElementById('btn-sheets-push');
    btn.disabled = true;
    btn.textContent = 'Pushing...';

    const range = getRange() || undefined;

    // Parse the spreadsheet input for GID
    const inputEl = document.getElementById('sheets-spreadsheet-id');
    const parsed = parseGoogleSheetsUrl(inputEl ? inputEl.value : id);

    fetchPushData(source).then(values => {
      if (!values || values.length === 0) {
        btn.disabled = false;
        btn.innerHTML = '&#128640; Push';
        Toast.warning(`No ${source} data available. Run the corresponding action first.`);
        logOperation('push', 'error', `No ${source} data`);
        return;
      }

      // Use WRITE_RESULTS which handles GID routing and auto-sheet creation
      return window.sendToBackground('WRITE_RESULTS', {
        result_type: source,
        spreadsheet_id: parsed.spreadsheet_id || id,
        gid: parsed.gid || '',
        source_url: window.location ? window.location.href : '',
        values: values
      }).then((resp) => {
        btn.disabled = false;
        btn.innerHTML = '&#128640; Push';
        const sheetInfo = resp && resp.sheet_name ? ` → ${resp.sheet_name}` : '';
        logOperation('push', 'success', `${source}: ${values.length} row(s)${sheetInfo}`);
        Toast.success(`Pushed ${values.length} row(s) from ${source}${sheetInfo}`);
      });
    }).catch(err => {
      btn.disabled = false;
      btn.innerHTML = '&#128640; Push';
      logOperation('push', 'error', err.message || 'Failed');
      Toast.error(err.message || 'Failed to push data');
    });
  });

  function fetchPushData(source) {
    switch (source) {
      case 'scrape':
        return window.sendToBackground('GET_LOGS', { action: 'SCRAPE_COMPLETE', limit: 1 }).then(result => {
          const data = result && result.logs && result.logs[0] ? result.logs[0].data || result.logs[0] : null;
          if (!data) return null;
          return [
            ['Title', 'URL', 'Words', 'Headings', 'Images', 'Tables', 'Scraped At'],
            [
              data.title || '',
              data.url || '',
              data.wordCount || 0,
              data.headingCount || 0,
              data.imageCount || 0,
              data.tableCount || 0,
              data.scrapedAt || new Date().toISOString()
            ]
          ];
        });

      case 'links':
        return window.sendToBackground('GET_LOGS', { action: 'LINKS_COMPLETE', limit: 1 }).then(result => {
          const data = result && result.logs && result.logs[0] ? result.logs[0].data || result.logs[0] : null;
          if (!data) return null;
          const links = data.links || [];
          if (links.length === 0) return null;
          const header = ['URL', 'Display Text', 'Type', 'Domain'];
          const rows = links.map(l => [
            l.url || '',
            l.displayText || '',
            l.isInternal ? 'Internal' : 'External',
            l.domain || ''
          ]);
          return [header, ...rows];
        });

      case 'forms':
        return window.sendToBackground('GET_LOGS', { action: 'FORMS_COMPLETE', limit: 1 }).then(result => {
          const data = result && result.logs && result.logs[0] ? result.logs[0].data || result.logs[0] : null;
          if (!data) return null;
          const forms = data.forms || [];
          if (forms.length === 0) return null;
          const header = ['Form #', 'Action', 'Method', 'Field Type', 'Name', 'Label', 'Required', 'Value'];
          const rows = [];
          forms.forEach((form, fi) => {
            (form.fields || []).forEach(field => {
              rows.push([
                fi + 1,
                form.action || '',
                form.method || '',
                field.type || '',
                field.name || field.id || '',
                field.label || '',
                field.required ? 'Yes' : 'No',
                field.currentValue || ''
              ]);
            });
          });
          return [header, ...rows];
        });

      case 'eject':
        return window.sendToBackground('GET_LOGS', { action: 'EJECT_COMPLETE', limit: 1 }).then(result => {
          const data = result && result.logs && result.logs[0] ? result.logs[0].data || result.logs[0] : null;
          if (!data) return null;
          // EJECT results are flexible; convert to rows
          if (Array.isArray(data.rows)) {
            return data.rows;
          }
          if (data.extracted && Array.isArray(data.extracted)) {
            const keys = Object.keys(data.extracted[0] || {});
            const header = keys;
            const rows = data.extracted.map(item => keys.map(k => item[k] != null ? String(item[k]) : ''));
            return [header, ...rows];
          }
          // Fallback: serialize as a single row
          const flat = Object.entries(data).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)]);
          return [['Key', 'Value'], ...flat];
        });

      default:
        return Promise.resolve(null);
    }
  }

  // ---- Tab activation: auto-refresh connection ----

  window.addEventListener('tab-activated', (e) => {
    if (e.detail && e.detail.tab === 'sheets') {
      const id = getSheetId();
      if (id && sheetNames.length === 0) {
        refreshSheetList();
      }
    }
  });

  // ---- Initialize ----
  renderOpsLog();
  console.log('[DANMAN] Sheets tab loaded');
})();
