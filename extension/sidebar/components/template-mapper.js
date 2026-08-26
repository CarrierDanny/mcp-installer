/**
 * Template Mapper — scan form fields, map to sheet columns, save/load templates.
 */
const TemplateMapper = {
  _templates: [],

  async loadTemplates() {
    // Load from local storage first (instant)
    const local = await chrome.storage.local.get('danman_form_templates');
    this._templates = local.danman_form_templates || [];
    // Also try backend
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'BACKEND_POST', payload: { action: 'get_templates' } });
      if (resp && resp.success && resp.templates) {
        this._templates = resp.templates;
        await chrome.storage.local.set({ danman_form_templates: this._templates });
      }
    } catch (_) {}
    return this._templates;
  },

  checkForMatch(currentUrl) {
    for (const tpl of this._templates) {
      const patterns = tpl.url_patterns || [];
      for (const pattern of patterns) {
        // Simple wildcard matching: * matches any characters
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
        if (regex.test(currentUrl)) return tpl;
      }
    }
    return null;
  },

  async fetchSheetHeaders(sheetUrl) {
    // Parse spreadsheet ID from URL
    const match = sheetUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (!match) throw new Error('Invalid Google Sheet URL');
    const spreadsheetId = match[1];

    const resp = await chrome.runtime.sendMessage({
      type: 'SHEETS_PREVIEW',
      payload: { spreadsheet_id: spreadsheetId }
    });
    if (!resp || !resp.headers) throw new Error('Could not fetch sheet headers');
    return { spreadsheetId, headers: resp.headers, sheetName: resp.sheet_name, gid: resp.gid };
  },

  showMappingUI(container, formFields, headers, onSave) {
    container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'padding:12px;';

    // Header
    wrapper.innerHTML = '<div style="color:#e2e8f0;font-size:14px;font-weight:600;margin-bottom:12px;">Map Form Fields to Sheet Columns</div>';

    // Table
    const table = document.createElement('div');
    table.style.cssText = 'display:grid;grid-template-columns:1fr auto 1fr;gap:6px;align-items:center;';

    // Table headers
    table.innerHTML = '<div style="color:#64748b;font-size:10px;font-weight:600;">FIELD ID</div>' +
      '<div style="color:#64748b;font-size:10px;text-align:center;">→</div>' +
      '<div style="color:#64748b;font-size:10px;font-weight:600;">SHEET COLUMN</div>';

    const mappings = {};

    formFields.forEach(field => {
      // Field info
      const fieldDiv = document.createElement('div');
      fieldDiv.style.cssText = 'background:#1e293b;padding:6px 8px;border-radius:4px;font-size:11px;color:#e2e8f0;';
      fieldDiv.innerHTML = '<strong>' + (field.id || field.name || 'unnamed') + '</strong>' +
        '<br><span style="color:#64748b;font-size:10px;">' + (field.type || 'text') +
        (field.placeholder ? ' | ' + field.placeholder : '') + '</span>';

      // Arrow
      const arrow = document.createElement('div');
      arrow.style.cssText = 'color:#38bdf8;text-align:center;font-size:14px;';
      arrow.textContent = '\u2192';

      // Column dropdown
      const select = document.createElement('select');
      select.style.cssText = 'background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:4px;padding:6px;font-size:11px;width:100%;';
      select.innerHTML = '<option value="">-- skip --</option>';
      headers.forEach((h, i) => {
        const opt = document.createElement('option');
        opt.value = String.fromCharCode(65 + i); // A, B, C...
        opt.textContent = h;
        // Auto-match by name similarity
        const fieldLabel = (field.id || field.name || '').toLowerCase();
        if (h.toLowerCase().includes(fieldLabel) || fieldLabel.includes(h.toLowerCase())) {
          opt.selected = true;
        }
        select.appendChild(opt);
      });

      select.onchange = () => {
        const fieldKey = field.id || field.name;
        if (select.value) {
          mappings[fieldKey] = { column: select.value, header: headers[select.value.charCodeAt(0) - 65] };
        } else {
          delete mappings[fieldKey];
        }
      };

      // Trigger initial mapping for auto-matched
      if (select.value) {
        const fieldKey = field.id || field.name;
        mappings[fieldKey] = { column: select.value, header: headers[select.value.charCodeAt(0) - 65] };
      }

      table.appendChild(fieldDiv);
      table.appendChild(arrow);
      table.appendChild(select);
    });

    wrapper.appendChild(table);

    // Save as template section
    const saveSection = document.createElement('div');
    saveSection.style.cssText = 'margin-top:16px;padding-top:12px;border-top:1px solid #334155;';
    saveSection.innerHTML = '<div style="color:#e2e8f0;font-size:12px;font-weight:600;margin-bottom:8px;">Save as Template</div>' +
      '<input id="tpl-name" type="text" placeholder="Template name..." style="width:100%;padding:6px 8px;background:#1e293b;border:1px solid #334155;border-radius:6px;color:#e2e8f0;font-size:12px;margin-bottom:6px;">' +
      '<input id="tpl-urls" type="text" placeholder="URL patterns (comma-separated, use * for wildcards)" style="width:100%;padding:6px 8px;background:#1e293b;border:1px solid #334155;border-radius:6px;color:#e2e8f0;font-size:12px;margin-bottom:8px;">' +
      '<button id="tpl-save-btn" style="padding:6px 14px;background:#38bdf8;color:#0f172a;border:none;border-radius:6px;font-weight:600;font-size:12px;cursor:pointer;">Save Template</button>' +
      '<span id="tpl-save-status" style="margin-left:8px;color:#22c55e;font-size:11px;"></span>';

    wrapper.appendChild(saveSection);
    container.appendChild(wrapper);

    // Wire save button
    container.querySelector('#tpl-save-btn').onclick = async () => {
      const name = container.querySelector('#tpl-name').value.trim();
      const urls = container.querySelector('#tpl-urls').value.split(',').map(u => u.trim()).filter(Boolean);
      if (!name) { container.querySelector('#tpl-save-status').textContent = 'Enter a name'; return; }

      if (onSave) onSave(name, urls, mappings);

      // Save locally
      const template = { name, url_patterns: urls, field_mappings: mappings, created_at: new Date().toISOString(), last_used: new Date().toISOString() };
      this._templates.push(template);
      await chrome.storage.local.set({ danman_form_templates: this._templates });

      // Save to backend
      try {
        await chrome.runtime.sendMessage({ type: 'BACKEND_POST', payload: { action: 'save_template', ...template } });
      } catch (_) {}

      container.querySelector('#tpl-save-status').textContent = '\u2713 Saved';
    };

    return mappings;
  }
};
