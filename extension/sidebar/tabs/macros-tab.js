// sidebar/tabs/macros-tab.js — Macro Recorder / Editor / Runner (Phase 7)
// Self-contained tab matching v4.6 conventions:
//   - container = document.getElementById('tab-macros')
//   - sends to background via window.sendToBackground(type, payload) -> Promise<{ok,data}|{ok,error}>
//   - surfaces feedback via global Toast.{success,error,warning,info}
//   - listens to PICKER_BROADCAST via chrome.runtime.onMessage for recorder + rebind
//
// Backend routes consumed (all in background/service-worker.js):
//   MACRO_LIST, MACRO_LOAD, MACRO_SAVE, MACRO_DELETE
//   MACRO_RUN, MACRO_PAUSE, MACRO_RESUME, MACRO_STOP, MACRO_SNAPSHOT
//   MACRO_RECORD_START, MACRO_RECORD_STOP
//   PICKER_START, PICKER_SELECTED, PICKER_CANCEL, PICKER_GET_LAST
//
// Drag-reorder of steps is deferred to a follow-up; v1 ships up/down arrows.
(function () {
  'use strict';

  var container = document.getElementById('tab-macros');
  if (!container) return;

  var B = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;
  var Schema = window.MacroStepSchema || {};
  var STEP_TYPES = Schema.STEP_TYPES || [
    { type: 'click', label: 'Click', fields: ['selector'] },
    { type: 'type', label: 'Type', fields: ['selector', 'text', 'clear'] },
    { type: 'wait', label: 'Wait', fields: ['waitType', 'value', 'selector', 'timeout'] }
  ];
  var stepTypeDef = Schema.stepTypeDef || function (t) {
    for (var i = 0; i < STEP_TYPES.length; i++) {
      if (STEP_TYPES[i].type === t) return STEP_TYPES[i];
    }
    return null;
  };

  function t(key) {
    if (window.DMS_I18n && typeof window.DMS_I18n.t === 'function') {
      return window.DMS_I18n.t('macros.' + key);
    }
    return key;
  }

  var historyPast = [];
  var historyFuture = [];
  var studioRecording = false;
  var studioPaused = false;
  var studioLiveCount = 0;
  var animateMouse = true;
  var screenPickSessionId = null;
  var pendingAddStep = null; // { type, coordMode }
  var appendPickerSessionId = null;

  function pushHistory() {
    historyPast.push(JSON.stringify(currentMacro.steps));
    if (historyPast.length > 50) historyPast.shift();
    historyFuture = [];
  }

  function undoHistory() {
    if (!historyPast.length) return;
    historyFuture.push(JSON.stringify(currentMacro.steps));
    currentMacro.steps = JSON.parse(historyPast.pop());
    renderSteps();
  }

  function redoHistory() {
    if (!historyFuture.length) return;
    historyPast.push(JSON.stringify(currentMacro.steps));
    currentMacro.steps = JSON.parse(historyFuture.pop());
    renderSteps();
  }

  // ============================================================================
  // STATE — in-memory editor state; persistence only via MACRO_SAVE
  // ============================================================================
  var savedList = [];          // array of {id, name, ...} from MACRO_LIST
  var currentMacro = {
    id: null,
    name: '',
    steps: [],
    variables: {}
  };
  var editingStepIdx = null;   // index of step in inline-edit mode

  // Recording + picking session ids. We listen to PICKER_BROADCAST for both modes.
  var recordingSessionId = null;   // active picker-mode recording session id from MACRO_RECORD_START
  var recordingPickerSessionId = null; // session id returned by PICKER_START during recording
  var recordMode = 'studio'; // 'studio' (Macro Studio recorder) | 'picker' (click-only picker)
  var pickingForStep = null;   // {stepIndex, pickerSessionId} while rebinding a single step
  var pickerPollTimer = null;  // fallback PICKER_GET_LAST poll if broadcast is missed
  var lastSeenSelector = null; // dedupe key for poll-fallback path

  // Run polling
  var snapshotTimer = null;

  // ============================================================================
  // STYLES (scoped to .mac- prefix to avoid collision with other tabs)
  // ============================================================================
  var styleEl = document.createElement('style');
  styleEl.textContent = [
    '.mac-wrap { display:flex; flex-direction:column; gap:12px; }',
    '.mac-card { background:#1e293b; border:1px solid #334155; border-radius:8px; padding:12px; }',
    '.mac-card-title { font-size:12px; font-weight:600; color:#94a3b8; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:10px; display:flex; align-items:center; gap:6px; }',
    '.mac-row { display:flex; gap:6px; align-items:center; margin-bottom:6px; flex-wrap:wrap; }',
    '.mac-row > * { min-width:0; }',
    '.mac-select, .mac-input { flex:1; padding:6px 8px; background:#0f172a; border:1px solid #334155; border-radius:6px; color:#e2e8f0; font-size:12px; outline:none; }',
    '.mac-select:focus, .mac-input:focus { border-color:#f97316; }',
    '.mac-btn { padding:6px 10px; border:1px solid #334155; border-radius:6px; background:#1e293b; color:#e2e8f0; cursor:pointer; font-size:12px; white-space:nowrap; display:inline-flex; align-items:center; gap:4px; }',
    '.mac-btn:hover { background:#334155; }',
    '.mac-btn.primary { background:#f97316; border-color:#f97316; color:#fff; }',
    '.mac-btn.primary:hover { background:#ea580c; border-color:#ea580c; }',
    '.mac-btn.danger { background:#7f1d1d; border-color:#7f1d1d; color:#fecaca; }',
    '.mac-btn.danger:hover { background:#991b1b; }',
    '.mac-btn.success { background:#166534; border-color:#166534; color:#bbf7d0; }',
    '.mac-btn.success:hover { background:#15803d; }',
    '.mac-btn.recording { background:#dc2626; border-color:#dc2626; color:#fff; animation: mac-pulse 1.2s ease-in-out infinite; }',
    '@keyframes mac-pulse { 0%,100% { opacity:1; } 50% { opacity:0.55; } }',
    '.mac-btn:disabled { opacity:0.45; cursor:not-allowed; }',
    '.mac-status { padding:6px 8px; background:#0f172a; border:1px solid #334155; border-radius:6px; color:#94a3b8; font-size:11px; font-family:"Consolas","Monaco",monospace; }',
    '.mac-status.recording { color:#fca5a5; border-color:#7f1d1d; background:rgba(220,38,38,0.08); }',
    '.mac-status.picking { color:#fdba74; border-color:#9a3412; background:rgba(249,115,22,0.08); }',
    '.mac-status.running { color:#86efac; border-color:#166534; background:rgba(22,101,52,0.08); }',
    '.mac-steps { display:flex; flex-direction:column; gap:4px; }',
    '.mac-step { display:flex; align-items:center; gap:6px; padding:6px 8px; background:#0f172a; border:1px solid #334155; border-radius:6px; font-size:12px; }',
    '.mac-step:hover { border-color:#475569; }',
    '.mac-step .idx { flex:0 0 22px; color:#64748b; font-family:"Consolas","Monaco",monospace; font-weight:700; text-align:right; }',
    '.mac-step .type-badge { flex:0 0 60px; padding:2px 6px; background:#1e293b; border:1px solid #334155; border-radius:4px; color:#fbbf24; font-size:10px; text-align:center; text-transform:uppercase; letter-spacing:0.5px; }',
    '.mac-step .summary { flex:1; min-width:0; color:#cbd5e1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-family:"Consolas","Monaco",monospace; font-size:11px; }',
    '.mac-step .actions { display:flex; gap:2px; align-items:center; flex-shrink:0; }',
    '.mac-step .actions button { padding:3px 6px; background:transparent; border:none; color:#94a3b8; cursor:pointer; border-radius:4px; font-size:11px; }',
    '.mac-step .actions button:hover { background:rgba(148,163,184,0.15); color:#e2e8f0; }',
    '.mac-step .actions button.del:hover { background:rgba(239,68,68,0.15); color:#ef4444; }',
    '.mac-step.editing { flex-wrap:wrap; align-items:flex-start; background:rgba(249,115,22,0.06); border-color:#f97316; }',
    '.mac-step .edit-grid { flex:1 1 100%; display:grid; grid-template-columns:80px 1fr; gap:6px; align-items:center; margin-top:6px; }',
    '.mac-step .edit-grid label { font-size:11px; color:#94a3b8; margin:0; }',
    '.mac-empty-steps { padding:20px 12px; text-align:center; color:#64748b; font-size:12px; border:1px dashed #334155; border-radius:6px; }',
    '.mac-progress-track { width:100%; height:8px; background:#0f172a; border:1px solid #334155; border-radius:4px; overflow:hidden; margin-bottom:6px; }',
    '.mac-progress-fill { height:100%; background:linear-gradient(90deg,#f97316,#fb923c); transition:width 0.25s ease; }',
    '.mac-progress-text { font-size:11px; color:#94a3b8; font-family:"Consolas","Monaco",monospace; }',
    '.mac-progress-log { margin-top:6px; padding:6px 8px; background:#0f172a; border:1px solid #334155; border-radius:6px; font-size:10px; color:#cbd5e1; font-family:"Consolas","Monaco",monospace; max-height:60px; overflow-y:auto; }',
    '.mac-add-menu { position:relative; display:inline-block; }',
    '.mac-add-menu .menu { position:absolute; top:100%; left:0; background:#1e293b; border:1px solid #334155; border-radius:6px; min-width:140px; z-index:10; box-shadow:0 4px 12px rgba(0,0,0,0.4); display:none; margin-top:2px; }',
    '.mac-add-menu.open .menu { display:block; }',
    '.mac-add-menu .menu button { display:block; width:100%; text-align:left; padding:6px 10px; background:transparent; border:none; color:#e2e8f0; cursor:pointer; font-size:12px; }',
    '.mac-add-menu .menu button:hover { background:#334155; }',
    '.mac-screen-action-hint { flex:1 1 100%; font-size:11px; color:#fdba74; margin-top:4px; }',
    '.mac-screen-subfield { display:none; }',
    '.mac-screen-subfield.visible { display:contents; }'
  ].join('\n');
  document.head.appendChild(styleEl);

  // ============================================================================
  // DOM SCAFFOLD
  // ============================================================================
  container.innerHTML = [
    '<div class="tab-title">&#9881; Macros</div>',
    '<div class="tab-desc">Record, edit, and replay click/type sequences on any page.</div>',
    '<div class="mac-wrap">',
    '  <div class="mac-card">',
    '    <div class="mac-card-title" id="mac-lang-title">Language</div>',
    '    <div class="mac-row"><select class="mac-select" id="mac-language"></select></div>',
    '  </div>',
    // Saved macros
    '  <div class="mac-card">',
    '    <div class="mac-card-title" id="mac-saved-title">&#128190; Saved Macros</div>',
    '    <div class="mac-row">',
    '      <select class="mac-select" id="mac-list"><option value="">-- new macro --</option></select>',
    '      <button class="mac-btn" id="mac-new" title="Start a new macro">+ New</button>',
    '    </div>',
    '    <div class="mac-row">',
    '      <input type="text" class="mac-input" id="mac-name" placeholder="Macro name..." />',
    '    </div>',
    '    <div class="mac-row">',
    '      <button class="mac-btn primary" id="mac-run">&#9654; Run</button>',
    '      <button class="mac-btn success" id="mac-save">&#128190; Save</button>',
    '      <button class="mac-btn danger" id="mac-delete">&#10005; Delete</button>',
    '    </div>',
    '  </div>',
    // Recorder
    '  <div class="mac-card">',
    '    <div class="mac-card-title" id="mac-rec-title">&#127908; Recorder</div>',
    '    <div class="mac-row">',
    '      <select class="mac-select" id="mac-record-mode" style="max-width:120px;">',
    '        <option value="studio">Studio</option>',
    '        <option value="picker">Picker</option>',
    '      </select>',
    '      <button class="mac-btn" id="mac-record">&#9210; Record</button>',
    '      <button class="mac-btn" id="mac-pause-record" disabled>&#10074;&#10074; Pause</button>',
    '      <button class="mac-btn" id="mac-stop-record" disabled>&#9209; Stop</button>',
    '    </div>',
    '    <div class="mac-row">',
    '      <label style="font-size:11px;color:#94a3b8;display:flex;align-items:center;gap:6px;">',
    '        <input type="checkbox" id="mac-animate-mouse" checked /> Animate mouse on replay',
    '      </label>',
    '    </div>',
    '    <div class="mac-row">',
    '      <button class="mac-btn" id="mac-undo" title="Undo">&#8630; Undo</button>',
    '      <button class="mac-btn" id="mac-redo" title="Redo">&#8631; Redo</button>',
    '    </div>',
    '    <div class="mac-status" id="mac-recorder-status">Idle</div>',
    '  </div>',
    // Steps
    '  <div class="mac-card">',
    '    <div class="mac-card-title">&#128221; Steps <span style="margin-left:auto;font-size:10px;color:#64748b;font-weight:400;text-transform:none;letter-spacing:0;" id="mac-step-count">0 steps</span></div>',
    '    <div class="mac-steps" id="mac-step-list"></div>',
    '    <div class="mac-row" style="margin-top:8px;">',
    '      <div class="mac-add-menu" id="mac-add-menu">',
    '        <button class="mac-btn" id="mac-add-toggle">+ Add step &#9662;</button>',
    '        <div class="menu" id="mac-add-list"></div>',
    '      </div>',
    '    </div>',
    '  </div>',
    // Progress
    '  <div class="mac-card" id="mac-progress-card" style="display:none;">',
    '    <div class="mac-card-title">&#9201; Progress</div>',
    '    <div class="mac-progress-track"><div class="mac-progress-fill" id="mac-progress-fill" style="width:0%;"></div></div>',
    '    <div class="mac-progress-text" id="mac-progress-text">Idle</div>',
    '    <div class="mac-progress-log" id="mac-progress-log"></div>',
    '    <div class="mac-row" style="margin-top:8px;">',
    '      <button class="mac-btn" id="mac-pause">&#10074;&#10074; Pause</button>',
    '      <button class="mac-btn" id="mac-resume" disabled>&#9654; Resume</button>',
    '      <button class="mac-btn danger" id="mac-stop">&#9209; Stop</button>',
    '    </div>',
    '  </div>',
    // Event log — collapsible, collapsed by default
    '  <div class="mac-card">',
    '    <div class="mac-card-title mac-log-hdr" id="mac-log-hdr" style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;margin:0;">',
    '      <span>&#128203; Event log <span id="mac-log-count" style="font-weight:400;opacity:0.7;">0 events</span></span>',
    '      <span id="mac-log-chevron" style="font-size:10px;transition:transform 0.2s;transform:rotate(-90deg);">&#9660;</span>',
    '    </div>',
    '    <div id="mac-log-body" style="display:none;margin-top:8px;">',
    '      <div id="mac-log-list" style="max-height:240px;overflow-y:auto;font-size:10px;font-family:Consolas,Monaco,monospace;background:#0f172a;border:1px solid #334155;border-radius:6px;padding:6px;"></div>',
    '      <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;">',
    '        <button class="mac-btn" id="mac-log-clear">Clear</button>',
    '        <button class="mac-btn" id="mac-log-json">Export JSON</button>',
    '        <button class="mac-btn" id="mac-log-csv">Export CSV</button>',
    '      </div>',
    '    </div>',
    '  </div>',
    '</div>'
  ].join('\n');

  // ============================================================================
  // MACRO EVENT LOG
  // ============================================================================
  var macroLogBuffer = [];

  function macroLog(level, msg, meta) {
    var entry = { ts: new Date().toISOString(), level: level || 'info', msg: String(msg), meta: meta || null };
    macroLogBuffer.push(entry);
    var list = document.getElementById('mac-log-list');
    if (!list) return;
    var line = document.createElement('div');
    var color = level === 'error' ? '#fca5a5' : level === 'warn' ? '#fde68a' : level === 'ok' ? '#86efac' : level === 'step' ? '#fdba74' : '#93c5fd';
    line.style.cssText = 'margin:2px 0;color:' + color + ';';
    line.textContent = new Date(entry.ts).toLocaleTimeString() + ' [' + entry.level.toUpperCase() + '] ' + entry.msg + (meta ? ' · ' + JSON.stringify(meta) : '');
    list.appendChild(line);
    list.scrollTop = list.scrollHeight;
    var ct = document.getElementById('mac-log-count');
    if (ct) ct.textContent = macroLogBuffer.length + ' event' + (macroLogBuffer.length !== 1 ? 's' : '');
  }

  (function initMacroLog() {
    var hdr = document.getElementById('mac-log-hdr');
    var body = document.getElementById('mac-log-body');
    var chev = document.getElementById('mac-log-chevron');
    if (hdr) {
      hdr.addEventListener('click', function () {
        var hidden = body.style.display === 'none';
        body.style.display = hidden ? 'block' : 'none';
        if (chev) chev.style.transform = hidden ? 'rotate(0deg)' : 'rotate(-90deg)';
      });
    }
    var clearBtn = document.getElementById('mac-log-clear');
    if (clearBtn) clearBtn.addEventListener('click', function () {
      macroLogBuffer = [];
      var list = document.getElementById('mac-log-list');
      if (list) list.innerHTML = '';
      var ct = document.getElementById('mac-log-count');
      if (ct) ct.textContent = '0 events';
    });
    var jsonBtn = document.getElementById('mac-log-json');
    if (jsonBtn) jsonBtn.addEventListener('click', function () {
      if (!macroLogBuffer.length) return;
      var blob = new Blob([JSON.stringify(macroLogBuffer, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = 'macro-events-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
      a.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });
    var csvBtn = document.getElementById('mac-log-csv');
    if (csvBtn) csvBtn.addEventListener('click', function () {
      if (!macroLogBuffer.length) return;
      var rows = [['timestamp', 'level', 'message', 'meta']].concat(
        macroLogBuffer.map(function (e) {
          return [e.ts, e.level, '"' + e.msg.replace(/"/g, '""') + '"', '"' + JSON.stringify(e.meta || '').replace(/"/g, '""') + '"'];
        })
      );
      var blob = new Blob([rows.map(function (r) { return r.join(','); }).join('\n')], { type: 'text/csv' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = 'macro-events-' + new Date().toISOString().replace(/[:.]/g, '-') + '.csv';
      a.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });
  })();

  // ============================================================================
  // UTIL
  // ============================================================================
  function escHtml(s) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(s == null ? '' : String(s)));
    return d.innerHTML;
  }

  function summarizeStep(step) {
    if (Schema.summarizeStep) return Schema.summarizeStep(step);
    return step.selector || '(no selector)';
  }

  var SCREEN_ACTION_OPTIONS = [
    { value: 'clickLeft', label: 'Left click' },
    { value: 'clickRight', label: 'Right click' },
    { value: 'clickDouble', label: 'Double click' },
    { value: 'clickMiddle', label: 'Middle click' },
    { value: 'scrollUp', label: 'Scroll up (lines)' },
    { value: 'scrollDown', label: 'Scroll down (lines)' },
    { value: 'hover', label: 'Hover and wait' }
  ];

  function screenActionUiValue(step) {
    var act = step.screenAction || 'click';
    if (act === 'scrollUp') return 'scrollUp';
    if (act === 'scrollDown') return 'scrollDown';
    if (act === 'hover') return 'hover';
    if (step.button === 'right') return 'clickRight';
    if (step.button === 'double') return 'clickDouble';
    if (step.button === 'middle') return 'clickMiddle';
    return 'clickLeft';
  }

  function applyScreenActionUi(step, uiVal) {
    step.screenAction = 'click';
    step.button = 'left';
    if (uiVal === 'clickRight') step.button = 'right';
    else if (uiVal === 'clickDouble') step.button = 'double';
    else if (uiVal === 'clickMiddle') step.button = 'middle';
    else if (uiVal === 'scrollUp') step.screenAction = 'scrollUp';
    else if (uiVal === 'scrollDown') step.screenAction = 'scrollDown';
    else if (uiVal === 'hover') step.screenAction = 'hover';
    if (step.scrollLines == null) step.scrollLines = 3;
    if (step.waitMs == null) step.waitMs = 1000;
    return step;
  }

  function buildScreenClickEditFields(step, i) {
    var uiVal = screenActionUiValue(step);
    var act = step.screenAction || 'click';
    var html = '<div class="edit-grid mac-screen-edit" data-idx="' + i + '">';
    html += '<label>Action</label><select class="mac-select" data-edit="screenActionUi">'
      + SCREEN_ACTION_OPTIONS.map(function (opt) {
        return '<option value="' + opt.value + '"' + (uiVal === opt.value ? ' selected' : '') + '>' + escHtml(opt.label) + '</option>';
      }).join('') + '</select>';
    html += '<label>X</label><input class="mac-input" type="number" data-edit="x" value="' + escHtml(step.x != null ? step.x : '') + '" />';
    html += '<label>Y</label><input class="mac-input" type="number" data-edit="y" value="' + escHtml(step.y != null ? step.y : '') + '" />';
    html += '<label>Coord mode</label><select class="mac-select" data-edit="coordMode">'
      + ['precise', 'relative'].map(function (m) {
        return '<option value="' + m + '"' + ((step.coordMode || 'precise') === m ? ' selected' : '') + '>' + m + '</option>';
      }).join('') + '</select>';
    html += '<span class="mac-screen-subfield mac-screen-scroll' + (act === 'scrollUp' || act === 'scrollDown' ? ' visible' : '') + '"><label>Lines</label>'
      + '<input class="mac-input" type="number" min="1" data-edit="scrollLines" value="' + escHtml(step.scrollLines != null ? step.scrollLines : 3) + '" /></span>';
    html += '<span class="mac-screen-subfield mac-screen-hover' + (act === 'hover' ? ' visible' : '') + '"><label>Wait (ms)</label>'
      + '<input class="mac-input" type="number" min="100" step="100" data-edit="waitMs" value="' + escHtml(step.waitMs != null ? step.waitMs : 1000) + '" /></span>';
    html += '<span class="mac-screen-action-hint">Coordinates captured from the page. Choose action type, then Apply.</span>';
    html += '</div>';
    html += '<div class="mac-row" style="flex:1 1 100%;justify-content:flex-end;margin-top:6px;margin-bottom:0;">'
      + '<button class="mac-btn" data-act="repick-screen" data-idx="' + i + '" title="Pick a new spot on the page">&#128205; Re-pick</button>'
      + '<button class="mac-btn" data-act="cancel-edit" data-idx="' + i + '">Cancel</button>'
      + '<button class="mac-btn primary" data-act="save-edit" data-idx="' + i + '">Apply</button>'
      + '</div>';
    return html;
  }

  function updateScreenActionSubfields(row) {
    if (!row) return;
    var sel = row.querySelector('[data-edit="screenActionUi"]');
    if (!sel) return;
    var uiVal = sel.value;
    var scroll = row.querySelector('.mac-screen-scroll');
    var hover = row.querySelector('.mac-screen-hover');
    if (scroll) scroll.classList.toggle('visible', uiVal === 'scrollUp' || uiVal === 'scrollDown');
    if (hover) hover.classList.toggle('visible', uiVal === 'hover');
  }

  function denormalizeSteps(steps) {
    return Schema.denormalizeSteps ? Schema.denormalizeSteps(steps) : (steps || []).slice();
  }

  function appendRecordedSteps(steps) {
    if (!steps || !steps.length) return;
    pushHistory();
    var merged = currentMacro.steps.concat(steps);
    currentMacro.steps = denormalizeSteps(merged);
    renderSteps();
  }

  function setStatus(text, mode) {
    var el = document.getElementById('mac-recorder-status');
    if (!el) return;
    el.textContent = text;
    el.className = 'mac-status' + (mode ? ' ' + mode : '');
  }

  function safeToast(kind, msg) {
    if (typeof window.Toast !== 'undefined' && window.Toast && typeof window.Toast[kind] === 'function') {
      window.Toast[kind](msg);
    } else {
      console.log('[Macros][' + kind + ']', msg);
    }
  }

  // ============================================================================
  // BACKEND CALLS — every response shape: {ok:true,data} | {ok:false,error}
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
  // SAVED LIST
  // ============================================================================
  async function loadList(selectIdAfter) {
    var r = await call('MACRO_LIST');
    if (!r.ok) { safeToast('error', 'Load list: ' + r.error); return; }
    savedList = Array.isArray(r.data) ? r.data : [];
    var sel = document.getElementById('mac-list');
    var keep = selectIdAfter || sel.value;
    sel.innerHTML = '<option value="">-- new macro --</option>' + savedList.map(function (m) {
      return '<option value="' + escHtml(m.id) + '">' + escHtml(m.name || '(unnamed)') + '</option>';
    }).join('');
    if (keep) sel.value = keep;
  }

  function syncShared() {
    if (window.GPD_MacroShared) window.GPD_MacroShared.set(currentMacro);
  }

  async function loadMacro(id) {
    if (!id) {
      currentMacro = { id: null, name: '', steps: [], variables: {} };
      document.getElementById('mac-name').value = '';
      renderSteps();
      syncShared();
      return;
    }
    var r = await call('MACRO_LOAD', { id: id });
    if (!r.ok) { safeToast('error', 'Load: ' + r.error); return; }
    currentMacro = {
      id: r.data.id,
      name: r.data.name || '',
      steps: denormalizeSteps(Array.isArray(r.data.steps) ? r.data.steps : []),
      variables: r.data.variables || {}
    };
    historyPast = [];
    historyFuture = [];
    document.getElementById('mac-name').value = currentMacro.name;
    renderSteps();
    syncShared();
  }

  // ============================================================================
  // STEPS RENDER
  // ============================================================================
  function renderSteps() {
    var listEl = document.getElementById('mac-step-list');
    var countEl = document.getElementById('mac-step-count');
    var steps = currentMacro.steps;
    countEl.textContent = steps.length + ' step' + (steps.length === 1 ? '' : 's');

    if (!steps.length) {
      listEl.innerHTML = '<div class="mac-empty-steps">No steps yet. Record from the page or use <strong>+ Add step</strong>.</div>';
      return;
    }

    var html = steps.map(function (step, i) {
      var editing = editingStepIdx === i;
      var def = stepTypeDef(step.type) || { fields: [] };
      var isPending = !!step._pending;
      var rowCls = 'mac-step' + (editing ? ' editing' : '') + (isPending ? ' recording' : '');
      var summary = isPending
        ? (step.x != null && step.y != null && !isNaN(step.x) && !isNaN(step.y)
          ? '<span style="color:#f97316;">⏳ Live: (' + step.x + ', ' + step.y + ') — left-click to confirm</span>'
          : '<span style="color:#f97316;animation:mac-pulse 1s infinite;">⏳ Move mouse on page… left-click to capture</span>')
        : escHtml(summarizeStep(step));
      var typeBadge = escHtml(String(step.type || '?').toUpperCase());

      var editFields = '';
      if (editing) {
        if (step.type === 'screenClick') {
          editFields = buildScreenClickEditFields(step, i);
        } else {
        editFields = '<div class="edit-grid">';
        // type selector (always editable)
        editFields += '<label>Type</label>'
          + '<select class="mac-select" data-edit="type">'
          + STEP_TYPES.map(function (st) {
            return '<option value="' + st.type + '"' + (st.type === step.type ? ' selected' : '') + '>' + st.label + '</option>';
          }).join('')
          + '</select>';
        // fields
        def.fields.forEach(function (f) {
          var labelText = f.charAt(0).toUpperCase() + f.slice(1);
          var val = step[f] == null ? '' : step[f];
          if (f === 'clear' || f === 'pauseOnMissing') {
            var checked = step[f] !== false ? ' checked' : '';
            editFields += '<label>' + escHtml(labelText) + '</label>'
              + '<input class="mac-input" type="checkbox" data-edit="' + f + '"' + checked + ' />';
          } else if (f === 'button') {
            editFields += '<label>' + escHtml(labelText) + '</label><select class="mac-select" data-edit="button">'
              + ['left', 'right', 'double'].map(function (b) {
                return '<option value="' + b + '"' + ((step.button || 'left') === b ? ' selected' : '') + '>' + b + '</option>';
              }).join('') + '</select>';
          } else if (f === 'coordMode') {
            editFields += '<label>' + escHtml(labelText) + '</label><select class="mac-select" data-edit="coordMode">'
              + ['precise', 'relative'].map(function (m) {
                return '<option value="' + m + '"' + ((step.coordMode || 'precise') === m ? ' selected' : '') + '>' + m + '</option>';
              }).join('') + '</select>';
          } else if (f === 'captureMode') {
            editFields += '<label>' + escHtml(labelText) + '</label><select class="mac-select" data-edit="captureMode">'
              + ['viewport', 'selector', 'coords'].map(function (m) {
                return '<option value="' + m + '"' + ((step.captureMode || 'viewport') === m ? ' selected' : '') + '>' + m + '</option>';
              }).join('') + '</select>';
          } else if (f === 'tabMatch') {
            editFields += '<label>' + escHtml(labelText) + '</label><select class="mac-select" data-edit="tabMatch">'
              + ['title', 'url', 'index'].map(function (m) {
                return '<option value="' + m + '"' + ((step.tabMatch || 'title') === m ? ' selected' : '') + '>' + m + '</option>';
              }).join('') + '</select>';
          } else if (f === 'selector') {
            editFields += '<label>' + escHtml(labelText) + '</label>'
              + '<div style="display:flex;gap:4px;"><input class="mac-input" type="text" data-edit="selector" value="' + escHtml(val) + '" readonly style="flex:1;" />'
              + '<button type="button" class="mac-btn" data-act="pick-edit" data-idx="' + i + '" title="Pick on page">&#128205;</button></div>';
          } else {
            var inputType = (f === 'ms' || f === 'timeout' || f === 'x' || f === 'y' || f === 'width' || f === 'height') ? 'number' : 'text';
            editFields += '<label>' + escHtml(labelText) + '</label>'
              + '<input class="mac-input" type="' + inputType + '" data-edit="' + f + '" value="' + escHtml(val) + '" />';
          }
        });
        editFields += '</div>';
        editFields += '<div class="mac-row" style="flex:1 1 100%;justify-content:flex-end;margin-top:6px;margin-bottom:0;">'
          + '<button class="mac-btn" data-act="cancel-edit" data-idx="' + i + '">Cancel</button>'
          + '<button class="mac-btn primary" data-act="save-edit" data-idx="' + i + '">Apply</button>'
          + '</div>';
        }
      }

      return '<div class="' + rowCls + '" data-idx="' + i + '">'
        + '<span class="idx">' + (i + 1) + '.</span>'
        + '<span class="type-badge">' + typeBadge + '</span>'
        + '<span class="summary" title="' + summary + '">' + summary + '</span>'
        + '<span class="actions">'
        + (i > 0 ? '<button data-act="up" data-idx="' + i + '" title="Move up">&#9650;</button>' : '')
        + (i < steps.length - 1 ? '<button data-act="down" data-idx="' + i + '" title="Move down">&#9660;</button>' : '')
        + '<button data-act="pick" data-idx="' + i + '" title="Rebind selector via element picker">&#128205;</button>'
        + '<button data-act="dup" data-idx="' + i + '" title="Duplicate">&#128196;</button>'
        + '<button data-act="edit" data-idx="' + i + '" title="Edit">&#9998;</button>'
        + '<button class="del" data-act="delete" data-idx="' + i + '" title="Delete">&#10005;</button>'
        + '</span>'
        + editFields
        + '</div>';
    }).join('');

    listEl.innerHTML = html;
    syncShared();
  }

  document.getElementById('mac-step-list').addEventListener('change', function (e) {
    if (e.target && e.target.matches('[data-edit="screenActionUi"]')) {
      updateScreenActionSubfields(e.target.closest('.mac-step'));
    }
  });

  // Event delegation for step actions
  document.getElementById('mac-step-list').addEventListener('click', function (e) {
    var btn = e.target.closest('button');
    if (!btn) return;
    var act = btn.getAttribute('data-act');
    var idx = parseInt(btn.getAttribute('data-idx'), 10);
    if (isNaN(idx)) return;

    if (act === 'dup') {
      pushHistory();
      currentMacro.steps.splice(idx + 1, 0, JSON.parse(JSON.stringify(currentMacro.steps[idx])));
      renderSteps();
    } else if (act === 'up' && idx > 0) {
      pushHistory();
      var s = currentMacro.steps;
      var tmp = s[idx - 1]; s[idx - 1] = s[idx]; s[idx] = tmp;
      renderSteps();
    } else if (act === 'down' && idx < currentMacro.steps.length - 1) {
      pushHistory();
      var s2 = currentMacro.steps;
      var tmp2 = s2[idx + 1]; s2[idx + 1] = s2[idx]; s2[idx] = tmp2;
      renderSteps();
    } else if (act === 'delete') {
      pushHistory();
      currentMacro.steps.splice(idx, 1);
      if (editingStepIdx === idx) editingStepIdx = null;
      renderSteps();
    } else if (act === 'edit') {
      editingStepIdx = (editingStepIdx === idx) ? null : idx;
      renderSteps();
    } else if (act === 'cancel-edit') {
      editingStepIdx = null;
      renderSteps();
    } else if (act === 'save-edit') {
      var row = document.querySelector('.mac-step[data-idx="' + idx + '"]');
      if (!row) return;
      var newType = row.querySelector('[data-edit="type"]');
      var newStep = { type: newType ? newType.value : currentMacro.steps[idx].type };
      if (newStep.type === 'screenClick') {
        newStep = {
          type: 'screenClick',
          x: parseInt((row.querySelector('[data-edit="x"]') || {}).value, 10),
          y: parseInt((row.querySelector('[data-edit="y"]') || {}).value, 10),
          coordMode: (row.querySelector('[data-edit="coordMode"]') || {}).value || 'precise',
          scrollLines: parseInt((row.querySelector('[data-edit="scrollLines"]') || {}).value, 10) || 3,
          waitMs: parseInt((row.querySelector('[data-edit="waitMs"]') || {}).value, 10) || 1000,
          viewportW: currentMacro.steps[idx].viewportW,
          viewportH: currentMacro.steps[idx].viewportH
        };
        applyScreenActionUi(newStep, (row.querySelector('[data-edit="screenActionUi"]') || {}).value || 'clickLeft');
      } else {
        var def = stepTypeDef(newStep.type) || { fields: [] };
        if (newType) newStep.type = newType.value;
        def.fields.forEach(function (f) {
          var input = row.querySelector('[data-edit="' + f + '"]');
          if (!input) return;
          if (f === 'ms' || f === 'timeout' || f === 'x' || f === 'y') newStep[f] = parseInt(input.value, 10) || 0;
          else if (f === 'clear' || f === 'pauseOnMissing') newStep[f] = input.type === 'checkbox' ? input.checked : (input.value === 'true');
          else newStep[f] = input.value;
        });
      }
      pushHistory();
      currentMacro.steps[idx] = newStep;
      editingStepIdx = null;
      renderSteps();
      setStatus('Idle');
      safeToast('success', 'Step updated');
    } else if (act === 'repick-screen') {
      startScreenPick('screenClick', currentMacro.steps[idx].coordMode || 'precise', idx);
    } else if (act === 'pick' || act === 'pick-edit') {
      var pickStep = currentMacro.steps[idx];
      if (pickStep && (pickStep.type === 'screenClick' || pickStep.type === 'mouseMove')) {
        startScreenPick(pickStep.type, pickStep.coordMode || 'precise', idx);
      } else {
        pickForStep(idx);
      }
    }
  });

  // ============================================================================
  // ADD-STEP MENU
  // ============================================================================
  (function buildAddMenu() {
    var listEl = document.getElementById('mac-add-list');
    listEl.innerHTML = STEP_TYPES.map(function (st) {
      return '<button data-add="' + st.type + '">' + st.label + '</button>';
    }).join('');
    listEl.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      var t = b.getAttribute('data-add');
      var def = stepTypeDef(t);
      if (!def) return;
      document.getElementById('mac-add-menu').classList.remove('open');

      if (def.pickSelector) {
        startAddStepPicker(t);
        return;
      }
      if (def.pickScreen) {
        startScreenPick(t, 'precise');
        return;
      }
      if (t === 'copy' || t === 'paste') {
        pushHistory();
        currentMacro.steps.push({ type: t });
        renderSteps();
        safeToast('success', 'Added ' + t + ' step');
        return;
      }
      pushHistory();
      var newStep = { type: t };
      def.fields.forEach(function (f) {
        if (f === 'ms') newStep[f] = 1000;
        else if (f === 'button') newStep[f] = 'left';
        else if (f === 'coordMode') newStep[f] = 'precise';
        else if (f === 'tabMatch') newStep.tabMatch = 'title';
        else if (f === 'pauseOnMissing') newStep.pauseOnMissing = true;
        else newStep[f] = '';
      });
      currentMacro.steps.push(newStep);
      editingStepIdx = currentMacro.steps.length - 1;
      renderSteps();
    });
  })();

  document.getElementById('mac-add-toggle').addEventListener('click', function (e) {
    e.stopPropagation();
    document.getElementById('mac-add-menu').classList.toggle('open');
  });
  document.addEventListener('click', function () {
    document.getElementById('mac-add-menu').classList.remove('open');
  });

  // ============================================================================
  // SAVED-MACRO CONTROLS
  // ============================================================================
  document.getElementById('mac-list').addEventListener('change', function (e) {
    loadMacro(e.target.value);
  });

  document.getElementById('mac-new').addEventListener('click', function () {
    document.getElementById('mac-list').value = '';
    loadMacro(null);
    setStatus('New macro — name it and add steps');
  });

  document.getElementById('mac-name').addEventListener('input', function (e) {
    currentMacro.name = e.target.value;
    syncShared();
  });

  document.getElementById('mac-save').addEventListener('click', async function () {
    var name = document.getElementById('mac-name').value.trim();
    if (!name) { safeToast('warning', 'Give the macro a name first'); return; }
    var payload = {
      id: currentMacro.id || undefined,
      name: name,
      steps: currentMacro.steps,
      variables: currentMacro.variables
    };
    var r = await call('MACRO_SAVE', payload);
    if (!r.ok) { safeToast('error', 'Save: ' + r.error); return; }
    currentMacro.id = r.data.id;
    if (r.data.versionLabel) safeToast('success', 'Saved "' + name + '" ' + r.data.versionLabel);
    else safeToast('success', 'Saved "' + name + '"');
    syncShared();
    await loadList(currentMacro.id);
  });

  document.getElementById('mac-delete').addEventListener('click', async function () {
    if (!currentMacro.id) { safeToast('warning', 'Nothing to delete'); return; }
    var id = currentMacro.id;
    var name = currentMacro.name || id;
    if (!confirm('Delete macro "' + name + '"? This cannot be undone.')) return;
    var r = await call('MACRO_DELETE', { id: id });
    if (!r.ok) { safeToast('error', 'Delete: ' + r.error); return; }
    safeToast('success', 'Deleted');
    currentMacro = { id: null, name: '', steps: [], variables: {} };
    document.getElementById('mac-name').value = '';
    renderSteps();
    await loadList('');
    document.getElementById('mac-list').value = '';
  });

  // ============================================================================
  // RUN + PROGRESS
  // ============================================================================
  document.getElementById('mac-run').addEventListener('click', async function () {
    if (!currentMacro.steps.length) { safeToast('warning', 'Add at least one step first'); return; }
    // Run from in-memory workflow so unsaved edits work too.
    var workflow = {
      id: currentMacro.id || ('inline-' + Date.now()),
      name: currentMacro.name || 'Inline run',
      steps: currentMacro.steps,
      variables: currentMacro.variables || {}
    };
    document.getElementById('mac-progress-card').style.display = 'block';
    document.getElementById('mac-progress-fill').style.width = '0%';
    document.getElementById('mac-progress-text').textContent = 'Starting…';
    document.getElementById('mac-progress-log').textContent = '';
    macroLog('info', 'Run started: ' + (workflow.name || 'Untitled') + ' · ' + workflow.steps.length + ' steps');
    setStatus('Running', 'running');
    startSnapshotPolling();
    var r = await call('MACRO_RUN', { workflow: workflow, options: { animateMouse: animateMouse } });
    if (!r.ok) {
      stopSnapshotPolling();
      macroLog('error', 'Run FAILED: ' + r.error);
      safeToast('error', 'Run: ' + r.error);
      document.getElementById('mac-progress-text').textContent = 'Error: ' + r.error;
      setStatus('Idle');
      return;
    }
    var finLog = r.data && r.data.log;
    if (finLog && Array.isArray(finLog)) {
      finLog.forEach(function (e) {
        macroLog(e.ok ? 'ok' : 'error', 'Step ' + (e.index + 1) + ' (' + e.type + ')' + (e.ok ? ' OK' : ' FAIL: ' + (e.error || '?')), { ms: e.ms });
      });
    }
    macroLog('ok', 'Run finished: ' + (r.data && r.data.status ? r.data.status : 'done'));
    // Final snapshot (engine finished synchronously or polling will catch terminal state)
    renderSnapshot(r.data && r.data.snapshot ? r.data.snapshot : r.data);
  });

  document.getElementById('mac-pause').addEventListener('click', async function () {
    var r = await call('MACRO_PAUSE');
    if (!r.ok) { safeToast('error', 'Pause: ' + r.error); return; }
    document.getElementById('mac-pause').disabled = true;
    document.getElementById('mac-resume').disabled = false;
  });
  document.getElementById('mac-resume').addEventListener('click', async function () {
    var r = await call('MACRO_RESUME');
    if (!r.ok) { safeToast('error', 'Resume: ' + r.error); return; }
    document.getElementById('mac-pause').disabled = false;
    document.getElementById('mac-resume').disabled = true;
  });
  document.getElementById('mac-stop').addEventListener('click', async function () {
    var r = await call('MACRO_STOP');
    if (!r.ok) { safeToast('error', 'Stop: ' + r.error); return; }
    stopSnapshotPolling();
    setStatus('Stopped');
  });

  function startSnapshotPolling() {
    stopSnapshotPolling();
    snapshotTimer = setInterval(async function () {
      var r = await call('MACRO_SNAPSHOT');
      if (!r.ok) { stopSnapshotPolling(); return; }
      var snap = r.data || {};
      renderSnapshot(snap);
      var status = String(snap.status || '').toLowerCase();
      if (status === 'idle' || status === 'completed' || status === 'done' || status === 'error' || status === 'stopped' || status === 'cancelled') {
        stopSnapshotPolling();
        setStatus('Idle');
      }
    }, 500);
  }

  function stopSnapshotPolling() {
    if (snapshotTimer) { clearInterval(snapshotTimer); snapshotTimer = null; }
  }

  function renderSnapshot(snap) {
    if (!snap || typeof snap !== 'object') return;
    var total = snap.totalSteps || (snap.steps && snap.steps.length) || currentMacro.steps.length || 0;
    var done = snap.currentStep != null ? snap.currentStep : (snap.completedSteps || 0);
    var pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
    document.getElementById('mac-progress-fill').style.width = pct + '%';
    document.getElementById('mac-progress-text').textContent = (snap.status || 'idle') + ' — ' + done + '/' + total + ' steps';
    if (snap.lastLog || snap.lastMessage) {
      var line = snap.lastLog || snap.lastMessage;
      var log = document.getElementById('mac-progress-log');
      log.textContent = (log.textContent + '\n' + line).trim().split('\n').slice(-6).join('\n');
    }
  }

  // ============================================================================
  // RECORDER
  // ============================================================================
  document.getElementById('mac-record-mode').addEventListener('change', function (e) {
    recordMode = e.target.value === 'picker' ? 'picker' : 'studio';
  });

  document.getElementById('mac-undo').addEventListener('click', undoHistory);
  document.getElementById('mac-redo').addEventListener('click', redoHistory);

  document.getElementById('mac-animate-mouse').addEventListener('change', function (e) {
    animateMouse = !!e.target.checked;
  });

  document.getElementById('mac-record').addEventListener('click', async function () {
    if (recordingSessionId || studioRecording) { safeToast('warning', 'Already recording'); return; }
    recordMode = (document.getElementById('mac-record-mode').value === 'picker') ? 'picker' : 'studio';
    studioLiveCount = 0;

    if (recordMode === 'studio') {
      var sr = await call('MACRO_STUDIO_RECORD_START');
      if (!sr.ok) { safeToast('error', 'Studio record: ' + sr.error); return; }
      studioRecording = true;
      studioPaused = false;
      document.getElementById('mac-record').classList.add('recording');
      document.getElementById('mac-record').disabled = true;
      document.getElementById('mac-pause-record').disabled = false;
      document.getElementById('mac-stop-record').disabled = false;
      setStatus('Studio recording — click on the page. Pause to add steps manually.', 'recording');
      safeToast('info', 'Studio recording started — interact with the page, not the extension panel');
      return;
    }

    var r = await call('MACRO_RECORD_START');
    if (!r.ok) { safeToast('error', 'Record start: ' + r.error); return; }
    recordingSessionId = r.data && r.data.sessionId;
    if (!recordingSessionId) { safeToast('error', 'Record start: no sessionId'); return; }
    // Start the picker; it returns its OWN sessionId — track it for the broadcast listener.
    var p = await call('PICKER_START', { label: 'record:' + recordingSessionId });
    if (!p.ok) {
      safeToast('error', 'Picker start: ' + p.error);
      // Roll back recording
      await call('MACRO_RECORD_STOP', { sessionId: recordingSessionId });
      recordingSessionId = null;
      return;
    }
    recordingPickerSessionId = p.data && p.data.sessionId;
    document.getElementById('mac-record').classList.add('recording');
    document.getElementById('mac-record').disabled = true;
    document.getElementById('mac-pause-record').disabled = true;
    document.getElementById('mac-stop-record').disabled = false;
    setStatus('Recording — click elements on the page; press Stop when done', 'recording');
    startPickerPolling();
    safeToast('info', 'Recording started');
  });

  document.getElementById('mac-pause-record').addEventListener('click', async function () {
    if (!studioRecording) return;
    if (!studioPaused) {
      var pr = await call('MACRO_STUDIO_RECORD_PAUSE');
      if (!pr.ok) { safeToast('error', pr.error); return; }
      studioPaused = true;
      document.getElementById('mac-pause-record').textContent = '▶ Resume studio';
      setStatus('Studio paused — use + Add step or Resume studio', 'picking');
      safeToast('info', 'Paused. Add steps from the menu or resume recording on the page.');
    } else {
      var rr = await call('MACRO_STUDIO_RECORD_RESUME');
      if (!rr.ok) { safeToast('error', rr.error); return; }
      studioPaused = false;
      document.getElementById('mac-pause-record').textContent = '⏸ Pause';
      setStatus('Studio recording resumed', 'recording');
    }
  });

  document.getElementById('mac-stop-record').addEventListener('click', async function () {
    if (studioRecording) {
      studioRecording = false;
      studioPaused = false;
      document.getElementById('mac-record').classList.remove('recording');
      document.getElementById('mac-record').disabled = false;
      document.getElementById('mac-pause-record').disabled = true;
      document.getElementById('mac-pause-record').textContent = '⏸ Pause';
      document.getElementById('mac-stop-record').disabled = true;
      var st = await call('MACRO_STUDIO_RECORD_STOP');
      if (st.ok && st.data && st.data.steps && st.data.steps.length > studioLiveCount) {
        appendRecordedSteps(st.data.steps.slice(studioLiveCount));
      }
      studioLiveCount = 0;
      setStatus(t('idle'));
      return;
    }
    if (!recordingSessionId) { safeToast('warning', 'Not recording'); return; }
    var sid = recordingSessionId;
    var pid = recordingPickerSessionId;
    recordingSessionId = null;
    recordingPickerSessionId = null;
    stopPickerPolling();
    document.getElementById('mac-record').classList.remove('recording');
    document.getElementById('mac-record').disabled = false;
    document.getElementById('mac-pause-record').disabled = true;
    document.getElementById('mac-stop-record').disabled = true;
    var r = await call('MACRO_RECORD_STOP', { sessionId: sid });
    if (!r.ok) { safeToast('error', 'Record stop: ' + r.error); }
    else {
      // Merge any backend-collected steps into current macro (if engine appended any beyond what
      // we already captured client-side via PICKER_BROADCAST).
      var backendSteps = (r.data && Array.isArray(r.data.steps)) ? r.data.steps : [];
      if (backendSteps.length) appendRecordedSteps(backendSteps);
    }
    if (pid) await call('PICKER_CANCEL', { sessionId: pid });
    setStatus('Stopped — review steps and Save');
  });

  // ============================================================================
  // REBIND A SINGLE STEP via picker
  // ============================================================================
  async function startAddStepPicker(stepType) {
    if (studioRecording && !studioPaused) { safeToast('warning', 'Pause studio recording first, then add steps'); return; }
    if (pickingForStep || pendingAddStep || screenPickSessionId) {
      safeToast('warning', 'Finish current pick first');
      return;
    }
    pendingAddStep = { type: stepType };
    var r = await call('PICKER_START', { label: 'add-step:' + stepType });
    if (!r.ok) { pendingAddStep = null; safeToast('error', r.error); return; }
    appendPickerSessionId = r.data && r.data.sessionId;
    setStatus('Click an element on the page to capture selector — ESC cancels', 'picking');
    startPickerPolling();
    safeToast('info', 'Click the target on the page (not in the extension panel)');
  }

  async function finishScreenPickMode() {
    var sid = screenPickSessionId;
    screenPickSessionId = null;
    window.parent.postMessage({ type: 'GPD_SIDEBAR_PICK_STOP' }, '*');
    await call('SCREEN_PICK_CANCEL', { sessionId: sid || undefined });
  }

  function updateLiveScreenCoords(point, sessionId) {
    if (!point || !pendingAddStep) return;
    if (screenPickSessionId && sessionId && sessionId !== screenPickSessionId) return;
    var idx = pendingAddStep.pendingIdx;
    if (idx == null || !currentMacro.steps[idx] || !currentMacro.steps[idx]._pending) return;
    currentMacro.steps[idx].x = point.x;
    currentMacro.steps[idx].y = point.y;
    currentMacro.steps[idx].coordMode = point.coordMode || pendingAddStep.coordMode || 'precise';
    if (point.viewportW != null) currentMacro.steps[idx].viewportW = point.viewportW;
    if (point.viewportH != null) currentMacro.steps[idx].viewportH = point.viewportH;
    var row = document.querySelector('.mac-step[data-idx="' + idx + '"] .summary');
    if (row) {
      row.innerHTML = '<span style="color:#f97316;">⏳ Live: (' + point.x + ', ' + point.y + ') — left-click to confirm</span>';
    }
    setStatus('Live ' + point.x + ', ' + point.y + ' — left-click to capture', 'picking');
  }

  async function startScreenPick(stepType, coordMode, existingIdx) {
    if (studioRecording && !studioPaused) { safeToast('warning', 'Pause studio recording first'); return; }
    // Always tear down any stale pick session before starting a new one (re-pick safe).
    await finishScreenPickMode();
    if (pendingAddStep && pendingAddStep.pendingIdx != null && pendingAddStep.pendingIdx !== existingIdx) {
      var staleIdx = pendingAddStep.pendingIdx;
      if (currentMacro.steps[staleIdx] && currentMacro.steps[staleIdx]._pending) {
        currentMacro.steps.splice(staleIdx, 1);
        if (editingStepIdx === staleIdx) editingStepIdx = null;
      }
      pendingAddStep = null;
    }

    var pendingIdx;
    if (existingIdx != null && currentMacro.steps[existingIdx]) {
      pendingIdx = existingIdx;
      pushHistory();
      currentMacro.steps[pendingIdx] = {
        type: stepType,
        x: null,
        y: null,
        coordMode: coordMode || currentMacro.steps[pendingIdx].coordMode || 'precise',
        screenAction: currentMacro.steps[pendingIdx].screenAction || 'click',
        button: currentMacro.steps[pendingIdx].button || 'left',
        scrollLines: currentMacro.steps[pendingIdx].scrollLines != null ? currentMacro.steps[pendingIdx].scrollLines : 3,
        waitMs: currentMacro.steps[pendingIdx].waitMs != null ? currentMacro.steps[pendingIdx].waitMs : 1000,
        _pending: true
      };
      editingStepIdx = null;
    } else {
      pushHistory();
      pendingIdx = currentMacro.steps.length;
      currentMacro.steps.push({
        type: stepType,
        x: null, y: null,
        coordMode: coordMode || 'precise',
        screenAction: 'click',
        button: 'left',
        scrollLines: 3,
        waitMs: 1000,
        _pending: true
      });
    }
    renderSteps();

    pendingAddStep = { type: stepType, coordMode: coordMode || 'precise', pendingIdx: pendingIdx };
    var r = await call('SCREEN_PICK_START', { stepType: stepType, coordMode: coordMode || 'precise', label: 'add-screen' });
    if (!r.ok) {
      if (existingIdx == null && currentMacro.steps[pendingIdx] && currentMacro.steps[pendingIdx]._pending) {
        currentMacro.steps.splice(pendingIdx, 1);
      } else if (existingIdx != null) {
        delete currentMacro.steps[pendingIdx]._pending;
      }
      pendingAddStep = null;
      renderSteps();
      safeToast('error', r.error);
      return;
    }
    screenPickSessionId = r.data && r.data.sessionId;
    window.parent.postMessage({ type: 'GPD_SIDEBAR_PICK_START' }, '*');
    setStatus('Left-click the page to capture coordinates — ESC cancels', 'picking');
    safeToast('info', 'Click once on the page to capture the spot');
  }

  async function pickForStep(stepIndex) {
    if (recordingSessionId && !studioPaused) { safeToast('warning', 'Pause recording first'); return; }
    if (pickingForStep) { safeToast('warning', 'Already picking — click the page or cancel'); return; }
    var r = await call('PICKER_START', { label: 'rebind:' + stepIndex });
    if (!r.ok) { safeToast('error', 'Picker start: ' + r.error); return; }
    pickingForStep = { stepIndex: stepIndex, pickerSessionId: r.data && r.data.sessionId };
    setStatus('Click the element on the page for step ' + (stepIndex + 1) + ' — ESC to cancel', 'picking');
    startPickerPolling();
  }

  // ============================================================================
  // GLOBAL PICKER_BROADCAST LISTENER
  //   - while recording: append a click step to currentMacro.steps
  //   - while rebinding: replace selector on the focused step
  // PICKER_GET_LAST poll is used as a backup channel if the broadcast is missed.
  // ============================================================================
  function ingestSelection(selector, sessionId) {
    if (!selector) return;
    if (pendingAddStep && appendPickerSessionId && sessionId === appendPickerSessionId) {
      pushHistory();
      var step = { type: pendingAddStep.type, selector: selector, button: 'left', pauseOnMissing: true };
      currentMacro.steps.push(step);
      pendingAddStep = null;
      appendPickerSessionId = null;
      stopPickerPolling();
      renderSteps();
      setStatus('Added selector click step');
      safeToast('success', 'Step added from page click');
      return;
    }
    if (recordingSessionId && (!recordingPickerSessionId || sessionId === recordingPickerSessionId)) {
      appendRecordedSteps([{ type: 'click', selector: selector, button: 'left', pauseOnMissing: true }]);
      setStatus('Recording — captured: ' + selector.slice(0, 80), 'recording');
      return;
    }
    if (pickingForStep && (!pickingForStep.pickerSessionId || sessionId === pickingForStep.pickerSessionId)) {
      var idx = pickingForStep.stepIndex;
      if (currentMacro.steps[idx]) {
        pushHistory();
        currentMacro.steps[idx].selector = selector;
        renderSteps();
        safeToast('success', 'Step ' + (idx + 1) + ' selector updated');
      }
      pickingForStep = null;
      stopPickerPolling();
      setStatus('Idle');
    }
  }

  async function ingestScreenPoint(point, sessionId) {
    if (!point || !pendingAddStep) return;
    if (screenPickSessionId && sessionId !== screenPickSessionId) return;
    var step = {
      type: pendingAddStep.type,
      x: point.x,
      y: point.y,
      coordMode: point.coordMode || pendingAddStep.coordMode || 'precise',
      viewportW: point.viewportW,
      viewportH: point.viewportH
    };
    if (step.type === 'screenClick') {
      step.screenAction = 'click';
      step.button = 'left';
      step.scrollLines = 3;
      step.waitMs = 1000;
    }
    var pendingIdx = pendingAddStep.pendingIdx;
    if (pendingIdx != null && currentMacro.steps[pendingIdx] && currentMacro.steps[pendingIdx]._pending) {
      var prev = currentMacro.steps[pendingIdx];
      if (step.type === 'screenClick') {
        step.screenAction = prev.screenAction || step.screenAction;
        step.button = prev.button || step.button;
        step.scrollLines = prev.scrollLines != null ? prev.scrollLines : step.scrollLines;
        step.waitMs = prev.waitMs != null ? prev.waitMs : step.waitMs;
      }
      currentMacro.steps[pendingIdx] = step;
    } else {
      pushHistory();
      currentMacro.steps.push(step);
      pendingIdx = currentMacro.steps.length - 1;
    }
    screenPickSessionId = null;
    pendingAddStep = null;
    editingStepIdx = step.type === 'screenClick' ? pendingIdx : null;
    window.parent.postMessage({ type: 'GPD_SIDEBAR_PICK_STOP' }, '*');
    await call('SCREEN_PICK_CANCEL', {});
    renderSteps();
    if (step.type === 'screenClick') {
      setStatus('Choose screen action for step ' + (pendingIdx + 1) + ', then Apply');
      safeToast('success', 'Coordinates captured — choose action type');
    } else {
      setStatus('Added ' + step.type + ' at (' + step.x + ',' + step.y + ')');
      safeToast('success', 'Screen step added');
    }
  }

  async function cancelScreenPick() {
    var wasPending = pendingAddStep || screenPickSessionId;
    if (!wasPending) return;
    if (pendingAddStep && pendingAddStep.pendingIdx != null) {
      var idx = pendingAddStep.pendingIdx;
      if (currentMacro.steps[idx] && currentMacro.steps[idx]._pending) {
        pushHistory();
        currentMacro.steps.splice(idx, 1);
        if (editingStepIdx === idx) editingStepIdx = null;
      }
    }
    pendingAddStep = null;
    await finishScreenPickMode();
    setStatus('Idle');
    renderSteps();
    safeToast('info', 'Screen pick cancelled');
  }

  B.runtime.onMessage.addListener(function (msg) {
    if (!msg) return;
    if (msg.type === 'PICKER_BROADCAST') {
      var sel = msg.selection || {};
      ingestSelection(sel.selector || '', msg.sessionId);
      window.parent.postMessage({ type: 'GPD_SIDEBAR_PICK_STOP' }, '*');
      return;
    }
    if (msg.type === 'SCREEN_PICK_MOVE') {
      updateLiveScreenCoords(msg.point || {}, msg.sessionId);
      return;
    }
    if (msg.type === 'SCREEN_PICK_BROADCAST') {
      ingestScreenPoint(msg.point || {}, msg.sessionId);
      return;
    }
    if (msg.type === 'SCREEN_PICK_SESSION_ENDED') {
      if (!msg.sessionId || !screenPickSessionId || msg.sessionId === screenPickSessionId) {
        screenPickSessionId = null;
      }
      return;
    }
    if (msg.type === 'SCREEN_PICK_CANCELLED') {
      cancelScreenPick();
      return;
    }
    if (msg.type === 'macro_event' && msg.event) {
      var ev = msg.event;
      if (ev.kind === 'step_start') {
        macroLog('step', 'Step ' + (ev.index + 1) + ' (' + (ev.step && ev.step.type) + ') starting…');
      } else if (ev.kind === 'step_done') {
        macroLog('ok', 'Step ' + (ev.index + 1) + ' done in ' + (ev.ms || 0) + 'ms');
      } else if (ev.kind === 'step_error') {
        macroLog('error', 'Step ' + (ev.index + 1) + ' ERROR: ' + (ev.error || '?'));
      } else if (ev.kind === 'paused') {
        macroLog('warn', 'Macro PAUSED' + (ev.reason ? ': ' + ev.reason : ''));
      } else if (ev.kind === 'resumed') {
        macroLog('info', 'Macro RESUMED');
      } else if (ev.kind === 'finished') {
        macroLog(ev.status === 'done' ? 'ok' : 'warn', 'Macro ' + (ev.status || 'finished').toUpperCase());
      } else if (ev.kind === 'screenshot_saved') {
        macroLog('info', 'Screenshot saved: ' + (ev.saved && ev.saved.fileName || '?'));
      }
      return;
    }
    if (msg.type === 'MACRO_RECORDING_STEP' && msg.step) {
      appendRecordedSteps([msg.step]);
      studioLiveCount += 1;
      setStatus('Recording — ' + studioLiveCount + ' step(s)', 'recording');
      return;
    }
    if (msg.type === 'MACRO_RECORDING_PAUSED') {
      studioPaused = !!msg.paused;
      return;
    }
    if (msg.type === 'MACRO_RECORDING_FINISHED' && Array.isArray(msg.steps) && msg.steps.length) {
      if (msg.steps.length > studioLiveCount) {
        appendRecordedSteps(msg.steps.slice(studioLiveCount));
      }
      studioRecording = false;
      studioPaused = false;
      studioLiveCount = 0;
      document.getElementById('mac-record').classList.remove('recording');
      document.getElementById('mac-record').disabled = false;
      document.getElementById('mac-pause-record').disabled = true;
      document.getElementById('mac-stop-record').disabled = true;
      setStatus(t('idle'));
    }
  });

  // Poll PICKER_GET_LAST as a fallback channel (sidebar may live in an iframe
  // where chrome.runtime.onMessage doesn't reach all broadcasts on Firefox).
  function startPickerPolling() {
    stopPickerPolling();
    lastSeenSelector = null;
    pickerPollTimer = setInterval(async function () {
      var sid = appendPickerSessionId || recordingPickerSessionId || (pickingForStep && pickingForStep.pickerSessionId);
      if (!sid) { stopPickerPolling(); return; }
      var r = await call('PICKER_GET_LAST', { sessionId: sid });
      if (!r.ok || !r.data) return;
      var selector = r.data.selector || '';
      if (!selector || selector === lastSeenSelector) return;
      lastSeenSelector = selector;
      ingestSelection(selector, sid);
    }, 400);
  }
  function stopPickerPolling() {
    if (pickerPollTimer) { clearInterval(pickerPollTimer); pickerPollTimer = null; }
  }

  // ============================================================================
  // INITIAL LOAD when the tab is first activated (lazy: also runs immediately
  // so the dropdown is populated on first open).
  // ============================================================================
  function applyMacroTexts() {
    var el;
    el = document.getElementById('mac-ui-title'); if (el) el.textContent = '\u2699 ' + t('title');
    el = document.getElementById('mac-ui-desc'); if (el) el.textContent = t('desc');
    el = document.getElementById('mac-lang-title'); if (el) el.textContent = t('language');
    el = document.getElementById('mac-saved-title'); if (el) el.innerHTML = '&#128190; ' + t('saved_title');
    el = document.getElementById('mac-rec-title'); if (el) el.innerHTML = '&#127908; ' + t('recorder_title');
    el = document.getElementById('mac-record'); if (el) el.innerHTML = '&#9210; ' + t('record_studio');
    el = document.getElementById('mac-stop-record'); if (el) el.innerHTML = '&#9209; ' + t('stop_record');
    el = document.getElementById('mac-undo'); if (el) el.textContent = '\u21B6 ' + t('undo');
    el = document.getElementById('mac-redo'); if (el) el.textContent = '\u21B7 ' + t('redo');
    el = document.getElementById('mac-run'); if (el) el.innerHTML = '&#9654; ' + t('run');
    el = document.getElementById('mac-save'); if (el) el.innerHTML = '&#128190; ' + t('save');
    el = document.getElementById('mac-delete'); if (el) el.innerHTML = '&#10005; ' + t('delete');
    el = document.getElementById('mac-add-toggle'); if (el) el.innerHTML = '+ ' + t('add_step') + ' &#9662;';
    setStatus(t('idle'));
  }

  function initLanguagePicker() {
    var sel = document.getElementById('mac-language');
    if (!sel || !window.DMS_I18n) return;
    sel.innerHTML = (window.DMS_I18n.langs || []).map(function (l) {
      return '<option value="' + escHtml(l.code) + '">' + escHtml(l.native || l.label) + '</option>';
    }).join('');
    function parseConfigResponse(r) {
      if (r && r.ok && r.data) return r.data;
      if (r && (r.ai_provider || r.ui)) return r;
      return {};
    }

    call('CONFIG_LOAD').then(function (r) {
      var cfg = parseConfigResponse(r);
      var lang = (cfg.ui && cfg.ui.language) ? cfg.ui.language : 'en';
      window.DMS_I18n.setLanguage(lang);
      sel.value = lang;
      applyMacroTexts();
    });
    sel.addEventListener('change', async function () {
      var code = sel.value;
      window.DMS_I18n.setLanguage(code);
      var cfg = parseConfigResponse(await call('CONFIG_LOAD'));
      var base = cfg || {};
      base.ui = base.ui || {};
      base.ui.language = code;
      await call('CONFIG_SAVE', base);
      applyMacroTexts();
      renderSteps();
    });
    document.addEventListener('dms:language-changed', applyMacroTexts);
  }

  loadList();
  renderSteps();
  setStatus('Idle');
  initLanguagePicker();

  // Refresh list whenever the macros tab becomes active (catches saves from other surfaces).
  window.addEventListener('tab-activated', function (e) {
    if (e && e.detail && e.detail.tab === 'macros') {
      loadList(currentMacro.id || '');
    }
  });

  console.log('[DANMAN] Macros tab loaded');
})();
