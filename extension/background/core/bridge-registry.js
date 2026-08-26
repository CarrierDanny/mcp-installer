// background/core/bridge-registry.js — Universal Bridge.
// Replaces the single hardcoded webhook with named Bridge Profiles, each
// speaking its backend's dialect through an adapter. Features call
// capability VERBS (chat, memory.save, …); config.bridge_routing decides
// which profile serves each verb; the adapter translates verb → that
// backend's action name + payload shape and normalizes the response.
// Backends patched with gas-bridge-kit/DANMAN_Bridge.gs are self-describing:
// a `describe` probe returns their tool manifest + capability map.
//
// Public surface: globalThis.BridgeRegistry
(function () {
  'use strict';

  const VERBS = ['ping', 'chat', 'memory.save', 'memory.search', 'memory.overview', 'capture', 'drive'];

  // ── Adapters ─────────────────────────────────────────────────────────
  // envelope(profile, action, args) → POST body for that dialect.
  // caps[verb] = { action, build(args)→dialect args, parse(resp)→normalized }
  const id = (x) => x;

  const ADAPTERS = {
    growtelligence: {
      label: 'GrowTelliGence (gp_*)',
      envelope: (p, action, args) => ({ secret: p.secret || '', action, ...(args || {}) }),
      caps: {
        ping: { action: 'gp_ping', build: () => ({}), parse: id },
        chat: {
          action: 'gp_chat',
          build: (a) => ({ message: a.message || '', history: a.history || [], opts: a.opts || {} }),
          parse: (r) => ({ content: r.content || r.reply || '', model: r.model || '', usedContext: !!r.usedContext })
        },
        'memory.save': {
          action: 'gp_memory_save',
          build: (a) => ({ text: a.text || '', name: a.name || '', category: a.category || '' }),
          parse: id
        },
        'memory.search': {
          action: 'gp_memory_search',
          build: (a) => ({ query: a.query || '', limit: a.limit || 8 }),
          parse: (r) => ({ hits: r.hits || [] })
        },
        'memory.overview': { action: 'gp_overview', build: () => ({}), parse: id },
        capture: {
          action: 'gp_capture',
          build: (a) => ({ url: a.url || '', title: a.title || '', html: a.html || '', text: a.text || '', selection: a.selection || '', category: a.category || '' }),
          parse: id
        }
      }
    },

    'danman-webapp': {
      label: 'DANMAN Webapp (token)',
      // The repo webapp expects {token, action, payload}
      envelope: (p, action, args) => ({ token: p.secret || '', action, payload: args || {} }),
      caps: {
        ping: { action: 'ping', build: () => ({}), parse: id },
        chat: {
          action: 'danman_chat',
          build: (a) => ({ message: a.message || '', history: a.history || [] }),
          parse: (r) => ({ content: r.response || r.content || r.reply || '', model: r.model || '' })
        },
        capture: {
          action: 'ingest',
          build: (a) => ({ url: a.url || '', title: a.title || '', html: a.html || '', text: a.text || '' }),
          parse: id
        }
      }
    },

    'copilot-workbench': {
      label: 'Copilot Workbench (session.*)',
      // Unpatched Copilot has no auth field and only the vault actions.
      envelope: (p, action, args) => ({ action, ...(args || {}) }),
      caps: {
        // GET ?action=ping exists, but POST with unknown action returns a
        // clean error too — use session.list as the cheapest POST probe.
        ping: { action: 'session.list', build: () => ({}), parse: (r) => ({ ok: !!r.ok, sessions: (r.sessions || []).length }) }
      }
    },

    'enterprise-suite': {
      label: 'Enterprise Suite (scraper)',
      envelope: (p, action, args) => ({ action, ...(args || {}) }),
      caps: {
        ping: { action: 'ping', build: () => ({}), parse: id },
        capture: {
          action: 'submitCapturedContent',
          build: (a) => ({ capture: { url: a.url || '', title: a.title || '', html: a.html || '', text: a.text || '' } }),
          parse: id
        }
      }
    },

    'danman-bridge-kit': {
      label: 'DANMAN Bridge kit (self-describing)',
      envelope: (p, action, args) => ({ bridge: 'danman', secret: p.secret || '', action, args: args || {} }),
      // Verbs resolve dynamically from the discovered manifest's caps map.
      dynamicCaps: true,
      caps: {
        ping: { action: 'ping', build: () => ({}), parse: id }
      }
    },

    generic: {
      label: 'Generic webhook',
      envelope: (p, action, args) => ({ secret: p.secret || '', action, ...(args || {}) }),
      caps: {
        ping: { action: 'ping', build: () => ({}), parse: id }
      }
    }
  };

  // ── Storage helpers ──────────────────────────────────────────────────
  async function getState() {
    const cfg = await ConfigManager.load();
    let bridges = Array.isArray(cfg.bridges) ? cfg.bridges : [];
    let routing = cfg.bridge_routing || {};
    let tools = cfg.bridge_tools || {};

    // One-time migration: fold the legacy single backend webhook into a
    // profile so existing Recall / Bridge-RAG setups keep working untouched.
    if (!bridges.length && cfg.backend?.webhook_url) {
      const prof = {
        id: 'migrated-backend',
        label: 'Backend (migrated)',
        url: cfg.backend.webhook_url,
        secret: cfg.backend.webhook_secret || '',
        adapter: 'growtelligence',
        enabled: true
      };
      bridges = [prof];
      routing = {};
      VERBS.forEach((v) => { routing[v] = prof.id; });
      await ConfigManager.updateConfig({ bridges, bridge_routing: routing });
    }
    return { cfg, bridges, routing, tools };
  }

  function findProfile(bridges, profileId) {
    return bridges.find((b) => b.id === profileId) || null;
  }

  function adapterFor(profile) {
    return ADAPTERS[profile.adapter] || ADAPTERS.generic;
  }

  // ── Verb support ─────────────────────────────────────────────────────
  function supportsVerb(profile, tools, verb) {
    const ad = adapterFor(profile);
    if (ad.caps[verb]) return true;
    if (ad.dynamicCaps) {
      const caps = (tools[profile.id] && tools[profile.id].caps) || {};
      return !!caps[verb];
    }
    return false;
  }

  function supportedVerbs(profile, tools) {
    return VERBS.filter((v) => supportsVerb(profile, tools, v));
  }

  // ── HTTP ─────────────────────────────────────────────────────────────
  function normalizeUrl(url) {
    try {
      const u = new URL(String(url).trim());
      u.search = '';
      u.hash = '';
      return u.toString();
    } catch (_) {
      return String(url || '').split('?')[0].trim();
    }
  }

  async function post(profile, body, timeoutMs) {
    const url = normalizeUrl(profile.url);
    if (!url) throw new Error('Profile "' + (profile.label || profile.id) + '" has no URL');
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs || 120000) : null;
    let resp, text;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        redirect: 'follow',
        signal: controller ? controller.signal : undefined
      });
      text = await resp.text();
    } catch (e) {
      if (timer) clearTimeout(timer);
      throw new Error(e && e.name === 'AbortError' ? 'Bridge call timed out' : (e.message || String(e)));
    }
    if (timer) clearTimeout(timer);
    let data;
    try {
      data = JSON.parse(text);
    } catch (_) {
      const snippet = String(text || '').slice(0, 300);
      throw new Error(resp.ok
        ? 'Webhook returned non-JSON (auth redirect or HTML error page): ' + snippet
        : 'HTTP ' + resp.status + ': ' + snippet);
    }
    if (data && (data.success === false || data.ok === false) && data.error) {
      throw new Error(data.error);
    }
    return data;
  }

  // ── Call log (local ring buffer + master-sheet audit row) ────────────
  async function logCall(entry) {
    try {
      const { gpd_bridge_log = [] } = await Browser.storage.get('gpd_bridge_log');
      gpd_bridge_log.unshift({ ...entry, at: Date.now() });
      if (gpd_bridge_log.length > 30) gpd_bridge_log.length = 30;
      await Browser.storage.set({ gpd_bridge_log });
    } catch (_) {}
    try {
      if (globalThis.MasterLog) {
        MasterLog.append('BRIDGE_CALL', entry.action || entry.verb, {
          profile: entry.profile,
          ok: entry.ok,
          ms: entry.ms,
          deployment: entry.deployment || '',
          error: entry.error || undefined
        });
      }
    } catch (_) {}
  }

  // ── Public API ───────────────────────────────────────────────────────
  const BridgeRegistry = {
    VERBS,
    ADAPTERS: Object.fromEntries(Object.entries(ADAPTERS).map(([k, a]) => [k, { label: a.label }])),

    async list() {
      const { bridges, routing, tools } = await getState();
      return {
        bridges: bridges.map((b) => ({
          ...b,
          secret: b.secret ? '•••' : '',
          verbs: supportedVerbs(b, tools),
          toolCount: ((tools[b.id] || {}).discovered || []).length + ((tools[b.id] || {}).custom || []).length
        })),
        routing,
        verbs: VERBS
      };
    },

    async save(profile) {
      const { cfg, bridges } = await getState();
      const p = {
        id: profile.id || ('bridge-' + Math.random().toString(36).slice(2, 8)),
        label: profile.label || 'Unnamed bridge',
        url: profile.url || '',
        secret: profile.secret != null && profile.secret !== '•••'
          ? profile.secret
          : (findProfile(bridges, profile.id) || {}).secret || '',
        adapter: ADAPTERS[profile.adapter] ? profile.adapter : 'generic',
        enabled: profile.enabled !== false
      };
      const next = bridges.filter((b) => b.id !== p.id).concat([p]);
      await ConfigManager.updateConfig({ bridges: next });
      return { success: true, id: p.id };
    },

    async remove(profileId) {
      const { cfg, bridges, routing, tools } = await getState();
      const nextRouting = { ...routing };
      Object.keys(nextRouting).forEach((v) => {
        if (nextRouting[v] === profileId) nextRouting[v] = 'auto';
      });
      const nextTools = { ...tools };
      delete nextTools[profileId];
      // updateConfig deep-merges, so the pruned array/objects must be set whole
      const nextCfg = await ConfigManager.getConfig();
      nextCfg.bridges = bridges.filter((b) => b.id !== profileId);
      nextCfg.bridge_routing = nextRouting;
      nextCfg.bridge_tools = nextTools;
      await ConfigManager.setConfig(nextCfg);
      return { success: true };
    },

    async setRouting(routing) {
      await ConfigManager.updateConfig({ bridge_routing: routing || {} });
      return { success: true };
    },

    /** Capability call — the one entry point features use. */
    async call(verb, payload) {
      const { cfg, bridges, routing, tools } = await getState();
      // Memory-bound verbs carry the configured memory folder so backends
      // that honor per-request folders route to the user's chosen Drive home.
      if ((verb === 'memory.save' || verb === 'capture') && payload && !payload.folder_id) {
        const fid = cfg.memory?.folder_id || cfg.memory?.drive_folder_id || '';
        if (fid) payload = { ...payload, folder_id: fid };
      }
      const enabled = bridges.filter((b) => b.enabled !== false);
      if (!enabled.length) {
        throw new Error('No bridge profiles configured — add one in the Bridge tab.');
      }
      let profile = null;
      const routed = routing[verb];
      if (routed && routed !== 'auto') profile = findProfile(enabled, routed);
      if (!profile) profile = enabled.find((b) => supportsVerb(b, tools, verb)) || null;
      if (!profile) {
        throw new Error('No enabled bridge supports "' + verb + '". Add a profile that does, or apply the gas-bridge-kit patch to one of your backends.');
      }
      if (!supportsVerb(profile, tools, verb)) {
        const have = supportedVerbs(profile, tools).join(', ') || 'none';
        throw new Error('Bridge "' + profile.label + '" does not support "' + verb + '" (supports: ' + have + '). Change the routing in the Bridge tab.');
      }

      const ad = adapterFor(profile);
      let action, body;
      if (ad.caps[verb]) {
        const cap = ad.caps[verb];
        action = cap.action;
        body = ad.envelope(profile, cap.action, cap.build(payload || {}));
      } else {
        // dynamicCaps: verb → tool name from the discovered manifest
        const capMap = (tools[profile.id] && tools[profile.id].caps) || {};
        action = capMap[verb];
        body = ad.envelope(profile, action, payload || {});
      }

      const t0 = Date.now();
      const dep = (String(profile.url || '').match(/\/macros\/s\/([^/]+)/) || [])[1] || '';
      try {
        const raw = await post(profile, body);
        await logCall({ profile: profile.label, verb, action, ok: true, ms: Date.now() - t0, deployment: dep.slice(0, 16) });
        const parsed = ad.caps[verb] ? ad.caps[verb].parse(raw) : (raw && raw.result !== undefined ? raw.result : raw);
        return parsed;
      } catch (e) {
        await logCall({ profile: profile.label, verb, action, ok: false, ms: Date.now() - t0, deployment: dep.slice(0, 16), error: (e.message || '').slice(0, 200) });
        throw e;
      }
    },

    /** Is any enabled profile able to do Drive work (has drive.* caps)? */
    async hasDriveProfile() {
      const { bridges, tools } = await getState();
      return bridges.some((b) => b.enabled !== false && supportsVerb(b, tools, 'drive'));
    },

    /** Resolve the Drive-routed profile (routing['drive'] or first capable). */
    async driveProfile() {
      const { bridges, routing, tools } = await getState();
      const enabled = bridges.filter((b) => b.enabled !== false);
      const routed = routing['drive'];
      let profile = (routed && routed !== 'auto') ? findProfile(enabled, routed) : null;
      if (!profile) profile = enabled.find((b) => supportsVerb(b, tools, 'drive')) || null;
      return profile;
    },

    /** Drive op via the kit's Drive tools (drive_init, drive_create_file, …).
     *  DriveClient uses this when its method resolves to 'bridge'. */
    async driveCall(action, args) {
      const profile = await this.driveProfile();
      if (!profile) {
        throw new Error('No bridge is set up for Drive. Add Bridge_Drive.gs to a backend, redeploy, then Discover it in the Bridge tab.');
      }
      const ad = adapterFor(profile);
      const body = ad.envelope(profile, action, args || {});
      const t0 = Date.now();
      try {
        const raw = await post(profile, body);
        await logCall({ profile: profile.label, verb: 'drive', action, ok: true, ms: Date.now() - t0 });
        return raw && raw.result !== undefined ? raw.result : raw;
      } catch (e) {
        await logCall({ profile: profile.label, verb: 'drive', action, ok: false, ms: Date.now() - t0, error: (e.message || '').slice(0, 200) });
        throw e;
      }
    },

    /** Raw tool dispatch on a specific profile (Bridge tab "Run"). */
    async callTool(profileId, action, args) {
      const { bridges } = await getState();
      const profile = findProfile(bridges, profileId);
      if (!profile) throw new Error('Unknown bridge profile: ' + profileId);
      const ad = adapterFor(profile);
      const body = ad.envelope(profile, action, args || {});
      const t0 = Date.now();
      try {
        const raw = await post(profile, body);
        await logCall({ profile: profile.label, verb: '(tool)', action, ok: true, ms: Date.now() - t0 });
        return raw;
      } catch (e) {
        await logCall({ profile: profile.label, verb: '(tool)', action, ok: false, ms: Date.now() - t0, error: (e.message || '').slice(0, 200) });
        throw e;
      }
    },

    /** Ping through the profile's adapter. */
    async test(profileId) {
      const { bridges, tools } = await getState();
      const profile = findProfile(bridges, profileId);
      if (!profile) throw new Error('Unknown bridge profile: ' + profileId);
      const ad = adapterFor(profile);
      const cap = ad.caps.ping;
      const t0 = Date.now();
      const raw = await post(profile, ad.envelope(profile, cap.action, cap.build({})), 30000);
      return { success: true, ms: Date.now() - t0, response: cap.parse(raw), verbs: supportedVerbs(profile, tools) };
    },

    /** `describe` probe → store manifest tools + caps for the profile. */
    async discover(profileId) {
      const { bridges, tools } = await getState();
      const profile = findProfile(bridges, profileId);
      if (!profile) throw new Error('Unknown bridge profile: ' + profileId);
      const ad = adapterFor(profile);
      const body = ad.envelope(profile, 'describe', {});
      if (profile.adapter === 'danman-bridge-kit' || profile.adapter === 'generic') {
        body.bridge = 'danman'; // kit marker — harmless on non-kit backends
      }
      const raw = await post(profile, body, 30000);
      const manifest = raw.result || raw;
      const discovered = (manifest.tools || []).map((t) => ({
        name: t.name,
        action: t.action || t.name,
        description: t.description || '',
        category: t.category || '',
        params: t.params || []
      }));
      const entry = {
        ...(tools[profileId] || {}),
        discovered,
        caps: manifest.caps || {},
        service: manifest.service || '',
        version: manifest.version || '',
        discoveredAt: Date.now()
      };
      await ConfigManager.updateConfig({ bridge_tools: { ...tools, [profileId]: entry } });
      return { success: true, service: entry.service, version: entry.version, tools: discovered, caps: entry.caps };
    },

    async getTools(profileId) {
      const { tools } = await getState();
      const t = tools[profileId] || {};
      return { discovered: t.discovered || [], custom: t.custom || [], caps: t.caps || {}, service: t.service || '', discoveredAt: t.discoveredAt || null };
    },

    async saveCustomTool(profileId, tool) {
      const { tools } = await getState();
      const entry = tools[profileId] || {};
      const custom = (entry.custom || []).filter((t) => t.name !== tool.name);
      custom.push({
        name: tool.name,
        action: tool.action || tool.name,
        description: tool.description || '',
        category: 'custom',
        params: tool.params || []
      });
      await ConfigManager.updateConfig({ bridge_tools: { ...tools, [profileId]: { ...entry, custom } } });
      return { success: true };
    },

    async deleteCustomTool(profileId, name) {
      const { tools } = await getState();
      const entry = tools[profileId] || {};
      const custom = (entry.custom || []).filter((t) => t.name !== name);
      await ConfigManager.updateConfig({ bridge_tools: { ...tools, [profileId]: { ...entry, custom } } });
      return { success: true };
    },

    async getLog() {
      const { gpd_bridge_log = [] } = await Browser.storage.get('gpd_bridge_log');
      return { log: gpd_bridge_log };
    }
  };

  globalThis.BridgeRegistry = BridgeRegistry;
})();
