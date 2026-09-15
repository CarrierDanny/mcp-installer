/**
 * VERSION: V002R010
 * DATE: 2026-09-15
 * CHANGE: Comment: BRIDGE_SECRET is required (no legacy-open mode)
 * HISTORY:
 *   V001R422 2026-08-26 Baseline import + Firefox messaging/clipboard fixes (unstamped)
 */
/**
 * =====================================================================
 * Bridge_CopilotWorkbench.gs — DANMAN Bridge tool registry
 * Backend: "Co-Pilot Workbench" GAS project (GAS HostKit + DANMAN
 * Workbench + Memory Vault; the project whose push/ folder contains
 * 02_Code.js, 06_Deploy.js, 07_DANMAN.js, 08_Triage.js,
 * 10_MemoryVault.js).
 * =====================================================================
 *
 * WHAT THIS IS
 * ------------
 * Defines the single global `danmanBridgeTools_()` that DANMAN_Bridge.gs
 * (the dispatcher, shipped separately in this kit) calls lazily to
 * resolve any bridge action other than ping/describe. Each tool wraps an
 * EXISTING public function of this backend — nothing in the backend is
 * modified by this file. All handlers run inside the dispatcher's
 * try/catch, so they throw on backend failure instead of swallowing it.
 *
 * INSTALL (3 steps)
 * -----------------
 * 1. Copy BOTH files into the project (Apps Script editor > + > Script):
 *      - DANMAN_Bridge.gs        (the dispatcher — authored separately)
 *      - Bridge_CopilotWorkbench.gs  (this file)
 *
 * 2. Edit 02_Code.js — function doPost(e), currently at line ~117.
 *    Its body parses the POST at line ~122:
 *        const data = JSON.parse(e.postData.contents);
 *    and at line ~126 routes bodies carrying {action:...} to vaultRoute_.
 *    Insert the bridge intercept IMMEDIATELY AFTER the JSON.parse line
 *    and BEFORE the `if (data && data.action)` vault branch (bridge
 *    bodies also carry `action`, so the intercept must win):
 *
 *        const data = JSON.parse(e.postData.contents);
 *
 *        // DANMAN Bridge intercept (gas-bridge-kit)
 *        if (typeof danmanBridgeIsRequest_ === 'function' && danmanBridgeIsRequest_(data)) {
 *          return ContentService.createTextOutput(JSON.stringify(danmanBridgeHandle_(data)))
 *            .setMimeType(ContentService.MimeType.JSON);
 *        }
 *
 * 3. Set Script Property BRIDGE_SECRET (Project Settings > Script
 *    Properties) to a long random string. The dispatcher rejects bridge
 *    calls that do not present it.
 *
 * SECURITY NOTE — the vaultRoute_ branch is UNAUTHENTICATED
 * ---------------------------------------------------------
 * 02_Code.js doPost routes ANY body with {action:...} straight into
 * vaultRoute_ (session.create/get/list/save/delete, generate.session,
 * export.*, log.live) with no credential check. Anyone holding the /exec
 * URL can read, delete, or generate sessions (generate.session spends
 * Anthropic tokens). Optional hardening — reuse the same BRIDGE_SECRET
 * to gate that branch; in 02_Code.js doPost change:
 *
 *        if (data && data.action) {
 *          const vaultSecret = PropertiesService.getScriptProperties().getProperty('BRIDGE_SECRET');
 *          if (vaultSecret && data.secret !== vaultSecret) {
 *            return json_({ ok: false, error: 'unauthorized' });
 *          }
 *          const out = vaultRoute_(data.action, data);
 *          ...
 *
 * (Existing Vault clients must then send {secret:'...'} in their POST
 * bodies. BRIDGE_SECRET is required — DANMAN_Bridge.gs refuses every
 * request until it is set.)
 *
 * GATE PASS-THROUGH
 * -----------------
 * The AI-spending backends (danmanChat/danmanEmbed/danmanVisionOcr/
 * danmanTranscribe/danmanSaveToDrive/danmanTriageExport) each run
 * danmanGate_(payload, fn) from 06_Deploy.js. When Script Property
 * DANMAN_REQUIRE_KEY = '1' that gate demands payload.deployKey (dpl_...)
 * or payload.adminToken. Every handler below forwards args.deployKey /
 * args.adminToken untouched so bridge callers can satisfy the gate.
 */

