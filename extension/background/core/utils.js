// core/utils.js — Shared Utilities
const Utils = {
  // Generate UUID v4
  uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  },

  // Timestamp
  now() { return new Date().toISOString(); },

  // URL helpers
  isValidUrl(str) {
    try { new URL(str); return true; } catch { return false; }
  },
  normalizeUrl(url, baseUrl) {
    try {
      return new URL(url, baseUrl).href;
    } catch { return url; }
  },
  getDomain(url) {
    try { return new URL(url).hostname; } catch { return ''; }
  },
  isSameDomain(url1, url2) {
    return this.getDomain(url1) === this.getDomain(url2);
  },

  // Text helpers
  truncate(str, maxLen = 200) {
    if (!str || str.length <= maxLen) return str;
    return str.slice(0, maxLen) + '...';
  },
  stripHtml(html) {
    const div = typeof document !== 'undefined' ? document.createElement('div') : null;
    if (div) { div.innerHTML = html; return div.textContent || ''; }
    return html.replace(/<[^>]*>/g, '');
  },
  wordCount(text) {
    return (text || '').trim().split(/\s+/).filter(Boolean).length;
  },

  // Phone number cleaning (North American format)
  cleanPhone(phone) {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 11 && digits[0] === '1') {
      return `(${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`;
    }
    if (digits.length === 10) {
      return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
    }
    return phone;
  },

  // Deep merge objects
  deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source || {})) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])
          && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
        result[key] = this.deepMerge(target[key], source[key]);
      } else if (source[key] !== undefined) {
        result[key] = source[key];
      }
    }
    return result;
  },

  // CSV export helper
  toCSV(headers, rows) {
    const escape = (v) => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.map(escape).join(',')];
    for (const row of rows) {
      lines.push(headers.map((h, i) => escape(row[i] ?? row[h] ?? '')).join(','));
    }
    return lines.join('\n');
  },

  // Time formatting
  formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms/1000).toFixed(1)}s`;
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${mins}m ${secs}s`;
  },

  // ETA calculator
  calculateETA(completed, total, startTime) {
    if (completed === 0) return 'Calculating...';
    const elapsed = Date.now() - startTime;
    const rate = completed / elapsed;
    const remaining = (total - completed) / rate;
    return this.formatDuration(remaining);
  }
};

if (typeof globalThis !== 'undefined') globalThis.Utils = Utils;
