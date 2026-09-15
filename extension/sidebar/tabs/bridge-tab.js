// sidebar/tabs/bridge-tab.js — Universal Bridge manager.
// Profiles (any webhook, any dialect), capability routing, self-describing
// tool discovery with auto-generated run forms, and a call log.
(function () {
  'use strict';

  const container = document.getElementById('tab-bridge');
  if (!container) return;

  let state = { bridges: [], routing: {}, verbs: [] };
  let editingId = null;      // profile being edited in the form
  let selectedProfile = ''; // tools section
  let loaded = false;

  const ADAPTER_LABELS = {
    growtelligence: 'GrowTelliGence (gp_*)',
    'danman-webapp': 'DANMAN Webapp (token)',
    'copilot-workbench': 'Copilot Workbench',
    'enterprise-suite': 'Enterprise Suite',
    'danman-bridge-kit': 'DANMAN Bridge kit (self-describing)',
    generic: 'Generic webhook'
  };

  container.innerHTML = `
    <div class="tab-title">&#127753; Bridge</div>
    <div class="tab-desc">Connect any GAS webhook — profiles, routing, and discovered tools</div>

    <div class="card">
      <div class="card-header">
        <span class="section-title">Profiles</span>
        <button class="btn btn-sm btn-primary" id="br-add">+ Add</button>
      </div>
      <div id="br-profiles"><div class="text-sm text-muted">Loading…</div></div>
      <div id="br-form" class="hidden" style="margin-top:10px;border-top:1px solid #334155;padding-top:10px;">
        <div class="form-group"><label>Label</label><input type="text" id="br-f-label" placeholder="e.g. GrowTelliGence prod"></div>
        <div class="form-group"><label>Webhook URL (/exec)</label><input type="url" id="br-f-url" placeholder="https://script.google.com/macros/s/…/exec"></div>
        <div class="form-group"><label>Secret / token (blank = none)</label><input type="password" id="br-f-secret" placeholder="•••"></div>
        <div class="form-group"><label>Dialect</label>
          <select id="br-f-adapter">
            ${Object.entries(ADAPTER_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
          </select>
        </div>
        <div class="flex gap-2">
          <button class="btn btn-sm btn-primary" id="br-f-save">Save profile</button>
          <button class="btn btn-sm btn-secondary" id="br-f-cancel">Cancel</button>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><span class="section-title">Capability routing</span></div>
      <div class="tab-desc" style="margin-bottom:8px;">Which profile serves each feature. "Auto" picks the first profile that supports it.</div>
      <div id="br-routing"><div class="text-sm text-muted">Add a profile first.</div></div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="section-title">Tools</span>
        <div class="flex gap-1">
          <button class="btn btn-sm btn-secondary" id="br-discover" title="Ask the webhook to describe its tools ({action:'describe'})">&#128225; Discover</button>
          <button class="btn btn-sm btn-secondary" id="br-tool-add" title="Define a tool manually for webhooks you can't modify">+ Custom</button>
        </div>
      </div>
      <div class="form-group"><select id="br-tool-profile"><option value="">— pick a profile —</option></select></div>
      <div id="br-tools"><div class="text-sm text-muted">Discovered and custom tools appear here as runnable forms.</div></div>
      <div id="br-tool-form" class="hidden" style="margin-top:8px;border-top:1px solid #334155;padding-top:8px;">
        <div class="form-group"><label>Tool name</label><input type="text" id="br-tf-name" placeholder="e.g. sf_query"></div>
        <div class="form-group"><label>Action string sent to the webhook</label><input type="text" id="br-tf-action" placeholder="e.g. sf_query"></div>
        <div class="form-group"><label>Params (one per line: key,label,type — types: string,text,number,boolean,json)</label>
          <textarea id="br-tf-params" rows="3" placeholder="soql,SOQL query,text"></textarea></div>
        <div class="flex gap-2">
          <button class="btn btn-sm btn-primary" id="br-tf-save">Save tool</button>
          <button class="btn btn-sm btn-secondary" id="br-tf-cancel">Cancel</button>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="section-title">Recent calls</span>
        <button class="btn btn-sm btn-secondary" id="br-log-refresh">Refresh</button>
      </div>
      <div id="br-log" class="text-sm text-muted">No bridge calls yet.</div>
    </div>
  `;

  const $ = (id) => container.querySelector('#' + id);

  function escText(s) {
    const d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
  }

  // ── Profiles ───────────────────────────────────────────────────────────
  async function refresh() {
    try {
      state = await window.sendToBackground('BRIDGE_LIST', {});
      renderProfiles();
      renderRouting();
      renderToolProfileSelect();
    } catch (e) {
      $('br-profiles').innerHTML = '<div class="text-sm" style="color:#fca5a5;">' + escText(e.message || e) + '</div>';
    }
  }

  function renderProfiles() {
    const el = $('br-profiles');
    if (!state.bridges.length) {
      el.innerHTML = '<div class="empty-state"><div class="icon">&#127753;</div><div class="message">No profiles yet. Add your GAS webhook deployments —<br>each can speak a different dialect.</div></div>';
      return;
    }
    el.innerHTML = '';
    state.bridges.forEach((b) => {
      const item = document.createElement('div');
      item.className = 'result-item';
      item.innerHTML = '<strong>' + escText(b.label) + '</strong> '
        + '<span class="badge badge-cyan">' + escText(ADAPTER_LABELS[b.adapter] || b.adapter) + '</span>'
        + (b.enabled === false ? ' <span class="badge badge-red">disabled</span>' : '')
        + '<div class="meta">' + escText((b.url || '').replace(/^https:\/\/script\.google\.com\/macros\//, '…/')) + '</div>'
        + '<div class="meta">verbs: ' + escText((b.verbs || []).join(', ') || 'none') + ' · tools: ' + (b.toolCount || 0) + '</div>';
      const row = document.createElement('div');
      row.className = 'flex gap-2 mt-2';
      const test = document.createElement('button');
      test.className = 'btn btn-sm btn-secondary';
      test.textContent = 'Test';
      test.addEventListener('click', async () => {
        test.disabled = true;
        test.textContent = '…';
        try {
          const r = await window.sendToBackground('BRIDGE_TEST', { profileId: b.id });
          test.textContent = '✓ ' + r.ms + 'ms';
          if (window.Toast) Toast.success(b.label + ' reachable (' + r.ms + 'ms)');
        } catch (e) {
          test.textContent = '✗ failed';
          if (window.Toast) Toast.error(b.label + ': ' + (e.message || e));
        }
        setTimeout(() => { test.disabled = false; test.textContent = 'Test'; }, 2500);
      });
      const edit = document.createElement('button');
      edit.className = 'btn btn-sm btn-secondary';
      edit.textContent = 'Edit';
      edit.addEventListener('click', () => openForm(b));
      const del = document.createElement('button');
      del.className = 'btn btn-sm btn-danger';
      del.textContent = 'Delete';
      del.addEventListener('click', async () => {
        if (!confirm('Delete bridge profile "' + b.label + '"?')) return;
        await window.sendToBackground('BRIDGE_DELETE', { profileId: b.id });
        refresh();
      });
      row.appendChild(test);
      row.appendChild(edit);
      row.appendChild(del);
      item.appendChild(row);
      el.appendChild(item);
    });
  }

  function openForm(profile) {
    editingId = profile ? profile.id : null;
    $('br-form').classList.remove('hidden');
    $('br-f-label').value = profile ? profile.label : '';
    $('br-f-url').value = profile ? profile.url : '';
    $('br-f-secret').value = profile ? profile.secret : '';
    $('br-f-adapter').value = profile ? profile.adapter : 'danman-bridge-kit';
  }

  $('br-add').addEventListener('click', () => openForm(null));
  $('br-f-cancel').addEventListener('click', () => $('br-form').classList.add('hidden'));
  $('br-f-save').addEventListener('click', async () => {
    try {
      await window.sendToBackground('BRIDGE_SAVE', {
        id: editingId || undefined,
        label: $('br-f-label').value.trim(),
        url: $('br-f-url').value.trim(),
        secret: $('br-f-secret').value,
        adapter: $('br-f-adapter').value,
        enabled: true
      });
      $('br-form').classList.add('hidden');
      if (window.Toast) Toast.success('Profile saved');
      refresh();
    } catch (e) {
      if (window.Toast) Toast.error('Save failed: ' + (e.message || e));
    }
  });

  // ── Routing ────────────────────────────────────────────────────────────
  function renderRouting() {
    const el = $('br-routing');
    if (!state.bridges.length) {
      el.innerHTML = '<div class="text-sm text-muted">Add a profile first.</div>';
      return;
    }
    el.innerHTML = '';
    (state.verbs || []).forEach((verb) => {
      const row = document.createElement('div');
      row.className = 'toggle-row';
      const supporting = state.bridges.filter((b) => (b.verbs || []).includes(verb));
      const current = state.routing[verb] || 'auto';
      row.innerHTML = '<label style="flex:1;">' + escText(verb) + '</label>';
      const sel = document.createElement('select');
      sel.style.width = '55%';
      sel.innerHTML = '<option value="auto">Auto (first supporting)</option>'
        + state.bridges.map((b) => '<option value="' + escText(b.id) + '"'
          + ((b.verbs || []).includes(verb) ? '' : ' disabled')
          + '>' + escText(b.label) + ((b.verbs || []).includes(verb) ? '' : ' (unsupported)') + '</option>').join('');
      sel.value = state.bridges.some((b) => b.id === current) ? current : 'auto';
      sel.addEventListener('change', async () => {
        const routing = { ...state.routing, [verb]: sel.value };
        await window.sendToBackground('BRIDGE_ROUTING_SET', { routing });
        state.routing = routing;
        if (window.Toast) Toast.success(verb + ' → ' + (sel.value === 'auto' ? 'auto' : sel.options[sel.selectedIndex].text));
      });
      if (!supporting.length) {
        const warn = document.createElement('span');
        warn.className = 'badge badge-yellow';
        warn.textContent = 'no profile supports this';
        row.appendChild(warn);
      }
      row.appendChild(sel);
      el.appendChild(row);
    });
  }

  // ── Tools ──────────────────────────────────────────────────────────────
  function renderToolProfileSelect() {
    const sel = $('br-tool-profile');
    const prev = selectedProfile;
    sel.innerHTML = '<option value="">— pick a profile —</option>'
      + state.bridges.map((b) => '<option value="' + escText(b.id) + '">' + escText(b.label) + '</option>').join('');
    if (prev && state.bridges.some((b) => b.id === prev)) sel.value = prev;
  }

  $('br-tool-profile').addEventListener('change', () => {
    selectedProfile = $('br-tool-profile').value;
    loadTools();
  });

  async function loadTools() {
    const el = $('br-tools');
    if (!selectedProfile) {
      el.innerHTML = '<div class="text-sm text-muted">Discovered and custom tools appear here as runnable forms.</div>';
      return;
    }
    try {
      const t = await window.sendToBackground('BRIDGE_TOOLS_GET', { profileId: selectedProfile });
      const all = [...(t.discovered || []), ...(t.custom || [])];
      if (!all.length) {
        el.innerHTML = '<div class="text-sm text-muted">No tools yet — hit Discover (kit-patched backends answer automatically) or add a custom tool.</div>';
        return;
      }
      el.innerHTML = t.service
        ? '<div class="text-xs text-muted mb-2">' + escText(t.service) + (t.discoveredAt ? ' · discovered ' + new Date(t.discoveredAt).toLocaleString() : '') + '</div>'
        : '';
      all.forEach((tool) => el.appendChild(renderTool(tool)));
    } catch (e) {
      el.innerHTML = '<div class="text-sm" style="color:#fca5a5;">' + escText(e.message || e) + '</div>';
    }
  }

  function renderTool(tool) {
    const item = document.createElement('div');
    item.className = 'result-item';
    item.innerHTML = '<strong>' + escText(tool.name) + '</strong>'
      + (tool.category ? ' <span class="badge badge-cyan">' + escText(tool.category) + '</span>' : '')
      + (tool.description ? '<div class="meta">' + escText(tool.description) + '</div>' : '');

    const form = document.createElement('div');
    form.className = 'hidden mt-2';
    (tool.params || []).forEach((p) => {
      const g = document.createElement('div');
      g.className = 'form-group';
      const label = document.createElement('label');
      label.textContent = (p.label || p.key) + (p.required ? ' *' : '');
      g.appendChild(label);
      let input;
      if (p.type === 'text' || p.type === 'json') {
        input = document.createElement('textarea');
        input.rows = 3;
      } else if (p.type === 'boolean') {
        input = document.createElement('select');
        input.innerHTML = '<option value="">—</option><option value="true">true</option><option value="false">false</option>';
      } else {
        input = document.createElement('input');
        input.type = p.type === 'number' ? 'number' : 'text';
      }
      input.dataset.paramKey = p.key;
      input.dataset.paramType = p.type || 'string';
      g.appendChild(input);
      form.appendChild(g);
    });
    const runRow = document.createElement('div');
    runRow.className = 'flex gap-2';
    const run = document.createElement('button');
    run.className = 'btn btn-sm btn-primary';
    run.textContent = '▶ Run';
    const out = document.createElement('pre');
    out.className = 'hidden font-mono text-xs';
    out.style.cssText = 'margin-top:8px;max-height:220px;overflow:auto;background:#0f172a;border:1px solid #334155;border-radius:6px;padding:8px;white-space:pre-wrap;word-break:break-word;';
    run.addEventListener('click', async () => {
      const args = {};
      let bad = null;
      form.querySelectorAll('[data-param-key]').forEach((inp) => {
        const key = inp.dataset.paramKey;
        const type = inp.dataset.paramType;
        const v = inp.value;
        if (v === '' || v == null) return;
        if (type === 'number') args[key] = Number(v);
        else if (type === 'boolean') args[key] = v === 'true';
        else if (type === 'json') {
          try { args[key] = JSON.parse(v); } catch (_) { bad = key; }
        } else args[key] = v;
      });
      if (bad) { if (window.Toast) Toast.error('Invalid JSON in "' + bad + '"'); return; }
      run.disabled = true;
      run.textContent = '…';
      out.classList.remove('hidden');
      out.textContent = 'Calling ' + tool.action + '…';
      try {
        const r = await window.sendToBackground('BRIDGE_CALL', { profileId: selectedProfile, action: tool.action, args });
        out.textContent = JSON.stringify(r, null, 2);
      } catch (e) {
        out.textContent = 'ERROR: ' + (e.message || e);
      }
      run.disabled = false;
      run.textContent = '▶ Run';
    });
    const copy = document.createElement('button');
    copy.className = 'btn btn-sm btn-secondary';
    copy.textContent = 'Copy result';
    copy.addEventListener('click', () => {
      if (window.copyToClipboard && out.textContent) window.copyToClipboard(out.textContent);
      if (window.Toast) Toast.info('Copied');
    });
    runRow.appendChild(run);
    runRow.appendChild(copy);
    if (tool.category === 'custom') {
      const delT = document.createElement('button');
      delT.className = 'btn btn-sm btn-danger';
      delT.textContent = 'Delete';
      delT.addEventListener('click', async () => {
        await window.sendToBackground('BRIDGE_TOOL_DELETE_CUSTOM', { profileId: selectedProfile, name: tool.name });
        loadTools();
      });
      runRow.appendChild(delT);
    }
    form.appendChild(runRow);
    form.appendChild(out);
    item.appendChild(form);
    item.addEventListener('click', (e) => {
      if (e.target.closest('button, input, textarea, select, pre')) return;
      form.classList.toggle('hidden');
    });
    return item;
  }

  $('br-discover').addEventListener('click', async () => {
    if (!selectedProfile) { if (window.Toast) Toast.warning('Pick a profile first'); return; }
    const btn = $('br-discover');
    btn.disabled = true;
    try {
      const r = await window.sendToBackground('BRIDGE_DISCOVER', { profileId: selectedProfile });
      if (window.Toast) Toast.success('Discovered ' + (r.tools || []).length + ' tools' + (r.service ? ' from ' + r.service : ''));
      loadTools();
      refresh(); // caps may have changed verb support
    } catch (e) {
      if (window.Toast) Toast.error('Discovery failed: ' + (e.message || e) + ' — the webhook may not have the DANMAN Bridge kit installed.');
    }
    btn.disabled = false;
  });

  $('br-tool-add').addEventListener('click', () => {
    if (!selectedProfile) { if (window.Toast) Toast.warning('Pick a profile first'); return; }
    $('br-tool-form').classList.remove('hidden');
  });
  $('br-tf-cancel').addEventListener('click', () => $('br-tool-form').classList.add('hidden'));
  $('br-tf-save').addEventListener('click', async () => {
    const name = $('br-tf-name').value.trim();
    if (!name) return;
    const params = $('br-tf-params').value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const [key, label, type] = l.split(',').map((s) => (s || '').trim());
      return { key, label: label || key, type: ['string', 'text', 'number', 'boolean', 'json'].includes(type) ? type : 'string', required: false };
    }).filter((p) => p.key);
    try {
      await window.sendToBackground('BRIDGE_TOOL_SAVE_CUSTOM', {
        profileId: selectedProfile,
        tool: { name, action: $('br-tf-action').value.trim() || name, params }
      });
      $('br-tool-form').classList.add('hidden');
      $('br-tf-name').value = ''; $('br-tf-action').value = ''; $('br-tf-params').value = '';
      loadTools();
    } catch (e) {
      if (window.Toast) Toast.error('Save failed: ' + (e.message || e));
    }
  });

  // ── Log ────────────────────────────────────────────────────────────────
  async function loadLog() {
    try {
      const r = await window.sendToBackground('BRIDGE_LOG_GET', {});
      const el = $('br-log');
      if (!r.log || !r.log.length) { el.textContent = 'No bridge calls yet.'; return; }
      el.innerHTML = r.log.slice(0, 15).map((l) =>
        '<div class="result-item"><span class="badge ' + (l.ok ? 'badge-green' : 'badge-red') + '">'
        + (l.ok ? 'ok' : 'err') + '</span> <strong>' + escText(l.action || l.verb) + '</strong>'
        + ' <span class="text-xs text-muted">' + escText(l.profile) + ' · ' + l.ms + 'ms · '
        + new Date(l.at).toLocaleTimeString() + '</span>'
        + (l.error ? '<div class="meta" style="color:#fca5a5;">' + escText(l.error) + '</div>' : '')
        + '</div>'
      ).join('');
    } catch (_) {}
  }
  $('br-log-refresh').addEventListener('click', loadLog);

  // ── Activation ─────────────────────────────────────────────────────────
  window.addEventListener('tab-activated', (e) => {
    if (e.detail && e.detail.tab === 'bridge' && !loaded) {
      loaded = true;
      refresh();
      loadLog();
    }
  });

  console.log('[DANMAN] Bridge tab loaded');
})();