function danmanBridgeTools_() {

  // -- small shared helpers (file-local) ------------------------------

  // Standard chat args -> danmanChat message blocks.
  // Verified source: 07_DANMAN.js:74 danmanChat(payload) expects
  //   payload.messages = [{role:'user'|'assistant', content:[{type:'text', text}]}]
  // (block array, NOT plain strings — see the payload doc at 07_DANMAN.js:63-73
  // and danmanCall_.anthropic at :263 which maps m.content.map(...)).
  function toDanmanMessages_(history, message) {
    var msgs = [];
    (history || []).forEach(function (h) {
      if (!h || h.content == null) return;
      var role = h.role === 'assistant' ? 'assistant' : 'user';
      var content = Array.isArray(h.content)
        ? h.content // caller already sent block format — pass through
        : [{ type: 'text', text: String(h.content) }];
      msgs.push({ role: role, content: content });
    });
    if (message != null && String(message) !== '') {
      msgs.push({ role: 'user', content: [{ type: 'text', text: String(message) }] });
    }
    return msgs;
  }

  function requireOk_(res, what) {
    if (!res || res.ok !== true) {
      throw new Error(what + ' failed: ' + (res && res.error ? res.error : 'no result'));
    }
    return res;
  }

  var BRIDGE_MEMORY_USERKEY = 'bridge'; // fixed partition for memory.save/search

  return {
    service: 'copilot-workbench',
    version: '1.0.0-20260721',

    caps: {
      'chat': 'chat',
      'transcribe': 'transcribe',
      'memory.save': 'memory.save',
      'memory.search': 'memory.search'
    },

    tools: {

      // ── chat (cap: chat) ─────────────────────────────────────────
      // Verified: 07_DANMAN.js:74 danmanChat(payload)
      //   payload {provider, model?, system?, messages:[blocks], maxTokens?, deployKey?, adminToken?}
      //   success -> {ok:true, text, model, provider, usage}
      'chat': {
        description: 'Multi-provider LLM chat (Anthropic/Gemini/OpenAI cascade) via danmanChat',
        category: 'ai',
        params: [
          { key: 'message', label: 'User message', type: 'text', required: true },
          { key: 'history', label: 'Prior turns [{role, content}]', type: 'json', required: false },
          { key: 'system', label: 'System prompt', type: 'text', required: false },
          { key: 'provider', label: 'auto|anthropic|gemini|openai', type: 'string', required: false },
          { key: 'model', label: 'Model override', type: 'string', required: false },
          { key: 'deployKey', label: 'Deploy key (if DANMAN_REQUIRE_KEY=1)', type: 'string', required: false }
        ],
        handler: function (args) {
          var res = danmanChat({
            provider: args.provider || 'auto',
            model: args.model,
            system: args.system,
            messages: toDanmanMessages_(args.history, args.message),
            deployKey: args.deployKey,
            adminToken: args.adminToken
          });
          requireOk_(res, 'chat');
          // Standard cap shape: {content, model?, provider?}
          return { content: res.text, model: res.model, provider: res.provider, usage: res.usage || null };
        }
      },

      // ── embed ────────────────────────────────────────────────────
      // Verified: 07_DANMAN.js:117 danmanEmbed(payload) — payload {texts:[string,...]}
      //   success -> {ok:true, provider, vectors:[[...],...]}
      'embed': {
        description: 'Text embeddings (OpenAI text-embedding-3-small, Gemini fallback)',
        category: 'ai',
        params: [
          { key: 'texts', label: 'Array of strings to embed', type: 'json', required: true },
          { key: 'deployKey', label: 'Deploy key (optional)', type: 'string', required: false }
        ],
        handler: function (args) {
          var res = danmanEmbed({
            texts: args.texts || [],
            deployKey: args.deployKey,
            adminToken: args.adminToken
          });
          return requireOk_(res, 'embed');
        }
      },

      // ── vision_ocr ───────────────────────────────────────────────
      // Verified: 07_DANMAN.js:171 danmanVisionOcr(payload)
      //   payload {mime, data(base64, no data: prefix), provider?, hint?}
      'vision_ocr': {
        description: 'LLM vision transcription of an image (exact text, markdown tables)',
        category: 'ai',
        params: [
          { key: 'mime', label: 'Image MIME type', type: 'string', required: true },
          { key: 'data', label: 'Base64 image (no data: prefix)', type: 'text', required: true },
          { key: 'provider', label: 'auto|anthropic|gemini|openai', type: 'string', required: false },
          { key: 'hint', label: 'Context hint', type: 'string', required: false },
          { key: 'deployKey', label: 'Deploy key (optional)', type: 'string', required: false }
        ],
        handler: function (args) {
          var res = danmanVisionOcr({
            mime: args.mime,
            data: args.data,
            provider: args.provider,
            hint: args.hint,
            deployKey: args.deployKey,
            adminToken: args.adminToken
          });
          requireOk_(res, 'vision_ocr');
          return { text: res.text, model: res.model, provider: res.provider, usage: res.usage || null };
        }
      },

      // ── transcribe (cap: transcribe) ─────────────────────────────
      // Verified: 08_Triage.js:25 danmanTranscribe(payload)
      //   payload {provider:'openai'|'openai-4o'|'gemini', mime, data(base64), name?, hint?}
      //   success -> {ok:true, provider, model, text}   (no language/duration/segments)
      'transcribe': {
        description: 'Speech-to-text (OpenAI Whisper / gpt-4o-mini-transcribe / Gemini audio)',
        category: 'ai',
        params: [
          { key: 'mime', label: 'Audio MIME type', type: 'string', required: true },
          { key: 'data', label: 'Base64 audio (18 MB max)', type: 'text', required: true },
          { key: 'name', label: 'File name', type: 'string', required: false },
          { key: 'provider', label: 'openai|openai-4o|gemini', type: 'string', required: false },
          { key: 'deployKey', label: 'Deploy key (optional)', type: 'string', required: false }
        ],
        handler: function (args) {
          // Map generic provider aliases onto this backend's vocabulary.
          var p = String(args.provider || 'openai').toLowerCase();
          if (p === 'whisper' || p === 'openai_whisper') p = 'openai';
          if (['openai', 'openai-4o', 'gemini'].indexOf(p) === -1) p = 'openai';
          var res = danmanTranscribe({
            provider: p,
            mime: args.mime,
            data: args.data,
            name: args.name,
            hint: args.hint,
            deployKey: args.deployKey,
            adminToken: args.adminToken
          });
          requireOk_(res, 'transcribe');
          // Standard cap shape: {text, language?, duration?, segments?} — backend
          // supplies only text; provider/model returned as extras.
          return { text: res.text, provider: res.provider, model: res.model };
        }
      },

      // ── memory_sync (raw backend, plain tool) ────────────────────
      // Verified: 07_DANMAN.js:197 danmanMemorySync(payload)
      //   payload {userKey, memories:[{id, type, weight, content, updated}]}
      //   success -> {ok:true, memories:[merged set]}
      'memory_sync': {
        description: 'Sheets-backed memory merge-by-id sync (returns full merged set)',
        category: 'memory',
        params: [
          { key: 'userKey', label: 'Memory partition key', type: 'string', required: false },
          { key: 'memories', label: 'Array [{id,type,weight,content,updated}]', type: 'json', required: false },
          { key: 'deployKey', label: 'Deploy key (optional)', type: 'string', required: false }
        ],
        handler: function (args) {
          var res = danmanMemorySync({
            userKey: args.userKey || BRIDGE_MEMORY_USERKEY,
            memories: args.memories || [],
            deployKey: args.deployKey,
            adminToken: args.adminToken
          });
          return requireOk_(res, 'memory_sync');
        }
      },

      // ── memory.save (cap: memory.save) ───────────────────────────
      // Wrapper over danmanMemorySync (07_DANMAN.js:197): appends ONE
      // memory under the fixed userKey 'bridge'.
      'memory.save': {
        description: 'Save one text memory into the bridge partition of DanmanMemory',
        category: 'memory',
        params: [
          { key: 'text', label: 'Memory text', type: 'text', required: true },
          { key: 'name', label: 'Short name', type: 'string', required: false },
          { key: 'category', label: 'Category tag', type: 'string', required: false },
          { key: 'deployKey', label: 'Deploy key (optional)', type: 'string', required: false }
        ],
        handler: function (args) {
          if (args.text == null || String(args.text) === '') {
            throw new Error('memory.save requires text');
          }
          var mem = {
            id: 'br_' + Date.now() + '_' + Math.floor(Math.random() * 100000),
            type: 'fact',
            weight: 3,
            content: String(args.text),
            updated: Date.now()
          };
          if (args.name) mem.name = String(args.name);
          if (args.category) mem.category = String(args.category);
          var res = danmanMemorySync({
            userKey: BRIDGE_MEMORY_USERKEY,
            memories: [mem],
            deployKey: args.deployKey,
            adminToken: args.adminToken
          });
          requireOk_(res, 'memory.save');
          return { ok: true, id: mem.id, total: (res.memories || []).length };
        }
      },

      // ── memory.search (cap: memory.search) ───────────────────────
      // Wrapper over danmanMemorySync with an empty incoming set: the
      // backend then returns the merged stored set for userKey 'bridge',
      // which is filtered here by case-insensitive substring.
      'memory.search': {
        description: 'Substring search over the bridge partition of DanmanMemory (score = weight)',
        category: 'memory',
        params: [
          { key: 'query', label: 'Search text', type: 'string', required: true },
          { key: 'limit', label: 'Max hits (default 20)', type: 'number', required: false },
          { key: 'deployKey', label: 'Deploy key (optional)', type: 'string', required: false }
        ],
        handler: function (args) {
          var q = String(args.query || '').toLowerCase();
          if (!q) throw new Error('memory.search requires query');
          var limit = Number(args.limit) > 0 ? Number(args.limit) : 20;
          var res = danmanMemorySync({
            userKey: BRIDGE_MEMORY_USERKEY,
            memories: [],
            deployKey: args.deployKey,
            adminToken: args.adminToken
          });
          requireOk_(res, 'memory.search');
          var hits = (res.memories || [])
            .filter(function (m) {
              return m && String(m.content || '').toLowerCase().indexOf(q) !== -1;
            })
            .map(function (m) {
              return { name: m.name || m.id, text: m.content, score: m.weight || 1, id: m.id, type: m.type };
            })
            .sort(function (a, b) { return (b.score || 0) - (a.score || 0); })
            .slice(0, limit);
          return { hits: hits };
        }
      },

      // ── save_to_drive ────────────────────────────────────────────
      // Verified: 08_Triage.js:104 danmanSaveToDrive(payload)
      //   payload {name, mime, data(base64), share:true|false}
      //   success -> {ok:true, url, fileId, name, shared}
      'save_to_drive': {
        description: 'Save a base64 file to the DANMAN Triage Audio Drive folder, return link',
        category: 'drive',
        params: [
          { key: 'name', label: 'File name', type: 'string', required: false },
          { key: 'mime', label: 'MIME type', type: 'string', required: false },
          { key: 'data', label: 'Base64 file data (18 MB max)', type: 'text', required: true },
          { key: 'share', label: 'Share anyone-with-link (PII: default false)', type: 'boolean', required: false },
          { key: 'deployKey', label: 'Deploy key (optional)', type: 'string', required: false }
        ],
        handler: function (args) {
          var res = danmanSaveToDrive({
            name: args.name,
            mime: args.mime,
            data: args.data,
            share: !!args.share,
            deployKey: args.deployKey,
            adminToken: args.adminToken
          });
          return requireOk_(res, 'save_to_drive');
        }
      },

      // ── triage_export ────────────────────────────────────────────
      // Verified: 08_Triage.js:134 danmanTriageExport(payload)
      //   payload {title?, headers:[...], rows:[[...],...], share:true|false}
      //   success -> {ok:true, url, spreadsheetId, rows, title, shared}
      'triage_export': {
        description: 'Export tabular results to a NEW Google Sheet',
        category: 'sheets',
        params: [
          { key: 'title', label: 'Spreadsheet title', type: 'string', required: false },
          { key: 'headers', label: 'Column headers array', type: 'json', required: true },
          { key: 'rows', label: 'Row arrays (max 2000)', type: 'json', required: false },
          { key: 'share', label: 'Share anyone-with-link', type: 'boolean', required: false },
          { key: 'deployKey', label: 'Deploy key (optional)', type: 'string', required: false }
        ],
        handler: function (args) {
          var res = danmanTriageExport({
            title: args.title,
            headers: args.headers || [],
            rows: args.rows || [],
            share: !!args.share,
            deployKey: args.deployKey,
            adminToken: args.adminToken
          });
          return requireOk_(res, 'triage_export');
        }
      },

      // ── session_list ─────────────────────────────────────────────
      // Verified: 10_MemoryVault.js:30 vaultRoute_(action, p);
      //   'session.list' -> sessionList_() (:162) -> {ok:true, sessions:[...]}
      'session_list': {
        description: 'List Memory Vault sessions (id, name, type, dates, counts)',
        category: 'vault',
        params: [],
        handler: function () {
          return requireOk_(vaultRoute_('session.list', {}), 'session_list');
        }
      },

      // ── session_get ──────────────────────────────────────────────
      // Verified: vaultRoute_ 'session.get' -> sessionGet_(p.id) (:155)
      //   -> {ok:true, session:{...}}
      'session_get': {
        description: 'Fetch one Memory Vault session JSON by id',
        category: 'vault',
        params: [
          { key: 'id', label: 'Session id', type: 'string', required: true }
        ],
        handler: function (args) {
          return requireOk_(vaultRoute_('session.get', { id: args.id }), 'session_get');
        }
      },

      // ── providers ────────────────────────────────────────────────
      // Verified: 07_DANMAN.js:53 danmanGetProviders() — no args
      //   -> {ok:true, providers:{anthropic,openai,gemini booleans}, models:{...}}
      'providers': {
        description: 'Which AI providers have keys configured (booleans only, never keys)',
        category: 'meta',
        params: [],
        handler: function () {
          return requireOk_(danmanGetProviders(), 'providers');
        }
      }
    }
  };
}
