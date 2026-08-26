// sidebar/tabs/execute-tab.js — Pre-run action plan, live log, loop, versioned save
(function () {
  'use strict';

  var container = document.getElementById('tab-execute');
  if (!container) return;

  var B = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;
  var Schema = window.MacroStepSchema || {};
  var logBuffer = [];
  var running = false;
  var draftSteps = null;

  function t(key) {
    if (window.DMS_I18n && window.DMS_I18n.t) {
      var v = window.DMS_I18n.t('macros.' + key);
      if (v && v.indexOf('macros.') !== 0) return v;
    }
    return key;
  }

  function esc(s) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(s == null ? '' : String(s)));
    return d.innerHTML;
  }

  function describe(step) {
    if (Schema.summarizeStep) return Schema.summarizeStep(step);
    return (step && step.type) || '?';
  }

  async function call(type, payload) {
    try {
      var res = await window.sendToBackground(type, payload || {});
      return res || { ok: false, error: 'No response' };
    } catch (e) {
      return { ok: false, error: e.message || String(e) };
    }
  }

  function getWorkflow() {
    if (draftSteps) {
      var w = window.GPD_MacroShared ? window.GPD_MacroShared.get() : {};
      return { id: w.id, name: w.name, steps: draftSteps.slice(), variables: w.variables || {} };
    }
    return window.GPD_MacroShared ? window.GPD_MacroShared.get() : { id: null, name: '', steps: [], variables: {} };
  }

  function syncDraftFromShared() {
    var w = window.GPD_MacroShared ? window.GPD_MacroShared.get() : null;
    draftSteps = w && Array.isArray(w.steps) ? w.steps.slice() : [];
    renderPlan();
  }

  var styleEl = document.createElement('style');
  styleEl.textContent = [
    '.exec-wrap { display:flex; flex-direction:column; gap:12px; }',
    '.exec-card { background:#1e293b; border:1px solid #334155; border-radius:8px; padding:12px; }',
    '.exec-card-title { font-size:12px; font-weight:600; color:#94a3b8; text-transform:uppercase; margin-bottom:8px; }',
    '.exec-plan { max-height:200px; overflow-y:auto; font-size:11px; font-family:Consolas,Monaco,monospace; }',
    '.exec-plan-row { display:flex; gap:6px; padding:4px 6px; border-radius:4px; border:1px solid transparent; }',
    '.exec-plan-row.next { border-color:#f97316; background:rgba(249,115,22,0.1); }',
    '.exec-plan-row.done { opacity:0.55; }',
    '.exec-plan-row.skip { opacity:0.35; text-decoration:line-through; }',
    '.exec-log { max-height:140px; overflow-y:auto; font-size:10px; font-family:Consolas,Monaco,monospace; background:#0f172a; border:1px solid #334155; border-radius:6px; padding:6px; }',
    '.exec-log .line { margin:2px 0; }',
    '.exec-log .err { color:#fca5a5; }',
    '.exec-log .ok { color:#86efac; }',
    '.exec-log .step { color:#fdba74; }',
    '.exec-row { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }',
    '.exec-input, .exec-select { flex:1; min-width:80px; padding:6px 8px; background:#0f172a; border:1px solid #334155; border-radius:6px; color:#e2e8f0; font-size:12px; }',
    '.exec-btn { padding:6px 10px; border:1px solid #334155; border-radius:6px; background:#1e293b; color:#e2e8f0; cursor:pointer; font-size:12px; }',
    '.exec-btn.primary { background:#f97316; border-color:#f97316; color:#fff; }',
    '.exec-btn.danger { background:#7f1d1d; border-color:#7f1d1d; }',
    '.exec-btn:disabled { opacity:0.45; cursor:not-allowed; }',
    '.exec-vars table { width:100%; font-size:11px; border-collapse:collapse; }',
    '.exec-vars td, .exec-vars th { border:1px solid #334155; padding:4px 6px; }',
    '.exec-collapsible-hdr { cursor:pointer; display:flex; align-items:center; justify-content:space-between; user-select:none; }',
    '.exec-collapsible-hdr:hover { color:#e2e8f0; }',
    '.exec-collapsible-hdr .chevron { font-size:10px; transition:transform 0.2s; }',
    '.exec-collapsible-hdr.collapsed .chevron { transform:rotate(-90deg); }',
    '.exec-collapsible-body { margin-top:6px; }',
    '.exec-collapsible-body.hidden { display:none; }',
    '.exec-log-full { max-height:280px; overflow-y:auto; font-size:10px; font-family:Consolas,Monaco,monospace; background:#0f172a; border:1px solid #334155; border-radius:6px; padding:6px; }',
    '.exec-log-full .line { margin:2px 0; }',
    '.exec-log-full .err { color:#fca5a5; }',
    '.exec-log-full .ok  { color:#86efac; }',
    '.exec-log-full .step{ color:#fdba74; }',
    '.exec-log-full .info{ color:#93c5fd; }',
    '.exec-log-full .warn{ color:#fde68a; }',
    '.exec-log-btns { display:flex; gap:6px; margin-top:6px; flex-wrap:wrap; }'
  ].join('\n');
  document.head.appendChild(styleEl);

  container.innerHTML = [
    '<div class="tab-title">&#9654; Execute</div>',
    '<div class="tab-desc">Preview the action plan, adjust steps, then run with pause/stop/loop controls.</div>',
    '<div class="exec-wrap">',
    '  <div class="exec-card">',
    '    <div class="exec-card-title">Action plan <span id="exec-plan-meta" style="float:right;font-weight:400;text-transform:none;"></span></div>',
    '    <div class="exec-plan" id="exec-plan"></div>',
    '    <div class="exec-row" style="margin-top:8px;">',
    '      <button class="exec-btn" id="exec-refresh-plan">Refresh from Macros</button>',
    '      <button class="exec-btn" id="exec-apply-plan">Use edited plan for run</button>',
    '    </div>',
    '  </div>',
    '  <div class="exec-card">',
    '    <div class="exec-card-title">Run <span id="exec-status" style="float:right;color:#38bdf8;">Idle</span></div>',
    '    <div class="exec-row">',
    '      <label class="text-sm">Loops</label>',
    '      <input class="exec-input" type="number" id="exec-loops" min="1" max="99" value="1" style="max-width:64px;flex:0;" />',
    '      <label class="text-sm"><input type="checkbox" id="exec-stop-err" checked /> Stop on error</label>',
    '      <label class="text-sm">Pace ms <input type="number" id="exec-speed" value="500" min="0" max="5000" step="50" style="width:72px;" /></label>',
    '    </div>',
    '    <div class="exec-row">',
    '      <button class="exec-btn primary" id="exec-run">&#9654; Run plan</button>',
    '      <button class="exec-btn" id="exec-pause" disabled>Pause</button>',
    '      <button class="exec-btn" id="exec-resume" disabled>Resume</button>',
    '      <button class="exec-btn danger" id="exec-stop" disabled>Stop</button>',
    '    </div>',
    '  </div>',
    '  <div class="exec-card">',
    '    <div class="exec-card-title">Save variant <span id="exec-version-label" style="float:right;font-weight:400;"></span></div>',
    '    <div class="exec-row">',
    '      <input class="exec-input" id="exec-save-name" placeholder="Macro name for new version..." />',
    '      <button class="exec-btn" id="exec-save-version">Save as version</button>',
    '    </div>',
    '    <p class="text-xs text-muted" style="margin-top:6px;color:#64748b;">V = save count, R = step changes since last save (e.g. V002R005).</p>',
    '  </div>',
    '  <div class="exec-card">',
    '    <div class="exec-collapsible-hdr" id="exec-log-hdr">',
    '      <span class="exec-card-title" style="margin:0;">&#128203; Event log <span id="exec-log-count" style="font-weight:400;opacity:0.7;">0 events</span></span>',
    '      <span class="chevron">▼</span>',
    '    </div>',
    '    <div class="exec-collapsible-body" id="exec-log-body">',
    '      <div class="exec-log-full" id="exec-log"></div>',
    '      <div class="exec-log-btns">',
    '        <button class="exec-btn" id="exec-log-clear">Clear</button>',
    '        <button class="exec-btn" id="exec-log-export-json">Export JSON</button>',
    '        <button class="exec-btn" id="exec-log-export-csv">Export CSV</button>',
    '      </div>',
    '    </div>',
    '  </div>',
    '  <div class="exec-card">',
    '    <div class="exec-collapsible-hdr" id="exec-vars-hdr">',
    '      <span class="exec-card-title" style="margin:0;">&#128202; Variables</span>',
    '      <span class="chevron">▼</span>',
    '    </div>',
    '    <div class="exec-collapsible-body" id="exec-vars-body">',
    '      <div class="exec-vars" id="exec-vars">No variables yet.</div>',
    '    </div>',
    '  </div>',
    '</div>'
  ].join('\n');

  function renderPlan(highlightIndex) {
    var steps = draftSteps || [];
    var meta = document.getElementById('exec-plan-meta');
    var w = window.GPD_MacroShared ? window.GPD_MacroShared.get() : {};
    if (meta) meta.textContent = (w.name || 'Untitled') + ' · ' + steps.length + ' steps';
    var plan = document.getElementById('exec-plan');
    if (!plan) return;
    if (!steps.length) {
      plan.innerHTML = '<div style="color:#64748b;padding:8px;">No steps — build or load a macro in the Macros tab first.</div>';
      return;
    }
    plan.innerHTML = steps.map(function (step, i) {
      var cls = 'exec-plan-row';
      if (highlightIndex === i) cls += ' next';
      var skip = step._skip ? ' skip' : '';
      return '<div class="' + cls + skip + '" data-idx="' + i + '">'
        + '<input type="checkbox" class="exec-skip-step" data-idx="' + i + '"' + (step._skip ? '' : ' checked') + ' title="Include in run" />'
        + '<span style="flex:0 0 18px;color:#64748b;">' + (i + 1) + '.</span>'
        + '<span style="flex:1;">' + esc(describe(step)) + '</span>'
        + '</div>';
    }).join('');

    plan.querySelectorAll('.exec-skip-step').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var idx = parseInt(cb.getAttribute('data-idx'), 10);
        if (!draftSteps[idx]) return;
        if (!cb.checked) draftSteps[idx]._skip = true;
        else delete draftSteps[idx]._skip;
        renderPlan(highlightIndex);
      });
    });
  }

  function addLog(type, msg) {
    var ts = new Date().toISOString();
    var log = document.getElementById('exec-log');
    if (!log) return;
    var line = document.createElement('div');
    line.className = 'line ' + (type || '');
    line.textContent = new Date().toLocaleTimeString() + ' [' + (type || 'info').toUpperCase() + '] ' + msg;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
    logBuffer.push({ ts: ts, type: type || 'info', msg: String(msg) });
    var ct = document.getElementById('exec-log-count');
    if (ct) ct.textContent = logBuffer.length + ' event' + (logBuffer.length !== 1 ? 's' : '');
  }

  // Collapsible sections
  function initCollapsible(headerId, bodyId, startCollapsed) {
    var hdr = document.getElementById(headerId);
    var body = document.getElementById(bodyId);
    if (!hdr || !body) return;
    if (startCollapsed) {
      hdr.classList.add('collapsed');
      body.classList.add('hidden');
    }
    hdr.addEventListener('click', function () {
      hdr.classList.toggle('collapsed');
      body.classList.toggle('hidden');
    });
  }
  initCollapsible('exec-log-hdr', 'exec-log-body', false);
  initCollapsible('exec-vars-hdr', 'exec-vars-body', true);

  // Export helpers
  document.getElementById('exec-log-clear').addEventListener('click', function () {
    logBuffer = [];
    var log = document.getElementById('exec-log');
    if (log) log.innerHTML = '';
    var ct = document.getElementById('exec-log-count');
    if (ct) ct.textContent = '0 events';
  });

  document.getElementById('exec-log-export-json').addEventListener('click', function () {
    if (!logBuffer.length) return;
    var blob = new Blob([JSON.stringify(logBuffer, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'macro-log-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });

  document.getElementById('exec-log-export-csv').addEventListener('click', function () {
    if (!logBuffer.length) return;
    var rows = [['timestamp', 'type', 'message']].concat(
      logBuffer.map(function (e) {
        return [e.ts, e.type, '"' + String(e.msg).replace(/"/g, '""') + '"'];
      })
    );
    var blob = new Blob([rows.map(function (r) { return r.join(','); }).join('\n')], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'macro-log-' + new Date().toISOString().replace(/[:.]/g, '-') + '.csv';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });

  function setRunningButtons(isRunning) {
    running = isRunning;
    ['exec-run', 'exec-pause', 'exec-resume', 'exec-stop'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
    });
    document.getElementById('exec-run').disabled = isRunning;
    document.getElementById('exec-pause').disabled = !isRunning;
    document.getElementById('exec-resume').disabled = true;
    document.getElementById('exec-stop').disabled = !isRunning;
    var st = document.getElementById('exec-status');
    if (st) st.textContent = isRunning ? 'Running' : 'Idle';
  }

  function stepsForRun() {
    return (draftSteps || []).filter(function (s) { return !s._skip; }).map(function (s) {
      var c = JSON.parse(JSON.stringify(s));
      delete c._skip;
      return c;
    });
  }

  async function renderVars() {
    var r = await call('MACRO_SNAPSHOT');
    var vars = (r.ok && r.data && r.data.variables) ? r.data.variables : {};
    var el = document.getElementById('exec-vars');
    if (!el) return;
    var keys = Object.keys(vars);
    if (!keys.length) { el.textContent = 'No variables yet.'; return; }
    el.innerHTML = '<table><thead><tr><th>Key</th><th>Value</th></tr></thead><tbody>'
      + keys.map(function (k) {
        return '<tr><td>{' + esc(k) + '}</td><td>' + esc(String(vars[k]).slice(0, 120)) + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  document.getElementById('exec-refresh-plan').addEventListener('click', syncDraftFromShared);
  document.getElementById('exec-apply-plan').addEventListener('click', function () {
    var w = getWorkflow();
    w.steps = stepsForRun().length ? stepsForRun() : (draftSteps || []);
    if (window.GPD_MacroShared) window.GPD_MacroShared.set(w);
    addLog('info', 'Applied ' + w.steps.length + ' steps to shared workflow');
  });

  document.getElementById('exec-run').addEventListener('click', async function () {
    var w = getWorkflow();
    w.steps = stepsForRun();
    if (!w.steps.length) { addLog('err', 'No steps to run'); return; }
    var loops = Math.max(1, parseInt(document.getElementById('exec-loops').value, 10) || 1);
    var opts = {
      stopOnError: document.getElementById('exec-stop-err').checked,
      speedMs: parseInt(document.getElementById('exec-speed').value, 10) || 0,
      loopCount: loops
    };
    if (Schema.normalizeWorkflow) w = Schema.normalizeWorkflow(w);
    setRunningButtons(true);
    addLog('info', 'Starting ' + loops + ' loop(s), ' + w.steps.length + ' steps');
    var r = await call('MACRO_RUN', { workflow: w, options: opts });
    if (!r.ok) addLog('err', r.error);
    setRunningButtons(false);
    renderVars();
  });

  document.getElementById('exec-pause').addEventListener('click', function () { call('MACRO_PAUSE'); });
  document.getElementById('exec-resume').addEventListener('click', function () { call('MACRO_RESUME'); });
  document.getElementById('exec-stop').addEventListener('click', function () { call('MACRO_STOP'); setRunningButtons(false); });

  document.getElementById('exec-save-version').addEventListener('click', async function () {
    var w = getWorkflow();
    w.steps = draftSteps || w.steps;
    var name = document.getElementById('exec-save-name').value.trim() || w.name || 'Macro';
    w.name = name;
    var r = await call('MACRO_SAVE', {
      id: w.id,
      name: name,
      steps: w.steps,
      variables: w.variables,
      versioned: true
    });
    if (!r.ok) { addLog('err', 'Save: ' + r.error); return; }
    w.id = r.data.id;
    if (window.GPD_MacroShared) window.GPD_MacroShared.set(w);
    var lbl = r.data.versionLabel || '';
    document.getElementById('exec-version-label').textContent = lbl;
    addLog('ok', 'Saved ' + lbl);
    if (typeof window.Toast !== 'undefined' && window.Toast.success) window.Toast.success('Saved ' + lbl);
  });

  document.addEventListener('dms:macro-event', function (e) {
    var evt = (e && e.detail) || {};
    switch (evt.kind) {
      case 'started':
        logBuffer = [];
        document.getElementById('exec-log').innerHTML = '';
        addLog('info', 'Started: ' + (evt.workflow || '') + ' (' + (evt.stepCount || 0) + ' steps)');
        setRunningButtons(true);
        renderPlan(0);
        break;
      case 'step_start':
        addLog('step', 'Step ' + (evt.index + 1) + ': ' + describe(evt.step));
        renderPlan(evt.index);
        break;
      case 'step_done':
        addLog('ok', 'Step ' + (evt.index + 1) + ' done (' + (evt.ms || 0) + 'ms)');
        renderVars();
        break;
      case 'step_error':
        addLog('err', 'Step ' + (evt.index + 1) + ': ' + evt.error);
        break;
      case 'paused':
        document.getElementById('exec-pause').disabled = true;
        document.getElementById('exec-resume').disabled = false;
        setRunningButtons(true);
        addLog('info', evt.reason || ('Paused at step ' + ((evt.stepIndex != null ? evt.stepIndex + 1 : '?'))));
        break;
      case 'resumed':
        document.getElementById('exec-pause').disabled = false;
        document.getElementById('exec-resume').disabled = true;
        addLog('info', 'Resumed');
        break;
      case 'finished':
        setRunningButtons(false);
        addLog('ok', 'Finished: ' + (evt.status || 'done'));
        renderVars();
        break;
    }
  });

  window.addEventListener('gpd:macro-workflow-changed', syncDraftFromShared);
  window.addEventListener('tab-activated', function (e) {
    if (e && e.detail && e.detail.tab === 'execute') syncDraftFromShared();
  });

  syncDraftFromShared();
  console.log('[DANMAN] Execute tab loaded');
})();
