/**
 * Tree Tab — Full-featured tree crawl UI for the sidebar.
 * Uses shared TreeRenderer, TreeExport, TreeDiagram from core/*.js
 */
(function() {
  const container = document.getElementById('tab-tree');
  if (!container) return;

  let treeData = null;
  let pollInterval = null;
  let currentStatus = 'idle';

  function sendMsg(type, payload) {
    return chrome.runtime.sendMessage({ type, payload });
  }

  // --- Build UI ---
  container.innerHTML = `
    <div style="padding:12px;">
      <div style="margin-bottom:12px;">
        <label style="color:#94a3b8;font-size:11px;display:block;margin-bottom:4px;">Start URL</label>
        <div style="display:flex;gap:4px;align-items:center;">
          <input type="text" id="tree-url" placeholder="https://example.com" style="flex:1;padding:6px 8px;background:#1e293b;border:1px solid #334155;border-radius:6px;color:#e2e8f0;font-size:12px;">
          <button id="tree-tab-picker-btn" style="padding:6px 8px;background:#1e293b;border:1px solid #334155;border-radius:6px;color:#94a3b8;font-size:12px;cursor:pointer;white-space:nowrap;" title="Pick from open browser tabs">&#128196; Tabs</button>
        </div>
        <select id="tree-tab-dropdown" style="display:none;width:100%;margin-top:4px;padding:6px 8px;background:#1e293b;border:1px solid #334155;border-radius:6px;color:#e2e8f0;font-size:11px;">
          <option value="">— Select an open tab —</option>
        </select>
      </div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;">
        <div style="flex:1;">
          <label style="color:#94a3b8;font-size:11px;display:block;margin-bottom:4px;">Max Depth</label>
          <select id="tree-depth" style="width:100%;padding:6px;background:#1e293b;border:1px solid #334155;border-radius:6px;color:#e2e8f0;font-size:12px;">
            <option value="1">1</option><option value="2">2</option><option value="3" selected>3</option>
            <option value="4">4</option><option value="5">5</option><option value="6">6</option>
          </select>
        </div>
        <div style="display:flex;gap:4px;padding-top:16px;">
          <button id="tree-start" style="padding:6px 12px;background:#38bdf8;color:#0f172a;border:none;border-radius:6px;font-weight:600;font-size:12px;cursor:pointer;">Start</button>
          <button id="tree-pause" style="padding:6px 12px;background:#f59e0b;color:#0f172a;border:none;border-radius:6px;font-weight:600;font-size:12px;cursor:pointer;display:none;">Pause</button>
          <button id="tree-resume" style="padding:6px 12px;background:#22c55e;color:#0f172a;border:none;border-radius:6px;font-weight:600;font-size:12px;cursor:pointer;display:none;">Resume</button>
          <button id="tree-cancel" style="padding:6px 12px;background:#ef4444;color:#fff;border:none;border-radius:6px;font-weight:600;font-size:12px;cursor:pointer;display:none;">Cancel</button>
        </div>
      </div>

      <div id="tree-stats" style="display:none;background:#1e293b;border-radius:8px;padding:8px 12px;margin-bottom:12px;font-size:11px;color:#94a3b8;">
        <div style="display:flex;gap:16px;justify-content:center;">
          <span>Pages: <strong id="tree-stat-pages" style="color:#22c55e;">0</strong></span>
          <span>URLs: <strong id="tree-stat-urls" style="color:#38bdf8;">0</strong></span>
          <span>Depth: <strong id="tree-stat-depth" style="color:#f59e0b;">0</strong></span>
          <span>Batches: <strong id="tree-stat-batches" style="color:#a78bfa;">0</strong></span>
        </div>
      </div>

      <div id="tree-viz" style="max-height:400px;overflow-y:auto;background:#0f172a;border:1px solid #334155;border-radius:8px;padding:8px;min-height:120px;">
        <div style="text-align:center;color:#64748b;padding:32px;font-size:12px;">Enter a URL and click Start to crawl the site tree.</div>
      </div>

      <div style="display:flex;gap:6px;margin-top:12px;flex-wrap:wrap;">
        <button id="tree-expand" style="padding:4px 10px;background:#334155;color:#e2e8f0;border:none;border-radius:4px;font-size:11px;cursor:pointer;">Expand All</button>
        <button id="tree-collapse" style="padding:4px 10px;background:#334155;color:#e2e8f0;border:none;border-radius:4px;font-size:11px;cursor:pointer;">Collapse All</button>
        <div style="flex:1;"></div>
        <button id="tree-export-btn" style="padding:4px 10px;background:#334155;color:#e2e8f0;border:none;border-radius:4px;font-size:11px;cursor:pointer;display:none;">Export ▾</button>
      </div>

      <div id="tree-export-panel" style="display:none;background:#1e293b;border:1px solid #334155;border-radius:8px;padding:12px;margin-top:8px;">
        <div style="color:#e2e8f0;font-size:12px;font-weight:600;margin-bottom:8px;">Export Formats</div>
        <label style="display:block;color:#94a3b8;font-size:11px;margin:4px 0;cursor:pointer;">
          <input type="checkbox" id="exp-flat" checked> Flat Rows → Google Sheet
        </label>
        <label style="display:block;color:#94a3b8;font-size:11px;margin:4px 0;cursor:pointer;">
          <input type="checkbox" id="exp-paths"> Path Columns → Google Sheet
        </label>
        <label style="display:block;color:#94a3b8;font-size:11px;margin:4px 0;cursor:pointer;">
          <input type="checkbox" id="exp-indented"> Indented Tree → Google Sheet
        </label>
        <label style="display:block;color:#94a3b8;font-size:11px;margin:4px 0;cursor:pointer;">
          <input type="checkbox" id="exp-diagram"> Tree Diagram → Google Drive
        </label>
        <label style="display:block;color:#94a3b8;font-size:11px;margin:4px 0;cursor:pointer;">
          <input type="checkbox" id="exp-json"> JSON → Download
        </label>
        <label style="display:block;color:#94a3b8;font-size:11px;margin:4px 0;cursor:pointer;">
          <input type="checkbox" id="exp-csv"> CSV → Download
        </label>
        <div id="tree-diagram-preview" style="margin-top:8px;"></div>
        <button id="tree-run-export" style="margin-top:8px;padding:6px 14px;background:#38bdf8;color:#0f172a;border:none;border-radius:6px;font-weight:600;font-size:12px;cursor:pointer;">Export Selected</button>
        <span id="tree-export-status" style="color:#22c55e;font-size:11px;margin-left:8px;"></span>
      </div>
    </div>`;

  // --- Element refs ---
  const urlInput = document.getElementById('tree-url');
  const depthSelect = document.getElementById('tree-depth');
  const tabPickerBtn = document.getElementById('tree-tab-picker-btn');
  const tabDropdown = document.getElementById('tree-tab-dropdown');
  const startBtn = document.getElementById('tree-start');
  const pauseBtn = document.getElementById('tree-pause');
  const resumeBtn = document.getElementById('tree-resume');
  const cancelBtn = document.getElementById('tree-cancel');
  const statsBar = document.getElementById('tree-stats');
  const vizContainer = document.getElementById('tree-viz');
  const expandBtn = document.getElementById('tree-expand');
  const collapseBtn = document.getElementById('tree-collapse');
  const exportBtn = document.getElementById('tree-export-btn');
  const exportPanel = document.getElementById('tree-export-panel');
  const runExportBtn = document.getElementById('tree-run-export');
  const exportStatus = document.getElementById('tree-export-status');

  // --- Button state management ---
  function setButtonState(status) {
    currentStatus = status;
    startBtn.style.display = (status === 'idle' || status === 'complete' || status === 'error' || status === 'cancelled') ? '' : 'none';
    pauseBtn.style.display = status === 'crawling' ? '' : 'none';
    resumeBtn.style.display = status === 'paused' ? '' : 'none';
    cancelBtn.style.display = (status === 'crawling' || status === 'paused') ? '' : 'none';
    exportBtn.style.display = treeData ? '' : 'none';
    statsBar.style.display = (status !== 'idle') ? '' : 'none';
  }

  function updateStats(state) {
    document.getElementById('tree-stat-pages').textContent = state.pagesFound || 0;
    document.getElementById('tree-stat-urls').textContent = state.uniqueUrls || 0;
    document.getElementById('tree-stat-depth').textContent = state.currentDepth || 0;
    document.getElementById('tree-stat-batches').textContent = state.batchesWritten || 0;
  }

  // --- Crawl controls ---
  startBtn.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    if (!url) { urlInput.style.borderColor = '#ef4444'; return; }
    urlInput.style.borderColor = '#334155';

    treeData = null;
    exportPanel.style.display = 'none';
    setButtonState('crawling');

    await sendMsg('CRAWL_TREE', { url, depth: parseInt(depthSelect.value) });
    startPolling();
  });

  pauseBtn.addEventListener('click', () => sendMsg('CRAWL_TREE_PAUSE'));
  resumeBtn.addEventListener('click', () => sendMsg('CRAWL_TREE_RESUME'));
  cancelBtn.addEventListener('click', () => sendMsg('CRAWL_TREE_CANCEL'));

  // --- Polling ---
  function startPolling() {
    stopPolling();
    pollInterval = setInterval(async () => {
      try {
        const state = await sendMsg('CRAWL_TREE_STATUS');
        if (!state || state.status === 'idle') { stopPolling(); setButtonState('idle'); return; }

        updateStats(state);

        if (state.status === 'crawling') {
          setButtonState('crawling');
          TreeRenderer.showProgress(vizContainer, state);
        } else if (state.status === 'paused') {
          setButtonState('paused');
          TreeRenderer.showPaused(vizContainer, state);
        } else if (state.status === 'complete') {
          stopPolling();
          setButtonState('complete');
          if (state.tree) {
            treeData = state.tree;
            TreeRenderer.renderTree(state.tree, vizContainer, 0, { compact: true, maxUrlLength: 50 });
            exportBtn.style.display = '';
            // Add Save to Sheets button via OutputDialog
            if (typeof OutputDialog !== 'undefined') {
              const existing = document.getElementById('tree-save-sheets-btn');
              if (existing) existing.remove();
              const saveBtn = document.createElement('button');
              saveBtn.id = 'tree-save-sheets-btn';
              saveBtn.textContent = 'Save to Sheets';
              saveBtn.style.cssText = 'padding:8px 14px;background:#38bdf8;color:#0f172a;border:none;border-radius:6px;font-weight:600;font-size:12px;cursor:pointer;margin-top:8px;width:100%;';
              saveBtn.onclick = () => {
                const flatLinks = [];
                (function flatten(node, depth) {
                  if (!node) return;
                  flatLinks.push([new Date().toISOString(), node.url || '', node.title || '', String(depth), String(node.children ? node.children.length : 0), node.status || '']);
                  (node.children || []).forEach(c => flatten(c, depth + 1));
                })(treeData, 0);
                OutputDialog.show({
                  url: treeData.url || '',
                  title: 'Site Tree: ' + (treeData.url || ''),
                  word_count: 0,
                  content_rows: [],
                  link_rows: flatLinks,
                  media_items: [],
                  form_rows: [],
                  raw_html: ''
                });
              };
              container.querySelector('div[style*="padding:12px"]').appendChild(saveBtn);
            }
          }
        } else if (state.status === 'cancelled') {
          stopPolling();
          setButtonState('cancelled');
          if (state.tree) {
            treeData = state.tree;
            TreeRenderer.renderTree(state.tree, vizContainer, 0, { compact: true, maxUrlLength: 50 });
            exportBtn.style.display = '';
          }
        } else if (state.status === 'error') {
          stopPolling();
          setButtonState('error');
          vizContainer.innerHTML = '<div style="color:#ef4444;text-align:center;padding:24px;font-size:12px;">Error: ' + (state.error || 'Unknown') + '</div>';
        }
      } catch (e) {
        console.warn('[Tree Tab] Poll error:', e.message);
      }
    }, 2000);
  }

  function stopPolling() {
    if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
  }

  // --- Expand / Collapse ---
  expandBtn.addEventListener('click', () => TreeRenderer.toggleAll(vizContainer, true));
  collapseBtn.addEventListener('click', () => TreeRenderer.toggleAll(vizContainer, false));

  // --- Export ---
  exportBtn.addEventListener('click', () => {
    exportPanel.style.display = exportPanel.style.display === 'none' ? '' : 'none';
    // Show diagram preview if checkbox checked
    if (document.getElementById('exp-diagram').checked && treeData) {
      TreeDiagram.renderInline(treeData, document.getElementById('tree-diagram-preview'), { collapseDepth: 2 });
    }
  });

  document.getElementById('exp-diagram').addEventListener('change', function() {
    const preview = document.getElementById('tree-diagram-preview');
    if (this.checked && treeData) {
      TreeDiagram.renderInline(treeData, preview, { collapseDepth: 2 });
    } else {
      preview.innerHTML = '';
    }
  });

  runExportBtn.addEventListener('click', async () => {
    if (!treeData) return;
    exportStatus.textContent = 'Exporting...';
    const domain = new URL(treeData.url).hostname.replace(/^www\./, '');
    const dateStr = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '');
    const baseName = 'Tree_' + domain + '_' + dateStr;

    try {
      if (document.getElementById('exp-flat').checked) {
        const rows = TreeExport.flattenToRows(treeData);
        await sendMsg('SHEETS_WEBHOOK', { action: 'tree_batch', sheet_name: baseName, rows: rows, batch_number: 1 });
      }
      if (document.getElementById('exp-paths').checked) {
        const maxD = treeData.depth != null ? 6 : 6;
        await TreeExport.exportPathColumnsToSheet(treeData, baseName, maxD);
      }
      if (document.getElementById('exp-indented').checked) {
        await TreeExport.exportIndentedToSheet(treeData, baseName);
      }
      if (document.getElementById('exp-diagram').checked) {
        const html = TreeDiagram.generateHTML(treeData, { title: 'Tree: ' + domain });
        await TreeExport.exportDiagramToDrive(html, baseName + '_diagram.html');
      }
      if (document.getElementById('exp-json').checked) {
        TreeExport.downloadJSON(treeData, baseName + '.json');
      }
      if (document.getElementById('exp-csv').checked) {
        TreeExport.downloadCSV(treeData, baseName + '.csv');
      }
      exportStatus.textContent = '✓ Export complete';
      setTimeout(() => { exportStatus.textContent = ''; }, 3000);
    } catch (e) {
      exportStatus.textContent = 'Error: ' + e.message;
      exportStatus.style.color = '#ef4444';
    }
  });

  // --- Tab Picker: Show dropdown of all open browser tabs ---
  tabPickerBtn.addEventListener('click', async () => {
    if (tabDropdown.style.display !== 'none') {
      tabDropdown.style.display = 'none';
      return;
    }
    try {
      const result = await sendMsg('GET_OPEN_TABS');
      if (result && result.success && result.tabs) {
        tabDropdown.innerHTML = '<option value="">— Select an open tab —</option>';
        result.tabs.forEach(t => {
          const opt = document.createElement('option');
          opt.value = t.url;
          const label = (t.title || t.url).substring(0, 80);
          opt.textContent = (t.active ? '\u25B6 ' : '') + label;
          opt.title = t.url;
          tabDropdown.appendChild(opt);
        });
        tabDropdown.style.display = '';
      }
    } catch (err) {
      console.warn('[Tree Tab] Failed to get open tabs:', err);
    }
  });

  tabDropdown.addEventListener('change', () => {
    const selected = tabDropdown.value;
    if (selected) {
      urlInput.value = selected;
      tabDropdown.style.display = 'none';
    }
  });

  // --- Auto-populate URL from current active tab ---
  async function autoPopulateUrl() {
    try {
      const result = await sendMsg('GET_ACTIVE_TAB_URL');
      if (result && result.success && result.url && !urlInput.value) {
        urlInput.value = result.url;
      }
    } catch (_) {}
  }

  // --- Check for active crawl on tab load ---
  (async () => {
    try {
      const state = await sendMsg('CRAWL_TREE_STATUS');
      if (state && state.status === 'crawling') {
        setButtonState('crawling');
        if (state.startUrl) urlInput.value = state.startUrl;
        startPolling();
      } else if (state && state.status === 'paused') {
        setButtonState('paused');
        if (state.startUrl) urlInput.value = state.startUrl;
        startPolling();
      } else if (state && state.status === 'complete' && state.tree) {
        treeData = state.tree;
        setButtonState('complete');
        if (state.startUrl) urlInput.value = state.startUrl;
        TreeRenderer.renderTree(state.tree, vizContainer, 0, { compact: true, maxUrlLength: 50 });
        updateStats(state);
      } else {
        // No active crawl — auto-populate with current tab URL
        autoPopulateUrl();
      }
    } catch (_) {
      autoPopulateUrl();
    }
  })();
})();
