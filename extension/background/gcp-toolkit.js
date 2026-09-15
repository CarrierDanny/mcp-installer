// background/gcp-toolkit.js — Routes GCP tools via Apps Script webhook when configured
const DMS_GCPToolkit = (function () {
  async function _config() {
    if (typeof DMS_Config !== 'undefined' && DMS_Config.load) return DMS_Config.load();
    if (typeof ConfigManager !== 'undefined' && ConfigManager.load) return ConfigManager.load();
    const r = await chrome.storage.local.get('config');
    return r.config || {};
  }

  async function invoke(tool, payload) {
    const cfg = await _config();
    const gcp = cfg.gcp || {};
    const sheets = cfg.sheets || {};
    const url = sheets.webhook_url;
    const secret = sheets.webhook_secret || '';
    if (!url) throw new Error('Sheets webhook URL required for GCP toolkit (Settings → Sheets)');
    if (!gcp.project_id) throw new Error('GCP project id required (Settings → AI → GCP Vision)');

    const action = gcp.webhook_action || 'gcp_toolkit';
    const body = {
      action: action,
      tool: tool,
      project_id: gcp.project_id,
      vision_enabled: !!gcp.vision_enabled,
      speech_enabled: !!gcp.speech_enabled,
      object_detection_enabled: !!gcp.object_detection_enabled,
      memory_on_drive: gcp.memory_on_drive !== false,
      rag_scrape_to_drive: gcp.rag_scrape_to_drive !== false,
      payload: payload || {}
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: secret, ...body })
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch (e) { data = { raw: text }; }
    if (!res.ok) throw new Error((data && data.error) || text || ('HTTP ' + res.status));
    if (data && data.success === false) throw new Error(data.error || 'GCP toolkit request failed');
    return data;
  }

  return {
    visionOcr: (p) => invoke('vision_ocr', p),
    speechToText: (p) => invoke('speech_to_text', p),
    objectDetect: (p) => invoke('object_detection', p),
    memorySync: (p) => invoke('memory_sync', p),
    ragIndexUrl: (p) => invoke('rag_index_url', p)
  };
})();

if (typeof self !== 'undefined') self.DMS_GCPToolkit = DMS_GCPToolkit;
