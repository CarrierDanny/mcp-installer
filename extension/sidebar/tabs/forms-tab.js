/**
 * VERSION: V002R015
 * DATE: 2026-09-15
 * CHANGE: DANMAN_ELEMENT_PICKED read from authenticated gpd-message dispatch
 * HISTORY:
 *   V001R1283 2026-08-26 Baseline import + Firefox messaging/clipboard fixes (unstamped)
 */
// sidebar/tabs/forms-tab.js — Form Scanner Tab
(function() {
  'use strict';

  const container = document.getElementById('tab-forms');
  if (!container) return;

  let progressBar = null;
  let currentForms = [];
  let templates = {};
  let autoSubmitEnabled = false;
  let submitButtonSelector = '';

  container.innerHTML = `
    <div class="tab-title">&#128203; Form Scanner</div>
    <div class="tab-desc">Detect and interact with forms on the current page</div>

    <div class="card">
      <div class="card-header">
        <span class="section-title">Scan</span>
      </div>
      <div class="toggle-row">
        <label style="margin-bottom:0;">Include hidden fields</label>
        <div class="toggle">
          <input type="checkbox" id="forms-include-hidden">
          <span class="slider"></span>
        </div>
      </div>
      <div id="forms-progress" style="margin-top:8px;"></div>
      <button class="btn btn-primary btn-block mt-2" id="btn-scan-forms">&#128203; Scan Forms</button>
    </div>

    <div id="forms-results" style="display:none;">
      <div class="stat-row">
        <div class="stat-box">
          <div class="value" id="forms-count">0</div>
          <div class="label">Forms</div>
        </div>
        <div class="stat-box">
          <div class="value" id="fields-count">0</div>
          <div class="label">Fields</div>
        </div>
        <div class="stat-box">
          <div class="value" id="required-count">0</div>
          <div class="label">Required</div>
        </div>
      </div>

      <div id="forms-list"></div>

      <div class="card">
        <div class="card-header">
          <span class="section-title">Templates</span>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:8px;">
          <input type="text" id="template-name" placeholder="Template name..." style="flex:1;">
          <button class="btn btn-secondary btn-sm" id="btn-save-template">Save</button>
        </div>
        <div id="template-list" style="margin-bottom:8px;"></div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-secondary" id="btn-load-template" style="flex:1;" disabled>Load Template</button>
          <button class="btn btn-success" id="btn-autofill" style="flex:1;" disabled>&#9889; Autofill</button>
        </div>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:12px;">
        <button class="btn btn-secondary" id="btn-copy-schema" style="flex:1;">&#128203; Copy Schema</button>
        <button class="btn btn-secondary" id="btn-push-forms" style="flex:1;">&#128202; Push to Sheets</button>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:12px;">
        <button class="btn btn-primary" id="btn-save-to-drive" style="flex:1;">&#128190; Save Form Fields to Drive</button>
        <button class="btn btn-secondary" id="btn-save-json-drive" style="flex:1;">&#128196; Save JSON to Drive</button>
      </div>
    </div>

    <!-- Sheet-Backed Template -->
    <div class="card" id="card-sheet-template">
      <div class="card-header">
        <span class="section-title">Sheet-Backed Template</span>
      </div>
      <div class="form-group">
        <label>Google Sheets URL</label>
        <div style="display:flex;gap:6px;">
          <input type="text" id="formfill-sheet-url" placeholder="Paste full Google Sheets URL with GID..." style="flex:1;">
          <button class="btn btn-secondary btn-sm" id="btn-formfill-fetch-columns">Fetch</button>
        </div>
        <div id="formfill-parsed-info" style="display:none;font-size:11px;color:#94a3b8;margin-top:4px;font-family:monospace;"></div>
      </div>
      <div id="formfill-mapping-area" style="display:none;">
        <label style="font-size:12px;color:#94a3b8;margin-bottom:8px;display:block;">Map Form Fields to Sheet Columns</label>
        <div id="formfill-mapping-rows"></div>
        <div id="formfill-row-picker" style="display:none;margin-top:12px;">
          <label style="font-size:12px;color:#94a3b8;margin-bottom:6px;display:block;">Select Row to Inject</label>
          <div id="formfill-row-table" style="max-height:200px;overflow:auto;border:1px solid #334155;border-radius:6px;"></div>
          <div style="display:flex;gap:6px;margin-top:8px;">
            <button class="btn btn-secondary btn-sm" id="btn-formfill-prev-row">&#9664; Prev</button>
            <span id="formfill-row-indicator" style="flex:1;text-align:center;font-size:12px;color:#94a3b8;line-height:28px;">Row 1 of 0</span>
            <button class="btn btn-secondary btn-sm" id="btn-formfill-next-row">Next &#9654;</button>
          </div>
        </div>
        <div style="display:flex;gap:6px;margin-top:12px;">
          <input type="text" id="formfill-template-name" placeholder="Template name..." style="flex:1;">
          <div style="margin:8px 0;">
            <label style="color:#94a3b8;font-size:11px;display:block;margin-bottom:4px;">Auto-suggest on these URLs</label>
            <div id="template-url-list"></div>
            <button id="btn-add-template-url" style="padding:3px 8px;background:#334155;color:#e2e8f0;border:none;border-radius:4px;font-size:10px;cursor:pointer;margin-top:4px;">+ Add URL</button>
          </div>
          <button class="btn btn-accent btn-sm" id="btn-formfill-save-template">Save</button>
        </div>
      </div>
    </div>

    <!-- Injection Controls -->
    <div class="card" id="card-inject-controls" style="display:none;">
      <div class="card-header">
        <span class="section-title">Injection Controls</span>
      </div>
      <div class="form-group">
        <label style="font-size:12px;color:#94a3b8;">Injection Mode</label>
        <div style="display:flex;gap:4px;">
          <label style="flex:1;text-align:center;padding:6px;border:1px solid #334155;border-radius:4px;cursor:pointer;font-size:11px;">
            <input type="radio" name="inject-mode" value="sequential" checked style="display:none;">
            <span>Sequential AutoJect</span>
          </label>
          <label style="flex:1;text-align:center;padding:6px;border:1px solid #334155;border-radius:4px;cursor:pointer;font-size:11px;">
            <input type="radio" name="inject-mode" value="refresh" style="display:none;">
            <span>Inject on Refresh</span>
          </label>
        </div>
      </div>
      <div class="toggle-row">
        <label style="margin-bottom:0;font-size:12px;">Skip filled fields</label>
        <div class="toggle"><input type="checkbox" id="formfill-skip-filled" checked><span class="slider"></span></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:6px;">
        <label style="font-size:11px;color:#64748b;cursor:pointer;">
          <input type="radio" name="skip-mode" value="simple" checked> Simple
        </label>
        <label style="font-size:11px;color:#64748b;cursor:pointer;">
          <input type="radio" name="skip-mode" value="ai_enhanced"> AI-Enhanced
        </label>
      </div>
      <div class="toggle-row" style="margin-top:8px;">
        <label style="margin-bottom:0;font-size:12px;">Overwrite existing data</label>
        <div class="toggle"><input type="checkbox" id="formfill-overwrite"><span class="slider"></span></div>
      </div>
      <div style="display:flex;gap:6px;margin-top:12px;">
        <button class="btn btn-primary btn-sm" id="btn-inject-next" style="flex:1;">&#9654; Inject Next</button>
        <button class="btn btn-accent btn-sm" id="btn-inject-all" style="flex:1;">&#9654;&#9654; Inject All</button>
      </div>
      <button class="btn btn-secondary btn-block btn-sm" id="btn-end-session" style="margin-top:8px;">&#9632; End Session</button>
      <div style="margin-top:10px;padding-top:10px;border-top:1px solid #334155;">
        <label style="display:flex;align-items:center;gap:6px;color:#94a3b8;font-size:12px;cursor:pointer;">
          <input type="checkbox" id="auto-submit-toggle"> Auto-Submit after injection
        </label>
        <div id="auto-submit-config" style="display:none;margin-top:8px;">
          <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
            <button id="btn-pick-submit" style="padding:4px 10px;background:#334155;color:#e2e8f0;border:none;border-radius:4px;font-size:11px;cursor:pointer;">&#127919; Pick Element</button>
            <span id="submit-selector-display" style="color:#64748b;font-size:10px;font-family:monospace;">Not mapped</span>
          </div>
          <div id="auto-submit-warning" style="display:none;background:#7f1d1d;border:1px solid #ef4444;border-radius:6px;padding:10px;margin-top:6px;">
            <div style="color:#fca5a5;font-size:11px;font-weight:600;">&#9888;&#65039; AUTO-SUBMIT WARNING</div>
            <div style="color:#fca5a5;font-size:10px;margin-top:4px;">DANMAN will automatically click the submit/save button after each row injection. Forms will be SUBMITTED without your review. Ensure your data is correct.</div>
            <label style="display:flex;align-items:center;gap:6px;color:#fca5a5;font-size:11px;cursor:pointer;margin-top:6px;">
              <input type="checkbox" id="confirm-auto-submit"> I understand. Enable auto-submit.
            </label>
          </div>
        </div>
      </div>
    </div>
  `;

  progressBar = new ProgressBar(document.getElementById('forms-progress'));
  progressBar.hide();

  let selectedTemplate = null;

  // Load saved templates on init
  loadTemplates();

  // Scan button
  document.getElementById('btn-scan-forms').addEventListener('click', () => {
    const btn = document.getElementById('btn-scan-forms');
    btn.disabled = true;
    btn.textContent = 'Scanning...';
    progressBar.start(2);
    progressBar.update(1, 'Scanning page for forms...');

    const includeHidden = document.getElementById('forms-include-hidden').checked;
    window.parent.postMessage({ type: 'GPD_REQUEST_FORMS', includeHidden }, '*');

    // Timeout fallback
    setTimeout(() => {
      if (btn.disabled) {
        btn.disabled = false;
        btn.innerHTML = '&#128203; Scan Forms';
        progressBar.error('Timed out');
        setTimeout(() => progressBar.hide(), 2000);
        Toast.warning('Form scan timed out.');
      }
    }, 15000);
  });

  // Save template
  document.getElementById('btn-save-template').addEventListener('click', () => {
    const nameInput = document.getElementById('template-name');
    const name = nameInput.value.trim();
    if (!name) return Toast.warning('Enter a template name');
    if (currentForms.length === 0) return Toast.warning('No forms scanned yet');

    // Collect current values from all form fields
    const templateData = {};
    currentForms.forEach((form, fi) => {
      (form.fields || []).forEach(field => {
        const key = field.name || field.id || `form${fi}_field_${field.type}`;
        if (field.currentValue !== undefined && field.currentValue !== '') {
          templateData[key] = field.currentValue;
        }
      });
    });

    if (Object.keys(templateData).length === 0) {
      return Toast.warning('No field values to save');
    }

    // Save via service worker
    window.sendToBackground('SAVE_AUTOFILL_TEMPLATE', { domain: name, template: templateData }).then(() => {
      templates[name] = templateData;
      nameInput.value = '';
      renderTemplateList();
      Toast.success(`Template "${name}" saved`);
    }).catch(err => {
      // Fallback: save locally
      templates[name] = templateData;
      try { localStorage.setItem('gpd_form_templates', JSON.stringify(templates)); } catch(e) {}
      nameInput.value = '';
      renderTemplateList();
      Toast.success(`Template "${name}" saved locally`);
    });
  });

  // Load template button
  document.getElementById('btn-load-template').addEventListener('click', () => {
    if (!selectedTemplate || !templates[selectedTemplate]) return Toast.warning('Select a template first');
    Toast.info(`Template "${selectedTemplate}" loaded. Click Autofill to apply.`);
    document.getElementById('btn-autofill').disabled = false;
  });

  // Autofill button
  document.getElementById('btn-autofill').addEventListener('click', () => {
    if (!selectedTemplate || !templates[selectedTemplate]) return Toast.warning('No template selected');
    window.parent.postMessage({
      type: 'GPD_AUTOFILL',
      data: templates[selectedTemplate]
    }, '*');
    Toast.success('Autofill data sent to page');
  });

  // Copy schema
  document.getElementById('btn-copy-schema').addEventListener('click', () => {
    if (currentForms.length === 0) return Toast.warning('No forms to export');
    const schema = currentForms.map((form, i) => ({
      formIndex: i,
      action: form.action || '',
      method: form.method || '',
      fieldCount: (form.fields || []).length,
      fields: (form.fields || []).map(f => ({
        type: f.type,
        name: f.name,
        id: f.id,
        label: f.label,
        required: f.required,
        placeholder: f.placeholder,
        options: f.options,
        currentValue: f.currentValue
      }))
    }));
    window.copyToClipboard(JSON.stringify(schema, null, 2));
    Toast.success('Form schema copied to clipboard');
  });

  // Push to Sheets
  document.getElementById('btn-push-forms').addEventListener('click', () => {
    if (currentForms.length === 0) return Toast.warning('No forms to push');
    const headers = ['Form #', 'Action', 'Method', 'Field Type', 'Name', 'ID', 'Label', 'Required', 'Placeholder', 'Options', 'Current Value'];
    const rows = [];
    currentForms.forEach((form, fi) => {
      (form.fields || []).forEach(field => {
        rows.push([
          fi + 1,
          form.action || '',
          form.method || '',
          field.type || '',
          field.name || '',
          field.id || '',
          field.label || '',
          field.required ? 'Yes' : 'No',
          field.placeholder || '',
          (field.options || []).join(', '),
          field.currentValue || ''
        ]);
      });
    });
    const values = [headers, ...rows];
    window.sendToBackground('SHEETS_APPEND', { values }).then(() => {
      Toast.success('Form data pushed to Sheets');
    }).catch(err => Toast.error(err.message || 'Failed to push to Sheets'));
  });

  // Save Form Fields to Drive as formatted HTML
  document.getElementById('btn-save-to-drive').addEventListener('click', async () => {
    if (currentForms.length === 0) return Toast.warning('No forms to save — scan first');

    const btn = document.getElementById('btn-save-to-drive');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
      // Build form data structure for Drive
      const formData = currentForms.map((form, fi) => ({
        formIndex: fi,
        action: form.action || '',
        method: form.method || '',
        id: form.id || '',
        name: form.name || '',
        fields: (form.fields || []).map(f => ({
          id: f.id || f.name || '',
          name: f.name || '',
          type: f.type || 'text',
          placeholder: f.placeholder || '',
          required: f.required || false,
          label: f.label || '',
          options: f.options || [],
          groupOptions: f.groupOptions || [],
          currentValue: f.currentValue || f.value || '',
          pattern: f.pattern || '',
          min: f.min || '',
          max: f.max || '',
          maxLength: f.maxLength || '',
          acceptedValueType: classifyFieldType(f)
        }))
      }));

      const pageUrl = window.parent ? window.parent.location?.href || 'unknown' : 'unknown';

      const result = await window.sendToBackground('DRIVE_SAVE_FORM_FIELDS', {
        formData,
        pageUrl
      });

      if (result && result.id) {
        const link = result.link || ('https://drive.google.com/file/d/' + result.id + '/view');
        Toast.success('Form fields saved to Drive!');

        // Show link to user
        const linkEl = document.createElement('div');
        linkEl.style.cssText = 'margin:8px 0;padding:8px;background:#0f2b1a;border:1px solid #166534;border-radius:6px;font-size:11px;';
        linkEl.innerHTML = '<span style="color:#86efac;">Saved!</span> <a href="' + link + '" target="_blank" style="color:#38bdf8;text-decoration:underline;">Open in Drive</a>';
        btn.parentElement.insertAdjacentElement('afterend', linkEl);
        setTimeout(() => linkEl.remove(), 10000);
      } else {
        Toast.error('Failed to save — check Drive settings');
      }
    } catch (err) {
      Toast.error(err.message || 'Failed to save to Drive');
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  });

  // Save JSON to Drive
  document.getElementById('btn-save-json-drive').addEventListener('click', async () => {
    if (currentForms.length === 0) return Toast.warning('No forms to save — scan first');

    const btn = document.getElementById('btn-save-json-drive');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
      const schema = currentForms.map((form, i) => ({
        formIndex: i,
        action: form.action || '',
        method: form.method || '',
        fieldCount: (form.fields || []).length,
        fields: (form.fields || []).map(f => ({
          type: f.type,
          name: f.name,
          id: f.id,
          label: f.label,
          required: f.required,
          placeholder: f.placeholder,
          options: f.options,
          currentValue: f.currentValue,
          acceptedValueType: classifyFieldType(f)
        }))
      }));

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      let hostname = 'form-fields';
      try {
        const url = new URL(window.parent?.location?.href || '');
        hostname = url.hostname.replace(/\./g, '_');
      } catch(_) {}

      const result = await window.sendToBackground('DRIVE_SAVE_JSON', {
        data: schema,
        filename: 'FormFields_' + hostname + '_' + timestamp + '.json'
      });

      if (result && result.id) {
        Toast.success('JSON saved to Drive');
      } else {
        Toast.error('Failed to save JSON');
      }
    } catch (err) {
      Toast.error(err.message || 'Failed to save JSON to Drive');
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  });

  // Helper: classify what type of value a field accepts
  function classifyFieldType(field) {
    const type = (field.type || 'text').toLowerCase();
    switch (type) {
      case 'number': case 'range': return 'Number';
      case 'email': return 'Email Address';
      case 'tel': return 'Phone Number';
      case 'url': return 'URL';
      case 'date': return 'Date';
      case 'datetime-local': return 'Date & Time';
      case 'time': return 'Time';
      case 'month': return 'Month';
      case 'week': return 'Week';
      case 'color': return 'Color Hex Code';
      case 'file': return 'File Upload';
      case 'password': return 'Password (masked)';
      case 'search': return 'Search Text';
      case 'checkbox': return 'Checkmark (Yes/No)';
      case 'radio': return 'Single Choice';
      case 'select':
        if (field.options && field.options.length > 0) {
          return 'Dropdown: ' + field.options.map(o => o.text || o.value).join(', ');
        }
        return 'Dropdown';
      case 'textarea': return 'Long Text';
      case 'hidden': return 'Hidden Value';
      default:
        if (field.maxLength && field.maxLength < 100) return 'Short Answer';
        if (field.pattern) return 'Pattern: ' + field.pattern;
        return 'Short Answer';
    }
  }

  // Listen for form scan results
  window.addEventListener('gpd-message', (e) => {
    if (e.detail.type === 'GPD_FORMS_RESULT') {
      displayResults(e.detail.data);
    }
    if (e.detail.type === 'GPD_AUTOFILL_DONE') {
      Toast.success('Autofill complete');
    }
  });

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function displayResults(data) {
    currentForms = data.forms || [];

    const btn = document.getElementById('btn-scan-forms');
    btn.disabled = false;
    btn.innerHTML = '&#128203; Scan Forms';

    progressBar.complete(`${currentForms.length} form${currentForms.length !== 1 ? 's' : ''} found`);
    setTimeout(() => progressBar.hide(), 1500);

    // Stats
    const totalFields = currentForms.reduce((sum, f) => sum + (f.fields || []).length, 0);
    const totalRequired = currentForms.reduce((sum, f) => sum + (f.fields || []).filter(fd => fd.required).length, 0);

    document.getElementById('forms-results').style.display = 'block';
    document.getElementById('forms-count').textContent = currentForms.length;
    document.getElementById('fields-count').textContent = totalFields;
    document.getElementById('required-count').textContent = totalRequired;

    // Render each form
    const formsList = document.getElementById('forms-list');
    if (currentForms.length === 0) {
      formsList.innerHTML = '<div class="card"><div class="empty-state"><div class="icon">&#128203;</div><div class="message">No forms found on this page</div></div></div>';
      return;
    }

    formsList.innerHTML = currentForms.map((form, fi) => {
      const fields = form.fields || [];
      const methodBadge = (form.method || 'GET').toUpperCase();
      const methodColor = methodBadge === 'POST' ? 'badge-green' : 'badge-cyan';

      return `
        <div class="card">
          <div class="card-header" style="cursor:pointer;" data-form-toggle="${fi}">
            <div>
              <span class="section-title" style="margin-bottom:0;">Form ${fi + 1}</span>
              <span class="badge ${methodColor}" style="margin-left:6px;">${escapeHtml(methodBadge)}</span>
              <span class="badge badge-yellow" style="margin-left:4px;">${fields.length} field${fields.length !== 1 ? 's' : ''}</span>
            </div>
            <span class="text-muted form-arrow" id="form-arrow-${fi}">&#9660;</span>
          </div>
          ${form.action ? `<div class="text-muted text-xs truncate" style="margin-bottom:6px;" title="${escapeHtml(form.action)}">Action: ${escapeHtml(form.action)}</div>` : ''}
          ${form.name ? `<div class="text-muted text-xs" style="margin-bottom:6px;">Name: ${escapeHtml(form.name)}</div>` : ''}
          ${form.id ? `<div class="text-muted text-xs" style="margin-bottom:6px;">ID: ${escapeHtml(form.id)}</div>` : ''}
          <div class="form-fields-wrapper" id="form-fields-${fi}" style="max-height:0;overflow:hidden;transition:max-height 0.3s ease;">
            <div style="overflow-x:auto;margin-top:8px;">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Name / ID</th>
                    <th>Label</th>
                    <th>Values</th>
                    <th>Current</th>
                    <th>Req</th>
                  </tr>
                </thead>
                <tbody>
                  ${fields.length > 0 ? fields.map(f => {
                    const typeIcons = {
                      text: '&#128221;', email: '&#128231;', password: '&#128274;', number: '#',
                      tel: '&#128222;', url: '&#128279;', textarea: '&#128196;', select: '&#9660;',
                      checkbox: '&#9745;', radio: '&#9898;', file: '&#128193;', date: '&#128197;',
                      hidden: '&#128065;', submit: '&#10003;', button: '&#9654;', search: '&#128269;',
                      range: '&#8596;', color: '&#127912;'
                    };
                    const icon = typeIcons[f.type] || '&#128300;';
                    const nameId = f.name || f.id || '-';
                    const accepted = formatAcceptedValues(f);
                    const reqBadge = f.required
                      ? '<span class="badge badge-red" style="font-size:10px;">Yes</span>'
                      : '<span class="text-muted" style="font-size:10px;">No</span>';
                    return `
                      <tr>
                        <td title="${escapeHtml(f.type)}">${icon} <span style="font-size:11px;">${escapeHtml(f.type)}</span></td>
                        <td class="font-mono" style="font-size:11px;" title="${escapeHtml(nameId)}">${escapeHtml(nameId)}</td>
                        <td style="font-size:11px;" title="${escapeHtml(f.label || '')}">${escapeHtml(f.label || '-')}</td>
                        <td style="font-size:11px;max-width:120px;" title="${escapeHtml(accepted)}">${escapeHtml(accepted)}</td>
                        <td style="font-size:11px;max-width:100px;" title="${escapeHtml(f.currentValue || '')}">${escapeHtml(f.currentValue || '-')}</td>
                        <td>${reqBadge}</td>
                      </tr>
                    `;
                  }).join('') : '<tr><td colspan="6" class="text-muted" style="text-align:center;">No fields detected</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Setup form toggles
    document.querySelectorAll('[data-form-toggle]').forEach(el => {
      el.addEventListener('click', () => {
        const fi = el.getAttribute('data-form-toggle');
        const wrapper = document.getElementById(`form-fields-${fi}`);
        const arrow = document.getElementById(`form-arrow-${fi}`);
        const isOpen = wrapper.style.maxHeight !== '0px';
        wrapper.style.maxHeight = isOpen ? '0px' : '600px';
        wrapper.style.overflowY = isOpen ? 'hidden' : 'auto';
        if (arrow) arrow.innerHTML = isOpen ? '&#9660;' : '&#9650;';
      });
    });

    Toast.success(`Found ${currentForms.length} form${currentForms.length !== 1 ? 's' : ''} with ${totalFields} fields`);
  }

  function formatAcceptedValues(field) {
    if (field.options && field.options.length > 0) {
      const opts = field.options.slice(0, 5).join(', ');
      return field.options.length > 5 ? opts + ` (+${field.options.length - 5})` : opts;
    }
    if (field.min !== undefined || field.max !== undefined) {
      const parts = [];
      if (field.min !== undefined) parts.push('min: ' + field.min);
      if (field.max !== undefined) parts.push('max: ' + field.max);
      if (field.step !== undefined) parts.push('step: ' + field.step);
      return parts.join(', ');
    }
    if (field.pattern) return 'pattern: ' + field.pattern;
    if (field.maxlength) return 'maxlen: ' + field.maxlength;
    if (field.accept) return field.accept;
    if (field.placeholder) return field.placeholder;
    return '-';
  }

  function loadTemplates() {
    window.sendToBackground('GET_AUTOFILL_TEMPLATES', {}).then(result => {
      if (result && typeof result === 'object') {
        templates = result;
        renderTemplateList();
      }
    }).catch(() => {
      // Fallback: load from localStorage
      try {
        const saved = localStorage.getItem('gpd_form_templates');
        if (saved) templates = JSON.parse(saved);
      } catch(e) {}
      renderTemplateList();
    });
  }

  function renderTemplateList() {
    const list = document.getElementById('template-list');
    const names = Object.keys(templates);
    const loadBtn = document.getElementById('btn-load-template');

    if (names.length === 0) {
      list.innerHTML = '<div class="text-muted text-xs" style="padding:4px 0;">No saved templates</div>';
      loadBtn.disabled = true;
      return;
    }

    list.innerHTML = names.map(name => `
      <div class="result-item" style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;margin-bottom:4px;${selectedTemplate === name ? 'border-color:#38bdf8;' : ''}" data-template="${escapeHtml(name)}">
        <div>
          <div style="font-size:12px;color:#e2e8f0;">${escapeHtml(name)}</div>
          <div class="text-muted text-xs">${Object.keys(templates[name]).length} fields</div>
        </div>
        <button class="btn btn-danger btn-sm" data-delete-template="${escapeHtml(name)}" style="padding:3px 8px;font-size:11px;">&#10005;</button>
      </div>
    `).join('');

    // Select template
    list.querySelectorAll('[data-template]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-delete-template]')) return;
        selectedTemplate = el.getAttribute('data-template');
        loadBtn.disabled = false;
        document.getElementById('btn-autofill').disabled = false;
        renderTemplateList();
      });
    });

    // Delete template
    list.querySelectorAll('[data-delete-template]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const name = el.getAttribute('data-delete-template');
        delete templates[name];
        if (selectedTemplate === name) {
          selectedTemplate = null;
          loadBtn.disabled = true;
          document.getElementById('btn-autofill').disabled = true;
        }
        // Persist deletion
        window.sendToBackground('SAVE_AUTOFILL_TEMPLATE', { name, data: null, deleteKey: true }).catch(() => {});
        try { localStorage.setItem('gpd_form_templates', JSON.stringify(templates)); } catch(e) {}
        renderTemplateList();
        Toast.info(`Template "${name}" deleted`);
      });
    });
  }

  // =============================================
  // SHEET-BACKED TEMPLATE SYSTEM (Tasks 5+6+9)
  // =============================================

  let sheetHeaders = [];
  let sheetAllRows = [];
  let currentArmedRow = 1;

  function parseGoogleSheetsUrl(input) {
    var urlMatch = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    var gidMatch = input.match(/[?#&]gid=(\d+)/);
    return {
      spreadsheet_id: urlMatch ? urlMatch[1] : input.trim(),
      gid: gidMatch ? gidMatch[1] : null
    };
  }

  // Fetch columns from sheet
  document.getElementById('btn-formfill-fetch-columns')?.addEventListener('click', async () => {
    const url = document.getElementById('formfill-sheet-url').value.trim();
    if (!url) { Toast.warning('Paste a Google Sheets URL first'); return; }

    const parsed = parseGoogleSheetsUrl(url);
    const infoEl = document.getElementById('formfill-parsed-info');
    if (infoEl) {
      infoEl.innerHTML = 'ID: <code>' + parsed.spreadsheet_id.slice(0, 16) + '...</code>' +
        (parsed.gid ? ' | GID: <code>' + parsed.gid + '</code>' : '');
      infoEl.style.display = 'block';
    }

    try {
      // Get preview first
      const preview = await window.sendToBackground('SHEETS_PREVIEW', {
        spreadsheet_id: parsed.spreadsheet_id,
        gid: parsed.gid
      });

      // Then get ALL rows
      const allData = await window.sendToBackground('SHEETS_READ', {
        range: preview.sheet_name + '!A1:Z1000'
      });
      sheetAllRows = allData.values || [];
      sheetHeaders = sheetAllRows[0] || [];

      buildMappingRows();
      document.getElementById('formfill-mapping-area').style.display = 'block';
      document.getElementById('card-inject-controls').style.display = 'block';
    } catch (err) {
      Toast.error('Failed to fetch: ' + err.message);
    }
  });

  function buildMappingRows() {
    const container = document.getElementById('formfill-mapping-rows');
    const fields = [];
    currentForms.forEach(form => {
      (form.fields || []).forEach(f => {
        fields.push({ id: f.id || f.name, label: f.label || f.name || f.id, type: f.type, value: f.value || '', placeholder: f.placeholder || '' });
      });
    });

    if (fields.length === 0) {
      container.innerHTML = '<div style="padding:8px;color:#fb923c;font-size:12px;">Scan forms first to detect fields.</div>';
      return;
    }

    let html = '<table style="width:100%;border-collapse:collapse;margin-top:4px;font-size:11px;">';
    html += '<thead><tr style="background:#0f172a;">';
    html += '<th style="padding:5px 6px;text-align:left;color:#94a3b8;border-bottom:1px solid #334155;font-weight:600;font-size:10px;">Field ID</th>';
    html += '<th style="padding:5px 6px;text-align:left;color:#94a3b8;border-bottom:1px solid #334155;font-weight:600;font-size:10px;">Value / Placeholder</th>';
    html += '<th style="padding:5px 6px;text-align:left;color:#94a3b8;border-bottom:1px solid #334155;font-weight:600;font-size:10px;">Sheet Column</th>';
    html += '</tr></thead><tbody>';

    fields.forEach(field => {
      const fieldId = field.id || 'unnamed';
      const fieldVal = field.value || field.placeholder || '';
      const truncVal = fieldVal.length > 25 ? fieldVal.substring(0, 22) + '...' : fieldVal;

      html += '<tr style="border-bottom:1px solid #1e293b;">';
      html += '<td style="padding:4px 6px;color:#38bdf8;font-family:monospace;font-size:10px;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + fieldId + '">' + fieldId + '</td>';
      html += '<td style="padding:4px 6px;color:#64748b;font-size:10px;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + fieldVal.replace(/"/g, '&quot;') + '">' + truncVal + '</td>';
      html += '<td style="padding:4px 6px;">';
      html += '<select class="formfill-col-select" data-field-id="' + fieldId + '" style="width:100%;padding:3px;background:#0f172a;border:1px solid #334155;border-radius:4px;color:#e2e8f0;font-size:10px;">';
      html += '<option value="">-- skip --</option>';

      sheetHeaders.forEach((h, i) => {
        const samples = sheetAllRows.slice(1, 4).map(r => (r[i] || '')).filter(Boolean).join(', ');
        const truncSample = samples.length > 20 ? samples.substring(0, 17) + '...' : samples;
        // Auto-match: if header name loosely matches field ID
        const normalizedHeader = h.toLowerCase().replace(/[_\s\-\.]/g, '');
        const normalizedField = fieldId.toLowerCase().replace(/[_\s\-\.]/g, '');
        const isMatch = normalizedHeader === normalizedField || normalizedHeader.includes(normalizedField) || normalizedField.includes(normalizedHeader);
        html += '<option value="' + h + '" title="' + samples.replace(/"/g, '&quot;') + '"' + (isMatch ? ' selected' : '') + '>' + h + (truncSample ? ' (' + truncSample + ')' : '') + '</option>';
      });

      html += '</select></td></tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;
    buildRowPicker();
  }

  function buildRowPicker() {
    const container = document.getElementById('formfill-row-table');
    const dataRows = sheetAllRows.slice(1);
    if (dataRows.length === 0) {
      container.innerHTML = '<div style="padding:8px;color:#64748b;">No data rows</div>';
      return;
    }
    const cols = Math.min(sheetHeaders.length, 5);
    let html = '<table style="width:100%;border-collapse:collapse;font-size:11px;cursor:pointer;">';
    html += '<tr>' + sheetHeaders.slice(0, cols).map(h =>
      '<th style="padding:3px 6px;border-bottom:2px solid #38bdf8;color:#38bdf8;text-align:left;">' + h + '</th>'
    ).join('') + '</tr>';
    dataRows.forEach((row, i) => {
      const isArmed = (i + 1) === currentArmedRow;
      html += '<tr class="formfill-row-option" data-row="' + (i + 1) + '" style="background:' + (isArmed ? 'rgba(56,189,248,0.15)' : 'transparent') + ';">' +
        sheetHeaders.slice(0, cols).map((_, ci) =>
          '<td style="padding:3px 6px;border-bottom:1px solid #1e293b;color:' + (isArmed ? '#38bdf8' : '#94a3b8') + ';white-space:nowrap;overflow:hidden;max-width:100px;text-overflow:ellipsis;">' + (row[ci] || '') + '</td>'
        ).join('') + '</tr>';
    });
    html += '</table>';
    container.innerHTML = html;
    document.getElementById('formfill-row-picker').style.display = 'block';
    document.getElementById('formfill-row-indicator').textContent = 'Row ' + currentArmedRow + ' of ' + dataRows.length;

    container.querySelectorAll('.formfill-row-option').forEach(tr => {
      tr.addEventListener('click', () => {
        currentArmedRow = parseInt(tr.dataset.row);
        buildRowPicker();
        saveAutofillSession();
      });
    });
  }

  // Row navigation
  document.getElementById('btn-formfill-prev-row')?.addEventListener('click', () => {
    if (currentArmedRow > 1) { currentArmedRow--; buildRowPicker(); saveAutofillSession(); }
  });
  document.getElementById('btn-formfill-next-row')?.addEventListener('click', () => {
    if (currentArmedRow < sheetAllRows.length - 1) { currentArmedRow++; buildRowPicker(); saveAutofillSession(); }
  });

  // Save template
  document.getElementById('btn-formfill-save-template')?.addEventListener('click', async () => {
    const name = document.getElementById('formfill-template-name').value.trim();
    if (!name) { Toast.warning('Enter a template name'); return; }
    const mappings = {};
    document.querySelectorAll('.formfill-col-select').forEach(sel => {
      if (sel.value) mappings[sel.dataset.fieldId] = sel.value;
    });
    const urls = [];
    document.querySelectorAll('.template-url-input').forEach(inp => {
      if (inp.value.trim()) urls.push(inp.value.trim());
    });
    const template = {
      name: name,
      sheet_url: document.getElementById('formfill-sheet-url').value,
      column_mappings: mappings,
      url_patterns: urls,
      submit_selector: submitButtonSelector || '',
      created: Date.now()
    };
    await window.sendToBackground('SAVE_AUTOFILL_TEMPLATE', { domain: name, template: template });
    // Also save to Google Sheets via webhook
    try {
      await window.sendToBackground('SHEETS_WEBHOOK', {
        action: 'save_form_template',
        template_name: name,
        template_data: JSON.stringify(template)
      });
    } catch (_) {}
    Toast.success('Template "' + name + '" saved');
  });

  document.getElementById('btn-add-template-url')?.addEventListener('click', function() {
    const list = document.getElementById('template-url-list');
    if (!list) return;
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:4px;margin-bottom:4px;';
    row.innerHTML = '<input type="text" class="template-url-input" placeholder="https://crm.example.com/leads/*" style="flex:1;padding:4px 6px;background:#0f172a;border:1px solid #334155;border-radius:4px;color:#e2e8f0;font-size:11px;">'
      + '<button class="btn-remove-url" style="padding:2px 6px;background:#ef4444;color:#fff;border:none;border-radius:4px;font-size:10px;cursor:pointer;">\u2715</button>';
    row.querySelector('.btn-remove-url').addEventListener('click', function() { row.remove(); });
    list.appendChild(row);
  });

  // ── Session Persistence (Task 6) ──

  async function saveAutofillSession() {
    const mappings = {};
    document.querySelectorAll('.formfill-col-select').forEach(sel => {
      if (sel.value) mappings[sel.dataset.fieldId] = sel.value;
    });
    const session = {
      template_id: document.getElementById('formfill-template-name')?.value || '',
      sheet_url: document.getElementById('formfill-sheet-url')?.value || '',
      column_mappings: mappings,
      current_row: currentArmedRow,
      total_rows: Math.max(0, (sheetAllRows?.length || 1) - 1),
      cached_sheet_data: sheetAllRows || [],
      cached_headers: sheetHeaders || [],
      field_progress: [],
      armed: true,
      injection_mode: (document.querySelector('input[name="inject-mode"]:checked') || {}).value || 'sequential',
      skip_filled: !!(document.getElementById('formfill-skip-filled')?.checked),
      skip_mode: (document.querySelector('input[name="skip-mode"]:checked') || {}).value || 'simple',
      overwrite_existing: !!(document.getElementById('formfill-overwrite')?.checked),
      auto_submit_enabled: autoSubmitEnabled,
      submit_selector: submitButtonSelector,
      timestamp: Date.now()
    };
    await chrome.storage.local.set({ danman_autofill_session: session });
  }

  async function restoreAutofillSession() {
    try {
      const stored = await chrome.storage.local.get('danman_autofill_session');
      const session = stored.danman_autofill_session;
      if (!session || !session.armed) return;

      const urlInput = document.getElementById('formfill-sheet-url');
      if (urlInput && session.sheet_url) urlInput.value = session.sheet_url;

      sheetAllRows = session.cached_sheet_data || [];
      sheetHeaders = session.cached_headers || [];
      currentArmedRow = session.current_row || 1;

      if (sheetHeaders.length > 0) {
        buildMappingRows();
        // Restore select values
        Object.entries(session.column_mappings || {}).forEach(([fieldId, colName]) => {
          const sel = document.querySelector('.formfill-col-select[data-field-id="' + fieldId + '"]');
          if (sel) sel.value = colName;
        });
        document.getElementById('formfill-mapping-area').style.display = 'block';
        document.getElementById('card-inject-controls').style.display = 'block';
      }

      if (session.injection_mode) {
        const radio = document.querySelector('input[name="inject-mode"][value="' + session.injection_mode + '"]');
        if (radio) radio.checked = true;
      }
      if (session.skip_mode) {
        const radio = document.querySelector('input[name="skip-mode"][value="' + session.skip_mode + '"]');
        if (radio) radio.checked = true;
      }
      const skipEl = document.getElementById('formfill-skip-filled');
      if (skipEl) skipEl.checked = !!session.skip_filled;
      const overwriteEl = document.getElementById('formfill-overwrite');
      if (overwriteEl) overwriteEl.checked = !!session.overwrite_existing;

      if (session.submit_selector) {
        submitButtonSelector = session.submit_selector;
        const display = document.getElementById('submit-selector-display');
        if (display) display.textContent = submitButtonSelector;
      }
      if (session.auto_submit_enabled) {
        autoSubmitEnabled = true;
        const toggle = document.getElementById('auto-submit-toggle');
        if (toggle) toggle.checked = true;
        const config = document.getElementById('auto-submit-config');
        if (config) config.style.display = '';
        const confirm = document.getElementById('confirm-auto-submit');
        if (confirm) confirm.checked = true;
        const warning = document.getElementById('auto-submit-warning');
        if (warning) warning.style.display = '';
      }
    } catch (e) {
      console.warn('[Forms] Session restore failed:', e);
    }
  }

  // ── Injection Controls (Task 9) ──

  document.getElementById('btn-inject-next')?.addEventListener('click', () => {
    saveAutofillSession();
    window.parent.postMessage({ type: 'DANMAN_INJECT_NEXT' }, '*');
  });

  document.getElementById('btn-inject-all')?.addEventListener('click', () => {
    saveAutofillSession();
    window.parent.postMessage({ type: 'DANMAN_INJECT_ALL' }, '*');
  });

  document.getElementById('btn-end-session')?.addEventListener('click', async () => {
    await chrome.storage.local.remove('danman_autofill_session');
    document.getElementById('card-inject-controls').style.display = 'none';
    document.getElementById('formfill-mapping-area').style.display = 'none';
    sheetHeaders = [];
    sheetAllRows = [];
    currentArmedRow = 1;
    Toast.success('Session ended');
  });

  // Auto-save on control changes
  ['formfill-skip-filled', 'formfill-overwrite'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', saveAutofillSession);
  });
  document.querySelectorAll('input[name="inject-mode"], input[name="skip-mode"]').forEach(el => {
    el.addEventListener('change', saveAutofillSession);
  });

  // Auto-submit toggle
  document.getElementById('auto-submit-toggle')?.addEventListener('change', function() {
    document.getElementById('auto-submit-config').style.display = this.checked ? '' : 'none';
    if (this.checked) {
      document.getElementById('auto-submit-warning').style.display = '';
    } else {
      autoSubmitEnabled = false;
      document.getElementById('confirm-auto-submit').checked = false;
      document.getElementById('auto-submit-warning').style.display = 'none';
    }
    saveAutofillSession();
  });

  document.getElementById('confirm-auto-submit')?.addEventListener('change', function() {
    autoSubmitEnabled = this.checked;
    saveAutofillSession();
  });

  // Element picker for submit button
  document.getElementById('btn-pick-submit')?.addEventListener('click', function() {
    window.parent.postMessage({ type: 'DANMAN_PICK_ELEMENT' }, '*');
    this.textContent = 'Click the button on the page...';
    this.style.background = '#f59e0b';
    this.style.color = '#0f172a';
  });

  // Listen for picked element from content script (authenticated via
  // sidebar.js's gpd-message dispatch — never raw window 'message' events)
  window.addEventListener('gpd-message', function(ev) {
    var e = { data: ev.detail };
    if (e.data && e.data.type === 'DANMAN_ELEMENT_PICKED') {
      submitButtonSelector = String(e.data.selector || '');
      const display = document.getElementById('submit-selector-display');
      if (display) display.textContent = submitButtonSelector;
      const pickBtn = document.getElementById('btn-pick-submit');
      if (pickBtn) {
        pickBtn.textContent = '\u{1F3AF} Pick Element';
        pickBtn.style.background = '#334155';
        pickBtn.style.color = '#e2e8f0';
      }
      saveAutofillSession();
    }
  });

  // Restore session on load
  restoreAutofillSession();

  // ── DANMAN Assist Section ──
  (function buildDanmanAssist() {
    const assistDiv = document.createElement('div');
    assistDiv.id = 'danman-assist';
    assistDiv.style.cssText = 'background:#1e293b;border:1px solid #334155;border-radius:8px;padding:12px;margin:12px;';
    assistDiv.innerHTML = `
      <div style="color:#e2e8f0;font-size:13px;font-weight:600;margin-bottom:8px;">&#129302; DANMAN Assist</div>
      <div style="margin-bottom:8px;">
        <label style="color:#94a3b8;font-size:11px;display:block;margin-bottom:4px;">Added Instructions</label>
        <textarea id="danman-instructions" rows="3" placeholder="e.g. Skip blank rows. Format phones as (XXX) XXX-XXXX." style="width:100%;padding:6px 8px;background:#0f172a;border:1px solid #334155;border-radius:6px;color:#e2e8f0;font-size:11px;resize:vertical;box-sizing:border-box;"></textarea>
      </div>
      <button id="btn-analyze-plan" style="padding:6px 14px;background:#a78bfa;color:#fff;border:none;border-radius:6px;font-weight:600;font-size:12px;cursor:pointer;">Analyze & Plan</button>
      <div id="danman-response" style="margin-top:8px;background:#0f172a;border:1px solid #334155;border-radius:6px;padding:10px;display:none;max-height:200px;overflow-y:auto;">
        <div id="danman-response-text" style="color:#e2e8f0;font-size:11px;white-space:pre-wrap;"></div>
      </div>
      <div style="display:flex;gap:6px;margin-top:8px;">
        <input type="text" id="danman-forms-chat" placeholder="Ask DANMAN about the form or data..." style="flex:1;padding:6px 8px;background:#0f172a;border:1px solid #334155;border-radius:6px;color:#e2e8f0;font-size:11px;">
        <button id="btn-danman-send" style="padding:6px 10px;background:#38bdf8;color:#0f172a;border:none;border-radius:6px;font-weight:600;font-size:11px;cursor:pointer;">&#8617;</button>
      </div>`;
    container.appendChild(assistDiv);

    // Analyze & Plan
    document.getElementById('btn-analyze-plan').addEventListener('click', async function() {
      const btn = this;
      btn.textContent = 'Analyzing...';
      btn.disabled = true;
      const instructions = document.getElementById('danman-instructions').value;
      const mappings = {};
      document.querySelectorAll('.formfill-col-select').forEach(sel => {
        if (sel.value) mappings[sel.dataset.fieldId] = sel.value;
      });
      const context = {
        form_fields: currentForms.flatMap(f => (f.fields || []).map(field => ({ id: field.id || field.name, type: field.type, value: field.value, placeholder: field.placeholder }))),
        sheet_headers: sheetHeaders || [],
        sample_rows: (sheetAllRows || []).slice(1, 4),
        total_rows: Math.max(0, (sheetAllRows || []).length - 1),
        column_mappings: mappings,
        user_instructions: instructions
      };
      try {
        const resp = await window.sendToBackground('DANMAN_FORMS_CHAT', {
          message: 'Analyze this form and sheet data. Create an injection plan based on my mappings and instructions. Identify any mismatches, missing required fields, or data formatting issues.',
          context: context
        });
        const responseDiv = document.getElementById('danman-response');
        const responseText = document.getElementById('danman-response-text');
        responseDiv.style.display = '';
        responseText.textContent = resp.response || resp.error || 'No response';
      } catch (e) {
        document.getElementById('danman-response').style.display = '';
        document.getElementById('danman-response-text').textContent = 'Error: ' + e.message;
      } finally {
        btn.textContent = 'Analyze & Plan';
        btn.disabled = false;
      }
    });

    // Chat send
    async function sendDanmanChat() {
      const input = document.getElementById('danman-forms-chat');
      const message = input.value.trim();
      if (!message) return;
      input.value = '';
      const responseDiv = document.getElementById('danman-response');
      const responseText = document.getElementById('danman-response-text');
      responseDiv.style.display = '';
      responseText.textContent += '\n\nYou: ' + message + '\n\nDANMAN: thinking...';
      responseDiv.scrollTop = responseDiv.scrollHeight;
      const mappings = {};
      document.querySelectorAll('.formfill-col-select').forEach(sel => {
        if (sel.value) mappings[sel.dataset.fieldId] = sel.value;
      });
      const context = {
        form_fields: currentForms.flatMap(f => (f.fields || []).map(field => ({ id: field.id || field.name, type: field.type }))),
        sheet_headers: sheetHeaders || [],
        total_rows: Math.max(0, (sheetAllRows || []).length - 1),
        column_mappings: mappings,
        user_instructions: document.getElementById('danman-instructions').value
      };
      try {
        const resp = await window.sendToBackground('DANMAN_FORMS_CHAT', { message, context });
        responseText.textContent = responseText.textContent.replace('DANMAN: thinking...', 'DANMAN: ' + (resp.response || 'No response'));
      } catch (e) {
        responseText.textContent = responseText.textContent.replace('DANMAN: thinking...', 'DANMAN: Error - ' + e.message);
      }
      responseDiv.scrollTop = responseDiv.scrollHeight;
    }

    document.getElementById('btn-danman-send').addEventListener('click', sendDanmanChat);
    document.getElementById('danman-forms-chat').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') sendDanmanChat();
    });
  })();

  // ── Auto-suggest template on URL match ──
  (async function checkAutoSuggest() {
    try {
      const result = await window.sendToBackground('GET_AUTOFILL_TEMPLATES');
      const allTemplates = result.templates || {};
      // Get current page URL from parent
      let pageUrl = '';
      try { pageUrl = window.parent.location.href; } catch (_) {}

      if (!pageUrl) return;

      for (const [name, tpl] of Object.entries(allTemplates)) {
        const patterns = tpl.url_patterns || [];
        for (const pattern of patterns) {
          try {
            const regex = new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i');
            if (regex.test(pageUrl)) {
              showAutoSuggestBanner(name, tpl);
              return;
            }
          } catch (_) {}
        }
      }
    } catch (_) {}
  })();

  function showAutoSuggestBanner(name, template) {
    const banner = document.createElement('div');
    banner.style.cssText = 'background:#1e3a5f;border:1px solid #38bdf8;border-radius:8px;padding:10px;margin:12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;';
    banner.innerHTML = '<span style="color:#38bdf8;font-size:12px;">Template <strong>"' + name + '"</strong> matches this page.</span>'
      + '<button id="btn-load-suggested" style="padding:4px 10px;background:#38bdf8;color:#0f172a;border:none;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer;">Load it</button>'
      + '<button id="btn-dismiss-suggest" style="padding:4px 6px;background:transparent;color:#64748b;border:none;cursor:pointer;font-size:14px;">\u2715</button>';
    container.insertBefore(banner, container.firstChild);

    document.getElementById('btn-load-suggested').addEventListener('click', function() {
      // Apply template: set sheet URL, restore mappings
      if (template.sheet_url) {
        const urlInput = document.getElementById('formfill-sheet-url');
        if (urlInput) urlInput.value = template.sheet_url;
      }
      if (template.column_mappings) {
        // Trigger fetch then apply mappings
        document.getElementById('btn-formfill-fetch-columns')?.click();
        setTimeout(function() {
          Object.entries(template.column_mappings).forEach(function([fieldId, colName]) {
            const sel = document.querySelector('.formfill-col-select[data-field-id="' + fieldId + '"]');
            if (sel) sel.value = colName;
          });
        }, 2000);
      }
      if (template.submit_selector) {
        submitButtonSelector = template.submit_selector;
        const display = document.getElementById('submit-selector-display');
        if (display) display.textContent = submitButtonSelector;
      }
      banner.remove();
      Toast.success('Template "' + name + '" loaded');
    });
    document.getElementById('btn-dismiss-suggest').addEventListener('click', function() { banner.remove(); });
  }

  // ===== Google Forms → WordPress (WPForms) converter =====
  // The exact FormsProcessorV2 engine, running client-side (DMS_GForms).
  const gfCard = document.createElement('div');
  gfCard.className = 'card';
  gfCard.innerHTML = `
    <div class="card-header"><span class="section-title">Google Forms &rarr; WordPress</span></div>
    <div class="tab-desc" style="margin-bottom:8px;">Turns a Google Form into a WPForms-import-ready JSON file (US/CA address block auto-injected). Works on published forms by URL — or open the form in a tab (even unpublished/edit view) and convert the current tab.</div>
    <button class="btn btn-primary btn-sm btn-block" id="gf-convert-tab">&#9889; Convert current tab</button>
    <div class="form-group mt-2">
      <label>…or a published form URL (/viewform)</label>
      <div class="flex gap-2">
        <input type="url" id="gf-url" placeholder="https://docs.google.com/forms/d/e/…/viewform">
        <button class="btn btn-secondary btn-sm" id="gf-convert-url">Convert</button>
      </div>
    </div>
    <div class="form-group">
      <label>…or paste the form page's HTML</label>
      <textarea id="gf-html" rows="3" placeholder="View source → select all → paste"></textarea>
      <button class="btn btn-secondary btn-sm btn-block mt-2" id="gf-convert-html">Convert pasted HTML</button>
    </div>
    <div id="gf-result" class="hidden">
      <div class="divider"></div>
      <div id="gf-summary" class="text-sm mb-2"></div>
      <div class="flex gap-2">
        <button class="btn btn-success btn-sm" id="gf-download">&#11015; Download WPForms JSON</button>
        <button class="btn btn-secondary btn-sm" id="gf-copy">Copy</button>
        <button class="btn btn-secondary btn-sm" id="gf-save-memory" title="Archive a copy in your memory folder's uploads/">&#128190; To memory</button>
      </div>
    </div>
    <div id="gf-status" class="text-xs text-muted mt-2"></div>
  `;
  container.appendChild(gfCard);

  let gfLastJson = '';
  let gfLastTitle = 'form';
  const gfStatus = (t, err) => {
    const el = gfCard.querySelector('#gf-status');
    el.textContent = t || '';
    el.style.color = err ? '#fca5a5' : '';
  };

  async function gfRun(input) {
    if (!window.DMS_GForms) { gfStatus('Converter not loaded — reload the sidebar.', true); return; }
    gfStatus('Converting…');
    try {
      const r = await window.DMS_GForms.convert(input, {});
      if (!r.ok) {
        gfStatus(r.error + (r.meta && r.meta.hint ? ' — ' + r.meta.hint : ''), true);
        return;
      }
      const d = r.data;
      gfLastJson = typeof d.wpformsJson === 'string' ? d.wpformsJson : JSON.stringify(d.wpformsJson, null, 2);
      gfLastTitle = (d.fbTitle || 'form').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'form';
      gfCard.querySelector('#gf-result').classList.remove('hidden');
      gfCard.querySelector('#gf-summary').innerHTML =
        '<span class="badge badge-green">' + d.fieldCount + ' fields</span> '
        + (d.addressInjected ? '<span class="badge badge-cyan">US/CA address injected</span> ' : '')
        + '<strong>' + (d.fbTitle || '(untitled form)') + '</strong>'
        + ((d.warnings || []).length ? '<div class="meta" style="color:#f59e0b;">' + d.warnings.join('; ') + '</div>' : '');
      gfStatus('Ready — import via WPForms → Tools → Import.');
    } catch (e) {
      gfStatus('Conversion failed: ' + (e.message || e), true);
    }
  }

  gfCard.querySelector('#gf-convert-tab').addEventListener('click', async () => {
    gfStatus('Reading current tab…');
    try {
      const tabs = await window.sendToBackground('TABS_LIST', {});
      const active = (tabs.tabs || []).find((t) => t.active) || (tabs.tabs || [])[0];
      if (!active) { gfStatus('No open tab found.', true); return; }
      const grab = await window.sendToBackground('GFORMS_GRAB', { tabId: active.id });
      await gfRun({ html: grab.html });
    } catch (e) {
      gfStatus('Could not read the tab: ' + (e.message || e), true);
    }
  });
  gfCard.querySelector('#gf-convert-url').addEventListener('click', () => {
    const url = gfCard.querySelector('#gf-url').value.trim();
    if (url) gfRun({ url });
  });
  gfCard.querySelector('#gf-convert-html').addEventListener('click', () => {
    const html = gfCard.querySelector('#gf-html').value;
    if (html.trim()) gfRun({ html });
  });
  gfCard.querySelector('#gf-download').addEventListener('click', () => {
    if (!gfLastJson) return;
    const blob = new Blob([gfLastJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wpforms-' + gfLastTitle + '.json';
    a.click();
    URL.revokeObjectURL(url);
  });
  gfCard.querySelector('#gf-copy').addEventListener('click', () => {
    if (gfLastJson && window.copyToClipboard) { window.copyToClipboard(gfLastJson); if (window.Toast) Toast.info('Copied'); }
  });
  gfCard.querySelector('#gf-save-memory').addEventListener('click', async () => {
    if (!gfLastJson) return;
    try {
      await window.sendToBackground('MEMORY_STORE_ARTIFACT', {
        kind: 'upload', name: 'wpforms-' + gfLastTitle + '.json', content: gfLastJson, mime: 'application/json'
      });
      if (window.Toast) Toast.success('Saved to memory uploads/');
    } catch (e) {
      if (window.Toast) Toast.error('Save failed: ' + (e.message || e));
    }
  });

  console.log('[DANMAN] Forms tab loaded');
})();
