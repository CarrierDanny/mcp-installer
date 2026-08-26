/**
 * SVG tree diagram generator.
 * Renders a hierarchical tree as an SVG with nodes and connecting lines.
 */
const TreeDiagram = {
  NODE_WIDTH: 180,
  NODE_HEIGHT: 40,
  H_SPACING: 20,
  V_SPACING: 60,
  COLORS: {
    done: '#22c55e', error: '#ef4444', max_depth: '#f59e0b',
    already_visited: '#64748b', pending: '#38bdf8', crawling: '#38bdf8'
  },

  /**
   * Generate a self-contained HTML string with the SVG tree diagram.
   * @param {Object} tree - Root tree node
   * @param {Object} opts - {title, collapseDepth: 2}
   * @returns {string} Complete HTML document string
   */
  generateHTML(tree, opts) {
    opts = opts || {};
    var layout = TreeDiagram._layoutTree(tree, opts.collapseDepth || 2);
    var width = layout.totalWidth + 40;
    var height = layout.totalHeight + 40;

    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '">';
    svg += '<style>text{font-family:sans-serif;font-size:11px;fill:#e2e8f0}';
    svg += '.node-rect{rx:6;ry:6;stroke-width:1.5}.label{text-anchor:middle;dominant-baseline:central}</style>';
    svg += '<rect width="' + width + '" height="' + height + '" fill="#0f172a"/>';

    svg += TreeDiagram._renderEdges(layout.nodes);
    svg += TreeDiagram._renderNodes(layout.nodes);

    svg += '</svg>';

    return '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + (opts.title || 'Tree Diagram') + '</title>'
      + '<style>body{margin:0;background:#0f172a;overflow:auto;display:flex;justify-content:center;padding:20px}</style>'
      + '</head><body>' + svg + '</body></html>';
  },

  /**
   * Render SVG inline into a container element (for preview).
   */
  renderInline(tree, container, opts) {
    var html = TreeDiagram.generateHTML(tree, opts);
    var iframe = document.createElement('iframe');
    iframe.style.cssText = 'width:100%;height:400px;border:1px solid #334155;border-radius:8px;background:#0f172a';
    container.innerHTML = '';
    container.appendChild(iframe);
    iframe.contentDocument.open();
    iframe.contentDocument.write(html);
    iframe.contentDocument.close();
  },

  /**
   * Download diagram as HTML file.
   */
  downloadHTML(tree, filename, opts) {
    var html = TreeDiagram.generateHTML(tree, opts);
    var blob = new Blob([html], { type: 'text/html' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename || 'tree-diagram.html';
    a.click();
    URL.revokeObjectURL(url);
  },

  // --- Internal layout ---

  _layoutTree(node, collapseDepth) {
    var nodes = [];
    var depthGroups = {};

    function collect(n, d, parent) {
      if (!depthGroups[d]) depthGroups[d] = [];
      depthGroups[d].push({ node: n, parent: parent });
      var collapsed = d >= collapseDepth && n.children && n.children.length > 0;
      if (!collapsed && n.children) {
        n.children.forEach(function(c) { collect(c, d + 1, n); });
      }
    }
    collect(node, 0, null);

    var depths = Object.keys(depthGroups).map(Number);
    var maxNodesInRow = Math.max.apply(null, depths.map(function(d) { return depthGroups[d].length; }));
    var totalWidth = Math.max(400, maxNodesInRow * (TreeDiagram.NODE_WIDTH + TreeDiagram.H_SPACING));

    depths.forEach(function(d) {
      var group = depthGroups[d];
      var y = 20 + d * (TreeDiagram.NODE_HEIGHT + TreeDiagram.V_SPACING);
      var rowWidth = group.length * (TreeDiagram.NODE_WIDTH + TreeDiagram.H_SPACING);
      var startX = (totalWidth - rowWidth) / 2;

      group.forEach(function(entry, i) {
        var x = startX + i * (TreeDiagram.NODE_WIDTH + TreeDiagram.H_SPACING);
        var parentNode = entry.parent ? nodes.find(function(n) { return n.node === entry.parent; }) : null;
        nodes.push({
          node: entry.node, x: x, y: y, depth: d,
          parentX: parentNode ? parentNode.x + TreeDiagram.NODE_WIDTH / 2 : null,
          parentY: parentNode ? parentNode.y + TreeDiagram.NODE_HEIGHT : null,
          collapsed: d >= collapseDepth && entry.node.children && entry.node.children.length > 0
        });
      });
    });

    var maxDepth = Math.max.apply(null, depths);
    var totalHeight = 40 + (maxDepth + 1) * (TreeDiagram.NODE_HEIGHT + TreeDiagram.V_SPACING);

    return { nodes: nodes, totalWidth: totalWidth, totalHeight: totalHeight };
  },

  _renderEdges(nodes) {
    var svg = '<g class="edges">';
    nodes.forEach(function(n) {
      if (n.parentX !== null) {
        var x1 = n.parentX;
        var y1 = n.parentY;
        var x2 = n.x + TreeDiagram.NODE_WIDTH / 2;
        var y2 = n.y;
        var midY = (y1 + y2) / 2;
        svg += '<path d="M' + x1 + ',' + y1 + ' C' + x1 + ',' + midY + ' ' + x2 + ',' + midY + ' ' + x2 + ',' + y2 + '" fill="none" stroke="#475569" stroke-width="1.5"/>';
      }
    });
    svg += '</g>';
    return svg;
  },

  _renderNodes(nodes) {
    var svg = '<g class="nodes">';
    nodes.forEach(function(n) {
      var color = TreeDiagram.COLORS[n.node.status] || '#64748b';
      var label = (n.node.title || n.node.url || '').slice(0, 25);
      var collapsed = n.collapsed ? ' (+' + n.node.children.length + ')' : '';

      svg += '<rect class="node-rect" x="' + n.x + '" y="' + n.y + '" width="' + TreeDiagram.NODE_WIDTH + '" height="' + TreeDiagram.NODE_HEIGHT + '" fill="#1e293b" stroke="' + color + '"/>';
      svg += '<text class="label" x="' + (n.x + TreeDiagram.NODE_WIDTH / 2) + '" y="' + (n.y + TreeDiagram.NODE_HEIGHT / 2) + '">' + TreeDiagram._escSvg(label) + collapsed + '</text>';
      svg += '<text x="' + (n.x + 4) + '" y="' + (n.y + 12) + '" style="font-size:9px;fill:' + color + '">D' + n.depth + '</text>';
    });
    svg += '</g>';
    return svg;
  },

  _escSvg(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
};
