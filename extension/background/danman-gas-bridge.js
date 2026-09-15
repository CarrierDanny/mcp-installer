/**
 * VERSION: V002R009
 * DATE: 2026-09-15
 * CHANGE: Webhook URL policy + redirect host check on webhookCall
 * HISTORY:
 *   V001R330 2026-08-26 Baseline import + Firefox messaging/clipboard fixes (unstamped)
 */
// background/danman-gas-bridge.js — Routes danman-popout.html google.script.run calls to extension APIs
(function () {
  'use strict';

  const PROP_PREFIX = 'danman_prop_';

  async function logGas(method, detail) {
    try {
      if (typeof logToWebhook === 'function') {
        await logToWebhook('danman_gas', { method, ...detail });
      }
    } catch (_) {}
    try {
      if (typeof Logger !== 'undefined' && Logger.log) {
        await Logger.log('DANMAN_GAS', method + (detail.error ? ' ERR: ' + detail.error : ''));
      }
    } catch (_) {}
  }

  async function gasUserPropsGet(keys) {
    const storageKeys = (keys || []).map((k) => PROP_PREFIX + k);
    const r = await chrome.storage.local.get(storageKeys);
    const out = {};
    (keys || []).forEach((k) => { out[k] = r[PROP_PREFIX + k]; });
    return out;
  }

  async function gasUserPropsSet(key, val) {
    await chrome.storage.local.set({ [PROP_PREFIX + key]: val });
    return true;
  }

  async function gasUserPropsClear(keys) {
    const remove = (keys || []).map((k) => PROP_PREFIX + k);
    await chrome.storage.local.remove(remove);
    return true;
  }

  function normalizeWebhookUrl(url) {
    if (!url) return '';
    try {
      const u = new URL(String(url).trim());
      u.search = '';
      u.hash = '';
      return u.toString();
    } catch (_) {
      return String(url).split('?')[0].trim();
    }
  }

  function parseGasWebhookError(text, status) {
    const snippet = String(text || '').slice(0, 2000);
    const lower = snippet.toLowerCase();
    if (/session expired|sign in|accounts\.google\.com|serviceLogin|authorization required/i.test(lower)) {
      return 'Google Apps Script session expired or auth required. Redeploy the Web App (Execute as: Me, Anyone with the link), confirm the webhook URL has no extra ?query params, and run push.bat to deploy the latest CellsForce code.';
    }
    if (snippet.trim().startsWith('<!DOCTYPE') || snippet.trim().startsWith('<html')) {
      return 'Webhook returned HTML instead of JSON (often a timeout or auth redirect). Try a smaller Workbench result, or use Preview parse then import fewer rows.';
    }
    if (status && status >= 400) {
      return 'Webhook HTTP ' + status + ': ' + snippet.slice(0, 280);
    }
    return snippet.slice(0, 500) || 'Unknown webhook error';
  }

  async function webhookCall(action, extra) {
    const config = await ConfigManager.load();
    const webhookUrl = normalizeWebhookUrl(config.sheets?.webhook_url);
    const secret = config.sheets?.webhook_secret || '';
    if (!webhookUrl) throw new Error('Sheets webhook URL not configured (Settings → Integrations)');
    if (typeof DANMAN_Security !== 'undefined') DANMAN_Security.assertWebhookUrl(webhookUrl, 'Sheets webhook URL');
    const body = {
      secret,
      action,
      spreadsheetId: config.sheets?.spreadsheet_id || '',
      ...(extra || {})
    };
    await logGas(action, { phase: 'request' });

    const timeoutMs = action === 'importWorkbenchResultsToNewSheet' ? 180000 : 90000;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    let resp;
    let text;
    try {
      resp = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        redirect: 'follow',
        signal: controller ? controller.signal : undefined
      });
      if (typeof DANMAN_Security !== 'undefined') DANMAN_Security.assertResponseHost(resp, webhookUrl);
      text = await resp.text();
    } catch (e) {
      if (timer) clearTimeout(timer);
      const msg = e && e.name === 'AbortError'
        ? 'Import timed out after ' + Math.round(timeoutMs / 1000) + 's. The sheet may still have been created — refresh the spreadsheet and look for a WB_ tab.'
        : (e.message || String(e));
      throw new Error(msg);
    }
    if (timer) clearTimeout(timer);

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = { success: false, error: parseGasWebhookError(text, resp.status) };
    }
    if (!resp.ok && !data.error) {
      data = { success: false, error: parseGasWebhookError(text, resp.status) };
    }
    await logGas(action, { phase: 'response', ok: !!(data && data.success !== false) });
    return data;
  }

  async function processAttachments(attachments, pdfPageRange) {
    const parts = [];
    const list = Array.isArray(attachments) ? attachments : [];
    for (const att of list) {
      if (!att || !att.base64) continue;
      const name = att.name || 'file';
      const type = att.type || 'application/octet-stream';
      if (att.isImage || (type && type.indexOf('image/') === 0)) {
        parts.push({
          type: 'image',
          name,
          media_type: type,
          data: att.base64
        });
      } else if (type === 'application/pdf') {
        try {
          const dataUrl = 'data:application/pdf;base64,' + att.base64;
          const pages = [{ index: 0, dataUrl }];
          let ocrText = '';
          if (typeof self.DMS_OCREngine !== 'undefined' && self.DMS_OCREngine.run) {
            const ocr = await self.DMS_OCREngine.run({
              pages,
              sourceName: name,
              pdfPageRange: pdfPageRange || null
            });
            ocrText = ocr.fullText || '';
          }
          parts.push({ type: 'text', name, content: '[PDF: ' + name + ']\n' + (ocrText || '(OCR produced no text)') });
        } catch (e) {
          parts.push({ type: 'text', name, content: '[PDF OCR failed: ' + name + '] ' + e.message });
        }
      } else if (type === 'application/zip' || type === 'application/x-zip-compressed' || /\.zip$/i.test(name)) {
        try {
          const zipInfo = await webhookCall('analyze_zip', {
            fileName: name,
            base64: att.base64,
            mimeType: type
          });
          const summary = (zipInfo && (zipInfo.summary || zipInfo.content || zipInfo.text))
            || JSON.stringify(zipInfo).slice(0, 8000);
          parts.push({ type: 'text', name, content: '[ZIP: ' + name + ']\n' + summary });
        } catch (e) {
          parts.push({
            type: 'text',
            name,
            content: '[ZIP: ' + name + ', ' + Math.round((att.base64.length * 3) / 4) + ' bytes] Analyze via webhook failed: ' + e.message
          });
        }
      } else {
        try {
          const decoded = atob(att.base64);
          const snippet = decoded.length > 12000 ? decoded.slice(0, 12000) + '\n…[truncated]' : decoded;
          parts.push({ type: 'text', name, content: '[File: ' + name + ']\n' + snippet });
        } catch (_) {
          parts.push({ type: 'text', name, content: '[Binary attachment: ' + name + ']' });
        }
      }
    }
    return parts;
  }

  async function handleSendMessageToDANMAN(arg) {
    const p = arg || {};
    const message = (p.message || '').trim();
    const history = Array.isArray(p.history) ? p.history : [];
    let sheetBlock = '';
    if (p.includeSheetContext) {
      try {
        const ctx = await webhookCall('getSpreadsheetContext', {});
        sheetBlock = typeof ctx === 'string' ? ctx : (ctx.context || ctx.data || JSON.stringify(ctx)).slice(0, 12000);
      } catch (e) {
        sheetBlock = '(Sheet context unavailable: ' + e.message + ')';
      }
    }
    const attParts = await processAttachments(p.attachments, p.pdfPageRange);
    const messages = [{ role: 'system', content: typeof DANMAN_SYSTEM_PROMPT !== 'undefined' ? DANMAN_SYSTEM_PROMPT : 'You are DANMAN, a helpful assistant.' }];
    if (sheetBlock) {
      messages.push({ role: 'user', content: '[Spreadsheet context]\n' + sheetBlock });
      messages.push({ role: 'assistant', content: 'Sheet context loaded.' });
    }
    history.slice(-20).forEach((h) => {
      if (h && h.role && h.content) messages.push({ role: h.role, content: String(h.content) });
    });
    const userParts = [];
    if (message) userParts.push({ type: 'text', text: message });
    attParts.forEach((part) => {
      if (part.type === 'image') {
        userParts.push({
          type: 'image',
          source: { type: 'base64', media_type: part.media_type, data: part.data }
        });
      } else if (part.content) {
        userParts.push({ type: 'text', text: part.content });
      }
    });
    if (!userParts.length) userParts.push({ type: 'text', text: '(empty message)' });
    const userContent = userParts.length === 1 && userParts[0].type === 'text'
      ? userParts[0].text
      : userParts;
    messages.push({ role: 'user', content: userContent });
    await logGas('sendMessageToDANMAN', { message_len: message.length, attachments: attParts.length });
    const config = await ConfigManager.load();
    const provider = config.ai_provider || 'claude';
    const model = config.ai_models?.[provider] || '';
    const response = await AIClient.chat(messages, {
      provider,
      model,
      max_tokens: config.memory?.max_tokens || 8192
    });
    const text = typeof response === 'string' ? response : (response && response.content) || '';
    const modelUsed = model || config.ai_models?.[provider] || '';
    await logGas('sendMessageToDANMAN', { response_len: text.length });
    return { success: true, content: text, model: modelUsed };
  }

  async function handleDanmanGasProxy(payload) {
    const method = payload && payload.method;
    const args = (payload && payload.args) || [];
    if (!method) return { error: 'Missing GAS method name' };
    try {
      let data;
      switch (method) {
        case 'setUserProperty':
          data = await gasUserPropsSet(args[0], args[1]);
          break;
        case 'getUserProperties':
          data = await gasUserPropsGet(args[0]);
          break;
        case 'clearUserProperties':
          data = await gasUserPropsClear(args[0]);
          break;
        case 'getSpreadsheetContext': {
          const r = await webhookCall('getSpreadsheetContext', args[0] || {});
          data = typeof r === 'string' ? r : (r.context || r.data || r.text || JSON.stringify(r));
          break;
        }
        case 'sendMessageToDANMAN':
          data = await handleSendMessageToDANMAN(args[0]);
          break;
        case 'analyzeAndFillSheetProxy':
          data = await webhookCall('analyzeAndFillSheetProxy', args[0] || {});
          break;
        case 'clearDANMANFillsProxy':
          data = await webhookCall('clearDANMANFillsProxy', {});
          break;
        case 'writeToSheetFromChat':
          data = await webhookCall('writeToSheetFromChat', { payload: args[0] });
          break;
        case 'getSheetColumnsAndValidationsProxy':
          data = await webhookCall('getSheetColumnsAndValidationsProxy', {});
          break;
        case 'bulkFillColumnProxy':
          data = await webhookCall('bulkFillColumnProxy', { rulesJson: args[0] });
          break;
        case 'analyzeRowsForCaseFillerProxy':
          data = await webhookCall('analyzeRowsForCaseFillerProxy', {});
          break;
        case 'insertCaseDataDynamicProxy':
          data = await webhookCall('insertCaseDataDynamicProxy', { rulesJson: args[0] });
          break;
        case 'importWorkbenchResultsToNewSheet': {
          const arg0 = args[0];
          const payload = (arg0 && typeof arg0 === 'object')
            ? arg0
            : { rawText: arg0 || '' };
          data = await webhookCall('importWorkbenchResultsToNewSheet', {
            rawText: payload.rawText || '',
            spreadsheetId: payload.spreadsheetId || '',
            fast: payload.fast !== false
          });
          break;
        }
        default:
          data = await webhookCall(method, args[0] || {});
      }
      return { data };
    } catch (e) {
      await logGas(method, { error: e.message });
      throw e;
    }
  }

  // ── Capability bridge shim ─────────────────────────────────────────────
  // DMS_GpBridge predates the Universal Bridge; it now delegates to
  // BridgeRegistry.call so every consumer (Recall tab, Bridge-RAG chat,
  // attachment save, GP_* routes) transparently works against whichever
  // profile the routing table selects — GrowTelliGence, a kit-patched
  // backend, or anything else.
  const GP = {
    ping: () => BridgeRegistry.call('ping', {}),
    memorySave: async (p) => {
      const r = await BridgeRegistry.call('memory.save', p || {});
      // Local copy in the memory folder's rag/ so everything memory-related
      // lives under the user's chosen Drive folder (best-effort).
      if (p && p.text && globalThis.MemoryManager) {
        MemoryManager.storeArtifact('rag', (p.name || 'memory') + '.md', p.text, 'text/markdown').catch(() => {});
      }
      return r;
    },
    memorySearch: (p) => BridgeRegistry.call('memory.search', p || {}),
    chat: (p) => BridgeRegistry.call('chat', p || {}),
    capture: async (p) => {
      const r = await BridgeRegistry.call('capture', p || {});
      if (p && (p.text || p.html) && globalThis.MemoryManager) {
        const body = '# ' + (p.title || p.url || 'capture') + '\n\n' + (p.url || '') + '\n\n' + (p.text || p.html || '');
        MemoryManager.storeArtifact('rag', 'capture-' + Date.now() + '.md', body.slice(0, 200000), 'text/markdown').catch(() => {});
      }
      return r;
    },
    overview: () => BridgeRegistry.call('memory.overview', {})
  };

  self.DMS_GpBridge = GP;
  self.handleDanmanGasProxy = handleDanmanGasProxy;
})();
