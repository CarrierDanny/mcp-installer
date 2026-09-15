/**
 * Output Dialog — shown after every data operation.
 * Usage: OutputDialog.show({ url, title, word_count, links, media, forms, raw_html, content_rows, ... })
 */
const OutputDialog = {
  _overlay: null,
  _recentSheets: [],

  async init() {
    // Load recent sheets from storage
    const data = await chrome.storage.local.get('danman_recent_sheets');
    this._recentSheets = data.danman_recent_sheets || [];
  },

  show(sessionData) {
    this.init();
    if (this._overlay) this._overlay.remove();

    const overlay = document.createElement('div');
    overlay.id = 'output-dialog-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:999999;display:flex;align-items:center;justify-content:center;';

    const linkCount = (sessionData.link_rows || []).length;
    const mediaCount = (sessionData.media_items || []).length;
    const formCount = (sessionData.form_rows || []).length;

    const recentHtml = this._recentSheets.map(s =>
      '<div class="recent-sheet" data-id="' + s.id + '" style="padding:6px 10px;background:#1e293b;border:1px solid #334155;border-radius:6px;cursor:pointer;font-size:12px;color:#e2e8f0;margin:2px 0;">' +
      s.name + ' <span style="color:#64748b;font-size:10px;">' + (s.ago || '') + '</span></div>'
    ).join('');

    overlay.innerHTML = '<div style="background:#0f172a;border:1px solid #334155;border-radius:12px;padding:24px;max-width:420px;width:90%;max-height:80vh;overflow-y:auto;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
        '<h3 style="color:#e2e8f0;margin:0;font-size:16px;">Save Results</h3>' +
        '<button id="output-close" style="background:none;border:none;color:#64748b;font-size:20px;cursor:pointer;">&times;</button>' +
      '</div>' +
      '<div style="color:#94a3b8;font-size:12px;margin-bottom:16px;">' +
        'Scraped: <strong style="color:#38bdf8;">' + (sessionData.url || 'Unknown') + '</strong><br>' +
        (sessionData.word_count ? sessionData.word_count + ' words, ' : '') +
        linkCount + ' links, ' + mediaCount + ' media, ' + formCount + ' forms' +
      '</div>' +
      '<div style="margin-bottom:12px;">' +
        '<label style="display:block;color:#94a3b8;font-size:11px;margin-bottom:4px;"><input type="radio" name="output-dest" value="new" checked style="margin-right:6px;">Create new sheet (auto-named)</label>' +
        '<label style="display:block;color:#94a3b8;font-size:11px;margin-bottom:4px;"><input type="radio" name="output-dest" value="existing" style="margin-right:6px;">Use existing sheet:</label>' +
        '<input id="output-sheet-url" type="text" placeholder="Paste Google Sheet URL..." style="width:100%;padding:6px 8px;background:#1e293b;border:1px solid #334155;border-radius:6px;color:#e2e8f0;font-size:12px;margin-top:4px;display:none;">' +
      '</div>' +
      (recentHtml ? '<div style="margin-bottom:12px;"><div style="color:#64748b;font-size:10px;margin-bottom:4px;">Recent sheets:</div>' + recentHtml + '</div>' : '') +
      '<div style="margin-bottom:16px;">' +
        '<label style="display:block;color:#94a3b8;font-size:11px;margin:3px 0;"><input type="checkbox" id="output-screenshot" checked> Include screenshot</label>' +
        '<label style="display:block;color:#94a3b8;font-size:11px;margin:3px 0;"><input type="checkbox" id="output-raw-html" checked> Include raw HTML</label>' +
        '<label style="display:block;color:#94a3b8;font-size:11px;margin:3px 0;"><input type="checkbox" id="output-media" checked> Upload media to Drive</label>' +
        '<label style="display:block;color:#94a3b8;font-size:11px;margin:3px 0;"><input type="checkbox" id="output-costs" checked> Log API costs</label>' +
      '</div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
        '<button id="output-cancel" style="padding:8px 16px;background:#334155;color:#e2e8f0;border:none;border-radius:6px;font-size:13px;cursor:pointer;">Cancel</button>' +
        '<button id="output-save" style="padding:8px 16px;background:#38bdf8;color:#0f172a;border:none;border-radius:6px;font-weight:600;font-size:13px;cursor:pointer;">Save to Google Sheets</button>' +
      '</div>' +
      '<div id="output-status" style="color:#22c55e;font-size:11px;margin-top:8px;text-align:center;"></div>' +
    '</div>';

    document.body.appendChild(overlay);
    this._overlay = overlay;

    // Wire events
    overlay.querySelector('#output-close').onclick = () => this.hide();
    overlay.querySelector('#output-cancel').onclick = () => this.hide();

    // Show/hide URL input based on radio
    overlay.querySelectorAll('input[name="output-dest"]').forEach(r => {
      r.onchange = () => {
        overlay.querySelector('#output-sheet-url').style.display = r.value === 'existing' ? '' : 'none';
      };
    });

    // Click recent sheet = select existing + fill URL
    overlay.querySelectorAll('.recent-sheet').forEach(el => {
      el.onclick = () => {
        overlay.querySelector('input[name="output-dest"][value="existing"]').checked = true;
        overlay.querySelector('#output-sheet-url').style.display = '';
        overlay.querySelector('#output-sheet-url').value = 'https://docs.google.com/spreadsheets/d/' + el.dataset.id;
      };
    });

    // Save button
    overlay.querySelector('#output-save').onclick = () => this._doSave(sessionData);
  },

  async _doSave(sessionData) {
    const status = this._overlay.querySelector('#output-status');
    const saveBtn = this._overlay.querySelector('#output-save');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    status.textContent = 'Initializing...';
    status.style.color = '#38bdf8';

    const dest = this._overlay.querySelector('input[name="output-dest"]:checked').value;
    const includeScreenshot = this._overlay.querySelector('#output-screenshot').checked;
    const includeRawHtml = this._overlay.querySelector('#output-raw-html').checked;
    const includeMedia = this._overlay.querySelector('#output-media').checked;

    const payload = {
      ...sessionData,
      include_screenshot: includeScreenshot,
      raw_html: includeRawHtml ? sessionData.raw_html : null,
      media_items: includeMedia ? sessionData.media_items : []
    };

    if (dest === 'existing') {
      const url = this._overlay.querySelector('#output-sheet-url').value;
      const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (match) {
        payload.spreadsheet_id = match[1];
      }
    }

    try {
      const result = await window.sendToBackground('SAVE_SESSION', payload);
      if (result && result.success) {
        status.textContent = 'Saved! ' + (result.steps || []).join(' > ');
        status.style.color = '#22c55e';
        // Add to recent sheets
        if (result.session) {
          this._addRecent(result.session);
        }
        setTimeout(() => this.hide(), 2000);
      } else {
        status.textContent = 'Error: ' + (result?.error || 'Unknown');
        status.style.color = '#ef4444';
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save to Google Sheets';
      }
    } catch (e) {
      status.textContent = 'Error: ' + e.message;
      status.style.color = '#ef4444';
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save to Google Sheets';
    }
  },

  async _addRecent(session) {
    this._recentSheets.unshift({
      name: session.session_name || 'Session',
      id: session.spreadsheet_id,
      url: session.spreadsheet_url,
      ago: 'just now'
    });
    this._recentSheets = this._recentSheets.slice(0, 10);
    await chrome.storage.local.set({ danman_recent_sheets: this._recentSheets });
  },

  hide() {
    if (this._overlay) { this._overlay.remove(); this._overlay = null; }
  }
};
