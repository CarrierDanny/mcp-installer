// background/ocr-engine.js — Ported verbatim from DANMAN_Macro_Studio v6.7.0
// Bridges to v5 via core/dms-adapters.js (DMS_Config/Logger/WindowBinder).
// background/ocr-engine.js — DANMAN Macro Studio
// AI-Vision OCR pipeline. Page-image rendering happens in the sidebar
// (using bundled pdf.js); this module talks to the AI bridge and
// performs entity extraction on the recognized text.
//
// Why vision-AI instead of Tesseract: extension sandboxes make running
// Tesseract WASM expensive, and modern vision LLMs (Claude/GPT-4o/Gemini)
// produce dramatically better text on noisy scans / handwriting / multi-
// column layouts than Tesseract. We keep the door open for a Tesseract
// fallback by accepting pre-OCR'd text.
//
// Public API (self.DMS_OCREngine):
//   run({ pages, sourceName, language, intent, model })
//     pages: [{ index, dataUrl }]  base64 image data URLs (PNG/JPEG)
//     -> { id, sourceName, pages: [{index, text, source}], fullText, entities, model }
//   extractEntities(text) -> { emails, phones, dates, urls, amounts, invoiceNumbers, lineItems }
//
// File: DANMAN_Macro_StudioV001r000

