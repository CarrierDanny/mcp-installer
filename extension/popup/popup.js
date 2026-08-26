// popup.js — GetPower DANMAN Popup Controller
// Extracted from inline <script> for Firefox MV3 CSP compliance
(function () {
  'use strict';

  // ============================================================================
  // BROWSER API SHIM
  // ============================================================================
  const B = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;

  // ============================================================================
  // DOM REFERENCES
  // ============================================================================
  const statusEl = document.getElementById('status');
  const driveIndicator = document.getElementById('drive-indicator');
  const driveStatusText = document.getElementById('drive-status-text');
  const driveFolderIdInput = document.getElementById('drive-folder-id');
  const testDriveButton = document.getElementById('test-drive-button');

  // ============================================================================
  // HELPERS
  // ============================================================================

  function showStatus(msg) {
    console.log('[DANMAN Popup] Status:', msg);
    statusEl.textContent = msg;
    statusEl.style.display = 'block';
  }

  async function getActiveTab() {
    try {
      const tabs = await B.tabs.query({ active: true, currentWindow: true });
      console.log('[DANMAN Popup] Active tab:', tabs[0]?.url);
      return tabs[0] || null;
    } catch (e) {
      console.error('[DANMAN Popup] Error getting active tab:', e);
      return null;
    }
  }

  // Send message to content script with retry and content script injection
  async function sendToTab(tabId, msg) {
    console.log('[DANMAN Popup] sendToTab called, tabId:', tabId, 'msg:', JSON.stringify(msg));
    try {
      // Try direct message first
      try {
        const response = await B.tabs.sendMessage(tabId, msg);
        console.log('[DANMAN Popup] Direct message succeeded, response:', response);
        return true;
      } catch (e1) {
        console.warn('[DANMAN Popup] Direct message failed, attempting script injection:', e1.message);

        // Content script not loaded — inject both content scripts
        try {
          await B.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content/content-main.js']
          });
          console.log('[DANMAN Popup] Injected content-main.js');
        } catch (injErr1) {
          console.error('[DANMAN Popup] Failed to inject content-main.js:', injErr1.message);
          showStatus('Cannot access this page');
          return false;
        }

        try {
          await B.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content/clipboard-listener.js']
          });
          console.log('[DANMAN Popup] Injected clipboard-listener.js');
        } catch (injErr2) {
          console.warn('[DANMAN Popup] clipboard-listener.js injection skipped:', injErr2.message);
          // Non-fatal — clipboard listener is optional for sidebar toggling
        }

        // Wait for scripts to initialize
        await new Promise(function (r) { setTimeout(r, 600); });

        // Retry the message
        try {
          const retryResponse = await B.tabs.sendMessage(tabId, msg);
          console.log('[DANMAN Popup] Retry message succeeded:', retryResponse);
          return true;
        } catch (e2) {
          console.error('[DANMAN Popup] Message failed after injection:', e2.message);
          showStatus('Cannot access this page — try a regular web page');
          return false;
        }
      }
    } catch (e) {
      console.error('[DANMAN Popup] Unexpected error in sendToTab:', e);
      showStatus('Cannot access this page');
      return false;
    }
  }

  // ============================================================================
  // DRIVE CONNECTION
  // ============================================================================

  async function loadDriveFolderID() {
    try {
      // Canonical source: memory.folder_id in the one shared config — the
      // same property the sidebar Settings tab and options page use.
      const cfg = await B.runtime.sendMessage({ type: 'CONFIG_LOAD', payload: {} });
      const fid = (cfg && cfg.memory && (cfg.memory.folder_id || cfg.memory.drive_folder_id)) || '';
      if (fid) {
        driveFolderIdInput.value = fid;
        console.log('[DANMAN Popup] Loaded memory folder ID from config');
        return;
      }
      // Legacy fallback for pre-7.3 installs
      const result = await B.storage.local.get('drive_folder_id');
      if (result && result.drive_folder_id) {
        driveFolderIdInput.value = result.drive_folder_id;
      }
    } catch (e) {
      console.error('[DANMAN Popup] Error loading drive folder ID:', e);
    }
  }

  function setupDriveTest() {
    testDriveButton.addEventListener('click', async function () {
      console.log('[DANMAN Popup] Test Drive button clicked');
      try {
        var folderIdValue = driveFolderIdInput.value.trim();
        if (!folderIdValue) {
          driveStatusText.textContent = 'Enter a Folder ID';
          driveStatusText.className = 'connection-status error';
          driveIndicator.className = 'indicator red';
          return;
        }

        // Set to testing state
        driveIndicator.className = 'indicator yellow';
        driveStatusText.textContent = 'Testing...';
        driveStatusText.className = 'connection-status';
        testDriveButton.classList.add('loading');
        testDriveButton.disabled = true;

        try {
          // MEMORY_INIT is the single authoritative path: it validates the
          // folder, creates the routing subfolders (projects/chats/uploads/
          // rag/transcripts), and writes the canonical memory.folder_id that
          // every settings surface shares.
          var response = await B.runtime.sendMessage({
            type: 'MEMORY_INIT',
            payload: { folderId: folderIdValue }
          });

          if (response && response.success) {
            driveIndicator.className = 'indicator green';
            driveStatusText.textContent = 'Connected — memory routing ready';
            driveStatusText.className = 'connection-status success';
          } else {
            driveIndicator.className = 'indicator red';
            driveStatusText.textContent = (response && response.error) ? response.error : 'Connection failed';
            driveStatusText.className = 'connection-status error';
          }
        } catch (e) {
          console.error('[DANMAN Popup] Error during drive test:', e);
          driveIndicator.className = 'indicator red';
          driveStatusText.textContent = 'Error: ' + (e.message || 'Unknown error');
          driveStatusText.className = 'connection-status error';
        } finally {
          testDriveButton.classList.remove('loading');
          testDriveButton.disabled = false;
        }
      } catch (e) {
        console.error('[DANMAN Popup] Unexpected error in test drive handler:', e);
        driveIndicator.className = 'indicator red';
        driveStatusText.textContent = 'Error occurred';
        driveStatusText.className = 'connection-status error';
      }
    });
  }

  // ============================================================================
  // MENU ITEM HANDLERS
  // ============================================================================

  function setupOpenSidebar() {
    var btn = document.getElementById('open-sidebar');
    if (!btn) { console.error('[DANMAN Popup] open-sidebar button not found'); return; }
    btn.addEventListener('click', async function () {
      console.log('[DANMAN Popup] >>> Open Sidebar clicked');
      try {
        var tab = await getActiveTab();
        if (!tab || !tab.url || !tab.url.startsWith('http')) {
          showStatus('Navigate to a web page first');
          return;
        }
        var ok = await sendToTab(tab.id, { type: 'TOGGLE_SIDEBAR' });
        if (ok) {
          setTimeout(function () { window.close(); }, 200);
        }
      } catch (e) {
        console.error('[DANMAN Popup] Error in open-sidebar handler:', e);
        showStatus('Failed to open sidebar');
      }
    });
    console.log('[DANMAN Popup] open-sidebar handler attached');
  }

  function setupOpenSettings() {
    var btn = document.getElementById('open-settings');
    if (!btn) { console.error('[DANMAN Popup] open-settings button not found'); return; }
    btn.addEventListener('click', async function () {
      console.log('[DANMAN Popup] >>> Settings clicked');
      try {
        var optionsUrl = B.runtime.getURL('options/options.html');
        console.log('[DANMAN Popup] Opening options URL:', optionsUrl);
        await B.tabs.create({ url: optionsUrl });
        window.close();
      } catch (e) {
        console.error('[DANMAN Popup] Error in open-settings handler:', e);
        showStatus('Failed to open settings');
      }
    });
    console.log('[DANMAN Popup] open-settings handler attached');
  }

  function setupClipboardManager() {
    var btn = document.getElementById('clipboard-manager');
    if (!btn) { console.error('[DANMAN Popup] clipboard-manager button not found'); return; }
    btn.addEventListener('click', async function () {
      console.log('[DANMAN Popup] >>> Clipboard Manager clicked');
      try {
        var tab = await getActiveTab();
        if (!tab || !tab.url || !tab.url.startsWith('http')) {
          showStatus('Navigate to a web page first');
          return;
        }
        var ok = await sendToTab(tab.id, { type: 'TOGGLE_SIDEBAR', payload: { tab: 'clipboard' } });
        if (ok) {
          setTimeout(function () { window.close(); }, 200);
        }
      } catch (e) {
        console.error('[DANMAN Popup] Error in clipboard-manager handler:', e);
        showStatus('Failed to open clipboard manager');
      }
    });
    console.log('[DANMAN Popup] clipboard-manager handler attached');
  }

  function setupQuickScrape() {
    var btn = document.getElementById('quick-scrape');
    if (!btn) { console.error('[DANMAN Popup] quick-scrape button not found'); return; }
    btn.addEventListener('click', async function () {
      console.log('[DANMAN Popup] >>> Quick Scrape clicked');
      try {
        var tab = await getActiveTab();
        if (!tab || !tab.url || !tab.url.startsWith('http')) {
          showStatus('Navigate to a web page first');
          return;
        }
        await sendToTab(tab.id, { type: 'TOGGLE_SIDEBAR', payload: { tab: 'scrape' } });
        await new Promise(function (r) { setTimeout(r, 300); });
        await sendToTab(tab.id, { type: 'DO_SCRAPE_PAGE' });
        setTimeout(function () { window.close(); }, 200);
      } catch (e) {
        console.error('[DANMAN Popup] Error in quick-scrape handler:', e);
        showStatus('Failed to scrape page');
      }
    });
    console.log('[DANMAN Popup] quick-scrape handler attached');
  }

  function setupQuickTree() {
    var btn = document.getElementById('quick-tree');
    if (!btn) { console.error('[DANMAN Popup] quick-tree button not found'); return; }
    btn.addEventListener('click', async function () {
      console.log('[DANMAN Popup] >>> RAG Tree clicked');
      try {
        var tab = await getActiveTab();
        if (!tab || !tab.url || !tab.url.startsWith('http')) {
          showStatus('Navigate to a web page first');
          return;
        }
        await sendToTab(tab.id, { type: 'TOGGLE_SIDEBAR', payload: { tab: 'tree' } });
        try {
          // The popup closes 200 ms later, so this send is fire-and-forget —
          // its Promise still has to be caught or it lands in the Browser
          // Console as an unhandled "Receiving end does not exist."
          var crawlSend = B.runtime.sendMessage({ type: 'CRAWL_TREE', payload: { url: tab.url, depth: 3 } });
          if (crawlSend && typeof crawlSend.catch === 'function') {
            crawlSend.catch(function (treeErr) {
              console.warn('[DANMAN Popup] CRAWL_TREE not delivered:', (treeErr && treeErr.message) || treeErr);
            });
          }
        } catch (treeErr) {
          console.error('[DANMAN Popup] Error sending CRAWL_TREE:', treeErr);
        }
        setTimeout(function () { window.close(); }, 200);
      } catch (e) {
        console.error('[DANMAN Popup] Error in quick-tree handler:', e);
        showStatus('Failed to start RAG tree');
      }
    });
    console.log('[DANMAN Popup] quick-tree handler attached');
  }

  function setupScreenshot() {
    var btn = document.getElementById('screenshot');
    if (!btn) { console.error('[DANMAN Popup] screenshot button not found'); return; }
    btn.addEventListener('click', async function () {
      console.log('[DANMAN Popup] >>> Screenshot clicked');
      try {
        showStatus('Capturing...');
        try {
          var dataUrl = await B.tabs.captureVisibleTab(null, { format: 'png' });
          var activeTab = await getActiveTab();
          await B.storage.local.set({
            danman_screenshot: {
              dataUrl: dataUrl,
              timestamp: new Date().toISOString(),
              url: (activeTab && activeTab.url) ? activeTab.url : ''
            }
          });
          showStatus('Screenshot captured! Open sidebar > DANMAN to analyze.');
          setTimeout(function () { window.close(); }, 1500);
        } catch (captureError) {
          console.error('[DANMAN Popup] Error capturing screenshot:', captureError);
          showStatus('Screenshot failed: ' + (captureError.message || 'Unknown error'));
        }
      } catch (e) {
        console.error('[DANMAN Popup] Unexpected error in screenshot handler:', e);
        showStatus('Screenshot failed');
      }
    });
    console.log('[DANMAN Popup] screenshot handler attached');
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  function initializePopup() {
    console.log('[DANMAN Popup] ========================================');
    console.log('[DANMAN Popup] Initializing popup.js v6.9.0');
    console.log('[DANMAN Popup] Browser API:', B === chrome ? 'chrome' : 'browser (Firefox)');
    console.log('[DANMAN Popup] ========================================');

    // Attach all handlers
    setupOpenSidebar();
    setupOpenSettings();
    setupClipboardManager();
    setupQuickScrape();
    setupQuickTree();
    setupScreenshot();
    setupDriveTest();

    // Load saved drive folder ID
    loadDriveFolderID();

    console.log('[DANMAN Popup] All handlers attached successfully');
  }

  // Run initialization when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializePopup);
  } else {
    initializePopup();
  }
})();
// END: popup.js — GetPower DANMAN Popup Controller
