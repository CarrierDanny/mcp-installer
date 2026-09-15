/**
 * Bridge_GrowTelliGence.gs — DANMAN Bridge tool registry for GrowTelliGence.
 * ─────────────────────────────────────────────────────────────────────────────
 * GrowTelliGence already answers the extension natively via its gp_* actions
 * (GetPowerBridge.gs), so this patch adds only what's missing: `describe`
 * discovery + a caps map, letting the extension's Bridge tab enumerate and
 * run its functions like any kit backend.
 *
 * INSTALL:
 * 1. Copy DANMAN_Bridge.gs and this file into the GrowTelliGence project
 *    (DELETE the fallback doPost block in DANMAN_Bridge.gs — this project has
 *    its own doPost in Code.gs).
 * 2. In Code.gs::doPost, right after the body is parsed and BEFORE the
 *    isGpRequest_ branch, add:
 *
 *      if (danmanBridgeIsRequest_(body)) {
 *        return ContentService.createTextOutput(JSON.stringify(danmanBridgeHandle_(body)))
 *          .setMimeType(ContentService.MimeType.JSON);
 *      }
 *
 * 3. Optionally set Script Property BRIDGE_SECRET (can be the same value as
 *    the GrowTelliGence admin/tenant password you already use as `secret`).
 *
 * Handlers below delegate straight to gpBridge_ / gpAuth_, so tenant scoping
 * and all existing behavior are preserved.
 */

function danmanBridgeTools_() {
  /** Run a gp_* action through the real GetPowerBridge router, reusing the
   *  bridge secret for gpAuth_ scoping. */
  function gp_(action, args) {
    var secret = '';
    try { secret = PropertiesService.getScriptProperties().getProperty('BRIDGE_SECRET') || ''; } catch (e) {}
    var body = { action: action, secret: secret };
    for (var k in (args || {})) body[k] = args[k];
    return gpBridge_(body);
  }

  return {
    service: 'GrowTelliGence',
    version: (typeof CFG !== 'undefined' && CFG.get) ? (CFG.get('APP_VERSION') || 'v3') : 'v3',
    caps: {
      'chat': 'chat',
      'memory.save': 'memory_save',
      'memory.search': 'memory_search',
      'memory.overview': 'overview',
      'capture': 'capture'
    },
    tools: {
      chat: {
        description: 'Retrieval-augmented DANMAN chat (server-side memory context)',
        category: 'ai',
        params: [
          { key: 'message', label: 'Message', type: 'text', required: true },
          { key: 'history', label: 'History (JSON [{role,content}])', type: 'json', required: false }
        ],
        handler: function (a) { return gp_('gp_chat', { message: a.message, history: a.history || [] }); }
      },
      memory_save: {
        description: 'Chunk + vectorize text into the Drive knowledge base',
        category: 'memory',
        params: [
          { key: 'text', label: 'Text', type: 'text', required: true },
          { key: 'name', label: 'Name', type: 'string', required: false },
          { key: 'category', label: 'Category', type: 'string', required: false }
        ],
        handler: function (a) { return gp_('gp_memory_save', a); }
      },
      memory_search: {
        description: 'Semantic search over stored vectors',
        category: 'memory',
        params: [
          { key: 'query', label: 'Query', type: 'string', required: true },
          { key: 'limit', label: 'Max hits', type: 'number', required: false }
        ],
        handler: function (a) { return gp_('gp_memory_search', a); }
      },
      overview: {
        description: "What's in the knowledge base",
        category: 'memory',
        params: [],
        handler: function () { return gp_('gp_overview', {}); }
      },
      capture: {
        description: 'Save + vectorize a URL/HTML capture',
        category: 'memory',
        params: [
          { key: 'url', label: 'URL', type: 'string', required: true },
          { key: 'title', label: 'Title', type: 'string', required: false },
          { key: 'html', label: 'HTML', type: 'text', required: false },
          { key: 'text', label: 'Text', type: 'text', required: false }
        ],
        handler: function (a) { return gp_('gp_capture', a); }
      },
      lookup: {
        description: 'Unified RCD cross-reference lookup',
        category: 'search',
        params: [{ key: 'query', label: 'Query', type: 'string', required: true }],
        handler: function (a) { return gp_('gp_lookup', { query: a.query }); }
      }
    }
  };
}