const DMS_OCREngine = (function () {

  // ---------- Entity extraction (regex pipeline ported from PDFParserOCRTool) ----------
  function extractEntities(text) {
    if (!text) return _empty();
    const t = String(text);

    const emails = _uniq(t.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []);

    const phones = _uniq((t.match(
      // North American + international phone patterns
      /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3,4}[-.\s]?\d{4}/g
    ) || []).filter(s => s.replace(/\D/g, '').length >= 10));

    const dates = _uniq((t.match(
      // 12/31/2024  |  2024-12-31  |  Jan 5, 2024  |  5 January 2024
      /\b(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{2,4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{2,4})\b/gi
    ) || []));

    const urls = _uniq(t.match(/https?:\/\/[^\s)>\]]+/gi) || []);

    const amounts = _uniq(t.match(/(?:USD\s*|\$|CAD\s*|EUR\s*|€|£)\s?\d{1,3}(?:[,]\d{3})*(?:\.\d{1,2})?|\b\d{1,3}(?:,\d{3})+(?:\.\d{2})\b/gi) || []);

    // Invoice / PO / order numbers — require a separator block between keyword and
    // the captured value so we don't match the "PO" inside "Portal".
    // The separator can be any mix of '#', ':', '.', 'No', 'Number', and spaces.
    const invRegex = /\b(?:Invoice|Inv\.?|INV|P\.?O\.?|Order|Bill|Reference|Ref\.?|Quote|Receipt)\b[^\w\r\n]*(?:(?:#|No\.?|Number)[^\w\r\n]*)?([A-Z][A-Z0-9]{1,3}[-\/_][A-Z0-9][A-Z0-9\-\/_]+|[A-Z]{2,}\d+[A-Z0-9\-\/_]*|\d{4,}[A-Z0-9\-\/_]*)/gi;
    const invoiceNumbers = [];
    let invMatch;
    while ((invMatch = invRegex.exec(t)) !== null) {
      if (invMatch[1]) invoiceNumbers.push(invMatch[1].trim());
    }
    const invoiceNumbersUniq = _uniq(invoiceNumbers);

    const totals = _uniq(t.match(/(?:Total|Grand\s+Total|Amount\s+Due|Balance\s+Due|Subtotal|Tax|GST|HST|VAT)\s*[:\-]?\s*(?:USD\s*|\$|CAD\s*|EUR\s*|€|£)?\s*[\d,]+\.\d{2}/gi) || []);

    // Naive line-item detection (tables): rows that look like "QTY DESC ... $99.99"
    const lineItems = (t.split(/\r?\n/).filter(l => /\$\s?\d/.test(l) && /\b\d+\b/.test(l)).slice(0, 50));

    return { emails, phones, dates, urls, amounts, invoiceNumbers: invoiceNumbersUniq, totals, lineItems };
  }

  function _empty() {
    return { emails: [], phones: [], dates: [], urls: [], amounts: [], invoiceNumbers: [], totals: [], lineItems: [] };
  }

  function _uniq(arr) {
    const seen = new Set();
    const out = [];
    for (const x of arr) {
      const k = String(x).trim();
      if (!k || seen.has(k.toLowerCase())) continue;
      seen.add(k.toLowerCase());
      out.push(k);
    }
    return out;
  }

  // ---------- Vision OCR via AI bridge ----------
  // Anthropic Claude prefers {type:'image', source:{type:'base64', media_type, data}}
  // OpenAI prefers {type:'image_url', image_url:{url:'data:...'}}
  // We build for Anthropic by default and the Gemini path auto-converts.
  // If the user is on OpenAI, the OpenAI direct call also accepts that same `image_url` shape — we use OpenAI form when model starts with gpt.
  function _buildVisionMessage(dataUrl, prompt, modelFamily) {
    if (modelFamily === 'gpt' || modelFamily === 'openai') {
      return {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: dataUrl } }
        ]
      };
    }
    // Default: Anthropic shape (also handled by Gemini path conversion)
    const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) throw new Error('Image must be a base64 data URL');
    return {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } }
      ]
    };
  }

  function _detectFamily(model) {
    const lc = (model || '').toLowerCase();
    if (lc.startsWith('gpt'))    return 'gpt';
    if (lc.startsWith('gemini')) return 'gemini';
    return 'claude';
  }

  async function _ocrPage(dataUrl, opts) {
    // v5 port: replaces v6.7's vision-bridge call with a direct call into v5's
    // AIClient.chat(). Key adaptations:
    //   - read API key from DMS_Config (which sources v5 'config' storage)
    //   - map v6.7 family strings (gpt|gemini|claude) -> v5 provider names
    //     (openai|gemini|claude). v5 calls them differently.
    //   - v5's AIClient.chat() returns { content, ... }, not { text, ... }.
    //   - v5's Gemini path does parts:[{text: msg.content}], so a multi-part
    //     vision message would be serialized as "[object Object]". Vision via
    //     Gemini is not wired in v5 yet; surface a clear error rather than
    //     silently mangling the request.
    const cfg = await DMS_Config.load();
    let modelName = (opts && opts.model) || cfg.ai.defaultModel || 'claude-sonnet-4-6';
    if (typeof resolveModelId === 'function') {
      modelName = resolveModelId('claude', modelName);
    }
    const family = _detectFamily(modelName);

    const v5Provider =
      family === 'gpt'    ? 'openai' :
      family === 'gemini' ? 'gemini' :
                            'claude';

    if (v5Provider === 'gemini') {
      throw new Error('OCR via Gemini is not wired in v5 yet — pick a Claude or GPT model');
    }

    const apiKey =
      v5Provider === 'claude' ? cfg.ai.anthropicKey :
      v5Provider === 'openai' ? cfg.ai.openaiKey : '';
    if (!apiKey) throw new Error('No API key for ' + v5Provider + ' — open Settings');

    const prompt = opts.prompt || [
      'You are an expert OCR engine. Extract EVERY visible character from this page image,',
      'preserving line breaks and reading order. Do not summarize, do not commentate.',
      'Return ONLY the extracted text. If a column or table is present, preserve its structure',
      'using two-space columns. If text is illegible, write [illegible].'
    ].join(' ');
    const msg = _buildVisionMessage(dataUrl, prompt, family);

    const res = await AIClient.chat([msg], {
      provider: v5Provider,
      model: modelName,
      apiKey,
      maxTokens: 4096
    });
    return { text: (typeof res === 'string' ? res : (res && res.content)) || '', model: res && res.model, source: 'vision-ai' };
  }

  async function run(opts) {
    opts = opts || {};
    const pages = Array.isArray(opts.pages) ? opts.pages : [];
    if (!pages.length) throw new Error('No pages to OCR — pass { pages: [{ index, dataUrl }] }');

    // Fail-fast on Gemini: _ocrPage's per-page throw would otherwise fire N
    // times on a multi-page document, spamming errors[] and logs. Use the same
    // model resolution + family detection as _ocrPage so the two stay in sync.
    // The inner throw in _ocrPage is kept as defense-in-depth for any caller
    // that bypasses run().
    const _cfgForCheck = await DMS_Config.load();
    const _modelForCheck = (opts && opts.model) || _cfgForCheck.ai.defaultModel || '';
    if (_detectFamily(_modelForCheck) === 'gemini') {
      throw new Error('OCR via Gemini is not wired in v5 yet — pick a Claude or GPT model');
    }

    const id = 'ocr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const outPages = [];
    const errors = [];

    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      try {
        const r = await _ocrPage(p.dataUrl, opts);
        outPages.push({ index: p.index != null ? p.index : i, text: r.text, source: r.source, model: r.model });
        DMS_Logger.info('OCR page ' + (i + 1) + '/' + pages.length + ': ' + (r.text || '').length + ' chars');
      } catch (e) {
        DMS_Logger.error('OCR page ' + i + ' failed: ' + e.message);
        outPages.push({ index: p.index != null ? p.index : i, text: '', error: e.message });
        errors.push({ index: i, error: e.message });
      }
    }

    const fullText = outPages.map(p => p.text || '').join('\n\n');
    const entities = extractEntities(fullText);

    return {
      id,
      sourceName: opts.sourceName || ('document_' + Date.now()),
      pages: outPages,
      fullText,
      entities,
      errors,
      model: opts.model || 'claude-sonnet-4-6',
      createdAt: new Date().toISOString()
    };
  }

  return { run, extractEntities };
})();

if (typeof self !== 'undefined') self.DMS_OCREngine = DMS_OCREngine;
if (typeof module !== 'undefined') module.exports = DMS_OCREngine;
