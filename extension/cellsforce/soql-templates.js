/* soql-templates.js — DANMAN catalog template builder (GetPower SOQL port) */
(function () {
  'use strict';

  var mounted = false;
  var state = {
    templateId: 'case-parse-query',
    objectApi: 'Case',
    fields: [],
    caseNumbers: [],
    soql: '',
  };

  function $(id) { return document.getElementById(id); }

  function setTplStatus(msg) {
    if (typeof window.setStatus === 'function') window.setStatus(msg);
  }

  function escHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function mountPanel() {
    var root = $('t-soql');
    if (!root || mounted) return;
    mounted = true;

    root.innerHTML =
      '<div class="info-box" style="border-left-color:var(--gold);background:rgba(255,184,0,.08);color:#fde68a;">' +
      '&#9642; <strong>Cookie-cutter SOQL templates</strong> from the DANMAN catalog. Paste your case block, pick a template, copy the query to Workbench.' +
      '</div>' +
      '<div class="cf-card ab">' +
      '  <h2>&#128203; Paste case block <span class="cf-badge o">Step 1</span></h2>' +
      '  <textarea id="soqlTplPaste" rows="6" placeholder="Paste email triage text, voicemail filenames, Drive file list, or any block with 8-digit case numbers..."></textarea>' +
      '  <div class="btn-row">' +
      '    <button type="button" class="btn btn-orange" id="soqlTplExtractBuild">Extract &amp; build SOQL</button>' +
      '    <button type="button" class="btn btn-ghost btn-sm" id="soqlTplExtractOnly">Extract cases only</button>' +
      '    <button type="button" class="btn btn-ghost btn-sm" id="soqlTplPullSmart">Pull from Smart Paste</button>' +
      '  </div>' +
      '  <div id="soqlTplCases" class="info-box" style="margin-top:8px;display:none;font-size:10px;"></div>' +
      '</div>' +
      '<div class="cf-card ab">' +
      '  <h2>&#128218; Template <span class="cf-badge o">Step 2</span></h2>' +
      '  <div class="fgrid">' +
      '    <div class="fg"><label>Catalog template</label><select id="soqlTplSelect"></select></div>' +
      '    <div class="fg"><label>Object</label><select id="soqlTplObject"><option>Case</option></select></div>' +
      '  </div>' +
      '  <p id="soqlTplDesc" style="font-size:10px;color:var(--muted);margin-top:6px;line-height:1.5;"></p>' +
      '</div>' +
      '<div class="cf-card ab">' +
      '  <h2>&#128196; Generated SOQL</h2>' +
      '  <textarea id="soqlTplOutput" rows="10" readonly style="font-family:Consolas,monospace;font-size:10.5px;"></textarea>' +
      '  <div id="soqlTplWarn" style="display:none;font-size:10px;color:#fbbf24;margin-top:6px;"></div>' +
      '  <div class="btn-row">' +
      '    <button type="button" class="btn btn-blue" id="soqlTplCopy">Copy SOQL</button>' +
      '    <button type="button" class="btn btn-gold" id="soqlTplWorkbench">Open Workbench</button>' +
      '    <button type="button" class="btn btn-ghost btn-sm" id="soqlTplRebuild">Rebuild</button>' +
      '  </div>' +
      '  <div id="soqlTplStatus" style="font-size:9px;color:var(--muted);margin-top:6px;"></div>' +
      '</div>';

    $('soqlTplExtractBuild').addEventListener('click', extractAndBuild);
    $('soqlTplExtractOnly').addEventListener('click', extractOnly);
    $('soqlTplPullSmart').addEventListener('click', pullFromSmartPaste);
    $('soqlTplSelect').addEventListener('change', onTemplateChange);
    $('soqlTplCopy').addEventListener('click', copySoql);
    $('soqlTplWorkbench').addEventListener('click', openWorkbench);
    $('soqlTplRebuild').addEventListener('click', rebuild);

    loadCatalogUi();
  }

  function engine() {
    return global.SoqlEngine;
  }

  async function loadCatalogUi() {
    var res = await fetchCatalog();
    if (!res || !res.templates) return;

    var sel = $('soqlTplSelect');
    sel.innerHTML = res.templates.map(function (t) {
      return '<option value="' + escHtml(t.id) + '">' + escHtml(t.name) + '</option>';
    }).join('');

    var objects = Object.keys(res.objects || {});
    var objSel = $('soqlTplObject');
    objSel.innerHTML = objects.map(function (o) {
      return '<option value="' + escHtml(o) + '">' + escHtml(o) + '</option>';
    }).join('');

    state.templateId = sel.value || 'case-parse-query';
    onTemplateChange();
  }

  async function fetchCatalog() {
    var eng = engine();
    if (!eng) return null;
    await eng.loadCatalog();
    try {
      var url = typeof browser !== 'undefined' && browser.runtime
        ? browser.runtime.getURL('data/soql-catalog.json')
        : (typeof chrome !== 'undefined' && chrome.runtime ? chrome.runtime.getURL('data/soql-catalog.json') : 'data/soql-catalog.json');
      var r = await fetch(url);
      return await r.json();
    } catch (e) {
      return null;
    }
  }

  function onTemplateChange() {
    var sel = $('soqlTplSelect');
    if (!sel) return;
    state.templateId = sel.value;
    fetchCatalog().then(function (cat) {
      if (!cat) return;
      var tpl = (cat.templates || []).find(function (t) { return t.id === state.templateId; });
      var desc = $('soqlTplDesc');
      if (desc && tpl) desc.textContent = tpl.description || '';
    });
  }

  function getPasteText() {
    var ta = $('soqlTplPaste');
    return ta ? ta.value : '';
  }

  function showCases(nums) {
    var box = $('soqlTplCases');
    if (!box) return;
    if (!nums.length) {
      box.style.display = 'none';
      return;
    }
    box.style.display = 'block';
    box.innerHTML = '<strong>' + nums.length + ' case(s):</strong> ' + escHtml(nums.join(', '));
    state.caseNumbers = nums;
  }

  function extractOnly() {
    var eng = engine();
    if (!eng) return;
    var nums = eng.extractCaseNumbers(getPasteText());
    showCases(nums);
    window.setStatus('Extracted ' + nums.length + ' case number(s)');
  }

  function pullFromSmartPaste() {
    if (typeof selectedCaseNums !== 'undefined' && selectedCaseNums.length) {
      $('soqlTplPaste').value = selectedCaseNums.join('\n');
      showCases(selectedCaseNums.slice());
      window.setStatus('Pulled ' + selectedCaseNums.length + ' cases from Smart Paste');
      return;
    }
    var spe = $('speInput');
    if (spe && spe.value.trim()) {
      $('soqlTplPaste').value = spe.value;
      extractOnly();
      return;
    }
    window.setStatus('Nothing to pull — paste cases in Smart Paste first');
  }

  async function extractAndBuild() {
    var eng = engine();
    if (!eng) return;
    var text = getPasteText();
    var nums = eng.extractCaseNumbers(text);
    showCases(nums);
    if (!nums.length) {
      window.setStatus('No case numbers found in paste block');
      return;
    }
    var built = eng.buildSoql({
      templateId: state.templateId,
      caseNumbers: nums,
    });
    renderBuild(built);
  }

  async function rebuild() {
    var eng = engine();
    if (!eng) return;
    var nums = state.caseNumbers.length ? state.caseNumbers : eng.extractCaseNumbers(getPasteText());
    var built = eng.buildSoql({
      templateId: $('soqlTplSelect').value,
      caseNumbers: nums,
    });
    renderBuild(built);
  }

  function renderBuild(built) {
    var out = $('soqlTplOutput');
    var warn = $('soqlTplWarn');
    if (!built || !built.ok) {
      if (out) out.value = '';
      if (warn) {
        warn.style.display = 'block';
        warn.textContent = (built && built.error) || 'Build failed';
      }
      return;
    }
    state.soql = built.soql;
    if (out) out.value = built.soql;
    if (warn) {
      if (built.invalid && built.invalid.length) {
        warn.style.display = 'block';
        warn.textContent = 'Removed invalid fields: ' + built.invalid.join(', ');
      } else {
        warn.style.display = 'none';
      }
    }
    window.setStatus('SOQL ready — ' + (built.caseNumbers || []).length + ' cases');
  }

  function copySoql() {
    var text = ($('soqlTplOutput') && $('soqlTplOutput').value) || state.soql;
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        window.setStatus('SOQL copied');
      }).catch(function () { fbCopy(text); });
    } else if (typeof fbCopy === 'function') {
      fbCopy(text);
    }
  }

  function openWorkbench() {
    if (typeof openWBWithQuery === 'function') {
      var out = $('soqlTplOutput');
      if (out && !out.id) out.id = 'soqlTplOutput';
      openWBWithQuery('soqlTplOutput');
      return;
    }
    var wb = typeof v === 'function' ? v('cfg_wbUrl') : '';
    if (wb) window.open(wb, '_blank');
  }

  function refresh() {
    mountPanel();
  }

  window.SoqlTemplatesUI = {
    mount: mountPanel,
    refresh: refresh,
  };
})();
