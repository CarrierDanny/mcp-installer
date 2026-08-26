// background/macro-engine.js — Ported verbatim from DANMAN_Macro_Studio v6.7.0
// Bridges to v5 via core/dms-adapters.js (DMS_Config/Logger/WindowBinder).
// background/macro-engine.js — DANMAN Macro Studio
// Orchestrates macro execution. The actual DOM operations happen in the content
// script; this module:
//   - validates step schemas
//   - resolves the bound tab via WindowBinder
//   - posts steps to the content script
//   - manages pause/resume/stop state across runs
//   - logs each step into the Sheets sink (if enabled) and ring-buffer log
//   - publishes execution events to subscribed listeners (sidebar)
//
// State machine: idle -> running -> (paused | running) -> done|error|stopped
// File: DANMAN_Macro_StudioV001r000

const DMS_MacroEngine = (function () {
  const VALID_STEP_TYPES = ['click', 'screenClick', 'mouseMove', 'type', 'select', 'wait', 'upload', 'extract', 'navigate', 'scroll', 'hover', 'keypress', 'screenshot', 'copy', 'paste', 'switchTab'];

  let state = {
    runId: null,
    status: 'idle',            // 'idle' | 'running' | 'paused' | 'stopping'
    workflow: null,
    stepIndex: 0,
    variables: {},
    startedAt: null,
    targetTabId: null,
    targetWindowId: null,
    log: []
  };

  const eventListeners = new Set();
  function on(fn) { eventListeners.add(fn); return () => eventListeners.delete(fn); }
  function _emit(evt) {
    for (const fn of eventListeners) { try { fn(evt); } catch (e) {} }
    try { chrome.runtime.sendMessage({ type: 'macro_event', event: evt }); } catch (e) {}
  }

  function _validateWorkflow(workflow) {
    if (!workflow || !Array.isArray(workflow.steps)) throw new Error('Workflow has no steps');
    workflow.steps.forEach((s, i) => {
      if (s._pending) throw new Error('Step ' + (i + 1) + ' is still awaiting coordinate pick — click the page target or cancel the pick before running');
      if (!VALID_STEP_TYPES.includes(s.type)) throw new Error('Step ' + (i + 1) + ': unknown type "' + s.type + '"');
      if (['click','type','select','upload','extract','hover','scroll'].includes(s.type) && !s.selector) {
        throw new Error('Step ' + (i + 1) + ' (' + s.type + '): selector required');
      }
      if (s.type === 'select' && (s.value == null || s.value === '')) {
        throw new Error('Step ' + (i + 1) + ' (select): value required');
      }
      if (s.type === 'screenClick' || s.type === 'mouseMove') {
        if (s.x == null || s.y == null) throw new Error('Step ' + (i + 1) + ' (' + s.type + '): x/y required');
      }
      if (s.type === 'switchTab' && !s.value) {
        throw new Error('Step ' + (i + 1) + ' (switchTab): value required');
      }
    });
  }

  async function _switchTab(step) {
    const tabs = await DMS_Browser.tabs.query({ currentWindow: true });
    const match = String(step.tabMatch || 'title').toLowerCase();
    const needle = String(step.value || '').toLowerCase();
    let target = null;
    if (match === 'index') {
      const idx = parseInt(step.value, 10);
      target = tabs[idx];
    } else {
      target = tabs.find((t) => {
        if (match === 'url') return (t.url || '').toLowerCase().includes(needle);
        return (t.title || '').toLowerCase().includes(needle);
      });
    }
    if (!target) throw new Error('No tab matched: ' + step.value);
    await DMS_Browser.tabs.update(target.id, { active: true });
    state.targetTabId = target.id;
    await DMS_Utils.sleep(400);
    await _ensureContentReady(target.id);
    return { ok: true };
  }

  async function _ensureContentReady(tabId) {
    // Try a quick ping; if no response, inject content scripts dynamically (handles old tabs)
    try {
      const r = await DMS_Browser.tabs.sendMessage(tabId, { type: 'dms_ping' });
      if (r && r.ok) return true;
    } catch (e) { /* fall through to inject */ }

    try {
      if (DMS_Browser.tabs.executeScript) {
        await DMS_Browser.tabs.executeScript({
          target: { tabId },
          files: ['content/element-picker.js', 'content/macro-runner.js', 'content/content-main.js']
        });
      }
    } catch (e) {
      DMS_Logger.warn('executeScript injection failed: ' + e.message);
    }
    return true;
  }

  async function _logUsageToSheets(entry) {
    // v5 port: usage logging routed through DMS_Logger -> audit_log; the v6.7
    // direct-to-Sheets path depends on dms_config.ai.danmanWebhookUrl/Token which
    // aren't part of v5's flat config schema. Stub to no-op.
    return;
    /* original body retained for reference:
    const cfg = await DMS_Config.load();
    if (!cfg.sheets || !cfg.sheets.enabled || !cfg.ai || !cfg.ai.danmanWebhookUrl || !cfg.ai.danmanWebhookToken) return;
    try {
      const url = cfg.ai.danmanWebhookUrl + (cfg.ai.danmanWebhookUrl.includes('?') ? '&' : '?') + 't=' + encodeURIComponent(cfg.ai.danmanWebhookToken);
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'logMacroUsage', entry })
      });
    } catch (e) {
      DMS_Logger.warn('Sheets log failed: ' + e.message);
    }
    */
  }

  async function _loadDriveRootId() {
    let rootId = '';
    if (typeof ConfigManager !== 'undefined') {
      try {
        const config = await ConfigManager.load();
        rootId = (config.backend && config.backend.master_folder_id) || '';
      } catch (e) { /* fall through */ }
    }
    if (!rootId) {
      const cfg = await DMS_Config.load();
      rootId = (cfg.backend && cfg.backend.master_folder_id) || cfg.drive_folder_id || '';
    }
    return rootId;
  }

  async function _getDanmanScreenshotsFolderId() {
    const rootId = await _loadDriveRootId();
    if (!rootId) throw new Error('No Drive folder configured (backend.master_folder_id)');
    if (typeof DriveClient === 'undefined' || !DriveClient.getOrCreateFolder) {
      throw new Error('DriveClient not available');
    }
    const folder = await DriveClient.getOrCreateFolder('DANMAN_Screenshots', rootId);
    return folder && folder.id ? folder.id : rootId;
  }

  function _dataUrlToBase64(dataUrl) {
    const i = String(dataUrl || '').indexOf(',');
    return i >= 0 ? dataUrl.slice(i + 1) : String(dataUrl || '');
  }

  async function _cropScreenshotDataUrl(dataUrl, rect, dpr) {
    dpr = dpr || 1;
    if (!rect || typeof OffscreenCanvas === 'undefined') return dataUrl;
    try {
      const resp = await fetch(dataUrl);
      const blob = await resp.blob();
      const bitmap = await createImageBitmap(blob);
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      const x = Math.max(0, Math.round(rect.x * dpr));
      const y = Math.max(0, Math.round(rect.y * dpr));
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, x, y, w, h, 0, 0, w, h);
      const out = await canvas.convertToBlob({ type: 'image/png' });
      return await new Promise(function (resolve, reject) {
        const fr = new FileReader();
        fr.onload = function () { resolve(fr.result); };
        fr.onerror = reject;
        fr.readAsDataURL(out);
      });
    } catch (e) {
      DMS_Logger.warn('Screenshot crop failed, saving full viewport: ' + e.message);
      return dataUrl;
    }
  }

  async function _saveScreenshotCapture(tabId, captureRequest, workflowName) {
    const tab = await DMS_Browser.tabs.get(tabId);
    let dataUrl = await DMS_Browser.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    if (!dataUrl) throw new Error('captureVisibleTab returned empty');
    const mode = (captureRequest && captureRequest.mode) || 'viewport';
    if ((mode === 'selector' || mode === 'coords') && captureRequest.rect) {
      dataUrl = await _cropScreenshotDataUrl(dataUrl, captureRequest.rect, captureRequest.dpr || 1);
    }
    const folderId = await _getDanmanScreenshotsFolderId();
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const safeLabel = String(captureRequest.label || workflowName || 'macro').replace(/[^\w.-]+/g, '_').slice(0, 40);
    const fileName = 'screenshot_' + safeLabel + '_' + ts + '.png';
    const base64 = _dataUrlToBase64(dataUrl);
    const result = await DriveClient.createFile(fileName, base64, 'image/png', folderId, { contentEncoding: 'base64' });
    const fileId = result && (result.id || result.fileId);
    DMS_Logger.info('Screenshot saved to DANMAN_Screenshots: ' + fileName);
    return { fileId, fileName, folderId, mode, url: captureRequest.url || '' };
  }

  // ---------- Public API ----------
  async function run(workflow, options) {
    if (state.status === 'running' || state.status === 'paused') {
      throw new Error('A macro is already running. Stop it first.');
    }
    _validateWorkflow(workflow);

    const cfg = await DMS_Config.load();
    const target = await DMS_WindowBinder.getActiveOrBoundTab();
    if (!target) throw new Error('No tab available for execution');

    state = {
      runId: DMS_Utils.uuid(),
      status: 'running',
      workflow: DMS_Utils.clone(workflow),
      stepIndex: 0,
      variables: {},
      startedAt: DMS_Utils.nowISO(),
      targetTabId: target.id,
      targetWindowId: target.windowId,
      log: []
    };

    _emit({ kind: 'started', runId: state.runId, workflow: workflow.name || 'Untitled', target: { tabId: target.id, url: target.url }, stepCount: workflow.steps.length });
    DMS_Logger.info('Macro started: ' + (workflow.name || 'Untitled') + ' on tab ' + target.id);

    try {
      await _ensureContentReady(target.id);

      const loopCount = Math.max(1, parseInt((options && options.loopCount) || 1, 10) || 1);

      for (let loop = 0; loop < loopCount; loop++) {
        if (loop > 0) {
          _emit({ kind: 'loop_start', runId: state.runId, loop: loop + 1, total: loopCount });
          state.stepIndex = 0;
        }

      for (let i = 0; i < state.workflow.steps.length; i++) {
        if (state.status === 'stopping') break;

        while (state.status === 'paused') {
          await DMS_Utils.sleep(150);
          if (state.status === 'stopping') break;
        }
        if (state.status === 'stopping') break;

        state.stepIndex = i;
        const step = state.workflow.steps[i];

        // Enforce binding: if bound, abort if the active tab is no longer the bound tab
        const cfgNow = await DMS_Config.load();
        const bindNow = cfgNow.bind || {};
        if (bindNow.mode === 'tab' && bindNow.boundTabId && bindNow.boundTabId !== state.targetTabId) {
          throw new Error('Bound tab changed during execution');
        }

        _emit({ kind: 'step_start', runId: state.runId, index: i, step });

        // Resolve placeholders in selectors/text
        const resolved = Object.assign({}, step, {
          selector: DMS_Utils.resolvePlaceholders(step.selector, state.variables),
          text: DMS_Utils.resolvePlaceholders(step.text, state.variables),
          value: DMS_Utils.resolvePlaceholders(step.value, state.variables)
        });

        let result = null;
        const stepStart = Date.now();
        try {
          if (step.type === 'wait' && step.waitType === 'time') {
            await DMS_Utils.sleep(parseInt(resolved.value, 10) || 1000);
            result = { ok: true };
          } else if (step.type === 'navigate') {
            await DMS_Browser.tabs.update(state.targetTabId, { url: resolved.value || resolved.url });
            await DMS_Utils.sleep(parseInt(resolved.waitAfter, 10) || 1500);
            await _ensureContentReady(state.targetTabId);
            result = { ok: true };
          } else if (step.type === 'switchTab') {
            result = await _switchTab(resolved);
          } else {
            const execNow = cfgNow.exec || cfg.exec || {};
            const speed = (options && typeof options.speedMs === 'number') ? options.speedMs : (execNow.speedMs || 500);
            const animateMouse = (options && options.animateMouse != null)
              ? !!options.animateMouse
              : execNow.animateMouse !== false;
            result = await DMS_Utils.withTimeout(
              DMS_Browser.tabs.sendMessage(state.targetTabId, {
                type: 'dms_run_step',
                step: resolved,
                variables: state.variables,
                debug: (options && options.debug !== undefined) ? options.debug : !!execNow.debugMode,
                highlight: execNow.highlightSelectors !== false,
                speedMs: speed,
                animateMouse: animateMouse
              }),
              30000,
              'Step ' + (i + 1) + ' timeout'
            );
            if (result && result.pauseRequired) {
              state.status = 'paused';
              _emit({
                kind: 'paused',
                runId: state.runId,
                reason: result.error || 'Element not found — open the correct page/tab, then click Resume',
                stepIndex: i,
                step,
                waitingForUser: true
              });
              DMS_Logger.warn('Macro paused at step ' + (i + 1) + ': ' + (result.error || 'missing selector'));
              while (state.status === 'paused') {
                await DMS_Utils.sleep(150);
                if (state.status === 'stopping') break;
              }
              if (state.status === 'stopping') break;
              _emit({ kind: 'resumed', runId: state.runId, stepIndex: i });
              state.status = 'running';
              i -= 1;
              continue;
            }
            if (result && result.variables) {
              Object.assign(state.variables, result.variables);
            }
            if (result && result.captureRequest) {
              try {
                const saved = await _saveScreenshotCapture(
                  state.targetTabId,
                  result.captureRequest,
                  (state.workflow && state.workflow.name) || 'macro'
                );
                result.screenshotSaved = saved;
                _emit({ kind: 'screenshot_saved', runId: state.runId, index: i, saved: saved });
              } catch (ssErr) {
                DMS_Logger.warn('Screenshot upload failed: ' + ssErr.message);
                result.screenshotError = ssErr.message;
              }
            }
            if (result && result.error) throw new Error(result.error);
          }

          const dt = Date.now() - stepStart;
          state.log.push({ index: i, type: step.type, ok: true, ms: dt, ts: DMS_Utils.nowISO() });
          _emit({ kind: 'step_done', runId: state.runId, index: i, step, ms: dt, result });

          const pace = (options && typeof options.speedMs === 'number') ? options.speedMs : ((cfgNow.exec || cfg.exec || {}).speedMs || 500);
          if (pace > 0) await DMS_Utils.sleep(pace);
        } catch (err) {
          const dt = Date.now() - stepStart;
          state.log.push({ index: i, type: step.type, ok: false, ms: dt, error: err.message, ts: DMS_Utils.nowISO() });
          _emit({ kind: 'step_error', runId: state.runId, index: i, step, error: err.message });
          DMS_Logger.error('Step ' + (i + 1) + ' (' + step.type + ') failed: ' + err.message);
          const stopOnErr = (options && options.stopOnError !== undefined)
            ? options.stopOnError
            : ((cfgNow.exec || cfg.exec || {}).stopOnError !== false);
          if (stopOnErr) {
            state.status = 'stopping';
            throw err;
          }
        }
      }

      if (state.status === 'stopping') break;
      }

      const finalStatus = state.status === 'stopping' ? 'stopped' : 'done';
      state.status = 'idle';
      _emit({ kind: 'finished', runId: state.runId, status: finalStatus, variables: state.variables, log: state.log });
      DMS_Logger.info('Macro finished: ' + finalStatus);

      await _logUsageToSheets({
        runId: state.runId,
        workflowName: workflow.name || 'Untitled',
        startedAt: state.startedAt,
        finishedAt: DMS_Utils.nowISO(),
        status: finalStatus,
        stepCount: workflow.steps.length,
        successCount: state.log.filter(l => l.ok).length,
        failureCount: state.log.filter(l => !l.ok).length
      });

      return { status: finalStatus, runId: state.runId, variables: state.variables, log: state.log };
    } catch (err) {
      state.status = 'idle';
      _emit({ kind: 'finished', runId: state.runId, status: 'error', error: err.message, log: state.log });
      DMS_Logger.error('Macro errored: ' + err.message);
      await _logUsageToSheets({
        runId: state.runId,
        workflowName: workflow.name || 'Untitled',
        startedAt: state.startedAt,
        finishedAt: DMS_Utils.nowISO(),
        status: 'error',
        stepCount: workflow.steps.length,
        successCount: state.log.filter(l => l.ok).length,
        failureCount: state.log.filter(l => !l.ok).length,
        error: err.message
      });
      throw err;
    }
  }

  function pause() {
    if (state.status !== 'running') return false;
    state.status = 'paused';
    _emit({ kind: 'paused', runId: state.runId });
    return true;
  }

  function resume() {
    if (state.status !== 'paused') return false;
    state.status = 'running';
    _emit({ kind: 'resumed', runId: state.runId });
    return true;
  }

  function stop() {
    if (state.status === 'idle') return false;
    state.status = 'stopping';
    _emit({ kind: 'stopping', runId: state.runId });
    // Also push a kill message to the content script so any in-flight step bails out
    if (state.targetTabId) {
      DMS_Browser.tabs.sendMessage(state.targetTabId, { type: 'dms_stop' }).catch(() => {});
    }
    return true;
  }

  function isRunning() { return state.status !== 'idle'; }
  function snapshot() { return DMS_Utils.clone(state); }

  return { run, pause, resume, stop, on, isRunning, snapshot, VALID_STEP_TYPES };
})();

if (typeof self !== 'undefined') self.DMS_MacroEngine = DMS_MacroEngine;
