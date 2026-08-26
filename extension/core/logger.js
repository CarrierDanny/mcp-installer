// core/logger.js — Session Logging Engine
const Logger = {
  _sessionId: null,
  _buffer: [],
  _flushTimer: null,

  async init() {
    this._sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    await Browser.storage.set({ gpd_current_session: this._sessionId });
    this._startFlushTimer();
    await this.log('SESSION_START', 'New session started');
    return this._sessionId;
  },

  get sessionId() { return this._sessionId; },

  _startFlushTimer() {
    if (this._flushTimer) clearInterval(this._flushTimer);
    this._flushTimer = setInterval(() => this._flush(), 5000);
  },

  async _flush() {
    if (this._buffer.length === 0) return;
    const entries = [...this._buffer];
    this._buffer = [];
    try {
      const { gpd_logs = [] } = await Browser.storage.get('gpd_logs');
      gpd_logs.push(...entries);
      // Keep last 5000 entries
      if (gpd_logs.length > 5000) gpd_logs.splice(0, gpd_logs.length - 5000);
      await Browser.storage.set({ gpd_logs });
    } catch (e) {
      // Put entries back if flush failed
      this._buffer.unshift(...entries);
      console.error('Logger flush failed:', e);
    }
  },

  async log(action, detail, data = null) {
    const entry = {
      timestamp: new Date().toISOString(),
      session: this._sessionId,
      action,
      detail,
      data: data ? JSON.parse(JSON.stringify(data)) : null
    };
    this._buffer.push(entry);
    // Flush immediately for important events
    if (['SESSION_START', 'ERROR', 'EJECT_COMPLETE'].includes(action)) {
      await this._flush();
    }
    return entry;
  },

  async getLogs(filter = {}) {
    await this._flush(); // Ensure buffer is written
    const { gpd_logs = [] } = await Browser.storage.get('gpd_logs');
    let logs = gpd_logs;
    if (filter.session) logs = logs.filter(l => l.session === filter.session);
    if (filter.action) logs = logs.filter(l => l.action === filter.action);
    if (filter.since) logs = logs.filter(l => l.timestamp >= filter.since);
    if (filter.limit) logs = logs.slice(-filter.limit);
    return logs;
  },

  async getSessionLogs() {
    return this.getLogs({ session: this._sessionId });
  },

  async exportLogs(filter = {}) {
    const logs = await this.getLogs(filter);
    return JSON.stringify(logs, null, 2);
  },

  async clearLogs() {
    this._buffer = [];
    await Browser.storage.set({ gpd_logs: [] });
  },

  async getStats() {
    const logs = await this.getLogs();
    const sessions = new Set(logs.map(l => l.session));
    const actions = {};
    for (const log of logs) {
      actions[log.action] = (actions[log.action] || 0) + 1;
    }
    return {
      totalEntries: logs.length,
      totalSessions: sessions.size,
      currentSession: this._sessionId,
      actionCounts: actions,
      oldestEntry: logs[0]?.timestamp,
      newestEntry: logs[logs.length - 1]?.timestamp
    };
  }
};

if (typeof globalThis !== 'undefined') globalThis.Logger = Logger;
