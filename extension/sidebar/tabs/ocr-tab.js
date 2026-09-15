// sidebar/tabs/ocr-tab.js — OCR Tab (Phase 8)
// Self-contained tab matching v4.6 conventions:
//   - container = document.getElementById('tab-ocr')
//   - sends to background via window.sendToBackground(type, payload) -> Promise<{ok,data}|{ok,error}>
//   - surfaces feedback via global Toast.{success,error,warning,info}
//
// Backend routes consumed (all in background/service-worker.js):
//   OCR_RUN, OCR_EXTRACT_ENTITIES, OCR_EXPORT_SHEETS
//   CONFIG_LOAD (for ai_models defaults)
//
// PDF rendering happens here in the sidebar via the bundled pdf.js
// (lib/pdf.min.js + lib/pdf.worker.min.js — registered in
// web_accessible_resources). The OCR engine itself is vision-LLM:
// it consumes base64 image data URLs only.
//
// Gemini models are excluded from the engine picker — the OCR engine
// in v5 throws on Gemini (multi-part vision not wired) — see commit
// 1c82072.
(function () {
  'use strict';

  var container = document.getElementById('tab-ocr');
  if (!container) return;

  // ============================================================================
  // pdf.js worker setup
  //   Must fire BEFORE any pdfjsLib.getDocument call. Falls back gracefully
  //   when pdfjsLib failed to load.
  // ============================================================================
  var pdfjsAvailable = (typeof pdfjsLib !== 'undefined');
  if (pdfjsAvailable && pdfjsLib.GlobalWorkerOptions) {
    try {
      pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.min.js');
    } catch (e) {
      pdfjsAvailable = false;
      console.warn('[OCR] pdf.js worker URL setup failed:', e);
    }
  }

  // ============================================================================
  // STATE
  // ============================================================================
  var currentPages = [];        // [{index, dataUrl}]
  var currentFileName = '';
  var currentResult = null;     // last OCR_RUN response data
  var resultView = 'text';      // 'text' | 'entities' | 'pages'
  var isRunning = false;

  // ============================================================================
  // SCOPED STYLES (prefix: .ocr-)
  // ============================================================================
  var styleEl = document.createElement('style');
  styleEl.textContent = [
    '.ocr-wrap { display:flex; flex-direction:column; gap:12px; }',
    '.ocr-card { background:#1e293b; border:1px solid #334155; border-radius:8px; padding:12px; }',
    '.ocr-card-title { font-size:12px; font-weight:600; color:#94a3b8; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:10px; display:flex; align-items:center; gap:6px; }',
    '.ocr-row { display:flex; gap:6px; align-items:center; margin-bottom:6px; flex-wrap:wrap; }',
    '.ocr-row > * { min-width:0; }',
    '.ocr-select, .ocr-input { flex:1; padding:6px 8px; background:#0f172a; border:1px solid #334155; border-radius:6px; color:#e2e8f0; font-size:12px; outline:none; }',
    '.ocr-select:focus, .ocr-input:focus { border-color:#06b6d4; }',
    '.ocr-btn { padding:6px 10px; border:1px solid #334155; border-radius:6px; background:#1e293b; color:#e2e8f0; cursor:pointer; font-size:12px; white-space:nowrap; display:inline-flex; align-items:center; gap:4px; }',
    '.ocr-btn:hover { background:#334155; }',
    '.ocr-btn.primary { background:#06b6d4; border-color:#06b6d4; color:#0f172a; font-weight:600; }',
    '.ocr-btn.primary:hover { background:#0891b2; border-color:#0891b2; color:#fff; }',
    '.ocr-btn.success { background:#166534; border-color:#166534; color:#bbf7d0; }',
    '.ocr-btn.success:hover { background:#15803d; }',
    '.ocr-btn.danger { background:#7f1d1d; border-color:#7f1d1d; color:#fecaca; }',
    '.ocr-btn:disabled { opacity:0.45; cursor:not-allowed; }',
    '.ocr-status { padding:6px 8px; background:#0f172a; border:1px solid #334155; border-radius:6px; color:#94a3b8; font-size:11px; font-family:"Consolas","Monaco",monospace; }',
    '.ocr-status.running { color:#67e8f9; border-color:#0e7490; background:rgba(8,145,178,0.08); }',
    '.ocr-status.error { color:#fca5a5; border-color:#7f1d1d; background:rgba(127,29,29,0.12); }',
    '.ocr-drop { border:2px dashed #334155; border-radius:8px; padding:24px 16px; text-align:center; color:#94a3b8; cursor:pointer; transition: border-color 0.2s ease, background 0.2s ease; }',
    '.ocr-drop:hover { border-color:#06b6d4; color:#67e8f9; }',
    '.ocr-drop.drag { border-color:#06b6d4; background:rgba(6,182,212,0.06); color:#67e8f9; }',
    '.ocr-drop .icon { font-size:28px; margin-bottom:6px; }',
    '.ocr-drop .hint { font-size:11px; color:#64748b; margin-top:4px; }',
    '.ocr-drop .filename { font-size:12px; color:#cbd5e1; margin-top:6px; font-family:"Consolas","Monaco",monospace; }',
    '.ocr-thumbs { display:flex; gap:6px; overflow-x:auto; padding:4px 2px; }',
    '.ocr-thumb { flex:0 0 60px; height:80px; border:1px solid #334155; border-radius:4px; background:#0f172a; background-size:cover; background-position:center; position:relative; }',
    '.ocr-thumb .idx { position:absolute; bottom:2px; right:2px; background:rgba(0,0,0,0.7); color:#e2e8f0; font-size:9px; padding:1px 4px; border-radius:3px; font-family:"Consolas","Monaco",monospace; }',
    '.ocr-sub-tabs { display:flex; gap:2px; margin-bottom:8px; border-bottom:1px solid #334155; }',
    '.ocr-sub-tab { padding:6px 12px; background:transparent; border:none; border-bottom:2px solid transparent; color:#94a3b8; cursor:pointer; font-size:12px; }',
    '.ocr-sub-tab:hover { color:#cbd5e1; }',
    '.ocr-sub-tab.active { color:#06b6d4; border-bottom-color:#06b6d4; }',
    '.ocr-pane { display:none; }',
    '.ocr-pane.active { display:block; }',
    '.ocr-textarea { width:100%; min-height:200px; padding:8px 10px; background:#0f172a; border:1px solid #334155; border-radius:6px; color:#e2e8f0; font-family:"Consolas","Monaco",monospace; font-size:12px; line-height:1.5; resize:vertical; outline:none; }',
    '.ocr-textarea:focus { border-color:#06b6d4; }',
    '.ocr-entity-group { margin-bottom:10px; }',
    '.ocr-entity-label { font-size:10px; font-weight:600; color:#06b6d4; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px; }',
    '.ocr-entity-row { display:flex; align-items:center; gap:6px; padding:4px 6px; background:#0f172a; border:1px solid #334155; border-radius:4px; margin-bottom:3px; font-size:12px; }',
    '.ocr-entity-row .val { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#cbd5e1; font-family:"Consolas","Monaco",monospace; font-size:11px; }',
    '.ocr-entity-row button { padding:2px 6px; background:#1e293b; border:1px solid #334155; border-radius:4px; color:#67e8f9; cursor:pointer; font-size:10px; white-space:nowrap; }',
    '.ocr-entity-row button:hover { background:#06b6d4; color:#0f172a; border-color:#06b6d4; }',
    '.ocr-empty { padding:20px 12px; text-align:center; color:#64748b; font-size:12px; }',
    '.ocr-page-block { margin-bottom:12px; padding:8px; background:#0f172a; border:1px solid #334155; border-radius:6px; display:flex; gap:8px; }',
    '.ocr-page-block .pthumb { flex:0 0 70px; height:90px; background-size:cover; background-position:center; border:1px solid #334155; border-radius:4px; }',
    '.ocr-page-block .ptext { flex:1; min-width:0; font-family:"Consolas","Monaco",monospace; font-size:11px; color:#cbd5e1; max-height:160px; overflow:auto; white-space:pre-wrap; word-break:break-word; }',
    '.ocr-progress { color:#67e8f9; font-size:11px; font-family:"Consolas","Monaco",monospace; }'
  ].join('\n');
  document.head.appendChild(styleEl);

  // ============================================================================
  // DOM SCAFFOLD
  // ============================================================================
  container.innerHTML = [
    '<div class="tab-title">&#128269; OCR</div>',
    '<div class="tab-desc">Vision-AI OCR: drop a PDF or image, extract text + entities.</div>',
    '<div class="ocr-wrap">',
    // Source
    '  <div class="ocr-card">',
    '    <div class="ocr-card-title">&#128194; Source</div>',
    '    <div class="ocr-drop" id="ocr-drop" tabindex="0">',
    '      <div class="icon">&#128196;</div>',
    '      <div>Drop a PDF or image here, or click to browse</div>',
    '      <div class="hint">Supported: .pdf .png .jpg .jpeg .webp</div>',
    '      <div class="filename" id="ocr-filename"></div>',
    '    </div>',
    '    <input type="file" id="ocr-file" accept=".pdf,image/png,image/jpeg,image/jpg,image/webp,application/pdf,image/*" style="display:none;" />',
    '    <div class="ocr-thumbs" id="ocr-thumbs" style="margin-top:8px;display:none;"></div>',
    '  </div>',
    // Engine
    '  <div class="ocr-card">',
    '    <div class="ocr-card-title">&#9881; Engine</div>',
    '    <div class="ocr-row"><label style="flex:0 0 70px;margin:0;">Model</label><select class="ocr-select" id="ocr-model"></select></div>',
    '    <div class="ocr-row"><label style="flex:0 0 70px;margin:0;">Language</label>',
    '      <select class="ocr-select" id="ocr-language">',
    '        <option value="auto">Auto-detect</option>',
    '        <option value="en">English</option>',
    '        <option value="es">Spanish</option>',
    '        <option value="fr">French</option>',
    '        <option value="de">German</option>',
    '        <option value="it">Italian</option>',
    '        <option value="pt">Portuguese</option>',
    '        <option value="ja">Japanese</option>',
    '        <option value="zh">Chinese</option>',
    '        <option value="ko">Korean</option>',
    '      </select>',
    '    </div>',
    '    <div class="ocr-row"><label style="flex:0 0 70px;margin:0;">Intent</label>',
    '      <select class="ocr-select" id="ocr-intent">',
    '        <option value="general">General</option>',
    '        <option value="invoice">Invoice</option>',
    '        <option value="receipt">Receipt</option>',
    '        <option value="business-card">Business card</option>',
    '        <option value="form">Form</option>',
    '        <option value="handwriting">Handwriting</option>',
    '      </select>',
    '    </div>',
    '    <div class="ocr-row" style="margin-top:8px;">',
    '      <button class="ocr-btn primary" id="ocr-run">&#9654; Run OCR</button>',
    '      <span class="ocr-progress" id="ocr-progress"></span>',
    '    </div>',
    '    <div class="ocr-status" id="ocr-status" style="margin-top:6px;">Idle</div>',
    '  </div>',
    // Result
    '  <div class="ocr-card" id="ocr-result-card" style="display:none;">',
    '    <div class="ocr-card-title">&#128202; Result</div>',
    '    <div class="ocr-sub-tabs">',
    '      <button class="ocr-sub-tab active" data-view="text">Text</button>',
    '      <button class="ocr-sub-tab" data-view="entities">Entities</button>',
    '      <button class="ocr-sub-tab" data-view="pages">Pages</button>',
    '    </div>',
    '    <div class="ocr-pane active" data-pane="text">',
    '      <textarea class="ocr-textarea" id="ocr-text" placeholder="Extracted text will appear here..."></textarea>',
    '      <div class="ocr-row" style="margin-top:6px;">',
    '        <button class="ocr-btn" id="ocr-rescan-entities" title="Re-extract entities from the (possibly edited) text">&#128269; Re-scan entities</button>',
    '      </div>',
    '    </div>',
    '    <div class="ocr-pane" data-pane="entities">',
    '      <div id="ocr-entities"></div>',
    '    </div>',
    '    <div class="ocr-pane" data-pane="pages">',
    '      <div id="ocr-pages"></div>',
    '    </div>',
    '    <div class="ocr-row" style="margin-top:10px;">',
    '      <button class="ocr-btn" id="ocr-copy">&#128203; Copy</button>',
    '      <button class="ocr-btn" id="ocr-export-txt">&#128190; Export TXT</button>',
    '      <button class="ocr-btn" id="ocr-export-csv">&#128229; Export CSV</button>',
    '      <button class="ocr-btn success" id="ocr-export-sheets">&#128228; Export to Sheets</button>',
    '    </div>',
    '  </div>',
    '</div>'
  ].join('\n');

  // ============================================================================
  // UTIL
  // ============================================================================
  function escHtml(s) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(s == null ? '' : String(s)));
    return d.innerHTML;
  }

  function setStatus(text, mode) {
    var el = document.getElementById('ocr-status');
    if (!el) return;
    el.textContent = text;
    el.className = 'ocr-status' + (mode ? ' ' + mode : '');
  }

  function setProgress(text) {
    var el = document.getElementById('ocr-progress');
    if (el) el.textContent = text || '';
  }

  function setRunning(running) {
    isRunning = running;
    document.getElementById('ocr-run').disabled = running;
    if (running) setStatus('Running OCR…', 'running');
  }

  function safeToast(kind, msg) {
    if (typeof window.Toast !== 'undefined' && window.Toast && typeof window.Toast[kind] === 'function') {
      window.Toast[kind](msg);
    } else {
      console.log('[OCR][' + kind + ']', msg);
    }
  }

  function formatBytes(n) {
    if (!n && n !== 0) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  }

  // ============================================================================
  // BACKEND CALL — same shape as macros-tab
  // ============================================================================
  async function call(type, payload) {
    try {
      var res = await window.sendToBackground(type, payload || {});
      if (!res) return { ok: false, error: 'No response from background (' + type + ')' };
      return res;
    } catch (err) {
      return { ok: false, error: (err && err.message) || String(err) };
    }
  }

  // ============================================================================
  // ENGINE: build model dropdown from CONFIG_LOAD + AVAILABLE_MODELS
  //   Gemini is EXCLUDED (OCR engine throws on Gemini in v5).
  // ============================================================================
  async function buildModelDropdown() {
    var sel = document.getElementById('ocr-model');
    var cfg = null;
    try {
      cfg = await window.sendToBackground('CONFIG_LOAD', {});
    } catch (_) { /* noop */ }

    // Shared catalog (core/model-catalog.js, loaded by sidebar.html) —
    // same source as the background config, so ids can no longer drift.
    // Gemini is intentionally excluded — the OCR engine throws on it.
    var CATALOG = (globalThis.DMS_MODEL_CATALOG || {}).AVAILABLE_MODELS || {};
    var MODELS = {};
    Object.keys(CATALOG).forEach(function (provider) {
      if (provider === 'gemini') return;
      MODELS[provider] = CATALOG[provider];
    });

    var apiKeys = (cfg && cfg.api_keys) || {};
    var defaults = (cfg && cfg.ai_models) || {};
    var preferredProvider = (cfg && cfg.ai_provider) || 'claude';
    if (preferredProvider === 'gemini') preferredProvider = 'claude';

    var html = '';
    Object.keys(MODELS).forEach(function (provider) {
      var hasKey = !!apiKeys[provider];
      var label = provider.charAt(0).toUpperCase() + provider.slice(1)
        + (hasKey ? '' : ' (no API key set)');
      html += '<optgroup label="' + escHtml(label) + '">';
      MODELS[provider].forEach(function (m) {
        html += '<option value="' + escHtml(m.id) + '"'
          + (hasKey ? '' : ' disabled')
          + '>' + escHtml(m.name) + '</option>';
      });
      html += '</optgroup>';
    });
    // Disabled note for Gemini models so users know why they're missing.
    html += '<optgroup label="Gemini (not supported for OCR yet)">'
      + '<option value="" disabled>Gemini models cannot be used for OCR in v5</option>'
      + '</optgroup>';
    sel.innerHTML = html;

    // Pick a default — prefer configured ai_models for the preferred provider,
    // fall back to first model in the preferred provider's list.
    var preferDefault = defaults[preferredProvider];
    if (preferDefault && sel.querySelector('option[value="' + CSS.escape(preferDefault) + '"]:not([disabled])')) {
      sel.value = preferDefault;
    } else {
      // First non-disabled option.
      var firstEnabled = sel.querySelector('option:not([disabled])');
      if (firstEnabled) sel.value = firstEnabled.value;
    }
  }

  // ============================================================================
  // FILE INTAKE
  // ============================================================================
  var SUPPORTED_EXT = ['pdf', 'png', 'jpg', 'jpeg', 'webp'];

  function fileExt(name) {
    var i = (name || '').lastIndexOf('.');
    return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
  }

  function isPdf(file) {
    return file && (file.type === 'application/pdf' || fileExt(file.name) === 'pdf');
  }

  function isImage(file) {
    if (!file) return false;
    var t = (file.type || '').toLowerCase();
    if (t.indexOf('image/') === 0) return true;
    var ext = fileExt(file.name);
    return ['png', 'jpg', 'jpeg', 'webp'].indexOf(ext) >= 0;
  }

  async function handleFile(file) {
    if (!file) return;
    var ext = fileExt(file.name);
    if (SUPPORTED_EXT.indexOf(ext) < 0 && !isImage(file) && !isPdf(file)) {
      safeToast('error', 'Unsupported file type: ' + (file.name || ext));
      return;
    }
    currentFileName = file.name || 'file';
    document.getElementById('ocr-filename').textContent =
      currentFileName + '  (' + formatBytes(file.size) + ')';
    setProgress('Loading…');
    try {
      if (isPdf(file)) {
        if (!pdfjsAvailable) {
          safeToast('error', 'PDF rendering unavailable — drop image files only');
          setProgress('');
          return;
        }
        currentPages = await renderPdfPages(file);
      } else {
        currentPages = await imageFileToPages(file);
      }
      renderThumbnails();
      setProgress(currentPages.length + ' page(s) ready');
      setStatus('Ready — pick a model and click Run OCR');
    } catch (e) {
      console.error('[OCR] file intake failed', e);
      safeToast('error', 'Failed to read file: ' + (e.message || e));
      setProgress('');
      setStatus('Failed: ' + (e.message || e), 'error');
      currentPages = [];
      renderThumbnails();
    }
  }

  async function renderPdfPages(file) {
    var arrayBuf = await file.arrayBuffer();
    var pdf = await pdfjsLib.getDocument({ data: arrayBuf }).promise;
    var pages = [];
    for (var i = 1; i <= pdf.numPages; i++) {
      setProgress('Rendering page ' + i + '/' + pdf.numPages + '…');
      var page = await pdf.getPage(i);
      var viewport = page.getViewport({ scale: 2.0 });
      var canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      pages.push({ index: i - 1, dataUrl: canvas.toDataURL('image/png') });
    }
    return pages;
  }

  function imageFileToPages(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve([{ index: 0, dataUrl: reader.result }]);
      };
      reader.onerror = function () { reject(reader.error || new Error('FileReader failed')); };
      reader.readAsDataURL(file);
    });
  }

  function renderThumbnails() {
    var wrap = document.getElementById('ocr-thumbs');
    if (!currentPages.length) {
      wrap.style.display = 'none';
      wrap.innerHTML = '';
      return;
    }
    wrap.style.display = 'flex';
    wrap.innerHTML = currentPages.map(function (p) {
      return '<div class="ocr-thumb" style="background-image:url(\'' + p.dataUrl + '\');">'
        + '<span class="idx">' + (p.index + 1) + '</span>'
        + '</div>';
    }).join('');
  }

  // ============================================================================
  // DROP ZONE
  // ============================================================================
  var dropEl = document.getElementById('ocr-drop');
  var fileInput = document.getElementById('ocr-file');

  dropEl.addEventListener('click', function () { fileInput.click(); });
  dropEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });

  fileInput.addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    if (f) handleFile(f);
    fileInput.value = ''; // allow re-selecting the same file
  });

  ['dragenter', 'dragover'].forEach(function (ev) {
    dropEl.addEventListener(ev, function (e) {
      e.preventDefault();
      e.stopPropagation();
      dropEl.classList.add('drag');
    });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    dropEl.addEventListener(ev, function (e) {
      e.preventDefault();
      e.stopPropagation();
      dropEl.classList.remove('drag');
    });
  });
  dropEl.addEventListener('drop', function (e) {
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleFile(f);
  });

  // ============================================================================
  // RUN OCR
  // ============================================================================
  document.getElementById('ocr-run').addEventListener('click', runOcr);

  function ocrStorageArea() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.session) return chrome.storage.session;
    } catch (e) {}
    return chrome.storage.local;
  }

  async function runOcr() {
    if (isRunning) return;
    if (!currentPages.length) { safeToast('warning', 'Drop a PDF or image first'); return; }
    var model = document.getElementById('ocr-model').value;
    if (!model) { safeToast('warning', 'Pick a model first (set an API key in Settings)'); return; }
    var language = document.getElementById('ocr-language').value;
    var intent = document.getElementById('ocr-intent').value;

    setRunning(true);
    setProgress('Running OCR on ' + currentPages.length + ' page(s)…');

    if (typeof window.wakeBackgroundViaPort === 'function') {
      await window.wakeBackgroundViaPort();
    }

    // Stage page images in storage — large base64 payloads break sendMessage on Firefox.
    var sessionId = 'ocr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    var storageKey = 'ocr_run_pending_' + sessionId;
    var storage = ocrStorageArea();
    try {
      await new Promise(function (resolve, reject) {
        var blob = {};
        blob[storageKey] = {
          pages: currentPages,
          sourceName: currentFileName,
          at: new Date().toISOString()
        };
        storage.set(blob, function () {
          var err = chrome.runtime.lastError;
          if (err) reject(new Error(err.message || String(err)));
          else resolve();
        });
      });
    } catch (stageErr) {
      setRunning(false);
      setStatus('Failed: ' + stageErr.message, 'error');
      safeToast('error', 'Could not stage OCR pages: ' + stageErr.message);
      return;
    }

    var r = await call('OCR_RUN', {
      sessionId: sessionId,
      sourceName: currentFileName,
      language: language,
      intent: intent,
      model: model
    });

    try {
      await new Promise(function (resolve) {
        storage.remove(storageKey, function () { resolve(); });
      });
    } catch (e) {}

    setRunning(false);

    if (!r.ok) {
      setStatus('Failed: ' + r.error, 'error');
      setProgress('');
      safeToast('error', 'OCR failed: ' + r.error);
      return;
    }
    currentResult = r.data || null;
    if (!currentResult) {
      setStatus('No data returned', 'error');
      safeToast('error', 'OCR returned no data');
      return;
    }
    var pageCount = (currentResult.pages || []).length;
    var textLen = (currentResult.fullText || '').length;
    if (!textLen) {
      var errLines = (currentResult.errors || []).map(function (e) { return e.error || ''; }).filter(Boolean);
      var hint = errLines.length ? errLines.join('; ') : 'No text extracted — verify API keys and model in Settings';
      document.getElementById('ocr-text').value = hint;
      setStatus('Done with no text — ' + pageCount + ' page(s)', 'error');
      setProgress('');
      safeToast('warning', hint);
      renderResultPanes();
      return;
    }
    setProgress('Done — ' + pageCount + ' page(s), ' + textLen + ' chars');
    setStatus('Done — ' + pageCount + ' page(s) processed');
    renderResultPanes();
  }

  // ============================================================================
  // RESULT VIEW
  // ============================================================================
  function setResultView(view) {
    resultView = view;
    container.querySelectorAll('.ocr-sub-tab').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-view') === view);
    });
    container.querySelectorAll('.ocr-pane').forEach(function (p) {
      p.classList.toggle('active', p.getAttribute('data-pane') === view);
    });
  }

  container.querySelectorAll('.ocr-sub-tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      setResultView(btn.getAttribute('data-view'));
    });
  });

  function renderResultPanes() {
    if (!currentResult) return;
    document.getElementById('ocr-result-card').style.display = 'block';
    document.getElementById('ocr-text').value = currentResult.fullText || '';

    // Entities
    var entContainer = document.getElementById('ocr-entities');
    var entities = currentResult.entities || {};
    var entityKeys = ['emails', 'phones', 'dates', 'urls', 'amounts', 'invoiceNumbers', 'totals', 'lineItems'];
    var entHtml = '';
    var totalEntities = 0;
    entityKeys.forEach(function (key) {
      var vals = entities[key];
      if (!Array.isArray(vals) || !vals.length) return;
      totalEntities += vals.length;
      var labelMap = {
        emails: 'Emails', phones: 'Phones', dates: 'Dates', urls: 'URLs',
        amounts: 'Amounts', invoiceNumbers: 'Invoice Numbers', totals: 'Totals',
        lineItems: 'Line Items'
      };
      entHtml += '<div class="ocr-entity-group">'
        + '<div class="ocr-entity-label">' + escHtml(labelMap[key] || key)
        + ' <span style="color:#64748b;font-weight:400;">(' + vals.length + ')</span></div>';
      vals.forEach(function (v, i) {
        var safeVal = escHtml(v);
        entHtml += '<div class="ocr-entity-row">'
          + '<span class="val" title="' + safeVal + '">' + safeVal + '</span>'
          + '<button data-entval-key="' + key + '" data-entval-idx="' + i + '" title="Send to DANMAN Chat">&rarr; Chat</button>'
          + '</div>';
      });
      entHtml += '</div>';
    });
    if (!totalEntities) {
      entHtml = '<div class="ocr-empty">No entities extracted from this document.</div>';
    }
    entContainer.innerHTML = entHtml;

    // Wire chat-compose buttons
    entContainer.querySelectorAll('button[data-entval-key]').forEach(function (b) {
      b.addEventListener('click', function () {
        var key = b.getAttribute('data-entval-key');
        var idx = parseInt(b.getAttribute('data-entval-idx'), 10);
        var arr = (currentResult.entities && currentResult.entities[key]) || [];
        var val = arr[idx];
        if (!val) return;
        window.dispatchEvent(new CustomEvent('danman:chat-compose', {
          detail: 'Look at this: ' + val
        }));
        // Also switch to the DANMAN chat tab for immediate visibility.
        var danmanBtn = document.querySelector('#tab-bar .tab[data-tab="danman"]');
        if (danmanBtn) danmanBtn.click();
        safeToast('info', 'Sent to DANMAN Chat');
      });
    });

    // Pages pane
    var pagesEl = document.getElementById('ocr-pages');
    var pages = currentResult.pages || [];
    if (!pages.length) {
      pagesEl.innerHTML = '<div class="ocr-empty">No page-level results.</div>';
    } else {
      pagesEl.innerHTML = pages.map(function (p, i) {
        var thumbSrc = (currentPages[i] && currentPages[i].dataUrl) || '';
        var text = escHtml(p.text || '(no text)');
        var errBadge = p.error ? '<div style="color:#fca5a5;font-size:10px;margin-bottom:4px;">Error: ' + escHtml(p.error) + '</div>' : '';
        return '<div class="ocr-page-block">'
          + (thumbSrc ? '<div class="pthumb" style="background-image:url(\'' + thumbSrc + '\');"></div>' : '')
          + '<div style="flex:1;min-width:0;">'
          + '<div style="font-size:10px;color:#64748b;margin-bottom:4px;">Page ' + ((p.index != null ? p.index : i) + 1) + '</div>'
          + errBadge
          + '<div class="ptext">' + text + '</div>'
          + '</div>'
          + '</div>';
      }).join('');
    }

    setResultView(resultView);
  }

  // ============================================================================
  // EXPORTS
  // ============================================================================
  function downloadBlob(filename, mimeType, content) {
    var blob = new Blob([content], { type: mimeType });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function safeBaseName() {
    var name = (currentFileName || 'ocr').replace(/\.[^.]+$/, '');
    return name.replace(/[^A-Za-z0-9_.-]/g, '_') || 'ocr';
  }

  document.getElementById('ocr-copy').addEventListener('click', async function () {
    if (!currentResult) { safeToast('warning', 'Run OCR first'); return; }
    var text = currentResult.fullText || '';
    try {
      await navigator.clipboard.writeText(text);
      safeToast('success', 'Copied ' + text.length + ' chars');
    } catch (e) {
      // Fallback (Firefox in iframes sometimes blocks clipboard)
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); safeToast('success', 'Copied'); }
      catch (_) { safeToast('error', 'Copy failed'); }
      document.body.removeChild(ta);
    }
  });

  document.getElementById('ocr-export-txt').addEventListener('click', function () {
    if (!currentResult) { safeToast('warning', 'Run OCR first'); return; }
    downloadBlob(safeBaseName() + '.txt', 'text/plain;charset=utf-8', currentResult.fullText || '');
    safeToast('success', 'Saved ' + safeBaseName() + '.txt');
  });

  document.getElementById('ocr-export-csv').addEventListener('click', function () {
    if (!currentResult) { safeToast('warning', 'Run OCR first'); return; }
    var csv = buildCsv(currentResult.entities || {});
    downloadBlob(safeBaseName() + '.entities.csv', 'text/csv;charset=utf-8', csv);
    safeToast('success', 'Saved ' + safeBaseName() + '.entities.csv');
  });

  function buildCsv(entities) {
    var rows = [['Type', 'Value']];
    Object.keys(entities || {}).forEach(function (k) {
      var vs = entities[k];
      if (!Array.isArray(vs)) return;
      vs.forEach(function (v) { rows.push([k, String(v)]); });
    });
    return rows.map(function (r) {
      return r.map(function (c) {
        return '"' + String(c).replace(/"/g, '""') + '"';
      }).join(',');
    }).join('\n');
  }

  document.getElementById('ocr-rescan-entities').addEventListener('click', async function () {
    if (!currentResult) { safeToast('warning', 'Run OCR first'); return; }
    var text = document.getElementById('ocr-text').value || '';
    if (!text.trim()) { safeToast('warning', 'No text to scan'); return; }
    var r = await call('OCR_EXTRACT_ENTITIES', { text: text });
    if (!r.ok) { safeToast('error', 'Re-scan failed: ' + r.error); return; }
    currentResult.fullText = text;
    currentResult.entities = r.data || {};
    renderResultPanes();
    safeToast('success', 'Entities re-scanned');
  });

  document.getElementById('ocr-export-sheets').addEventListener('click', async function () {
    if (!currentResult) { safeToast('warning', 'Run OCR first'); return; }
    var r = await call('OCR_EXPORT_SHEETS', { ocrId: currentResult.id });
    if (!r.ok) {
      // Stubbed in v4.6 today — surface the error gently.
      safeToast('warning', r.error || 'Sheets export not available');
      return;
    }
    var url = r.data && r.data.sheetUrl;
    if (url) {
      safeToast('success', 'Exported to Sheets — opening…');
      try { window.open(url, '_blank'); } catch (_) { /* ignore */ }
    } else {
      safeToast('success', 'Exported to Sheets');
    }
  });

  // ============================================================================
  // RESTORE CACHED RESULT on tab activation
  //   Backend writes ocr_last_result on every OCR_RUN. We restore it the
  //   first time the tab is activated AND whenever it's re-activated (cheap;
  //   read is fast). If the user has a NEWER currentResult in memory we
  //   don't clobber it.
  // ============================================================================
  function restoreLastResult() {
    try {
      chrome.storage.local.get('ocr_last_result', function (r) {
        var cached = r && r.ocr_last_result;
        if (!cached) return;
        if (currentResult && currentResult.id === cached.id) return; // already loaded
        if (currentResult && currentResult.createdAt && cached.createdAt
            && currentResult.createdAt >= cached.createdAt) return;
        currentResult = cached;
        if (cached.sourceName) {
          currentFileName = cached.sourceName;
          document.getElementById('ocr-filename').textContent = cached.sourceName + '  (cached)';
        }
        renderResultPanes();
        setStatus('Restored last OCR result');
      });
    } catch (_) { /* ignore */ }
  }

  window.addEventListener('tab-activated', function (e) {
    if (e && e.detail && e.detail.tab === 'ocr') {
      restoreLastResult();
    }
  });

  // ============================================================================
  // INIT
  // ============================================================================
  buildModelDropdown();
  setStatus(pdfjsAvailable
    ? 'Idle — drop a file to begin'
    : 'PDF rendering unavailable — drop image files only',
    pdfjsAvailable ? null : 'error');
  // Restore on first load too, in case the tab is already active.
  restoreLastResult();

  console.log('[DANMAN] OCR tab loaded' + (pdfjsAvailable ? '' : ' (pdf.js unavailable)'));
})();
