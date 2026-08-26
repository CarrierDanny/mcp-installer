/**
 * Tree export utilities — JSON, CSV, path columns, indented rows.
 * Used by options page and sidebar tree tab.
 */
const TreeExport = {
  /**
   * Download tree as JSON file.
   */
  downloadJSON(tree, filename) {
    const blob = new Blob([JSON.stringify(tree, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'tree-export.json';
    a.click();
    URL.revokeObjectURL(url);
  },

  /**
   * Flatten tree to flat rows: [timestamp, url, title, depth, parentUrl, status, linkCount, error]
   */
  flattenToRows(node, parentUrl, rows) {
    parentUrl = parentUrl || '';
    rows = rows || [];
    rows.push([
      new Date().toISOString(),
      node.url, node.title || '', node.depth || 0,
      parentUrl, node.status || 'unknown', node.linkCount || 0, node.error || ''
    ]);
    if (node.children) {
      node.children.forEach(function(child) {
        TreeExport.flattenToRows(child, node.url, rows);
      });
    }
    return rows;
  },

  /**
   * Download tree as CSV file.
   */
  downloadCSV(tree, filename) {
    var headers = ['Timestamp', 'URL', 'Title', 'Depth', 'Parent URL', 'Status', 'Link Count', 'Error'];
    var rows = TreeExport.flattenToRows(tree);
    var lines = [headers];
    rows.forEach(function(r) {
      lines.push(r.map(function(c) {
        return '"' + String(c).replace(/"/g, '""') + '"';
      }));
    });
    var csv = lines.map(function(l) { return l.join(','); }).join('\n');
    var blob = new Blob([csv], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename || 'tree-export.csv';
    a.click();
    URL.revokeObjectURL(url);
  },

  /**
   * Build path column rows (root-to-leaf paths).
   * Each row: [D0_url, D0_title, D1_url, D1_title, ..., status, linkCount, error]
   */
  buildPathColumnRows(node, maxDepth, currentPath, rows) {
    currentPath = currentPath || [];
    rows = rows || [];
    var pathEntry = { url: node.url, title: node.title || '' };
    var newPath = currentPath.concat([pathEntry]);

    var isLeaf = !node.children || node.children.length === 0;
    var isTerminal = node.status === 'error' || node.status === 'max_depth' || node.status === 'already_visited';

    if (isLeaf || isTerminal) {
      var row = [];
      for (var d = 0; d <= maxDepth; d++) {
        if (d < newPath.length) {
          row.push(newPath[d].url, newPath[d].title);
        } else {
          row.push('', '');
        }
      }
      row.push(node.status || '', node.linkCount || 0, node.error || '');
      rows.push(row);
    }

    if (node.children) {
      node.children.forEach(function(child) {
        TreeExport.buildPathColumnRows(child, maxDepth, newPath, rows);
      });
    }
    return rows;
  },

  /**
   * Build indented rows (flat rows with leading spaces on URL).
   */
  buildIndentedRows(node, parentUrl, rows) {
    parentUrl = parentUrl || '';
    rows = rows || [];
    var depth = node.depth || 0;
    var indent = '';
    for (var i = 0; i < depth; i++) indent += '  ';
    rows.push([
      new Date().toISOString(),
      depth,
      indent + node.url,
      node.title || '',
      parentUrl,
      node.status || 'unknown',
      node.linkCount || 0,
      node.error || ''
    ]);
    if (node.children) {
      node.children.forEach(function(child) {
        TreeExport.buildIndentedRows(child, node.url, rows);
      });
    }
    return rows;
  },

  /**
   * Export path columns to Google Sheet via service worker webhook.
   */
  async exportPathColumnsToSheet(tree, sheetName, maxDepth) {
    var rows = TreeExport.buildPathColumnRows(tree, maxDepth);
    return chrome.runtime.sendMessage({
      type: 'SHEETS_WEBHOOK',
      payload: { action: 'tree_export_path_columns', sheet_name: sheetName, max_depth: maxDepth, rows: rows }
    });
  },

  /**
   * Export indented tree to Google Sheet via service worker webhook.
   */
  async exportIndentedToSheet(tree, sheetName) {
    var rows = TreeExport.buildIndentedRows(tree);
    return chrome.runtime.sendMessage({
      type: 'SHEETS_WEBHOOK',
      payload: { action: 'tree_export_indented', sheet_name: sheetName, rows: rows }
    });
  },

  /**
   * Export SVG diagram HTML to Google Drive via service worker webhook.
   */
  async exportDiagramToDrive(htmlContent, fileName) {
    return chrome.runtime.sendMessage({
      type: 'SHEETS_WEBHOOK',
      payload: { action: 'tree_export_diagram', html_content: htmlContent, file_name: fileName }
    });
  }
};
