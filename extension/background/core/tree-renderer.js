/**
 * VERSION: V002R021
 * DATE: 2026-09-15
 * CHANGE: Escape crawled titles/URLs before innerHTML
 * HISTORY:
 *   V001R158 2026-08-26 Baseline import + Firefox messaging/clipboard fixes (unstamped)
 */
/**
 * Shared tree rendering utility.
 * Used by options/options.js and sidebar/tabs/tree-tab.js
 */
// Crawled titles/URLs are untrusted page content — escape before innerHTML.
function escapeTreeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const TreeRenderer = {
  STATUS_COLORS: {
    done: '#22c55e', partial: '#a3e635', error: '#ef4444', max_depth: '#f59e0b',
    already_visited: '#64748b', pending: '#94a3b8', crawling: '#38bdf8'
  },

  STATUS_ICONS: {
    done: '', partial: '\u26a0', error: '\u26a0', max_depth: '\u23f1',
    already_visited: '\u21a9', pending: '\u2026', crawling: '\u27f3'
  },

  /**
   * Render a tree node recursively into a container.
   * @param {Object} node - {url, title, children, depth, status, error, linkCount}
   * @param {HTMLElement} container - DOM element to render into
   * @param {number} depth - current depth
   * @param {Object} opts - {maxUrlLength: 80, autoCollapseDepth: 2, compact: false, onCheckChange: null}
   */
  renderTree(node, container, depth = 0, opts = {}) {
    const maxLen = opts.maxUrlLength || 80;
    const collapseAt = opts.autoCollapseDepth != null ? opts.autoCollapseDepth : 2;
    const compact = opts.compact || false;

    if (depth === 0 && container) container.innerHTML = '';

    const item = document.createElement('div');
    item.className = 'tree-node';
    item.style.paddingLeft = (depth * (compact ? 14 : 20)) + 'px';

    const hasChildren = node.children && node.children.length > 0;
    const expandIcon = hasChildren
      ? '<span class="tree-toggle" style="cursor:pointer;margin-right:4px;">&#9660;</span>'
      : '<span style="margin-right:4px;opacity:0.3;">&#8226;</span>';

    const statusColor = TreeRenderer.STATUS_COLORS[node.status] || '#94a3b8';
    const statusIcon = TreeRenderer.STATUS_ICONS[node.status] || '';

    const linkBadge = node.linkCount > 0
      ? `<span style="font-size:10px;color:#64748b;background:#1e293b;padding:1px 5px;border-radius:4px;margin-left:6px;">${node.linkCount} links</span>`
      : '';

    const depthBadge = `<span style="font-size:10px;color:${statusColor};margin-left:4px;">D${depth}</span>`;

    const rawTitle = node.title || node.url || 'Unknown';
    const displayTitle = escapeTreeHtml(rawTitle.length > maxLen ? rawTitle.substring(0, maxLen - 3) + '...' : rawTitle);
    const safeUrl = escapeTreeHtml(node.url || '');

    const fontSize = compact ? '11px' : '12px';
    const padding = compact ? '2px 0' : '3px 0';

    item.innerHTML = `
      <div class="tree-row" style="display:flex;align-items:center;padding:${padding};border-left:2px solid ${statusColor};margin-left:${depth > 0 ? 8 : 0}px;padding-left:6px;">
        ${expandIcon}
        <label style="display:flex;align-items:center;gap:5px;cursor:pointer;margin:0;color:#e2e8f0;font-size:${fontSize};flex:1;min-width:0;">
          <input type="checkbox" class="tree-checkbox" checked data-url="${safeUrl}" data-depth="${depth}" style="margin:0;flex-shrink:0;">
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${safeUrl}">${statusIcon ? statusIcon + ' ' : ''}${displayTitle}</span>
        </label>
        ${depthBadge}${linkBadge}
      </div>`;

    const childContainer = document.createElement('div');
    childContainer.className = 'tree-children';
    childContainer.style.display = depth >= collapseAt ? 'none' : 'block';

    const toggle = item.querySelector('.tree-toggle');
    if (toggle) {
      if (depth >= collapseAt) toggle.innerHTML = '&#9654;';
      toggle.addEventListener('click', () => {
        const isOpen = childContainer.style.display !== 'none';
        childContainer.style.display = isOpen ? 'none' : 'block';
        toggle.innerHTML = isOpen ? '&#9654;' : '&#9660;';
      });
    }

    const checkbox = item.querySelector('.tree-checkbox');
    if (checkbox) {
      checkbox.addEventListener('change', () => {
        childContainer.querySelectorAll('.tree-checkbox').forEach(cb => {
          cb.checked = checkbox.checked;
        });
        if (opts.onCheckChange) opts.onCheckChange();
      });
    }

    container.appendChild(item);
    container.appendChild(childContainer);

    if (hasChildren) {
      node.children.forEach(child => TreeRenderer.renderTree(child, childContainer, depth + 1, opts));
    }
  },

  /**
   * Show crawl progress spinner with stats.
   */
  showProgress(container, data) {
    if (!container) return;
    const { url, maxDepth, pagesFound, uniqueUrls, currentUrl, currentDepth, batchesWritten, pendingBatchSize } = data;
    const truncUrl = escapeTreeHtml((currentUrl || url || '').length > 60 ? (currentUrl || url).substring(0, 57) + '...' : (currentUrl || url || ''));

    const batchInfo = batchesWritten != null
      ? `<div style="text-align:center;margin-top:8px;">
           <span style="color:#22c55e;font-size:11px;">Batches written: ${batchesWritten}</span>
           ${pendingBatchSize ? `<span style="color:#f59e0b;font-size:11px;margin-left:12px;">Pending: ${pendingBatchSize}</span>` : ''}
         </div>`
      : '';

    container.innerHTML = `
      <div style="text-align:center;padding:32px;">
        <div class="crawl-spinner" style="display:inline-block;width:40px;height:40px;border:3px solid #334155;border-top:3px solid #38bdf8;border-radius:50%;animation:spin 1s linear infinite;margin-bottom:16px;"></div>
        <style>@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}</style>
        <div style="color:#e2e8f0;font-size:14px;font-weight:600;">Crawling ${maxDepth || '?'} degrees deep...</div>
        <div style="color:#94a3b8;font-size:12px;margin-top:8px;">Depth <strong style="color:#38bdf8;">D${currentDepth || 0}</strong>: <span style="color:#38bdf8;">${truncUrl}</span></div>
        <div style="display:flex;gap:24px;justify-content:center;margin-top:16px;">
          <div style="text-align:center;">
            <div style="color:#22c55e;font-size:20px;font-weight:bold;">${pagesFound || 0}</div>
            <div style="color:#64748b;font-size:11px;">Pages Found</div>
          </div>
          <div style="text-align:center;">
            <div style="color:#38bdf8;font-size:20px;font-weight:bold;">${uniqueUrls || 0}</div>
            <div style="color:#64748b;font-size:11px;">Unique URLs</div>
          </div>
        </div>
        ${batchInfo}
        <div style="color:#64748b;font-size:11px;margin-top:12px;">Following each link to discover sub-links... this may take a while.</div>
      </div>`;
  },

  /**
   * Expand or collapse all tree nodes in a container.
   */
  toggleAll(container, expand) {
    if (!container) return;
    container.querySelectorAll('.tree-children').forEach(el => {
      el.style.display = expand ? 'block' : 'none';
    });
    container.querySelectorAll('.tree-toggle').forEach(el => {
      el.innerHTML = expand ? '&#9660;' : '&#9654;';
    });
  },

  /**
   * Show paused state in container.
   */
  showPaused(container, data) {
    if (!container) return;
    container.innerHTML = `
      <div style="text-align:center;padding:32px;">
        <div style="font-size:40px;margin-bottom:16px;">&#9208;</div>
        <div style="color:#f59e0b;font-size:16px;font-weight:600;">Crawl Paused</div>
        <div style="color:#94a3b8;font-size:12px;margin-top:8px;">${data.pagesFound || 0} pages found, ${data.uniqueUrls || 0} unique URLs</div>
        <div style="color:#64748b;font-size:11px;margin-top:8px;">Click Resume to continue or Cancel to stop.</div>
      </div>`;
  }
};
