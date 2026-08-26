// sidebar/core/ingest-engine.js — universal attachment ingestion for DANMAN.
// Runs in the sidebar (extension page) context: DecompressionStream, pdf.js,
// and cross-origin fetch (host_permissions) are all available here, and it
// keeps multi-MB payloads out of runtime.sendMessage.
//
// Capabilities:
//   • ZIP: full central-directory walk, DEFLATE via native DecompressionStream,
//     RECURSIVE — zips inside zips are walked too. Produces a folder tree and
//     per-entry extracted text.
//   • Audio: transcription to { json, md } via OpenAI Whisper (verbose_json,
//     segments) with Gemini inline-audio fallback when only that key exists.
//   • PDF: text layer via the bundled pdf.js.
//   • docx/xlsx: unzipped (they are zips) and their XML text extracted.
//   • Text/code/data files: read directly (UTF-8).
//   • Images: flagged for the OCR tab (no silent base64 dumps into chat).
//
// Public surface: window.DMS_Ingest = { ingestFile, summarizeForChat, fileKind }
(function () {
  'use strict';

  var TEXT_EXT = /\.(txt|md|markdown|json|jsonl|csv|tsv|log|xml|html?|css|js|mjs|cjs|ts|tsx|jsx|gs|py|rb|go|rs|java|c|h|cpp|hpp|cs|php|sql|sh|bash|bat|cmd|ps1|psm1|yml|yaml|toml|ini|cfg|conf|env|gitignore|properties|gradle|svg|vtt|srt)$/i;
  var AUDIO_EXT = /\.(mp3|wav|m4a|mp4a|ogg|oga|opus|webm|flac|aac|wma|aiff?)$/i;
  var IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|tiff?|ico|heic)$/i;
  var ZIP_EXT = /\.(zip|xpi|crx|jar|docx|xlsx|pptx|odt|ods)$/i;
  var PDF_EXT = /\.pdf$/i;

  var MAX_TEXT_PER_FILE = 60000;      // chars kept per extracted file
  var MAX_AUDIO_BYTES = 24 * 1024 * 1024; // Whisper hard limit is 25 MB
  var MAX_AUTO_TRANSCRIBE_IN_ZIP = 3; // audio files auto-transcribed per zip
  var MAX_ZIP_DEPTH = 4;              // nested-zip recursion guard
  var MAX_ZIP_ENTRIES = 500;          // runaway guard

  function fileKind(name, mime) {
    var n = String(name || '');
    var m = String(mime || '');
    if (ZIP_EXT.test(n) || /zip|compressed/.test(m)) return 'zip';
    if (AUDIO_EXT.test(n) || m.indexOf('audio/') === 0) return 'audio';
    if (IMAGE_EXT.test(n) || m.indexOf('image/') === 0) return 'image';
    if (PDF_EXT.test(n) || m === 'application/pdf') return 'pdf';
    if (TEXT_EXT.test(n) || m.indexOf('text/') === 0 || /json|xml|javascript/.test(m)) return 'text';
    return 'binary';
  }

  // ── binary helpers ────────────────────────────────────────────────────────
  function u8ToBase64(bytes) {
    var CHUNK = 0x8000;
    var parts = [];
    for (var i = 0; i < bytes.length; i += CHUNK) {
      parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK)));
    }
    return btoa(parts.join(''));
  }

  function decodeUtf8(bytes) {
    try { return new TextDecoder('utf-8', { fatal: false }).decode(bytes); }
    catch (_) { return ''; }
  }

  async function inflateRaw(bytes) {
    var ds = new DecompressionStream('deflate-raw');
    var stream = new Blob([bytes]).stream().pipeThrough(ds);
    var buf = await new Response(stream).arrayBuffer();
    return new Uint8Array(buf);
  }

  // ── ZIP central-directory walker ─────────────────────────────────────────
  function findEocd(view) {
    // EOCD signature 0x06054b50, within the last 64KB + 22 bytes
    var len = view.byteLength;
    var min = Math.max(0, len - 65558);
    for (var i = len - 22; i >= min; i--) {
      if (view.getUint32(i, true) === 0x06054b50) return i;
    }
    return -1;
  }

  async function readZipEntries(bytes) {
    var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var eocd = findEocd(view);
    if (eocd < 0) throw new Error('Not a ZIP file (no end-of-central-directory)');
    var count = view.getUint16(eocd + 10, true);
    var cdOffset = view.getUint32(eocd + 16, true);
    var entries = [];
    var p = cdOffset;
    for (var i = 0; i < count && i < MAX_ZIP_ENTRIES; i++) {
      if (view.getUint32(p, true) !== 0x02014b50) break;
      var method = view.getUint16(p + 10, true);
      var compSize = view.getUint32(p + 20, true);
      var rawSize = view.getUint32(p + 24, true);
      var nameLen = view.getUint16(p + 28, true);
      var extraLen = view.getUint16(p + 30, true);
      var commentLen = view.getUint16(p + 32, true);
      var localOffset = view.getUint32(p + 42, true);
      var name = decodeUtf8(bytes.subarray(p + 46, p + 46 + nameLen));
      entries.push({ name: name, method: method, compSize: compSize, rawSize: rawSize, localOffset: localOffset });
      p += 46 + nameLen + extraLen + commentLen;
    }
    // Resolve each entry's data via its LOCAL header (its name/extra lengths differ)
    for (var j = 0; j < entries.length; j++) {
      var e = entries[j];
      var lp = e.localOffset;
      if (view.getUint32(lp, true) !== 0x04034b50) { e.error = 'bad local header'; continue; }
      var lNameLen = view.getUint16(lp + 26, true);
      var lExtraLen = view.getUint16(lp + 28, true);
      e.dataStart = lp + 30 + lNameLen + lExtraLen;
    }
    return entries;
  }

  async function readZipEntryData(bytes, entry) {
    if (entry.error) throw new Error(entry.error);
    var raw = bytes.subarray(entry.dataStart, entry.dataStart + entry.compSize);
    if (entry.method === 0) return raw.slice();
    if (entry.method === 8) return inflateRaw(raw);
    throw new Error('Unsupported compression method ' + entry.method);
  }

  function buildTreeText(paths) {
    // paths: array of 'a/b/c.txt' → ascii tree
    var root = {};
    paths.forEach(function (p) {
      var parts = p.split('/').filter(Boolean);
      var node = root;
      parts.forEach(function (part, i) {
        node[part] = node[part] || (i === parts.length - 1 && !p.endsWith('/') ? null : {});
        if (node[part] !== null) node = node[part];
      });
    });
    var lines = [];
    (function walk(node, prefix) {
      var keys = Object.keys(node).sort(function (a, b) {
        var da = node[a] !== null, db = node[b] !== null;
        if (da !== db) return da ? -1 : 1; // dirs first
        return a.localeCompare(b);
      });
      keys.forEach(function (k, i) {
        var last = i === keys.length - 1;
        lines.push(prefix + (last ? '└─ ' : '├─ ') + k + (node[k] !== null ? '/' : ''));
        if (node[k] !== null) walk(node[k], prefix + (last ? '   ' : '│  '));
      });
    })(root, '');
    return lines.join('\n');
  }

  // ── Office XML text extraction (docx/xlsx are zips) ──────────────────────
  function stripXmlText(xml) {
    return String(xml || '')
      .replace(/<w:p[ >]/g, '\n<w:p ')       // docx paragraphs → newlines
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s+/g, '\n')
      .trim();
  }

  // ── Audio transcription ──────────────────────────────────────────────────
  async function loadConfig() {
    try { return await window.sendToBackground('CONFIG_LOAD', {}); }
    catch (_) { return {}; }
  }

  async function transcribeWhisper(bytes, name, mime, apiKey) {
    var fd = new FormData();
    fd.append('file', new File([bytes], name || 'audio', { type: mime || 'application/octet-stream' }));
    fd.append('model', 'whisper-1');
    fd.append('response_format', 'verbose_json');
    var resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey },
      body: fd
    });
    var data = await resp.json();
    if (!resp.ok) throw new Error(data.error && data.error.message || ('Whisper HTTP ' + resp.status));
    return {
      provider: 'openai-whisper',
      language: data.language || '',
      duration: data.duration || null,
      text: data.text || '',
      segments: (data.segments || []).map(function (s) {
        return { start: s.start, end: s.end, text: (s.text || '').trim() };
      })
    };
  }

  async function transcribeGemini(bytes, name, mime, apiKey, model) {
    var body = {
      contents: [{
        parts: [
          { text: 'Transcribe this audio precisely. Respond with ONLY a JSON object: {"language":"...","text":"full transcript","segments":[{"start":seconds,"end":seconds,"text":"..."}]}' },
          { inline_data: { mime_type: mime || 'audio/mpeg', data: u8ToBase64(bytes) } }
        ]
      }]
    };
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + (model || 'gemini-2.5-flash') + ':generateContent?key=' + encodeURIComponent(apiKey);
    var resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    var data = await resp.json();
    if (!resp.ok) throw new Error(data.error && data.error.message || ('Gemini HTTP ' + resp.status));
    var text = '';
    try { text = data.candidates[0].content.parts.map(function (p) { return p.text || ''; }).join(''); } catch (_) {}
    var parsed = null;
    try { parsed = JSON.parse(text.replace(/^```(json)?/m, '').replace(/```\s*$/m, '').trim()); } catch (_) {}
    if (parsed && parsed.text) {
      return { provider: 'gemini', language: parsed.language || '', duration: null, text: parsed.text, segments: parsed.segments || [] };
    }
    return { provider: 'gemini', language: '', duration: null, text: text, segments: [] };
  }

  function fmtTs(sec) {
    if (sec == null) return '';
    var s = Math.max(0, Math.round(Number(sec)));
    var m = Math.floor(s / 60);
    return m + ':' + String(s % 60).padStart(2, '0');
  }

  function transcriptToMd(name, t) {
    var md = '# Transcript — ' + name + '\n\n';
    md += '- **Provider:** ' + t.provider + '\n';
    if (t.language) md += '- **Language:** ' + t.language + '\n';
    if (t.duration) md += '- **Duration:** ' + fmtTs(t.duration) + '\n';
    md += '\n## Full text\n\n' + (t.text || '(empty)') + '\n';
    if (t.segments && t.segments.length) {
      md += '\n## Segments\n\n| Start | End | Text |\n|---|---|---|\n';
      t.segments.forEach(function (s) {
        md += '| ' + fmtTs(s.start) + ' | ' + fmtTs(s.end) + ' | ' + String(s.text || '').replace(/\|/g, '\\|') + ' |\n';
      });
    }
    return md;
  }

  async function transcribeAudio(bytes, name, mime) {
    if (bytes.length > MAX_AUDIO_BYTES) {
      throw new Error('Audio is ' + Math.round(bytes.length / 1048576) + ' MB — over the 24 MB transcription limit. Split it first.');
    }
    var cfg = await loadConfig();
    var keys = cfg.api_keys || {};
    var t;
    if (keys.openai) {
      t = await transcribeWhisper(bytes, name, mime, keys.openai);
    } else if (keys.gemini) {
      t = await transcribeGemini(bytes, name, mime, keys.gemini, (cfg.ai_models || {}).gemini);
    } else {
      throw new Error('No OpenAI or Gemini API key configured (Settings → AI Provider) — needed for audio transcription.');
    }
    return { json: t, md: transcriptToMd(name, t) };
  }

  // ── PDF text extraction (bundled pdf.js) ─────────────────────────────────
  async function extractPdfText(bytes) {
    var lib = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
    if (!lib) throw new Error('pdf.js not loaded in this context');
    if (lib.GlobalWorkerOptions && !lib.GlobalWorkerOptions.workerSrc) {
      lib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.min.js');
    }
    var doc = await lib.getDocument({ data: bytes.slice() }).promise;
    var out = [];
    for (var i = 1; i <= doc.numPages; i++) {
      var page = await doc.getPage(i);
      var tc = await page.getTextContent();
      out.push(tc.items.map(function (it) { return it.str; }).join(' '));
      if (out.join('\n').length > MAX_TEXT_PER_FILE) break;
    }
    return out.join('\n\n');
  }

  // ── Core: ingest one File/bytes → IngestRecord ───────────────────────────
  // IngestRecord: { name, path, kind, size, text, json, md, tree, children[], error }
  async function ingestBytes(bytes, name, mime, opts, depth) {
    opts = opts || {};
    var kind = fileKind(name, mime);
    var rec = { name: name, path: opts.path || name, kind: kind, size: bytes.length, text: '', json: null, md: '', tree: '', children: [], error: '' };

    try {
      if (kind === 'text') {
        rec.text = decodeUtf8(bytes).slice(0, MAX_TEXT_PER_FILE);
      } else if (kind === 'pdf') {
        rec.text = (await extractPdfText(bytes)).slice(0, MAX_TEXT_PER_FILE);
      } else if (kind === 'audio') {
        if (opts.skipAudio) {
          rec.error = 'audio transcription skipped (limit reached in this zip — transcribe individually)';
        } else {
          var tr = await transcribeAudio(bytes, name, mime);
          rec.json = tr.json;
          rec.md = tr.md;
          rec.text = tr.json.text || '';
        }
      } else if (kind === 'zip') {
        if (depth >= MAX_ZIP_DEPTH) {
          rec.error = 'max zip nesting depth reached';
        } else {
          await ingestZipInto(rec, bytes, opts, depth);
        }
      } else if (kind === 'image') {
        rec.text = '[Image: ' + name + ', ' + bytes.length + ' bytes — run it through the OCR tab for text extraction]';
      } else {
        rec.text = '[Binary file: ' + name + ', ' + bytes.length + ' bytes]';
      }
    } catch (e) {
      rec.error = e.message || String(e);
    }
    return rec;
  }

  async function ingestZipInto(rec, bytes, opts, depth) {
    var entries = await readZipEntries(bytes);
    var isOffice = /\.(docx|xlsx|pptx|odt|ods)$/i.test(rec.name);
    var paths = entries.map(function (e) { return e.name; });
    rec.tree = buildTreeText(paths);
    var audioBudget = MAX_AUTO_TRANSCRIBE_IN_ZIP;

    if (isOffice) {
      // Pull the main document XML(s) instead of walking everything
      var wanted = entries.filter(function (e) {
        return /word\/document\.xml$|xl\/sharedStrings\.xml$|ppt\/slides\/slide\d+\.xml$|content\.xml$/.test(e.name);
      });
      var texts = [];
      for (var w = 0; w < wanted.length; w++) {
        try {
          var xmlBytes = await readZipEntryData(bytes, wanted[w]);
          texts.push(stripXmlText(decodeUtf8(xmlBytes)));
        } catch (e) { /* skip broken part */ }
      }
      rec.text = texts.join('\n\n').slice(0, MAX_TEXT_PER_FILE);
      return;
    }

    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (!e.name || e.name.endsWith('/')) continue; // directory entry
      var childKind = fileKind(e.name, '');
      // Only decompress what we can use — skip big binaries
      if (childKind === 'binary' && e.rawSize > 64 * 1024) {
        rec.children.push({ name: e.name, path: rec.path + '/' + e.name, kind: 'binary', size: e.rawSize, text: '', error: '' });
        continue;
      }
      try {
        var data = await readZipEntryData(bytes, e);
        var childOpts = { path: rec.path + '/' + e.name, skipAudio: childKind === 'audio' && audioBudget <= 0 };
        if (childKind === 'audio' && audioBudget > 0) audioBudget--;
        var child = await ingestBytes(data, e.name, '', childOpts, depth + 1);
        rec.children.push(child);
      } catch (err) {
        rec.children.push({ name: e.name, path: rec.path + '/' + e.name, kind: childKind, size: e.rawSize, text: '', error: err.message || String(err) });
      }
    }
  }

  async function ingestFile(file, opts) {
    var buf = await file.arrayBuffer();
    return ingestBytes(new Uint8Array(buf), file.name, file.type, opts || {}, 0);
  }

  // ── Chat summarization: records → one context string ─────────────────────
  function flatten(rec, out) {
    out.push(rec);
    (rec.children || []).forEach(function (c) { flatten(c, out); });
    return out;
  }

  function summarizeForChat(records, maxChars) {
    maxChars = maxChars || 60000;
    var blocks = [];
    records.forEach(function (rec) {
      var head = '=== ' + rec.name + ' (' + rec.kind + ', ' + rec.size + ' bytes) ===';
      if (rec.kind === 'zip') {
        blocks.push(head + '\nFOLDER STRUCTURE:\n' + rec.tree);
        flatten(rec, []).forEach(function (r) {
          if (r === rec) return;
          if (r.error) blocks.push('-- ' + r.path + ': [' + r.error + ']');
          else if (r.text && r.kind !== 'binary') blocks.push('-- ' + r.path + ' --\n' + r.text);
        });
      } else {
        var body = rec.error ? '[' + rec.error + ']' : (rec.md || rec.text || '(no text)');
        blocks.push(head + '\n' + body);
      }
    });
    var joined = blocks.join('\n\n');
    if (joined.length > maxChars) {
      joined = joined.slice(0, maxChars) + '\n…[attachment context truncated at ' + maxChars + ' chars]';
    }
    return joined;
  }

  window.DMS_Ingest = {
    ingestFile: ingestFile,
    summarizeForChat: summarizeForChat,
    fileKind: fileKind,
    flatten: function (rec) { return flatten(rec, []); }
  };
})();
