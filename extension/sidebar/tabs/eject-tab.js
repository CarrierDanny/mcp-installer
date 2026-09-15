/**
 * VERSION: V003R007
 * DATE: 2026-09-15
 * CHANGE: Sends via window.sendToContent (embedded postMessage or native runtime transport)
 * HISTORY:
 *   V002R016 2026-09-15 Legacy email messages read from authenticated gpd-message dispatch
 *   V001R908 2026-08-26 Baseline import + Firefox messaging/clipboard fixes (unstamped)
 */
// sidebar/tabs/eject-tab.js — EJECT Pipeline Tab (Full Implementation)
(function() {
  'use strict';

  const container = document.getElementById('tab-eject');
  if (!container) return;

  // ── State ──────────────────────────────────────────────────────────
  const STAGES = [
    { key: 'E', label: 'Email',    index: 0 },
    { key: 'J', label: 'Jsonify',  index: 1 },
    { key: 'E', label: 'Examine',  index: 2 },
    { key: 'C', label: 'Compare',  index: 3 },
    { key: 'T', label: 'Transfer', index: 4 },
  ];

  const STAGE_LABELS = {
    INIT:             'Ready',
    EMAIL_CAPTURED:   'Email captured',
    JSONIFYING:       'Extracting with AI...',
    JSONIFIED:        'Extraction complete',
    EXAMINING:        'Validating...',
    EXAMINED:         'Validation complete',
    COMPARING:        'Cross-referencing...',
    COMPARED:         'Comparison complete',
    TRANSFERRING:     'Transferring...',
    COMPLETE:         'Pipeline complete',
    ERROR:            'Error occurred',
  };

  // Map status to active stage index (0-4) and completed count
  const STATUS_TO_STAGE = {
    INIT:             { active: -1, completed: 0 },
    EMAIL_CAPTURED:   { active: 0,  completed: 1 },
    JSONIFYING:       { active: 1,  completed: 1 },
    JSONIFIED:        { active: 1,  completed: 2 },
    EXAMINING:        { active: 2,  completed: 2 },
    EXAMINED:         { active: 2,  completed: 3 },
    COMPARING:        { active: 3,  completed: 3 },
    COMPARED:         { active: 3,  completed: 4 },
    TRANSFERRING:     { active: 4,  completed: 4 },
    COMPLETE:         { active: -1, completed: 5 },
    ERROR:            { active: -1, completed: 0 },
  };

  let state = {
    status: 'INIT',
    running: false,
    result: null,
    history: [],
    selectedHistory: null,
  };

  // ── Render ─────────────────────────────────────────────────────────
  container.innerHTML = `
    <style>
      /* Pipeline indicator row */
      .eject-pipeline {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0;
        padding: 12px 0 8px;
        user-select: none;
      }
      .eject-stage {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        position: relative;
        z-index: 1;
      }
      .eject-stage-circle {
        width: 34px;
        height: 34px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        font-size: 14px;
        font-family: 'Consolas', 'Monaco', monospace;
        border: 2px solid #334155;
        background: #0f172a;
        color: #475569;
        transition: all 0.4s ease;
        position: relative;
      }
      .eject-stage-circle.pending {
        border-color: #334155;
        color: #475569;
        background: #0f172a;
      }
      .eject-stage-circle.active {
        border-color: #22d3ee;
        color: #22d3ee;
        background: rgba(34, 211, 238, 0.1);
        box-shadow: 0 0 12px rgba(34, 211, 238, 0.3);
        animation: ejectPulse 1.5s ease-in-out infinite;
      }
      .eject-stage-circle.completed {
        border-color: #22c55e;
        color: #22c55e;
        background: rgba(34, 197, 94, 0.1);
      }
      .eject-stage-circle.error {
        border-color: #ef4444;
        color: #ef4444;
        background: rgba(239, 68, 68, 0.1);
      }
      .eject-stage-label {
        font-size: 9px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: #475569;
        transition: color 0.4s ease;
        font-weight: 600;
      }
      .eject-stage-label.active { color: #22d3ee; }
      .eject-stage-label.completed { color: #22c55e; }
      .eject-stage-label.error { color: #ef4444; }

      .eject-connector {
        width: 24px;
        height: 2px;
        background: #334155;
        margin: 0 2px;
        margin-bottom: 18px;
        transition: background 0.4s ease;
        position: relative;
      }
      .eject-connector.completed {
        background: #22c55e;
      }
      .eject-connector.active {
        background: linear-gradient(90deg, #22c55e, #22d3ee);
      }

      @keyframes ejectPulse {
        0%, 100% { box-shadow: 0 0 8px rgba(34, 211, 238, 0.2); }
        50% { box-shadow: 0 0 18px rgba(34, 211, 238, 0.5); }
      }

      /* Status label */
      .eject-status-label {
        text-align: center;
        font-size: 12px;
        color: #94a3b8;
        font-weight: 500;
        min-height: 18px;
        margin-bottom: 12px;
        transition: color 0.3s ease;
      }
      .eject-status-label.running { color: #22d3ee; }
      .eject-status-label.complete { color: #22c55e; }
      .eject-status-label.error { color: #ef4444; }

      /* Input section */
      .eject-input-section { margin-bottom: 12px; }
      .eject-input-section textarea {
        min-height: 80px;
        font-size: 12px;
        margin-top: 6px;
      }
      .eject-btn-row {
        display: flex;
        gap: 6px;
        margin-top: 8px;
      }
      .eject-btn-row .btn { flex: 1; font-size: 12px; padding: 7px 10px; }

      /* Progress section */
      #eject-progress-section { display: none; }

      /* Results section */
      #eject-results-section { display: none; }

      .eject-exam-score {
        display: flex;
        justify-content: center;
        padding: 8px 0;
      }

      /* Field cards */
      .eject-field-card {
        background: #0f172a;
        border: 1px solid #334155;
        border-radius: 6px;
        padding: 8px 10px;
        margin-bottom: 6px;
        display: flex;
        align-items: flex-start;
        gap: 8px;
      }
      .eject-field-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        margin-top: 5px;
        flex-shrink: 0;
      }
      .eject-field-info { flex: 1; min-width: 0; }
      .eject-field-name {
        font-size: 10px;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        font-weight: 600;
      }
      .eject-field-value {
        font-size: 13px;
        color: #e2e8f0;
        word-break: break-word;
        margin-top: 1px;
      }
      .eject-field-conf {
        font-size: 11px;
        font-weight: 600;
        flex-shrink: 0;
        margin-top: 3px;
        font-family: 'Consolas', 'Monaco', monospace;
      }

      /* Comparison matches */
      .eject-match-card {
        background: #0f172a;
        border: 1px solid #f59e0b33;
        border-left: 3px solid #f59e0b;
        border-radius: 6px;
        padding: 8px 10px;
        margin-bottom: 6px;
        font-size: 12px;
      }
      .eject-match-source {
        font-size: 10px;
        color: #f59e0b;
        text-transform: uppercase;
        font-weight: 600;
        margin-bottom: 4px;
      }
      .eject-match-detail {
        color: #94a3b8;
      }
      .eject-match-detail strong { color: #e2e8f0; }

      /* Transfer buttons */
      .eject-transfer-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
        margin-top: 8px;
      }
      .eject-transfer-row .btn { font-size: 11px; padding: 6px 8px; }

      /* History section */
      .eject-history-list {
        max-height: 240px;
        overflow-y: auto;
      }
      .eject-history-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 7px 10px;
        background: #0f172a;
        border: 1px solid #334155;
        border-radius: 6px;
        margin-bottom: 4px;
        cursor: pointer;
        transition: border-color 0.2s ease;
        font-size: 12px;
      }
      .eject-history-item:hover { border-color: #38bdf8; }
      .eject-history-item.selected { border-color: #22d3ee; background: rgba(34, 211, 238, 0.05); }
      .eject-history-score {
        font-weight: 700;
        font-family: 'Consolas', 'Monaco', monospace;
        font-size: 13px;
        min-width: 32px;
        text-align: center;
      }
      .eject-history-meta { flex: 1; min-width: 0; }
      .eject-history-time { color: #64748b; font-size: 11px; }
      .eject-history-info { color: #94a3b8; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    </style>

    <div class="tab-title">&#9889; EJECT Pipeline</div>
    <div class="tab-desc">Email &rarr; Jsonify &rarr; Examine &rarr; Compare &rarr; Transfer</div>

    <!-- Pipeline Visualization -->
    <div class="card">
      <div id="eject-pipeline" class="eject-pipeline"></div>
      <div id="eject-status-label" class="eject-status-label">Ready</div>
    </div>

    <!-- Input Section -->
    <div class="card eject-input-section">
      <div class="card-header">
        <span class="section-title">Input</span>
      </div>
      <button class="btn btn-secondary btn-block btn-sm" id="btn-eject-scrape">
        &#128233; Auto Scrape Email
      </button>
      <textarea id="eject-email-input" placeholder="Or paste email text here..."></textarea>
      <div class="eject-btn-row">
        <button class="btn btn-primary" id="btn-eject-run" style="flex:2;">
          &#9889; Run Pipeline
        </button>
        <button class="btn btn-secondary" id="btn-eject-clear">
          Clear
        </button>
      </div>
    </div>

    <!-- Progress Section -->
    <div class="card" id="eject-progress-section">
      <div class="card-header">
        <span class="section-title">Progress</span>
      </div>
      <div id="eject-progress-bar"></div>
    </div>

    <!-- Results Section -->
    <div id="eject-results-section">
      <!-- Exam Score -->
      <div class="card">
        <div class="card-header">
          <span class="section-title">Exam Score</span>
          <span id="eject-score-text" class="text-xs font-mono" style="color:#94a3b8;"></span>
        </div>
        <div id="eject-exam-gauge" class="eject-exam-score"></div>
      </div>

      <!-- Extracted Fields -->
      <div class="card">
        <div class="card-header">
          <span class="section-title">Extracted Fields</span>
          <span id="eject-field-count" class="badge badge-cyan"></span>
        </div>
        <div id="eject-fields-list"></div>
      </div>

      <!-- Comparison Results -->
      <div class="card" id="eject-comparison-card" style="display:none;">
        <div class="card-header">
          <span class="section-title">Comparison Results</span>
          <span id="eject-match-count" class="badge badge-yellow"></span>
        </div>
        <div id="eject-comparison-list"></div>
      </div>

      <!-- Transfer Buttons -->
      <div class="card">
        <div class="card-header">
          <span class="section-title">Transfer</span>
        </div>
        <div class="eject-transfer-row">
          <button class="btn btn-secondary" id="btn-eject-copy-text">&#128203; Copy Text</button>
          <button class="btn btn-secondary" id="btn-eject-copy-json">{ } Copy JSON</button>
          <button class="btn btn-primary" id="btn-eject-push-sf">&#9729; Salesforce</button>
          <button class="btn btn-success" id="btn-eject-push-sheets">&#128202; Sheets</button>
        </div>
      </div>
    </div>

    <!-- History Section -->
    <div class="card">
      <div class="card-header">
        <span class="section-title">History</span>
        <span id="eject-history-count" class="text-xs text-muted"></span>
      </div>
      <div id="eject-history-list" class="eject-history-list">
        <div class="empty-state" id="eject-history-empty">
          <div class="icon">&#128218;</div>
          <div class="message">No extractions yet</div>
        </div>
      </div>
    </div>
  `;

  // ── Component Instances ────────────────────────────────────────────
  let examGauge = null;
  let progressBar = null;

  if (window.ConfidenceGauge) {
    examGauge = new ConfidenceGauge(document.getElementById('eject-exam-gauge'), { size: 100, thickness: 10 });
  }
  if (window.ProgressBar) {
    progressBar = new ProgressBar(document.getElementById('eject-progress-bar'));
  }

  // ── DOM References ─────────────────────────────────────────────────
  const $pipeline        = document.getElementById('eject-pipeline');
  const $statusLabel     = document.getElementById('eject-status-label');
  const $emailInput      = document.getElementById('eject-email-input');
  const $progressSection = document.getElementById('eject-progress-section');
  const $resultsSection  = document.getElementById('eject-results-section');
  const $fieldsList      = document.getElementById('eject-fields-list');
  const $fieldCount      = document.getElementById('eject-field-count');
  const $scoreText       = document.getElementById('eject-score-text');
  const $comparisonCard  = document.getElementById('eject-comparison-card');
  const $comparisonList  = document.getElementById('eject-comparison-list');
  const $matchCount      = document.getElementById('eject-match-count');
  const $historyList     = document.getElementById('eject-history-list');
  const $historyCount    = document.getElementById('eject-history-count');
  const $historyEmpty    = document.getElementById('eject-history-empty');

  // ── Pipeline Rendering ─────────────────────────────────────────────
  function renderPipeline() {
    const info = STATUS_TO_STAGE[state.status] || STATUS_TO_STAGE.INIT;
    const isError = state.status === 'ERROR';
    let html = '';

    STAGES.forEach((stage, i) => {
      let circleClass = 'pending';
      let labelClass = '';

      if (isError) {
        circleClass = 'error';
        labelClass = 'error';
      } else if (i < info.completed) {
        circleClass = 'completed';
        labelClass = 'completed';
      } else if (i === info.active) {
        circleClass = 'active';
        labelClass = 'active';
      }

      html += `
        <div class="eject-stage">
          <div class="eject-stage-circle ${circleClass}">${stage.key}</div>
          <div class="eject-stage-label ${labelClass}">${stage.label}</div>
        </div>
      `;

      // Add connector between stages (not after last)
      if (i < STAGES.length - 1) {
        let connClass = '';
        if (isError) {
          connClass = '';
        } else if (i < info.completed - 1) {
          connClass = 'completed';
        } else if (i === info.completed - 1 && info.active === i + 1) {
          connClass = 'active';
        } else if (i < info.completed) {
          connClass = 'completed';
        }
        html += `<div class="eject-connector ${connClass}"></div>`;
      }
    });

    $pipeline.innerHTML = html;
  }

  function renderStatusLabel() {
    const label = STAGE_LABELS[state.status] || 'Ready';
    $statusLabel.textContent = label;
    $statusLabel.className = 'eject-status-label';
    if (state.running) $statusLabel.classList.add('running');
    else if (state.status === 'COMPLETE') $statusLabel.classList.add('complete');
    else if (state.status === 'ERROR') $statusLabel.classList.add('error');
  }

  function updateProgress() {
    if (!progressBar) return;
    const info = STATUS_TO_STAGE[state.status] || STATUS_TO_STAGE.INIT;
    const label = STAGE_LABELS[state.status] || '';

    if (state.status === 'INIT') {
      $progressSection.style.display = 'none';
      return;
    }

    $progressSection.style.display = 'block';

    if (state.status === 'COMPLETE') {
      progressBar.complete('Pipeline complete');
    } else if (state.status === 'ERROR') {
      progressBar.error('Error occurred');
    } else {
      // Progress from 0 to 5 based on completed stages
      progressBar.update(info.completed, label);
    }
  }

  // ── Results Rendering ──────────────────────────────────────────────
  function getConfidenceColor(conf) {
    if (conf >= 85) return '#22c55e';
    if (conf >= 60) return '#f59e0b';
    return '#ef4444';
  }

  function renderResults(result) {
    if (!result) {
      $resultsSection.style.display = 'none';
      return;
    }

    $resultsSection.style.display = 'block';

    // Exam score gauge
    const score = result.examScore || 0;
    if (examGauge) {
      examGauge.update(score, 'Overall Confidence');
    }
    $scoreText.textContent = `${score}%`;
    $scoreText.style.color = getConfidenceColor(score);

    // Extracted fields
    const fields = result.fields || [];
    $fieldCount.textContent = `${fields.length} fields`;
    if (fields.length === 0) {
      $fieldsList.innerHTML = '<div class="text-muted text-sm" style="padding:8px 0;">No fields extracted</div>';
    } else {
      $fieldsList.innerHTML = fields.map(f => {
        const conf = f.confidence || 0;
        const color = getConfidenceColor(conf);
        return `
          <div class="eject-field-card">
            <div class="eject-field-dot" style="background:${color};"></div>
            <div class="eject-field-info">
              <div class="eject-field-name">${escapeHtml(f.name || f.key || 'Unknown')}</div>
              <div class="eject-field-value">${escapeHtml(String(f.value ?? ''))}</div>
            </div>
            <div class="eject-field-conf" style="color:${color};">${conf}%</div>
          </div>
        `;
      }).join('');
    }

    // Comparison results
    const matches = result.matches || [];
    if (matches.length > 0) {
      $comparisonCard.style.display = 'block';
      $matchCount.textContent = `${matches.length} match${matches.length !== 1 ? 'es' : ''}`;
      $comparisonList.innerHTML = matches.map(m => `
        <div class="eject-match-card">
          <div class="eject-match-source">${escapeHtml(m.source || 'Unknown')}</div>
          <div class="eject-match-detail">
            <strong>${escapeHtml(m.name || m.label || '')}</strong>
            ${m.detail ? `<br>${escapeHtml(m.detail)}` : ''}
            ${m.score != null ? `<br>Match score: <strong>${m.score}%</strong>` : ''}
          </div>
        </div>
      `).join('');
    } else {
      $comparisonCard.style.display = 'none';
    }
  }

  // ── History Rendering ──────────────────────────────────────────────
  function renderHistory() {
    const items = state.history || [];
    $historyCount.textContent = items.length > 0 ? `${items.length} / 20` : '';

    if (items.length === 0) {
      $historyEmpty.style.display = 'block';
      $historyList.querySelectorAll('.eject-history-item').forEach(el => el.remove());
      return;
    }

    $historyEmpty.style.display = 'none';

    $historyList.innerHTML = items.map((item, idx) => {
      const score = item.examScore || 0;
      const color = getConfidenceColor(score);
      const fieldCount = (item.fields || []).length;
      const time = formatTimestamp(item.timestamp);
      const source = item.source || 'manual';
      const selected = state.selectedHistory === idx ? 'selected' : '';

      return `
        <div class="eject-history-item ${selected}" data-history-idx="${idx}">
          <div class="eject-history-score" style="color:${color};">${score}</div>
          <div class="eject-history-meta">
            <div class="eject-history-time">${time} &middot; ${escapeHtml(source)}</div>
            <div class="eject-history-info">${fieldCount} field${fieldCount !== 1 ? 's' : ''} extracted</div>
          </div>
        </div>
      `;
    }).join('');
  }

  function formatTimestamp(ts) {
    if (!ts) return 'Unknown';
    try {
      const d = new Date(ts);
      const now = new Date();
      const diff = now - d;
      if (diff < 60000) return 'Just now';
      if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
      if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return 'Unknown'; }
  }

  // ── Render All ─────────────────────────────────────────────────────
  function render() {
    renderPipeline();
    renderStatusLabel();
    updateProgress();
  }

  // ── Actions ────────────────────────────────────────────────────────
  function runPipeline() {
    const text = $emailInput.value.trim();
    if (!text) {
      if (window.Toast) Toast.warning('Paste or scrape an email first.');
      return;
    }
    if (state.running) return;

    state.running = true;
    state.status = 'JSONIFYING';
    state.result = null;
    state.selectedHistory = null;
    $resultsSection.style.display = 'none';

    if (progressBar) {
      progressBar.start(5);
    }

    render();

    // Disable run button
    const $btnRun = document.getElementById('btn-eject-run');
    if ($btnRun) $btnRun.disabled = true;

    if (window.sendToBackground) {
      window.sendToBackground('EJECT_RUN_PIPELINE', { text, source: 'manual' })
        .then(resp => {
          if (resp && resp.error) {
            handleError(resp.error);
          }
        })
        .catch(err => {
          handleError(err.message || 'Pipeline failed');
        });
    }
  }

  function scrapeEmail() {
    if (window.Toast) Toast.info('Requesting email from page...');
    window.sendToContent('GPD_REQUEST_EMAIL');
  }

  function clearInput() {
    $emailInput.value = '';
    state.status = 'INIT';
    state.running = false;
    state.result = null;
    state.selectedHistory = null;
    $resultsSection.style.display = 'none';
    $progressSection.style.display = 'none';
    if (progressBar) progressBar.reset();
    const $btnRun = document.getElementById('btn-eject-run');
    if ($btnRun) $btnRun.disabled = false;
    render();
  }

  function handleError(msg) {
    state.status = 'ERROR';
    state.running = false;
    const $btnRun = document.getElementById('btn-eject-run');
    if ($btnRun) $btnRun.disabled = false;
    if (progressBar) progressBar.error(msg || 'Error occurred');
    render();
    if (window.Toast) Toast.error(msg || 'Pipeline error');
  }

  function handlePipelineUpdate(data) {
    if (data.status) {
      state.status = data.status;
      const info = STATUS_TO_STAGE[data.status] || STATUS_TO_STAGE.INIT;
      if (progressBar && state.running) {
        const label = STAGE_LABELS[data.status] || '';
        if (data.status === 'COMPLETE') {
          progressBar.complete('Pipeline complete');
        } else if (data.status === 'ERROR') {
          progressBar.error(data.error || 'Error occurred');
        } else {
          progressBar.update(info.completed, label);
        }
      }
    }

    if (data.status === 'COMPLETE' || data.result) {
      state.running = false;
      state.result = data.result || data;
      const $btnRun = document.getElementById('btn-eject-run');
      if ($btnRun) $btnRun.disabled = false;
      renderResults(state.result);

      // Add Save to Sheets button via OutputDialog
      if (typeof OutputDialog !== 'undefined' && state.result) {
        const existing = document.getElementById('eject-save-sheets-btn');
        if (existing) existing.remove();
        const saveBtn = document.createElement('button');
        saveBtn.id = 'eject-save-sheets-btn';
        saveBtn.textContent = 'Save to Sheets';
        saveBtn.style.cssText = 'padding:8px 14px;background:#38bdf8;color:#0f172a;border:none;border-radius:6px;font-weight:600;font-size:12px;cursor:pointer;margin-top:8px;width:100%;';
        saveBtn.onclick = () => {
          const fields = state.result.fields || [];
          OutputDialog.show({
            url: '',
            title: 'EJECT Extraction',
            word_count: 0,
            content_rows: fields.map(f => [new Date().toISOString(), 'field', f.name || f.key || '', String(f.value ?? ''), String(f.confidence || 0), '']),
            link_rows: [],
            media_items: [],
            form_rows: [],
            raw_html: ''
          });
        };
        $resultsSection.appendChild(saveBtn);
      }

      loadHistory();
    }

    if (data.status === 'ERROR') {
      handleError(data.error);
    }

    render();
  }

  function handleEmailScraped(msg) {
    // Accept both the legacy flat shape ({text}) and the content script's
    // GPD_EMAIL_RESULT shape ({data: {subject, from, date, body}}).
    const d = (msg && msg.data) || msg || {};
    const text = d.text || [
      d.subject ? 'Subject: ' + d.subject : '',
      d.from ? 'From: ' + d.from : '',
      d.date ? 'Date: ' + d.date : '',
      d.body || ''
    ].filter(Boolean).join('\n');
    if (text.trim()) {
      $emailInput.value = text;
      state.status = 'EMAIL_CAPTURED';
      render();
      if (window.Toast) Toast.success('Email captured');
    } else {
      if (window.Toast) Toast.warning('No email content found on this page.');
    }
  }

  // ── Transfer Actions ───────────────────────────────────────────────
  function copyAsText() {
    const record = state.result;
    if (!record || !record.fields) return;
    const lines = record.fields.map(f => `${f.name || f.key}: ${f.value ?? ''}`);
    const text = lines.join('\n');
    if (window.copyToClipboard) {
      window.copyToClipboard(text);
      if (window.Toast) Toast.success('Copied as text');
    }
  }

  function copyAsJson() {
    const record = state.result;
    if (!record) return;
    const obj = {};
    (record.fields || []).forEach(f => { obj[f.name || f.key] = f.value ?? ''; });
    const json = JSON.stringify(obj, null, 2);
    if (window.copyToClipboard) {
      window.copyToClipboard(json);
      if (window.Toast) Toast.success('Copied as JSON');
    }
  }

  function pushToSalesforce() {
    if (!state.result) return;
    if (window.Toast) Toast.info('Pushing to Salesforce...');
    if (window.sendToBackground) {
      window.sendToBackground('EJECT_TRANSFER', { record: state.result, target: 'salesforce' })
        .then(resp => {
          if (resp && resp.success) {
            if (window.Toast) Toast.success('Pushed to Salesforce');
          } else {
            if (window.Toast) Toast.error(resp?.error || 'Salesforce push failed');
          }
        })
        .catch(() => {
          if (window.Toast) Toast.error('Salesforce push failed');
        });
    }
  }

  function pushToSheets() {
    if (!state.result) return;
    if (window.Toast) Toast.info('Pushing to Sheets...');
    if (window.sendToBackground) {
      window.sendToBackground('EJECT_TRANSFER', { record: state.result, target: 'sheets' })
        .then(resp => {
          if (resp && resp.success) {
            if (window.Toast) Toast.success('Pushed to Sheets');
          } else {
            if (window.Toast) Toast.error(resp?.error || 'Sheets push failed');
          }
        })
        .catch(() => {
          if (window.Toast) Toast.error('Sheets push failed');
        });
    }
  }

  // ── History ────────────────────────────────────────────────────────
  function loadHistory() {
    if (window.sendToBackground) {
      window.sendToBackground('EJECT_GET_HISTORY', {})
        .then(resp => {
          if (resp && Array.isArray(resp.history)) {
            state.history = resp.history.slice(0, 20);
          } else if (resp && Array.isArray(resp)) {
            state.history = resp.slice(0, 20);
          }
          renderHistory();
        })
        .catch(() => {});
    }
  }

  function selectHistoryItem(idx) {
    const item = state.history[idx];
    if (!item) return;
    state.selectedHistory = idx;
    state.result = item;
    state.status = 'COMPLETE';
    state.running = false;
    renderResults(item);
    renderHistory();
    render();
  }

  // ── Utility ────────────────────────────────────────────────────────
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Event Listeners ────────────────────────────────────────────────
  document.getElementById('btn-eject-run')?.addEventListener('click', runPipeline);
  document.getElementById('btn-eject-scrape')?.addEventListener('click', scrapeEmail);
  document.getElementById('btn-eject-clear')?.addEventListener('click', clearInput);
  document.getElementById('btn-eject-copy-text')?.addEventListener('click', copyAsText);
  document.getElementById('btn-eject-copy-json')?.addEventListener('click', copyAsJson);
  document.getElementById('btn-eject-push-sf')?.addEventListener('click', pushToSalesforce);
  document.getElementById('btn-eject-push-sheets')?.addEventListener('click', pushToSheets);

  // History item clicks (delegated)
  $historyList.addEventListener('click', (e) => {
    const item = e.target.closest('.eject-history-item');
    if (item) {
      const idx = parseInt(item.dataset.historyIdx, 10);
      if (!isNaN(idx)) selectHistoryItem(idx);
    }
  });

  // Listen for pipeline status messages from background
  window.addEventListener('gpd-message', (e) => {
    const msg = e.detail;
    if (!msg) return;

    switch (msg.type) {
      case 'EJECT_PIPELINE_UPDATE':
      case 'EJECT_STATUS':
        handlePipelineUpdate(msg);
        break;
      case 'EJECT_PIPELINE_COMPLETE':
        handlePipelineUpdate({ status: 'COMPLETE', result: msg.result || msg });
        break;
      case 'EJECT_PIPELINE_ERROR':
        handleError(msg.error || 'Pipeline failed');
        break;
      case 'GPD_EMAIL_SCRAPED':
      case 'GPD_EMAIL_CONTENT':
      case 'GPD_EMAIL_RESULT':
        handleEmailScraped(msg);
        break;
    }
  });

  // Legacy email message names, delivered through the same authenticated
  // gpd-message dispatch (GPD_EMAIL_RESULT is already handled above).
  window.addEventListener('gpd-message', (e) => {
    const msg = e.detail;
    if (!msg || !msg.type) return;

    if (msg.type === 'GPD_EMAIL_SCRAPED' || msg.type === 'GPD_EMAIL_CONTENT') {
      handleEmailScraped(msg);
    }
  });

  // Load history when tab is activated
  window.addEventListener('tab-activated', (e) => {
    if (e.detail && e.detail.tab === 'eject') {
      loadHistory();
    }
  });

  // ── Initialize ─────────────────────────────────────────────────────
  render();
  renderHistory();

  console.log('[DANMAN] EJECT tab loaded');
})();
