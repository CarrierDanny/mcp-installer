// sidebar/tabs/soql-tab.js — Workbench SOQL builder (DANMAN v6.9.0)
(function () {
  'use strict';

  const container = document.getElementById('tab-soql');
  if (!container) return;

  const APP_VER = (typeof GPD_APP_VERSION !== 'undefined' && GPD_APP_VERSION) || '6.9.0';

  let catalog = null;
  let state = {
    objectApi: 'Case',
    templateId: 'case-parse-query',
    fields: [],
    caseNumbers: [],
    soql: '',
    slots: [],
    activeSlot: 1,
  };

  container.innerHTML = [
    '<div class="tab-title">&#128202; Workbench SOQL</div>',
    '<div class="tab-desc">Paste CellsForce text, build validated SOQL, copy to Workbench. v' + APP_VER + '</div>',
    '<div class="soql-subnav" style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;">',
    '  <button type="button" class="btn btn-secondary soql-sub active" data-soql-sub="build">Build query</button>',
    '  <button type="button" class="btn btn-secondary soql-sub" data-soql-sub="sheets">Import to Sheets</button>',
    '  <button type="button" class="btn btn-secondary soql-sub" data-soql-sub="fill">Fill (A)</button>',
    '</div>',
    '<div id="soql-panel-build">',
    '  <div class="card">',
    '    <div class="section-title">Paste raw block</div>',
    '    <textarea id="soql-paste" class="exec-input" rows="6" placeholder="Paste case list, email body, or CellsForce export..."></textarea>',
    '    <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">',
    '      <button type="button" class="btn btn-primary" id="soql-extract-build">Extract &amp; build SOQL</button>',
    '      <button type="button" class="btn btn-secondary" id="soql-extract-only">Extract cases only</button>',
    '    </div>',
    '    <div id="soql-cases" class="text-xs" style="margin-top:8px;color:#94a3b8;"></div>',
    '  </div>',
    '  <div class="card">',
    '    <div class="section-title">Query template</div>',
    '    <select id="soql-template" class="exec-input" style="width:100%;margin-bottom:8px;"></select>',
    '    <label class="text-xs" style="color:#94a3b8;">Object</label>',
    '    <select id="soql-object" class="exec-input" style="width:100%;margin-bottom:8px;"></select>',
    '  </div>',
    '  <div class="card">',
    '    <div class="section-title">Fields <span class="text-xs" style="color:#64748b;">(validated API names)</span></div>',
    '    <input type="search" id="soql-field-search" class="exec-input" placeholder="Search fields..." style="margin-bottom:6px;" />',
    '    <div id="soql-field-pool" style="max-height:140px;overflow:auto;border:1px solid #334155;border-radius:6px;padding:6px;"></div>',
    '    <div id="soql-selected-fields" class="text-xs" style="margin-top:8px;min-height:24px;color:#cbd5e1;"></div>',
    '  </div>',
    '  <div class="card">',
    '    <div class="section-title">SOQL (edit before copy)</div>',
    '    <textarea id="soql-output" class="exec-input font-mono" rows="8" spellcheck="false"></textarea>',
    '    <div id="soql-warn" class="text-xs" style="color:#fbbf24;margin-top:6px;display:none;"></div>',
    '    <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">',
    '      <button type="button" class="btn btn-primary" id="soql-copy">Copy SOQL</button>',
    '      <button type="button" class="btn btn-secondary" id="soql-rebuild">Rebuild from fields</button>',
    '    </div>',
    '  </div>',
    '  <div class="card">',
    '    <div class="section-title">5 hotkey templates</div>',
    '    <p class="text-xs" style="color:#64748b;margin-bottom:8px;">Save current query to a slot. Click slot or press Alt+Shift+1–5 when this tab is active.</p>',
    '    <div id="soql-slots" style="display:flex;flex-direction:column;gap:6px;"></div>',
    '    <div style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">',
    '      <input id="soql-slot-name" class="exec-input" placeholder="Slot display name" style="flex:1;min-width:120px;" />',
    '      <button type="button" class="btn btn-secondary" id="soql-save-slot">Save to active slot</button>',
    '    </div>',
    '  </div>',
    '</div>',
    '<div id="soql-panel-sheets" style="display:none;">',
    '  <div class="card">',
    '    <div class="section-title">&#128202; Workbench Results Importer</div>',
    '    <p class="text-xs" style="color:#64748b;margin-bottom:8px;">Paste the <strong>full</strong> Workbench output (SOQL block + Query Results + table). Creates a timestamped sheet <code style="color:#93c5fd;">WB_{Object}_{timestamp}</code> with filters, green banding, and column colors — same as your GAS dialog.</p>',
    '    <textarea id="soql-wb-import-paste" class="exec-input font-mono" rows="12" placeholder="Paste full Workbench output here (include Query Results)..."></textarea>',
    '    <div id="soql-wb-preview" class="text-xs" style="margin-top:8px;color:#94a3b8;display:none;"></div>',
    '    <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">',
    '      <button type="button" class="btn btn-primary" id="soql-wb-import">Create timestamped sheet</button>',
    '      <button type="button" class="btn btn-secondary" id="soql-wb-preview-btn">Preview parse</button>',
    '    </div>',
    '    <div id="soql-wb-status" class="text-xs" style="margin-top:10px;padding:8px;border-radius:6px;display:none;"></div>',
    '    <p class="text-xs" style="color:#64748b;margin-top:10px;">Requires your CellsForce Apps Script webhook with <code style="color:#93c5fd;">importWorkbenchResultsToNewSheet</code>. See <code style="color:#93c5fd;">gas/workbench-importer.gs</code> in the extension folder.</p>',
    '  </div>',
    '</div>',
    '<div id="soql-panel-fill" style="display:none;">',
    '  <div class="card">',
    '    <div class="section-title">Quick fill from results</div>',
    '    <p class="text-xs" style="color:#64748b;margin-bottom:8px;">Paste Workbench results (or use text from Import tab). Pick row/column, focus a Salesforce dropdown, press <kbd style="background:#334155;padding:2px 6px;border-radius:4px;">A</kbd> to copy that cell for paste.</p>',
    '    <textarea id="soql-results-paste" class="exec-input" rows="6" placeholder="Paste query results..."></textarea>',
    '    <button type="button" class="btn btn-secondary" id="soql-parse-results" style="margin-top:8px;">Parse for fill</button>',
    '  </div>',
    '  <div class="card" id="soql-fill-card" style="display:none;">',
    '    <div class="section-title">Map &amp; fill</div>',
    '    <label class="text-xs">Data row</label>',
    '    <select id="soql-result-row" class="exec-input" style="width:100%;margin:6px 0;"></select>',
    '    <label class="text-xs">Source column (press A on focused field)</label>',
    '    <select id="soql-result-col" class="exec-input" style="width:100%;margin:6px 0;"></select>',
    '    <div id="soql-fill-preview" class="text-xs font-mono" style="color:#94a3b8;margin-top:8px;"></div>',
    '    <p class="text-xs" style="color:#64748b;margin-top:8px;">Tip: click a Salesforce dropdown on the page, then press A to copy the mapped value to clipboard for paste.</p>',
    '  </div>',
    '</div>',
  ].join('\n');

  function toast(type, msg) {
    if (typeof Toast !== 'undefined' && Toast.show) Toast.show(msg, type);
    else console.log('[SOQL]', type, msg);
  }

  async function api(type, payload) {
    return window.sendToBackground(type, payload || {});
  }

  function switchSub(panel) {
    document.querySelectorAll('.soql-sub').forEach((b) => {
      b.classList.toggle('active', b.dataset.soqlSub === panel);
    });
    document.getElementById('soql-panel-build').style.display = panel === 'build' ? '' : 'none';
    document.getElementById('soql-panel-sheets').style.display = panel === 'sheets' ? '' : 'none';
    document.getElementById('soql-panel-fill').style.display = panel === 'fill' ? '' : 'none';
  }

  function setWbStatus(ok, msg) {
    const el = document.getElementById('soql-wb-status');
    if (!el) return;
    el.style.display = msg ? 'block' : 'none';
    el.style.background = ok ? '#052e16' : '#450a0a';
    el.style.color = ok ? '#86efac' : '#fecaca';
    el.textContent = msg || '';
  }

  function showWbPreview(preview) {
    const el = document.getElementById('soql-wb-preview');
    if (!el || !preview) return;
    if (!preview.headers || !preview.headers.length) {
      el.style.display = 'none';
      return;
    }
    el.style.display = 'block';
    el.innerHTML =
      '<strong>Detected:</strong> ' +
      escapeHtml(preview.objectName || 'Results') +
      ' · ' +
      preview.headers.length +
      ' columns · ' +
      (preview.rows ? preview.rows.length : 0) +
      ' row(s)' +
      (preview.soql ? '<br><span style="opacity:0.8;">SOQL: ' + escapeHtml(preview.soql.slice(0, 120)) + (preview.soql.length > 120 ? '…' : '') + '</span>' : '');
  }

  async function previewWorkbenchImport() {
    const text = document.getElementById('soql-wb-import-paste').value;
    const r = await api('SOQL_PREVIEW_WORKBENCH', { text });
    if (!r || !r.ok) {
      setWbStatus(false, (r && r.error) || 'Could not parse Workbench output.');
      showWbPreview(null);
      return;
    }
    showWbPreview(r);
    setWbStatus(true, 'Ready to import ' + r.rows.length + ' row(s) as ' + (r.objectName || 'Results') + '.');
    document.getElementById('soql-results-paste').value = text;
  }

  async function importWorkbenchToSheets() {
    const text = document.getElementById('soql-wb-import-paste').value;
    if (!text.trim()) {
      setWbStatus(false, 'Paste Workbench output first.');
      return;
    }
    setWbStatus(true, 'Importing to Google Sheets…');
    const btn = document.getElementById('soql-wb-import');
    if (btn) btn.disabled = true;
    try {
      const r = await api('SOQL_IMPORT_WORKBENCH', { text });
      if (r && r.ok && r.sheetName) {
        var openHint = r.sheetUrl ? ' Opened in a new browser tab.' : '';
        setWbStatus(
          true,
          'Created sheet "' + r.sheetName + '" with ' + r.rows + ' row(s) and ' + r.columns + ' column(s).' + openHint
        );
        showWbPreview(r.preview || r);
        toast('success', 'Sheet created: ' + r.sheetName + (r.sheetUrl ? ' — opened in browser' : ''));
        document.getElementById('soql-results-paste').value = text;
      } else {
        setWbStatus(false, (r && r.error) || 'Import failed.');
        if (r && r.preview) showWbPreview(r.preview);
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function renderTemplates() {
    const sel = document.getElementById('soql-template');
    if (!sel || !catalog) return;
    sel.innerHTML = (catalog.templates || [])
      .map((t) => '<option value="' + t.id + '">' + escapeHtml(t.name) + '</option>')
      .join('');
    sel.value = state.templateId;
  }

  function renderObjects() {
    const sel = document.getElementById('soql-object');
    if (!sel || !catalog) return;
    const keys = Object.keys(catalog.objects || {});
    sel.innerHTML = keys
      .map((k) => {
        const o = catalog.objects[k];
        return '<option value="' + o.apiName + '">' + escapeHtml(o.label || o.apiName) + '</option>';
      })
      .join('');
    sel.value = state.objectApi;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getObjectFields() {
    if (!catalog || !catalog.objects) return [];
    const o = catalog.objects[state.objectApi];
    return (o && o.fields) || [];
  }

  function renderFieldPool(filter) {
    const pool = document.getElementById('soql-field-pool');
    const q = (filter || '').toLowerCase();
    const fields = getObjectFields().filter((f) => !q || f.toLowerCase().includes(q));
    pool.innerHTML = fields
      .slice(0, 400)
      .map((f) => {
        const on = state.fields.indexOf(f) >= 0;
        return (
          '<label style="display:block;font-size:11px;cursor:pointer;padding:2px 0;">' +
          '<input type="checkbox" data-field="' +
          escapeHtml(f) +
          '" ' +
          (on ? 'checked' : '') +
          ' /> ' +
          escapeHtml(f) +
          '</label>'
        );
      })
      .join('');
    pool.querySelectorAll('input[data-field]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const f = cb.getAttribute('data-field');
        if (cb.checked) {
          if (state.fields.indexOf(f) < 0) state.fields.push(f);
        } else {
          state.fields = state.fields.filter((x) => x !== f);
        }
        renderSelectedFields();
      });
    });
    renderSelectedFields();
  }

  function renderSelectedFields() {
    const el = document.getElementById('soql-selected-fields');
    if (!el) return;
    if (!state.fields.length) {
      el.textContent = 'Using template default fields.';
      return;
    }
    el.textContent = state.fields.join(', ');
  }

  function renderCases() {
    const el = document.getElementById('soql-cases');
    if (!state.caseNumbers.length) {
      el.textContent = 'No case numbers detected yet.';
      return;
    }
    el.innerHTML =
      '<strong>' +
      state.caseNumbers.length +
      '</strong> case(s): ' +
      escapeHtml(state.caseNumbers.slice(0, 20).join(', ')) +
      (state.caseNumbers.length > 20 ? '…' : '');
  }

  function renderSlots() {
    const wrap = document.getElementById('soql-slots');
    if (!wrap) return;
    wrap.innerHTML = (state.slots || [])
      .map((s) => {
        const active = s.slot === state.activeSlot;
        return (
          '<button type="button" class="btn ' +
          (active ? 'btn-primary' : 'btn-secondary') +
          ' soql-slot-btn" data-slot="' +
          s.slot +
          '" style="text-align:left;">' +
          '<span style="opacity:0.7;">' +
          escapeHtml(s.hotkey || '') +
          '</span> — ' +
          escapeHtml(s.name || 'Slot ' + s.slot) +
          (s.templateId ? ' <span class="text-xs">(' + escapeHtml(s.templateId) + ')</span>' : '') +
          '</button>'
        );
      })
      .join('');
    wrap.querySelectorAll('.soql-slot-btn').forEach((btn) => {
      btn.addEventListener('click', () => loadSlot(parseInt(btn.dataset.slot, 10)));
    });
  }

  async function loadCatalog() {
    const r = await api('SOQL_GET_CATALOG');
    if (r && r.catalog) {
      catalog = r.catalog;
      renderTemplates();
      renderObjects();
      renderFieldPool();
    }
  }

  async function loadSlots() {
    const r = await api('SOQL_GET_SLOTS');
    if (r && r.slots) {
      state.slots = r.slots;
      renderSlots();
    }
  }

  async function extractCases() {
    const text = document.getElementById('soql-paste').value;
    const r = await api('SOQL_EXTRACT_CASES', { text });
    if (r && r.caseNumbers) {
      state.caseNumbers = r.caseNumbers;
      renderCases();
    }
    return state.caseNumbers;
  }

  async function buildSoql() {
    const text = document.getElementById('soql-paste').value;
    if (!state.caseNumbers.length) await extractCases();
    const r = await api('SOQL_BUILD', {
      text,
      templateId: state.templateId,
      objectApi: state.objectApi,
      fields: state.fields.length ? state.fields : undefined,
      caseNumbers: state.caseNumbers,
      rawSoql: document.getElementById('soql-output').value || undefined,
    });
    const warn = document.getElementById('soql-warn');
    if (!r || r.error) {
      toast('error', (r && r.error) || 'Build failed');
      return;
    }
    if (r.soql) document.getElementById('soql-output').value = r.soql;
    if (r.fields && r.fields.length && !state.fields.length) state.fields = r.fields.slice();
    if (r.invalid && r.invalid.length) {
      warn.style.display = 'block';
      warn.textContent = 'Removed invalid fields: ' + r.invalid.join(', ');
    } else {
      warn.style.display = 'none';
    }
    renderFieldPool(document.getElementById('soql-field-search').value);
    toast('success', 'SOQL ready — copy to Workbench');
  }

  async function loadSlot(slotNum) {
    state.activeSlot = slotNum;
    const s = (state.slots || []).find((x) => x.slot === slotNum);
    if (!s) return;
    renderSlots();
    if (s.templateId) {
      state.templateId = s.templateId;
      document.getElementById('soql-template').value = s.templateId;
    }
    if (s.objectApi) {
      state.objectApi = s.objectApi;
      document.getElementById('soql-object').value = s.objectApi;
    }
    if (s.fields && s.fields.length) state.fields = s.fields.slice();
    document.getElementById('soql-slot-name').value = s.name || '';
    renderFieldPool();
    await buildSoql();
  }

  async function saveSlot() {
    const name = document.getElementById('soql-slot-name').value.trim() || 'Slot ' + state.activeSlot;
    const r = await api('SOQL_SAVE_SLOT', {
      slot: state.activeSlot,
      name,
      templateId: state.templateId,
      objectApi: state.objectApi,
      fields: state.fields,
      hotkey: 'Alt+Shift+' + state.activeSlot,
    });
    if (r && r.slots) {
      state.slots = r.slots;
      renderSlots();
      toast('success', 'Saved "' + name + '"');
    }
  }

  let parsedResults = { headers: [], rows: [] };

  async function parseResults() {
    const text = document.getElementById('soql-results-paste').value;
    const r = await api('SOQL_PARSE_RESULTS', { text });
    if (!r || !r.headers) {
      toast('error', 'Could not parse results');
      return;
    }
    parsedResults = { headers: r.headers, rows: r.rows || [] };
    document.getElementById('soql-fill-card').style.display = parsedResults.headers.length ? '' : 'none';
    const rowSel = document.getElementById('soql-result-row');
    const colSel = document.getElementById('soql-result-col');
    rowSel.innerHTML = parsedResults.rows
      .map((row, i) => {
        const label = row.CaseNumber || row.Id || row.Name || 'Row ' + (i + 1);
        return '<option value="' + i + '">' + escapeHtml(String(label)) + '</option>';
      })
      .join('');
    colSel.innerHTML = parsedResults.headers
      .map((h) => '<option value="' + escapeHtml(h) + '">' + escapeHtml(h) + '</option>')
      .join('');
    updateFillPreview();
    toast('success', parsedResults.rows.length + ' row(s) parsed');
  }

  function updateFillPreview() {
    const rowIdx = parseInt(document.getElementById('soql-result-row').value, 10) || 0;
    const col = document.getElementById('soql-result-col').value;
    const row = parsedResults.rows[rowIdx] || {};
    const val = row[col] != null ? row[col] : '';
    document.getElementById('soql-fill-preview').textContent = col + ' = ' + val;
    return val;
  }

  function applyFillFromA() {
    const val = updateFillPreview();
    if (!val) {
      toast('error', 'No value for selected column');
      return;
    }
    window.copyToClipboard(String(val));
    toast('success', 'Copied for paste: ' + String(val).slice(0, 60));
  }

  document.querySelectorAll('.soql-sub').forEach((btn) => {
    btn.addEventListener('click', () => switchSub(btn.dataset.soqlSub));
  });

  document.getElementById('soql-extract-build').addEventListener('click', async () => {
    await extractCases();
    await buildSoql();
  });
  document.getElementById('soql-extract-only').addEventListener('click', extractCases);
  document.getElementById('soql-rebuild').addEventListener('click', buildSoql);
  document.getElementById('soql-copy').addEventListener('click', () => {
    const q = document.getElementById('soql-output').value;
    if (!q.trim()) {
      toast('error', 'No SOQL to copy');
      return;
    }
    window.copyToClipboard(q);
    toast('success', 'SOQL copied');
  });
  document.getElementById('soql-save-slot').addEventListener('click', saveSlot);
  document.getElementById('soql-wb-preview-btn').addEventListener('click', previewWorkbenchImport);
  document.getElementById('soql-wb-import').addEventListener('click', importWorkbenchToSheets);
  document.getElementById('soql-parse-results').addEventListener('click', parseResults);
  document.getElementById('soql-result-row').addEventListener('change', updateFillPreview);
  document.getElementById('soql-result-col').addEventListener('change', updateFillPreview);

  document.getElementById('soql-template').addEventListener('change', (e) => {
    state.templateId = e.target.value;
    const tpl = (catalog && catalog.templates || []).find((t) => t.id === state.templateId);
    if (tpl) {
      const m = tpl.soql.match(/\sFROM\s+([A-Za-z0-9_]+)/i);
      if (m) {
        state.objectApi = m[1] === 'Equipement__c' ? 'Equipment__c' : m[1];
        document.getElementById('soql-object').value = state.objectApi;
        state.fields = [];
        renderFieldPool();
      }
    }
  });

  document.getElementById('soql-object').addEventListener('change', (e) => {
    state.objectApi = e.target.value;
    state.fields = [];
    renderFieldPool();
  });

  document.getElementById('soql-field-search').addEventListener('input', (e) => {
    renderFieldPool(e.target.value);
  });

  document.addEventListener('keydown', (e) => {
    const active = document.querySelector('#tab-soql.tab-content.active');
    if (!active) return;
    if (e.key === 'a' || e.key === 'A') {
      const fillVisible = document.getElementById('soql-panel-fill').style.display !== 'none';
      const sheetsVisible = document.getElementById('soql-panel-sheets').style.display !== 'none';
      if (fillVisible || sheetsVisible) {
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          applyFillFromA();
        }
      }
    }
    if (e.altKey && e.shiftKey && e.key >= '1' && e.key <= '5') {
      e.preventDefault();
      loadSlot(parseInt(e.key, 10));
    }
  });

  window.addEventListener('tab-activated', (ev) => {
    if (ev.detail && ev.detail.tab === 'soql') {
      loadCatalog();
      loadSlots();
    }
  });

  loadCatalog();
  loadSlots();
  console.log('[DANMAN] SOQL tab v' + APP_VER + ' initialized');
})();
