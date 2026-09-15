// DriveClient_20260402_V001r734.js
// Google Drive API Integration Module for GetPower DANMAN Firefox Extension
// Supports both direct API and webhook methods

async function readResponseBody(resp) {
  const contentType = (resp.headers.get('content-type') || '').toLowerCase();
  const raw = await resp.text();
  if (!raw) return { data: null, raw: '', contentType };

  if (contentType.includes('application/json') || contentType.includes('+json')) {
    try {
      return { data: JSON.parse(raw), raw, contentType };
    } catch (err) {
      throw new Error(`Invalid JSON response (${contentType || 'unknown content type'}): ${err.message}`);
    }
  }

  return { data: null, raw, contentType };
}

function summarizeNonJsonResponse(label, contentType, raw) {
  const snippet = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 180);
  const typeLabel = contentType || 'unknown content type';
  return `${label} returned a non-JSON response (${typeLabel}). ${snippet || 'Empty response body.'}`;
}

const DriveClient = {
  // Configuration and initialization
  async _getConfig() {
    try {
      return await ConfigManager.load();
    } catch (e) {
      await Logger.log('ERROR', 'DriveClient config load failed', { error: e.message });
      throw new Error('Failed to load configuration');
    }
  },

  async _getMethod() {
    const config = await this._getConfig();
    // Explicit override wins (Settings can force api/webhook/bridge).
    const forced = config.drive?.method;
    if (forced === 'api' || forced === 'webhook' || forced === 'bridge') return forced;
    // Auto: if a Drive-capable Bridge profile is connected, prefer it — the
    // backend runs as the user, so a Folder ID alone works (no token/expiry).
    try {
      if (globalThis.BridgeRegistry && await globalThis.BridgeRegistry.hasDriveProfile()) {
        return 'bridge';
      }
    } catch (_) { /* fall through to legacy method */ }
    return config.sheets?.method || 'api';
  },

  // ============================================================================
  // BRIDGE METHOD — Drive work runs on the user's own Apps Script backend
  // (Bridge_Drive.gs), which executes as the user. No client-side token.
  // ============================================================================
  async _bridgeCreateFile(name, content, mimeType, folderId, options = {}) {
    const r = await globalThis.BridgeRegistry.driveCall('drive_create_file', {
      name, content, mimeType, folderId,
      base64: options.contentEncoding === 'base64'
    });
    return { id: r.id, name: r.name || name, mimeType: r.mimeType || mimeType };
  },
  async _bridgeCreateFolder(name, parentFolderId) {
    const r = await globalThis.BridgeRegistry.driveCall('drive_create_folder', { name, parentId: parentFolderId });
    return { id: r.id, name: r.name || name };
  },
  async _bridgeListFiles(folderId, query) {
    // memory.js passes queries like name='config.json' — extract the name.
    let nameQuery = '';
    const m = /name\s*=\s*'([^']+)'/.exec(query || '');
    if (m) nameQuery = m[1];
    const r = await globalThis.BridgeRegistry.driveCall('drive_list', { folderId, nameQuery });
    return (r && r.files) || [];
  },
  async _bridgeReadFile(fileId) {
    const r = await globalThis.BridgeRegistry.driveCall('drive_read_file', { fileId });
    return (r && r.content) || '';
  },
  async _bridgeUpdateFile(fileId, content, mimeType) {
    await globalThis.BridgeRegistry.driveCall('drive_update_file', { fileId, content, mimeType });
    return { id: fileId };
  },

  async _getToken() {
    const config = await this._getConfig();
    // Setup wizard stores the token as flat google_oauth_token; sheets.oauth_token wins when both exist
    const token = config.sheets?.oauth_token || config.google_oauth_token;
    if (!token) throw new Error('No OAuth token configured for Drive API');
    return token;
  },

  // ============================================================================
  // DIRECT API METHOD - Uses Google Drive REST API v3 with OAuth
  // ============================================================================

  async _apiCreateFile(name, content, mimeType, folderId, options = {}) {
    try {
      const token = await this._getToken();

      const metadata = {
        name,
        mimeType,
        parents: folderId ? [folderId] : []
      };

      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));

      let blob;
      if (mimeType === 'application/vnd.google-apps.spreadsheet') {
        blob = new Blob([''], { type: 'text/plain' });
      } else if (options.contentEncoding === 'base64' && typeof content === 'string') {
        const bin = atob(content);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        blob = new Blob([bytes], { type: mimeType });
      } else if (mimeType.startsWith('text/')) {
        blob = new Blob([content], { type: mimeType });
      } else if (typeof content === 'string') {
        blob = new Blob([content], { type: mimeType });
      } else {
        blob = content;
      }
      form.append('file', blob);

      const resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: form
      });

      const { data, raw, contentType } = await readResponseBody(resp);
      if (!resp.ok) {
        throw new Error(data?.error?.message || summarizeNonJsonResponse('Drive API', contentType, raw) || `Drive API error: ${resp.status}`);
      }
      if (!data) {
        throw new Error(summarizeNonJsonResponse('Drive API', contentType, raw));
      }

      await Logger.log('DRIVE_FILE_CREATED', `File created via API: ${name}`, { fileId: data.id, mimeType });
      return data;
    } catch (e) {
      await Logger.log('ERROR', 'DriveClient._apiCreateFile failed', { error: e.message, name, mimeType });
      throw e;
    }
  },

  async _apiCreateFolder(name, parentFolderId) {
    try {
      const token = await this._getToken();

      const metadata = {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentFolderId ? [parentFolderId] : []
      };

      const resp = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(metadata)
      });

      const { data, raw, contentType } = await readResponseBody(resp);
      if (!resp.ok) {
        throw new Error(data?.error?.message || summarizeNonJsonResponse('Drive API', contentType, raw) || `Drive API error: ${resp.status}`);
      }
      if (!data) {
        throw new Error(summarizeNonJsonResponse('Drive API', contentType, raw));
      }

      await Logger.log('DRIVE_FOLDER_CREATED', `Folder created via API: ${name}`, { folderId: data.id });
      return data;
    } catch (e) {
      await Logger.log('ERROR', 'DriveClient._apiCreateFolder failed', { error: e.message, name });
      throw e;
    }
  },

  async _apiListFiles(folderId, query) {
    try {
      const token = await this._getToken();

      let q = query || '';
      if (folderId) {
        q = q ? `${q} and '${folderId}' in parents` : `'${folderId}' in parents`;
      }
      q = q + " and trashed=false";

      const params = new URLSearchParams({
        q,
        pageSize: 100,
        fields: 'files(id, name, mimeType, createdTime, modifiedTime, parents)'
      });

      const resp = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const { data, raw, contentType } = await readResponseBody(resp);
      if (!resp.ok) {
        throw new Error(data?.error?.message || summarizeNonJsonResponse('Drive API', contentType, raw) || `Drive API error: ${resp.status}`);
      }
      if (!data) {
        throw new Error(summarizeNonJsonResponse('Drive API', contentType, raw));
      }

      await Logger.log('DRIVE_LIST_FILES', `Listed ${data.files?.length || 0} files`, { folderId, query });
      return data.files || [];
    } catch (e) {
      await Logger.log('ERROR', 'DriveClient._apiListFiles failed', { error: e.message, folderId });
      throw e;
    }
  },

  async _apiReadFile(fileId) {
    try {
      const token = await this._getToken();

      const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!resp.ok) {
        throw new Error(`Drive API error: ${resp.status}`);
      }

      const content = await resp.text();
      await Logger.log('DRIVE_FILE_READ', `File read via API: ${fileId}`, { fileId, contentLength: content.length });
      return content;
    } catch (e) {
      await Logger.log('ERROR', 'DriveClient._apiReadFile failed', { error: e.message, fileId });
      throw e;
    }
  },

  async _apiGetFileLink(fileId) {
    try {
      const token = await this._getToken();

      const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=webViewLink`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const { data, raw, contentType } = await readResponseBody(resp);
      if (!resp.ok) {
        throw new Error(data?.error?.message || summarizeNonJsonResponse('Drive API', contentType, raw) || `Drive API error: ${resp.status}`);
      }
      if (!data) {
        throw new Error(summarizeNonJsonResponse('Drive API', contentType, raw));
      }

      return data.webViewLink || '';
    } catch (e) {
      await Logger.log('ERROR', 'DriveClient._apiGetFileLink failed', { error: e.message, fileId });
      throw e;
    }
  },

  // ============================================================================
  // WEBHOOK METHOD - Routes through Apps Script webhook
  // ============================================================================

  async _webhookCall(action, params) {
    try {
      const config = await this._getConfig();
      let webhookUrl = config.sheets?.webhook_url || config.backend?.webhook_url;
      const webhookSecret = config.sheets?.webhook_secret || config.backend?.webhook_secret;
      if (!webhookUrl || !webhookSecret) {
        throw new Error('No webhook URL or secret configured');
      }
      webhookUrl = String(webhookUrl).split('?')[0];

      const payload = {
        action,
        ...params,
        secret: webhookSecret
      };

      const resp = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const { data, raw, contentType } = await readResponseBody(resp);
      if (!resp.ok) {
        throw new Error(data?.error || summarizeNonJsonResponse('Webhook', contentType, raw) || `Webhook error: ${resp.status}`);
      }
      if (!data) {
        throw new Error(summarizeNonJsonResponse('Webhook', contentType, raw));
      }

      if (data.success === false || data.error) {
        throw new Error(data.error || 'Webhook action failed');
      }

      return data;
    } catch (e) {
      await Logger.log('ERROR', 'DriveClient._webhookCall failed', { error: e.message, action });
      throw e;
    }
  },

  async _webhookCreateFile(name, content, mimeType, folderId, options = {}) {
    try {
      const payload = {
        name,
        content,
        mimeType,
        folderId
      };
      if (options.contentEncoding) payload.contentEncoding = options.contentEncoding;
      const result = await this._webhookCall('createFile', payload);
      await Logger.log('DRIVE_FILE_CREATED', `File created via webhook: ${name}`, { fileId: result.fileId, mimeType });
      return { id: result.fileId, name, mimeType };
    } catch (e) {
      await Logger.log('ERROR', 'DriveClient._webhookCreateFile failed', { error: e.message, name });
      throw e;
    }
  },

  async _webhookCreateFolder(name, parentFolderId) {
    try {
      const result = await this._webhookCall('createFolder', {
        name,
        parentFolderId
      });
      await Logger.log('DRIVE_FOLDER_CREATED', `Folder created via webhook: ${name}`, { folderId: result.folderId });
      return { id: result.folderId, name, mimeType: 'application/vnd.google-apps.folder' };
    } catch (e) {
      await Logger.log('ERROR', 'DriveClient._webhookCreateFolder failed', { error: e.message, name });
      throw e;
    }
  },

  async _webhookListFiles(folderId, query) {
    try {
      const result = await this._webhookCall('listFiles', {
        folderId,
        query
      });
      await Logger.log('DRIVE_LIST_FILES', `Listed ${result.files?.length || 0} files via webhook`, { folderId, query });
      return result.files || [];
    } catch (e) {
      await Logger.log('ERROR', 'DriveClient._webhookListFiles failed', { error: e.message, folderId });
      throw e;
    }
  },

  async _webhookReadFile(fileId) {
    try {
      const result = await this._webhookCall('readFile', { fileId });
      await Logger.log('DRIVE_FILE_READ', `File read via webhook: ${fileId}`, { fileId, contentLength: result.content?.length || 0 });
      return result.content || '';
    } catch (e) {
      await Logger.log('ERROR', 'DriveClient._webhookReadFile failed', { error: e.message, fileId });
      throw e;
    }
  },

  async _webhookGetFileLink(fileId) {
    try {
      const result = await this._webhookCall('getFileLink', { fileId });
      return result.link || '';
    } catch (e) {
      await Logger.log('ERROR', 'DriveClient._webhookGetFileLink failed', { error: e.message, fileId });
      throw e;
    }
  },

  // ============================================================================
  // PUBLIC API - Method-agnostic functions
  // ============================================================================

  async createFile(name, content, mimeType = 'text/plain', folderId = null, options = {}) {
    try {
      const method = await this._getMethod();
      if (method === 'bridge') return await this._bridgeCreateFile(name, content, mimeType, folderId, options);
      if (method === 'webhook') {
        return await this._webhookCreateFile(name, content, mimeType, folderId, options);
      } else {
        return await this._apiCreateFile(name, content, mimeType, folderId, options);
      }
    } catch (e) {
      await Logger.log('ERROR', 'DriveClient.createFile failed', { error: e.message, name, mimeType });
      throw e;
    }
  },

  async createFolder(name, parentFolderId = null) {
    try {
      const method = await this._getMethod();
      if (method === 'bridge') return await this._bridgeCreateFolder(name, parentFolderId);
      if (method === 'webhook') {
        return await this._webhookCreateFolder(name, parentFolderId);
      } else {
        return await this._apiCreateFolder(name, parentFolderId);
      }
    } catch (e) {
      await Logger.log('ERROR', 'DriveClient.createFolder failed', { error: e.message, name });
      throw e;
    }
  },

  async listFiles(folderId, query = '') {
    try {
      const method = await this._getMethod();
      if (method === 'bridge') return await this._bridgeListFiles(folderId, query);
      if (method === 'webhook') {
        return await this._webhookListFiles(folderId, query);
      } else {
        return await this._apiListFiles(folderId, query);
      }
    } catch (e) {
      await Logger.log('ERROR', 'DriveClient.listFiles failed', { error: e.message, folderId });
      throw e;
    }
  },

  async readFile(fileId) {
    try {
      const method = await this._getMethod();
      if (method === 'bridge') return await this._bridgeReadFile(fileId);
      if (method === 'webhook') {
        return await this._webhookReadFile(fileId);
      } else {
        return await this._apiReadFile(fileId);
      }
    } catch (e) {
      await Logger.log('ERROR', 'DriveClient.readFile failed', { error: e.message, fileId });
      throw e;
    }
  },

  async getFileLink(fileId) {
    try {
      const method = await this._getMethod();
      if (method === 'webhook') {
        return await this._webhookGetFileLink(fileId);
      } else {
        return await this._apiGetFileLink(fileId);
      }
    } catch (e) {
      await Logger.log('ERROR', 'DriveClient.getFileLink failed', { error: e.message, fileId });
      throw e;
    }
  },

  async updateFileContent(fileId, content, mimeType = 'text/plain') {
    try {
      const method = await this._getMethod();
      if (method === 'bridge') return await this._bridgeUpdateFile(fileId, content, mimeType);
      if (method === 'webhook') {
        await this._webhookCall('updateFile', { fileId, content, mimeType });
        await Logger.log('DRIVE_FILE_UPDATED', `File updated via webhook: ${fileId}`, { fileId, mimeType });
        return { id: fileId };
      }

      const token = await this._getToken();
      const resp = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': mimeType
        },
        body: content
      });

      const { data, raw, contentType } = await readResponseBody(resp);
      if (!resp.ok) {
        throw new Error(data?.error?.message || summarizeNonJsonResponse('Drive API', contentType, raw) || `Drive API error: ${resp.status}`);
      }

      await Logger.log('DRIVE_FILE_UPDATED', `File updated via API: ${fileId}`, { fileId, mimeType });
      return data || { id: fileId };
    } catch (e) {
      await Logger.log('ERROR', 'DriveClient.updateFileContent failed', { error: e.message, fileId });
      throw e;
    }
  },

  async trashFile(fileId) {
    try {
      const method = await this._getMethod();
      if (method === 'webhook') {
        await this._webhookCall('trashFile', { fileId });
        await Logger.log('DRIVE_FILE_TRASHED', `File trashed via webhook: ${fileId}`, { fileId });
        return { id: fileId, trashed: true };
      }

      const token = await this._getToken();
      const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ trashed: true })
      });

      const { data, raw, contentType } = await readResponseBody(resp);
      if (!resp.ok) {
        throw new Error(data?.error?.message || summarizeNonJsonResponse('Drive API', contentType, raw) || `Drive API error: ${resp.status}`);
      }

      await Logger.log('DRIVE_FILE_TRASHED', `File trashed via API: ${fileId}`, { fileId });
      return data || { id: fileId, trashed: true };
    } catch (e) {
      await Logger.log('ERROR', 'DriveClient.trashFile failed', { error: e.message, fileId });
      throw e;
    }
  },

  async listFolders(parentId) {
    try {
      return await this.listFiles(parentId, "mimeType='application/vnd.google-apps.folder'");
    } catch (e) {
      await Logger.log('ERROR', 'DriveClient.listFolders failed', { error: e.message, parentId });
      throw e;
    }
  },

  async getOrCreateFolder(name, parentFolderId = null) {
    try {
      const files = await this.listFiles(parentFolderId, `name='${name.replace(/'/g, "\\'")}'`);
      const existing = files.find(f => f.mimeType === 'application/vnd.google-apps.folder');
      if (existing) {
        await Logger.log('DRIVE_FOLDER_EXISTS', `Using existing folder: ${name}`, { folderId: existing.id });
        return existing;
      }
      return await this.createFolder(name, parentFolderId);
    } catch (e) {
      await Logger.log('ERROR', 'DriveClient.getOrCreateFolder failed', { error: e.message, name });
      throw e;
    }
  },

  async saveJsonFile(data, filename = 'data.json', folderId = null) {
    try {
      const content = JSON.stringify(data, null, 2);
      const result = await this.createFile(filename, content, 'application/json', folderId);
      await Logger.log('DRIVE_JSON_SAVED', `JSON file saved: ${filename}`, { fileId: result.id });
      return result;
    } catch (e) {
      await Logger.log('ERROR', 'DriveClient.saveJsonFile failed', { error: e.message, filename });
      throw e;
    }
  },

  async saveHtmlFile(html, filename = 'index.html', folderId = null) {
    try {
      const result = await this.createFile(filename, html, 'text/html', folderId);
      await Logger.log('DRIVE_HTML_SAVED', `HTML file saved: ${filename}`, { fileId: result.id });
      return result;
    } catch (e) {
      await Logger.log('ERROR', 'DriveClient.saveHtmlFile failed', { error: e.message, filename });
      throw e;
    }
  },

  async saveFormFieldsFile(formData, pageUrl, folderId = null) {
    try {
      // Extract form fields and organize by type
      const fields = {};
      const fieldTypes = {};
      const fieldValues = {};

      if (Array.isArray(formData)) {
        for (const field of formData) {
          const id = field.id || field.name || 'unnamed';
          fields[id] = {
            type: field.type || 'text',
            value: field.value || '',
            placeholder: field.placeholder || '',
            options: field.options || null
          };
          fieldTypes[id] = field.type || 'text';
          fieldValues[id] = field.value || '';
        }
      } else if (typeof formData === 'object') {
        for (const [key, val] of Object.entries(formData)) {
          fields[key] = {
            type: typeof val === 'string' ? 'text' : 'object',
            value: val,
            placeholder: '',
            options: Array.isArray(val) ? val : null
          };
          fieldTypes[key] = typeof val === 'string' ? 'text' : 'select';
          fieldValues[key] = val;
        }
      }

      // Build formatted HTML table
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Form Fields - ${pageUrl}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 20px;
      background: #f5f5f5;
      color: #333;
    }
    .container {
      max-width: 1000px;
      margin: 0 auto;
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    h1 {
      margin-top: 0;
      color: #1f2937;
      border-bottom: 2px solid #e5e7eb;
      padding-bottom: 10px;
    }
    .metadata {
      font-size: 12px;
      color: #6b7280;
      margin-bottom: 20px;
      line-height: 1.6;
    }
    .metadata strong {
      color: #374151;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    thead {
      background: #f3f4f6;
    }
    th {
      padding: 12px;
      text-align: left;
      font-weight: 600;
      border-bottom: 2px solid #d1d5db;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    td {
      padding: 12px;
      border-bottom: 1px solid #e5e7eb;
      font-size: 12px;
    }
    tr:hover {
      background: #f9fafb;
    }
    .field-name {
      font-family: 'Monaco', 'Menlo', monospace;
      color: #1f2937;
      font-weight: 500;
    }
    .field-type {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .type-text { background: #dbeafe; color: #1e40af; }
    .type-email { background: #ddd6fe; color: #5b21b6; }
    .type-number { background: #fed7aa; color: #92400e; }
    .type-checkbox { background: #d1fae5; color: #065f46; }
    .type-radio { background: #d1fae5; color: #065f46; }
    .type-select { background: #fce7f3; color: #9d174d; }
    .type-textarea { background: #e0e7ff; color: #3730a3; }
    .type-date { background: #fce7f3; color: #831843; }
    .type-other { background: #f3f4f6; color: #4b5563; }
    .field-value {
      background: #f9fafb;
      padding: 8px;
      border-radius: 3px;
      font-family: 'Monaco', 'Menlo', monospace;
      word-break: break-word;
      max-width: 300px;
      max-height: 100px;
      overflow: auto;
    }
    .empty-value {
      color: #9ca3af;
      font-style: italic;
    }
    .options-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .options-list li {
      padding: 4px 0;
      padding-left: 20px;
      position: relative;
    }
    .options-list li:before {
      content: '• ';
      position: absolute;
      left: 0;
    }
    .field-placeholder {
      color: #9ca3af;
      font-size: 11px;
      margin-top: 4px;
    }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      font-size: 11px;
      color: #6b7280;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Form Fields Extract</h1>
    <div class="metadata">
      <div><strong>Source URL:</strong> ${pageUrl}</div>
      <div><strong>Total Fields:</strong> ${Object.keys(fields).length}</div>
      <div><strong>Generated:</strong> ${new Date().toISOString()}</div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Field ID</th>
          <th>Type</th>
          <th>Current Value</th>
          <th>Options / Details</th>
        </tr>
      </thead>
      <tbody>
        ${Object.entries(fields).map(([id, field]) => {
          let typeClass = `type-${field.type.toLowerCase().replace(/\s+/g, '')}`;
          if (!['text', 'email', 'number', 'checkbox', 'radio', 'select', 'textarea', 'date'].includes(field.type.toLowerCase())) {
            typeClass = 'type-other';
          }

          let optionsHtml = '';
          if (field.options && Array.isArray(field.options)) {
            optionsHtml = `<ul class="options-list">${field.options.map(opt => `<li>${String(opt).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</li>`).join('')}</ul>`;
          } else if (field.placeholder) {
            optionsHtml = `<div class="field-placeholder">Placeholder: ${String(field.placeholder).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`;
          }

          return `<tr>
            <td class="field-name">${String(id).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>
            <td><span class="field-type ${typeClass}">${String(field.type).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span></td>
            <td><div class="field-value">${field.value ? String(field.value).replace(/</g, '&lt;').replace(/>/g, '&gt;') : '<span class="empty-value">empty</span>'}</div></td>
            <td>${optionsHtml}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>

    <div class="footer">
      <p>This document was automatically generated by the DANMAN form extractor extension.</p>
    </div>
  </div>
</body>
</html>`;

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const filename = `form-fields_${timestamp}.html`;
      const result = await this.saveHtmlFile(html, filename, folderId);
      await Logger.log('DRIVE_FORM_SAVED', `Form fields file saved: ${filename}`, { fileId: result.id, fieldCount: Object.keys(fields).length });
      return result;
    } catch (e) {
      await Logger.log('ERROR', 'DriveClient.saveFormFieldsFile failed', { error: e.message });
      throw e;
    }
  },

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  async getDefaultFolderId() {
    try {
      const config = await this._getConfig();
      return config.sheets?.drive_folder_id || null;
    } catch (e) {
      await Logger.log('ERROR', 'DriveClient.getDefaultFolderId failed', { error: e.message });
      return null;
    }
  },

  async testConnection() {
    try {
      const method = await this._getMethod();
      const config = await this._getConfig();

      if (method === 'webhook') {
        const webhookUrl = config.sheets?.webhook_url;
        const webhookSecret = config.sheets?.webhook_secret;
        if (!webhookUrl || !webhookSecret) {
          return { success: false, error: 'Webhook URL or secret not configured' };
        }

        const result = await this._webhookCall('test', {});
        return { success: true, method: 'webhook', message: 'Webhook connection successful' };
      } else {
        const token = config.sheets?.oauth_token || config.google_oauth_token;
        if (!token) {
          return { success: false, error: 'OAuth token not configured' };
        }

        const resp = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!resp.ok) {
          return { success: false, error: `Drive API error: ${resp.status}` };
        }

        const { data } = await readResponseBody(resp);
        return {
          success: true,
          method: 'api',
          message: 'Drive API connection successful',
          user: data?.user?.displayName || 'Unknown user'
        };
      }
    } catch (e) {
      await Logger.log('ERROR', 'DriveClient.testConnection failed', { error: e.message });
      return { success: false, error: e.message };
    }
  }
};

if (typeof globalThis !== 'undefined') globalThis.DriveClient = DriveClient;
// END: DriveClient_20260402_V001r734.js
