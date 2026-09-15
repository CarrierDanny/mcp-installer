/**
 * VERSION: V002R009
 * DATE: 2026-09-15
 * CHANGE: Sends via window.sendToContent
 * HISTORY:
 *   V001R230 2026-08-26 Baseline import (unstamped)
 */
// sidebar/tabs/links-tab.js — Link Extractor Tab
(function() {
  'use strict';

  const container = document.getElementById('tab-links');
  if (!container) return;

  let progressBar = null;
  let allLinks = [];
  let filteredLinks = [];

  container.innerHTML = `
    <div class="tab-title">&#128279; Link Extractor</div>
    <div class="tab-desc">Find and catalog all links on the current page</div>

    <div class="card">
      <div class="card-header">
        <span class="section-title">Extract</span>
      </div>
      <p style="font-size:12px;color:#64748b;margin-bottom:12px;">Scan for all anchor links, categorize by internal/external, and export.</p>
      <div id="links-progress"></div>
      <button class="btn btn-primary btn-block" id="btn-extract-links">&#128279; Extract All Links</button>
    </div>

    <div id="links-results" style="display:none;">
      <div class="stat-row">
        <div class="stat-box">
          <div class="value" id="links-total">0</div>
          <div class="label">Total</div>
        </div>
        <div class="stat-box">
          <div class="value" id="links-internal">0</div>
          <div class="label">Internal</div>
        </div>
        <div class="stat-box">
          <div class="value" id="links-external">0</div>
          <div class="label">External</div>
        </div>
      </div>

      <div class="card">
        <div style="display:flex;gap:8px;margin-bottom:8px;">
          <select id="links-filter" style="flex:0 0 auto;width:110px;">
            <option value="all">All</option>
            <option value="internal">Internal</option>
            <option value="external">External</option>
          </select>
          <input type="text" id="links-search" placeholder="Search URLs or text..." style="flex:1;">
        </div>
        <div id="links-table-wrapper" style="max-height:400px;overflow-y:auto;">
          <table class="data-table" id="links-table">
            <thead>
              <tr>
                <th style="width:55%;">Link URL</th>
                <th style="width:45%;">Display Text</th>
              </tr>
            </thead>
            <tbody id="links-tbody"></tbody>
          </table>
        </div>
        <div class="text-muted text-xs" style="margin-top:6px;" id="links-showing"></div>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:12px;">
        <button class="btn btn-secondary" id="btn-copy-csv" style="flex:1;">&#128203; CSV</button>
        <button class="btn btn-secondary" id="btn-copy-urls" style="flex:1;">&#128279; URLs</button>
        <button class="btn btn-secondary" id="btn-push-links" style="flex:1;">&#128202; Sheets</button>
      </div>
    </div>
  `;

  progressBar = new ProgressBar(document.getElementById('links-progress'));
  progressBar.hide();

  // Extract button
  document.getElementById('btn-extract-links').addEventListener('click', () => {
    const btn = document.getElementById('btn-extract-links');
    btn.disabled = true;
    btn.textContent = 'Scanning...';
    progressBar.start(2);
    progressBar.update(1, 'Scanning page for links...');
    window.sendToContent('GPD_REQUEST_LINKS');

    // Timeout fallback
    setTimeout(() => {
      if (btn.disabled) {
        btn.disabled = false;
        btn.innerHTML = '&#128279; Extract All Links';
        progressBar.error('Timed out');
        setTimeout(() => progressBar.hide(), 2000);
        Toast.warning('Link extraction timed out.');
      }
    }, 15000);
  });

  // Filter and search
  document.getElementById('links-filter').addEventListener('change', applyFilters);
  document.getElementById('links-search').addEventListener('input', applyFilters);

  // Copy CSV
  document.getElementById('btn-copy-csv').addEventListener('click', () => {
    if (filteredLinks.length === 0) return Toast.warning('No links to copy');
    const csv = 'URL,Display Text,Type,Domain\n' + filteredLinks.map(l =>
      `"${(l.url || '').replace(/"/g, '""')}","${(l.displayText || '').replace(/"/g, '""')}","${l.isInternal ? 'Internal' : 'External'}","${(l.domain || '').replace(/"/g, '""')}"`
    ).join('\n');
    window.copyToClipboard(csv);
    Toast.success('CSV copied to clipboard');
  });

  // Copy URLs only
  document.getElementById('btn-copy-urls').addEventListener('click', () => {
    if (filteredLinks.length === 0) return Toast.warning('No links to copy');
    window.copyToClipboard(filteredLinks.map(l => l.url).join('\n'));
    Toast.success(`${filteredLinks.length} URLs copied`);
  });

  // Push to Sheets
  document.getElementById('btn-push-links').addEventListener('click', () => {
    if (filteredLinks.length === 0) return Toast.warning('No links to push');
    const rows = filteredLinks.map(l => [l.url || '', l.displayText || '', l.isInternal ? 'Internal' : 'External', l.domain || '']);
    const values = [['URL', 'Display Text', 'Type', 'Domain'], ...rows];
    window.sendToBackground('SHEETS_APPEND', { values }).then(() => {
      Toast.success('Links pushed to Sheets');
    }).catch(err => Toast.error(err.message || 'Failed to push to Sheets'));
  });

  // Listen for link results from content script
  window.addEventListener('gpd-message', (e) => {
    if (e.detail.type === 'GPD_LINKS_RESULT') {
      displayResults(e.detail.data);
    }
  });

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function displayResults(data) {
    allLinks = data.links || [];

    const btn = document.getElementById('btn-extract-links');
    btn.disabled = false;
    btn.innerHTML = '&#128279; Extract All Links';

    progressBar.complete(`${allLinks.length} links found`);
    setTimeout(() => progressBar.hide(), 1500);

    document.getElementById('links-results').style.display = 'block';
    document.getElementById('links-total').textContent = data.total || allLinks.length;
    document.getElementById('links-internal').textContent = data.internalCount || 0;
    document.getElementById('links-external').textContent = data.externalCount || 0;

    applyFilters();

    // Add Save to Sheets button via OutputDialog
    if (typeof OutputDialog !== 'undefined') {
      const existing = document.getElementById('links-save-sheets-btn');
      if (existing) existing.remove();
      const saveBtn = document.createElement('button');
      saveBtn.id = 'links-save-sheets-btn';
      saveBtn.textContent = 'Save to Sheets';
      saveBtn.style.cssText = 'padding:8px 14px;background:#38bdf8;color:#0f172a;border:none;border-radius:6px;font-weight:600;font-size:12px;cursor:pointer;margin-top:8px;width:100%;';
      saveBtn.onclick = () => {
        OutputDialog.show({
          url: data.pageUrl || '',
          title: 'Links: ' + (data.pageUrl || ''),
          word_count: 0,
          content_rows: [],
          link_rows: allLinks.map(l => [new Date().toISOString(), l.url || '', l.displayText || '', l.isInternal ? 'Internal' : 'External', l.domain || '', '']),
          media_items: [],
          form_rows: [],
          raw_html: ''
        });
      };
      const resultsArea = document.getElementById('links-results');
      if (resultsArea) resultsArea.appendChild(saveBtn);
    }

    Toast.success(`Found ${allLinks.length} links`);
  }

  function applyFilters() {
    const filter = document.getElementById('links-filter').value;
    const search = document.getElementById('links-search').value.toLowerCase().trim();

    filteredLinks = allLinks.filter(l => {
      if (filter === 'internal' && !l.isInternal) return false;
      if (filter === 'external' && l.isInternal) return false;
      if (search) {
        const urlMatch = (l.url || '').toLowerCase().includes(search);
        const textMatch = (l.displayText || '').toLowerCase().includes(search);
        if (!urlMatch && !textMatch) return false;
      }
      return true;
    });

    renderTable();
  }

  function renderTable() {
    const tbody = document.getElementById('links-tbody');
    const showing = document.getElementById('links-showing');
    const maxDisplay = 200;
    const display = filteredLinks.slice(0, maxDisplay);

    if (display.length === 0) {
      tbody.innerHTML = `<tr><td colspan="2" style="text-align:center;color:#64748b;padding:16px;">No links match the current filter</td></tr>`;
    } else {
      tbody.innerHTML = display.map(l => {
        const truncUrl = l.url && l.url.length > 60 ? l.url.slice(0, 60) + '...' : (l.url || '');
        const typeColor = l.isInternal ? '#22c55e' : '#f59e0b';
        const typeDot = `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${typeColor};margin-right:4px;vertical-align:middle;"></span>`;
        return `
          <tr>
            <td>${typeDot}<a href="${escapeHtml(l.url)}" target="_blank" rel="noopener" style="color:#38bdf8;text-decoration:none;word-break:break-all;font-size:11px;" title="${escapeHtml(l.url)}">${escapeHtml(truncUrl)}</a></td>
            <td style="font-size:12px;color:#e2e8f0;">${escapeHtml(l.displayText) || '<em class="text-muted">[no text]</em>'}</td>
          </tr>
        `;
      }).join('');
    }

    showing.textContent = filteredLinks.length > maxDisplay
      ? `Showing ${maxDisplay} of ${filteredLinks.length} links`
      : `Showing ${filteredLinks.length} link${filteredLinks.length !== 1 ? 's' : ''}`;
  }

  console.log('[DANMAN] Links tab loaded');
})();
