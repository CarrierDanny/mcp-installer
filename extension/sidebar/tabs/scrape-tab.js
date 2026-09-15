/**
 * VERSION: V002R009
 * DATE: 2026-09-15
 * CHANGE: Sends via window.sendToContent
 * HISTORY:
 *   V001R643 2026-08-26 Baseline import (unstamped)
 */
// sidebar/tabs/scrape-tab.js — Web Scraper Tab
(function() {
  'use strict';

  const container = document.getElementById('tab-scrape');
  if (!container) return;

  let progressBar = null;
  let currentData = null;

  container.innerHTML = `
    <div class="tab-title">&#128269; Web Scraper</div>
    <div class="tab-desc">Extract content, headings, images, and tables from the current page</div>

    <div class="card">
      <div class="card-header">
        <span class="section-title">Quick Scrape</span>
      </div>
      <p style="font-size:12px;color:#64748b;margin-bottom:12px;">Extract structured data including text, headings, images, and tables.</p>
      <div id="scrape-progress"></div>
      <button class="btn btn-primary btn-block" id="btn-scrape">&#128269; Scrape This Page</button>
    </div>

    <div id="scrape-results" style="display:none;">
      <div class="card">
        <div class="card-header">
          <span class="section-title">Page Info</span>
        </div>
        <h4 style="margin:0 0 4px;color:#e2e8f0;font-size:14px;" id="scrape-title"></h4>
        <div class="text-muted text-xs truncate" style="margin-bottom:10px;" id="scrape-url"></div>
        <div class="stat-row">
          <div class="stat-box">
            <div class="value" id="stat-words">0</div>
            <div class="label">Words</div>
          </div>
          <div class="stat-box">
            <div class="value" id="stat-headings">0</div>
            <div class="label">Headings</div>
          </div>
          <div class="stat-box">
            <div class="value" id="stat-images">0</div>
            <div class="label">Images</div>
          </div>
        </div>
        <div class="stat-row">
          <div class="stat-box">
            <div class="value" id="stat-tables">0</div>
            <div class="label">Tables</div>
          </div>
          <div class="stat-box">
            <div class="value" id="stat-links">0</div>
            <div class="label">Links</div>
          </div>
          <div class="stat-box">
            <div class="value" id="stat-time">-</div>
            <div class="label">Scraped</div>
          </div>
        </div>
      </div>

      <div class="card" id="headings-section">
        <div class="card-header" style="cursor:pointer;" id="headings-toggle">
          <span class="section-title" style="margin-bottom:0;">Headings</span>
          <span class="text-muted" id="headings-arrow">&#9660;</span>
        </div>
        <div id="headings-list" class="expandable-content" style="max-height:0;overflow:hidden;transition:max-height 0.3s ease;"></div>
      </div>

      <div class="card" id="images-section">
        <div class="card-header" style="cursor:pointer;" id="images-toggle">
          <span class="section-title" style="margin-bottom:0;">Images</span>
          <span class="text-muted" id="images-arrow">&#9660;</span>
        </div>
        <div id="images-list" class="expandable-content" style="max-height:0;overflow:hidden;transition:max-height 0.3s ease;"></div>
      </div>

      <div class="card" id="tables-section">
        <div class="card-header" style="cursor:pointer;" id="tables-toggle">
          <span class="section-title" style="margin-bottom:0;">Tables</span>
          <span class="text-muted" id="tables-arrow">&#9660;</span>
        </div>
        <div id="tables-list" class="expandable-content" style="max-height:0;overflow:hidden;transition:max-height 0.3s ease;"></div>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:12px;">
        <button class="btn btn-secondary" id="btn-copy-scrape" style="flex:1;">&#128203; Copy JSON</button>
        <button class="btn btn-secondary" id="btn-push-scrape" style="flex:1;">&#128202; Push to Sheets</button>
      </div>
    </div>
  `;

  // Expandable section toggle helper
  function setupToggle(toggleId, contentId, arrowId) {
    const toggle = document.getElementById(toggleId);
    const content = document.getElementById(contentId);
    const arrow = document.getElementById(arrowId);
    if (!toggle || !content) return;
    let expanded = false;
    toggle.addEventListener('click', () => {
      expanded = !expanded;
      content.style.maxHeight = expanded ? '400px' : '0';
      content.style.overflowY = expanded ? 'auto' : 'hidden';
      content.style.marginTop = expanded ? '8px' : '0';
      if (arrow) arrow.textContent = expanded ? '\u25B2' : '\u25BC';
    });
  }

  setupToggle('headings-toggle', 'headings-list', 'headings-arrow');
  setupToggle('images-toggle', 'images-list', 'images-arrow');
  setupToggle('tables-toggle', 'tables-list', 'tables-arrow');

  progressBar = new ProgressBar(document.getElementById('scrape-progress'));
  progressBar.hide();

  document.getElementById('btn-scrape').addEventListener('click', () => {
    const btn = document.getElementById('btn-scrape');
    btn.disabled = true;
    btn.textContent = 'Scraping...';
    progressBar.start(3);
    progressBar.update(1, 'Requesting page data...');
    window.sendToContent('GPD_REQUEST_SCRAPE');

    // Timeout fallback
    setTimeout(() => {
      if (btn.disabled) {
        btn.disabled = false;
        btn.innerHTML = '&#128269; Scrape This Page';
        progressBar.error('Timed out');
        setTimeout(() => progressBar.hide(), 2000);
        Toast.warning('Scrape timed out. The page may be too complex.');
      }
    }, 15000);
  });

  document.getElementById('btn-copy-scrape').addEventListener('click', () => {
    if (!currentData) return Toast.warning('No data to copy');
    window.copyToClipboard(JSON.stringify(currentData, null, 2));
    Toast.success('Scrape data copied to clipboard');
  });

  document.getElementById('btn-push-scrape').addEventListener('click', () => {
    if (!currentData) return Toast.warning('No data to push');
    const row = [[
      currentData.title || '',
      currentData.url || '',
      currentData.wordCount || 0,
      currentData.headingCount || 0,
      currentData.imageCount || 0,
      currentData.tableCount || 0,
      currentData.scrapedAt || new Date().toISOString()
    ]];
    window.sendToBackground('SHEETS_APPEND', { values: row }).then(() => {
      Toast.success('Data pushed to Sheets');
    }).catch(err => Toast.error(err.message || 'Failed to push to Sheets'));
  });

  // Listen for scrape results from content script
  window.addEventListener('gpd-message', (e) => {
    if (e.detail.type === 'GPD_SCRAPE_RESULT') {
      displayResults(e.detail.data);
    }
  });

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function displayResults(data) {
    currentData = data;

    const btn = document.getElementById('btn-scrape');
    btn.disabled = false;
    btn.innerHTML = '&#128269; Scrape This Page';

    progressBar.update(2, 'Processing results...');
    progressBar.complete('Done');
    setTimeout(() => progressBar.hide(), 1500);

    document.getElementById('scrape-results').style.display = 'block';
    document.getElementById('scrape-title').textContent = data.title || 'Untitled';
    document.getElementById('scrape-url').textContent = data.url || '';
    document.getElementById('scrape-url').title = data.url || '';
    document.getElementById('stat-words').textContent = (data.wordCount || 0).toLocaleString();
    document.getElementById('stat-headings').textContent = data.headingCount || 0;
    document.getElementById('stat-images').textContent = data.imageCount || 0;
    document.getElementById('stat-tables').textContent = data.tableCount || 0;
    document.getElementById('stat-links').textContent = data.linkCount || 0;
    document.getElementById('stat-time').textContent = data.scrapedAt
      ? new Date(data.scrapedAt).toLocaleTimeString()
      : new Date().toLocaleTimeString();

    // Headings
    const headingsList = document.getElementById('headings-list');
    if (data.headings && data.headings.length > 0) {
      headingsList.innerHTML = data.headings.map(h => {
        const indent = (h.level - 1) * 16;
        const size = Math.max(11, 16 - h.level);
        const color = h.level === 1 ? '#38bdf8' : h.level === 2 ? '#e2e8f0' : '#94a3b8';
        return `<div style="padding:3px 0;padding-left:${indent}px;font-size:${size}px;color:${color};">
          <span class="badge badge-cyan" style="font-size:10px;margin-right:4px;">H${h.level}</span>${escapeHtml(h.text)}
        </div>`;
      }).join('');
    } else {
      headingsList.innerHTML = '<div class="empty-state" style="padding:12px 0;"><div class="message">No headings found</div></div>';
    }

    // Images
    const imagesList = document.getElementById('images-list');
    if (data.images && data.images.length > 0) {
      const imgs = data.images.slice(0, 30);
      imagesList.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;">
          ${imgs.map(img => `
            <div style="text-align:center;background:#0f172a;border-radius:4px;padding:4px;">
              <img src="${escapeHtml(img.src)}" style="max-width:100%;max-height:60px;border-radius:3px;" onerror="this.style.display='none';this.nextElementSibling.style.display='block';">
              <div style="display:none;font-size:10px;color:#ef4444;padding:4px;">Failed</div>
              <div style="font-size:10px;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px;" title="${escapeHtml(img.alt)}">${escapeHtml(img.alt) || '<em>no alt</em>'}</div>
            </div>
          `).join('')}
        </div>
        ${data.images.length > 30 ? `<div class="text-muted text-xs" style="margin-top:6px;">...and ${data.images.length - 30} more images</div>` : ''}
      `;
    } else {
      imagesList.innerHTML = '<div class="empty-state" style="padding:12px 0;"><div class="message">No images found</div></div>';
    }

    // Tables
    const tablesList = document.getElementById('tables-list');
    if (data.tables && data.tables.length > 0) {
      tablesList.innerHTML = data.tables.map((t, i) => {
        const headers = t.headers && t.headers.length > 0
          ? t.headers
          : (t.rows && t.rows[0] ? t.rows[0].map((_, ci) => `Col ${ci + 1}`) : []);
        const previewRows = (t.rows || []).slice(0, 5);
        return `
          <div style="margin:${i > 0 ? '12px' : '0'} 0;">
            <div class="text-muted text-xs" style="margin-bottom:4px;">Table ${i + 1}: ${t.rowCount || (t.rows ? t.rows.length : 0)} rows</div>
            <div style="overflow-x:auto;">
              <table class="data-table">
                <thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
                <tbody>${previewRows.map(r =>
                  `<tr>${r.map(c => `<td title="${escapeHtml(String(c))}">${escapeHtml(String(c))}</td>`).join('')}</tr>`
                ).join('')}</tbody>
              </table>
            </div>
            ${(t.rowCount || 0) > 5 ? `<div class="text-muted text-xs" style="margin-top:4px;">...and ${(t.rowCount || t.rows.length) - 5} more rows</div>` : ''}
          </div>
        `;
      }).join('');
    } else {
      tablesList.innerHTML = '<div class="empty-state" style="padding:12px 0;"><div class="message">No tables found</div></div>';
    }

    // Add Save to Sheets button via OutputDialog
    if (typeof OutputDialog !== 'undefined') {
      const existing = document.getElementById('scrape-save-sheets-btn');
      if (existing) existing.remove();
      const saveBtn = document.createElement('button');
      saveBtn.id = 'scrape-save-sheets-btn';
      saveBtn.textContent = 'Save to Sheets';
      saveBtn.style.cssText = 'padding:8px 14px;background:#38bdf8;color:#0f172a;border:none;border-radius:6px;font-weight:600;font-size:12px;cursor:pointer;margin-top:8px;width:100%;';
      saveBtn.onclick = () => {
        OutputDialog.show({
          url: data.url || '',
          title: data.title || '',
          word_count: data.wordCount || 0,
          content_rows: (data.headings || []).map(h => [new Date().toISOString(), 'heading', 'h' + h.level, h.text || '', (h.text || '').split(/\s+/).length, 0]),
          link_rows: (data.links || []).map(l => [new Date().toISOString(), l.href || l.url || '', l.text || l.anchor || '', '', '', '']),
          media_items: (data.images || []).map(img => ({ url: img.src || img.url || '', type: 'image', filename: img.alt || '' })),
          form_rows: [],
          raw_html: data.rawHtml || data.html || ''
        });
      };
      const resultsArea = document.getElementById('scrape-results');
      if (resultsArea) resultsArea.appendChild(saveBtn);
    }

    // Add Save All to Drive button
    const existingDriveBtn = document.getElementById('scrape-save-drive-btn');
    if (existingDriveBtn) existingDriveBtn.remove();
    const driveBtn = document.createElement('button');
    driveBtn.id = 'scrape-save-drive-btn';
    driveBtn.textContent = '\uD83D\uDCC1 Save All to Drive';
    driveBtn.style.cssText = 'padding:8px 14px;background:#166534;color:#86efac;border:none;border-radius:6px;font-weight:600;font-size:12px;cursor:pointer;margin-top:6px;width:100%;';
    driveBtn.onclick = async () => {
      driveBtn.disabled = true;
      driveBtn.textContent = 'Saving to Drive...';
      try {
        const pageUrl = data.url || window.location.href || 'unknown';
        const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const safeDomain = pageUrl.replace(/https?:\/\//, '').replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 50);
        const sessionFolder = `${safeDomain}_${ts}`;

        // Save HTML content
        const htmlContent = data.rawHtml || data.html || data.bodyText || '';
        if (htmlContent) {
          await window.sendToBackground('DRIVE_SAVE_HTML', {
            name: `page_content_${ts}.html`,
            html: htmlContent,
            url: pageUrl,
            sessionFolder
          });
        }

        // Save JSON metadata
        await window.sendToBackground('DRIVE_SAVE_JSON', {
          name: `metadata_${ts}.json`,
          data: {
            url: pageUrl,
            title: data.title || '',
            wordCount: data.wordCount || 0,
            headingCount: data.headingCount || 0,
            imageCount: data.imageCount || 0,
            tableCount: data.tableCount || 0,
            scrapedAt: data.scrapedAt || new Date().toISOString(),
            headings: data.headings || [],
            tables: (data.tables || []).map(t => ({ headers: t.headers, rowCount: t.rowCount }))
          },
          sessionFolder
        });

        // Save images to Drive
        const images = data.images || [];
        let savedImages = 0;
        for (const img of images) {
          if (img.src && !img.src.startsWith('data:')) {
            try {
              await window.sendToBackground('DRIVE_SAVE_MEDIA', {
                url: img.src,
                data: img.src,
                mimeType: 'image/png',
                fileName: (img.alt || `image_${savedImages}`).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60) + '.png',
                sessionFolder
              });
              savedImages++;
            } catch (imgErr) {
              console.warn('[Scrape] Failed to save image:', img.src, imgErr);
            }
          }
        }

        driveBtn.textContent = '\u2705 Saved to Drive!';
        driveBtn.style.background = '#166534';
        if (window.Toast) Toast.success(`Saved to Drive: HTML + metadata${savedImages > 0 ? ` + ${savedImages} images` : ''}`);
        setTimeout(() => {
          driveBtn.textContent = '\uD83D\uDCC1 Save All to Drive';
          driveBtn.disabled = false;
        }, 3000);
      } catch (err) {
        driveBtn.textContent = '\u274C Save Failed';
        driveBtn.style.background = '#991b1b';
        if (window.Toast) Toast.error('Drive save failed: ' + (err.message || err));
        setTimeout(() => {
          driveBtn.textContent = '\uD83D\uDCC1 Save All to Drive';
          driveBtn.style.background = '#166534';
          driveBtn.disabled = false;
        }, 3000);
      }
    };
    const resultsArea2 = document.getElementById('scrape-results');
    if (resultsArea2) resultsArea2.appendChild(driveBtn);

    // Add Save All to Local (ZIP download) button
    const existingLocalBtn = document.getElementById('scrape-save-local-btn');
    if (existingLocalBtn) existingLocalBtn.remove();
    const localBtn = document.createElement('button');
    localBtn.id = 'scrape-save-local-btn';
    localBtn.textContent = '\uD83D\uDCBE Save All to Local (ZIP)';
    localBtn.style.cssText = 'padding:8px 14px;background:#1e40af;color:#93c5fd;border:none;border-radius:6px;font-weight:600;font-size:12px;cursor:pointer;margin-top:6px;width:100%;';
    localBtn.onclick = async () => {
      localBtn.disabled = true;
      localBtn.textContent = 'Building ZIP...';
      try {
        const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const pageUrl = data.url || 'unknown';
        const safeDomain = pageUrl.replace(/https?:\/\//, '').replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 50);

        // Build file entries for the ZIP
        const files = [];

        // 1) Metadata JSON
        const metadata = {
          url: pageUrl,
          title: data.title || '',
          wordCount: data.wordCount || 0,
          headingCount: data.headingCount || 0,
          imageCount: data.imageCount || 0,
          tableCount: data.tableCount || 0,
          linkCount: data.linkCount || 0,
          scrapedAt: data.scrapedAt || new Date().toISOString(),
          headings: data.headings || [],
          tables: (data.tables || []).map(t => ({ headers: t.headers, rowCount: t.rowCount, rows: t.rows }))
        };
        files.push({ name: 'metadata.json', content: JSON.stringify(metadata, null, 2) });

        // 2) Full HTML content
        const htmlContent = data.rawHtml || data.html || data.bodyText || '';
        if (htmlContent) {
          files.push({ name: 'page_content.html', content: htmlContent });
        }

        // 3) Plain text extract
        const textContent = data.bodyText || data.text || '';
        if (textContent) {
          files.push({ name: 'page_text.txt', content: textContent });
        }

        // 4) Image URL list
        const images = data.images || [];
        if (images.length > 0) {
          const imgList = images.map((img, i) => `${i + 1}. ${img.src || img.url || ''}\n   Alt: ${img.alt || '(none)'}`).join('\n\n');
          files.push({ name: 'image_urls.txt', content: `Image URLs from ${pageUrl}\nScraped: ${ts}\n\n${imgList}` });
        }

        // 5) Links list
        const links = data.links || [];
        if (links.length > 0) {
          const linkCsv = 'URL,Text\n' + links.map(l => {
            const href = (l.href || l.url || '').replace(/"/g, '""');
            const text = (l.text || l.anchor || '').replace(/"/g, '""');
            return `"${href}","${text}"`;
          }).join('\n');
          files.push({ name: 'links.csv', content: linkCsv });
        }

        // Build ZIP using minimal ZIP format (no external library needed)
        const zipBlob = buildZipBlob(files);
        const zipUrl = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = zipUrl;
        a.download = `scrape_${safeDomain}_${ts}.zip`;
        a.click();
        URL.revokeObjectURL(zipUrl);

        localBtn.textContent = '\u2705 ZIP Downloaded!';
        if (window.Toast) Toast.success('ZIP downloaded with ' + files.length + ' files');
        setTimeout(() => {
          localBtn.textContent = '\uD83D\uDCBE Save All to Local (ZIP)';
          localBtn.disabled = false;
        }, 3000);
      } catch (err) {
        localBtn.textContent = '\u274C ZIP Failed';
        if (window.Toast) Toast.error('ZIP creation failed: ' + (err.message || err));
        setTimeout(() => {
          localBtn.textContent = '\uD83D\uDCBE Save All to Local (ZIP)';
          localBtn.disabled = false;
        }, 3000);
      }
    };
    const resultsArea3 = document.getElementById('scrape-results');
    if (resultsArea3) resultsArea3.appendChild(localBtn);

    Toast.success(`Scraped: ${(data.wordCount || 0).toLocaleString()} words`);
  }

  // ============================================================================
  // MINIMAL ZIP BUILDER — Creates a valid ZIP file from text entries
  // No external library required. Supports store (no compression) for simplicity.
  // ============================================================================

  function buildZipBlob(files) {
    // ZIP format: local file headers + data + central directory + end record
    var localParts = [];
    var centralParts = [];
    var offset = 0;

    for (var i = 0; i < files.length; i++) {
      var name = files[i].name;
      var content = files[i].content || '';
      var nameBytes = new TextEncoder().encode(name);
      var dataBytes = new TextEncoder().encode(content);

      // CRC-32 calculation
      var crc = crc32(dataBytes);

      // Local file header (30 bytes + name + data)
      var localHeader = new Uint8Array(30 + nameBytes.length);
      var lv = new DataView(localHeader.buffer);
      lv.setUint32(0, 0x04034b50, true);  // local file header signature
      lv.setUint16(4, 20, true);           // version needed
      lv.setUint16(6, 0, true);            // general purpose bit flag
      lv.setUint16(8, 0, true);            // compression method (store)
      lv.setUint16(10, 0, true);           // last mod file time
      lv.setUint16(12, 0, true);           // last mod file date
      lv.setUint32(14, crc, true);         // crc-32
      lv.setUint32(18, dataBytes.length, true); // compressed size
      lv.setUint32(22, dataBytes.length, true); // uncompressed size
      lv.setUint16(26, nameBytes.length, true); // file name length
      lv.setUint16(28, 0, true);           // extra field length
      localHeader.set(nameBytes, 30);

      localParts.push(localHeader);
      localParts.push(dataBytes);

      // Central directory header (46 bytes + name)
      var centralHeader = new Uint8Array(46 + nameBytes.length);
      var cv = new DataView(centralHeader.buffer);
      cv.setUint32(0, 0x02014b50, true);   // central directory header signature
      cv.setUint16(4, 20, true);            // version made by
      cv.setUint16(6, 20, true);            // version needed
      cv.setUint16(8, 0, true);             // general purpose bit flag
      cv.setUint16(10, 0, true);            // compression method
      cv.setUint16(12, 0, true);            // last mod file time
      cv.setUint16(14, 0, true);            // last mod file date
      cv.setUint32(16, crc, true);          // crc-32
      cv.setUint32(20, dataBytes.length, true); // compressed size
      cv.setUint32(24, dataBytes.length, true); // uncompressed size
      cv.setUint16(28, nameBytes.length, true); // file name length
      cv.setUint16(30, 0, true);            // extra field length
      cv.setUint16(32, 0, true);            // file comment length
      cv.setUint16(34, 0, true);            // disk number start
      cv.setUint16(36, 0, true);            // internal file attributes
      cv.setUint32(38, 0, true);            // external file attributes
      cv.setUint32(42, offset, true);       // relative offset of local header
      centralHeader.set(nameBytes, 46);

      centralParts.push(centralHeader);
      offset += localHeader.length + dataBytes.length;
    }

    var centralDirOffset = offset;
    var centralDirSize = 0;
    for (var j = 0; j < centralParts.length; j++) {
      centralDirSize += centralParts[j].length;
    }

    // End of central directory record (22 bytes)
    var endRecord = new Uint8Array(22);
    var ev = new DataView(endRecord.buffer);
    ev.setUint32(0, 0x06054b50, true);       // end of central dir signature
    ev.setUint16(4, 0, true);                 // number of this disk
    ev.setUint16(6, 0, true);                 // disk where central dir starts
    ev.setUint16(8, files.length, true);       // entries on this disk
    ev.setUint16(10, files.length, true);      // total entries
    ev.setUint32(12, centralDirSize, true);    // size of central directory
    ev.setUint32(16, centralDirOffset, true);  // offset of central directory
    ev.setUint16(20, 0, true);                 // comment length

    var allParts = localParts.concat(centralParts).concat([endRecord]);
    return new Blob(allParts, { type: 'application/zip' });
  }

  // CRC-32 implementation for ZIP integrity
  function crc32(bytes) {
    var table = crc32.table;
    if (!table) {
      table = new Uint32Array(256);
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) {
          c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[n] = c;
      }
      crc32.table = table;
    }
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) {
      crc = table[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  // ===== Multi-Tab Full Extract → RAG folder =====
  // Pick any open tabs; each is ripped completely — page.html, styles.css,
  // page.json, widgets.json (every button/input/iframe with a selector),
  // and media files — into its own folder under memory rag/, with a link
  // row appended to the master sheet's RAG_JOBS tab.
  const ripCard = document.createElement('div');
  ripCard.className = 'card';
  ripCard.innerHTML = `
    <div class="card-header">
      <span class="section-title">Multi-Tab Full Extract &rarr; RAG</span>
      <button class="btn btn-sm btn-secondary" id="rip-list">List open tabs</button>
    </div>
    <div class="tab-desc" style="margin-bottom:8px;">Everything from each chosen tab — HTML, all CSS, structured JSON, every widget, and media — saved to your Drive rag/ folder and logged to the RAG_JOBS sheet.</div>
    <div id="rip-tabs" class="text-sm text-muted">Press "List open tabs" to choose what to extract.</div>
    <div class="toggle-row" style="margin-top:6px;">
      <label for="rip-media">Include media files (max 30, 2&nbsp;MB each)</label>
      <input type="checkbox" id="rip-media" checked style="width:14px;height:14px;accent-color:#0ea5e9;">
    </div>
    <button class="btn btn-primary btn-sm btn-block mt-2" id="rip-run" disabled>&#9889; Extract selected &rarr; RAG folder</button>
    <div id="rip-progress" class="mt-2"></div>
  `;
  container.appendChild(ripCard);

  const ripTabsEl = ripCard.querySelector('#rip-tabs');
  const ripRunBtn = ripCard.querySelector('#rip-run');
  const ripProg = ripCard.querySelector('#rip-progress');

  function escT(s) { const d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; }

  ripCard.querySelector('#rip-list').addEventListener('click', async () => {
    ripTabsEl.textContent = 'Loading tabs…';
    try {
      const r = await window.sendToBackground('TABS_LIST', {});
      const tabs = r.tabs || [];
      if (!tabs.length) { ripTabsEl.textContent = 'No http(s) tabs open.'; return; }
      ripTabsEl.innerHTML = tabs.map((t) =>
        '<div class="toggle-row" style="padding:4px 0;">'
        + '<label style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + escT(t.url) + '">'
        + (t.favIconUrl ? '<img src="' + escT(t.favIconUrl) + '" style="width:12px;height:12px;margin-right:6px;vertical-align:middle;">' : '')
        + escT(t.title) + '</label>'
        + '<input type="checkbox" class="rip-tab-check" data-tab-id="' + t.id + '"' + (t.active ? ' checked' : '') + ' style="width:14px;height:14px;accent-color:#0ea5e9;">'
        + '</div>'
      ).join('');
      ripRunBtn.disabled = false;
    } catch (e) {
      ripTabsEl.innerHTML = '<span style="color:#fca5a5;">' + escT(e.message || e) + '</span>';
    }
  });

  ripRunBtn.addEventListener('click', async () => {
    const chosen = Array.from(ripCard.querySelectorAll('.rip-tab-check:checked')).map((c) => Number(c.dataset.tabId));
    if (!chosen.length) { if (window.Toast) Toast.warning('Tick at least one tab'); return; }
    ripRunBtn.disabled = true;
    ripProg.innerHTML = '';
    for (const tabId of chosen) {
      const line = document.createElement('div');
      line.className = 'result-item';
      line.textContent = 'Extracting tab ' + tabId + '…';
      ripProg.appendChild(line);
      try {
        const r = await window.sendToBackground('RIP_TAB', {
          tabId,
          includeMedia: ripCard.querySelector('#rip-media').checked
        });
        line.innerHTML = '<span class="badge badge-green">done</span> '
          + r.files.length + ' files, ' + r.mediaCount + ' media'
          + (r.skipped.length ? ', ' + r.skipped.length + ' skipped' : '')
          + ' — <a href="' + escT(r.folderLink) + '" target="_blank" style="color:#38bdf8;">open RAG folder</a>';
      } catch (e) {
        line.innerHTML = '<span class="badge badge-red">failed</span> ' + escT(e.message || e);
      }
    }
    ripRunBtn.disabled = false;
    if (window.Toast) Toast.success('Extraction finished — links logged to RAG_JOBS');
  });

  console.log('[DANMAN] Scrape tab loaded');
})();
